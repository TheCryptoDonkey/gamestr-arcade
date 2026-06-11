import type { LeaderboardEntry, LeaderboardProvider } from '../../../shared/types'
import { isScoreEvent, parseScoreEvent, type ScoreEvent } from './gamestr-reduce'

/** Optional callbacks for external status monitoring. */
export interface GamestrProviderOptions {
  /**
   * Called with `'down'` when ALL relay sockets have dropped and with `'up'`
   * when at least one socket reconnects. Use this to show a LIVE/RECONNECTING
   * indicator in the leaderboard panel.
   */
  onStatus?: (state: 'up' | 'down') => void
}

/** Capped jittered backoff: starts at ~2 s, caps at 30 s. */
function nextBackoffMs(attempt: number): number {
  const base = Math.min(2000 * Math.pow(1.5, attempt), 30_000)
  // ±25 % jitter so multiple sockets don't all reconnect simultaneously.
  return base * (0.75 + Math.random() * 0.5)
}

export function createGamestrProvider(
  relays: string[],
  topN: number,
  opts: GamestrProviderOptions = {},
): LeaderboardProvider {
  return {
    subscribe(gameId, onUpdate) {
      if (relays.length === 0) { setTimeout(() => onUpdate([]), 0); return () => {} }

      const best = new Map<string, LeaderboardEntry>()
      let closed = false
      let pending: ReturnType<typeof setTimeout> | null = null

      // Track per-relay connection state so we can tell the caller when ALL are
      // down (for the LIVE indicator) vs at least one is up.
      const connected = new Set<string>()

      const emit = () => {
        if (closed || pending) return
        pending = setTimeout(() => {
          pending = null; if (closed) return
          onUpdate(Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN))
        }, 200)
      }

      const consider = (e: ScoreEvent) => {
        const entry = parseScoreEvent(e, gameId); if (!entry) return
        const cur = best.get(entry.pubkey); if (cur && cur.score >= entry.score) return
        best.set(entry.pubkey, entry); emit()
      }

      // Per-relay connection handles (current socket + reconnect timer).
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
          // Fire 'up' when the first socket reconnects after a full outage.
          if (connected.size === 1) opts.onStatus?.('up')
          ws.send(JSON.stringify(['REQ', subId, { kinds: [30762], '#t': [gameId], limit: 200 }]))
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
        ws.onerror = () => {
          // onerror always precedes onclose; let onclose drive the reconnect.
          // We only need to clear connected here in case onclose doesn't fire.
        }
      }

      // Initial connections.
      for (const url of relays) {
        connectRelay(url, 0)
      }

      return () => {
        closed = true
        if (pending) clearTimeout(pending)
        // Cancel all pending reconnect timers.
        for (const t of relayTimers.values()) clearTimeout(t)
        relayTimers.clear()
        // Close any open sockets so navigating between tiles / attract-mode
        // auto-advance doesn't leak a WebSocket per relay on every change.
        for (const ws of sockets.values()) { try { ws.close() } catch { /* ignore */ } }
        sockets.clear()
      }
    },
  }
}
