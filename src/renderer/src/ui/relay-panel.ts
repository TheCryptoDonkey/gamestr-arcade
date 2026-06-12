/**
 * gamestr-arcade — relay admin panel.
 *
 * A hidden service-menu overlay opened by the operator pressing 'r' (and closed
 * by 'r' or Esc). Aesthetically: a CRT diagnostic terminal — phosphor neon on
 * deep navy, monospace type, scanline texture, glowing borders. Deliberately
 * compact and functional; not over-built.
 *
 * Responsibilities:
 *   - List all known relays with an enable/disable toggle each.
 *   - Remove button per relay.
 *   - An add-relay input (validated to `ws://` or `wss://`).
 *   - On any change, fires `onRelaysChanged(enabledUrls[])` so the board can
 *     re-subscribe immediately without a page reload.
 *
 * The panel is mounted as a full-screen overlay with `pointer-events: none` when
 * hidden, so it does not intercept gamepad/keyboard input while closed.
 */

import type { RelayStore } from '../leaderboard/relay-store'

export interface RelayPanelOptions {
  /** Fired whenever the enabled relay set changes. */
  onRelaysChanged: (enabledUrls: string[]) => void
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export class RelayPanel {
  private readonly overlay: HTMLElement
  private readonly listEl: HTMLElement
  private readonly inputEl: HTMLInputElement
  private readonly addBtn: HTMLButtonElement
  private readonly errorEl: HTMLElement
  private readonly store: RelayStore
  private readonly opts: RelayPanelOptions
  private _open = false

  constructor(host: HTMLElement, store: RelayStore, opts: RelayPanelOptions) {
    this.store = store
    this.opts = opts

    this.overlay = document.createElement('div')
    this.overlay.className = 'relay-panel-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-label', 'Relay configuration')
    this.overlay.innerHTML = `
      <div class="rp-panel">
        <header class="rp-head">
          <div class="rp-head-inner">
            <span class="rp-cursor">▌</span>
            <h2 class="rp-title">RELAY CONFIG</h2>
            <span class="rp-shortcut">[ R ] CLOSE</span>
          </div>
          <div class="rp-scanline-bar"></div>
        </header>
        <ol class="rp-list"></ol>
        <footer class="rp-footer">
          <div class="rp-add-row">
            <input class="rp-input" type="text" spellcheck="false" autocomplete="off"
              placeholder="wss://relay.example.com" maxlength="256" aria-label="New relay URL" />
            <button class="rp-add-btn" type="button" aria-label="Add relay">ADD</button>
          </div>
          <div class="rp-error" aria-live="polite"></div>
        </footer>
      </div>
    `
    host.appendChild(this.overlay)

    this.listEl = this.overlay.querySelector('.rp-list') as HTMLElement
    this.inputEl = this.overlay.querySelector('.rp-input') as HTMLInputElement
    this.addBtn = this.overlay.querySelector('.rp-add-btn') as HTMLButtonElement
    this.errorEl = this.overlay.querySelector('.rp-error') as HTMLElement

    this.addBtn.addEventListener('click', () => this.handleAdd())
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        this.handleAdd()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.close()
        return
      }
      // Prevent 'r' from toggling the panel while typing, but let other keys propagate.
      if (e.key === 'r' || e.key === 'R') e.stopPropagation()
    })
    this.inputEl.addEventListener('keyup', e => {
      // Prevent 'r' keyup from toggling the panel — only suppress that key.
      if (e.key === 'r' || e.key === 'R') e.stopPropagation()
    })

    this.renderList()
  }

  get isOpen(): boolean { return this._open }

  /** Open the panel. */
  open(): void {
    if (this._open) return
    this._open = true
    this.overlay.classList.add('rp-visible')
    this.overlay.setAttribute('aria-hidden', 'false')
    this.renderList()
    // Focus the input so operators can type immediately.
    window.setTimeout(() => this.inputEl.focus(), 80)
  }

  /** Close the panel. */
  close(): void {
    if (!this._open) return
    this._open = false
    this.overlay.classList.remove('rp-visible')
    this.overlay.setAttribute('aria-hidden', 'true')
    this.inputEl.blur()
  }

  /** Flip open/closed. */
  toggle(): void {
    this._open ? this.close() : this.open()
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private handleAdd(): void {
    const url = this.inputEl.value.trim()
    if (!url) { this.showError('Enter a relay URL.'); return }
    const ok = this.store.add(url)
    if (!ok) {
      this.showError('Invalid URL (needs wss:// or ws://) or already in the list.')
      return
    }
    this.inputEl.value = ''
    this.clearError()
    this.renderList()
    this.opts.onRelaysChanged(this.store.getEnabled())
  }

  private showError(msg: string): void {
    this.errorEl.textContent = msg
    this.errorEl.classList.add('rp-error-visible')
  }

  private clearError(): void {
    this.errorEl.textContent = ''
    this.errorEl.classList.remove('rp-error-visible')
  }

  private renderList(): void {
    const entries = this.store.getAll()
    const frag = document.createDocumentFragment()
    for (const entry of entries) {
      const li = document.createElement('li')
      li.className = 'rp-row' + (entry.enabled ? ' rp-row-on' : ' rp-row-off')
      li.dataset.url = entry.url
      li.innerHTML = `
        <button class="rp-toggle" type="button" aria-pressed="${entry.enabled}"
          aria-label="${entry.enabled ? 'Disable' : 'Enable'} ${escapeHtml(entry.url)}">
          <span class="rp-toggle-track">
            <span class="rp-toggle-thumb"></span>
          </span>
          <span class="rp-toggle-label">${entry.enabled ? 'ON' : 'OFF'}</span>
        </button>
        <span class="rp-url">${escapeHtml(entry.url)}</span>
        <button class="rp-remove" type="button" aria-label="Remove ${escapeHtml(entry.url)}">✕</button>
      `
      const toggleBtn = li.querySelector('.rp-toggle') as HTMLButtonElement
      toggleBtn.addEventListener('click', () => {
        this.store.toggle(entry.url)
        this.clearError()
        this.renderList()
        this.opts.onRelaysChanged(this.store.getEnabled())
      })
      const removeBtn = li.querySelector('.rp-remove') as HTMLButtonElement
      removeBtn.addEventListener('click', () => {
        this.store.remove(entry.url)
        this.clearError()
        this.renderList()
        this.opts.onRelaysChanged(this.store.getEnabled())
      })
      frag.appendChild(li)
    }
    this.listEl.replaceChildren(frag)
  }
}
