// @vitest-environment happy-dom
/**
 * Tests for live record detection (onNewTopScore).
 *
 * The panel must celebrate only records it witnesses live: the first live
 * update after a game switch seeds the baseline (relay backlog is history,
 * not news), later updates that change the all-time #1 fire exactly once,
 * and switching games re-arms the seed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LeaderboardPanel } from '../src/renderer/src/ui/leaderboard-panel'
import type { LeaderboardProvider, LeaderboardEntry } from '../src/shared/types'

beforeEach(() => localStorage.clear())

function makeHost(): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

const NOW = Math.floor(Date.now() / 1000)
const A: LeaderboardEntry = { pubkey: 'a'.repeat(64), score: 1000, sats: 0, at: NOW - 600 }
const B: LeaderboardEntry = { pubkey: 'b'.repeat(64), score: 2500, sats: 0, at: NOW }

function capturingProvider(): { provider: LeaderboardProvider; fire: (entries: LeaderboardEntry[]) => void } {
  let cb: ((entries: LeaderboardEntry[]) => void) | null = null
  return {
    provider: { subscribe(_gameId, onUpdate) { cb = onUpdate; return () => {} } },
    fire: entries => cb?.(entries),
  }
}

describe('LeaderboardPanel — live record detection', () => {
  it('does not fire on the first live update (backlog is not news)', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const onNewTopScore = vi.fn()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {}, onNewTopScore })

    panel.show('alpha')
    fire([A])
    expect(onNewTopScore).not.toHaveBeenCalled()
  })

  it('fires once when a later update dethrones the #1', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const onNewTopScore = vi.fn()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {}, onNewTopScore })

    panel.show('alpha')
    fire([A])          // seed
    fire([A, B])       // B takes #1 live
    expect(onNewTopScore).toHaveBeenCalledTimes(1)
    expect(onNewTopScore).toHaveBeenCalledWith(expect.objectContaining({ pubkey: B.pubkey, score: 2500 }), 'alpha')

    fire([A, B])       // unchanged board → no re-fire
    expect(onNewTopScore).toHaveBeenCalledTimes(1)
  })

  it('re-arms the seed on game switch', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const onNewTopScore = vi.fn()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {}, onNewTopScore })

    panel.show('alpha')
    fire([A])
    panel.show('beta')
    fire([B])          // first live update for beta — seed, not news
    expect(onNewTopScore).not.toHaveBeenCalled()
    fire([B, { ...B, pubkey: 'c'.repeat(64), score: 9000 }])
    expect(onNewTopScore).toHaveBeenCalledTimes(1)
    expect(onNewTopScore.mock.calls[0][1]).toBe('beta')
  })

  it('respects ranking direction — a lower time wins on asc boards', () => {
    const host = makeHost()
    const { provider, fire } = capturingProvider()
    const onNewTopScore = vi.fn()
    const panel = new LeaderboardPanel(host, { relays: [], makeProvider: () => provider, resolve: () => () => {}, onNewTopScore })

    panel.show('alpha', { dir: 'asc' })
    fire([A])                                              // seed: 1000
    fire([A, { ...B, score: 120 }])                        // 120 beats 1000 on asc
    expect(onNewTopScore).toHaveBeenCalledTimes(1)
    expect(onNewTopScore.mock.calls[0][0].score).toBe(120)
  })
})
