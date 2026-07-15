/**
 * gamestr-arcade - live-game detector (decentralised discovery).
 *
 * Opens a broad score subscription (kinds 30762 + 5555, no `#t`) across the
 * enabled relays and collects the distinct `game` tag values seen, with a rough
 * activity count and last-seen time. This lets the games panel:
 *   - badge which catalogue games are actually being played right now, and
 *   - surface games that are live on the network but have no gamestr catalogue
 *     entry at all (e.g. "the-bubble-is-real").
 *
 * gamestr.io's own boards use kind 5555 (`#t:<slug>`); our games + pallasite
 * publish kind 30762 (`game` tag). We subscribe to both and key on the `game`
 * tag, which is the canonical identifier in the score schema.
 *
 * Lazy: created when the panel opens, disposed when it closes - no always-on
 * sockets beyond the leaderboard's own.
 */

export interface DetectedGame {
  gameId: string
  genres: string[]
  count: number
  /** Most recent score `created_at`, unix seconds. */
  lastAt: number
}

export interface GameDetector {
  /** Subscribe to detected-game updates. Fires immediately, then on change. */
  onUpdate(cb: (games: Map<string, DetectedGame>) => void): () => void
  dispose(): void
}

const SCORE_KINDS = [30762, 5555]

function tagValue(tags: string[][], name: string): string | undefined {
  for (const t of tags) if (t[0] === name && typeof t[1] === 'string') return t[1]
  return undefined
}

export function createGameDetector(relays: string[]): GameDetector {
  const games = new Map<string, DetectedGame>()
  const listeners = new Set<(g: Map<string, DetectedGame>) => void>()
  const sockets: WebSocket[] = []
  let disposed = false
  let pending: ReturnType<typeof setTimeout> | null = null

  const emit = (): void => {
    if (disposed || pending) return
    pending = setTimeout(() => {
      pending = null
      if (!disposed) for (const cb of listeners) cb(games)
    }, 200)
  }

  const consider = (e: { tags: string[][]; created_at: number }): void => {
    const gameId = tagValue(e.tags, 'game')
    if (!gameId) return
    // `t` tags carry both the game slug and genres; drop the slug, keep genres.
    const genres = e.tags
      .filter(t => t[0] === 't' && typeof t[1] === 'string' && t[1] !== gameId)
      .map(t => t[1])
    const cur = games.get(gameId)
    if (cur) {
      cur.count++
      if (e.created_at > cur.lastAt) cur.lastAt = e.created_at
      for (const g of genres) if (!cur.genres.includes(g)) cur.genres.push(g)
    } else {
      games.set(gameId, { gameId, genres: [...new Set(genres)], count: 1, lastAt: e.created_at })
    }
    emit()
  }

  for (const url of relays) {
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      continue
    }
    sockets.push(ws)
    const subId = 'dt' + Math.random().toString(36).slice(2, 10)
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(['REQ', subId, { kinds: SCORE_KINDS, limit: 500 }]))
      } catch {
        /* socket raced closed */
      }
    }
    ws.onmessage = ev => {
      let msg: unknown
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
      } catch {
        return
      }
      if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[1] === subId) {
        const e = msg[2] as { tags?: unknown; created_at?: unknown }
        if (e && Array.isArray(e.tags) && typeof e.created_at === 'number') {
          consider({ tags: e.tags as string[][], created_at: e.created_at })
        }
      }
    }
    ws.onerror = () => {
      /* reconnection isn't worth it for a transient operator panel */
    }
  }

  return {
    onUpdate(cb) {
      listeners.add(cb)
      const t = setTimeout(() => {
        if (!disposed) cb(games)
      }, 0)
      return () => {
        clearTimeout(t)
        listeners.delete(cb)
      }
    },
    dispose() {
      disposed = true
      if (pending) clearTimeout(pending)
      for (const ws of sockets) {
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      }
      listeners.clear()
    },
  }
}
