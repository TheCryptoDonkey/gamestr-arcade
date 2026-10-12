import { describe, expect, it } from 'vitest'
import { readSocialState, toggleSocialItem, writeSocialState } from '../src/web/social-state'

class MemoryStorage {
  value: string | null = null
  getItem(): string | null { return this.value }
  setItem(_key: string, value: string): void { this.value = value }
}

describe('browser-owned social state', () => {
  it('persists favourites and follows without an account database', () => {
    const storage = new MemoryStorage()
    let state = readSocialState(storage)
    state = toggleSocialItem(state, 'favourites', 'sovereign-racer')
    state = toggleSocialItem(state, 'follows', 'a'.repeat(64))
    writeSocialState(state, storage)
    expect(readSocialState(storage)).toEqual({ favourites: ['sovereign-racer'], follows: ['a'.repeat(64)] })
  })

  it('removes repeated toggles and discards malformed persisted values', () => {
    const storage = new MemoryStorage()
    const added = toggleSocialItem({ favourites: [], follows: [] }, 'favourites', 'arcade-game')
    expect(toggleSocialItem(added, 'favourites', 'arcade-game').favourites).toEqual([])
    storage.value = JSON.stringify({ favourites: ['ok-game', '../bad', 'ok-game'], follows: ['bad', 'b'.repeat(64)] })
    expect(readSocialState(storage)).toEqual({ favourites: ['ok-game'], follows: ['b'.repeat(64)] })
  })
})


describe('account isolation and unavailable storage', () => {
  it('keeps guest legacy preferences separate from signed-in accounts', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    values.set('gamestr:social:v1', JSON.stringify({ favourites: ['legacy'], follows: [] }))
    expect(readSocialState(storage).favourites).toEqual(['legacy'])
    expect(readSocialState(storage, 'a'.repeat(64)).favourites).toEqual([])
    writeSocialState({ favourites: ['account-a'], follows: [] }, storage, 'a'.repeat(64))
    expect(readSocialState(storage, 'b'.repeat(64)).favourites).toEqual([])
    expect(readSocialState(storage, 'a'.repeat(64)).favourites).toEqual(['account-a'])
    expect(readSocialState(storage).favourites).toEqual(['legacy'])
  })
  it('keeps in-memory preferences usable when storage reads or writes fail', () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } }
    expect(readSocialState(storage)).toEqual({ favourites: [], follows: [] })
    expect(writeSocialState({ favourites: ['game'], follows: [] }, storage)).toBe(false)
  })
})
