/**
 * gamestr-arcade — "add games" operator panel.
 *
 * A hidden service-menu overlay (operator presses 'g', closes with 'g' or Esc)
 * that lists gamestr.io games the kiosk doesn't have yet and adds them with one
 * tap. Mirrors the relay panel's CRT-diagnostic aesthetic.
 *
 * Data sources:
 *   - the gamestr catalogue (name / art / genres / play URL), fetched by the
 *     main process from gamestr.io's bundle (window.arcade.gamestrCatalogue),
 *   - the live score feed (the detector), to badge what's actively played and
 *     surface games on the network that have no catalogue entry.
 *
 * Adding writes a game.json in the main process; on success the shell refreshes
 * so the new tile appears in the carousel.
 */

import type { Game, GamestrCatalogueEntry } from '../../../shared/types'
import { createGameDetector, type DetectedGame, type GameDetector } from '../discovery/detector'

export interface GamesPanelOptions {
  /** Currently-installed game ids (Game.id / folder slug). */
  getInstalledIds: () => string[]
  /** Enabled relay URLs for the live detector. */
  relays: () => string[]
  /** Called after a successful import with the fresh games list. */
  onAdded: (games: Game[]) => void
  onClose?: () => void
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export class GamesPanel {
  private readonly host: HTMLElement
  private readonly overlay: HTMLElement
  private readonly listEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly closeBtn: HTMLButtonElement
  private readonly opts: GamesPanelOptions
  private previousFocus: HTMLElement | null = null
  private inertedSiblings: HTMLElement[] = []
  private _open = false
  private detector: GameDetector | null = null
  private detected = new Map<string, DetectedGame>()
  private catalogue: GamestrCatalogueEntry[] = []
  private added = new Set<string>()
  private loading = false
  // Gamepad/keyboard navigation: index into the current addable list + its slugs.
  private selectedIndex = 0
  private addableSlugs: string[] = []

  constructor(host: HTMLElement, opts: GamesPanelOptions) {
    this.host = host
    this.opts = opts

    this.overlay = document.createElement('div')
    this.overlay.className = 'games-panel-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-modal', 'true')
    this.overlay.setAttribute('aria-labelledby', 'games-panel-title')
    this.overlay.setAttribute('aria-describedby', 'games-panel-status games-panel-hint')
    this.overlay.tabIndex = -1
    this.overlay.inert = true
    this.overlay.innerHTML = `
      <div class="gp-panel">
        <header class="gp-head">
          <div class="gp-head-inner">
            <span class="gp-cursor" aria-hidden="true">▌</span>
            <h2 id="games-panel-title" class="gp-title">ADD GAMES · GAMESTR</h2>
            <button class="gp-close" type="button"><span aria-hidden="true">[ G ]</span> CLOSE</button>
          </div>
          <div class="gp-scanline-bar"></div>
        </header>
        <div id="games-panel-status" class="gp-status" aria-live="polite"></div>
        <div id="games-panel-hint" class="gp-hint">↕ NAVIGATE · Ⓐ / ENTER = ADD · Ⓑ / START / ESC = CLOSE</div>
        <ol class="gp-list" aria-label="Available games"></ol>
      </div>
    `
    host.appendChild(this.overlay)
    this.listEl = this.overlay.querySelector('.gp-list') as HTMLElement
    this.statusEl = this.overlay.querySelector('.gp-status') as HTMLElement
    this.closeBtn = this.overlay.querySelector('.gp-close') as HTMLButtonElement
    this.closeBtn.addEventListener('click', () => this.close())
    this.overlay.addEventListener('keydown', event => this.handleKeydown(event))
  }

  get isOpen(): boolean {
    return this._open
  }

  open(): void {
    if (this._open) return
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this._open = true
    this.overlay.inert = false
    this.inertBackground()
    this.selectedIndex = 0
    this.overlay.classList.add('gp-visible')
    this.overlay.setAttribute('aria-hidden', 'false')
    // Focus the dialog itself so the existing Enter/arrow controller route
    // continues to operate; Tab moves into its native controls.
    this.overlay.focus()
    this.startDetector()
    void this.loadCatalogue()
  }

  close(): void {
    if (!this._open) return
    this._open = false
    this.overlay.classList.remove('gp-visible')
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.inert = true
    this.detector?.dispose()
    this.detector = null
    this.restoreBackground()
    const previousFocus = this.previousFocus
    this.previousFocus = null
    if (previousFocus?.isConnected) previousFocus.focus()
    this.opts.onClose?.()
  }

  toggle(): void {
    this._open ? this.close() : this.open()
  }

  /** Move the highlighted ADD row — driven by the gamepad d-pad/stick or arrows. */
  moveSelection(delta: number): void {
    if (!this._open || this.addableSlugs.length === 0) return
    const n = this.addableSlugs.length
    this.selectedIndex = Math.min(n - 1, Math.max(0, this.selectedIndex + delta))
    this.render()
  }

  /** Add the highlighted game — driven by gamepad Ⓐ or Enter. */
  activateSelected(): void {
    if (!this._open) return
    const slug = this.addableSlugs[this.selectedIndex]
    if (!slug) return
    const btn = this.listEl.querySelector<HTMLButtonElement>(`.gp-row[data-slug="${slug}"] .gp-add`)
    if (btn && !btn.disabled) void this.add(slug, btn)
  }

  // ── internals ──────────────────────────────────────────────────────────────

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
      // Preserve the shell's established Escape route when mounted there, while
      // still making the panel self-closing when used independently.
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

  private startDetector(): void {
    this.detected = new Map()
    const relays = this.opts.relays()
    if (!relays.length) return
    this.detector = createGameDetector(relays)
    this.detector.onUpdate(games => {
      this.detected = games
      if (this._open) this.render()
    })
  }

  private async loadCatalogue(): Promise<void> {
    if (this.loading) return
    this.loading = true
    this.statusEl.textContent = 'Fetching gamestr catalogue…'
    this.render()
    try {
      const res = await window.arcade.gamestrCatalogue()
      this.catalogue = res.entries
      this.statusEl.textContent = res.entries.length
        ? `${res.entries.length} games in the gamestr catalogue${res.source === 'cache' ? ' · offline cache' : ''}.`
        : 'Could not load the gamestr catalogue (offline?).'
    } catch (err) {
      this.statusEl.textContent = `Catalogue error: ${String(err)}`
    } finally {
      this.loading = false
      this.render()
    }
  }

  private render(): void {
    const installed = new Set([...this.opts.getInstalledIds(), ...this.added])

    const addable = this.catalogue
      .filter(e => !installed.has(e.slug))
      .sort(
        (a, b) =>
          Number(this.detected.has(b.slug)) - Number(this.detected.has(a.slug)) ||
          Number(!!b.trending) - Number(!!a.trending) ||
          Number(!!b.newRelease) - Number(!!a.newRelease) ||
          a.name.localeCompare(b.name),
      )
    this.addableSlugs = addable.map(e => e.slug)
    if (this.selectedIndex >= addable.length) this.selectedIndex = Math.max(0, addable.length - 1)

    // Games seen live on the network but absent from the catalogue (no metadata,
    // so no play URL to launch) — surfaced for awareness, not auto-addable.
    const known = new Set(this.catalogue.map(e => e.slug))
    const orphans = Array.from(this.detected.values())
      .filter(d => !installed.has(d.gameId) && !known.has(d.gameId))
      .sort((a, b) => b.lastAt - a.lastAt)

    const frag = document.createDocumentFragment()

    if (!this.loading && !addable.length && !orphans.length) {
      const li = document.createElement('li')
      li.className = 'gp-empty'
      li.textContent = this.catalogue.length
        ? 'Every gamestr game is already installed. ✓'
        : 'No catalogue available.'
      frag.appendChild(li)
    }

    addable.forEach((e, i) => {
      const live = this.detected.get(e.slug)
      const badges = [
        live ? '<span class="gp-badge gp-live">● LIVE</span>' : '',
        e.trending ? '<span class="gp-badge gp-trend">TRENDING</span>' : '',
        e.newRelease ? '<span class="gp-badge gp-new">NEW</span>' : '',
      ]
        .filter(Boolean)
        .join('')
      const li = document.createElement('li')
      li.className = 'gp-row' + (i === this.selectedIndex ? ' gp-row-selected' : '')
      li.dataset.slug = e.slug
      if (i === this.selectedIndex) li.setAttribute('aria-current', 'true')
      li.innerHTML = `
        <div class="gp-art" aria-hidden="true"${e.image ? ` style="background-image:url('${esc(e.image)}')"` : ''}></div>
        <div class="gp-meta">
          <div class="gp-name">${esc(e.name)}${badges}</div>
          <div class="gp-sub">${esc(e.genres.join(' · ') || 'game')} — ${esc(hostOf(e.url))}</div>
        </div>
        <button class="gp-add" type="button" aria-label="Add ${esc(e.name)}">ADD</button>
      `
      const btn = li.querySelector('.gp-add') as HTMLButtonElement
      btn.addEventListener('click', () => void this.add(e.slug, btn))
      frag.appendChild(li)
    })

    if (orphans.length) {
      const hd = document.createElement('li')
      hd.className = 'gp-section'
      hd.textContent = 'ON THE NETWORK — NO GAMESTR METADATA'
      frag.appendChild(hd)
      for (const d of orphans) {
        const li = document.createElement('li')
        li.className = 'gp-row gp-row-orphan'
        li.innerHTML = `
          <div class="gp-art gp-art-empty" aria-hidden="true"></div>
          <div class="gp-meta">
            <div class="gp-name">${esc(d.gameId)}<span class="gp-badge gp-live">● LIVE</span></div>
            <div class="gp-sub">${esc(d.genres.join(' · ') || 'unknown')} — no play URL on gamestr</div>
          </div>
          <button class="gp-add" type="button" disabled title="No catalogue metadata / play URL"
            aria-label="${esc(d.gameId)} cannot be added without catalogue metadata">—</button>
        `
        frag.appendChild(li)
      }
    }

    this.listEl.replaceChildren(frag)
    this.listEl.querySelector('.gp-row-selected')?.scrollIntoView({ block: 'nearest' })
  }

  private async add(slug: string, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true
    btn.textContent = '…'
    try {
      const res = await window.arcade.gamestrImport(slug)
      if (res.ok && res.games) {
        btn.textContent = '✓ ADDED'
        this.added.add(slug)
        this.opts.onAdded(res.games)
      } else {
        btn.disabled = false
        btn.textContent = 'ADD'
        this.statusEl.textContent = `Add failed: ${res.error ?? 'unknown error'}`
      }
    } catch (err) {
      btn.disabled = false
      btn.textContent = 'ADD'
      this.statusEl.textContent = `Add failed: ${String(err)}`
    }
  }
}
