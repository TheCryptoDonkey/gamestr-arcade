/**
 * gamestr-arcade — input layer (keyboard primary, gamepad additive).
 *
 * Translates raw keyboard and gamepad events into four high-level intents
 * (prev / next / launch / back) and dispatches them to handlers. Keeps a single
 * source of truth so keyboard and gamepad never double-fire the same action.
 *
 * Reserved by the main process and deliberately NOT handled here:
 *   Ctrl+Q (quit) and F5 (reload) are registered as global shortcuts in main.
 */

export interface InputHandlers {
  onPrev(): void
  onNext(): void
  onLaunch(): void
  onBack(): void
  /** Fired on ANY input (key / gamepad / pointer) — used to wake from attract. */
  onActivity?(): void
}

/** Standard-mapping face-button indices. */
export const BTN_A = 0 // bottom face button → launch

/**
 * Shell "back / close" buttons. Kept aligned with web/native game exits, with B
 * added because service overlays advertise B as the gamepad close action.
 */
export const BACK_BUTTON_INDICES = [1, 8, 9, 16] as const // B, View/Select, Start/Menu, Guide

/**
 * Standard-mapping d-pad button indices. Non-standard pads carry the d-pad on a
 * HAT instead (see HAT_AXIS) — `directionFromGamepad` reads both.
 */
export const DPAD = { UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const

/**
 * Axis indices. The left analogue stick (0 = X, 1 = Y) is present on both
 * mappings. On non-standard pads the d-pad arrives as a HAT on axes 6 (X) /
 * 7 (Y) — the conventional Linux layout (see src/preload/webgame.ts).
 */
export const STICK_AXIS = { X: 0, Y: 1 } as const
export const HAT_AXIS = { X: 6, Y: 7 } as const

/** Past this magnitude a stick/HAT axis counts as pushed (a HAT snaps to 0 / ±1). */
export const STICK_DEADZONE = 0.5

/** Repeat cadence (ms) for a held direction. */
const REPEAT_INITIAL_MS = 420
const REPEAT_INTERVAL_MS = 140

/** Menu navigation step: −1 = previous, 0 = none, +1 = next. */
export type Direction = -1 | 0 | 1

/**
 * Resolve a menu direction from a gamepad, merging three input sources so any
 * one can drive the menu — and so BOTH controller styles at the booths work:
 *
 *   • D-pad buttons 12–15     — Standard-Mapping pads (the .32 booth's Xbox pad).
 *   • Left analogue stick 0/1 — exposed on both mappings.
 *   • D-pad HAT axes 6/7      — non-standard pads (bitfest-1's official Xbox pad,
 *                               whose connection lands outside Chromium's mapping
 *                               table) carry the d-pad here, NOT on buttons 12–15.
 *
 * The HAT read is gated on `pad.mapping !== 'standard'`, so it can never disturb
 * a pad whose d-pad already works as buttons — that gate is how the two styles
 * are told apart. BOTH axes navigate (left / up → prev, right / down → next), so
 * the d-pad and the stick move the menu vertically as well as horizontally. Prev
 * wins if both are somehow asserted. Pure and exported for unit testing.
 */
export function directionFromGamepad(pad: Gamepad): Direction {
  const pressed = (i: number): boolean => !!pad.buttons[i]?.pressed
  const nonStandard = pad.mapping !== 'standard'

  const stickX = pad.axes[STICK_AXIS.X] ?? 0
  const stickY = pad.axes[STICK_AXIS.Y] ?? 0
  const hatX = nonStandard ? (pad.axes[HAT_AXIS.X] ?? 0) : 0
  const hatY = nonStandard ? (pad.axes[HAT_AXIS.Y] ?? 0) : 0

  const toPrev =
    pressed(DPAD.LEFT) || pressed(DPAD.UP) ||
    stickX <= -STICK_DEADZONE || stickY <= -STICK_DEADZONE ||
    hatX <= -STICK_DEADZONE || hatY <= -STICK_DEADZONE
  const toNext =
    pressed(DPAD.RIGHT) || pressed(DPAD.DOWN) ||
    stickX >= STICK_DEADZONE || stickY >= STICK_DEADZONE ||
    hatX >= STICK_DEADZONE || hatY >= STICK_DEADZONE

  if (toPrev) return -1
  if (toNext) return 1
  return 0
}

/**
 * Resolve a single menu direction across ALL connected pads.
 *
 * A booth can enumerate more than one controller — bitfest-1 shows two identical
 * "Generic X-Box pad" devices, and Chromium may index the idle one first — so
 * reading only the first pad (as the menu used to) silently ignores whichever
 * controller the player is actually holding. Reading every pad, exactly like the
 * in-game loop does, is what makes the menu respond on any of them.
 *
 * `prev` (−1) wins over `next` (+1) if two pads disagree, matching the
 * single-pad precedence. Nulls (empty slots in the getGamepads array) are
 * skipped. Pure and exported for unit testing.
 */
export function directionFromGamepads(pads: ArrayLike<Gamepad | null>): Direction {
  let dir: Direction = 0
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i]
    if (!pad) continue
    const d = directionFromGamepad(pad)
    if (d === -1) return -1 // prev wins — no need to look further
    if (d === 1) dir = 1
  }
  return dir
}

/** True when keyboard input should stay inside the focused editable element. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export class InputController {
  private readonly handlers: InputHandlers
  private rafId = 0
  private running = false

  // Gamepad edge/repeat state.
  private prevButtons: boolean[] = []
  private heldDir: Direction = 0
  private nextRepeatAt = 0

  constructor(handlers: InputHandlers) {
    this.handlers = handlers
  }

  /** Begin listening to keyboard + polling gamepads. */
  start(): void {
    if (this.running) return
    this.running = true
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('gamepadconnected', this.onActivity)
    this.poll()
  }

  /** Stop all listeners + polling (idempotent). */
  stop(): void {
    if (!this.running) return
    this.running = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('gamepadconnected', this.onActivity)
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    // Let the global admin shortcuts (Ctrl+Q, F5) pass through untouched.
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q'))) return
    if (isEditableTarget(e.target)) {
      this.handlers.onActivity?.()
      return
    }

    let handled = true
    switch (e.key) {
      case 'ArrowLeft':
        this.handlers.onPrev()
        break
      case 'ArrowRight':
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

    if (justPressed(BTN_A)) {
      this.handlers.onLaunch()
      activity = true
    }
    if (BACK_BUTTON_INDICES.some(i => justPressed(i))) {
      this.handlers.onBack()
      activity = true
    }

    // Direction from ANY connected pad — see directionFromGamepads. Pulling the
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
