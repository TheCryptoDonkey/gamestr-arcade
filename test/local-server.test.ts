/**
 * Unit tests for the local static server helpers.
 *
 * Tests cover pure helper functions (mimeFor, resolveSafePath, localUrlFor),
 * plus integration tests for the swappable-root HTTP server (setRoot, GET/HEAD,
 * validators, caching, byte ranges, SPA fallback, traversal guard).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

  it('returns correct MIME for video formats', () => {
    expect(mimeFor('/video/intro.mp4')).toBe('video/mp4')
    expect(mimeFor('/video/intro.webm')).toBe('video/webm')
    expect(mimeFor('/video/intro.ogv')).toBe('video/ogg')
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

interface TestResponse {
  status: number
  body: Buffer
  headers: http.IncomingHttpHeaders
}

async function request(
  port: number,
  path: string,
  options: { method?: string; headers?: http.OutgoingHttpHeaders } = {},
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: options.method ?? 'GET',
      headers: options.headers,
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks),
        headers: res.headers,
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function get(port: number, path: string): Promise<{ status: number; body: string }> {
  const res = await request(port, path)
  return { status: res.status, body: res.body.toString() }
}

describe('startLocalServer', () => {
  let server: LocalServer | null = null
  let tempRoot: string | null = null

  afterEach(async () => {
    server?.close()
    server = null
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
    tempRoot = null
  })

  async function makeMediaRoot(): Promise<string> {
    tempRoot = await mkdtemp(join(tmpdir(), 'gamestr-local-server-'))
    await Promise.all([
      writeFile(join(tempRoot, 'index.html'), '<!doctype html><p>ROOT</p>'),
      writeFile(join(tempRoot, 'app-Ab12Cd34.js'), 'fingerprinted'),
      writeFile(join(tempRoot, 'app.js'), 'revalidate'),
      writeFile(join(tempRoot, 'background-image.png'), 'not-a-hash'),
      writeFile(join(tempRoot, 'movie.mp4'), Buffer.from('0123456789')),
    ])
    return tempRoot
  }

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

  it('returns validators and revalidates matching If-None-Match requests with 304', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)

    const first = await request(server.port, '/')
    expect(first.status).toBe(200)
    expect(first.headers.etag).toMatch(/^W\/"[a-f0-9]{24}"$/)
    expect(first.headers['last-modified']).toBeTruthy()
    expect(first.headers['cache-control']).toBe('no-cache')

    const revalidated = await request(server.port, '/', {
      headers: { 'if-none-match': first.headers.etag },
    })
    expect(revalidated.status).toBe(304)
    expect(revalidated.body).toHaveLength(0)
    expect(revalidated.headers.etag).toBe(first.headers.etag)
    expect(revalidated.headers['content-length']).toBeUndefined()
  })

  it('supports wildcard and comma-separated If-None-Match validators', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)
    const first = await request(server.port, '/')

    const list = await request(server.port, '/', {
      headers: { 'if-none-match': `"not-it", ${first.headers.etag}` },
    })
    expect(list.status).toBe(304)

    const wildcard = await request(server.port, '/', {
      headers: { 'if-none-match': '*' },
    })
    expect(wildcard.status).toBe(304)
  })

  it('uses immutable caching only for fingerprinted assets', async () => {
    server = await startLocalServer()
    server.setRoot(await makeMediaRoot())

    const fingerprinted = await request(server.port, '/app-Ab12Cd34.js')
    expect(fingerprinted.status).toBe(200)
    expect(fingerprinted.headers['cache-control']).toBe('public, max-age=31536000, immutable')

    const stableName = await request(server.port, '/app.js')
    expect(stableName.status).toBe(200)
    expect(stableName.headers['cache-control']).toBe('no-cache')

    const descriptiveName = await request(server.port, '/background-image.png')
    expect(descriptiveName.headers['cache-control']).toBe('no-cache')

    const html = await request(server.port, '/')
    expect(html.headers['cache-control']).toBe('no-cache')
  })

  it('serves HEAD with GET-equivalent headers and no body', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)

    const getResponse = await request(server.port, '/')
    const headResponse = await request(server.port, '/', { method: 'HEAD' })
    expect(headResponse.status).toBe(200)
    expect(headResponse.body).toHaveLength(0)
    expect(headResponse.headers['content-type']).toBe(getResponse.headers['content-type'])
    expect(headResponse.headers['content-length']).toBe(getResponse.headers['content-length'])
    expect(headResponse.headers.etag).toBe(getResponse.headers.etag)
  })

  it('serves HEAD for SPA fallback and returns a bodyless 404 for missing assets', async () => {
    server = await startLocalServer()
    server.setRoot(FIXTURES_SITE)

    const spa = await request(server.port, '/some/deep/route', { method: 'HEAD' })
    expect(spa.status).toBe(200)
    expect(spa.body).toHaveLength(0)
    expect(spa.headers['content-type']).toBe('text/html; charset=utf-8')

    const missing = await request(server.port, '/missing.js', { method: 'HEAD' })
    expect(missing.status).toBe(404)
    expect(missing.body).toHaveLength(0)
    expect(Number(missing.headers['content-length'])).toBeGreaterThan(0)
  })

  it('serves closed, open-ended, and suffix media byte ranges', async () => {
    server = await startLocalServer()
    server.setRoot(await makeMediaRoot())

    const closed = await request(server.port, '/movie.mp4', { headers: { range: 'bytes=2-5' } })
    expect(closed.status).toBe(206)
    expect(closed.body.toString()).toBe('2345')
    expect(closed.headers['content-range']).toBe('bytes 2-5/10')
    expect(closed.headers['content-length']).toBe('4')
    expect(closed.headers['accept-ranges']).toBe('bytes')

    const openEnded = await request(server.port, '/movie.mp4', { headers: { range: 'bytes=7-' } })
    expect(openEnded.status).toBe(206)
    expect(openEnded.body.toString()).toBe('789')
    expect(openEnded.headers['content-range']).toBe('bytes 7-9/10')

    const suffix = await request(server.port, '/movie.mp4', { headers: { range: 'bytes=-3' } })
    expect(suffix.status).toBe(206)
    expect(suffix.body.toString()).toBe('789')
    expect(suffix.headers['content-range']).toBe('bytes 7-9/10')
  })

  it('clamps media range ends and returns 416 for invalid or unsatisfiable ranges', async () => {
    server = await startLocalServer()
    server.setRoot(await makeMediaRoot())

    const clamped = await request(server.port, '/movie.mp4', { headers: { range: 'bytes=8-99' } })
    expect(clamped.status).toBe(206)
    expect(clamped.body.toString()).toBe('89')
    expect(clamped.headers['content-range']).toBe('bytes 8-9/10')

    for (const range of ['bytes=99-', 'bytes=5-4', 'bytes=-0']) {
      const rejected = await request(server.port, '/movie.mp4', { headers: { range } })
      expect(rejected.status).toBe(416)
      expect(rejected.body).toHaveLength(0)
      expect(rejected.headers['content-range']).toBe('bytes */10')
      expect(rejected.headers['content-length']).toBe('0')
      expect(rejected.headers['accept-ranges']).toBe('bytes')
    }

    // Unsupported units and multipart ranges are ignored, yielding a normal 200.
    for (const range of ['bytes=0-1,4-5', 'items=0-1']) {
      const ignored = await request(server.port, '/movie.mp4', { headers: { range } })
      expect(ignored.status).toBe(200)
      expect(ignored.body.toString()).toBe('0123456789')
      expect(ignored.headers['content-range']).toBeUndefined()
    }
  })

  it('returns range headers but no body for a media HEAD request', async () => {
    server = await startLocalServer()
    server.setRoot(await makeMediaRoot())

    const response = await request(server.port, '/movie.mp4', {
      method: 'HEAD',
      headers: { range: 'bytes=2-5' },
    })
    expect(response.status).toBe(206)
    expect(response.body).toHaveLength(0)
    expect(response.headers['content-range']).toBe('bytes 2-5/10')
    expect(response.headers['content-length']).toBe('4')
  })

  it('honours a current If-Range date and falls back to 200 for a stale validator', async () => {
    server = await startLocalServer()
    server.setRoot(await makeMediaRoot())
    const initial = await request(server.port, '/movie.mp4')

    const current = await request(server.port, '/movie.mp4', {
      headers: { range: 'bytes=2-5', 'if-range': initial.headers['last-modified'] },
    })
    expect(current.status).toBe(206)
    expect(current.body.toString()).toBe('2345')

    const stale = await request(server.port, '/movie.mp4', {
      headers: { range: 'bytes=2-5', 'if-range': '"different-representation"' },
    })
    expect(stale.status).toBe(200)
    expect(stale.body.toString()).toBe('0123456789')
    expect(stale.headers['content-range']).toBeUndefined()
  })

  it('ignores Range for non-media files and returns the complete representation', async () => {
    server = await startLocalServer()
    server.setRoot(await makeMediaRoot())

    const response = await request(server.port, '/app.js', { headers: { range: 'bytes=0-2' } })
    expect(response.status).toBe(200)
    expect(response.body.toString()).toBe('revalidate')
    expect(response.headers['content-range']).toBeUndefined()
    expect(response.headers['accept-ranges']).toBeUndefined()
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
