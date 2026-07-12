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

export interface DownloadPanelOptions {
  onClose?: () => void
}

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
  private readonly host: HTMLElement
  private readonly overlay: HTMLElement
  private readonly nameEl: HTMLElement
  private readonly qrEl: HTMLElement
  private readonly urlEl: HTMLElement
  private readonly closeBtn: HTMLButtonElement
  private previousFocus: HTMLElement | null = null
  private inertedSiblings: HTMLElement[] = []
  private readonly opts: DownloadPanelOptions
  private _open = false

  constructor(host: HTMLElement, opts: DownloadPanelOptions = {}) {
    this.host = host
    this.opts = opts
    this.overlay = document.createElement('div')
    this.overlay.className = 'dl-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-modal', 'true')
    this.overlay.setAttribute('aria-labelledby', 'download-panel-title')
    this.overlay.setAttribute('aria-describedby', 'download-panel-description download-panel-url')
    this.overlay.tabIndex = -1
    this.overlay.inert = true
    this.overlay.innerHTML = `
      <div class="dl-panel">
        <div class="dl-kicker"><span class="dl-glyph">⤓</span>DOWNLOAD&nbsp;ONLY</div>
        <h2 id="download-panel-title" class="dl-name"></h2>
        <p id="download-panel-description" class="dl-sub">Not playable in the cabinet — scan to get it on your device.</p>
        <div class="dl-qr" aria-hidden="true"></div>
        <div id="download-panel-url" class="dl-url"></div>
        <button class="dl-close" type="button"><span aria-hidden="true">Ⓑ&nbsp;/&nbsp;ESC&nbsp;&nbsp;</span>CLOSE DOWNLOAD</button>
      </div>
    `
    host.appendChild(this.overlay)
    this.nameEl = this.overlay.querySelector('.dl-name') as HTMLElement
    this.qrEl = this.overlay.querySelector('.dl-qr') as HTMLElement
    this.urlEl = this.overlay.querySelector('.dl-url') as HTMLElement
    this.closeBtn = this.overlay.querySelector('.dl-close') as HTMLButtonElement
    this.closeBtn.addEventListener('click', () => this.close())
    this.overlay.addEventListener('keydown', event => this.handleKeydown(event))
  }

  get isOpen(): boolean {
    return this._open
  }

  /** Open the panel for a download-only game (QR of downloadUrl, else url). */
  open(game: Game): void {
    if (!this._open) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      this.overlay.inert = false
      this.inertBackground()
    }
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
    this.closeBtn.focus()
  }

  close(): void {
    if (!this._open) return
    this._open = false
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.classList.remove('is-open')
    this.overlay.inert = true
    this.restoreBackground()
    const previousFocus = this.previousFocus
    this.previousFocus = null
    if (previousFocus?.isConnected) previousFocus.focus()
    this.opts.onClose?.()
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this._open) return
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      event.target.click()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      // Give the shell's existing close wrapper first refusal so its audio and
      // attract-mode side effects remain intact.
      queueMicrotask(() => { if (this._open) this.close() })
      return
    }
    if (event.key !== 'Tab') return

    const focusable = this.focusableElements()
    if (!focusable.length) {
      event.preventDefault()
      this.overlay.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !this.overlay.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !this.overlay.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.overlay.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )).filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true')
  }

  private inertBackground(): void {
    this.inertedSiblings = Array.from(this.host.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== this.overlay && !child.inert,
    )
    for (const sibling of this.inertedSiblings) sibling.inert = true
  }

  private restoreBackground(): void {
    for (const sibling of this.inertedSiblings) sibling.inert = false
    this.inertedSiblings = []
  }
}
