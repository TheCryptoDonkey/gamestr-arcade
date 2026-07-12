import { describe, expect, it } from 'vitest'
import { resolveStartupGamesDir, resolveStartupKiosk } from '../src/main/startup-policy'

describe('startup config policy', () => {
  it('resolves configured gamesDir relative to the config file', () => {
    expect(resolveStartupGamesDir('/opt/arcade/arcade.config.json', 'games', undefined, '/ignored'))
      .toBe('/opt/arcade/games')
    expect(resolveStartupGamesDir('/opt/arcade/config/arcade.json', '../games', undefined, '/ignored'))
      .toBe('/opt/arcade/games')
  })

  it('lets ARCADE_GAMES_DIR override config and resolves relative overrides from cwd', () => {
    expect(resolveStartupGamesDir('/opt/arcade/arcade.config.json', 'games', '/srv/booth-games', '/work'))
      .toBe('/srv/booth-games')
    expect(resolveStartupGamesDir('/opt/arcade/arcade.config.json', 'games', 'fixtures/games', '/work'))
      .toBe('/work/fixtures/games')
  })

  it('uses parsed kiosk config unless ARCADE_KIOSK explicitly overrides it', () => {
    expect(resolveStartupKiosk(false, undefined)).toBe(false)
    expect(resolveStartupKiosk(true, undefined)).toBe(true)
    expect(resolveStartupKiosk(true, '0')).toBe(false)
    expect(resolveStartupKiosk(false, '1')).toBe(true)
  })
})
