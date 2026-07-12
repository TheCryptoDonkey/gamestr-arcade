import { describe, it, expect } from 'vitest'
import { parseConfig, DEFAULT_CONFIG, DEFAULT_LEADERBOARD_RELAYS } from '../src/main/config'

describe('parseConfig', () => {
  it('fills defaults when fields are missing', () => {
    const c = parseConfig({})
    expect(c.theme.title).toBe(DEFAULT_CONFIG.theme.title)
    // Default is now gamestr with Pallasite's relay set
    expect(c.leaderboard.provider).toBe('gamestr')
    expect(c.attractTimeoutMs).toBe(20000)
  })
  it('default relay set includes gamestr.io and Pallasite DEFAULT_RELAYS', () => {
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.gamestr.io')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.trotters.cc')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.damus.io')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://nos.lol')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.nostr.band')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.primal.net')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.ditto.pub')
    expect(DEFAULT_LEADERBOARD_RELAYS).toHaveLength(7)
  })
  it('falls back to provider:none only when explicitly set', () => {
    const c = parseConfig({ leaderboard: { provider: 'none' } })
    expect(c.leaderboard.provider).toBe('none')
  })
  it('accepts only a non-empty gamesDir and boolean kiosk value', () => {
    expect(parseConfig({ gamesDir: ' custom-games ', kiosk: false })).toMatchObject({
      gamesDir: 'custom-games',
      kiosk: false,
    })
    expect(parseConfig({ gamesDir: ' ', kiosk: 'false' })).toMatchObject({
      gamesDir: DEFAULT_CONFIG.gamesDir,
      kiosk: DEFAULT_CONFIG.kiosk,
    })
  })
  it('keeps a gamestr provider with relays', () => {
    const c = parseConfig({ leaderboard: { provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 } })
    expect(c.leaderboard).toEqual({ provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 })
  })
  it('normalises wallet payment/session/rate limits', () => {
    const c = parseConfig({
      webln: {
        nwc: ' nostr+walletconnect://wallet?secret=test ',
        maxSats: 20,
        sessionBudgetSats: 70,
        maxPaymentsPerMinute: 3,
      },
    })
    expect(c.webln).toEqual({
      nwc: 'nostr+walletconnect://wallet?secret=test',
      maxSats: 20,
      sessionBudgetSats: 70,
      maxPaymentsPerMinute: 3,
    })
  })
  it('uses conservative wallet defaults for invalid limits', () => {
    const c = parseConfig({ webln: { nwc: 'nostr+walletconnect://wallet', maxSats: 1_000_001, sessionBudgetSats: 10_000_001, maxPaymentsPerMinute: 61 } })
    expect(c.webln).toMatchObject({ maxSats: 100, sessionBudgetSats: 500, maxPaymentsPerMinute: 5 })
  })
  it('does not enable a malformed wallet connection URL', () => {
    expect(parseConfig({ webln: { nwc: 'https://example.com/not-nwc' } }).webln).toBeUndefined()
  })
})
