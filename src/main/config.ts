import type { ArcadeConfig } from '../shared/types'

export const DEFAULT_CONFIG: ArcadeConfig = {
  gamesDir: 'games',
  theme: { title: 'gamestr arcade', accent: '#7cf3ff', crt: true },
  attractTimeoutMs: 20000,
  kiosk: true,
  leaderboard: { provider: 'none' }
}

export function parseConfig(raw: unknown): ArcadeConfig {
  const o = (typeof raw === 'object' && raw) ? raw as Record<string, any> : {}
  const lb = o.leaderboard
  const leaderboard: ArcadeConfig['leaderboard'] =
    lb?.provider === 'gamestr' && Array.isArray(lb.relays)
      ? { provider: 'gamestr', relays: lb.relays, topN: Number(lb.topN) || 5 }
      : { provider: 'none' }
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
