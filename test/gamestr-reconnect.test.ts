/**
 * Tests for the WebSocket reconnect logic in createGamestrProvider.
 *
 * Uses a mock WebSocket class injected via the module's exported factory so
 * we never touch the real browser WebSocket.
 *
 * Covers:
 *   - onclose schedules a reconnect that re-sends the REQ
 *   - unsubscribe() cancels pending reconnects
 *   - best-score map survives a reconnect (no score loss)
 *   - all-sockets-down onStatus callback fires on drop and clears on reconnect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createGamestrProvider } from '../src/renderer/src/leaderboard/gamestr'
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
    clearTimeout(id: number): void {
      pending.delete(id)
    },
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
  function pendingCount() { return pending.size }
  return { fns, advance, pendingCount }
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
    url: string
    sentMessages: string[] = []
    onopen: (() => void) | null = null
    onmessage: ((ev: { data: string }) => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    readyState = 0 // CONNECTING

    constructor(url: string) {
      this.url = url
      instances.push(this as unknown as MockWsInstance)
    }

    send(msg: string) { this.sentMessages.push(msg) }
    close() { this.readyState = 3 } // CLOSED

    triggerOpen() {
      this.readyState = 1
      this.onopen?.()
    }
    triggerMessage(data: string) {
      this.onmessage?.({ data })
    }
    triggerClose() {
      this.readyState = 3
      this.onclose?.()
    }
  }

  return { MockWebSocket: MockWebSocket as unknown as typeof WebSocket, instances }
}

// ── Test helpers ──────────────────────────────────────────────────────────────

// Valid 64-char hex pubkeys for test players.
const ALICE = 'a'.repeat(64)
const BOB   = 'b'.repeat(64)

/** A minimal valid kind-30762 score event for gameId "game1". */
function makeScoreEvent(subId: string, pubkey: string, playerPubkey: string, score: number, gameId: string) {
  return JSON.stringify([
    'EVENT',
    subId,
    {
      id: `evt-${playerPubkey.slice(0, 8)}-${score}`,
      pubkey, // game server pubkey (any hex string is fine for isScoreEvent)
      kind: 30762,
      created_at: 1000,
      tags: [
        ['game', gameId],
        ['p', playerPubkey],
        ['score', String(score)],
      ],
      content: '',
      sig: 'fakesig',
    },
  ])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createGamestrProvider — reconnect', () => {
  let clock: ReturnType<typeof makeVirtualTimers>
  let wsFactory: ReturnType<typeof makeMockWsFactory>

  beforeEach(() => {
    clock = makeVirtualTimers()
    wsFactory = makeMockWsFactory()
    // Patch global timer functions for this test.
    vi.stubGlobal('setTimeout', clock.fns.setTimeout)
    vi.stubGlobal('clearTimeout', clock.fns.clearTimeout)
    vi.stubGlobal('WebSocket', wsFactory.MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends REQ on open', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    provider.subscribe('game1', top => updates.push(top))

    const ws = wsFactory.instances[0]
    expect(ws).toBeDefined()
    ws.triggerOpen()
    expect(ws.sentMessages).toHaveLength(1)
    const req = JSON.parse(ws.sentMessages[0]) as unknown[]
    expect(req[0]).toBe('REQ')
    expect((req[2] as Record<string, unknown>)['#t']).toContain('game1')
  })

  it('onclose schedules a reconnect that re-sends REQ', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    provider.subscribe('game1', () => {})

    const ws1 = wsFactory.instances[0]
    ws1.triggerOpen()
    expect(ws1.sentMessages).toHaveLength(1)

    // Simulate relay disconnect.
    ws1.triggerClose()

    // A reconnect should be scheduled — not immediate.
    const countBefore = wsFactory.instances.length
    expect(countBefore).toBe(1) // not yet reconnected

    // Advance past the maximum jittered backoff (~2.5 s for attempt 0).
    clock.advance(3500)

    // A new socket should have been created.
    expect(wsFactory.instances.length).toBe(2)
    const ws2 = wsFactory.instances[1]
    ws2.triggerOpen()
    expect(ws2.sentMessages).toHaveLength(1)
    const req = JSON.parse(ws2.sentMessages[0]) as unknown[]
    expect(req[0]).toBe('REQ')
  })

  it('unsubscribe() cancels a pending reconnect timer', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    const unsub = provider.subscribe('game1', () => {})

    const ws1 = wsFactory.instances[0]
    ws1.triggerOpen()
    ws1.triggerClose()

    // Before the reconnect fires, unsubscribe.
    const timersBefore = clock.pendingCount()
    unsub()

    // Pending timers should be cleared.
    expect(clock.pendingCount()).toBeLessThan(timersBefore)

    // Advance well past the reconnect delay — no new socket created.
    clock.advance(60_000)
    expect(wsFactory.instances.length).toBe(1)
  })

  it('best-score map survives a reconnect (no score loss)', () => {
    const GAME_SERVER = 'f'.repeat(64) // game server pubkey (just needs to be hex)
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    const unsub = provider.subscribe('game1', top => updates.push(top))

    const ws1 = wsFactory.instances[0]
    ws1.triggerOpen()

    // Peek at the REQ to get the real subId.
    const req1 = JSON.parse(ws1.sentMessages[0]) as [string, string, unknown]
    const subId = req1[1]

    // Deliver a score from ALICE.
    ws1.triggerMessage(makeScoreEvent(subId, GAME_SERVER, ALICE, 500, 'game1'))

    // Wait for the 200ms debounce.
    clock.advance(250)
    expect(updates.length).toBeGreaterThanOrEqual(1)
    expect(updates.at(-1)!.some(e => e.pubkey === ALICE && e.score === 500)).toBe(true)

    // Relay drops.
    ws1.triggerClose()
    clock.advance(3500) // reconnect fires (max jitter ~2.5 s for attempt 0)

    // New socket opens.
    const ws2 = wsFactory.instances[1]
    ws2.triggerOpen()

    // Deliver a score from BOB — ALICE's score must still be in the map.
    const req2 = JSON.parse(ws2.sentMessages[0]) as [string, string, unknown]
    const subId2 = req2[1]
    ws2.triggerMessage(makeScoreEvent(subId2, GAME_SERVER, BOB, 300, 'game1'))
    clock.advance(250)

    const lastUpdate = updates.at(-1)!
    expect(lastUpdate.some(e => e.pubkey === ALICE && e.score === 500)).toBe(true)
    expect(lastUpdate.some(e => e.pubkey === BOB && e.score === 300)).toBe(true)

    unsub()
  })

  it('onStatus callback fires with "down" on close and "up" on reconnect', () => {
    const statusLog: Array<'up' | 'down'> = []
    const provider = createGamestrProvider(['wss://relay.test'], 10, { onStatus: s => statusLog.push(s) })
    const unsub = provider.subscribe('game1', () => {})

    const ws1 = wsFactory.instances[0]
    ws1.triggerOpen()

    // No status yet — connected.
    ws1.triggerClose()
    expect(statusLog).toContain('down')

    // After reconnect and reopen, should go back to 'up'.
    clock.advance(3500)
    const ws2 = wsFactory.instances[1]
    ws2.triggerOpen()
    expect(statusLog.at(-1)).toBe('up')

    unsub()
  })

  it('unsubscribe() closes open sockets so re-subscribe does not leak a connection', () => {
    const provider = createGamestrProvider(['wss://relay.a', 'wss://relay.b'], 10)
    const unsub = provider.subscribe('game1', () => {})

    const ws1 = wsFactory.instances[0]
    const ws2 = wsFactory.instances[1]
    ws1.triggerOpen()
    ws2.triggerOpen()
    expect(ws1.readyState).toBe(1)
    expect(ws2.readyState).toBe(1)

    unsub()

    // Every open socket must be closed — otherwise navigating tiles and
    // attract-mode auto-advance leak a WebSocket per relay on each change.
    expect(ws1.readyState).toBe(3)
    expect(ws2.readyState).toBe(3)
  })
})
