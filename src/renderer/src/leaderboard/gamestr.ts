import type { LeaderboardEntry, LeaderboardProvider } from '../../../shared/types'
import { isScoreEvent, parseScoreEvent, type ScoreEvent } from './gamestr-reduce'

export function createGamestrProvider(relays: string[], topN: number): LeaderboardProvider {
  return {
    subscribe(gameId, onUpdate) {
      if (relays.length === 0) { setTimeout(() => onUpdate([]), 0); return () => {} }
      const sockets: WebSocket[] = []
      const best = new Map<string, LeaderboardEntry>()
      let closed = false, pending: ReturnType<typeof setTimeout> | null = null
      const tHints = [gameId]
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
      for (const url of relays) {
        let ws: WebSocket; try { ws = new WebSocket(url) } catch { continue }
        sockets.push(ws)
        const subId = 'lb' + Math.random().toString(36).slice(2, 10)
        ws.onopen = () => ws.send(JSON.stringify(['REQ', subId, { kinds: [30762], '#t': tHints, limit: 200 }]))
        ws.onmessage = ev => {
          let msg: unknown; try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
          if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[1] === subId && isScoreEvent(msg[2])) consider(msg[2])
        }
        ws.onerror = () => {}
      }
      return () => { closed = true; if (pending) clearTimeout(pending); sockets.forEach(s => { try { s.close() } catch {} }) }
    }
  }
}
