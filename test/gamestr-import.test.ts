/**
 * Tests for the one-tap gamestr game importer (src/main/gamestr-import.ts).
 */

import { describe, it, expect } from 'vitest'
import { isSafeSlug, gameJsonFor, importGameToFolder, type ImportDeps } from '../src/main/gamestr-import'
import type { GamestrCatalogueEntry } from '../src/shared/types'

const ENTRY: GamestrCatalogueEntry = {
  slug: 'btcrally',
  name: 'BTC Rally',
  description: 'A Kart-style racing game with integrated Bitcoin support.',
  image: 'https://img.itch.zone/x.png',
  genres: ['racing', 'multiplayer', 'action'],
  url: 'https://mandelduckstudio.itch.io/btcrally',
  developer: 'npub1yreyumw',
  featured: true,
  trending: true,
  newRelease: true,
}

describe('isSafeSlug', () => {
  it('accepts plain lowercase hyphenated slugs', () => {
    expect(isSafeSlug('btcrally')).toBe(true)
    expect(isSafeSlug('btc-proof-of-play')).toBe(true)
  })
  it('rejects traversal and unsafe characters', () => {
    expect(isSafeSlug('../etc')).toBe(false)
    expect(isSafeSlug('a/b')).toBe(false)
    expect(isSafeSlug('Foo')).toBe(false)
    expect(isSafeSlug('')).toBe(false)
  })
})

describe('gameJsonFor', () => {
  it('maps a catalogue entry onto the scanner game.json shape', () => {
    const json = gameJsonFor(ENTRY)
    expect(json).toMatchObject({
      name: 'BTC Rally',
      url: 'https://mandelduckstudio.itch.io/btcrally',
      gameId: 'btcrally',
      order: 900,
      source: 'gamestr',
      logoUrl: 'https://img.itch.zone/x.png',
      heroUrl: 'https://img.itch.zone/x.png',
      genres: ['racing', 'multiplayer', 'action'],
    })
    expect(json.tagline).toContain('Kart-style')
  })

  it('truncates an overlong tagline with an ellipsis', () => {
    const long = 'x'.repeat(300)
    const json = gameJsonFor({ ...ENTRY, description: long })
    expect((json.tagline as string).length).toBeLessThanOrEqual(140)
    expect(json.tagline as string).toMatch(/…$/)
  })

  it('omits art / tagline when absent', () => {
    const json = gameJsonFor({ slug: 'x', name: 'X', genres: [], url: 'https://x' })
    expect(json.logoUrl).toBeUndefined()
    expect(json.heroUrl).toBeUndefined()
    expect(json.tagline).toBeUndefined()
    expect(json.genres).toBeUndefined()
  })

  it('carries kind-5555 scoring config when present', () => {
    const json = gameJsonFor({
      slug: 'word5', name: 'Word5', genres: ['puzzle'], url: 'https://word5.otherstuff.ai',
      scoreKind: 5555, scoreField: 'streak', scoreDir: 'desc',
    })
    expect(json.scoreKind).toBe(5555)
    expect(json.scoreField).toBe('streak')
    expect(json.scoreDir).toBe('desc')
  })

  it('omits scoring config for default (kind-30762) games', () => {
    const json = gameJsonFor(ENTRY)
    expect(json.scoreKind).toBeUndefined()
    expect(json.scoreField).toBeUndefined()
    expect(json.scoreDir).toBeUndefined()
  })
})

describe('importGameToFolder', () => {
  function fakeDeps(existingPaths: string[] = []): {
    deps: ImportDeps
    writes: Map<string, string>
    mkdirs: string[]
  } {
    const writes = new Map<string, string>()
    const mkdirs: string[] = []
    const existing = new Set(existingPaths)
    return {
      writes,
      mkdirs,
      deps: {
        mkdir: async dir => {
          mkdirs.push(dir)
        },
        writeFile: async (path, data) => {
          writes.set(path, data)
        },
        exists: async path => existing.has(path),
      },
    }
  }

  it('creates games/<slug>/game.json with valid JSON', async () => {
    const { deps, writes, mkdirs } = fakeDeps()
    const res = await importGameToFolder('/games', ENTRY, deps)
    expect(res.created).toBe(true)
    expect(res.slug).toBe('btcrally')
    expect(res.gameJsonPath).toBe('/games/btcrally/game.json')
    expect(mkdirs).toContain('/games/btcrally')
    const written = writes.get('/games/btcrally/game.json')!
    expect(written).toBeTruthy()
    const parsed = JSON.parse(written)
    expect(parsed.gameId).toBe('btcrally')
    expect(parsed.url).toBe('https://mandelduckstudio.itch.io/btcrally')
  })

  it('does not clobber an existing game.json', async () => {
    const { deps, writes } = fakeDeps(['/games/btcrally/game.json'])
    const res = await importGameToFolder('/games', ENTRY, deps)
    expect(res.created).toBe(false)
    expect(writes.size).toBe(0)
  })

  it('refuses an unsafe slug', async () => {
    const { deps } = fakeDeps()
    await expect(importGameToFolder('/games', { ...ENTRY, slug: '../evil' }, deps)).rejects.toThrow(/unsafe/)
  })
})
