import { describe, it, expect } from 'vitest'
import { RelayStore, type RelayEntry } from '../src/renderer/src/leaderboard/relay-store'
import type { KeyValueStore } from '../src/renderer/src/leaderboard/cache'

/** Tiny in-memory localStorage stub - same pattern as leaderboard-cache tests. */
function makeStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  }
}

const BASE = ['wss://relay.trotters.cc', 'wss://nos.lol'] as const

describe('RelayStore', () => {
  it('seeds from base relays with all enabled', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    const all = rs.getAll()
    expect(all).toHaveLength(2)
    expect(all.every(e => e.enabled)).toBe(true)
    expect(rs.getEnabled()).toEqual([...BASE])
  })

  it('toggle disables an enabled relay', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    rs.toggle('wss://nos.lol')
    expect(rs.getEnabled()).toEqual(['wss://relay.trotters.cc'])
    const all = rs.getAll()
    expect(all.find(e => e.url === 'wss://nos.lol')?.enabled).toBe(false)
  })

  it('toggle re-enables a disabled relay', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    rs.toggle('wss://nos.lol')
    rs.toggle('wss://nos.lol')
    expect(rs.getEnabled()).toEqual([...BASE])
  })

  it('toggle is a no-op for unknown URLs', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    expect(() => rs.toggle('wss://unknown.example')).not.toThrow()
    expect(rs.getEnabled()).toEqual([...BASE])
  })

  it('add inserts a new relay (enabled by default)', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    const ok = rs.add('wss://relay.damus.io')
    expect(ok).toBe(true)
    expect(rs.getEnabled()).toContain('wss://relay.damus.io')
    expect(rs.getAll()).toHaveLength(3)
  })

  it('add trims whitespace from the URL', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    rs.add('  wss://relay.damus.io  ')
    expect(rs.getEnabled()).toContain('wss://relay.damus.io')
  })

  it('add rejects non-ws URLs', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    expect(rs.add('https://example.com')).toBe(false)
    expect(rs.add('ftp://example.com')).toBe(false)
    expect(rs.add('')).toBe(false)
    expect(rs.getAll()).toHaveLength(2)
  })

  it('add accepts ws:// (non-secure)', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    expect(rs.add('ws://localhost:7777')).toBe(true)
  })

  it('add is a no-op (returns false) for duplicate URLs', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    const ok = rs.add('wss://relay.trotters.cc')
    expect(ok).toBe(false)
    expect(rs.getAll()).toHaveLength(2)
  })

  it('remove deletes a relay', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    const ok = rs.remove('wss://nos.lol')
    expect(ok).toBe(true)
    expect(rs.getAll()).toHaveLength(1)
    expect(rs.getEnabled()).not.toContain('wss://nos.lol')
  })

  it('remove returns false for unknown URLs', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    expect(rs.remove('wss://unknown.example')).toBe(false)
  })

  it('persists to the store on mutation and round-trips correctly', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    rs.toggle('wss://nos.lol')
    rs.add('wss://relay.damus.io')

    // Re-load from the same store - should restore mutated state.
    const rs2 = new RelayStore(BASE, store)
    const all: RelayEntry[] = rs2.getAll()
    expect(all.find(e => e.url === 'wss://nos.lol')?.enabled).toBe(false)
    expect(all.find(e => e.url === 'wss://relay.damus.io')?.enabled).toBe(true)
    expect(rs2.getEnabled()).not.toContain('wss://nos.lol')
    expect(rs2.getEnabled()).toContain('wss://relay.damus.io')
  })

  it('handles malformed JSON in the store (falls back to base relays)', () => {
    const store = makeStore()
    store.map.set('gamestr-arcade.relays.v1', '{not json')
    const rs = new RelayStore(BASE, store)
    expect(rs.getEnabled()).toEqual([...BASE])
  })

  it('degrades gracefully when store is null', () => {
    const rs = new RelayStore(BASE, null)
    rs.add('wss://relay.damus.io')
    rs.toggle('wss://nos.lol')
    expect(rs.getEnabled()).toContain('wss://relay.damus.io')
    expect(rs.getEnabled()).not.toContain('wss://nos.lol')
  })

  it('onChange fires when the enabled set changes', () => {
    const store = makeStore()
    const rs = new RelayStore(BASE, store)
    const calls: string[][] = []
    const unsub = rs.onChange(enabled => calls.push(enabled))

    rs.toggle('wss://nos.lol')
    rs.add('wss://relay.damus.io')

    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual(['wss://relay.trotters.cc'])
    expect(calls[1]).toContain('wss://relay.damus.io')

    unsub()
    rs.remove('wss://relay.damus.io')
    expect(calls).toHaveLength(2) // no more calls after unsub
  })

  it('new base relays are appended to an existing persisted list', () => {
    const store = makeStore()
    // First session: only 2 relays
    const rs1 = new RelayStore(BASE, store)
    rs1.toggle('wss://nos.lol') // mutate so it saves

    // Second session: config now has an additional relay
    const rs2 = new RelayStore([...BASE, 'wss://relay.damus.io'], store)
    expect(rs2.getAll().some(e => e.url === 'wss://relay.damus.io' && e.enabled)).toBe(true)
  })
})
