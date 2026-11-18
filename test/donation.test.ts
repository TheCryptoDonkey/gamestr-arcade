// @vitest-environment happy-dom
/**
 * Tests for the post-game donation ask: config parsing bounds and the
 * DonationPanel's show/dismiss/auto-hide behaviour. The session-length gate
 * lives in the shell (main.ts) - here we prove the pieces it composes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseConfig } from '../src/main/config'
import { decodeModules, encode, toSvg } from '@forgesworn/qr'
import { DonationPanel } from '../src/renderer/src/ui/donation-panel'
import { qrSvg } from '../src/renderer/src/ui/qr-svg'
import oldEncoderFixtures from './fixtures/donation-qr.json'
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

describe('parseConfig - donation block', () => {
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

/** Read a toSvg() path back into a module grid, dropping the margin. */
function gridFromSvg(svg: string, margin: number): { size: number; modules: Uint8Array } {
  const side = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1])
  const size = side - margin * 2
  const modules = new Uint8Array(size * size)
  for (const m of svg.matchAll(/M(\d+) (\d+)h(\d+)v1/g)) {
    const [x, y, w] = [Number(m[1]) - margin, Number(m[2]) - margin, Number(m[3])]
    for (let i = 0; i < w; i += 1) modules[y * size + x + i] = 1
  }
  return { size, modules }
}

describe('qrSvg', () => {
  // The fixture holds matrices from the encoder this one replaced
  // (qrcode-generator, level M). That encoder picked its mask with a rule that
  // differs from the standard's, so the mask is pinned for the comparison.
  for (const fixture of oldEncoderFixtures) {
    it(`matches the previous encoder with the same mask: ${fixture.value.slice(0, 20)}`, () => {
      const qr = encode(fixture.value, {
        ecc: 'M',
        mode: 'byte',
        mask: fixture.mask as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      })
      expect(qr.size).toBe(fixture.size)
      const rows: string[] = []
      for (let y = 0; y < qr.size; y += 1) {
        rows.push(Array.from(qr.modules.subarray(y * qr.size, (y + 1) * qr.size), (v) => (v ? '1' : '0')).join(''))
      }
      expect(rows).toEqual(fixture.rows)
    })

    it(`renders a level M SVG that reads back: ${fixture.value.slice(0, 20)}`, () => {
      const svg = qrSvg(fixture.value)
      expect(svg).not.toBeNull()
      const { size, modules } = gridFromSvg(svg as string, 1)
      expect(size).toBe(fixture.size)
      const found = decodeModules(modules, size)
      expect(found?.text).toBe(fixture.value)
      expect(found?.ecc).toBe('M')
    })
  }

  it('keeps the old 1-module margin and white background', () => {
    const svg = qrSvg('lightning:booth@coinos.io') as string
    expect(svg).toBe(toSvg(encode('lightning:booth@coinos.io', { ecc: 'M', mode: 'byte' }), { margin: 1 }))
    expect(svg).toContain('viewBox="0 0 27 27"')
    expect(svg).toContain('fill="#fff"')
  })

  it('falls back to level L for a payload too large for M, then gives up', () => {
    const big = 'x'.repeat(2500) // over level M's capacity, within level L's
    const svg = qrSvg(big) as string
    expect(decodeModules(gridFromSvg(svg, 1).modules, gridFromSvg(svg, 1).size)?.ecc).toBe('L')
    expect(qrSvg('x'.repeat(4000))).toBeNull()
  })
})
