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
import { finalizeEvent } from 'nostr-tools/pure'
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
const SCORE_KEY = new Uint8Array(32).fill(9)
const NOW = Math.floor(Date.now() / 1000)

/** A cryptographically valid score event for the requested game/schema. */
function makeScoreEvent(
  subId: string,
  _pubkey: string,
  playerPubkey: string,
  score: number,
  gameId: string,
  opts: { kind?: 30762 | 5555; field?: string; createdAt?: number } = {},
) {
  const kind = opts.kind ?? 30762
  const field = opts.field ?? 'score'
  const event = finalizeEvent({
    kind,
    created_at: opts.createdAt ?? NOW,
    tags: [
      ['game', gameId],
      ['p', playerPubkey],
      [field, String(score)],
    ],
    content: '',
  }, SCORE_KEY)
  return JSON.stringify([
    'EVENT',
    subId,
    event,
  ])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createGamestrProvider - reconnect', () => {
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
    expect((req[2] as Record<string, unknown>)['#t']).toBeUndefined()
    expect((req[2] as Record<string, unknown>).kinds).toContain(30762)
  })

  it('accepts only signature-valid events', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    provider.subscribe('game1', top => updates.push(top))
    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    const tampered = JSON.parse(makeScoreEvent(subId, '', ALICE, 100, 'game1')) as ['EVENT', string, { tags: string[][] }]
    tampered[2].tags.find(tag => tag[0] === 'score')![1] = '999'
    ws.triggerMessage(JSON.stringify(tampered))

    const badSignature = JSON.parse(makeScoreEvent(subId, '', ALICE, 100, 'game1')) as ['EVENT', string, { sig: string }]
    badSignature[2].sig = '0'.repeat(128)
    ws.triggerMessage(JSON.stringify(badSignature))
    clock.advance(250)
    expect(updates).toEqual([])

    ws.triggerMessage(makeScoreEvent(subId, '', ALICE, 100, 'game1'))
    clock.advance(250)
    expect(updates.at(-1)).toEqual([expect.objectContaining({ pubkey: ALICE, score: 100 })])
  })

  it('uses only the configured score kind and schema', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    provider.subscribe('word5', top => updates.push(top), { kind: 5555, field: 'streak' })
    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const req = JSON.parse(ws.sentMessages[0]) as [string, string, { kinds: number[] }]
    const subId = req[1]
    expect(req[2].kinds).toEqual([5555])

    ws.triggerMessage(makeScoreEvent(subId, '', ALICE, 900, 'word5'))
    ws.triggerMessage(makeScoreEvent(subId, '', BOB, 7, 'word5', { kind: 5555, field: 'streak' }))
    clock.advance(250)

    expect(updates.at(-1)).toEqual([expect.objectContaining({ pubkey: BOB, score: 7 })])
  })

  it('emits [] on EOSE so a healthy empty query can become synced', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    provider.subscribe('empty-game', top => updates.push(top))
    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    ws.triggerMessage(JSON.stringify(['EOSE', subId]))
    clock.advance(250)

    expect(updates).toEqual([[]])
  })

  it('caps retained state and keeps the newest verified score events', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10, { maxEvents: 2 })
    const updates: LeaderboardEntry[][] = []
    provider.subscribe('game1', top => updates.push(top))
    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    ws.triggerMessage(makeScoreEvent(subId, '', ALICE, 10, 'game1', { createdAt: NOW - 2 }))
    ws.triggerMessage(makeScoreEvent(subId, '', BOB, 20, 'game1', { createdAt: NOW }))
    ws.triggerMessage(makeScoreEvent(subId, '', ALICE, 30, 'game1', { createdAt: NOW - 1 }))
    clock.advance(250)

    expect(updates.at(-1)!.map(entry => entry.score).sort((a, b) => a - b)).toEqual([20, 30])
  })

  it('keeps every score per player (no best-collapse) so Today can reduce', () => {
    // Regression: the provider used to keep only each pubkey's all-time best,
    // which broke the Today board - a player's older higher score hid today's
    // lower one. It must now emit every event; boardFor() does period reduction.
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    const updates: LeaderboardEntry[][] = []
    provider.subscribe('game1', top => updates.push(top))

    const ws = wsFactory.instances[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    ws.triggerMessage(makeScoreEvent(subId, 'f'.repeat(64), ALICE, 500, 'game1'))
    ws.triggerMessage(makeScoreEvent(subId, 'f'.repeat(64), ALICE, 300, 'game1'))
    clock.advance(250)

    const last = updates.at(-1)!
    const aliceScores = last.filter(e => e.pubkey === ALICE).map(e => e.score).sort((a, b) => a - b)
    expect(aliceScores).toEqual([300, 500])
  })

  it('onclose schedules a reconnect that re-sends REQ', () => {
    const provider = createGamestrProvider(['wss://relay.test'], 10)
    provider.subscribe('game1', () => {})

    const ws1 = wsFactory.instances[0]
    ws1.triggerOpen()
    expect(ws1.sentMessages).toHaveLength(1)

    // Simulate relay disconnect.
    ws1.triggerClose()

    // A reconnect should be scheduled - not immediate.
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

    // Advance well past the reconnect delay - no new socket created.
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

    // Deliver a score from BOB - ALICE's score must still be in the map.
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

    // No status yet - connected.
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

    // Every open socket must be closed - otherwise navigating tiles and
    // attract-mode auto-advance leak a WebSocket per relay on each change.
    expect(ws1.readyState).toBe(3)
    expect(ws2.readyState).toBe(3)
  })
})
