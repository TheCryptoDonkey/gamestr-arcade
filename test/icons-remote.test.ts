/**
 * Tests for the extended resolveIcon / resolveHero resolution order.
 * All I/O is injected - no network, no real filesystem.
 */
import { describe, it, expect, vi } from 'vitest'
import { resolveIcon, resolveHero, type IconDeps } from '../src/main/icons'

/** Build a minimal IconDeps with all operations disabled by default. */
function deps(over: Partial<IconDeps>): IconDeps {
  return {
    exists: async () => false,
    mtime: async () => 0,
    extractDirIcon: async () => false,
    placeholder: (slug) => `/placeholder/${slug}.png`,
    fetchAndCache: async () => null,
    fetchPage: async () => null,
    ...over,
  }
}

// ── resolveIcon - resolution order ───────────────────────────────────────────

describe('resolveIcon', () => {
  it('sibling logo.png wins over all other sources', async () => {
    const fetchAndCache = vi.fn(async () => '/cached/logo.png')
    const result = await resolveIcon(
      { slug: 'a', siblingLogo: '/g/a/logo.png', logoUrl: 'https://cdn/logo.png' },
      '/cache',
      deps({ exists: async p => p === '/g/a/logo.png', fetchAndCache }),
    )
    expect(result).toBe('/g/a/logo.png')
    expect(fetchAndCache).not.toHaveBeenCalled()
  })

  it('logoUrl is used when no sibling exists', async () => {
    const fetchAndCache = vi.fn(async () => '/cache/abc123')
    const result = await resolveIcon(
      { slug: 'b', logoUrl: 'https://cdn/logo.png' },
      '/cache',
      deps({ fetchAndCache }),
    )
    expect(result).toBe('/cache/abc123')
    expect(fetchAndCache).toHaveBeenCalledWith('https://cdn/logo.png')
  })

  it('falls through to AppImage extract when logoUrl returns null', async () => {
    let extracted = false
    const result = await resolveIcon(
      { slug: 'c', appImagePath: '/g/c.AppImage', logoUrl: 'https://cdn/missing.png' },
      '/cache',
      deps({
        fetchAndCache: async () => null,
        extractDirIcon: async () => { extracted = true; return true },
      }),
    )
    expect(extracted).toBe(true)
    expect(result).toBe('/cache/c.png')
  })

  it('uses cached AppImage icon when fresh (cache mtime >= appimage mtime)', async () => {
    const result = await resolveIcon(
      { slug: 'd', appImagePath: '/g/d.AppImage' },
      '/cache',
      deps({
        exists: async p => p === '/cache/d.png',
        mtime: async p => (p === '/cache/d.png' ? 200 : 100),
      }),
    )
    expect(result).toBe('/cache/d.png')
  })

  it('derives logo from game page when all other sources fail', async () => {
    const html = `<link rel="apple-touch-icon" href="/touch.png">`
    const fetchPage = vi.fn(async () => html)
    const fetchAndCache = vi.fn(async () => '/cache/derived')
    const result = await resolveIcon(
      { slug: 'e', gameUrl: 'https://game.example.com/' },
      '/cache',
      deps({ fetchPage, fetchAndCache }),
    )
    expect(result).toBe('/cache/derived')
    expect(fetchPage).toHaveBeenCalledWith('https://game.example.com/')
    expect(fetchAndCache).toHaveBeenCalledWith('https://game.example.com/touch.png')
  })

  it('falls back to placeholder when everything fails', async () => {
    const result = await resolveIcon(
      { slug: 'z', appImagePath: '/g/z.AppImage', logoUrl: 'https://cdn/nope.png', gameUrl: 'https://game/' },
      '/cache',
      deps({}), // all defaults → null/false
    )
    expect(result).toBe('/placeholder/z.png')
  })

  it('does not call fetchPage when logoUrl succeeds', async () => {
    const fetchPage = vi.fn(async () => '<html></html>')
    const result = await resolveIcon(
      { slug: 'f', logoUrl: 'https://cdn/logo.png', gameUrl: 'https://game/' },
      '/cache',
      deps({ fetchAndCache: async () => '/cache/fetched', fetchPage }),
    )
    expect(result).toBe('/cache/fetched')
    expect(fetchPage).not.toHaveBeenCalled()
  })
})

// ── resolveHero ───────────────────────────────────────────────────────────────

describe('resolveHero', () => {
  it('returns cached path from heroUrl when provided', async () => {
    const fetchAndCache = vi.fn(async () => '/cache/hero-abc')
    const result = await resolveHero(
      { heroUrl: 'https://cdn/hero.jpg' },
      deps({ fetchAndCache }),
    )
    expect(result).toBe('/cache/hero-abc')
    expect(fetchAndCache).toHaveBeenCalledWith('https://cdn/hero.jpg')
  })

  it('does NOT derive a hero from og:image (auto-derivation removed)', async () => {
    const html = `<meta property="og:image" content="https://game.example.com/og.jpg">`
    const fetchPage = vi.fn(async () => html)
    const fetchAndCache = vi.fn(async () => '/cache/og-hero')
    const result = await resolveHero(
      { gameUrl: 'https://game.example.com/' },
      deps({ fetchPage, fetchAndCache }),
    )
    expect(result).toBeNull()
    expect(fetchPage).not.toHaveBeenCalled()
    expect(fetchAndCache).not.toHaveBeenCalled()
  })

  it('returns null when heroUrl fetch returns null', async () => {
    const result = await resolveHero(
      { heroUrl: 'https://cdn/missing.jpg' },
      deps({ fetchAndCache: async () => null }),
    )
    expect(result).toBeNull()
  })

  it('returns null when nothing is provided', async () => {
    const result = await resolveHero({}, deps({}))
    expect(result).toBeNull()
  })

  it('returns null when page has no og:image', async () => {
    const fetchPage = vi.fn(async () => '<html><head></head></html>')
    const result = await resolveHero(
      { gameUrl: 'https://game.example.com/' },
      deps({ fetchPage }),
    )
    expect(result).toBeNull()
  })

  it('does not fetch page when heroUrl succeeds', async () => {
    const fetchPage = vi.fn(async () => '<html></html>')
    const result = await resolveHero(
      { heroUrl: 'https://cdn/hero.jpg', gameUrl: 'https://game/' },
      deps({ fetchAndCache: async () => '/cache/hero', fetchPage }),
    )
    expect(result).toBe('/cache/hero')
    expect(fetchPage).not.toHaveBeenCalled()
  })
})
