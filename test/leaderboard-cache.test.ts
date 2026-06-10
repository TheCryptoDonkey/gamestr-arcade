import { describe, it, expect } from 'vitest'
import { readCachedBoard, writeCachedBoard, clearCachedBoard, type KeyValueStore } from '../src/renderer/src/leaderboard/cache'
import type { LeaderboardEntry } from '../src/shared/types'

/** A tiny in-memory localStorage stand-in (no DOM, no jsdom). */
function makeStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  }
}

const BOARD: LeaderboardEntry[] = [
  { pubkey: 'a'.repeat(64), name: 'alice', score: 9001, sats: 2100, at: 1700000000 },
  { pubkey: 'b'.repeat(64), score: 4200, at: 1700000100 },
]

describe('leaderboard cache', () => {
  it('round-trips a board through the store', () => {
    const store = makeStore()
    writeCachedBoard('pallasite', BOARD, store)
    const read = readCachedBoard('pallasite', store)
    expect(read).toEqual(BOARD)
  })

  it('returns [] for an unknown game', () => {
    const store = makeStore()
    expect(readCachedBoard('nope', store)).toEqual([])
  })

  it('namespaces boards per gameId', () => {
    const store = makeStore()
    writeCachedBoard('game-a', BOARD, store)
    writeCachedBoard('game-b', [BOARD[0]], store)
    expect(readCachedBoard('game-a', store)).toHaveLength(2)
    expect(readCachedBoard('game-b', store)).toHaveLength(1)
  })

  it('never persists an empty board (so a transient empty live update cannot clobber the cache)', () => {
    const store = makeStore()
    writeCachedBoard('pallasite', BOARD, store)
    writeCachedBoard('pallasite', [], store) // should be a no-op
    expect(readCachedBoard('pallasite', store)).toEqual(BOARD)
  })

  it('clearCachedBoard removes the entry', () => {
    const store = makeStore()
    writeCachedBoard('pallasite', BOARD, store)
    clearCachedBoard('pallasite', store)
    expect(readCachedBoard('pallasite', store)).toEqual([])
  })

  it('survives malformed JSON in the store (returns [])', () => {
    const store = makeStore()
    store.map.set('gamestr-arcade.lb.pallasite', '{not json')
    expect(readCachedBoard('pallasite', store)).toEqual([])
  })

  it('ignores records from a different schema version', () => {
    const store = makeStore()
    store.map.set('gamestr-arcade.lb.pallasite', JSON.stringify({ v: 999, at: 1, entries: BOARD }))
    expect(readCachedBoard('pallasite', store)).toEqual([])
  })

  it('filters out non-entry junk inside a valid record', () => {
    const store = makeStore()
    store.map.set(
      'gamestr-arcade.lb.pallasite',
      JSON.stringify({ v: 1, at: 1, entries: [BOARD[0], { garbage: true }, BOARD[1]] }),
    )
    expect(readCachedBoard('pallasite', store)).toEqual(BOARD)
  })

  it('degrades to a no-op when there is no store', () => {
    expect(() => writeCachedBoard('x', BOARD, null)).not.toThrow()
    expect(readCachedBoard('x', null)).toEqual([])
  })
})
