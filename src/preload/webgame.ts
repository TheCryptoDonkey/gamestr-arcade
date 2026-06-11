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
 *   - Injects a small, unobtrusive on-screen hint bar.
 *
 * Security:
 *   - contextIsolation: true — the page cannot reach this code.
 *   - sandbox: false — required for ipcRenderer.
 *   - Nothing is exposed to the game page via contextBridge.
 */

import { ipcRenderer } from 'electron'

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

function initGamepadExit(): void {
  const detector = new MenuPressDetector()

  function tick(): void {
    const pads = navigator.getGamepads()
    let pressed = false
    for (const pad of pads) {
      if (!pad) continue
      for (const idx of MENU_BUTTON_INDICES) {
        const btn = pad.buttons[idx]
        if (btn && btn.pressed) {
          pressed = true
          break
        }
      }
      if (pressed) break
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
  initGamepadExit()
}
