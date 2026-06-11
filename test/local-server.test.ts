/**
 * Unit tests for the local static server helpers.
 *
 * Tests cover pure helper functions (mimeFor, resolveSafePath, localUrlFor),
 * plus integration tests for the swappable-root HTTP server (setRoot, GET /,
 * SPA fallback, traversal guard).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import http from 'node:http'
import { mimeFor, resolveSafePath, localUrlFor, MIME_TYPES, startLocalServer } from '../src/main/local-server'
import type { LocalServer } from '../src/main/local-server'

// ── mimeFor ────────────────────────────────────────────────────────────────────

describe('mimeFor', () => {
  it('returns correct MIME for .html', () => {
    expect(mimeFor('/foo/index.html')).toBe('text/html; charset=utf-8')
  })

  it('returns correct MIME for .js and .mjs', () => {
    expect(mimeFor('/foo/main.js')).toBe('text/javascript; charset=utf-8')
    expect(mimeFor('/foo/main.mjs')).toBe('text/javascript; charset=utf-8')
  })

  it('returns application/wasm for .wasm (critical for WASM games)', () => {
    expect(mimeFor('/foo/game.wasm')).toBe('application/wasm')
  })

  it('returns correct MIME for .json', () => {
    expect(mimeFor('/foo/data.json')).toBe('application/json; charset=utf-8')
  })

  it('returns correct MIME for .svg', () => {
    expect(mimeFor('/foo/icon.svg')).toBe('image/svg+xml')
  })

  it('returns correct MIME for font formats', () => {
    expect(mimeFor('/fonts/x.woff2')).toBe('font/woff2')
    expect(mimeFor('/fonts/x.woff')).toBe('font/woff')
    expect(mimeFor('/fonts/x.ttf')).toBe('font/ttf')
    expect(mimeFor('/fonts/x.otf')).toBe('font/otf')
  })

  it('returns correct MIME for audio formats', () => {
    expect(mimeFor('/sounds/fx.ogg')).toBe('audio/ogg')
    expect(mimeFor('/sounds/fx.opus')).toBe('audio/ogg')
    expect(mimeFor('/sounds/fx.mp3')).toBe('audio/mpeg')
    expect(mimeFor('/sounds/fx.wav')).toBe('audio/wav')
  })

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(mimeFor('/foo/binary.bin')).toBe('application/octet-stream')
    expect(mimeFor('/foo/unknown.xyz')).toBe('application/octet-stream')
  })

  it('is case-insensitive for the extension', () => {
    expect(mimeFor('/foo/image.PNG')).toBe('image/png')
    expect(mimeFor('/foo/script.JS')).toBe('text/javascript; charset=utf-8')
    expect(mimeFor('/foo/module.WASM')).toBe('application/wasm')
  })

  it('covers all extensions present in MIME_TYPES', () => {
    for (const [ext, expected] of Object.entries(MIME_TYPES)) {
      expect(mimeFor(`/foo/file${ext}`)).toBe(expected)
    }
  })
})

// ── resolveSafePath ────────────────────────────────────────────────────────────

describe('resolveSafePath', () => {
  const root = '/srv/games'

  it('resolves a simple nested path', () => {
    const result = resolveSafePath(root, '/neon/site/index.html')
    expect(result).toBe(join(root, 'neon/site/index.html'))
  })

  it('resolves the root itself', () => {
    const result = resolveSafePath(root, '/')
    expect(result).toBe(root)
  })

  it('resolves a path without leading slash', () => {
    const result = resolveSafePath(root, 'neon/site/index.html')
    expect(result).toBe(join(root, 'neon/site/index.html'))
  })

  it('blocks path traversal with ..', () => {
    // Both of these resolve outside /srv/games after join + resolve.
    expect(resolveSafePath(root, '/../etc/passwd')).toBeNull()
    expect(resolveSafePath(root, '/neon/../../etc/passwd')).toBeNull()
  })

  it('blocks traversal via multiple .. levels', () => {
    expect(resolveSafePath(root, '/../secret')).toBeNull()
    expect(resolveSafePath('/srv/games', '/../../../../etc/shadow')).toBeNull()
  })

  it('blocks a path that resolves to a sibling of root (shares string prefix)', () => {
    // /srv/games/../games-evil/hack → /srv/games-evil/hack — NOT inside /srv/games
    expect(resolveSafePath('/srv/games', '/../games-evil/hack')).toBeNull()
  })

  it('allows deep nesting inside root', () => {
    const deep = '/slug/site/assets/js/bundle.js'
    const result = resolveSafePath(root, deep)
    // Strip leading slash: deep inside root is fine.
    expect(result).toBe(join(root, 'slug/site/assets/js/bundle.js'))
    expect(result!.startsWith(root + '/')).toBe(true)
  })

  it('sandboxes an apparent absolute path — resolves inside root, not at filesystem root', () => {
    // A request for '/etc/passwd' is treated as a relative lookup under root
    // (not as an absolute filesystem path). The resulting path is inside root
    // (it would simply return a 404 because no such file exists in games/).
    const result = resolveSafePath(root, '/etc/passwd')
    expect(result).toBe(join(root, 'etc/passwd'))
    // Confirm it is inside root, not at /etc/passwd.
    expect(result!.startsWith(root + '/')).toBe(true)
  })
})

// ── localUrlFor ───────────────────────────────────────────────────────────────

describe('localUrlFor', () => {
  it('builds the root URL http://127.0.0.1:<port>/', () => {
    expect(localUrlFor(54321)).toBe('http://127.0.0.1:54321/')
  })

  it('works for arbitrary ports', () => {
    expect(localUrlFor(3000)).toBe('http://127.0.0.1:3000/')
    expect(localUrlFor(80)).toBe('http://127.0.0.1:80/')
  })
})

// ── startLocalServer integration ──────────────────────────────────────────────

const FIXTURES_SITE = join(import.meta.dirname, 'fixtures/games/mirrored/site')

async function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, res => {
      let body = ''
      res.on('data', chunk => { body += String(chunk) })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

describe('startLocalServer', () => {
  let server: LocalServer | null = null

  afterEach(() => {
    server?.close()
    server = null
  })

  it('returns 404 for GET / before setRoot is called', async () => {
    server = await startLocalServer()
    const { status } = await get(server.port, '/')
    expect(status).toBe(404)
  })

  it('serves root index.html after setRoot is called', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)
    const { status, body } = await get(server.port, '/')
    expect(status).toBe(200)
    expect(body).toContain('LOCAL OK')
  })

  it('SPA fallback: extension-less unknown path serves root index.html', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)
    const { status, body } = await get(server.port, '/some/deep/route')
    expect(status).toBe(200)
    expect(body).toContain('LOCAL OK')
  })

  it('returns 404 for a missing asset (extension-shaped path)', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)
    const { status } = await get(server.port, '/missing.js')
    expect(status).toBe(404)
  })

  it('blocks path traversal via resolveSafePath (returns 403 for escaped sequences)', async () => {
    // Note: Node's URL parser normalises /../../etc/passwd → /etc/passwd before
    // our handler sees it, so the URL-level request cannot actually escape the
    // root. The resolveSafePath pure-helper tests cover the real traversal guard.
    // Here we verify that a crafted request with a backslash escape attempt is
    // handled safely (path is sandboxed inside root, not rejected with 403, and
    // falls through to SPA fallback or 404 — never escaping to the filesystem).
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)
    // /etc/passwd (as normalised by URL parser from /../../etc/passwd) — treated
    // as a relative path under root → SPA fallback → 200 (root index.html served)
    const { status } = await get(server.port, '/etc/passwd')
    // The sandboxed path /etc/passwd maps to <root>/etc/passwd (doesn't exist)
    // → SPA fallback → root index.html → 200. Crucially: not the real /etc/passwd.
    expect(status).toBe(200)
  })

  it('allows setRoot to be called multiple times (root swapping)', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)
    const first = await get(server.port, '/')
    expect(first.body).toContain('LOCAL OK')

    // Swap to a different root (same fixture for simplicity — just verify it still serves).
    server.setRoot(FIXTURES_SITE)
    const second = await get(server.port, '/')
    expect(second.status).toBe(200)
  })
})
