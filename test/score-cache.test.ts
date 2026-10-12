import { describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { readScoreCache, writeScoreCache } from '../src/renderer/src/leaderboard/score-cache'

const key = new Uint8Array(32).fill(7)
const event = finalizeEvent({ kind: 30762, created_at: Math.floor(Date.now() / 1000), tags: [['game', 'test'], ['score', '100']], content: '' }, key)
function storage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('verified public score cache', () => {
  it('reverifies cached events and rejects modified scores and oversized data', () => {
    const cache = storage()
    writeScoreCache(cache, [event])
    expect(readScoreCache(cache)).toHaveLength(1)
    const cacheKey = [...cache.values.keys()][0]
    cache.setItem(cacheKey, JSON.stringify([{ ...event, tags: [['game', 'test'], ['score', '999999']] }]))
    expect(readScoreCache(cache)).toEqual([])
    cache.setItem(cacheKey, 'x'.repeat(512 * 1024 + 1))
    expect(readScoreCache(cache)).toEqual([])
  })
  it('bounds retained events, deduplicates and tolerates unavailable storage', () => {
    const cache = storage()
    writeScoreCache(cache, [event, event, ...Array.from({ length: 300 }, (_, i) => ({ ...event, id: i.toString(16).padStart(64, '0') }))])
    expect(JSON.parse([...cache.values.values()][0])).toHaveLength(256)
    const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') } }
    expect(readScoreCache(blocked)).toEqual([])
    expect(() => writeScoreCache(blocked, [event])).not.toThrow()
  })
})
