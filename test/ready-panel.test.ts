// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '../src/shared/types'
import { capabilitiesFor, controlsFor, ReadyPanel, readyStatusFor } from '../src/renderer/src/ui/ready-panel'

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'test-game',
    name: 'Test Game',
    kind: 'web',
    url: 'https://game.example/play',
    gameId: 'test-game',
    logo: '',
    order: 1,
    network: 'required',
    available: true,
    ...overrides,
  }
}

describe('Ready to Play facts', () => {
  it('distinguishes offline-ready, online, and blocked games', () => {
    expect(readyStatusFor(game({ localSite: true })).label).toBe('OFFLINE READY')
    expect(readyStatusFor(game()).tone).toBe('online')
    expect(readyStatusFor(game({ available: false, availabilityReason: 'Missing binary' }))).toMatchObject({
      label: 'NOT READY',
      detail: 'Missing binary',
      tone: 'blocked',
    })
  })

  it('prefers explicit player-facing control hints', () => {
    expect(controlsFor(game({ controlHints: ['LEFT STICK = MOVE', 'Ⓐ = FIRE'] }))).toEqual([
      'LEFT STICK = MOVE',
      'Ⓐ = FIRE',
    ])
  })

  it('renders only requested cabinet capabilities', () => {
    expect(capabilitiesFor(game({ capabilities: { nostrSign: true, walletPay: false } }))).toEqual([
      'GUEST NOSTR SIGNING',
    ])
    expect(capabilitiesFor(game({ capabilities: {} }))).toEqual(['NO EXTRA CABINET ACCESS'])
  })
})

describe('ReadyPanel', () => {
  beforeEach(() => { document.body.innerHTML = '<main id="host"><section id="cabinet"></section></main>' })

  it('confirms an available game and closes the modal', () => {
    const onConfirm = vi.fn()
    const panel = new ReadyPanel(document.getElementById('host')!, { onConfirm })
    const selected = game({ developer: 'Arcade Studio', genres: ['arcade'], sessionMinutes: 5 })

    panel.open(selected)
    expect(panel.isOpen).toBe(true)
    expect((document.querySelector('.ready-overlay') as HTMLElement).inert).toBe(false)
    expect(document.querySelector('.ready-name')?.textContent).toBe('Test Game')
    expect(document.querySelector('.ready-byline')?.textContent).toContain('Arcade Studio')
    expect(document.querySelector('.ready-manifest')?.textContent).toBe('MANIFEST V1')
    expect((document.getElementById('cabinet') as HTMLElement).inert).toBe(true)

    panel.confirm()
    expect(panel.isOpen).toBe(false)
    expect((document.querySelector('.ready-overlay') as HTMLElement).inert).toBe(true)
    expect(onConfirm).toHaveBeenCalledWith(selected)
    expect((document.getElementById('cabinet') as HTMLElement).inert).toBe(false)
  })

  it('never confirms a blocked game', () => {
    const onConfirm = vi.fn()
    const panel = new ReadyPanel(document.getElementById('host')!, { onConfirm })
    panel.open(game({ available: false }))
    panel.confirm()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(panel.isOpen).toBe(true)
  })

  it('reports the declared manifest version and closes on Escape', () => {
    const onCancel = vi.fn()
    const panel = new ReadyPanel(document.getElementById('host')!, { onConfirm: vi.fn(), onCancel })
    panel.open(game({ manifestVersion: 2 }))

    expect(document.querySelector('.ready-manifest')?.textContent).toBe('MANIFEST V2')
    document.querySelector('.ready-overlay')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(panel.isOpen).toBe(false)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
