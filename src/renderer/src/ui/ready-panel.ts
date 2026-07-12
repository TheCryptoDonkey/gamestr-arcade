/**
 * Controller-first pre-launch contract.
 *
 * A remote or native game never replaces the cabinet without first telling the
 * player what it needs, how it is controlled, and whether it is actually ready.
 */

import type { Game, GameInputMode } from '../../../shared/types'

export interface ReadyPanelOptions {
  onConfirm: (game: Game) => void
  onCancel?: () => void
}

export interface ReadyStatus {
  label: string
  detail: string
  tone: 'ready' | 'online' | 'blocked'
}

const INPUT_LABELS: Record<GameInputMode, string> = {
  gamepad: 'GAMEPAD',
  keyboard: 'KEYBOARD',
  pointer: 'POINTER',
  touch: 'TOUCH',
}

export function readyStatusFor(game: Game): ReadyStatus {
  if (game.available === false) {
    return {
      label: 'NOT READY',
      detail: game.availabilityReason || 'This game is unavailable on the cabinet.',
      tone: 'blocked',
    }
  }
  if (game.localSite || game.network === 'offline') {
    return { label: 'OFFLINE READY', detail: 'Playable without conference Wi-Fi.', tone: 'ready' }
  }
  if (game.kind === 'appimage') {
    return {
      label: game.network === 'required' ? 'ONLINE GAME' : 'LOCAL BUILD',
      detail: game.network === 'required' ? 'Internet connection required.' : 'Runs as a native cabinet game.',
      tone: game.network === 'required' ? 'online' : 'ready',
    }
  }
  if (game.network === 'optional') {
    return { label: 'ONLINE + OFFLINE', detail: 'Some connected features may be unavailable offline.', tone: 'ready' }
  }
  return { label: 'ONLINE REQUIRED', detail: 'This web game needs a working connection.', tone: 'online' }
}

export function controlsFor(game: Game): string[] {
  if (game.controlHints?.length) return game.controlHints
  const out: string[] = []
  if (game.inputModes?.length) out.push(game.inputModes.map(mode => INPUT_LABELS[mode]).join(' + '))
  if (game.controls) {
    const move = [game.controls.left, game.controls.up, game.controls.down, game.controls.right]
      .filter((v): v is string => !!v)
    if (move.length) out.push(`MOVE ${Array.from(new Set(move)).join(' / ')}`)
    if (game.controls.fire) out.push(`ACTION ${game.controls.fire}`)
  }
  return out.length ? out : ['GAME CONTROLS SHOWN AFTER LAUNCH']
}

export function capabilitiesFor(game: Game): string[] {
  const c = game.capabilities
  if (!c) return ['NO EXTRA CABINET ACCESS DECLARED']
  const out: string[] = []
  if (c.nostrSign) out.push('GUEST NOSTR SIGNING')
  if (c.walletPay) out.push('LIGHTNING PAYMENTS')
  if (c.persistentStorage) out.push('SAVED LOCAL DATA')
  if (c.externalNavigation) out.push('EXTERNAL NAVIGATION')
  return out.length ? out : ['NO EXTRA CABINET ACCESS']
}

function playerLabel(game: Game): string | undefined {
  const p = game.players
  if (!p) return undefined
  return p.min === p.max ? `${p.min} PLAYER${p.min === 1 ? '' : 'S'}` : `${p.min}–${p.max} PLAYERS`
}

export class ReadyPanel {
  private readonly overlay: HTMLElement
  private readonly nameEl: HTMLElement
  private readonly manifestEl: HTMLElement
  private readonly bylineEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly statusDetailEl: HTMLElement
  private readonly factsEl: HTMLElement
  private readonly controlsEl: HTMLElement
  private readonly capabilitiesEl: HTMLElement
  private readonly startBtn: HTMLButtonElement
  private readonly cancelBtn: HTMLButtonElement
  private readonly opts: ReadyPanelOptions
  private game: Game | null = null
  private previousFocus: HTMLElement | null = null
  private inerted: HTMLElement[] = []
  private _open = false

  constructor(host: HTMLElement, opts: ReadyPanelOptions) {
    this.opts = opts
    this.overlay = document.createElement('div')
    this.overlay.className = 'ready-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.inert = true
    this.overlay.innerHTML = `
      <section class="ready-panel" role="dialog" aria-modal="true" aria-labelledby="ready-title" aria-describedby="ready-status-detail">
        <header class="ready-head">
          <span class="ready-kicker">● CABINET CHECK</span>
          <span class="ready-manifest">MANIFEST V2</span>
        </header>
        <div class="ready-title-row">
          <div>
            <h2 id="ready-title" class="ready-name"></h2>
            <p class="ready-byline"></p>
          </div>
          <div class="ready-status" data-tone="ready">
            <span class="ready-status-dot"></span>
            <span class="ready-status-label"></span>
          </div>
        </div>
        <p id="ready-status-detail" class="ready-status-detail"></p>
        <div class="ready-facts"></div>
        <div class="ready-grid">
          <section class="ready-block">
            <h3>CONTROLS</h3>
            <ul class="ready-controls"></ul>
          </section>
          <section class="ready-block">
            <h3>REQUESTED ACCESS</h3>
            <ul class="ready-capabilities"></ul>
          </section>
        </div>
        <footer class="ready-actions">
          <button class="ready-cancel" type="button">Ⓑ / ESC&nbsp;&nbsp;BACK</button>
          <button class="ready-start" type="button"><span class="ready-a">Ⓐ</span> START GAME</button>
        </footer>
      </section>
    `
    host.appendChild(this.overlay)

    this.nameEl = this.overlay.querySelector('.ready-name') as HTMLElement
    this.manifestEl = this.overlay.querySelector('.ready-manifest') as HTMLElement
    this.bylineEl = this.overlay.querySelector('.ready-byline') as HTMLElement
    this.statusEl = this.overlay.querySelector('.ready-status') as HTMLElement
    this.statusDetailEl = this.overlay.querySelector('.ready-status-detail') as HTMLElement
    this.factsEl = this.overlay.querySelector('.ready-facts') as HTMLElement
    this.controlsEl = this.overlay.querySelector('.ready-controls') as HTMLElement
    this.capabilitiesEl = this.overlay.querySelector('.ready-capabilities') as HTMLElement
    this.startBtn = this.overlay.querySelector('.ready-start') as HTMLButtonElement
    this.cancelBtn = this.overlay.querySelector('.ready-cancel') as HTMLButtonElement

    this.startBtn.addEventListener('click', () => this.confirm())
    this.cancelBtn.addEventListener('click', () => this.close(true))
    this.overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        this.close(true)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [this.cancelBtn, this.startBtn].filter(button => !button.disabled)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    })
  }

  get isOpen(): boolean { return this._open }

  open(game: Game): void {
    this.game = game
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.overlay.style.setProperty('--accent', game.accent || '#7cf3ff')
    this.nameEl.textContent = game.name
    this.manifestEl.textContent = `MANIFEST V${game.manifestVersion ?? 1}`
    this.bylineEl.textContent = [game.developer, ...(game.genres ?? []).slice(0, 3)].filter(Boolean).join(' · ') || 'GAMESTR ARCADE'

    const status = readyStatusFor(game)
    this.statusEl.dataset.tone = status.tone
    ;(this.statusEl.querySelector('.ready-status-label') as HTMLElement).textContent = status.label
    this.statusDetailEl.textContent = status.detail
    this.startBtn.disabled = status.tone === 'blocked'

    const facts = [
      playerLabel(game),
      game.sessionMinutes ? `~${game.sessionMinutes} MIN` : undefined,
      game.ageRating ? `RATING ${game.ageRating}` : undefined,
      game.rewardRules?.enabled ? game.rewardRules.label || 'REWARDS ENABLED' : undefined,
    ].filter((v): v is string => !!v)
    this.factsEl.replaceChildren(...facts.map(value => this.chip(value)))
    this.renderList(this.controlsEl, controlsFor(game))
    this.renderList(this.capabilitiesEl, capabilitiesFor(game))

    this._open = true
    this.inerted = Array.from(this.overlay.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== this.overlay && !element.inert)
    for (const element of this.inerted) element.inert = true
    this.overlay.inert = false
    this.overlay.classList.add('is-open')
    this.overlay.setAttribute('aria-hidden', 'false')
    window.setTimeout(() => (this.startBtn.disabled ? this.cancelBtn : this.startBtn).focus(), 0)
  }

  confirm(): void {
    if (!this._open || !this.game || this.startBtn.disabled) return
    const game = this.game
    this.close(false)
    this.opts.onConfirm(game)
  }

  close(notify = true): void {
    if (!this._open) return
    this._open = false
    this.overlay.classList.remove('is-open')
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.inert = true
    for (const element of this.inerted) element.inert = false
    this.inerted = []
    this.game = null
    this.previousFocus?.focus()
    this.previousFocus = null
    if (notify) this.opts.onCancel?.()
  }

  private chip(value: string): HTMLElement {
    const chip = document.createElement('span')
    chip.className = 'ready-fact'
    chip.textContent = value
    return chip
  }

  private renderList(host: HTMLElement, values: string[]): void {
    host.replaceChildren(...values.map(value => {
      const li = document.createElement('li')
      li.textContent = value
      return li
    }))
  }
}
