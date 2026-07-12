import type { LeaderboardEntry, LeaderboardProvider, ScoreScoring } from '../../../shared/types'
import { verifyEvent } from 'nostr-tools/pure'
import {
  isScoreEvent,
  parseAnyScoreEvent,
  parse5555Event,
  scoreGameId,
  type ScoreEvent,
  type SupportedScoreKind,
} from './gamestr-reduce'

/** Optional callbacks for external status monitoring. */
export interface GamestrProviderOptions {
  /**
   * Called with `'down'` when ALL relay sockets have dropped and with `'up'`
   * when at least one socket reconnects.
   */
  onStatus?: (state: 'up' | 'down') => void
  /** Maximum verified score events retained for one subscription. */
  maxEvents?: number
}

export interface GamestrCatalogueOptions {
  onStatus?: (state: 'up' | 'down') => void
  /** Maximum verified events retained for any one game. */
  maxEventsPerGame?: number
  /** Maximum game buckets retained by the broad catalogue feed. */
  maxGames?: number
}

const DEFAULT_MAX_CATALOGUE_EVENTS_PER_GAME = 500
const DEFAULT_MAX_CATALOGUE_GAMES = 256
const MAX_CONFIGURED_EVENT_CAP = 10_000

function positiveInt(value: number | undefined, fallback: number, max = MAX_CONFIGURED_EVENT_CAP): number {
  const safeFallback = Number.isSafeInteger(fallback) && fallback > 0
    ? Math.min(fallback, max)
    : 1
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? Math.min(value, max)
    : safeFallback
}

/**
 * Retain the newest events by timestamp. Relay queries are usually newest-first,
 * so blindly relying on Map insertion order would eventually evict the best data.
 */
function setCappedEvent(
  events: Map<string, LeaderboardEntry>,
  id: string,
  entry: LeaderboardEntry,
  maxEvents: number,
): boolean {
  if (events.has(id)) return false
  events.set(id, entry)
  if (events.size <= maxEvents) return true

  let oldestId: string | undefined
  let oldestAt = Number.POSITIVE_INFINITY
  for (const [candidateId, candidate] of events) {
    if (candidate.at < oldestAt) {
      oldestAt = candidate.at
      oldestId = candidateId
    }
  }
  if (oldestId !== undefined) events.delete(oldestId)
  return oldestId !== id
}

/** Capped jittered backoff: starts at ~2 s, caps at 30 s. */
function nextBackoffMs(attempt: number): number {
  const base = Math.min(2000 * Math.pow(1.5, attempt), 30_000)
  return base * (0.75 + Math.random() * 0.5)
}

/**
 * Shared session-wide catalogue subscription.
 *
 * Opens one WebSocket per relay with a broad kind-30762 + kind-5555 filter.
 * Routes each incoming event to an in-memory index keyed by the event's own
 * `game` tag. Multiple callers can subscribe to different game IDs; the
 * sockets stay open until `dispose()` is called.
 */
export interface GamestrCatalogue extends LeaderboardProvider {
  /**
   * Subscribe to leaderboard updates for a given gameId.
   * `onUpdate` is called immediately with the current index entries for that
   * game, then again whenever a new score for that game arrives.
   * Returns an unsubscribe function.
   */
  subscribe(
    gameId: string,
    onUpdate: (entries: LeaderboardEntry[]) => void,
    scoring?: ScoreScoring,
  ): () => void
  /** Close all relay sockets and cancel reconnect timers. */
  dispose(): void
}

export function createGamestrCatalogue(
  relays: string[],
  opts: GamestrCatalogueOptions = {},
): GamestrCatalogue {
  // Store raw, verified events so kind-5555 subscribers can choose their own
  // score field without opening another relay subscription.
  const index = new Map<string, Map<string, ScoreEvent>>()
  interface Subscriber {
    onUpdate: (entries: LeaderboardEntry[]) => void
    scoring?: ScoreScoring
  }
  const subscribers = new Map<string, Set<Subscriber>>()
  const maxEventsPerGame = positiveInt(opts.maxEventsPerGame, DEFAULT_MAX_CATALOGUE_EVENTS_PER_GAME)
  const maxGames = positiveInt(opts.maxGames, DEFAULT_MAX_CATALOGUE_GAMES, DEFAULT_MAX_CATALOGUE_GAMES)

  let disposed = false
  const connected = new Set<string>()
  const synced = new Set<string>()
  const relayTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const sockets = new Map<string, WebSocket>()
  // Debounce emit per gameId so rapid burst events don't spam callbacks.
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  function entriesFor(gameId: string, scoring?: ScoreScoring): LeaderboardEntry[] {
    const bucket = index.get(gameId)
    if (!bucket) return []
    const kind = scoring?.kind ?? 30762
    if (kind !== 30762 && kind !== 5555) return []
    const field = scoring?.field ?? 'score'
    if (kind === 5555 && (!field || field.length > 64)) return []
    const out: LeaderboardEntry[] = []
    for (const event of bucket.values()) {
      if (event.kind !== kind) continue
      const entry = kind === 5555
        ? parse5555Event(event, gameId, field)
        : parseAnyScoreEvent(event)?.entry ?? null
      if (entry) out.push(entry)
    }
    return out
  }

  function emitGame(gameId: string): void {
    if (disposed) return
    if (pending.has(gameId)) return
    const t = setTimeout(() => {
      pending.delete(gameId)
      if (disposed) return
      const subs = subscribers.get(gameId)
      if (!subs || subs.size === 0) return
      for (const subscriber of subs) {
        subscriber.onUpdate(entriesFor(gameId, subscriber.scoring))
      }
    }, 200)
    pending.set(gameId, t)
  }

  function consider(e: ScoreEvent): void {
    const gameId = scoreGameId(e)
    if (!gameId) return
    // Store every event (keyed by id) — do NOT collapse to best-per-pubkey here,
    // or the Today board (period-filtered downstream) would only ever show players
    // whose all-time best happens to be today. boardFor() does period reduction.
    let bucket = index.get(gameId)
    if (!bucket) {
      if (index.size >= maxGames) {
        // Prefer evicting a game nobody is currently looking at.
        const evicted = Array.from(index.keys()).find(id => !subscribers.get(id)?.size)
          ?? (index.keys().next().value as string | undefined)
        if (evicted !== undefined) {
          index.delete(evicted)
          emitGame(evicted)
        }
      }
      bucket = new Map()
      index.set(gameId, bucket)
    }
    if (bucket.has(e.id)) return
    bucket.set(e.id, e)
    if (bucket.size > maxEventsPerGame) {
      let oldestId: string | undefined
      let oldestAt = Number.POSITIVE_INFINITY
      for (const [candidateId, candidate] of bucket) {
        if (candidate.created_at < oldestAt) {
          oldestAt = candidate.created_at
          oldestId = candidateId
        }
      }
      if (oldestId !== undefined) bucket.delete(oldestId)
      if (oldestId === e.id) return
    }
    emitGame(gameId)
  }

  function connectRelay(url: string, attempt: number): void {
    if (disposed) return
    let ws: WebSocket
    try { ws = new WebSocket(url) } catch { return }
    sockets.set(url, ws)

    const subId = 'lb' + Math.random().toString(36).slice(2, 10)

    ws.onopen = () => {
      connected.add(url)
      if (connected.size === 1) opts.onStatus?.('up')
      ws.send(JSON.stringify(['REQ', subId, { kinds: [30762, 5555], limit: 1000 }]))
    }

    ws.onmessage = ev => {
      let msg: unknown
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
      if (!Array.isArray(msg) || msg[1] !== subId) return
      if (msg[0] === 'EOSE') {
        const firstSync = synced.size === 0
        synced.add(url)
        // A relay that reaches EOSE with no events is still a healthy, synced
        // empty feed. Re-emit subscribed games so callers can distinguish that
        // from a connection which never completed its initial query.
        if (firstSync) for (const gameId of subscribers.keys()) emitGame(gameId)
        return
      }
      if (msg[0] === 'EVENT' && isScoreEvent(msg[2]) && verifyEvent(msg[2])) {
        consider(msg[2])
      }
    }

    const reconnect = () => {
      if (disposed) return
      connected.delete(url)
      synced.delete(url)
      if (connected.size === 0) opts.onStatus?.('down')
      const delay = nextBackoffMs(attempt)
      const t = setTimeout(() => {
        relayTimers.delete(url)
        connectRelay(url, attempt + 1)
      }, delay)
      relayTimers.set(url, t)
    }

    ws.onclose = () => reconnect()
    ws.onerror = () => {
      // onerror precedes onclose; let onclose drive the reconnect.
    }
  }

  if (relays.length > 0) {
    for (const url of relays) connectRelay(url, 0)
  }

  return {
    subscribe(gameId, onUpdate, scoring) {
      let subs = subscribers.get(gameId)
      if (!subs) { subs = new Set(); subscribers.set(gameId, subs) }
      const subscriber: Subscriber = { onUpdate, scoring }
      subs.add(subscriber)
      // Emit current entries immediately (async so caller can set up state first).
      const t = setTimeout(() => { if (!disposed) onUpdate(entriesFor(gameId, scoring)) }, 0)
      return () => {
        clearTimeout(t)
        const s = subscribers.get(gameId)
        s?.delete(subscriber)
      }
    },

    dispose() {
      disposed = true
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
      for (const t of relayTimers.values()) clearTimeout(t)
      relayTimers.clear()
      for (const ws of sockets.values()) { try { ws.close() } catch { /* ignore */ } }
      sockets.clear()
      connected.clear()
      synced.clear()
    },
  }
}

/**
 * Per-game provider — used by the panel's `makeProvider` factory API.
 * Uses a broad REQ (no `#t`) since gamestr.io games tag genres, not game IDs.
 */
export function createGamestrProvider(
  relays: string[],
  topN: number,
  opts: GamestrProviderOptions = {},
): LeaderboardProvider {
  return {
    subscribe(gameId, onUpdate, scoring?: ScoreScoring) {
      if (relays.length === 0) { setTimeout(() => onUpdate([]), 0); return () => {} }
      const scoreKind = scoring?.kind ?? 30762
      if (scoreKind !== 30762 && scoreKind !== 5555) {
        setTimeout(() => onUpdate([]), 0)
        return () => {}
      }
      const expectedKind: SupportedScoreKind = scoreKind
      // 5555 (Other Stuff) games carry the score in a game-specific tag.
      const scoreField = scoring?.field ?? 'score'
      if (expectedKind === 5555 && (!scoreField || scoreField.length > 64)) {
        setTimeout(() => onUpdate([]), 0)
        return () => {}
      }
      const maxEvents = positiveInt(opts.maxEvents, Math.max(500, topN * 50))

      // Store EVERY score event for this game, keyed by event id. We deliberately
      // do NOT collapse to best-per-pubkey here: the panel's boardFor() needs each
      // player's best score *within the selected period*. An all-time-best guard
      // would discard today's lower scores in favour of an older record — so on a
      // global feed the Today board would show only players whose all-time best is
      // today (≈ nobody). boardFor() does period + best-per-pubkey + topN at render.
      const events = new Map<string, LeaderboardEntry>()
      let closed = false
      let pending: ReturnType<typeof setTimeout> | null = null

      const connected = new Set<string>()
      const synced = new Set<string>()

      const emit = () => {
        if (closed || pending) return
        pending = setTimeout(() => {
          pending = null; if (closed) return
          onUpdate(Array.from(events.values()))
        }, 200)
      }

      const consider = (e: ScoreEvent) => {
        // The configured kind selects exactly one schema for this game.
        const entry =
          expectedKind === 5555
            ? parse5555Event(e, gameId, scoreField)
            : (() => {
                const p = parseAnyScoreEvent(e)
                return p && p.gameId === gameId ? p.entry : null
              })()
        if (!entry) return
        if (setCappedEvent(events, e.id, entry, maxEvents)) emit()
      }

      const relayTimers = new Map<string, ReturnType<typeof setTimeout>>()
      const sockets = new Map<string, WebSocket>()

      function connectRelay(url: string, attempt: number): void {
        if (closed) return
        let ws: WebSocket
        try { ws = new WebSocket(url) } catch { return }
        sockets.set(url, ws)

        const subId = 'lb' + Math.random().toString(36).slice(2, 10)

        ws.onopen = () => {
          connected.add(url)
          if (connected.size === 1) opts.onStatus?.('up')
          // Broad filter — no #t — because gamestr.io games tag genres, not game IDs.
          ws.send(JSON.stringify(['REQ', subId, { kinds: [expectedKind], limit: 500 }]))
        }

        ws.onmessage = ev => {
          let msg: unknown
          try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
          if (!Array.isArray(msg) || msg[1] !== subId) return
          if (msg[0] === 'EOSE') {
            const firstSync = synced.size === 0
            synced.add(url)
            if (firstSync) emit()
            return
          }
          if (msg[0] === 'EVENT' && isScoreEvent(msg[2], expectedKind) && verifyEvent(msg[2])) {
            consider(msg[2])
          }
        }

        const reconnect = () => {
          if (closed) return
          connected.delete(url)
          synced.delete(url)
          if (connected.size === 0) opts.onStatus?.('down')
          const delay = nextBackoffMs(attempt)
          const t = setTimeout(() => {
            relayTimers.delete(url)
            connectRelay(url, attempt + 1)
          }, delay)
          relayTimers.set(url, t)
        }

        ws.onclose = () => reconnect()
        ws.onerror = () => {}
      }

      for (const url of relays) connectRelay(url, 0)

      return () => {
        closed = true
        if (pending) clearTimeout(pending)
        for (const t of relayTimers.values()) clearTimeout(t)
        relayTimers.clear()
        for (const ws of sockets.values()) { try { ws.close() } catch { /* ignore */ } }
        sockets.clear()
        connected.clear()
        synced.clear()
      }
    },
  }
}
