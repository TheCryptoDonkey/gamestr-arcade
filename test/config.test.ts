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
  it('default relay set matches Pallasite DEFAULT_RELAYS', () => {
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.trotters.cc')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.damus.io')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://nos.lol')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.nostr.band')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.primal.net')
    expect(DEFAULT_LEADERBOARD_RELAYS).toContain('wss://relay.ditto.pub')
    expect(DEFAULT_LEADERBOARD_RELAYS).toHaveLength(6)
  })
  it('falls back to provider:none only when explicitly set', () => {
    const c = parseConfig({ leaderboard: { provider: 'none' } })
    expect(c.leaderboard.provider).toBe('none')
  })
  it('keeps a gamestr provider with relays', () => {
    const c = parseConfig({ leaderboard: { provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 } })
    expect(c.leaderboard).toEqual({ provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 })
  })
})
