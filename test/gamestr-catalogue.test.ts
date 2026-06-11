/**
 * Tests for createGamestrCatalogue:
 *   - broad REQ (no #t filter) sent on open
 *   - events bucketed by their own game tag
 *   - subscriber for gameId=X receives updates only when game X changes
 *   - dispose() closes all sockets
 *   - reconnect keeps the index (no score loss)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createGamestrCatalogue } from '../src/renderer/src/leaderboard/gamestr'
import type { LeaderboardEntry } from '../src/shared/types'

// ── Virtual clock ────────────────────────────────────────────────────────────

function makeVirtualTimers() {
  let now = 0
  let nextId = 1
  const pending = new Map<number, { at: number; cb: () => void }>()
  const fns = {
    setTimeout(cb: () => void, ms: number): number {
      const id = nextId++
      pending.set(id, { at: now + ms, cb })
      return id
    },
    clearTimeout(id: number): void { pending.delete(id) },
    setInterval(_cb: () => void, _ms: number): number { return 0 },
    clearInterval(_id: number): void {},
  }
  function advance(ms: number): void {
    const target = now + ms
    for (;;) {
      let soonest: number | null = null
      for (const [id, t] of pending) {
        if (t.at <= target && (soonest === null || t.at < pending.get(soonest)!.at)) soonest = id
      }
      if (soonest === null) break
      const t = pending.get(soonest)!
      pending.delete(soonest)
      now = t.at
      t.cb()
    }
    now = target
  }
  return { fns, advance }
}

// ── Mock WebSocket ────────────────────────────────────────────────────────────

interface MockWsInstance {
  url: string
  sentMessages: string[]
  onopen: (() => void) | null
  onmessage: ((ev: { data: string }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  readyState: number
  triggerOpen(): void
  triggerMessage(data: string): void
  triggerClose(): void
  close(): void
}

function makeMockWsFactory() {
  const instances: MockWsInstance[] = []
  class MockWebSocket {
    url: string; sentMessages: string[] = []
    onopen: (() => void) | null = null
    onmessage: ((ev: { data: string }) => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    readyState = 0
    constructor(url: string) { this.url = url; instances.push(this as unknown as MockWsInstance) }
    send(msg: string) { this.sentMessages.push(msg) }
    close() { this.readyState = 3 }
    triggerOpen() { this.readyState = 1; this.onopen?.() }
    triggerMessage(data: string) { this.onmessage?.({ data }) }
    triggerClose() { this.readyState = 3; this.onclose?.() }
  }
  return { MockWebSocket: MockWebSocket as unknown as typeof WebSocket, instances }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALICE = 'a'.repeat(64)
const BOB   = 'b'.repeat(64)
const GAME_SERVER = 'f'.repeat(64)

function scoreMsg(subId: string, gameId: string, playerPubkey: string, score: number): string {
  return JSON.stringify(['EVENT', subId, {
    id: `evt-${playerPubkey.slice(0, 4)}-${score}-${gameId}`,
    pubkey: GAME_SERVER,
    kind: 30762,
    created_at: 1_000_000,
    tags: [['game', gameId], ['p', playerPubkey], ['score', String(score)]],
    content: '', sig: 'sig',
  }])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createGamestrCatalogue', () => {
  let clock: ReturnType<typeof makeVirtualTimers>
  let wsFactory: ReturnType<typeof makeMockWsFactory>

  beforeEach(() => {
    clock = makeVirtualTimers()
    wsFactory = makeMockWsFactory()
    vi.stubGlobal('setTimeout', clock.fns.setTimeout)
    vi.stubGlobal('clearTimeout', clock.fns.clearTimeout)
    vi.stubGlobal('WebSocket', wsFactory.MockWebSocket)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('sends a broad REQ with no #t filter on open', () => {
    const cat = createGamestrCatalogue(['wss://relay.test'], 10)
    cat.subscribe('sats-man', () => {})
    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    expect(ws.sentMessages).toHaveLength(1)
    const req = JSON.parse(ws.sentMessages[0]) as unknown[]
    expect(req[0]).toBe('REQ')
    const filter = req[2] as Record<string, unknown>
    expect(filter['#t']).toBeUndefined()
    expect(filter.kinds).toContain(30762)
    cat.dispose()
  })

  it('routes events to the correct game bucket and notifies that game\'s subscriber', () => {
    const cat = createGamestrCatalogue(['wss://relay.test'], 10)
    const satsManupdates: LeaderboardEntry[][] = []
    const pallaUpdates: LeaderboardEntry[][] = []
    cat.subscribe('sats-man', top => satsManupdates.push(top))
    cat.subscribe('pallasite', top => pallaUpdates.push(top))

    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    // Advance past the initial setTimeout(..., 0) emissions from subscribe
    clock.advance(1)
    const satsBeforeScore = satsManupdates.length
    const pallaBeforeScore = pallaUpdates.length

    ws.triggerMessage(scoreMsg(subId, 'sats-man', ALICE, 2290))
    clock.advance(250)

    expect(satsManupdates.length).toBeGreaterThan(satsBeforeScore)
    expect(satsManupdates.at(-1)!.some(e => e.score === 2290)).toBe(true)
    expect(pallaUpdates.length).toBe(pallaBeforeScore)

    cat.dispose()
  })

  it('delivers events for multiple games independently', () => {
    const cat = createGamestrCatalogue(['wss://relay.test'], 10)
    const updates: Record<string, LeaderboardEntry[][]> = { 'sats-man': [], pallasite: [] }
    cat.subscribe('sats-man', top => updates['sats-man'].push(top))
    cat.subscribe('pallasite', top => updates['pallasite'].push(top))

    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    ws.triggerMessage(scoreMsg(subId, 'sats-man', ALICE, 500))
    ws.triggerMessage(scoreMsg(subId, 'pallasite', BOB, 800))
    clock.advance(250)

    expect(updates['sats-man'].at(-1)!.some(e => e.score === 500)).toBe(true)
    expect(updates['pallasite'].at(-1)!.some(e => e.score === 800)).toBe(true)

    cat.dispose()
  })

  it('index survives a reconnect (no score loss across disconnect)', () => {
    const cat = createGamestrCatalogue(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    cat.subscribe('sats-man', top => updates.push(top))

    const ws1 = wsFactory.instances[0]
    ws1.triggerOpen()
    const subId1 = (JSON.parse(ws1.sentMessages[0]) as [string, string])[1]

    ws1.triggerMessage(scoreMsg(subId1, 'sats-man', ALICE, 1000))
    clock.advance(250)
    expect(updates.at(-1)!.some(e => e.pubkey === ALICE && e.score === 1000)).toBe(true)

    ws1.triggerClose()
    clock.advance(3500)

    const ws2 = wsFactory.instances[1]
    ws2.triggerOpen()
    const subId2 = (JSON.parse(ws2.sentMessages[0]) as [string, string])[1]

    ws2.triggerMessage(scoreMsg(subId2, 'sats-man', BOB, 600))
    clock.advance(250)

    const last = updates.at(-1)!
    expect(last.some(e => e.pubkey === ALICE && e.score === 1000)).toBe(true)
    expect(last.some(e => e.pubkey === BOB && e.score === 600)).toBe(true)

    cat.dispose()
  })

  it('dispose() closes all open sockets', () => {
    const cat = createGamestrCatalogue(['wss://relay.a', 'wss://relay.b'], 10)
    cat.subscribe('sats-man', () => {})

    const [ws1, ws2] = wsFactory.instances
    ws1.triggerOpen()
    ws2.triggerOpen()
    expect(ws1.readyState).toBe(1)
    expect(ws2.readyState).toBe(1)

    cat.dispose()

    expect(ws1.readyState).toBe(3)
    expect(ws2.readyState).toBe(3)
  })

  it('unsubscribe stops notifications for that game but does not close sockets', () => {
    const cat = createGamestrCatalogue(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    const unsub = cat.subscribe('sats-man', top => updates.push(top))

    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    ws.triggerMessage(scoreMsg(subId, 'sats-man', ALICE, 100))
    clock.advance(250)
    const countBefore = updates.length
    expect(countBefore).toBeGreaterThanOrEqual(1)

    unsub()

    ws.triggerMessage(scoreMsg(subId, 'sats-man', BOB, 200))
    clock.advance(250)
    expect(updates.length).toBe(countBefore)

    expect(ws.readyState).toBe(1)

    cat.dispose()
  })

  it('onStatus fires down/up on socket drop/reconnect', () => {
    const statusLog: Array<'up' | 'down'> = []
    const cat = createGamestrCatalogue(['wss://relay.test'], 10, { onStatus: s => statusLog.push(s) })
    cat.subscribe('sats-man', () => {})

    const ws1 = wsFactory.instances[0]
    ws1.triggerOpen()
    ws1.triggerClose()
    expect(statusLog).toContain('down')

    clock.advance(3500)
    const ws2 = wsFactory.instances[1]
    ws2.triggerOpen()
    expect(statusLog.at(-1)).toBe('up')

    cat.dispose()
  })
})
