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
