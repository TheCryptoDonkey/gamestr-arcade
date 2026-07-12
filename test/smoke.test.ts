import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseConfig } from '../src/main/config'
import { scanGames } from '../src/main/scanner'

const ROOT = join(import.meta.dirname, '..')

describe('shipped arcade smoke', () => {
  it('loads the booth config and exposes a valid, launchable catalogue', async () => {
    const rawConfig: unknown = JSON.parse(
      await readFile(join(ROOT, 'arcade.config.json'), 'utf8'),
    )
    const config = parseConfig(rawConfig)
    const games = await scanGames(join(ROOT, config.gamesDir))

    expect(config.theme.title).toBeTruthy()
    expect(config.attractTimeoutMs).toBeGreaterThan(0)
    expect(games.length).toBeGreaterThan(0)
    expect(new Set(games.map(game => game.id)).size).toBe(games.length)

    for (const game of games) {
      expect(game.id).toBeTruthy()
      expect(game.name).toBeTruthy()
      expect(game.gameId).toBeTruthy()
      if (game.kind === 'web') {
        expect(() => new URL(game.url!)).not.toThrow()
        expect(game.url).toMatch(/^https?:\/\//)
      } else {
        expect(game.exec).toBeTruthy()
      }
    }
  })
})
