/**
 * gamestr-arcade - input layer (keyboard primary, gamepad additive).
 *
 * Translates raw keyboard and gamepad events into menu intents and dispatches
 * them to handlers. Focused controls keep their native keyboard activation.
 *
 * Reserved by the main process and deliberately NOT handled here:
 *   Ctrl+Q (quit) and F5 (reload) are registered as global shortcuts in main.
 */

import {
  DPAD,
  STICK_DEADZONE,
  menuDirectionFromPad,
  menuDirectionFromPads,
  type Direction,
} from '../../../shared/gamepad'

// Capture the native reader before the phone SDK merges its input into pad 0.
// Approval must retain physical input even while that virtual pad is connected.
const physicalGamepads = typeof navigator !== 'undefined' ? navigator.getGamepads?.bind(navigator) : undefined

export interface InputHandlers {
  onPrev(): void
  onNext(): void
  onLaunch(): void
  onBack(): void
  onGamesSettings?(): void
  onPairPlayer?(): void
  /** Fired on ANY input (key / gamepad / pointer) - used to wake from attract. */
  onActivity?(): void
}

export interface InputControllerOptions {
  keyboard?: boolean
  diagnostics?: boolean
}

export { DPAD, STICK_DEADZONE }
export type { Direction }

/** Standard-mapping face-button indices. */
export const BTN_A = 0 // bottom face button → launch
const BTN_X = 2 // left face button → Games Settings

/**
 * Shell "back / close" buttons. Kept aligned with web/native game exits, with B
 * added because service overlays advertise B as the gamepad close action.
 */
export const BACK_BUTTON_INDICES = [1, 8, 9, 16] as const // B, View/Select, Start/Menu, Guide

/** Repeat cadence (ms) for a held direction. */
const REPEAT_INITIAL_MS = 420
const REPEAT_INTERVAL_MS = 140

/**
 * Resolve a menu direction from a gamepad, merging three input sources so any
 * one can drive the menu - and so BOTH controller styles at the booths work:
 *
 *   • D-pad buttons 12–15     - Standard-Mapping pads (the .32 booth's Xbox pad).
 *   • Left analogue stick 0/1 - exposed on both mappings.
 *   • D-pad HAT axes 6/7      - non-standard pads (bitfest-1's official Xbox pad,
 *                               whose connection lands outside Chromium's mapping
 *                               table) carry the d-pad here, NOT on buttons 12–15.
 *
 * The HAT read is gated on `pad.mapping !== 'standard'`, so it can never disturb
 * a pad whose d-pad already works as buttons - that gate is how the two styles
 * are told apart. BOTH axes navigate (left / up → prev, right / down → next), so
 * the d-pad and the stick move the menu vertically as well as horizontally. Prev
 * wins if both are somehow asserted. Pure and exported for unit testing.
 */
export function directionFromGamepad(pad: Gamepad): Direction {
  return menuDirectionFromPad(pad)
}

/**
 * Resolve a single menu direction across ALL connected pads.
 *
 * A booth can enumerate more than one controller - bitfest-1 shows two identical
 * "Generic X-Box pad" devices, and Chromium may index the idle one first - so
 * reading only the first pad (as the menu used to) silently ignores whichever
 * controller the player is actually holding. Reading every pad, exactly like the
 * in-game loop does, is what makes the menu respond on any of them.
 *
 * `prev` (−1) wins over `next` (+1) if two pads disagree, matching the
 * single-pad precedence. Nulls (empty slots in the getGamepads array) are
 * skipped. Pure and exported for unit testing.
 */
export function directionFromGamepads(pads: ArrayLike<Gamepad | null>): Direction {
  return menuDirectionFromPads(pads)
}

/** True when keyboard input should stay inside the focused editable element. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export class InputController {
  private readonly handlers: InputHandlers
  private readonly diagnostics: boolean
  private readonly keyboard: boolean
  private rafId = 0
  private running = false

  // Gamepad edge/repeat state.
  private prevButtons: boolean[] = []
  private heldDir: Direction = 0
  private nextRepeatAt = 0
  private lastGpDiag = 0

  constructor(handlers: InputHandlers, options: InputControllerOptions = {}) {
    this.handlers = handlers
    this.diagnostics = options.diagnostics === true
    this.keyboard = options.keyboard !== false
  }

  /** Begin listening to keyboard + polling gamepads. */
  start(): void {
    if (this.running) return
    this.running = true
    if(this.keyboard)window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('gamepadconnected', this.onActivity)
    if (this.diagnostics) {
      window.addEventListener('gamepadconnected', this.logGamepadEvent)
      window.addEventListener('gamepaddisconnected', this.logGamepadEvent)
    }
    this.poll()
  }

  /** Stop all listeners + polling (idempotent). */
  stop(): void {
    if (!this.running) return
    this.running = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('gamepadconnected', this.onActivity)
    if (this.diagnostics) {
      window.removeEventListener('gamepadconnected', this.logGamepadEvent)
      window.removeEventListener('gamepaddisconnected', this.logGamepadEvent)
    }
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    // Let the global admin shortcuts (Ctrl+Q, F5) pass through untouched.
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q'))) return
    if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('dialog[open]'))) return
    if (isEditableTarget(e.target)) {
      this.handlers.onActivity?.()
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.repeat) {
        e.preventDefault()
        return
      }
      if (e.target instanceof Element && e.target.closest('button, a[href], select, summary')) {
        this.handlers.onActivity?.()
        return
      }
    }

    let handled = true
    switch (e.key) {
      case 'g':
      case 'G':
        if (!this.handlers.onGamesSettings) { handled = false; break }
        if (!e.repeat) this.handlers.onGamesSettings()
        break
      case 'p':
      case 'P':
        this.handlers.onPairPlayer?.()
        break
      // Up/Down match the gamepad's vertical d-pad, which already steps the
      // same way, so list panels such as Games Settings work from a keyboard.
      case 'ArrowLeft':
      case 'ArrowUp':
        this.handlers.onPrev()
        break
      case 'ArrowRight':
      case 'ArrowDown':
        this.handlers.onNext()
        break
      case 'Enter':
      case ' ':
        this.handlers.onLaunch()
        break
      case 'Escape':
        this.handlers.onBack()
        break
      default:
        handled = false
    }
    this.handlers.onActivity?.()
    if (handled) e.preventDefault()
  }

  private onActivity = (): void => {
    this.handlers.onActivity?.()
  }

  private logGamepadEvent = (e: Event): void => {
    const g = (e as GamepadEvent).gamepad
    console.log(`[gp:menu] ${e.type} idx=${g?.index} id="${g?.id}" map=${g?.mapping || 'none'}`)
  }

  // ── Gamepad ────────────────────────────────────────────────────────────────────

  private poll = (): void => {
    if (!this.running) return
    this.readGamepads(performance.now())
    this.rafId = requestAnimationFrame(this.poll)
  }

  private readGamepads(now: number): void {
    const pads = Array.from(navigator.getGamepads?.() ?? []).filter(
      (p): p is Gamepad => p != null,
    )
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
    if (dialog) {
      // A phone controller may play games but cannot approve another phone's
      // identity. Only a local physical pad can operate this TV confirmation.
      const dialogPads = dialog.matches('.player-pairing')
        ? Array.from(physicalGamepads?.() ?? []).filter((pad): pad is Gamepad => pad != null && pad.id !== 'Gamestr Joystick phone')
        : pads
      const pressed = (index: number) => dialogPads.some(pad => !!pad.buttons[index]?.pressed)
      const active = document.activeElement
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')]
        .filter(control => !control.closest('[hidden], [inert]'))
      if (pressed(BTN_A) && !this.prevButtons[BTN_A] && active instanceof HTMLElement && controls.includes(active)) active.click()
      if (BACK_BUTTON_INDICES.some(index => pressed(index) && !this.prevButtons[index])) dialog.close()
      const direction = directionFromGamepads(dialogPads)
      if (controls.length && direction && (direction !== this.heldDir || now >= this.nextRepeatAt)) {
        let current = controls.findIndex(control => control === active)
        if (current === -1 && direction < 0) current = 0
        controls[(current + direction + controls.length) % controls.length].focus()
        this.nextRepeatAt = now + (direction === this.heldDir ? REPEAT_INTERVAL_MS : REPEAT_INITIAL_MS)
      }
      this.heldDir = direction
      this.prevButtons = Array.from({ length: 17 }, (_, index) => pressed(index))
      return
    }
    if (this.diagnostics && now - this.lastGpDiag > 1000) {
      this.lastGpDiag = now
      const detail = pads.map(p => `${p.index}:"${(p.id || '').slice(0, 28)}" map=${p.mapping || 'none'}`).join(' | ')
      console.log(`[gp:menu] hb pads=${pads.length} focus=${typeof document !== 'undefined' ? document.hasFocus() : '?'} ${detail}`)
    }
    if (pads.length === 0) {
      this.heldDir = 0
      this.prevButtons = []
      return
    }

    let activity = false

    // Edge-detect face buttons across ALL pads (a booth may enumerate two; the
    // player could hold either). Fire once per press, never per held frame, by
    // diffing against the previous frame's UNIONED button state.
    const anyPressed = (i: number): boolean => pads.some(p => !!p.buttons[i]?.pressed)
    const justPressed = (i: number): boolean => anyPressed(i) && !this.prevButtons[i]

    if (justPressed(3) && Array.from(physicalGamepads?.() ?? []).some(pad => pad?.buttons[3]?.pressed)) { this.handlers.onPairPlayer?.(); activity = true }
    if (justPressed(BTN_X) && this.handlers.onGamesSettings) {
      this.handlers.onGamesSettings()
      activity = true
    } else if (justPressed(BTN_A)) {
      this.handlers.onLaunch()
      activity = true
    }
    if (BACK_BUTTON_INDICES.some(i => justPressed(i))) {
      this.handlers.onBack()
      activity = true
    }

    // Direction from ANY connected pad - see directionFromGamepads. Pulling the
    // resolution out keeps it pure and unit-tested, so booth controller quirks
    // (multiple pads, HAT d-pads) can't silently regress it.
    const dir = directionFromGamepads(pads)
    if (dir !== 0) activity = true

    if (dir !== this.heldDir) {
      // Fresh direction press → fire immediately, then schedule auto-repeat.
      this.heldDir = dir
      if (dir !== 0) {
        this.fireDirection(dir)
        this.nextRepeatAt = now + REPEAT_INITIAL_MS
      }
    } else if (dir !== 0 && now >= this.nextRepeatAt) {
      // Held in the same direction → repeat at the steady cadence.
      this.fireDirection(dir)
      this.nextRepeatAt = now + REPEAT_INTERVAL_MS
    }

    // Snapshot the UNIONED button state for next-frame edge detection.
    const width = Math.max(...pads.map(p => p.buttons.length))
    this.prevButtons = Array.from({ length: width }, (_, i) => anyPressed(i))

    if (activity) this.handlers.onActivity?.()
  }

  private fireDirection(dir: Direction): void {
    if (dir === -1) this.handlers.onPrev()
    else if (dir === 1) this.handlers.onNext()
  }
}
