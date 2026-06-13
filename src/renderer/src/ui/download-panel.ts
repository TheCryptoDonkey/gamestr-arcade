/**
 * gamestr-arcade — download QR panel.
 *
 * Shown when a visitor presses play on a *download-only* game — one that can't
 * run embedded in the kiosk web view (no playable web build). Instead of
 * launching, we surface the game's download URL as a QR code so the visitor can
 * grab it on their own device. Turns "can't play here" into "take it home".
 *
 * The QR is generated offline (qrcode-generator, zero deps) so it works at a
 * booth with no internet. Open/close + input routing are driven by the shell
 * (see main.ts): onBack closes, navigation/launch are swallowed while open.
 */

import qrcode from 'qrcode-generator'
import type { Game } from '../../../shared/types'

/** Build a scalable SVG QR for `data`, trying medium then low error correction
 *  (low holds more, so a long URL still fits). Returns null if it can't encode. */
function qrSvg(data: string): string | null {
  for (const level of ['M', 'L'] as const) {
    try {
      const qr = qrcode(0, level) // typeNumber 0 = auto-size to fit
      qr.addData(data)
      qr.make()
      return qr.createSvgTag({ scalable: true, margin: 1 })
    } catch {
      /* data too large at this level → try the next */
    }
  }
  return null
}

export class DownloadPanel {
  private readonly overlay: HTMLElement
  private readonly nameEl: HTMLElement
  private readonly qrEl: HTMLElement
  private readonly urlEl: HTMLElement
  private _open = false

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'dl-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-label', 'Download this game')
    this.overlay.innerHTML = `
      <div class="dl-panel">
        <div class="dl-kicker"><span class="dl-glyph">⤓</span>DOWNLOAD&nbsp;ONLY</div>
        <h2 class="dl-name"></h2>
        <p class="dl-sub">Not playable in the cabinet — scan to get it on your device.</p>
        <div class="dl-qr" aria-hidden="true"></div>
        <div class="dl-url"></div>
        <div class="dl-hint">Ⓑ&nbsp;/&nbsp;ESC&nbsp;=&nbsp;CLOSE</div>
      </div>
    `
    host.appendChild(this.overlay)
    this.nameEl = this.overlay.querySelector('.dl-name') as HTMLElement
    this.qrEl = this.overlay.querySelector('.dl-qr') as HTMLElement
    this.urlEl = this.overlay.querySelector('.dl-url') as HTMLElement
  }

  get isOpen(): boolean {
    return this._open
  }

  /** Open the panel for a download-only game (QR of downloadUrl, else url). */
  open(game: Game): void {
    const url = game.downloadUrl || game.url || ''
    this.nameEl.textContent = game.name
    this.urlEl.textContent = url
    this.overlay.style.setProperty('--accent', game.accent || '#7cf3ff')

    const svg = url ? qrSvg(url) : null
    if (svg) {
      this.qrEl.innerHTML = svg
      this.qrEl.classList.remove('dl-qr-empty')
    } else {
      // No URL (or un-encodable) → still a useful panel: name + message, no QR.
      this.qrEl.innerHTML = ''
      this.qrEl.classList.add('dl-qr-empty')
    }

    this._open = true
    this.overlay.setAttribute('aria-hidden', 'false')
    this.overlay.classList.add('is-open')
  }

  close(): void {
    if (!this._open) return
    this._open = false
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.classList.remove('is-open')
  }
}
