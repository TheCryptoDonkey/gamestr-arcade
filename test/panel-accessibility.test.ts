// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '../src/shared/types'
import { RelayStore } from '../src/renderer/src/leaderboard/relay-store'
import { RelayPanel } from '../src/renderer/src/ui/relay-panel'
import { GamesPanel } from '../src/renderer/src/ui/games-panel'
import { DownloadPanel } from '../src/renderer/src/ui/download-panel'

function shell(): { host: HTMLElement; launcher: HTMLButtonElement; cabinet: HTMLElement } {
  document.body.innerHTML = `
    <main id="host">
      <button id="launcher" type="button">Open panel</button>
      <section id="cabinet">Arcade shell</section>
    </main>
  `
  const launcher = document.getElementById('launcher') as HTMLButtonElement
  launcher.focus()
  return {
    host: document.getElementById('host') as HTMLElement,
    launcher,
    cabinet: document.getElementById('cabinet') as HTMLElement,
  }
}

function press(target: Element, key: string, shiftKey = false): void {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  }))
}

function downloadGame(): Game {
  return {
    id: 'take-home',
    name: 'Take Home',
    kind: 'web',
    url: 'https://games.example/take-home',
    downloadOnly: true,
    downloadUrl: 'https://games.example/take-home/download',
    gameId: 'take-home',
    logo: '',
    order: 1,
  }
}

describe('RelayPanel accessibility', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('labels the modal, traps Tab, inerts the shell, and restores focus on Escape', async () => {
    const { host, launcher, cabinet } = shell()
    const panel = new RelayPanel(host, new RelayStore(['wss://relay.example'], null), {
      onRelaysChanged: vi.fn(),
    })
    const overlay = host.querySelector('.relay-panel-overlay') as HTMLElement

    panel.open()

    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.getAttribute('aria-labelledby')).toBe('relay-panel-title')
    expect(overlay.inert).toBe(false)
    expect(cabinet.inert).toBe(true)
    expect(document.activeElement).toBe(overlay.querySelector('.rp-input'))

    const focusable = Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))
    const first = focusable[0]
    const last = focusable.at(-1)!
    last.focus()
    press(last, 'Tab')
    expect(document.activeElement).toBe(first)
    press(first, 'Tab', true)
    expect(document.activeElement).toBe(last)

    press(last, 'Escape')
    await Promise.resolve()

    expect(panel.isOpen).toBe(false)
    expect(overlay.inert).toBe(true)
    expect(cabinet.inert).toBe(false)
    expect(document.activeElement).toBe(launcher)
  })
})

describe('GamesPanel accessibility', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'arcade', {
      configurable: true,
      value: {
        gamestrCatalogue: vi.fn().mockResolvedValue({ entries: [], source: 'cache', fetchedAt: 0 }),
      } as unknown as Window['arcade'],
    })
  })

  it('provides a labelled close control and restores the shell after Escape', async () => {
    const { host, launcher, cabinet } = shell()
    const panel = new GamesPanel(host, {
      getInstalledIds: () => [],
      relays: () => [],
      onAdded: vi.fn(),
    })
    const overlay = host.querySelector('.games-panel-overlay') as HTMLElement
    const close = overlay.querySelector('.gp-close') as HTMLButtonElement

    panel.open()

    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.getAttribute('aria-labelledby')).toBe('games-panel-title')
    expect(close.textContent).toContain('CLOSE')
    expect(document.activeElement).toBe(overlay)
    expect(cabinet.inert).toBe(true)

    close.focus()
    press(close, 'Tab')
    expect(document.activeElement).toBe(close)
    press(close, 'Escape')
    await Promise.resolve()

    expect(panel.isOpen).toBe(false)
    expect(cabinet.inert).toBe(false)
    expect(document.activeElement).toBe(launcher)
  })
})

describe('DownloadPanel accessibility', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('describes the download, contains focus, and preserves pre-existing inert state', async () => {
    const { host, launcher, cabinet } = shell()
    cabinet.inert = true
    const panel = new DownloadPanel(host)
    const overlay = host.querySelector('.dl-overlay') as HTMLElement
    const close = overlay.querySelector('.dl-close') as HTMLButtonElement

    panel.open(downloadGame())

    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.getAttribute('aria-labelledby')).toBe('download-panel-title')
    expect(overlay.getAttribute('aria-describedby')).toContain('download-panel-url')
    expect(overlay.querySelector('.dl-name')?.textContent).toBe('Take Home')
    expect(overlay.querySelector('.dl-url')?.textContent).toContain('/download')
    expect(document.activeElement).toBe(close)

    press(close, 'Tab')
    expect(document.activeElement).toBe(close)
    press(close, 'Escape')
    await Promise.resolve()

    expect(panel.isOpen).toBe(false)
    expect(cabinet.inert).toBe(true)
    expect(document.activeElement).toBe(launcher)
  })

  it('offers a keyboard-operable close button that restores the background', () => {
    const { host, launcher, cabinet } = shell()
    const panel = new DownloadPanel(host)
    const close = host.querySelector('.dl-close') as HTMLButtonElement

    panel.open(downloadGame())
    expect(cabinet.inert).toBe(true)
    press(close, 'Enter')

    expect(panel.isOpen).toBe(false)
    expect(cabinet.inert).toBe(false)
    expect(document.activeElement).toBe(launcher)
  })
})
