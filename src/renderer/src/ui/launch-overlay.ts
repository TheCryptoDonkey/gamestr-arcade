/**
 * gamestr-arcade — launch interstitial.
 *
 * A web game's view stays detached in the main process until it finishes
 * loading (see `loadWeb` in src/main/index.ts). While it loads, this overlay
 * owns the screen: full-bleed hero art, the game's accent, a spinner and an
 * honest caption — so a 20-second game load feels intentional rather than
 * broken. It is dismissed by `game:web-ready`, `game:returned` or `game:error`.
 *
 * If loading drags on, the caption escalates to point at the Back control —
 * the player is never trapped (Ⓑ / Esc already route through `game:back`).
 */

import type { Game } from '../../../shared/types'
import { stillImage } from './art'

/** After this long the caption escalates to the "still loading" state. */
export const SLOW_LOAD_MS = 12_000

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export class LaunchOverlay {
  private readonly host: HTMLElement
  private root: HTMLElement | null = null
  private slowTimer: number | null = null
  private removeTimer: number | null = null

  constructor(host: HTMLElement) {
    this.host = host
  }

  get isOpen(): boolean {
    return this.root !== null
  }

  show(game: Game): void {
    this.dispose()

    const el = document.createElement('div')
    el.className = 'launch-overlay'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-label', `Loading ${game.name}`)
    if (game.accent) el.style.setProperty('--accent', game.accent)

    const hero = stillImage(game.hero)
    const backdrop = hero
      ? `<div class="lo-backdrop" style="background-image:url('${encodeURI(hero)}')"></div>`
      : `<div class="lo-backdrop lo-backdrop-fancy"></div>`

    el.innerHTML = `
      ${backdrop}
      <div class="lo-scrim"></div>
      <div class="lo-card">
        <img class="lo-logo" alt="" src="${encodeURI(game.logo)}">
        <div class="lo-kicker"><span class="lo-kicker-dot"></span>LOADING</div>
        <div class="lo-title">${escapeHtml(game.name)}</div>
        <div class="lo-spinner"></div>
        <div class="lo-sub lo-sub-loading">WARMING UP THE CABINET…</div>
        <div class="lo-sub lo-sub-slow">STILL LOADING — Ⓑ / ESC GOES BACK TO THE GRID</div>
      </div>
    `
    // A missing/broken logo simply disappears rather than showing a broken image.
    el.querySelector('.lo-logo')?.addEventListener('error', e => (e.target as HTMLElement).remove())

    this.host.appendChild(el)
    this.root = el
    // Two-frame open so the entry transition always animates from the base state.
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')))

    this.slowTimer = window.setTimeout(() => el.classList.add('is-slow'), SLOW_LOAD_MS)
  }

  hide(): void {
    const el = this.root
    if (!el) return
    this.root = null
    this.clearTimers()
    el.classList.remove('is-open')
    // Matches the CSS exit transition; the node is inert either way.
    this.removeTimer = window.setTimeout(() => el.remove(), 400)
  }

  private clearTimers(): void {
    if (this.slowTimer !== null) {
      clearTimeout(this.slowTimer)
      this.slowTimer = null
    }
  }

  /** Remove any current overlay immediately (used when re-showing). */
  private dispose(): void {
    this.clearTimers()
    if (this.removeTimer !== null) {
      clearTimeout(this.removeTimer)
      this.removeTimer = null
    }
    this.host.querySelectorAll('.launch-overlay').forEach(n => n.remove())
    this.root = null
  }
}
