// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('offers to find an installed desktop game instead of launching it', () => {
    expect(readyStatusFor(game({ kind: 'appimage', desktopLink: 'btc-proof-of-play' }))).toMatchObject({
      label: 'SET UP ON THIS PC',
      tone: 'ready',
    })
  })

  it('distinguishes offline-ready, online, and blocked games', () => {
    expect(readyStatusFor(game({ localSite: true })).label).toBe('OFFLINE READY')
    expect(readyStatusFor(game()).tone).toBe('online')
    expect(readyStatusFor(game({ available: false, availabilityReason: 'Missing binary' }))).toMatchObject({
      label: 'NOT READY',
      detail: 'Missing binary',
      tone: 'blocked',
    })
  })

  it('prefers explicit player-facing control hints and adds the shell exit gesture', () => {
    expect(controlsFor(game({
      inputModes: ['gamepad', 'keyboard'],
      controlHints: ['LEFT STICK = MOVE', 'Ⓐ = FIRE'],
    }))).toEqual([
      'LEFT STICK = MOVE',
      'Ⓐ = FIRE',
      'VIEW + MENU = RETURN TO ARCADE',
    ])
  })

  it('does not claim a cabinet exit gesture for games without gamepad input', () => {
    expect(controlsFor(game({ inputModes: ['keyboard'] }))).toEqual(['KEYBOARD'])
  })

  it('renders only requested cabinet capabilities', () => {
    expect(capabilitiesFor(game({ capabilities: { nostrSign: true, walletPay: false } }))).toEqual([
      'GUEST NOSTR SIGNING',
    ])
    expect(capabilitiesFor(game({ capabilities: {} }))).toEqual(['NO EXTRA CABINET ACCESS'])
  })
})

describe('ReadyPanel', () => {
  afterEach(() => vi.restoreAllMocks())
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

  it('finds an unlinked desktop game rather than launching it, and shows why a search failed', async () => {
    const onConfirm = vi.fn()
    const onLink = vi.fn().mockRejectedValueOnce(new Error("Error invoking remote method 'game:link-windows': Error: That is not the game itself."))
      .mockResolvedValueOnce(false)
    const panel = new ReadyPanel(document.getElementById('host')!, { onConfirm, onLink })
    const selected = game({ kind: 'appimage', desktopLink: 'btc-proof-of-play' })

    panel.open(selected)
    expect(document.querySelector('.ready-action-label')?.textContent).toBe('FIND INSTALLED GAME')
    panel.confirm()
    await vi.waitFor(() => expect(document.querySelector('.ready-status-detail')?.textContent).toBe('That is not the game itself.'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(panel.isOpen).toBe(true)

    panel.confirm()
    await vi.waitFor(() => expect(onLink).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect((document.querySelector('.ready-start') as HTMLButtonElement).disabled).toBe(false))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not request focus on its Start button after the launch closes it', () => {
    const queued = new Map<number, () => void>()
    let next = 0
    vi.spyOn(window, 'setTimeout').mockImplementation(handler => {
      const id = ++next
      queued.set(id, handler as () => void)
      return id
    })
    vi.spyOn(window, 'clearTimeout').mockImplementation(id => { queued.delete(Number(id)) })
    const panel = new ReadyPanel(document.getElementById('host')!, { onConfirm: vi.fn() })
    const start = document.querySelector('.ready-start') as HTMLButtonElement
    const focus = vi.spyOn(start, 'focus')
    panel.open(game())
    panel.confirm()
    for (const run of queued.values()) run()
    expect(focus).not.toHaveBeenCalled()
  })

  it('does not request focus from a replaced or dismissed panel opening', () => {
    const queued = new Map<number, () => void>()
    let next = 0
    vi.spyOn(window, 'setTimeout').mockImplementation(handler => {
      const id = ++next
      queued.set(id, handler as () => void)
      return id
    })
    vi.spyOn(window, 'clearTimeout').mockImplementation(id => { queued.delete(Number(id)) })
    const panel = new ReadyPanel(document.getElementById('host')!, { onConfirm: vi.fn() })
    const start = vi.spyOn(document.querySelector('.ready-start') as HTMLButtonElement, 'focus')
    const cancel = vi.spyOn(document.querySelector('.ready-cancel') as HTMLButtonElement, 'focus')
    panel.open(game())
    panel.open(game({ available: false }))
    for (const run of queued.values()) run()
    expect(start).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    queued.clear(); cancel.mockClear()
    panel.open(game({ available: false }))
    panel.close()
    for (const run of queued.values()) run()
    expect(cancel).not.toHaveBeenCalled()
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
