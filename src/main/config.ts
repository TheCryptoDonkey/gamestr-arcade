import type { ArcadeConfig, DonationConfig, WebLNConfig } from '../shared/types'

/**
 * Default relay set - kept in sync with Pallasite's `DEFAULT_RELAYS` so the
 * arcade leaderboard and the in-game leaderboard read from the same pool.
 *
 * Sourced from `pallasite/src/credits.ts` (do not modify that file).
 */
export const DEFAULT_LEADERBOARD_RELAYS: readonly string[] = [
  'wss://relay.gamestr.io',
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
    gamesDir: typeof o.gamesDir === 'string' && o.gamesDir.trim() ? o.gamesDir.trim() : DEFAULT_CONFIG.gamesDir,
    theme: {
      title: o.theme?.title ?? DEFAULT_CONFIG.theme.title,
      wordmark: o.theme?.wordmark,
      accent: o.theme?.accent ?? DEFAULT_CONFIG.theme.accent,
      crt: o.theme?.crt ?? DEFAULT_CONFIG.theme.crt
    },
    attractTimeoutMs: Number(o.attractTimeoutMs) || DEFAULT_CONFIG.attractTimeoutMs,
    kiosk: typeof o.kiosk === 'boolean' ? o.kiosk : DEFAULT_CONFIG.kiosk,
    leaderboard,
    webln: parseWebLN(o.webln),
    donation: parseDonation(o.donation),
  }
}

function parseDonation(raw: unknown): DonationConfig | undefined {
  if (typeof raw !== 'object' || !raw) return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.address !== 'string') return undefined
  const address = o.address.trim()
  if (address.length < 6 || address.length > 320) return undefined
  return {
    address,
    message: typeof o.message === 'string' && o.message.trim() ? o.message.trim().slice(0, 120) : undefined,
    minSessionSeconds: safeNonNegativeInt(o.minSessionSeconds, 45, 3600),
    showSeconds: safePositiveInt(o.showSeconds, 30, 300),
  }
}

function parseWebLN(raw: unknown): WebLNConfig | undefined {
  if (typeof raw !== 'object' || !raw) return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.nwc !== 'string' || !o.nwc.trim().startsWith('nostr+walletconnect://')) return undefined
  const maxSats = safeNonNegativeInt(o.maxSats, 100, 1_000_000)
  const defaultSessionBudget = Number.isSafeInteger(maxSats * 5) ? maxSats * 5 : maxSats
  return {
    nwc: o.nwc.trim(),
    maxSats,
    sessionBudgetSats: safeNonNegativeInt(o.sessionBudgetSats, defaultSessionBudget, 10_000_000),
    maxPaymentsPerMinute: safePositiveInt(o.maxPaymentsPerMinute, 5, 60),
  }
}

function safeNonNegativeInt(raw: unknown, fallback: number, max: number): number {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 && raw <= max ? raw : fallback
}

function safePositiveInt(raw: unknown, fallback: number, max: number): number {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 && raw <= max ? raw : fallback
}
