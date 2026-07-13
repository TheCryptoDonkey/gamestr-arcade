import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extractArtUrls, fetchAndCache, type FetchResult } from '../src/main/art'

// ── extractArtUrls ────────────────────────────────────────────────────────────

describe('extractArtUrls', () => {
  it('extracts og:image as hero', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/hero.jpg">
    </head></html>`
    expect(extractArtUrls(html, 'https://example.com/')).toEqual({
      hero: 'https://example.com/hero.jpg',
    })
  })

  it('falls back to twitter:image when og:image is absent', () => {
    const html = `<html><head>
      <meta name="twitter:image" content="https://example.com/tw.jpg">
    </head></html>`
    expect(extractArtUrls(html, 'https://example.com/')).toMatchObject({
      hero: 'https://example.com/tw.jpg',
    })
  })

  it('prefers og:image over twitter:image when both present', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.jpg">
      <meta name="twitter:image" content="https://example.com/tw.jpg">
    </head></html>`
    const { hero } = extractArtUrls(html, 'https://example.com/')
    expect(hero).toBe('https://example.com/og.jpg')
  })

  it('extracts apple-touch-icon as logo', () => {
    const html = `<html><head>
      <link rel="apple-touch-icon" href="/icons/touch.png">
    </head></html>`
    const { logo } = extractArtUrls(html, 'https://example.com/')
    expect(logo).toBe('https://example.com/icons/touch.png')
  })

  it('falls back to rel="icon" when apple-touch-icon is absent', () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon.ico">
    </head></html>`
    const { logo } = extractArtUrls(html, 'https://example.com/')
    expect(logo).toBe('https://example.com/favicon.ico')
  })

  it('falls back to rel="shortcut icon"', () => {
    const html = `<html><head>
      <link rel="shortcut icon" href="/favicon.ico">
    </head></html>`
    const { logo } = extractArtUrls(html, 'https://example.com/')
    expect(logo).toBe('https://example.com/favicon.ico')
  })

  it('prefers apple-touch-icon over plain icon', () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/touch.png">
    </head></html>`
    const { logo } = extractArtUrls(html, 'https://example.com/')
    expect(logo).toBe('https://example.com/touch.png')
  })

  it('resolves relative hrefs against baseUrl', () => {
    const html = `<html><head>
      <meta property="og:image" content="/img/hero.jpg">
      <link rel="icon" href="favicon.ico">
    </head></html>`
    const result = extractArtUrls(html, 'https://game.example.com/app/')
    expect(result.hero).toBe('https://game.example.com/img/hero.jpg')
    expect(result.logo).toBe('https://game.example.com/app/favicon.ico')
  })

  it('handles single-quoted attributes', () => {
    const html = `<html><head>
      <meta property='og:image' content='https://example.com/sq.jpg'>
    </head></html>`
    const { hero } = extractArtUrls(html, 'https://example.com/')
    expect(hero).toBe('https://example.com/sq.jpg')
  })

  it('returns {} when nothing found', () => {
    expect(extractArtUrls('<html><head></head></html>', 'https://example.com/')).toEqual({})
  })

  it('returns {} for empty HTML', () => {
    expect(extractArtUrls('', 'https://example.com/')).toEqual({})
  })

  it('handles reversed attribute order in meta tag', () => {
    // content before property
    const html = `<meta content="https://example.com/rev.jpg" property="og:image">`
    const { hero } = extractArtUrls(html, 'https://example.com/')
    expect(hero).toBe('https://example.com/rev.jpg')
  })
})

// ── fetchAndCache ─────────────────────────────────────────────────────────────

function pngBytes(): Buffer {
  // Minimal valid PNG magic bytes
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
}

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
}

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `art-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}

describe('fetchAndCache', () => {
  it('fetches, writes to cacheDir, and returns cached path', async () => {
    const cacheDir = await makeTempDir()
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: true, contentType: 'image/png', bytes: pngBytes(),
    }))
    const result = await fetchAndCache('https://example.com/logo.png', cacheDir, fetchFn)
    expect(result).toBeTruthy()
    expect(result).toMatch(cacheDir)
    expect(result).toMatch(/\.png$/)
    expect(fetchFn).toHaveBeenCalledOnce()
    // File should exist on disk.
    const s = await stat(result!)
    expect(s.isFile()).toBe(true)
  })

  it('returns null for non-image content-type without image magic bytes', async () => {
    const cacheDir = await makeTempDir()
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: true, contentType: 'text/html', bytes: Buffer.from('<html>error</html>'),
    }))
    const result = await fetchAndCache('https://example.com/oops', cacheDir, fetchFn)
    expect(result).toBeNull()
  })

  it('accepts an image despite text/html content-type if magic bytes are valid', async () => {
    // Some servers send wrong content-type — magic bytes should save it.
    const cacheDir = await makeTempDir()
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: true, contentType: 'text/html', bytes: pngBytes(),
    }))
    const result = await fetchAndCache('https://example.com/sneaky.png', cacheDir, fetchFn)
    expect(result).toBeTruthy()
  })

  it('returns null when fetch fails (ok: false)', async () => {
    const cacheDir = await makeTempDir()
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: false, contentType: '', bytes: Buffer.alloc(0),
    }))
    const result = await fetchAndCache('https://example.com/img.png', cacheDir, fetchFn)
    expect(result).toBeNull()
  })

  it('returns null when fetchFn throws', async () => {
    const cacheDir = await makeTempDir()
    const fetchFn = vi.fn(async (): Promise<FetchResult> => { throw new Error('network error') })
    const result = await fetchAndCache('https://example.com/img.png', cacheDir, fetchFn)
    expect(result).toBeNull()
  })

  it('reuses cached file without re-fetching when cache is fresh', async () => {
    const cacheDir = await makeTempDir()
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: true, contentType: 'image/jpeg', bytes: jpegBytes(),
    }))
    const url = 'https://example.com/cached.png'
    // First fetch writes the file.
    const first = await fetchAndCache(url, cacheDir, fetchFn)
    expect(first).toBeTruthy()
    expect(first).toMatch(/\.jpg$/)
    expect(fetchFn).toHaveBeenCalledOnce()

    // Second call — cache should be fresh (just written); fetch should NOT be called again.
    const second = await fetchAndCache(url, cacheDir, fetchFn)
    expect(second).toBe(first)
    expect(fetchFn).toHaveBeenCalledOnce() // still only once
  })

  it('re-fetches when cache file is older than 24 h', async () => {
    const cacheDir = await makeTempDir()
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: true, contentType: 'image/png', bytes: pngBytes(),
    }))
    const url = 'https://example.com/stale.png'

    // Pre-write a stale cache file.
    const { createHash } = await import('node:crypto')
    const key = createHash('sha1').update(url).digest('hex')
    const cachePath = join(cacheDir, `${key}.png`)
    await writeFile(cachePath, pngBytes())
    // Set mtime to 25 hours ago.
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await utimes(cachePath, staleTime, staleTime)

    const result = await fetchAndCache(url, cacheDir, fetchFn)
    expect(result).toBeTruthy()
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('uses the same cache key for the same URL (SHA-1 stability)', async () => {
    const cacheDir = await makeTempDir()
    const url = 'https://example.com/logo.png'
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: true, contentType: 'image/png', bytes: pngBytes(),
    }))
    const a = await fetchAndCache(url, cacheDir, fetchFn)
    const b = await fetchAndCache(url, cacheDir, fetchFn)
    expect(a).toBe(b) // same path, only one fetch
    expect(fetchFn).toHaveBeenCalledOnce()
  })
})
