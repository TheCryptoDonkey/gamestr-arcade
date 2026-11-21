import { describe, expect, it } from 'vitest'
import type { Game } from '../src/shared/types'
import { withBoothMode } from '../src/main/booth-mode'

function pallasite(overrides: Partial<Game> = {}): Game {
  return {
    id: 'pallasite', gameId: 'pallasite', name: 'Pallasite', kind: 'web', logo: '', order: 1,
    url: 'https://pallasite.app/', ...overrides,
  }
}

describe('withBoothMode', () => {
  it('opens every Pallasite web build as the booth kiosk', () => {
    expect(withBoothMode(pallasite(), true).url).toBe('https://pallasite.app/?p1&fullfx=1')
    expect(withBoothMode(pallasite({ url: 'http://127.0.0.1:49470/' }), true).url).toBe('http://127.0.0.1:49470/?p1&fullfx=1')
    expect(withBoothMode(pallasite({ url: 'http://127.0.0.1:49470/?lang=en' }), true).url)
      .toBe('http://127.0.0.1:49470/?lang=en&p1&fullfx=1')
  })

  it('leaves an explicit booth screen alone', () => {
    expect(withBoothMode(pallasite({ url: 'https://pallasite.app/?p2' }), true).url).toBe('https://pallasite.app/?p2')
  })

  it('boots the native desktop app in booth mode through its environment', () => {
    const game = withBoothMode(pallasite({ kind: 'appimage', url: undefined, exec: 'C:\\Pallasite\\Pallasite.exe' }), false)
    expect(game.launchEnv).toEqual({ PALLASITE_BOOT_QUERY: 'p1&fullfx=1', PALLASITE_KIOSK: '0' })
    expect(withBoothMode(pallasite({ kind: 'appimage', exec: '/games/Pallasite.AppImage' }), true).launchEnv?.PALLASITE_KIOSK).toBe('1')
  })

  it('does not touch other games', () => {
    const other = pallasite({ id: 'neon-sentinel', gameId: 'neon-sentinel', url: 'https://neonsentinel.app/' })
    expect(withBoothMode(other, true)).toBe(other)
  })
})
