import { describe, expect, it, vi } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { ARCADE_PREFERENCES_KIND, ARCADE_PREFERENCES_TAG, preferenceState, mergePreferences, publishPreferences } from '../src/web/preference-sync'

const key = new Uint8Array(32).fill(7)
const pubkey = getPublicKey(key)
const state = { favourites: ['pallasite'], follows: ['a'.repeat(64)] }
function event(kind = ARCADE_PREFERENCES_KIND, tag = ARCADE_PREFERENCES_TAG) {
  return finalizeEvent({ kind, created_at: Math.floor(Date.now() / 1000), tags: [['d', tag]], content: JSON.stringify(state) }, key)
}

describe('explicit arcade preference sync', () => {
  it('accepts only the selected account’s dedicated signed preferences', () => {
    expect(preferenceState(event(), pubkey)).toEqual(state)
    expect(preferenceState(event(), 'b'.repeat(64))).toBeUndefined()
    expect(preferenceState(event(3), pubkey)).toBeUndefined()
    expect(preferenceState(event(30078, 'other-app'), pubkey)).toBeUndefined()
    expect(preferenceState({ ...event(), content: '{}' }, pubkey)).toBeUndefined()
  })
  it('merges both devices without duplicates or modifying NIP-02', () => {
    expect(mergePreferences(state, { favourites: ['pallasite', 'neon-sentinel'], follows: ['b'.repeat(64)] })).toEqual({ favourites: ['pallasite', 'neon-sentinel'], follows: ['a'.repeat(64), 'b'.repeat(64)] })
    expect(ARCADE_PREFERENCES_KIND).toBe(30078)
  })
  it('does not sign after cancellation and does not publish a signature completed after cancellation', async () => {
    const signer = { signEvent: vi.fn(async template => finalizeEvent(template, key)) }
    expect(await publishPreferences(state, pubkey, signer, ['wss://test'], () => false)).toBe(0)
    expect(signer.signEvent).not.toHaveBeenCalled()
    let approved = true
    signer.signEvent.mockImplementation(async template => { approved = false; return finalizeEvent(template, key) })
    expect(await publishPreferences(state, pubkey, signer, ['wss://test'], () => approved)).toBe(0)
  })
})
