import type { LeaderboardEntry, LeaderboardProvider } from '../../../shared/types'
import { isScoreEvent, parseAnyScoreEvent, type ScoreEvent } from './gamestr-reduce'

/** Optional callbacks for external status monitoring. */
export interface GamestrProviderOptions {
  /**
   * Called with `'down'` when ALL relay sockets have dropped and with `'up'`
   * when at least one socket reconnects.
   */
  onStatus?: (state: 'up' | 'down') => void
}

export interface GamestrCatalogueOptions {
  onStatus?: (state: 'up' | 'down') => void
}

/** Capped jittered backoff: starts at ~2 s, caps at 30 s. */
function nextBackoffMs(attempt: number): number {
  const base = Math.min(2000 * Math.pow(1.5, attempt), 30_000)
  return base * (0.75 + Math.random() * 0.5)
}

/**
 * Shared session-wide catalogue subscription.
 *
 * Opens one WebSocket per relay with a broad kind-30762 filter (no `#t`).
 * Routes each incoming event to an in-memory index keyed by the event's own
 * `game` tag. Multiple callers can subscribe to different game IDs; the
 * sockets stay open until `dispose()` is called.
 */
export interface GamestrCatalogue {
  /**
   * Subscribe to leaderboard updates for a given gameId.
   * `onUpdate` is called immediately with the current index entries for that
   * game, then again whenever a new score for that game arrives.
   * Returns an unsubscribe function.
   */
  subscribe(gameId: string, onUpdate: (entries: LeaderboardEntry[]) => void): () => void
  /** Close all relay sockets and cancel reconnect timers. */
  dispose(): void
}

export function createGamestrCatalogue(
  relays: string[],
  opts: GamestrCatalogueOptions = {},
): GamestrCatalogue {
  // index: gameId → (eventId → entry). Stores EVERY event (no best-per-pubkey
  // collapse) so period-aware boards (Today) can be reduced correctly downstream.
  const index = new Map<string, Map<string, LeaderboardEntry>>()
  // subscribers: gameId → Set of callbacks
  const subscribers = new Map<string, Set<(entries: LeaderboardEntry[]) => void>>()

  let disposed = false
  const connected = new Set<string>()
  const relayTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const sockets = new Map<string, WebSocket>()
  // Debounce emit per gameId so rapid burst events don't spam callbacks.
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  function entriesFor(gameId: string): LeaderboardEntry[] {
    const bucket = index.get(gameId)
    if (!bucket) return []
    return Array.from(bucket.values())
  }

  function emitGame(gameId: string): void {
    if (disposed) return
    if (pending.has(gameId)) return
    const t = setTimeout(() => {
      pending.delete(gameId)
      if (disposed) return
      const subs = subscribers.get(gameId)
      if (!subs || subs.size === 0) return
      const entries = entriesFor(gameId)
      for (const cb of subs) cb(entries)
    }, 200)
    pending.set(gameId, t)
  }

  function consider(e: ScoreEvent): void {
    const parsed = parseAnyScoreEvent(e)
    if (!parsed) return
    const { gameId, entry } = parsed
    // Store every event (keyed by id) — do NOT collapse to best-per-pubkey here,
    // or the Today board (period-filtered downstream) would only ever show players
    // whose all-time best happens to be today. boardFor() does period reduction.
    let bucket = index.get(gameId)
    if (!bucket) { bucket = new Map(); index.set(gameId, bucket) }
    bucket.set(e.id, entry)
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
      ws.send(JSON.stringify(['REQ', subId, { kinds: [30762], limit: 500 }]))
    }

    ws.onmessage = ev => {
      let msg: unknown
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
      if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[1] === subId && isScoreEvent(msg[2])) {
        consider(msg[2])
      }
    }

    const reconnect = () => {
      if (disposed) return
      connected.delete(url)
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
    subscribe(gameId, onUpdate) {
      let subs = subscribers.get(gameId)
      if (!subs) { subs = new Set(); subscribers.set(gameId, subs) }
      subs.add(onUpdate)
      // Emit current entries immediately (async so caller can set up state first).
      const t = setTimeout(() => { if (!disposed) onUpdate(entriesFor(gameId)) }, 0)
      return () => {
        clearTimeout(t)
        const s = subscribers.get(gameId)
        s?.delete(onUpdate)
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
    subscribe(gameId, onUpdate) {
      if (relays.length === 0) { setTimeout(() => onUpdate([]), 0); return () => {} }

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

      const emit = () => {
        if (closed || pending) return
        pending = setTimeout(() => {
          pending = null; if (closed) return
          onUpdate(Array.from(events.values()))
        }, 200)
      }

      const consider = (e: ScoreEvent) => {
        const parsed = parseAnyScoreEvent(e)
        if (!parsed || parsed.gameId !== gameId) return
        events.set(e.id, parsed.entry); emit()
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
          // Broad filter — no #t — because gamestr.io games tag genres, not game IDs
          ws.send(JSON.stringify(['REQ', subId, { kinds: [30762], limit: 500 }]))
        }

        ws.onmessage = ev => {
          let msg: unknown
          try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
          if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[1] === subId && isScoreEvent(msg[2])) {
            consider(msg[2])
          }
        }

        const reconnect = () => {
          if (closed) return
          connected.delete(url)
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
      }
    },
  }
}
