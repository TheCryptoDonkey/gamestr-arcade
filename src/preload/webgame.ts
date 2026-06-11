/**
 * gamestr-arcade — web-game view preload.
 *
 * Injected into the `WebContentsView` that hosts third-party web games.
 * The game view has focus while it runs, so the launcher's renderer can no
 * longer poll `navigator.getGamepads()`.  This preload bridges the gap:
 *   - Polls gamepads via `requestAnimationFrame` (inside the focused view).
 *   - Detects a hold of the Start button (index 9, ≥ 700 ms) and sends
 *     `game:back` to the main process.
 *   - Also catches `Escape` keydown as a keyboard backup.
 *   - Injects a small, unobtrusive on-screen hint bar.
 *
 * Security:
 *   - contextIsolation: true — the page cannot reach this code.
 *   - sandbox: false — required for ipcRenderer.
 *   - Nothing is exposed to the game page via contextBridge.
 */

import { ipcRenderer } from 'electron'

// ── Exit hold detector (pure, exported for unit tests) ────────────────────────

/** Index of the gamepad button used to exit (Standard Mapping: Start). */
export const EXIT_BUTTON_INDEX = 9

/** How long (ms) the button must be held before exit fires. */
export const HOLD_THRESHOLD_MS = 700

/**
 * Tracks the hold state of the exit button across animation frames.
 *
 * Designed to be instantiated once per web-view and driven by the RAF loop;
 * constructed with an injectable `now` function so unit tests can control time.
 */
export class ExitHoldDetector {
  private readonly holdThresholdMs: number
  private readonly now: () => number

  /** Timestamp (ms) when the button first went down; null when not held. */
  private holdSince: number | null = null
  /** True once exit has fired for this hold cycle — prevents double-fire. */
  private fired = false

  constructor(opts: { holdThresholdMs?: number; now?: () => number } = {}) {
    this.holdThresholdMs = opts.holdThresholdMs ?? HOLD_THRESHOLD_MS
    this.now = opts.now ?? (() => performance.now())
  }

  /**
   * Call once per RAF frame with the current pressed state of the exit button.
   *
   * Returns `true` exactly once per hold cycle (when the threshold is first
   * crossed).  Returns `false` on every other call.
   */
  update(pressed: boolean): boolean {
    const t = this.now()

    if (!pressed) {
      // Button released — reset so the next hold can fire again.
      this.holdSince = null
      this.fired = false
      return false
    }

    if (this.holdSince === null) {
      // Button just went down.
      this.holdSince = t
      return false
    }

    if (this.fired) {
      // Already fired this hold cycle — wait for release.
      return false
    }

    if (t - this.holdSince >= this.holdThresholdMs) {
      this.fired = true
      return true
    }

    return false
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
  bar.textContent = 'HOLD START (0.7s) or press Esc → menu'
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

function initGamepadExit(): void {
  const detector = new ExitHoldDetector()

  function tick(): void {
    const pads = navigator.getGamepads()
    let pressed = false
    for (const pad of pads) {
      if (!pad) continue
      const btn = pad.buttons[EXIT_BUTTON_INDEX]
      if (btn && btn.pressed) {
        pressed = true
        break
      }
    }

    if (detector.update(pressed)) {
      ipcRenderer.send('game:back')
    }

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

// ── Boot ──────────────────────────────────────────────────────────────────────
// Guard with typeof checks so the module can be imported in Node (vitest) for
// unit-testing ExitHoldDetector without triggering DOM / RAF side-effects.

if (typeof document !== 'undefined') {
  // Wait for the DOM so we can append the hint bar safely.
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
  initGamepadExit()
}
