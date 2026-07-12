import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  allowedOriginsForGame,
  grantsForGame,
  isAllowedWebNavigation,
  normaliseWebOrigin,
  parseGuestNostrTemplate,
  publicArcadeConfig,
} from '../src/main/web-session-policy'
import type { ArcadeConfig, Game } from '../src/shared/types'

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'secure-web',
    name: 'Secure Web',
    kind: 'web',
    url: 'https://game.example/play',
    gameId: 'secure-web',
    logo: '',
    order: 1,
    ...overrides,
  }
}

describe('web-game origin policy', () => {
  it('admits the launch origin but not unrelated origins or schemes', () => {
    const allowed = allowedOriginsForGame(game())
    expect([...allowed]).toEqual(['https://game.example'])
    expect(isAllowedWebNavigation('https://game.example/next?x=1', allowed)).toBe(true)
    expect(isAllowedWebNavigation('https://evil.example/', allowed)).toBe(false)
    expect(isAllowedWebNavigation('http://game.example/insecure', allowed)).toBe(false)
    expect(isAllowedWebNavigation('file:///etc/passwd', allowed)).toBe(false)
    expect(isAllowedWebNavigation('javascript:alert(1)', allowed)).toBe(false)
  })

  it('honours additional manifest origins only with externalNavigation capability', () => {
    const declaration = { allowedOrigins: ['https://auth.example/path'] }
    expect(allowedOriginsForGame(game(declaration)).has('https://auth.example')).toBe(false)
    const granted = allowedOriginsForGame(game({
      ...declaration,
      capabilities: { externalNavigation: true },
    }))
    expect(granted.has('https://auth.example')).toBe(true)
  })

  it('rejects credential-bearing and malformed origins', () => {
    expect(normaliseWebOrigin('https://user:pass@example.com/')).toBeNull()
    expect(normaliseWebOrigin('not a url')).toBeNull()
  })

  it('allows plaintext HTTP only for exact loopback mirror hosts', () => {
    expect(normaliseWebOrigin('http://localhost:4173/game')).toBe('http://localhost:4173')
    expect(normaliseWebOrigin('http://127.0.0.1:4173/game')).toBe('http://127.0.0.1:4173')
    expect(normaliseWebOrigin('http://[::1]:4173/game')).toBe('http://[::1]:4173')
    expect(normaliseWebOrigin('http://example.com/game')).toBeNull()
    expect(normaliseWebOrigin('http://localhost.evil.example/game')).toBeNull()
  })
})

describe('web-game capability grants', () => {
  it('is fail-closed and requires both declaration and a configured wallet', () => {
    expect(grantsForGame(game(), true)).toEqual({ nostrSign: false, walletPay: false })
    const declared = game({ capabilities: { nostrSign: true, walletPay: true } })
    expect(grantsForGame(declared, false)).toEqual({ nostrSign: true, walletPay: false })
    expect(grantsForGame(declared, true)).toEqual({ nostrSign: true, walletPay: true })
  })
})

describe('publicArcadeConfig', () => {
  it('never returns NWC credentials or wallet policy to the shell renderer', () => {
    const config: ArcadeConfig = {
      gamesDir: 'games',
      theme: { title: 'Arcade', accent: '#fff', crt: true },
      attractTimeoutMs: 20_000,
      kiosk: true,
      leaderboard: { provider: 'none' },
      webln: {
        nwc: 'nostr+walletconnect://wallet?secret=do-not-leak',
        maxSats: 10,
        sessionBudgetSats: 30,
        maxPaymentsPerMinute: 2,
      },
    }
    const exposed = publicArcadeConfig(config)
    expect(exposed.webln).toBeUndefined()
    expect(JSON.stringify(exposed)).not.toContain('do-not-leak')
    expect(config.webln?.nwc).toContain('do-not-leak')
  })

  it('keeps wallet clients and connection configuration out of the untrusted preload', () => {
    const preload = readFileSync(new URL('../src/preload/webgame.ts', import.meta.url), 'utf8')
    expect(preload).not.toContain('@getalby/sdk')
    expect(preload).not.toContain('nostr+walletconnect')
    expect(preload).not.toContain('arcade:webln')
    expect(preload).not.toContain('cfg.nwc')
  })
})

describe('guest Nostr signing policy', () => {
  const NOW = 1_800_000_000

  it('normalises a small current template', () => {
    expect(parseGuestNostrTemplate({ kind: 5555, tags: [['game', 'word5']], content: 'score' }, NOW)).toEqual({
      kind: 5555,
      created_at: NOW,
      tags: [['game', 'word5']],
      content: 'score',
    })
  })

  it('rejects invalid kinds, stale/future timestamps, oversized content and malformed tags', () => {
    expect(parseGuestNostrTemplate({ kind: -1 }, NOW)).toBeNull()
    expect(parseGuestNostrTemplate({ kind: 1.5 }, NOW)).toBeNull()
    expect(parseGuestNostrTemplate({ kind: 1, created_at: NOW - 601 }, NOW)).toBeNull()
    expect(parseGuestNostrTemplate({ kind: 1, created_at: NOW + 601 }, NOW)).toBeNull()
    expect(parseGuestNostrTemplate({ kind: 1, content: 'x'.repeat(64 * 1024 + 1) }, NOW)).toBeNull()
    expect(parseGuestNostrTemplate({ kind: 1, tags: [['ok'], [123]] }, NOW)).toBeNull()
  })
})
