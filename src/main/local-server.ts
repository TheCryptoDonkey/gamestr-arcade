/**
 * gamestr-arcade — local static server for mirrored web games.
 *
 * Binds to 127.0.0.1 on an ephemeral port and serves `games/<slug>/site/`
 * so a booth operator can run games fully offline. Only reads from inside
 * `gamesDir`; any path that would escape is rejected (traversal guard).
 *
 * Usage:
 *   const { port, close } = await startLocalServer('/path/to/games')
 *   // http://127.0.0.1:<port>/neon/site/ serves games/neon/site/
 */

import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat, readFile } from 'node:fs/promises'
import { join, normalize, extname, resolve, sep } from 'node:path'

// ── MIME type table ────────────────────────────────────────────────────────────
// Includes everything a WASM/ESM game is likely to need.

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.data': 'application/octet-stream',
  '.bin': 'application/octet-stream',
}

// Extensions that should 404 cleanly rather than falling back to index.html.
const ASSET_EXTS = new Set(Object.keys(MIME_TYPES).filter(e => e !== '.html'))

/**
 * Return the MIME type for a file extension (lower-cased), or a safe
 * application/octet-stream fallback. Pure helper — unit-testable without I/O.
 */
export function mimeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * Resolve a URL pathname to an absolute file path inside `root`, blocking
 * directory traversal. Returns null if the resolved path would escape `root`.
 *
 * Strategy: strip leading slashes so `path.join` treats the pathname as a
 * relative segment (never as an absolute-path override), then let `resolve`
 * collapse any `..` sequences. Finally verify the result is still inside
 * `root`. Any attempt to escape the root — via `../`, multiple `../../`, or
 * absolute-path injection — results in a null return.
 *
 * Pure helper — unit-testable without I/O.
 */
export function resolveSafePath(root: string, pathname: string): string | null {
  // Strip leading slashes: path.join('root', '/abs') returns '/abs' on Node,
  // bypassing root entirely. Treating the pathname as relative prevents this.
  const rel = pathname.replace(/^[/\\]+/, '')
  const abs = resolve(join(root, rel))
  const canonicalRoot = resolve(root)
  // The resolved path must equal root or be nested inside it.
  if (abs !== canonicalRoot && !abs.startsWith(canonicalRoot + sep)) return null
  return abs
}

/**
 * Build the canonical URL prefix for a mirrored game slug.
 *
 * `http://127.0.0.1:<port>/<slug>/site/`
 */
export function localUrlFor(port: number, slug: string): string {
  return `http://127.0.0.1:${port}/${slug}/site/`
}

// ── Request handler ────────────────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  gamesDir: string,
): Promise<void> {
  try {
    const rawUrl = req.url ?? '/'
    const urlObj = new URL(rawUrl, 'http://localhost')
    const pathname = decodeURIComponent(urlObj.pathname)

    const filePath = resolveSafePath(gamesDir, pathname)
    if (!filePath) {
      res.writeHead(403, { 'content-type': 'text/plain' })
      res.end('403 Forbidden')
      return
    }

    let targetPath = filePath
    // Trailing-slash directories → index.html
    if (pathname.endsWith('/')) targetPath = join(filePath, 'index.html')

    // Try to stat the resolved path.
    let info: Awaited<ReturnType<typeof stat>> | null = null
    try {
      info = await stat(targetPath)
    } catch {
      info = null
    }

    if (info?.isDirectory()) {
      // Directory without trailing slash → try its index.html
      const idx = join(targetPath, 'index.html')
      try {
        const idxInfo = await stat(idx)
        if (idxInfo.isFile()) {
          await serveFile(res, idx)
          return
        }
      } catch { /* fall through */ }
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('404 Not Found')
      return
    }

    if (info?.isFile()) {
      await serveFile(res, targetPath)
      return
    }

    // Path does not exist.
    // Extension-shaped asset paths (e.g. .js, .wasm) get a clean 404.
    // Extension-free paths (navigation) get the slug's SPA index.html.
    const ext = extname(pathname).toLowerCase()
    if (ext && ASSET_EXTS.has(ext)) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('404 Not Found')
      return
    }

    // SPA fallback: serve the nearest site/index.html for this slug.
    // The pathname is expected to be /<slug>/site/... so we find the
    // segment boundary at position 2 (/<slug>/site/).
    const parts = pathname.split('/').filter(Boolean) // ['slug', 'site', ...]
    if (parts.length >= 2) {
      const spaIndex = join(gamesDir, parts[0], parts[1], 'index.html')
      const guarded = resolveSafePath(gamesDir, `/${parts[0]}/${parts[1]}/index.html`)
      if (guarded) {
        try {
          await stat(spaIndex)
          await serveFile(res, spaIndex)
          return
        } catch { /* fall through */ }
      }
    }

    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('404 Not Found')
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end('500 ' + String((err as Error).message ?? err))
  }
}

async function serveFile(res: http.ServerResponse, filePath: string): Promise<void> {
  const info = await stat(filePath)
  const mime = mimeFor(filePath)
  res.writeHead(200, {
    'content-type': mime,
    'content-length': info.size,
    'cache-control': 'no-cache',
  })
  // Stream the file to avoid buffering large WASM blobs in memory.
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.pipe(res)
    res.on('finish', resolve)
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface LocalServer {
  port: number
  close(): void
}

/**
 * Start an HTTP server bound to 127.0.0.1 that serves files from `gamesDir`.
 *
 * Pass `port: 0` (the default) to use an OS-assigned ephemeral port — the
 * resolved port is returned in the `LocalServer` result. Fixed ports may be
 * passed for deterministic dev setups.
 *
 * The server only serves files that resolve inside `gamesDir` (no traversal).
 */
export async function startLocalServer(
  gamesDir: string,
  port = 0,
): Promise<LocalServer> {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, gamesDir).catch(err => {
      console.error('[local-server] unhandled error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' })
      }
      res.end('500 Internal Server Error')
    })
  })

  const actualPort = await new Promise<number>((resolvePort, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      resolvePort(typeof addr === 'object' && addr ? addr.port : port)
    })
  })

  return {
    port: actualPort,
    close() {
      server.close()
    },
  }
}
