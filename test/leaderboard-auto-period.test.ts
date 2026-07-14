// @vitest-environment happy-dom
/**
 * Tests for the empty-Today auto-fallback in LeaderboardPanel.
 *
 * A fresh booth has no scores today for most games, but often has all-time
 * history. The panel must not sit on a dead "NO SCORES YET TODAY" card when
 * All Time has rows: it falls back automatically, labels the state with a
 * nudge, snaps back when a today score lands, and never overrides an
 * explicit player toggle.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { LeaderboardPanel } from '../src/renderer/src/ui/leaderboard-panel'
import type { LeaderboardProvider, LeaderboardEntry } from '../src/shared/types'

// The panel paints cache-first from localStorage — isolate it per test.
beforeEach(() => localStorage.clear())

function makeHost(): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

const PUBKEY_A = 'a'.repeat(64)
const PUBKEY_B = 'b'.repeat(64)

const NOW = Math.floor(Date.now() / 1000)
const TWO_DAYS = 2 * 24 * 60 * 60

/** An all-time-only entry: scored two days ago, outside any Today window. */
const OLD_ENTRY: LeaderboardEntry = { pubkey: PUBKEY_A, score: 5000, sats: 0, at: NOW - TWO_DAYS }
/** A fresh entry scored moments ago — lands on Today. */
const TODAY_ENTRY: LeaderboardEntry = { pubkey: PUBKEY_B, score: 900, sats: 0, at: NOW }

/** A provider whose update callback is captured for manual firing. */
function capturingProvider(): { provider: LeaderboardProvider; fire: (entries: LeaderboardEntry[]) => void } {
  let cb: ((entries: LeaderboardEntry[]) => void) | null = null
  return {
    provider: {
      subscribe(_gameId, onUpdate) {
        cb = onUpdate
        return () => {}
      },
    },
    fire: entries => cb?.(entries),
  }
}

function activePeriod(host: HTMLElement): string {
  const active = host.querySelector('.lb-period-active') as HTMLElement | null
  return active?.dataset.period ?? '(none)'
}

describe('LeaderboardPanel — empty-Today auto-fallback', () => {
  it('falls back to All Time with a nudge when Today is empty and history exists', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {} })

    panel.show('alpha')
    fire([OLD_ENTRY])

    expect(activePeriod(host)).toBe('all')
    expect(host.querySelectorAll('[data-pubkey]')).toHaveLength(1)
    expect(host.querySelector('.lb-nudge')?.textContent).toContain('TODAY IS WIDE OPEN')
  })

  it('stays on the empty Today card when there is no history at all', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {} })

    panel.show('alpha')
    fire([])

    expect(activePeriod(host)).toBe('today')
    expect(host.querySelector('.lb-empty-head')?.textContent).toBe('NO SCORES YET TODAY')
  })

  it('snaps back to Today the moment a today score lands', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {} })

    panel.show('alpha')
    fire([OLD_ENTRY])
    expect(activePeriod(host)).toBe('all')

    fire([OLD_ENTRY, TODAY_ENTRY])
    expect(activePeriod(host)).toBe('today')
    expect(host.querySelector('.lb-nudge')).toBeNull()
    const pubkeys = Array.from(host.querySelectorAll('[data-pubkey]')).map(r => (r as HTMLElement).dataset.pubkey)
    expect(pubkeys).toEqual([PUBKEY_B])
  })

  it('never overrides an explicit player toggle back to Today', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {} })

    panel.show('alpha')
    fire([OLD_ENTRY])
    expect(activePeriod(host)).toBe('all')

    // The player insists on Today (empty as it is)…
    const todayBtn = host.querySelector('[data-period="today"]') as HTMLElement
    todayBtn.click()
    expect(activePeriod(host)).toBe('today')

    // …and a later all-time-only update must not drag them back to All Time.
    fire([OLD_ENTRY])
    expect(activePeriod(host)).toBe('today')
    expect(host.querySelector('.lb-empty-head')?.textContent).toBe('NO SCORES YET TODAY')
  })

  it('re-arms on game switch: the fallback applies per game', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {} })

    panel.show('alpha')
    fire([OLD_ENTRY])
    const allBtn = host.querySelector('[data-period="all"]') as HTMLElement
    const todayBtn = host.querySelector('[data-period="today"]') as HTMLElement
    todayBtn.click() // pin Today on alpha
    expect(activePeriod(host)).toBe('today')
    void allBtn

    panel.show('beta') // switching games resets the pin
    fire([OLD_ENTRY])
    expect(activePeriod(host)).toBe('all')
  })
})
