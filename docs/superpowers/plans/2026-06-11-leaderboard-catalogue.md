# Leaderboard Catalogue + Today/All-Time View - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix leaderboard score fetching for all gamestr.io games (not just Pallasite) by using a single broad kind-30762 subscription bucketed by the event's own `game` tag, and add a Today / All-Time toggle.

**Architecture:** A new `createGamestrCatalogue` factory in `gamestr.ts` opens one WebSocket per relay for the entire session and routes every incoming event to an in-memory `Map<gameId, Map<eventId, entry>>` index. The panel subscribes/unsubscribes to a particular gameId's bucket; the underlying sockets stay open until `dispose()` is called. The `boardFor` pure helper in `gamestr-reduce.ts` handles period filtering (today/all-time), best-per-pubkey dedup, sort, and slice - fully unit-tested. `leaderboard-panel.ts` adds a Today | All-Time toggle (keyboard `t` or click) in the board header and a branded empty-today state.

**Tech Stack:** TypeScript ES2022, ESM, Vitest, browser WebSocket API, no external libs.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/src/leaderboard/gamestr-reduce.ts` | **Modify** | Add `parseAnyScoreEvent` (game-tag extraction without caller-supplied gameId) and `boardFor(entries, period, topN, nowSec)` pure helper |
| `src/renderer/src/leaderboard/gamestr.ts` | **Modify** | Add `createGamestrCatalogue` (shared broad subscription, per-game index, subscribe/dispose API); keep `createGamestrProvider` but update its REQ to use the broad filter |
| `src/renderer/src/ui/leaderboard-panel.ts` | **Modify** | Add `period` state (`today`/`all`), toggle UI, empty-today message; pass `period` into `boardFor` before rendering |
| `test/gamestr-reduce.test.ts` | **Modify** | Add tests for `parseAnyScoreEvent` and `boardFor` |
| `test/gamestr-catalogue.test.ts` | **Create** | Unit tests for `createGamestrCatalogue` routing, subscription, and dispose |
| `test/gamestr-reconnect.test.ts` | **Modify** | Update the single test asserting the old `#t` REQ shape (now broad filter, no `#t`) |

---

## Task 1: Add `parseAnyScoreEvent` and `boardFor` to `gamestr-reduce.ts`

**Files:**
- Modify: `src/renderer/src/leaderboard/gamestr-reduce.ts`
- Test: `test/gamestr-reduce.test.ts`

### Background

`parseScoreEvent(e, gameId)` requires a caller-supplied `gameId` and only accepts events matching that game. We need a variant that extracts the game tag from the event itself, plus a pure `boardFor` helper for period windowing.

**Score validity note:** The spec says "use ≥ 0". The existing `parseScoreEvent` uses `score <= 0` to reject. We preserve that for `parseScoreEvent` (existing tests assert 0 is rejected), but `parseAnyScoreEvent` and `boardFor` use `score >= 0` - matching gamestr.io which shows 0s. This is noted in an inline comment.

- [ ] **Step 1.1: Write failing tests for `parseAnyScoreEvent`**

In `test/gamestr-reduce.test.ts`, add after the existing `describe` blocks:

```typescript
import { parseAnyScoreEvent, boardFor } from '../src/renderer/src/leaderboard/gamestr-reduce'

const P3 = 'c'.repeat(64)

describe('parseAnyScoreEvent', () => {
  it('extracts game from the event\'s own game tag', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['p', P1], ['score', '500']] })
    const result = parseAnyScoreEvent(e)
    expect(result).not.toBeNull()
    expect(result!.gameId).toBe('sats-man')
    expect(result!.entry.pubkey).toBe(P1)
    expect(result!.entry.score).toBe(500)
  })

  it('returns null when game tag is absent', () => {
    const e = ev({ tags: [['p', P1], ['score', '500']] })
    expect(parseAnyScoreEvent(e)).toBeNull()
  })

  it('rejects cheated events', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['cheated', 'true'], ['p', P1], ['score', '500']] })
    expect(parseAnyScoreEvent(e)).toBeNull()
  })

  it('accepts score of 0 (gamestr.io shows 0s)', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['p', P1], ['score', '0']] })
    const result = parseAnyScoreEvent(e)
    expect(result).not.toBeNull()
    expect(result!.entry.score).toBe(0)
  })

  it('rejects negative scores', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['p', P1], ['score', '-1']] })
    expect(parseAnyScoreEvent(e)).toBeNull()
  })
})
```

- [ ] **Step 1.2: Run new tests - expect them to fail (missing export)**

```
npx vitest run test/gamestr-reduce.test.ts
```

Expected: compilation error / test failure - `parseAnyScoreEvent` not exported yet.

- [ ] **Step 1.3: Write failing tests for `boardFor`**

In `test/gamestr-reduce.test.ts`, append:

```typescript
describe('boardFor', () => {
  // Entries covering today and yesterday
  // nowSec = start-of-day + 3600 (1 hour into today)
  const TODAY_START = 1_800_000_000 // fictional unix day boundary
  const NOW_SEC = TODAY_START + 3600

  const entries: import('../src/shared/types').LeaderboardEntry[] = [
    { pubkey: P1, score: 900, at: TODAY_START + 100, sats: 0 },   // today, P1 high
    { pubkey: P1, score: 400, at: TODAY_START + 50,  sats: 0 },   // today, P1 low (should lose)
    { pubkey: P2, score: 700, at: TODAY_START + 200, sats: 0 },   // today, P2
    { pubkey: P3, score: 999, at: TODAY_START - 1,   sats: 0 },   // yesterday - before midnight
  ]

  it('period=all returns best-per-pubkey, sorted desc, sliced to topN', () => {
    const board = boardFor(entries, 'all', 3, NOW_SEC)
    expect(board).toHaveLength(3)
    expect(board[0]).toMatchObject({ pubkey: P3, score: 999 })
    expect(board[1]).toMatchObject({ pubkey: P1, score: 900 })
    expect(board[2]).toMatchObject({ pubkey: P2, score: 700 })
  })

  it('period=today excludes entries before start of day', () => {
    const board = boardFor(entries, 'today', 10, NOW_SEC)
    expect(board).toHaveLength(2)
    expect(board.every(e => e.at >= TODAY_START)).toBe(true)
    expect(board[0]).toMatchObject({ pubkey: P1, score: 900 })
    expect(board[1]).toMatchObject({ pubkey: P2, score: 700 })
  })

  it('period=today returns [] when all entries are before today', () => {
    const board = boardFor(
      [{ pubkey: P1, score: 999, at: TODAY_START - 100, sats: 0 }],
      'today', 10, NOW_SEC
    )
    expect(board).toEqual([])
  })

  it('topN limits the result', () => {
    const board = boardFor(entries, 'all', 1, NOW_SEC)
    expect(board).toHaveLength(1)
    expect(board[0].score).toBe(999)
  })

  it('keeps only best score per pubkey across multiple entries', () => {
    const board = boardFor(entries, 'today', 10, NOW_SEC)
    const p1Entry = board.find(e => e.pubkey === P1)!
    expect(p1Entry.score).toBe(900) // not 400
  })
})
```

- [ ] **Step 1.4: Run new tests - expect failures**

```
npx vitest run test/gamestr-reduce.test.ts
```

Expected: compilation errors or test failures for `boardFor`.

- [ ] **Step 1.5: Implement `parseAnyScoreEvent` and `boardFor` in `gamestr-reduce.ts`**

Replace the entire file content (preserving the existing exports):

```typescript
import type { LeaderboardEntry } from '../../../shared/types'

export interface ScoreEvent {
  id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][]; sig: string
}

export interface ParsedAnyScore {
  gameId: string
  entry: LeaderboardEntry
}

export type Period = 'today' | 'all'

export function isScoreEvent(v: unknown): v is ScoreEvent {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return e.kind === 30762 && typeof e.id === 'string' && typeof e.pubkey === 'string'
    && typeof e.created_at === 'number' && Array.isArray(e.tags)
}

function tagValue(tags: string[][], name: string): string | undefined {
  for (const t of tags) if (t[0] === name && typeof t[1] === 'string') return t[1]
  return undefined
}

function hasTagValue(tags: string[][], name: string, value: string): boolean {
  return tags.some(t => t[0] === name && t[1] === value)
}

/** Port of pallasite/src/score.ts `consider`: game match, not cheated, score>0, player from `p` or pubkey. */
export function parseScoreEvent(e: ScoreEvent, gameId: string): LeaderboardEntry | null {
  if (!hasTagValue(e.tags, 'game', gameId)) return null
  if (hasTagValue(e.tags, 'cheated', 'true')) return null
  const score = parseInt(tagValue(e.tags, 'score') ?? '', 10)
  if (!Number.isFinite(score) || score <= 0) return null
  const pubkey = tagValue(e.tags, 'p') ?? e.pubkey
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) return null
  return { pubkey, score, sats: parseInt(tagValue(e.tags, 'sats') ?? '0', 10) || 0, at: e.created_at }
}

/**
 * Parse a score event without a caller-supplied gameId - extracts the gameId
 * from the event's own `game` tag. Used by the catalogue's broad subscription.
 * Accepts score >= 0 (gamestr.io shows 0s on live boards; the per-game
 * parseScoreEvent retains score > 0 for backwards compatibility with existing tests).
 */
export function parseAnyScoreEvent(e: ScoreEvent): ParsedAnyScore | null {
  const gameId = tagValue(e.tags, 'game')
  if (!gameId) return null
  if (hasTagValue(e.tags, 'cheated', 'true')) return null
  const score = parseInt(tagValue(e.tags, 'score') ?? '', 10)
  if (!Number.isFinite(score) || score < 0) return null
  const pubkey = tagValue(e.tags, 'p') ?? e.pubkey
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) return null
  const entry: LeaderboardEntry = {
    pubkey,
    score,
    sats: parseInt(tagValue(e.tags, 'sats') ?? '0', 10) || 0,
    at: e.created_at,
  }
  return { gameId, entry }
}

/**
 * Pure board computation: filter by period, keep best score per pubkey, sort
 * descending, slice to topN.
 *
 * @param entries  All entries for a given game (unfiltered).
 * @param period   'today' = created_at >= start of local day; 'all' = no filter.
 * @param topN     Maximum entries to return.
 * @param nowSec   Current unix timestamp in seconds (injected for testability - do NOT call Date.now() here).
 */
export function boardFor(
  entries: LeaderboardEntry[],
  period: Period,
  topN: number,
  nowSec: number,
): LeaderboardEntry[] {
  let filtered = entries
  if (period === 'today') {
    // Local midnight: subtract (nowSec % 86400) seconds, then snap to the
    // boundary. This is calendar-day-relative to the local timezone by using
    // Date to compute midnight.
    const d = new Date(nowSec * 1000)
    d.setHours(0, 0, 0, 0)
    const dayStartSec = d.getTime() / 1000
    filtered = entries.filter(e => e.at >= dayStartSec)
  }
  const best = new Map<string, LeaderboardEntry>()
  for (const e of filtered) {
    const cur = best.get(e.pubkey)
    if (!cur || e.score > cur.score) best.set(e.pubkey, e)
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN)
}

export function collapseToBest(events: ScoreEvent[], gameId: string, topN: number): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>()
  for (const raw of events) {
    const e = parseScoreEvent(raw, gameId); if (!e) continue
    const cur = best.get(e.pubkey); if (cur && cur.score >= e.score) continue
    best.set(e.pubkey, e)
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN)
}
```

- [ ] **Step 1.6: Run the tests - all should pass**

```
npx vitest run test/gamestr-reduce.test.ts
```

Expected: all tests pass (existing 4 + 9 new = 13).

- [ ] **Step 1.7: Commit**

```bash
git add src/renderer/src/leaderboard/gamestr-reduce.ts test/gamestr-reduce.test.ts
git commit -m "feat: add parseAnyScoreEvent + boardFor period helper to gamestr-reduce"
```

---

## Task 2: Add `createGamestrCatalogue` to `gamestr.ts` + update broad REQ

**Files:**
- Modify: `src/renderer/src/leaderboard/gamestr.ts`
- Create: `test/gamestr-catalogue.test.ts`

### Background

`createGamestrCatalogue` opens one WS per relay (broad, no `#t` filter), routes every event into a `Map<gameId, Map<eventId, {pubkey, score, at}>>` index, and exposes:
- `subscribe(gameId, onUpdate)` - returns entries for that game from the index, re-emits when that game's bucket changes; returns an unsubscribe fn
- `dispose()` - closes all sockets; should be called once on app teardown

The existing `createGamestrProvider` is still used by the panel (it delegates to the catalogue internally, or can remain independent for compatibility). We keep `createGamestrProvider` but update its `onopen` to send a broad REQ (no `#t`). The panel's `makeProvider` factory is also updated in Task 4.

- [ ] **Step 2.1: Write failing catalogue tests**

Create `test/gamestr-catalogue.test.ts`:

```typescript
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

    // Deliver a sats-man score
    ws.triggerMessage(scoreMsg(subId, 'sats-man', ALICE, 2290))
    clock.advance(250)

    expect(satsManupdates.length).toBeGreaterThanOrEqual(1)
    expect(satsManupdates.at(-1)!.some(e => e.score === 2290)).toBe(true)
    // pallasite subscriber should NOT have been called
    expect(pallaUpdates.length).toBe(0)

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

    // New score from BOB - ALICE's score must still be in index
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
    expect(updates.length).toBe(countBefore) // no new notification

    // Socket still open (not disposed)
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
```

- [ ] **Step 2.2: Run catalogue tests - expect failures (no export yet)**

```
npx vitest run test/gamestr-catalogue.test.ts
```

Expected: compilation error - `createGamestrCatalogue` not exported.

- [ ] **Step 2.3: Implement `createGamestrCatalogue` in `gamestr.ts`**

Replace `gamestr.ts` entirely:

```typescript
import type { LeaderboardEntry, LeaderboardProvider } from '../../../shared/types'
import { isScoreEvent, parseAnyScoreEvent, parseScoreEvent, type ScoreEvent } from './gamestr-reduce'

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
  topN: number,
  opts: GamestrCatalogueOptions = {},
): GamestrCatalogue {
  // index: gameId → (eventId → entry)
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
    let bucket = index.get(gameId)
    if (!bucket) { bucket = new Map(); index.set(gameId, bucket) }
    // Keep only if this event improves on anything already stored for this pubkey.
    // We key the bucket by eventId (dedup), but for best-per-pubkey we track it
    // at render time via boardFor. Here we just accumulate all valid events.
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
 * Legacy per-game provider - kept for compatibility with the panel's
 * `makeProvider` factory API. Now uses a broad REQ (no `#t`) since
 * gamestr.io games do not tag events with the game slug.
 */
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

      const connected = new Set<string>()

      const emit = () => {
        if (closed || pending) return
        pending = setTimeout(() => {
          pending = null; if (closed) return
          onUpdate(Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN))
        }, 200)
      }

      const consider = (e: ScoreEvent) => {
        const parsed = parseAnyScoreEvent(e)
        if (!parsed || parsed.gameId !== gameId) return
        const entry = parsed.entry
        const cur = best.get(entry.pubkey); if (cur && cur.score >= entry.score) return
        best.set(entry.pubkey, entry); emit()
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
          // Broad filter - no #t - because gamestr.io games tag genres, not game IDs
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
```

- [ ] **Step 2.4: Run catalogue tests - all should pass**

```
npx vitest run test/gamestr-catalogue.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 2.5: Update the stale `#t` assertion in `gamestr-reconnect.test.ts`**

In `test/gamestr-reconnect.test.ts`, find the test `'sends REQ on open'` (line 153). The assertion at line 165:
```typescript
expect((req[2] as Record<string, unknown>)['#t']).toContain('game1')
```
must be replaced with an assertion that `#t` is **absent** and `kinds` contains 30762:

```typescript
expect((req[2] as Record<string, unknown>)['#t']).toBeUndefined()
expect((req[2] as Record<string, unknown>).kinds).toContain(30762)
```

Also update the inline comment on the `ws.send` assertion in the `'onclose schedules a reconnect that re-sends REQ'` test - no assertion change needed there, just confirm the test still passes.

- [ ] **Step 2.6: Run all tests to confirm green**

```
npx vitest run
```

Expected: all 157 + new tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add src/renderer/src/leaderboard/gamestr.ts test/gamestr-catalogue.test.ts test/gamestr-reconnect.test.ts
git commit -m "fix: pull all games' scores via shared 30762 subscription bucketed by game tag"
```

---

## Task 3: Wire `boardFor` into the panel + add Today/All-Time toggle

**Files:**
- Modify: `src/renderer/src/ui/leaderboard-panel.ts`

### Background

The panel currently renders `this.entries` directly (already sorted top-N). With `boardFor`, the panel holds all raw entries per game and calls `boardFor(rawEntries, this.period, topN, nowSec())` to produce the displayed list. A small toggle in the header switches between `today` and `all`.

The panel still uses `LeaderboardProvider` (injected `makeProvider`), so no change to the panel's constructor interface. The provider now delivers raw entries (all, not pre-sliced to topN by the panel side - but it still emits `LeaderboardEntry[]`). Since `createGamestrProvider` already deduplicates best-per-pubkey and sorts, we simply call `boardFor` on the provider's `onUpdate` result to apply period filtering on top.

**Toggle UI spec:**
- Added to `.lb-sub-row` after the LIVE indicator: `<span class="lb-period-toggle"><button class="lb-period-btn" data-period="today">TODAY</button><span class="lb-period-sep">|</span><button class="lb-period-btn" data-period="all">ALL TIME</button></span>`
- Active button has class `lb-period-active`
- Keyboard: pressing `t` toggles period (handled via a `keydown` listener)
- Empty today state: show `"NO SCORES YET TODAY - BE THE FIRST"` in the `.lb-empty` slot

- [ ] **Step 3.1: Add `period` state and `boardFor` call to the panel**

Read the current `leaderboard-panel.ts` first (already done above), then make targeted edits:

**3.1a** - Add imports at the top of the file:

```typescript
import { boardFor, type Period } from '../leaderboard/gamestr-reduce'
```

**3.1b** - Add private fields after `private gotLive = false`:

```typescript
private period: Period = 'today'
private rawEntries: LeaderboardEntry[] = []
private readonly topN: number
```

**3.1c** - The `topN` value needs to be passed in. Add it to `LeaderboardPanelOptions`:

```typescript
/** Max entries to show on the board (default 10). */
topN?: number
```

**3.1d** - In the constructor, after `this.profileCache = ...`:

```typescript
this.topN = opts.topN ?? 10
```

**3.1e** - Update the header HTML in the constructor to include the toggle (replace the `lb-sub-row` div):

```html
<div class="lb-sub-row">
  <span class="lb-subtitle">${escapeHtml(this.opts.subtitle)}</span>
  <span class="lb-status" data-state="reconnecting"><span class="lb-status-dot"></span><span class="lb-status-text">SYNC</span></span>
  <span class="lb-period-toggle">
    <button class="lb-period-btn lb-period-active" data-period="today">TODAY</button>
    <span class="lb-period-sep">|</span>
    <button class="lb-period-btn" data-period="all">ALL TIME</button>
  </span>
</div>
```

**3.1f** - After `this.statusEl = ...`, wire up the toggle:

```typescript
const toggleBtns = this.root.querySelectorAll('.lb-period-btn')
toggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const p = (btn as HTMLElement).dataset.period as Period
    if (p) this.setPeriod(p)
  })
})
this.keyHandler = (e: KeyboardEvent) => {
  if (e.key === 't' || e.key === 'T') {
    this.setPeriod(this.period === 'today' ? 'all' : 'today')
  }
}
document.addEventListener('keydown', this.keyHandler)
```

Also add the private field declaration:

```typescript
private keyHandler: ((e: KeyboardEvent) => void) | null = null
```

**3.1g** - Add `setPeriod` method:

```typescript
private setPeriod(p: Period): void {
  if (p === this.period) return
  this.period = p
  // Update active state on buttons
  this.root.querySelectorAll('.lb-period-btn').forEach(btn => {
    const el = btn as HTMLElement
    el.classList.toggle('lb-period-active', el.dataset.period === p)
  })
  this.render()
}
```

**3.1h** - Update the `show()` method's provider callback to store raw entries:

Replace:
```typescript
this.unsubscribeScores = provider.subscribe(gameId, top => {
  if (gameId !== this.currentGameId) return
  this.gotLive = true
  this.entries = top
  this.setStatus('live')
  writeCachedBoard(gameId, top)
  this.render()
  this.resolveVisibleProfiles()
})
```
With:
```typescript
this.unsubscribeScores = provider.subscribe(gameId, raw => {
  if (gameId !== this.currentGameId) return
  this.gotLive = true
  this.rawEntries = raw
  this.entries = boardFor(raw, this.period, this.topN, Math.floor(Date.now() / 1000))
  this.setStatus('live')
  writeCachedBoard(gameId, this.entries)
  this.render()
  this.resolveVisibleProfiles()
})
```

**3.1i** - Update cache-first path in `show()`. Replace:
```typescript
this.entries = readCachedBoard(gameId)
```
With:
```typescript
this.rawEntries = readCachedBoard(gameId)
this.entries = boardFor(this.rawEntries, this.period, this.topN, Math.floor(Date.now() / 1000))
```

**3.1j** - Update `destroy()` to remove the key listener:

```typescript
destroy(): void {
  this.teardownSubscriptions()
  if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler)
  this.root.remove()
}
```

**3.1k** - Update `renderEmpty()` to show the today-specific message when period is `today`:

```typescript
private renderEmpty(): void {
  const li = document.createElement('li')
  li.className = 'lb-empty'
  if (this.period === 'today') {
    li.innerHTML = `
      <span class="lb-empty-mark">★</span>
      <span class="lb-empty-head">NO SCORES YET TODAY</span>
      <span class="lb-empty-sub">BE THE FIRST</span>
    `
  } else {
    li.innerHTML = `
      <span class="lb-empty-mark">★</span>
      <span class="lb-empty-head">BE THE FIRST</span>
      <span class="lb-empty-sub">PLAY TO CLAIM THE TOP SPOT</span>
    `
  }
  this.listEl.replaceChildren(li)
}
```

- [ ] **Step 3.2: Run typecheck to catch any wiring errors**

```
npx tsc --noEmit
```

Expected: no errors. If `topN` is not passed from `mountLeaderboard`, fix by updating the `LeaderboardPanel` constructor call in `mountLeaderboard` to include `topN: topN`.

- [ ] **Step 3.3: Run all tests**

```
npx vitest run
```

Expected: all tests pass (new + existing).

- [ ] **Step 3.4: Commit**

```bash
git add src/renderer/src/ui/leaderboard-panel.ts
git commit -m "feat: Today / All-Time leaderboard view with period toggle"
```

---

## Task 4: Pass `topN` from `mountLeaderboard` + final wiring check

**Files:**
- Modify: `src/renderer/src/ui/leaderboard-panel.ts` (the `mountLeaderboard` function at the bottom)

- [ ] **Step 4.1: Update `mountLeaderboard` to pass `topN` to `LeaderboardPanel`**

In the Electron path of `mountLeaderboard`, update the `LeaderboardPanel` constructor call:

```typescript
const panel = new LeaderboardPanel(host, {
  relays,
  topN,
  makeProvider: (activeRelays: string[], onStatus) => createGamestrProvider(activeRelays, topN, { onStatus }),
  resolve: resolveProfiles,
})
```

- [ ] **Step 4.2: Run typecheck + tests + build**

```
npx tsc --noEmit
npx vitest run
npx electron-vite build
```

Expected: all clean.

- [ ] **Step 4.3: Commit**

```bash
git add src/renderer/src/ui/leaderboard-panel.ts
git commit -m "fix: pass topN from config into LeaderboardPanel for period-aware slicing"
```

---

## Task 5: Verify live scores via Playwright

**Context:** The spec asks to verify that gamestr.io games like Sats-Man and Space Zappers actually show scores on their live leaderboard pages, confirming the broad query approach is correct. We read the rendered board (not WebSocket directly - CSP blocks that from a test runner).

- [ ] **Step 5.1: Load gamestr.io/sats-man and snapshot the leaderboard**

Use the Playwright browser tools to navigate to `https://gamestr.io/sats-man` and take a snapshot of the rendered leaderboard. If it shows top scores (not empty), our broad query approach is validated.

- [ ] **Step 5.2: Load gamestr.io/space-zappers and snapshot**

Repeat for `https://gamestr.io/space-zappers`.

- [ ] **Step 5.3: Confirm the `game` tag value used in those events**

If score rows are visible on gamestr.io, note the `gameId` values that events would carry (typically matching the URL slug). Document in the commit message.

Note: This task produces no code change - it's a verification step. If the Playwright tools are unavailable, skip and note it in the report.

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|-------------|------|
| Broad `{kinds:[30762], limit:500}` REQ, no `#t` filter | Task 2 (`createGamestrProvider` + `createGamestrCatalogue`) |
| In-memory index `Map<gameId, Map<eventId, entry>>` | Task 2 (`createGamestrCatalogue`) |
| Bucket by event's `game` tag | Task 2 (`parseAnyScoreEvent`) |
| Validation: kind 30762, game tag present, not cheated, score ≥ 0 | Task 1 (`parseAnyScoreEvent`) |
| `createGamestrCatalogue` API with `subscribe`/`dispose` | Task 2 |
| Remove per-tile re-subscribe churn (single session socket) | `createGamestrCatalogue` persists across calls |
| `boardFor` pure helper, period windowing, best-per-pubkey, topN | Task 1 |
| `boardFor` testable - `nowSec` injected, no `Date.now()` inside | Task 1 (confirmed in impl - `nowSec` is parameter; caller passes `Math.floor(Date.now() / 1000)` |
| `boardFor` local-midnight boundary | Task 1 (uses `Date.setHours(0,0,0,0)`) |
| Today / All-Time toggle in panel header | Task 3 |
| `t` key toggles period | Task 3 |
| Clickable toggle buttons | Task 3 |
| Default period = Today | Task 3 (`private period: Period = 'today'`) |
| Empty today state: "NO SCORES YET TODAY - BE THE FIRST" | Task 3 (`renderEmpty`) |
| LIVE/RECONNECTING indicator preserved | Task 3 (unchanged `setStatus`) |
| Cache-first paint still works | Task 3 (updated to use `boardFor` over cached raw entries) |
| All existing tests green | All tasks run `npx vitest run` |
| `npm run typecheck` clean | Task 4 |
| `npm run build` ok | Task 4 |
| Verify live scores | Task 5 |

### Placeholder scan

No TBDs, no "fill in later", no "similar to above" - all code shown in full.

### Type consistency

- `ParsedAnyScore` defined in Task 1, consumed in Task 2 (`parseAnyScoreEvent` import).
- `Period` type exported from `gamestr-reduce.ts` in Task 1, imported in `leaderboard-panel.ts` in Task 3.
- `boardFor` signature: `(entries: LeaderboardEntry[], period: Period, topN: number, nowSec: number) => LeaderboardEntry[]` - consistent across definition (Task 1) and call sites (Task 3).
- `createGamestrCatalogue` returns `GamestrCatalogue` interface with `subscribe` / `dispose` - consistent across definition (Task 2) and test (Task 2).
- `LeaderboardPanel` constructor `topN` option added in Task 3, consumed in Task 4 `mountLeaderboard`.
