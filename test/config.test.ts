import { describe, it, expect } from 'vitest'
import { parseConfig, DEFAULT_CONFIG } from '../src/main/config'

describe('parseConfig', () => {
  it('fills defaults when fields are missing', () => {
    const c = parseConfig({})
    expect(c.theme.title).toBe(DEFAULT_CONFIG.theme.title)
    expect(c.leaderboard.provider).toBe('none')
    expect(c.attractTimeoutMs).toBe(20000)
  })
  it('keeps a gamestr provider with relays', () => {
    const c = parseConfig({ leaderboard: { provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 } })
    expect(c.leaderboard).toEqual({ provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 })
  })
})
