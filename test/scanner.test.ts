import { describe, it, expect } from 'vitest'
import { scanGames } from '../src/main/scanner'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, 'fixtures/games')
const REAL_GAMES = join(import.meta.dirname, '..', 'games')

describe('scanGames', () => {
  it('reads a web game from game.json and skips empty folders', async () => {
    const games = await scanGames(DIR)
    const neon = games.find(g => g.id === 'neon')
    expect(neon).toBeTruthy()
    expect(neon!.kind).toBe('web')
    expect(neon!.url).toBe('https://example.test/neon')
    expect(neon!.gameId).toBe('neon-sentinel')
    expect(games.find(g => g.id === 'zzz-empty')).toBeUndefined()
    // A normal web game is not download-only.
    expect(neon!.downloadOnly).toBeUndefined()
    expect(neon!.downloadUrl).toBeUndefined()
  })

  it('reads downloadOnly + downloadUrl from game.json', async () => {
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'dlonly')
    expect(g).toBeTruthy()
    expect(g!.kind).toBe('web')
    expect(g!.downloadOnly).toBe(true)
    expect(g!.downloadUrl).toBe('https://example.test/dlonly/download')
  })

  it('textLogo:true forces an empty logo so the shell renders its neon wordmark', async () => {
    // Even with a resolver that would return art, textLogo wins (logo stays '').
    const games = await scanGames(DIR, async () => '/resolved/should-not-be-used.png')
    const g = games.find(g => g.id === 'dlonly')
    expect(g!.logo).toBe('')
    // A game without the flag still gets its resolved logo.
    const neon = games.find(g => g.id === 'neon')
    expect(neon!.logo).toBe('/resolved/should-not-be-used.png')
  })

  it('reads a native tile from game.json.exec (absolute path)', async () => {
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'exec-only')
    expect(g).toBeTruthy()
    expect(g!.kind).toBe('appimage')
    expect(g!.exec).toBe('/some/absolute/path/Game.AppImage')
    expect(g!.gameId).toBe('exec-only')
  })

  it('reads a native tile from game.json.exec (relative path — resolved to folder)', async () => {
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'exec-relative')
    expect(g).toBeTruthy()
    expect(g!.kind).toBe('appimage')
    // Relative exec is resolved against the tile folder (fixtures/games/exec-relative/)
    expect(g!.exec).toBe(join(DIR, 'exec-relative', '../../fake-game.AppImage'))
  })

  it('a loose *.AppImage in the folder takes precedence over game.json.exec', async () => {
    // exec-only has no loose AppImage in its folder — verify it used exec
    // (this is the complement: if there were a loose AppImage it would win)
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'exec-only')
    expect(g!.exec).toBe('/some/absolute/path/Game.AppImage')
  })

  it('sorts by order then name', async () => {
    const games = await scanGames(DIR)
    expect(games.map(g => g.order)).toEqual([...games.map(g => g.order)].sort((a, b) => a - b))
  })
})

describe('the shipped Pallasite tile', () => {
  it('is classified as a packaged native tile (flagship runs as a local AppImage on the booth)', async () => {
    const games = await scanGames(REAL_GAMES)
    const pallasite = games.find(g => g.id === 'pallasite')
    expect(pallasite, 'pallasite tile should be scanned from games/').toBeTruthy()
    // game.json.exec wins over url: Pallasite ships as a 376 MB native AppImage
    // alongside game.json on the booth, for the full-fat flagship experience.
    expect(pallasite!.kind).toBe('appimage')
    // Relative exec resolves against the tile folder.
    expect(pallasite!.exec).toBe(join(REAL_GAMES, 'pallasite', 'Pallasite.AppImage'))
    expect(pallasite!.gameId).toBe('pallasite')
    expect(pallasite!.order).toBe(1)
    expect(pallasite!.accent).toBe('#7cf3ff')
  })

  it('uses the accent backdrop, not the busy og-image hero', async () => {
    const games = await scanGames(REAL_GAMES)
    const pallasite = games.find(g => g.id === 'pallasite')
    // hero.png was removed so the carousel falls back to the fancy accent backdrop.
    expect(pallasite!.hero).toBeUndefined()
    // …but the clean cyan logo is still present for the logo-on-left treatment.
    expect(pallasite!.logo).toMatch(/pallasite\/logo\.png$/)
  })
})
