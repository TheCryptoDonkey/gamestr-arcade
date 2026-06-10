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

/** Standard-mapping gamepad button indices we care about. */
const BTN_A = 0 // bottom face button → launch
const BTN_START = 9 // start → back
const BTN_DPAD_LEFT = 14
const BTN_DPAD_RIGHT = 15

/** Analogue stick deadzone and repeat cadence (ms) for held directions. */
const STICK_DEADZONE = 0.5
const REPEAT_INITIAL_MS = 420
const REPEAT_INTERVAL_MS = 140

type Direction = -1 | 0 | 1

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
    const pads = navigator.getGamepads?.() ?? []
    const pad = Array.from(pads).find((p): p is Gamepad => p != null)
    if (!pad) {
      this.heldDir = 0
      this.prevButtons = []
      return
    }

    let activity = false

    // Edge-detect face buttons (fire once per press, never per held frame).
    const pressed = (i: number): boolean => !!pad.buttons[i]?.pressed
    const justPressed = (i: number): boolean => pressed(i) && !this.prevButtons[i]

    if (justPressed(BTN_A)) {
      this.handlers.onLaunch()
      activity = true
    }
    if (justPressed(BTN_START)) {
      this.handlers.onBack()
      activity = true
    }

    // Direction from d-pad OR left stick (whichever is engaged).
    const axisX = pad.axes[0] ?? 0
    let dir: Direction = 0
    if (pressed(BTN_DPAD_LEFT) || axisX <= -STICK_DEADZONE) dir = -1
    else if (pressed(BTN_DPAD_RIGHT) || axisX >= STICK_DEADZONE) dir = 1

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

    // Snapshot button state for next-frame edge detection.
    this.prevButtons = pad.buttons.map(b => b.pressed)

    if (activity) this.handlers.onActivity?.()
  }

  private fireDirection(dir: Direction): void {
    if (dir === -1) this.handlers.onPrev()
    else if (dir === 1) this.handlers.onNext()
  }
}
