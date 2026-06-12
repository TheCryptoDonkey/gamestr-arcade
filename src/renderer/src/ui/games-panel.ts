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
  private readonly overlay: HTMLElement
  private readonly listEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly opts: GamesPanelOptions
  private _open = false
  private detector: GameDetector | null = null
  private detected = new Map<string, DetectedGame>()
  private catalogue: GamestrCatalogueEntry[] = []
  private added = new Set<string>()
  private loading = false

  constructor(host: HTMLElement, opts: GamesPanelOptions) {
    this.opts = opts

    this.overlay = document.createElement('div')
    this.overlay.className = 'games-panel-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-label', 'Add games from gamestr')
    this.overlay.innerHTML = `
      <div class="gp-panel">
        <header class="gp-head">
          <div class="gp-head-inner">
            <span class="gp-cursor">▌</span>
            <h2 class="gp-title">ADD GAMES · GAMESTR</h2>
            <span class="gp-shortcut">[ G ] CLOSE</span>
          </div>
          <div class="gp-scanline-bar"></div>
        </header>
        <div class="gp-status" aria-live="polite"></div>
        <ol class="gp-list"></ol>
      </div>
    `
    host.appendChild(this.overlay)
    this.listEl = this.overlay.querySelector('.gp-list') as HTMLElement
    this.statusEl = this.overlay.querySelector('.gp-status') as HTMLElement
  }

  get isOpen(): boolean {
    return this._open
  }

  open(): void {
    if (this._open) return
    this._open = true
    this.overlay.classList.add('gp-visible')
    this.overlay.setAttribute('aria-hidden', 'false')
    this.startDetector()
    void this.loadCatalogue()
  }

  close(): void {
    if (!this._open) return
    this._open = false
    this.overlay.classList.remove('gp-visible')
    this.overlay.setAttribute('aria-hidden', 'true')
    this.detector?.dispose()
    this.detector = null
  }

  toggle(): void {
    this._open ? this.close() : this.open()
  }

  // ── internals ──────────────────────────────────────────────────────────────

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

    for (const e of addable) {
      const live = this.detected.get(e.slug)
      const badges = [
        live ? '<span class="gp-badge gp-live">● LIVE</span>' : '',
        e.trending ? '<span class="gp-badge gp-trend">TRENDING</span>' : '',
        e.newRelease ? '<span class="gp-badge gp-new">NEW</span>' : '',
      ]
        .filter(Boolean)
        .join('')
      const li = document.createElement('li')
      li.className = 'gp-row'
      li.innerHTML = `
        <div class="gp-art"${e.image ? ` style="background-image:url('${esc(e.image)}')"` : ''}></div>
        <div class="gp-meta">
          <div class="gp-name">${esc(e.name)}${badges}</div>
          <div class="gp-sub">${esc(e.genres.join(' · ') || 'game')} — ${esc(hostOf(e.url))}</div>
        </div>
        <button class="gp-add" type="button">ADD</button>
      `
      const btn = li.querySelector('.gp-add') as HTMLButtonElement
      btn.addEventListener('click', () => void this.add(e.slug, btn))
      frag.appendChild(li)
    }

    if (orphans.length) {
      const hd = document.createElement('li')
      hd.className = 'gp-section'
      hd.textContent = 'ON THE NETWORK — NO GAMESTR METADATA'
      frag.appendChild(hd)
      for (const d of orphans) {
        const li = document.createElement('li')
        li.className = 'gp-row gp-row-orphan'
        li.innerHTML = `
          <div class="gp-art gp-art-empty"></div>
          <div class="gp-meta">
            <div class="gp-name">${esc(d.gameId)}<span class="gp-badge gp-live">● LIVE</span></div>
            <div class="gp-sub">${esc(d.genres.join(' · ') || 'unknown')} — no play URL on gamestr</div>
          </div>
          <button class="gp-add" type="button" disabled title="No catalogue metadata / play URL">—</button>
        `
        frag.appendChild(li)
      }
    }

    this.listEl.replaceChildren(frag)
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
