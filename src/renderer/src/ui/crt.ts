/**
 * gamestr-arcade - CRT overlay.
 *
 * A single non-interactive layer mounted at the `.crt-anchor` seam that sits
 * over everything: fine scanlines, a soft tube vignette, an aperture-grille
 * tint and a faint flicker/roll. Tuned to read as "arcade monitor" while
 * keeping the underlying text crisp (low opacity, hairline lines) - it should
 * flatter the neon, not fog it.
 *
 * Gated by `config.theme.crt`; a key (default `c`) toggles it for the demo.
 * Honours `prefers-reduced-motion` (the flicker/roll are disabled in CSS).
 */

export interface CrtOptions {
  /** Initial on/off (from config.theme.crt). */
  enabled: boolean
}

export class CrtOverlay {
  private readonly el: HTMLElement
  private _enabled: boolean

  /**
   * @param anchor the `.crt-anchor` element from the carousel DOM (overlay is
   *               appended last so it layers above hero + showcase + board).
   */
  constructor(anchor: HTMLElement, opts: CrtOptions) {
    this._enabled = opts.enabled
    this.el = document.createElement('div')
    this.el.className = 'crt'
    this.el.setAttribute('aria-hidden', 'true')
    // Sub-layers: scanlines, grille tint, vignette, flicker, moving scan-roll.
    this.el.innerHTML = `
      <div class="crt-scanlines"></div>
      <div class="crt-grille"></div>
      <div class="crt-vignette"></div>
      <div class="crt-flicker"></div>
      <div class="crt-roll"></div>
    `
    anchor.appendChild(this.el)
    this.apply()
  }

  get enabled(): boolean {
    return this._enabled
  }

  /** Turn the overlay on/off. */
  setEnabled(on: boolean): void {
    this._enabled = on
    this.apply()
  }

  /** Flip the overlay; returns the new state. */
  toggle(): boolean {
    this._enabled = !this._enabled
    this.apply()
    return this._enabled
  }

  private apply(): void {
    this.el.classList.toggle('crt-on', this._enabled)
  }
}
