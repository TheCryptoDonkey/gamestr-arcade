import type { ArcadeConfig } from '../shared/types'

/**
 * Default relay set — kept in sync with Pallasite's `DEFAULT_RELAYS` so the
 * arcade leaderboard and the in-game leaderboard read from the same pool.
 *
 * Sourced from `pallasite/src/credits.ts` (do not modify that file).
 */
export const DEFAULT_LEADERBOARD_RELAYS: readonly string[] = [
  'wss://relay.trotters.cc',
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
] as const

export const DEFAULT_CONFIG: ArcadeConfig = {
  gamesDir: 'games',
  theme: { title: 'gamestr arcade', accent: '#7cf3ff', crt: true },
  attractTimeoutMs: 20000,
  kiosk: true,
  leaderboard: {
    provider: 'gamestr',
    relays: [...DEFAULT_LEADERBOARD_RELAYS],
    topN: 5,
  },
}

export function parseConfig(raw: unknown): ArcadeConfig {
  const o = (typeof raw === 'object' && raw) ? raw as Record<string, any> : {}
  const lb = o.leaderboard
  const leaderboard: ArcadeConfig['leaderboard'] =
    lb?.provider === 'none'
      ? { provider: 'none' }
      : lb?.provider === 'gamestr' && Array.isArray(lb.relays)
        ? { provider: 'gamestr', relays: lb.relays, topN: Number(lb.topN) || 5 }
        : { ...DEFAULT_CONFIG.leaderboard }
  return {
    gamesDir: typeof o.gamesDir === 'string' ? o.gamesDir : DEFAULT_CONFIG.gamesDir,
    theme: {
      title: o.theme?.title ?? DEFAULT_CONFIG.theme.title,
      wordmark: o.theme?.wordmark,
      accent: o.theme?.accent ?? DEFAULT_CONFIG.theme.accent,
      crt: o.theme?.crt ?? DEFAULT_CONFIG.theme.crt
    },
    attractTimeoutMs: Number(o.attractTimeoutMs) || DEFAULT_CONFIG.attractTimeoutMs,
    kiosk: o.kiosk ?? DEFAULT_CONFIG.kiosk,
    leaderboard
  }
}
