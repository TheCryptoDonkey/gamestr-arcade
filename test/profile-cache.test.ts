import { describe, it, expect } from 'vitest'
import { bech32 } from '@scure/base'
import { ProfileCache, PROFILE_TTL_MS } from '../src/renderer/src/leaderboard/profile-cache'
import type { KeyValueStore } from '../src/renderer/src/leaderboard/cache'

/** In-memory localStorage stub — same pattern as other cache tests. */
function makeStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  }
}

const PK = 'a'.repeat(64)
const PK2 = 'b'.repeat(64)

describe('ProfileCache', () => {
  it('returns undefined for an unknown pubkey', () => {
    const cache = new ProfileCache(makeStore(), () => 1000)
    expect(cache.get(PK)).toBeUndefined()
  })

  it('stores and retrieves a profile within TTL', () => {
    const store = makeStore()
    let now = 1_000_000
    const cache = new ProfileCache(store, () => now)

    cache.set(PK, { name: 'alice', picture: 'https://example.com/alice.png' })
    const hit = cache.get(PK)
    expect(hit).toEqual({ name: 'alice', picture: 'https://example.com/alice.png' })
  })

  it('persists NIP-05 and both Lightning receive fields for later zap discovery', () => {
    const store = makeStore()
    const now = 1_000_000
    const lud06 = bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode('https://pay.example.com/lnurl')), 2_000)
    new ProfileCache(store, () => now).set(PK, { nip05: 'alice@example.com', lud16: 'alice@example.com', lud06 })
    const hit = new ProfileCache(store, () => now).get(PK)
    expect(hit).toMatchObject({ nip05: 'alice@example.com', lud16: 'alice@example.com', lud06 })
  })

  it('is a memo hit on the second get (no localStorage re-read)', () => {
    const store = makeStore()
    let now = 1_000_000
    const cache = new ProfileCache(store, () => now)

    cache.set(PK, { name: 'alice' })
    // Delete the localStorage entry — the memo should still serve it.
    store.map.clear()
    expect(cache.get(PK)).toEqual({ name: 'alice' })
  })

  it('returns undefined when TTL is exceeded', () => {
    const store = makeStore()
    let now = 1_000_000
    const cache = new ProfileCache(store, () => now)

    cache.set(PK, { name: 'alice' })
    // Advance clock beyond TTL.
    now += PROFILE_TTL_MS + 1
    // Clear memo to force re-read from localStorage.
    const freshCache = new ProfileCache(store, () => now)
    expect(freshCache.get(PK)).toBeUndefined()
  })

  it('returns a hit for a record still within TTL', () => {
    const store = makeStore()
    let now = 1_000_000
    const cache = new ProfileCache(store, () => now)

    cache.set(PK, { name: 'alice' })
    // Advance to just before expiry.
    now += PROFILE_TTL_MS - 1
    const freshCache = new ProfileCache(store, () => now)
    expect(freshCache.get(PK)).toEqual({ name: 'alice' })
  })

  it('warms the memo on a localStorage hit so subsequent gets are memo-served', () => {
    const store = makeStore()
    let now = 1_000_000
    // Write via one cache instance.
    new ProfileCache(store, () => now).set(PK, { name: 'alice' })
    // Load via a fresh cache instance — first get reads localStorage.
    const cache2 = new ProfileCache(store, () => now)
    cache2.get(PK) // triggers localStorage read + memo warm
    // Clear localStorage — the memo should now serve it.
    store.map.clear()
    expect(cache2.get(PK)).toEqual({ name: 'alice' })
  })

  it('missing() returns only uncached pubkeys', () => {
    const store = makeStore()
    const cache = new ProfileCache(store, () => 1_000_000)

    cache.set(PK, { name: 'alice' })
    const result = cache.missing([PK, PK2])
    expect(result).toEqual([PK2])
  })

  it('missing() returns all pubkeys when nothing is cached', () => {
    const cache = new ProfileCache(makeStore(), () => 1_000_000)
    expect(cache.missing([PK, PK2])).toEqual([PK, PK2])
  })

  it('persists name and picture but omits undefined fields', () => {
    const store = makeStore()
    const cache = new ProfileCache(store, () => 1_000_000)
    cache.set(PK, { name: 'bob' }) // no picture
    const raw = store.map.get('gamestr-arcade.profile.v1.' + PK)!
    const parsed = JSON.parse(raw)
    expect(parsed.name).toBe('bob')
    expect('picture' in parsed).toBe(false)
  })

  it('handles malformed JSON in localStorage gracefully (returns undefined)', () => {
    const store = makeStore()
    store.map.set('gamestr-arcade.profile.v1.' + PK, '{bad json')
    const cache = new ProfileCache(store, () => 1_000_000)
    expect(cache.get(PK)).toBeUndefined()
  })

  it('degrades gracefully when store is null', () => {
    const cache = new ProfileCache(null, () => 1_000_000)
    cache.set(PK, { name: 'alice' }) // memo write only
    expect(cache.get(PK)).toEqual({ name: 'alice' }) // memo hit
    const freshCache = new ProfileCache(null, () => 1_000_000)
    expect(freshCache.get(PK)).toBeUndefined() // memo not shared
  })
})
