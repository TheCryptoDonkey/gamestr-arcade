/**
 * Unit tests for the local static server helpers.
 *
 * Tests cover the pure helper functions (mimeFor, resolveSafePath, localUrlFor)
 * without binding a real socket. The HTTP request-handling logic is tested via
 * integration in games.test.ts (buildGamesList local-mirror resolution).
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { mimeFor, resolveSafePath, localUrlFor, MIME_TYPES } from '../src/main/local-server'

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
  it('builds the canonical http://127.0.0.1:<port>/<slug>/site/ URL', () => {
    expect(localUrlFor(54321, 'neon')).toBe('http://127.0.0.1:54321/neon/site/')
  })

  it('works for arbitrary ports and slugs', () => {
    expect(localUrlFor(3000, 'my-game')).toBe('http://127.0.0.1:3000/my-game/site/')
    expect(localUrlFor(80, 'a')).toBe('http://127.0.0.1:80/a/site/')
  })
})
