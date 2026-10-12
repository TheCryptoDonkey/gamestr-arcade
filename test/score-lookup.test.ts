import { afterEach, describe, expect, it, vi } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { lookupScore } from '../src/web/score-lookup'

const event = finalizeEvent({ kind: 30762, created_at: Math.floor(Date.now() / 1000) - 100_000, content: '', tags: [['game', 'pallasite'], ['score', '100']] }, new Uint8Array(32).fill(7))
afterEach(() => vi.unstubAllGlobals())
function relay(reply: unknown) {
  const instances: Socket[] = []
  class Socket {
    onopen?: () => void; onmessage?: (message: { data: string }) => void; onclose?: () => void; onerror?: () => void
    sent: unknown[] = []; close = vi.fn()
    constructor() { instances.push(this); queueMicrotask(() => this.onopen?.()) }
    send(raw: string) { const request = JSON.parse(raw); this.sent.push(request); queueMicrotask(() => { if (reply) this.onmessage?.({ data: JSON.stringify(['EVENT', request[1], reply]) }); this.onmessage?.({ data: JSON.stringify(['EOSE', request[1]]) }) }) }
  }
  vi.stubGlobal('WebSocket', Socket)
  return instances
}

describe('exact score lookup', () => {
  it('finds an older verified event with an ID filter and closes the temporary socket', async () => {
    const sockets = relay(event)
    expect(await lookupScore(event.id, ['wss://test'])).toEqual({ status: 'found', event })
    expect(sockets[0].sent[0]).toEqual(['REQ', expect.any(String), { ids: [event.id], limit: 1 }])
    expect(sockets[0].close).toHaveBeenCalled()
  })
  it('distinguishes an invalid signature or mismatched ID from an absent event', async () => {
    relay({ ...event, content: 'tampered' })
    expect(await lookupScore(event.id, ['wss://test'])).toEqual({ status: 'invalid' })
    relay(event)
    expect(await lookupScore('a'.repeat(64), ['wss://test'])).toEqual({ status: 'invalid' })
    relay(null)
    expect(await lookupScore(event.id, ['wss://test'])).toEqual({ status: 'unavailable' })
  })
})
