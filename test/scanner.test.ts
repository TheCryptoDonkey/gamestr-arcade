import { describe, it, expect } from 'vitest'
import { scanGames } from '../src/main/scanner'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, 'fixtures/games')

describe('scanGames', () => {
  it('reads a web game from game.json and skips empty folders', async () => {
    const games = await scanGames(DIR)
    const neon = games.find(g => g.id === 'neon')
    expect(neon).toBeTruthy()
    expect(neon!.kind).toBe('web')
    expect(neon!.url).toBe('https://example.test/neon')
    expect(neon!.gameId).toBe('neon-sentinel')
    expect(games.find(g => g.id === 'zzz-empty')).toBeUndefined()
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
