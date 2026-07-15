/**
 * gamestr-arcade - post-game donation ask.
 *
 * Shown when a player returns from a real session (the shell gates on
 * `minSessionSeconds`, so a five-second bounce never triggers it). Goodwill
 * peaks the moment a run ends - this card catches it with the game's accent,
 * a headline, and one big Lightning QR. Scan with any wallet, done.
 *
 * Deliberately not a modal: it demands nothing. Any control press dismisses
 * it (the shell swallows that first press), and it auto-dismisses after
 * `showSeconds` so an abandoned cabinet drifts back to attract on its own.
 * The QR is generated offline (qrcode-generator) - no network at the booth.
 */

import qrcode from 'qrcode-generator'
import type { DonationConfig, Game } from '../../../shared/types'

export interface DonationPanelOptions {
  onClose?: () => void
}

function qrSvg(data: string): string | null {
  for (const level of ['M', 'L'] as const) {
    try {
      const qr = qrcode(0, level)
      qr.addData(data)
      qr.make()
      return qr.createSvgTag({ scalable: true, margin: 1 })
    } catch {
      /* data too large at this level → try the next */
    }
  }
  return null
}

export class DonationPanel {
  private readonly overlay: HTMLElement
  private readonly opts: DonationPanelOptions
  private hideTimer: number | null = null
  private _open = false

  constructor(host: HTMLElement, opts: DonationPanelOptions = {}) {
    this.opts = opts
    this.overlay = document.createElement('div')
    this.overlay.className = 'donate'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.setAttribute('role', 'status')
    host.appendChild(this.overlay)
  }

  get isOpen(): boolean {
    return this._open
  }

  /** Raise the ask for the game the player just finished. */
  show(game: Game, cfg: DonationConfig): void {
    // A lightning: URI scans in every major wallet; the plain address is shown
    // as text beneath for anyone typing it manually.
    const svg = qrSvg(`lightning:${cfg.address}`)
    if (!svg) return // un-encodable address → never show a broken card

    this.clearTimer()
    this.overlay.style.setProperty('--accent', game.accent || '#7cf3ff')
    this.overlay.replaceChildren()

    const card = document.createElement('div')
    card.className = 'donate-card'

    const kicker = document.createElement('div')
    kicker.className = 'donate-kicker'
    kicker.textContent = '⚡ VALUE FOR VALUE'

    const title = document.createElement('h2')
    title.className = 'donate-title'
    title.textContent = `ENJOYED ${game.name.toUpperCase()}?`

    const sub = document.createElement('p')
    sub.className = 'donate-sub'
    sub.textContent = cfg.message ?? 'ZAP THE ARCADE - IT KEEPS THE GAMES FREE'

    const qrEl = document.createElement('div')
    qrEl.className = 'donate-qr'
    qrEl.innerHTML = svg // trusted: generated locally by qrcode-generator

    const addr = document.createElement('div')
    addr.className = 'donate-address'
    addr.textContent = cfg.address

    const hint = document.createElement('div')
    hint.className = 'donate-hint'
    hint.textContent = 'SCAN WITH ANY LIGHTNING WALLET · ANY BUTTON CONTINUES'

    card.append(kicker, title, sub, qrEl, addr, hint)
    this.overlay.appendChild(card)

    this._open = true
    this.overlay.setAttribute('aria-hidden', 'false')
    this.overlay.classList.add('is-open')

    this.hideTimer = window.setTimeout(() => this.close(), (cfg.showSeconds ?? 30) * 1000)
  }

  close(): void {
    if (!this._open) return
    this._open = false
    this.clearTimer()
    this.overlay.classList.remove('is-open')
    this.overlay.setAttribute('aria-hidden', 'true')
    this.opts.onClose?.()
  }

  private clearTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }
}
