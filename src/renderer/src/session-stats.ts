/**
 * gamestr-arcade - local session stats.
 *
 * Records how long and how often each game is actually played at this cabinet
 * (fed from the shell's session timer on return-to-grid). Powers the
 * HOT TONIGHT badge: the game with the most plays inside the recent window.
 *
 * Deliberately device-local (localStorage) - this is booth telemetry for
 * curation and social proof, not tracking; nothing leaves the machine.
 * Storage and clock are injectable so tests run on a virtual cabinet.
 */

const KEY = 'arcade-session-stats-v1'

/** Plays inside this window count towards HOT TONIGHT. */
export const HOT_WINDOW_MS = 12 * 60 * 60 * 1000
/** A game needs at least this many windowed plays to be called hot. */
export const HOT_MIN_PLAYS = 2
/** Sessions shorter than this are bounces, not plays. */
export const MIN_SESSION_MS = 30_000
/** Bound per-game recent-play timestamps so storage can never grow unbounded. */
const MAX_RECENT = 200

export interface GameSessionStats {
  plays: number
  totalMs: number
  lastPlayedAt: number
  /** Timestamps of recent plays (pruned to the hot window on every write). */
  recent: number[]
}

export interface SessionStatsDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  now?: () => number
}

type StatsMap = Record<string, GameSessionStats>

function resolve(deps?: SessionStatsDeps): { storage: Pick<Storage, 'getItem' | 'setItem'> | null; now: () => number } {
  return {
    storage: deps?.storage ?? (typeof localStorage === 'undefined' ? null : localStorage),
    now: deps?.now ?? (() => Date.now()),
  }
}

function load(storage: Pick<Storage, 'getItem' | 'setItem'>): StatsMap {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as StatsMap) : {}
  } catch {
    return {}
  }
}

function save(storage: Pick<Storage, 'getItem' | 'setItem'>, map: StatsMap): void {
  try {
    storage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* quota/serialisation failures must never break the shell */
  }
}

/** Record one finished session. Bounced sessions (< MIN_SESSION_MS) are ignored. */
export function recordSession(gameId: string, durationMs: number, deps?: SessionStatsDeps): void {
  if (!gameId || durationMs < MIN_SESSION_MS) return
  const { storage, now } = resolve(deps)
  if (!storage) return
  const at = now()
  const map = load(storage)
  const prev = map[gameId]
  const recent = (prev?.recent ?? [])
    .filter(t => typeof t === 'number' && at - t < HOT_WINDOW_MS)
    .slice(-(MAX_RECENT - 1))
  recent.push(at)
  map[gameId] = {
    plays: (prev?.plays ?? 0) + 1,
    totalMs: (prev?.totalMs ?? 0) + Math.trunc(durationMs),
    lastPlayedAt: at,
    recent,
  }
  save(storage, map)
}

/** Stats for one game, or null when it has never been played here. */
export function statsFor(gameId: string, deps?: SessionStatsDeps): GameSessionStats | null {
  const { storage } = resolve(deps)
  if (!storage) return null
  return load(storage)[gameId] ?? null
}

/**
 * The most-played game inside the hot window (ties broken by most recent play),
 * or null when nothing has reached HOT_MIN_PLAYS - a quiet cabinet stays quiet.
 */
export function hottestTonight(deps?: SessionStatsDeps): { gameId: string; plays: number } | null {
  const { storage, now } = resolve(deps)
  if (!storage) return null
  const at = now()
  const map = load(storage)
  let best: { gameId: string; plays: number; last: number } | null = null
  for (const [gameId, stats] of Object.entries(map)) {
    const windowed = (stats.recent ?? []).filter(t => typeof t === 'number' && at - t < HOT_WINDOW_MS)
    if (windowed.length < HOT_MIN_PLAYS) continue
    const last = Math.max(...windowed)
    if (!best || windowed.length > best.plays || (windowed.length === best.plays && last > best.last)) {
      best = { gameId, plays: windowed.length, last }
    }
  }
  return best ? { gameId: best.gameId, plays: best.plays } : null
}
