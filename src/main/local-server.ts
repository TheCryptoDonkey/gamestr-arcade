/**
 * gamestr-arcade — local static server for mirrored web games.
 *
 * Binds to 127.0.0.1 on an ephemeral port and serves a single game's
 * `site/` directory at the server ROOT so single-page apps with client-side
 * routers always see `/` as their base path.
 *
 * Only one game runs at a time (single-flight launch), so the root is
 * swapped via `setRoot()` whenever a new local game is launched.
 *
 * Usage:
 *   const server = await startLocalServer()
 *   server.setRoot('/path/to/games/sats-man/site')
 *   // http://127.0.0.1:<port>/ serves sats-man/site/index.html
 */

import http from 'node:http'
import { createReadStream, type Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, join, extname, resolve, sep } from 'node:path'

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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
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
 * Build the root URL for the local server.
 *
 * `http://127.0.0.1:<port>/`
 *
 * Games are served at the root (not a subpath) so SPA routers always see `/`.
 */
export function localUrlFor(port: number): string {
  return `http://127.0.0.1:${port}/`
}

// ── Request handler ────────────────────────────────────────────────────────────

type FileInfo = Stats

interface ByteRange {
  start: number
  end: number
}

type ParsedByteRange =
  | { kind: 'range'; value: ByteRange }
  | { kind: 'unsatisfiable' }
  | { kind: 'ignore' }

/** Conservatively recognise a Vite/Rollup-style content hash before the extension. */
function isFingerprintedAsset(filePath: string): boolean {
  const match = /-([a-z0-9_-]{8,64})(?=\.[^.]+$)/i.exec(basename(filePath))
  if (!match) return false
  const candidate = match[1]
  // Accept ordinary hex digests, or the mixed-case+numeric form emitted by Vite.
  // Bias toward revalidation when uncertain: a false immutable hit is worse than
  // an extra local request because this origin is reused across swapped game roots.
  return /^[a-f0-9]{8,64}$/i.test(candidate) || (/[A-Z]/.test(candidate) && /\d/.test(candidate))
}

function cacheControlFor(filePath: string, mime: string): string {
  // The server swaps document roots between games while retaining one origin, so
  // HTML and non-fingerprinted names must revalidate to avoid cross-game cache hits.
  if (mime.startsWith('text/html')) return 'no-cache'
  if (isFingerprintedAsset(filePath)) {
    return 'public, max-age=31536000, immutable'
  }
  return 'no-cache'
}

/**
 * A path-hiding weak validator derived from file identity + representation metadata.
 * Including the resolved path/inode prevents two swapped game roots with the same
 * URL, size and timestamp from accidentally sharing a validator.
 */
function etagFor(filePath: string, info: FileInfo): string {
  const identity = `${resolve(filePath)}\0${info.dev}\0${info.ino}\0${info.size}\0${info.mtimeMs}`
  const opaque = createHash('sha256').update(identity).digest('hex').slice(0, 24)
  return `W/"${opaque}"`
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(',') : value
}

/** If-None-Match uses weak comparison for GET/HEAD. */
function ifNoneMatchMatches(value: string | undefined, etag: string): boolean {
  if (!value) return false
  const target = etag.replace(/^W\//i, '')
  return value.split(',').some(candidate => {
    const tag = candidate.trim()
    return tag === '*' || tag.replace(/^W\//i, '') === target
  })
}

/** A stale or weak If-Range validator must fall back to a complete 200 response. */
function ifRangeAllows(value: string | undefined, info: FileInfo): boolean {
  if (!value) return true
  // This server intentionally emits weak ETags, which cannot validate If-Range.
  if (value.startsWith('"') || /^W\//i.test(value)) return false
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false
  return Math.floor(info.mtimeMs / 1000) * 1000 <= timestamp
}

/** Parse one byte range; unsupported units/multipart sets are safely ignored. */
function parseByteRange(value: string, size: number): ParsedByteRange {
  const unit = /^bytes=(.*)$/i.exec(value.trim())
  if (!unit || unit[1].includes(',')) return { kind: 'ignore' }
  const match = /^(\d*)-(\d*)$/.exec(unit[1])
  if (!match || (!match[1] && !match[2])) return { kind: 'ignore' }
  if (size <= 0) return { kind: 'unsatisfiable' }

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: 'unsatisfiable' }
    return { kind: 'range', value: { start: Math.max(0, size - suffixLength), end: size - 1 } }
  }

  const start = Number(match[1])
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return { kind: 'unsatisfiable' }

  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return { kind: 'unsatisfiable' }
  return { kind: 'range', value: { start, end: Math.min(requestedEnd, size - 1) } }
}

function supportsByteRanges(mime: string): boolean {
  return mime.startsWith('audio/') || mime.startsWith('video/')
}

function sendText(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  const bytes = Buffer.from(body)
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(bytes.length),
    ...headers,
  })
  res.end(req.method === 'HEAD' ? undefined : bytes)
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  currentRoot: string | null,
): Promise<void> {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(req, res, 405, '405 Method Not Allowed', { allow: 'GET, HEAD' })
      return
    }

    // No root set yet — server is idle between games.
    if (!currentRoot) {
      sendText(req, res, 404, '404 Not Found')
      return
    }

    const rawUrl = req.url ?? '/'
    const urlObj = new URL(rawUrl, 'http://localhost')
    const pathname = decodeURIComponent(urlObj.pathname)

    const filePath = resolveSafePath(currentRoot, pathname)
    if (!filePath) {
      sendText(req, res, 403, '403 Forbidden')
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
          await serveFile(req, res, idx)
          return
        }
      } catch { /* fall through */ }
      sendText(req, res, 404, '404 Not Found')
      return
    }

    if (info?.isFile()) {
      await serveFile(req, res, targetPath)
      return
    }

    // Path does not exist.
    // Extension-shaped asset paths (e.g. .js, .wasm) get a clean 404.
    // Extension-free paths (SPA navigation) fall back to the root index.html
    // so the client-side router can handle them.
    const ext = extname(pathname).toLowerCase()
    if (ext && ASSET_EXTS.has(ext)) {
      sendText(req, res, 404, '404 Not Found')
      return
    }

    // SPA fallback: serve the root index.html for any extension-less path.
    const spaIndex = join(currentRoot, 'index.html')
    try {
      await stat(spaIndex)
      await serveFile(req, res, spaIndex)
      return
    } catch { /* fall through */ }

    sendText(req, res, 404, '404 Not Found')
  } catch (err) {
    if (!res.headersSent) {
      sendText(req, res, 500, '500 ' + String((err as Error).message ?? err))
    } else {
      res.destroy(err as Error)
    }
  }
}

async function serveFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string,
): Promise<void> {
  const info = await stat(filePath)
  const mime = mimeFor(filePath)
  const etag = etagFor(filePath, info)
  const rangeable = supportsByteRanges(mime)
  const baseHeaders: Record<string, string> = {
    'content-type': mime,
    'cache-control': cacheControlFor(filePath, mime),
    etag,
    'last-modified': info.mtime.toUTCString(),
  }
  if (rangeable) baseHeaders['accept-ranges'] = 'bytes'

  if (ifNoneMatchMatches(headerString(req.headers['if-none-match']), etag)) {
    res.writeHead(304, baseHeaders)
    res.end()
    return
  }

  let range: ByteRange | undefined
  const rangeHeader = headerString(req.headers.range)
  const ifRange = headerString(req.headers['if-range'])
  if (rangeable && rangeHeader && ifRangeAllows(ifRange, info)) {
    const parsed = parseByteRange(rangeHeader, info.size)
    if (parsed.kind === 'unsatisfiable') {
      res.writeHead(416, {
        ...baseHeaders,
        'content-range': `bytes */${info.size}`,
        'content-length': '0',
      })
      res.end()
      return
    }
    if (parsed.kind === 'range') range = parsed.value
  }

  const status = range ? 206 : 200
  const contentLength = range ? range.end - range.start + 1 : info.size
  const headers: Record<string, string> = {
    ...baseHeaders,
    'content-length': String(contentLength),
  }
  if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`
  res.writeHead(status, headers)

  // HEAD returns the exact status/headers GET would produce, without opening the file.
  if (req.method === 'HEAD') {
    res.end()
    return
  }

  // Stream the file to avoid buffering large WASM blobs in memory.
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined)
    stream.on('error', reject)
    stream.pipe(res)
    res.on('finish', resolve)
    res.on('close', () => {
      // A disconnected media client must not leave a file stream or request
      // promise hanging until the original range would have completed.
      if (!res.writableFinished) stream.destroy()
      resolve()
    })
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface LocalServer {
  port: number
  /**
   * Point the server at a new absolute directory.  The next request will be
   * served from `absDir`.  Swapping is safe because only one game runs at a
   * time (single-flight launch guard in `index.ts`).
   */
  setRoot(absDir: string): void
  close(): void
}

/**
 * Start an HTTP server bound to 127.0.0.1 with a swappable document root.
 *
 * Pass `port: 0` (the default) to use an OS-assigned ephemeral port — the
 * resolved port is returned in the `LocalServer` result. Fixed ports may be
 * passed for deterministic dev setups.
 *
 * Call `setRoot(absDir)` before loading a game URL so the server's root
 * points at that game's `site/` directory.  The server then serves files
 * relative to that root, with traversal blocked and SPA fallback enabled.
 * Until `setRoot` is called the server returns 404 for all requests.
 */
export async function startLocalServer(
  port = 0,
): Promise<LocalServer> {
  // Mutable root — updated atomically (string assignment is synchronous).
  let currentRoot: string | null = null

  const server = http.createServer((req, res) => {
    handleRequest(req, res, currentRoot).catch(err => {
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
    setRoot(absDir: string) {
      currentRoot = absDir
    },
    close() {
      server.close()
    },
  }
}
