/**
 * Tests for local session stats - the HOT TONIGHT engine.
 *
 * All storage and time are injected: a virtual cabinet, a virtual evening.
 */

import { describe, it, expect } from 'vitest'
import {
  recordSession,
  statsFor,
  hottestTonight,
  HOT_WINDOW_MS,
  MIN_SESSION_MS,
} from '../src/renderer/src/session-stats'

function makeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>()
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

const T0 = 1_800_000_000_000 // a fixed virtual "tonight"
const MIN = MIN_SESSION_MS

describe('session stats', () => {
  it('records real sessions and ignores bounces', () => {
    const storage = makeStorage()
    recordSession('pallasite', MIN + 1000, { storage, now: () => T0 })
    recordSession('pallasite', 5_000, { storage, now: () => T0 + 1 }) // bounce
    const stats = statsFor('pallasite', { storage })
    expect(stats?.plays).toBe(1)
    expect(stats?.totalMs).toBe(MIN + 1000)
    expect(stats?.lastPlayedAt).toBe(T0)
  })

  it('needs at least two windowed plays before anything is hot', () => {
    const storage = makeStorage()
    recordSession('pallasite', MIN, { storage, now: () => T0 })
    expect(hottestTonight({ storage, now: () => T0 + 1000 })).toBeNull()
    recordSession('pallasite', MIN, { storage, now: () => T0 + 2000 })
    expect(hottestTonight({ storage, now: () => T0 + 3000 })).toEqual({ gameId: 'pallasite', plays: 2 })
  })

  it('crowns the most-played game and dethrones it when another overtakes', () => {
    const storage = makeStorage()
    const play = (id: string, at: number) => recordSession(id, MIN, { storage, now: () => at })
    play('pallasite', T0)
    play('pallasite', T0 + 1000)
    play('word5', T0 + 2000)
    expect(hottestTonight({ storage, now: () => T0 + 3000 })?.gameId).toBe('pallasite')
    play('word5', T0 + 4000)
    play('word5', T0 + 5000)
    expect(hottestTonight({ storage, now: () => T0 + 6000 })).toEqual({ gameId: 'word5', plays: 3 })
  })

  it('plays age out of the hot window - yesterday is not tonight', () => {
    const storage = makeStorage()
    recordSession('pallasite', MIN, { storage, now: () => T0 })
    recordSession('pallasite', MIN, { storage, now: () => T0 + 1000 })
    expect(hottestTonight({ storage, now: () => T0 + 2000 })?.gameId).toBe('pallasite')
    // Far side of the window: the badge must not linger.
    expect(hottestTonight({ storage, now: () => T0 + HOT_WINDOW_MS + 60_000 })).toBeNull()
    // All-time stats survive even when heat fades.
    expect(statsFor('pallasite', { storage })?.plays).toBe(2)
  })

  it('survives corrupt storage', () => {
    const storage = makeStorage()
    storage.setItem('arcade-session-stats-v1', '{not json')
    expect(hottestTonight({ storage, now: () => T0 })).toBeNull()
    recordSession('pallasite', MIN, { storage, now: () => T0 })
    expect(statsFor('pallasite', { storage })?.plays).toBe(1)
  })
})
