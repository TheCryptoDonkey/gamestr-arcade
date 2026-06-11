/**
 * gamestr-arcade — web-game view preload.
 *
 * Injected into the `WebContentsView` that hosts a launched web game. The game
 * view has focus while it runs, so the launcher's renderer can no longer poll
 * `navigator.getGamepads()`. This preload bridges the gap:
 *   - Polls gamepads via `requestAnimationFrame` (inside the focused view).
 *   - A single press of a MENU button sends `game:back` to the main process,
 *     which returns straight to the main gamestr arcade menu.
 *   - Also catches `Escape` keydown as a keyboard backup.
 *   - Translates d-pad / left-stick / face-buttons into synthetic `KeyboardEvent`
 *     dispatches so keyboard-controlled web games respond to a gamepad.
 *   - Injects a small, unobtrusive on-screen hint bar.
 *   - Exposes `window.webln` backed by the booth's NWC wallet when configured,
 *     auto-paying invoices up to `maxSats` without operator intervention.
 *
 * Security:
 *   - contextIsolation: true — the page cannot reach this code.
 *   - sandbox: false — required for ipcRenderer.
 *   - The NWC secret (connection URL) is NEVER forwarded to the page; only the
 *     capped payment methods are exposed via contextBridge.exposeInMainWorld.
 */

import { ipcRenderer, contextBridge } from 'electron'
import { NostrWebLNProvider } from '@getalby/sdk'
import { decode as decodeBolt11 } from 'light-bolt11-decoder'
import type { GameControls } from '../shared/types'

// ── Menu-button detector (pure, exported for unit tests) ──────────────────────

/**
 * Gamepad button indices that act as "menu / back" in the Standard Mapping —
 * a single press of any of these returns to the main menu. We accept several
 * so that whatever a given cabinet/controller labels "menu" just works:
 *   8  — Select / View / Back / Share
 *   9  — Start / Menu / Options
 *   16 — Guide / Home (when the controller exposes it)
 */
export const MENU_BUTTON_INDICES = [8, 9, 16]

/**
 * Rising-edge detector. Fires `true` exactly once when the menu button goes
 * from not-pressed to pressed, then stays silent until released — so a single
 * press triggers one exit and holding it doesn't repeat. Pure; no time needed.
 */
export class MenuPressDetector {
  private wasPressed = false

  /** Call once per RAF frame with whether any menu button is currently pressed. */
  update(pressed: boolean): boolean {
    const fire = pressed && !this.wasPressed
    this.wasPressed = pressed
    return fire
  }
}

// ── Gamepad → keyboard translation ───────────────────────────────────────────

/**
 * The resolved controls mapping used by the translator.
 * All five directions must be present (filled from DEFAULT_CONTROLS).
 */
export interface ResolvedControls {
  up: string
  down: string
  left: string
  right: string
  fire: string
}

/** Fallback mapping used until the main process sends `arcade:controls`. */
export const DEFAULT_CONTROLS: ResolvedControls = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  fire: 'Space',
}

/** Merge a partial per-game override on top of DEFAULT_CONTROLS. */
export function resolveControls(partial?: Partial<GameControls>): ResolvedControls {
  if (!partial) return DEFAULT_CONTROLS
  return {
    up: partial.up ?? DEFAULT_CONTROLS.up,
    down: partial.down ?? DEFAULT_CONTROLS.down,
    left: partial.left ?? DEFAULT_CONTROLS.left,
    right: partial.right ?? DEFAULT_CONTROLS.right,
    fire: partial.fire ?? DEFAULT_CONTROLS.fire,
  }
}

/**
 * Snapshot of which logical directions / fire are currently active.
 * Derived from d-pad buttons OR left-stick axes (union of both sources).
 */
export interface InputSnapshot {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  fire: boolean
}

/** An event the translator wants dispatched to the game page this frame. */
export interface KeyAction {
  type: 'keydown' | 'keyup'
  key: string
}

/**
 * Map a `KeyboardEvent.key` string to the legacy `{ code, keyCode }` values
 * that many canvas-based games read instead of (or in addition to) `key`.
 *
 * Covers the arrows, Space, a-z, and 0-9. Everything else gets keyCode 0.
 */
export function keyInfo(key: string): { code: string; keyCode: number } {
  switch (key) {
    case 'ArrowLeft':  return { code: 'ArrowLeft',  keyCode: 37 }
    case 'ArrowUp':    return { code: 'ArrowUp',    keyCode: 38 }
    case 'ArrowRight': return { code: 'ArrowRight', keyCode: 39 }
    case 'ArrowDown':  return { code: 'ArrowDown',  keyCode: 40 }
    case 'Space':      return { code: 'Space',      keyCode: 32 }
    default:
      if (key.length === 1) {
        const lower = key.toLowerCase()
        const upper = key.toUpperCase()
        if (lower >= 'a' && lower <= 'z') {
          return { code: `Key${upper}`, keyCode: upper.charCodeAt(0) }
        }
        if (key >= '0' && key <= '9') {
          const d = key.charCodeAt(0)
          return { code: `Digit${key}`, keyCode: d }
        }
      }
      return { code: key, keyCode: 0 }
  }
}

/**
 * Pure, testable gamepad-to-keyboard translator.
 *
 * Call `diff(snapshot, controls)` once per RAF frame with the current input
 * state. It returns the list of `KeyAction` events that need to be dispatched
 * (keydown on rising edge, keyup on falling edge). Holding a button produces
 * exactly one keydown; releasing produces one keyup — no spamming.
 */
export class GamepadKeyTranslator {
  private prev: InputSnapshot = { up: false, down: false, left: false, right: false, fire: false }

  /**
   * Diff the new snapshot against the previous frame.
   * Returns zero or more {type, key} actions to dispatch.
   */
  diff(next: InputSnapshot, controls: ResolvedControls): KeyAction[] {
    const actions: KeyAction[] = []

    const channels: Array<[keyof InputSnapshot, keyof ResolvedControls]> = [
      ['up',    'up'],
      ['down',  'down'],
      ['left',  'left'],
      ['right', 'right'],
      ['fire',  'fire'],
    ]

    for (const [input, ctrl] of channels) {
      const wasActive = this.prev[input]
      const isActive  = next[input]
      if (!wasActive && isActive) {
        actions.push({ type: 'keydown', key: controls[ctrl] })
      } else if (wasActive && !isActive) {
        actions.push({ type: 'keyup', key: controls[ctrl] })
      }
    }

    this.prev = next
    return actions
  }
}

/** Standard Gamepad API d-pad button indices. */
export const DPAD = { UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const

/** Primary face buttons: A (bottom, index 0) and X (left, index 2). */
export const FIRE_BUTTONS = [0, 2] as const

/** Deadzone for the left analogue stick — ignore values within ±STICK_DEAD. */
export const STICK_DEAD = 0.5

/**
 * Build an `InputSnapshot` from a `Gamepad` object (Standard Mapping assumed).
 *
 * Combines d-pad buttons with left-stick axes: either source activates the
 * corresponding direction. The stick deadzone is ±STICK_DEAD.
 */
export function snapshotFromGamepad(pad: Gamepad): InputSnapshot {
  const btn = (i: number) => pad.buttons[i]?.pressed ?? false
  const ax0 = pad.axes[0] ?? 0   // left stick horizontal
  const ax1 = pad.axes[1] ?? 0   // left stick vertical

  return {
    up:    btn(DPAD.UP)    || ax1 < -STICK_DEAD,
    down:  btn(DPAD.DOWN)  || ax1 >  STICK_DEAD,
    left:  btn(DPAD.LEFT)  || ax0 < -STICK_DEAD,
    right: btn(DPAD.RIGHT) || ax0 >  STICK_DEAD,
    fire:  FIRE_BUTTONS.some(i => btn(i)),
  }
}

/**
 * Union two snapshots (used when multiple gamepads are connected — any pad
 * activating a direction counts).
 */
export function unionSnapshots(a: InputSnapshot, b: InputSnapshot): InputSnapshot {
  return {
    up:    a.up    || b.up,
    down:  a.down  || b.down,
    left:  a.left  || b.left,
    right: a.right || b.right,
    fire:  a.fire  || b.fire,
  }
}

/**
 * Determine whether an invoice amount is within the operator-configured cap.
 *
 * Pure function — exported so unit tests can verify the cap logic without any
 * Electron or NWC dependency.
 *
 * @param amountSats  The invoice amount in satoshis.
 * @param maxSats     The operator-configured ceiling (inclusive).
 * @returns `true` when the invoice may be auto-paid, `false` to reject.
 */
export function shouldAutoPay(amountSats: number, maxSats: number): boolean {
  return amountSats > 0 && amountSats <= maxSats
}

/**
 * Extract the satoshi amount from a BOLT-11 invoice string.
 *
 * Returns `null` when the invoice carries no amount (amount-less invoices are
 * never auto-paid — the operator cannot know what they will cost).
 * Returns `null` on any decode failure rather than throwing.
 */
export function bolt11Sats(bolt11: string): number | null {
  try {
    const decoded = decodeBolt11(bolt11)
    const amountSection = decoded.sections.find(s => s.name === 'amount')
    if (!amountSection) return null
    // light-bolt11-decoder returns the value as a millisats string when the
    // `outputString` argument of hrpToMillisat is true (which it is internally).
    const milliStr = amountSection.value as string
    const millis = parseInt(milliStr, 10)
    if (isNaN(millis) || millis <= 0) return null
    // Truncate to whole sats (never round up — ceiling is already conservative).
    return Math.floor(millis / 1000)
  } catch {
    return null
  }
}

// ── WebLN provider (NWC-backed, capped) ───────────────────────────────────────

/**
 * Initialise a `window.webln` provider backed by the booth's NWC wallet and
 * expose it to the game page via `contextBridge.exposeInMainWorld`.
 *
 * Called once when the main process sends `arcade:webln`; subsequent calls
 * (e.g. on page reload) reinitialise with the same config.
 *
 * Security contract:
 *   - The `nwc` connection URL (which contains the wallet secret) is held only
 *     in this isolated preload scope and never forwarded to the page.
 *   - `sendPayment` rejects any invoice exceeding `maxSats` before touching the
 *     wallet, limiting unattended spend.
 */
function initWebLN(nwc: string, maxSats: number): void {
  let provider: NostrWebLNProvider | null = null

  const getProvider = (): NostrWebLNProvider => {
    if (!provider) {
      provider = new NostrWebLNProvider({ nostrWalletConnectUrl: nwc })
    }
    return provider
  }

  const weblnApi = {
    enable: (): Promise<void> => getProvider().enable(),

    getInfo: () => getProvider().getInfo(),

    makeInvoice: (args: unknown) => getProvider().makeInvoice(args as Parameters<NostrWebLNProvider['makeInvoice']>[0]),

    signMessage: (message: string) => getProvider().signMessage(message),

    keysend: (args: unknown) => getProvider().keysend(args as Parameters<NostrWebLNProvider['keysend']>[0]),

    sendPayment: async (bolt11: string): Promise<{ preimage: string }> => {
      const sats = bolt11Sats(bolt11)
      if (sats === null) {
        throw new Error('[arcade] webln: invoice carries no amount — auto-pay refused')
      }
      if (!shouldAutoPay(sats, maxSats)) {
        throw new Error(`[arcade] webln: invoice for ${sats} sats exceeds cap of ${maxSats} sats — auto-pay refused`)
      }
      const result = await getProvider().sendPayment(bolt11)
      // Audit log → main process → systemd journal.
      ipcRenderer.send('webln:paid', { amountSats: sats, result })
      return result
    },
  }

  // contextBridge.exposeInMainWorld is safe to call multiple times with the
  // same key — Electron throws on duplicate registrations. Guard with a flag
  // stored on the global object so reloads are handled cleanly.
  if (!(globalThis as Record<string, unknown>).__arcadeWebLNExposed) {
    contextBridge.exposeInMainWorld('webln', weblnApi)
    ;(globalThis as Record<string, unknown>).__arcadeWebLNExposed = true
  }
}

/**
 * Dispatch a synthetic KeyboardEvent for `action` onto multiple targets so
 * games that listen on different objects all receive it.
 *
 * Targets:
 *   - `document`
 *   - `window`
 *   - `document.activeElement` (if different from the above)
 *   - The first `<canvas>` element (many game engines attach listeners there)
 *   - The first `<iframe>` contentDocument / contentWindow (embedded games)
 *
 * Also dispatches `keypress` for printable keys (Space) because some older
 * game engines listen for it instead of `keydown`.
 *
 * Legacy `keyCode` / `which` / `charCode` fields are populated from `keyInfo()`
 * for old-school games that read them instead of (or alongside) `key`.
 */
export function dispatchKey(action: KeyAction): void {
  const { code, keyCode } = keyInfo(action.key)
  const init: KeyboardEventInit = {
    key:        action.key,
    code,
    keyCode,
    which:      keyCode,
    charCode:   action.type === 'keypress' ? keyCode : 0,
    bubbles:    true,
    cancelable: true,
    composed:   true,
  }

  const targets: EventTarget[] = [document, window]

  const active = document.activeElement
  if (active && active !== document.documentElement && active !== document.body) {
    targets.push(active)
  }

  const canvas = document.querySelector('canvas')
  if (canvas && !targets.includes(canvas)) {
    targets.push(canvas)
  }

  // Embedded games inside an <iframe> — dispatch into its document/window too.
  const iframe = document.querySelector('iframe')
  if (iframe) {
    try {
      if (iframe.contentWindow) targets.push(iframe.contentWindow)
      if (iframe.contentDocument) targets.push(iframe.contentDocument)
    } catch {
      // cross-origin iframe — skip silently
    }
  }

  for (const target of targets) {
    target.dispatchEvent(new KeyboardEvent(action.type, init))
  }

  // keypress for printable keys (Space is the main one game engines use).
  if (action.type === 'keydown' && (action.key === 'Space' || action.key === ' ' || action.key.length === 1)) {
    const pressInit: KeyboardEventInit = { ...init, charCode: keyCode }
    for (const target of targets) {
      target.dispatchEvent(new KeyboardEvent('keypress', pressInit))
    }
  }
}

// ── Hint bar ──────────────────────────────────────────────────────────────────

function injectHintBar(): void {
  if (document.getElementById('__arcade_back_hint')) return

  const bar = document.createElement('div')
  bar.id = '__arcade_back_hint'
  Object.assign(bar.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    padding: '6px 16px',
    background: 'rgba(5,7,15,0.85)',
    color: '#7cf3ff',
    fontFamily: 'monospace',
    fontSize: '12px',
    textAlign: 'center',
    zIndex: '2147483647',
    pointerEvents: 'none',
    letterSpacing: '0.1em',
  })
  bar.textContent = 'MENU button (or Esc) → back to gamestr arcade'
  document.body?.appendChild(bar)
}

// ── Keyboard backup ───────────────────────────────────────────────────────────

function initKeyboardExit(): void {
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        ipcRenderer.send('game:back')
      }
    },
    { capture: true },
  )
}

// ── Gamepad RAF loop ──────────────────────────────────────────────────────────

function initGamepadLoop(): void {
  const menuDetector  = new MenuPressDetector()
  const keyTranslator = new GamepadKeyTranslator()
  let   activeControls: ResolvedControls = DEFAULT_CONTROLS

  // Listen for per-game control overrides sent by the main process after each
  // web game loads (and on reload). Until one arrives, DEFAULT_CONTROLS applies.
  ipcRenderer.on('arcade:controls', (_event, map: Partial<GameControls>) => {
    activeControls = resolveControls(map)
    // Attempt to focus the game's primary interactive element so synthetic
    // keyboard events reach it immediately. This helps games whose menus only
    // respond to events on the focused element rather than document / window.
    try {
      const el = document.querySelector<HTMLElement>('canvas, iframe, [tabindex]')
      if (el) el.focus()
      window.focus()
    } catch {
      // Silently ignore — focus is best-effort.
    }
  })

  // Listen for WebLN config from the main process.  Arrives after controls on
  // the same `did-finish-load` — only when the booth has an NWC wallet set.
  ipcRenderer.on('arcade:webln', (_event, cfg: { nwc: string; maxSats: number }) => {
    try {
      initWebLN(cfg.nwc, cfg.maxSats)
    } catch (err) {
      // Fail gracefully — a broken NWC URL must not crash the whole preload.
      console.error(`[arcade] webln: failed to initialise provider: ${String(err)}`)
    }
  })

  function tick(): void {
    const pads = navigator.getGamepads()

    // ── Menu / back detection ─────────────────────────────────────────────
    let menuPressed = false
    for (const pad of pads) {
      if (!pad) continue
      for (const idx of MENU_BUTTON_INDICES) {
        if (pad.buttons[idx]?.pressed) {
          menuPressed = true
          break
        }
      }
      if (menuPressed) break
    }

    if (menuDetector.update(menuPressed)) {
      ipcRenderer.send('game:back')
    }

    // ── Gamepad → keyboard translation ───────────────────────────────────
    let combined: InputSnapshot = { up: false, down: false, left: false, right: false, fire: false }
    for (const pad of pads) {
      if (!pad) continue
      combined = unionSnapshots(combined, snapshotFromGamepad(pad))
    }

    const actions = keyTranslator.diff(combined, activeControls)
    for (const action of actions) {
      dispatchKey(action)
    }

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

// ── Boot ──────────────────────────────────────────────────────────────────────
// Guard with typeof checks so the module can be imported in Node (vitest) for
// unit-testing the detector without triggering DOM / RAF side-effects.

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHintBar)
  } else {
    injectHintBar()
  }
}

if (typeof window !== 'undefined') {
  initKeyboardExit()
}

if (typeof requestAnimationFrame !== 'undefined') {
  initGamepadLoop()
}
