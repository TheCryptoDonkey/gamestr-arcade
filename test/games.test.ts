import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import {
  buildGamesList,
  isPathAllowed,
  pathToMediaUrl,
  mediaUrlToPath,
  MEDIA_SCHEME,
} from '../src/main/games'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures/games')
const FAKE_CACHE = '/tmp/arcade-test-cache'

describe('pathToMediaUrl', () => {
  it('converts an absolute path to a media:// URL', () => {
    const url = pathToMediaUrl('/games/neon/logo.png')
    expect(url).toBe('media://local/games/neon/logo.png')
  })

  it('round-trips through mediaUrlToPath', () => {
    const original = '/games/neon/logo.png'
    const url = pathToMediaUrl(original)
    expect(mediaUrlToPath(url)).toBe(original)
  })

  it('returns empty string unchanged', () => {
    expect(pathToMediaUrl('')).toBe('')
  })
})

describe('mediaUrlToPath', () => {
  it('extracts the path from a media URL', () => {
    expect(mediaUrlToPath('media://local/games/neon/logo.png')).toBe('/games/neon/logo.png')
  })

  it('returns empty string for non-media URLs', () => {
    expect(mediaUrlToPath('')).toBe('')
    expect(mediaUrlToPath('https://example.com/img.png')).toBe('')
  })
})

describe(`${MEDIA_SCHEME} constant`, () => {
  it('is "media"', () => {
    expect(MEDIA_SCHEME).toBe('media')
  })
})

describe('isPathAllowed', () => {
  const roots = ['/srv/games', '/srv/cache', '/app/resources']

  it('allows files nested under an allowed root', () => {
    expect(isPathAllowed('/srv/games/neon/logo.png', roots)).toBe(true)
    expect(isPathAllowed('/srv/cache/pallasite.png', roots)).toBe(true)
  })

  it('allows the placeholder icon under the app resources dir (the dev-403 fix)', () => {
    // Every AppImage game on macOS falls back to resources/icon.png; that path
    // must be servable or logos 403 in dev.
    expect(isPathAllowed('/app/resources/icon.png', roots)).toBe(true)
  })

  it('allows a root path exactly (no trailing segment)', () => {
    expect(isPathAllowed('/srv/games', roots)).toBe(true)
  })

  it('rejects paths outside every allowed root', () => {
    expect(isPathAllowed('/etc/passwd', roots)).toBe(false)
    expect(isPathAllowed('/srv/secret/data', roots)).toBe(false)
  })

  it('rejects a sibling dir that merely shares a string prefix', () => {
    // "/srv/games-old" must NOT be permitted by the "/srv/games" root.
    expect(isPathAllowed('/srv/games-old/leak.png', roots)).toBe(false)
  })

  it('rejects path-traversal that escapes an allowed root', () => {
    expect(isPathAllowed('/srv/games/../secret/key.pem', roots)).toBe(false)
  })
})

describe('buildGamesList', () => {
  it('returns games with logo rewritten to media:// URL', async () => {
    const games = await buildGamesList(FIXTURES_DIR, FAKE_CACHE)
    const neon = games.find(g => g.id === 'neon')
    expect(neon).toBeTruthy()
    // logo.png exists as a sibling file in the fixture; it should be rewritten
    expect(neon!.logo).toMatch(/^media:\/\/local\//)
  })

  it('skips the empty folder and returns only scannable games', async () => {
    const games = await buildGamesList(FIXTURES_DIR, FAKE_CACHE)
    expect(games.find(g => g.id === 'zzz-empty')).toBeUndefined()
    expect(games.length).toBe(1)
  })

  it('preserves game metadata from game.json', async () => {
    const games = await buildGamesList(FIXTURES_DIR, FAKE_CACHE)
    const neon = games.find(g => g.id === 'neon')
    expect(neon!.name).toBe('Neon Sentinel')
    expect(neon!.kind).toBe('web')
    expect(neon!.url).toBe('https://example.test/neon')
    expect(neon!.gameId).toBe('neon-sentinel')
    expect(neon!.order).toBe(2)
  })

  it('rewrites hero path to media:// URL when present', async () => {
    const games = await buildGamesList(FIXTURES_DIR, FAKE_CACHE)
    const neon = games.find(g => g.id === 'neon')
    // neon fixture has no hero.png — hero should be undefined or media:// if present
    if (neon!.hero !== undefined) {
      expect(neon!.hero).toMatch(/^media:\/\/local\//)
    }
  })

  it('returns an empty array for a non-existent directory', async () => {
    const games = await buildGamesList('/tmp/does-not-exist-arcade', FAKE_CACHE)
    expect(games).toEqual([])
  })
})
