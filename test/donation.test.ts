// @vitest-environment happy-dom
/**
 * Tests for the post-game donation ask: config parsing bounds and the
 * DonationPanel's show/dismiss/auto-hide behaviour. The session-length gate
 * lives in the shell (main.ts) — here we prove the pieces it composes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseConfig } from '../src/main/config'
import { DonationPanel } from '../src/renderer/src/ui/donation-panel'
import type { DonationConfig, Game } from '../src/shared/types'

const GAME: Game = {
  id: 'neon-sentinel',
  name: 'Neon Sentinel',
  kind: 'web',
  url: 'https://neonsentinel.com/',
  gameId: 'neon-sentinel',
  logo: 'media://local/logo.webp',
  accent: '#22d3ee',
  order: 1,
}

const CFG: DonationConfig = { address: 'booth@coinos.io', showSeconds: 30 }

describe('parseConfig — donation block', () => {
  it('is absent by default and rejected without a usable address', () => {
    expect(parseConfig({}).donation).toBeUndefined()
    expect(parseConfig({ donation: {} }).donation).toBeUndefined()
    expect(parseConfig({ donation: { address: 42 } }).donation).toBeUndefined()
    expect(parseConfig({ donation: { address: 'x@y' } }).donation).toBeUndefined() // too short
  })

  it('parses a full block and applies defaults + bounds', () => {
    const full = parseConfig({
      donation: { address: '  booth@coinos.io ', message: 'ZAP US', minSessionSeconds: 60, showSeconds: 20 },
    }).donation
    expect(full).toEqual({ address: 'booth@coinos.io', message: 'ZAP US', minSessionSeconds: 60, showSeconds: 20 })

    const defaults = parseConfig({ donation: { address: 'booth@coinos.io' } }).donation
    expect(defaults?.minSessionSeconds).toBe(45)
    expect(defaults?.showSeconds).toBe(30)

    const bounded = parseConfig({
      donation: { address: 'booth@coinos.io', minSessionSeconds: -5, showSeconds: 9999 },
    }).donation
    expect(bounded?.minSessionSeconds).toBe(45)
    expect(bounded?.showSeconds).toBe(30)
  })
})

describe('DonationPanel', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  function makeHost(): HTMLElement {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return host
  }

  it('shows the game name, message, QR and address', () => {
    const host = makeHost()
    const panel = new DonationPanel(host)
    panel.show(GAME, { ...CFG, message: 'ZAP THE ARCADE' })

    expect(panel.isOpen).toBe(true)
    const overlay = host.querySelector('.donate') as HTMLElement
    expect(overlay.classList.contains('is-open')).toBe(true)
    expect(overlay.querySelector('.donate-title')?.textContent).toBe('ENJOYED NEON SENTINEL?')
    expect(overlay.querySelector('.donate-sub')?.textContent).toBe('ZAP THE ARCADE')
    expect(overlay.querySelector('.donate-qr svg')).not.toBeNull()
    expect(overlay.querySelector('.donate-address')?.textContent).toBe('booth@coinos.io')
  })

  it('close() dismisses and fires onClose once', () => {
    const host = makeHost()
    const onClose = vi.fn()
    const panel = new DonationPanel(host, { onClose })
    panel.show(GAME, CFG)
    panel.close()
    panel.close() // idempotent

    expect(panel.isOpen).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect((host.querySelector('.donate') as HTMLElement).classList.contains('is-open')).toBe(false)
  })

  it('auto-dismisses after showSeconds', () => {
    const host = makeHost()
    const onClose = vi.fn()
    const panel = new DonationPanel(host, { onClose })
    panel.show(GAME, { ...CFG, showSeconds: 10 })

    vi.advanceTimersByTime(9_000)
    expect(panel.isOpen).toBe(true)
    vi.advanceTimersByTime(1_100)
    expect(panel.isOpen).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders the game name as text, never markup', () => {
    const host = makeHost()
    const panel = new DonationPanel(host)
    panel.show({ ...GAME, name: '<img src=x onerror=alert(1)>' }, CFG)
    expect(host.querySelector('.donate-title img')).toBeNull()
  })
})
