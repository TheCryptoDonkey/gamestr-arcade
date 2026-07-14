// @vitest-environment happy-dom
/**
 * Tests for the launch interstitial (LaunchOverlay).
 *
 * The overlay owns the screen while a web game loads detached in the main
 * process. It must render the game's identity (name, logo, accent, hero),
 * escalate its caption when loading drags on, and tear down cleanly on hide —
 * including when a new show() interrupts a previous overlay's exit fade.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LaunchOverlay, SLOW_LOAD_MS } from '../src/renderer/src/ui/launch-overlay'
import type { Game } from '../src/shared/types'

const GAME: Game = {
  id: 'neon-sentinel',
  name: 'Neon Sentinel',
  kind: 'web',
  url: 'https://neonsentinel.com/',
  gameId: 'neon-sentinel',
  logo: 'media://local/games/neon-sentinel/logo.webp',
  hero: 'media://local/games/neon-sentinel/hero.mp4',
  accent: '#22d3ee',
  order: 1,
}

function makeHost(): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('LaunchOverlay', () => {
  it('renders the game name, logo and accent while loading', () => {
    const host = makeHost()
    const overlay = new LaunchOverlay(host)
    overlay.show(GAME)

    const el = host.querySelector('.launch-overlay') as HTMLElement
    expect(el).not.toBeNull()
    expect(overlay.isOpen).toBe(true)
    expect(el.querySelector('.lo-title')?.textContent).toBe('Neon Sentinel')
    expect((el.querySelector('.lo-logo') as HTMLImageElement).src).toContain('logo.webp')
    expect(el.style.getPropertyValue('--accent')).toBe('#22d3ee')
  })

  it('uses the accent fallback backdrop for video-only heroes', () => {
    const host = makeHost()
    const overlay = new LaunchOverlay(host)
    overlay.show(GAME) // hero is an .mp4 — not usable as a still background

    expect(host.querySelector('.lo-backdrop-fancy')).not.toBeNull()
  })

  it('uses a still hero image as the backdrop when available', () => {
    const host = makeHost()
    const overlay = new LaunchOverlay(host)
    overlay.show({ ...GAME, hero: 'media://local/games/neon-sentinel/hero.webp' })

    const backdrop = host.querySelector('.lo-backdrop') as HTMLElement
    expect(backdrop.classList.contains('lo-backdrop-fancy')).toBe(false)
    expect(backdrop.style.backgroundImage).toContain('hero.webp')
  })

  it('escalates to the still-loading caption after SLOW_LOAD_MS', () => {
    const host = makeHost()
    const overlay = new LaunchOverlay(host)
    overlay.show(GAME)

    const el = host.querySelector('.launch-overlay') as HTMLElement
    expect(el.classList.contains('is-slow')).toBe(false)
    vi.advanceTimersByTime(SLOW_LOAD_MS + 1)
    expect(el.classList.contains('is-slow')).toBe(true)
  })

  it('hide() removes the overlay after the exit fade', () => {
    const host = makeHost()
    const overlay = new LaunchOverlay(host)
    overlay.show(GAME)
    overlay.hide()

    expect(overlay.isOpen).toBe(false)
    vi.advanceTimersByTime(500)
    expect(host.querySelector('.launch-overlay')).toBeNull()
  })

  it('hide() cancels a pending slow escalation', () => {
    const host = makeHost()
    const overlay = new LaunchOverlay(host)
    overlay.show(GAME)
    overlay.hide()

    vi.advanceTimersByTime(SLOW_LOAD_MS + 1000)
    // The (fading) node must never flip to the slow caption after dismissal.
    expect(host.querySelector('.launch-overlay.is-slow')).toBeNull()
  })

  it('a new show() replaces a previous overlay immediately', () => {
    const host = makeHost()
    const overlay = new LaunchOverlay(host)
    overlay.show(GAME)
    overlay.hide() // exit fade pending
    overlay.show({ ...GAME, id: 'word5', name: 'Word5' })

    const overlays = host.querySelectorAll('.launch-overlay')
    expect(overlays).toHaveLength(1)
    expect(overlays[0].querySelector('.lo-title')?.textContent).toBe('Word5')
    // The interrupted exit fade's removal timer must not delete the new overlay.
    vi.advanceTimersByTime(1000)
    expect(host.querySelectorAll('.launch-overlay')).toHaveLength(1)
  })
})
