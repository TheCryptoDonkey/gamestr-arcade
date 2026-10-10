import { verifyEvent } from 'nostr-tools/pure'
import { isScoreEvent, type ScoreEvent } from '../renderer/src/leaderboard/gamestr-reduce'

export type ScoreLookup = { status: 'found'; event: ScoreEvent } | { status: 'unavailable' | 'invalid' }

/** Query an exact score independently of the bounded catalogue subscription. */
export async function lookupScore(id: string, relays: string[], timeoutMs = 8_000): Promise<ScoreLookup> {
  if (!/^[0-9a-f]{64}$/.test(id)) return { status: 'invalid' }
  const urls = [...new Set(relays)].filter(url => url.startsWith('wss://')).slice(0, 6)
  const results = await Promise.all(urls.map(url => new Promise<ScoreLookup>(resolve => {
    let socket: WebSocket | undefined
    let settled = false
    let invalid = false
    const subscription = `score-${crypto.randomUUID()}`
    const finish = (result: ScoreLookup) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket?.close() } catch { /* best effort */ }
      resolve(result)
    }
    const timer = setTimeout(() => finish({ status: invalid ? 'invalid' : 'unavailable' }), timeoutMs)
    try {
      socket = new WebSocket(url)
      socket.onopen = () => socket!.send(JSON.stringify(['REQ', subscription, { ids: [id], limit: 1 }]))
      socket.onmessage = message => {
        let data: unknown
        try { data = JSON.parse(typeof message.data === 'string' ? message.data : '') } catch { return }
        if (!Array.isArray(data) || data[1] !== subscription) return
        if (data[0] === 'EOSE') finish({ status: invalid ? 'invalid' : 'unavailable' })
        if (data[0] !== 'EVENT') return
        if (!isScoreEvent(data[2]) || data[2].id !== id || !verifyEvent(data[2])) { invalid = true; return }
        finish({ status: 'found', event: data[2] })
      }
      socket.onerror = () => finish({ status: invalid ? 'invalid' : 'unavailable' })
      socket.onclose = () => finish({ status: invalid ? 'invalid' : 'unavailable' })
    } catch { finish({ status: 'unavailable' }) }
  })))
  return results.find(result => result.status === 'found') ?? { status: results.some(result => result.status === 'invalid') ? 'invalid' : 'unavailable' }
}
