// @vitest-environment happy-dom
/**
 * Tests for the stale-gameId profile callback guard in LeaderboardPanel.
 *
 * The panel subscribes to profile resolution asynchronously. If the user
 * navigates rapidly, a stale callback from the previous game must not
 * write to the current game's profile map.
 *
 * We test via LeaderboardPanel.show() and a controllable resolve function.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { LeaderboardPanel } from '../src/renderer/src/ui/leaderboard-panel'
import type { LeaderboardProvider, LeaderboardEntry } from '../src/shared/types'
import type { Profile } from '../src/renderer/src/leaderboard/profiles'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Minimal HTML host (no real DOM needed beyond createElement). */
function makeHost(): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

/** A provider that delivers entries synchronously (via nextTick). */
function makeProvider(entries: LeaderboardEntry[]): LeaderboardProvider {
  return {
    subscribe(_gameId, onUpdate) {
      const t = setTimeout(() => onUpdate(entries), 0)
      return () => clearTimeout(t)
    },
  }
}

const PUBKEY_A = 'a'.repeat(64)
const PUBKEY_B = 'b'.repeat(64)

const NOW = Math.floor(Date.now() / 1000)
const ENTRY_A: LeaderboardEntry = { pubkey: PUBKEY_A, score: 1000, sats: 0, at: NOW }
const ENTRY_B: LeaderboardEntry = { pubkey: PUBKEY_B, score: 900, sats: 0, at: NOW - 1 }

describe('LeaderboardPanel — stale profile callback guard', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.replaceChildren()
  })

  it('shows the game-signed identity immediately, then patches in kind-0 and NIP-05', () => {
    const host = makeHost()
    let profileCallback: ((pubkey: string, profile: Profile) => void) | undefined
    const entry: LeaderboardEntry = { ...ENTRY_A, signedName: 'DAZ', signedNip05: 'daz@600.wtf' }
    const panel = new LeaderboardPanel(host, {
      relays: ['wss://relay.test'],
      makeProvider: () => ({ subscribe(_gameId, onUpdate) { onUpdate([entry]); return () => {} } }),
      resolve: (_relays, _pubkeys, callback) => { profileCallback = callback; return () => {} },
    })

    panel.show('alpha')
    expect(host.querySelector('.lb-title')?.textContent).toBe('GAMESTR.IO TOP SCORES')
    expect(host.querySelector('.lb-name')?.textContent).toBe('DAZ')
    expect(host.querySelector('.lb-nip05')?.textContent).toBe('daz@600.wtf')

    profileCallback?.(PUBKEY_A, { name: 'Alice', nip05: 'alice@example.com' })
    expect(host.querySelector('.lb-name')?.textContent).toBe('Alice')
    expect(host.querySelector('.lb-nip05')?.textContent).toBe('alice@example.com')
  })

  it('a profile callback from a previous game does not update current profiles', async () => {
    const host = makeHost()

    // Capture profile callbacks so we can call them manually after navigation.
    const capturedCallbacks: Array<(pubkey: string, profile: Profile) => void> = []

    // A provider that delivers entries IMMEDIATELY (synchronously on subscribe).
    const syncProvider = (entries: LeaderboardEntry[]): LeaderboardProvider => ({
      subscribe(_gameId, onUpdate) {
        onUpdate(entries) // synchronous — entries arrive before show() returns
        return () => {}
      },
    })

    const resolve = vi.fn(
      (_relays: string[], _pubkeys: string[], cb: (pubkey: string, profile: Profile) => void) => {
        capturedCallbacks.push(cb)
        return () => {}
      }
    )

    const panel = new LeaderboardPanel(host, {
      relays: [],
      makeProvider: () => syncProvider([ENTRY_A]),
      resolve,
    })

    // Show game "alpha" — entries arrive synchronously → resolve is called.
    panel.show('alpha')

    // resolve should have been called for PUBKEY_A.
    expect(capturedCallbacks.length).toBeGreaterThanOrEqual(1)
    const alphaCallback = capturedCallbacks[0]
    expect(alphaCallback).toBeDefined()

    // Rapidly navigate to game "beta" before the alpha profile resolves.
    panel.show('beta')

    // Now the stale alpha callback fires (simulates late async profile arrival).
    alphaCallback(PUBKEY_A, { name: 'Alice', picture: undefined })

    // The current game is "beta" — the stale alpha callback must not render Alice.
    // The beta board shows PUBKEY_A (same entries in this test) but the NAME should
    // not have been set to 'Alice' by the stale alpha callback.
    // The simplest verification: the DOM must not show 'Alice' since no beta resolve fired.
    const rows = host.querySelectorAll('.lb-name')
    const names = Array.from(rows).map(r => r.textContent)
    expect(names.every(n => n !== 'Alice')).toBe(true)
  })

  it('the score callback from a previous game is ignored after navigation', async () => {
    const host = makeHost()
    const scoreCallbacks: Array<(entries: LeaderboardEntry[]) => void> = []

    const makeProvider2 = (_relays: string[]): LeaderboardProvider => ({
      subscribe(_gameId, onUpdate) {
        scoreCallbacks.push(onUpdate)
        return () => {}
      },
    })

    const panel = new LeaderboardPanel(host, {
      relays: [],
      makeProvider: makeProvider2,
      resolve: () => () => {},
    })

    // Show game "alpha", capture its score callback.
    panel.show('alpha')
    expect(scoreCallbacks).toHaveLength(1)
    const alphaScoreCb = scoreCallbacks[0]

    // Navigate to "beta".
    panel.show('beta')
    expect(scoreCallbacks).toHaveLength(2)

    // Fire the stale alpha score callback — should be a no-op for the beta board.
    const betaEntries: LeaderboardEntry[] = [ENTRY_B]
    const alphaStaleBoardEntries: LeaderboardEntry[] = [ENTRY_A]
    scoreCallbacks[1](betaEntries) // legitimate beta update
    await Promise.resolve()

    // Now fire the stale alpha callback.
    alphaScoreCb(alphaStaleBoardEntries)
    await Promise.resolve()

    // The panel should still show beta's entry (PUBKEY_B), not alpha's (PUBKEY_A).
    const rows = host.querySelectorAll('[data-pubkey]')
    const pubkeys = Array.from(rows).map(r => (r as HTMLElement).dataset.pubkey)
    // PUBKEY_A from the stale alpha callback must not overwrite the beta board.
    expect(pubkeys).toContain(PUBKEY_B)
    expect(pubkeys).not.toContain(PUBKEY_A)
  })
})
