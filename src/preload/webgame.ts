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
 *   - Translates d-pad / face-buttons into synthetic `KeyboardEvent` dispatches
 *     so keyboard-controlled web games respond to a gamepad.
 *   - Left stick drives a virtual mouse cursor; A (button 0) synthesises a click
 *     at the cursor position so mouse-based web-game menus work.
 *   - Injects a small, unobtrusive on-screen hint bar.
 *   - Exposes narrow Nostr/WebLN facades only when the main-process session
 *     grants those declared capabilities. Wallet and signing secrets never
 *     enter this process; privileged operations are brokered over bound IPC.
 *
 * Control split:
 *   Left stick      → virtual mouse cursor          (mouse-based games / menus)
 *   A               → cursor click + fire (Space)   (select menus AND shoot)
 *   D-pad           → arrow keys                    (keyboard-based games)
 *   X               → fire (Space)                  (alternate shoot button)
 *   MENU / 8,9,16   → game:back
 *
 * Security:
 *   - contextIsolation: true — the page cannot reach this code.
 *   - sandbox: true — only Electron's restricted preload APIs are available.
 *   - The NWC URL and ephemeral guest nsec live only in Electron's main process.
 */

import { ipcRenderer, contextBridge } from 'electron'
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
 * Directions come from the d-pad/HAT and the left stick (both move the player);
 * the stick additionally drives the virtual cursor.
 * Fire = A button (index 0) or X button (index 2); A also clicks the cursor.
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
  /** True for an auto-repeat keydown (held key), mirroring `KeyboardEvent.repeat`. */
  repeat?: boolean
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
 * The DOM `KeyboardEvent.key` *value* for a control token.
 *
 * Most tokens already equal their key value ('ArrowLeft', 'a'), but the
 * spacebar is the trap: a real spacebar press has `key === ' '` (a single
 * space), NOT 'Space' — that string is the `code`. Games that gate fire on
 * `e.key === ' '` (Space Zappers does exactly this) never see a synthetic
 * event whose key is 'Space', so the shot never fires. Translate it here while
 * `keyInfo()` still supplies code 'Space' + keyCode 32 for engines that read those.
 */
export function eventKeyValue(token: string): string {
  return token === 'Space' ? ' ' : token
}

/**
 * Synthetic key auto-repeat cadence, matched to the booth's X11 keyboard
 * (`xset q`: auto-repeat delay 500 ms, rate 33/s ≈ 30 ms). A held pad direction
 * therefore repeats exactly like a held keyboard key — essential for step/grid
 * games (Snake, blockstr, Word5) that move per keydown and lean on OS key-repeat
 * for continuous motion. Keyboard players already got this; the pad now matches.
 */
export const KEY_REPEAT_DELAY_MS = 500
export const KEY_REPEAT_INTERVAL_MS = 30

/**
 * Pure, testable gamepad-to-keyboard translator.
 *
 * Call `diff(snapshot, controls, now)` once per RAF frame with the current input
 * state + timestamp. Returns the `KeyAction`s to dispatch: a keydown on the
 * rising edge, auto-repeat keydowns (`repeat: true`) while a button is held — at
 * the booth keyboard's cadence — and a keyup on the falling edge.
 */
export class GamepadKeyTranslator {
  private prev: InputSnapshot = { up: false, down: false, left: false, right: false, fire: false }
  // Per-channel timestamp (ms) at which the next auto-repeat keydown is due.
  private repeatAt: Record<keyof InputSnapshot, number> = { up: 0, down: 0, left: 0, right: 0, fire: 0 }

  /**
   * Diff the new snapshot against the previous frame at time `now` (ms).
   * `now` defaults to 0 so pure edge behaviour stays testable without a clock;
   * production passes the RAF timestamp so auto-repeat fires on schedule.
   */
  diff(next: InputSnapshot, controls: ResolvedControls, now = 0): KeyAction[] {
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
        // Rising edge — initial keydown, then arm the first repeat after the delay.
        actions.push({ type: 'keydown', key: controls[ctrl] })
        this.repeatAt[input] = now + KEY_REPEAT_DELAY_MS
      } else if (wasActive && isActive) {
        // Held — emit auto-repeat keydowns at the keyboard cadence.
        if (now >= this.repeatAt[input]) {
          actions.push({ type: 'keydown', key: controls[ctrl], repeat: true })
          this.repeatAt[input] = now + KEY_REPEAT_INTERVAL_MS
        }
      } else if (wasActive && !isActive) {
        // Falling edge — keyup.
        actions.push({ type: 'keyup', key: controls[ctrl] })
      }
    }

    this.prev = next
    return actions
  }
}

/** Standard Gamepad API d-pad button indices. */
export const DPAD = { UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const

/**
 * Non-standard-mapping d-pad (HAT) axis indices.
 *
 * When Chromium recognises a controller it exposes the W3C "Standard Mapping"
 * and the d-pad arrives as buttons 12–15. When it does NOT — many third-party
 * (non-Microsoft) "Xbox" pads, or the same pad switched to DirectInput mode —
 * `pad.mapping` is "" and the d-pad instead arrives as a HAT carried on two
 * axes: conventionally axes[6] (X: −1 left, +1 right) and axes[7] (Y: −1 up,
 * +1 down), resting at 0 and snapping to ±1.
 *
 * Native (AppImage) games read the HAT themselves via SDL — which is why a
 * non-standard pad still drives "games built for gamepad" — but our keyboard
 * translation only watched buttons 12–15, so the d-pad did nothing in keyboard
 * web games (Space Zappers, Sats-Man). `dpadFromHatAxes` closes that gap.
 */
export const HAT_AXIS = { X: 6, Y: 7 } as const

/**
 * Magnitude past which a HAT axis counts as pressed. A real HAT snaps to 0 / ±1,
 * so 0.5 cleanly separates "centred" from "pushed" with margin to spare.
 */
export const HAT_THRESHOLD = 0.5

/**
 * Fire buttons: A (index 0) and X (left face button, index 2).
 *
 * A *also* drives the virtual-cursor click (see the RAF loop), so pressing A
 * both fires Space and clicks at the cursor. That dual role is intentional and
 * harmless: in-game the click lands on the game canvas, and on the (click-based)
 * menus the Space keypress is a no-op — so binding A to fire gives players the
 * natural "bottom button shoots" instinct without breaking mouse-driven menus.
 */
export const FIRE_BUTTONS = [0, 2] as const

/** Deadzone for the left analogue stick — keyboard snapshot ignores the stick entirely. */
export const STICK_DEAD = 0.5

/**
 * Read d-pad directions from a non-standard controller's HAT axes (see HAT_AXIS).
 *
 * Returns all-false for Standard-Mapping pads — their d-pad is buttons 12–15,
 * read separately — so this never interferes with controllers that already work.
 * Pure; exported for unit tests.
 */
export function dpadFromHatAxes(pad: Gamepad): InputSnapshot {
  if (pad.mapping === 'standard') {
    return { up: false, down: false, left: false, right: false, fire: false }
  }
  const x = pad.axes[HAT_AXIS.X] ?? 0
  const y = pad.axes[HAT_AXIS.Y] ?? 0
  return {
    up:    y <= -HAT_THRESHOLD,
    down:  y >=  HAT_THRESHOLD,
    left:  x <= -HAT_THRESHOLD,
    right: x >=  HAT_THRESHOLD,
    fire:  false,
  }
}

/**
 * Read movement directions from the LEFT ANALOGUE STICK (axes 0 = X, 1 = Y),
 * past STICK_DEAD. Players reach for the stick to move, so it now drives the same
 * movement keys as the d-pad. It ALSO drives the virtual cursor in the RAF loop
 * (with a smaller deadzone) — the two coexist harmlessly: a movement game ignores
 * the hidden cursor, a click game ignores the arrows it never binds. A firm push
 * (≥ STICK_DEAD) moves; a gentle nudge (< STICK_DEAD) only aims the cursor.
 * Pure; exported for tests.
 */
export function stickDirections(pad: Gamepad): InputSnapshot {
  const x = pad.axes[0] ?? 0
  const y = pad.axes[1] ?? 0
  return {
    up:    y <= -STICK_DEAD,
    down:  y >=  STICK_DEAD,
    left:  x <= -STICK_DEAD,
    right: x >=  STICK_DEAD,
    fire:  false,
  }
}

/**
 * Build an `InputSnapshot` from a `Gamepad` object.
 *
 * Directions come from the d-pad (Standard-Mapping buttons 12–15 OR the HAT axes
 * of a non-standard pad — see `dpadFromHatAxes`) UNIONED with the left analogue
 * stick (see `stickDirections`), so both the d-pad and the stick move the player.
 * Fire = A (index 0) or X (index 2); A additionally drives the cursor click.
 */
export function snapshotFromGamepad(pad: Gamepad): InputSnapshot {
  const btn = (i: number) => pad.buttons[i]?.pressed ?? false
  const buttons: InputSnapshot = {
    up:    btn(DPAD.UP),
    down:  btn(DPAD.DOWN),
    left:  btn(DPAD.LEFT),
    right: btn(DPAD.RIGHT),
    fire:  FIRE_BUTTONS.some(i => btn(i)),
  }
  return unionSnapshots(unionSnapshots(buttons, dpadFromHatAxes(pad)), stickDirections(pad))
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

// ── Virtual cursor ─────────────────────────────────────────────────────────────

/**
 * Deadzone for the left stick when driving the virtual cursor.
 * Smaller than STICK_DEAD so the cursor responds to gentle nudges.
 */
export const CURSOR_DEAD = 0.15

/**
 * Maximum cursor speed in pixels per second at full stick deflection.
 * Actual speed = stickMagnitude × CURSOR_SPEED, frame-rate independent.
 */
export const CURSOR_SPEED = 900

/** A 2-D point. */
export interface Vec2 { x: number; y: number }

/** The bounds within which the cursor is clamped. */
export interface CursorBounds { width: number; height: number }

/**
 * Compute the next cursor position given the current position, stick axes,
 * elapsed time in seconds, and the page bounds.
 *
 * Pure and exported so it can be unit-tested independently of the DOM.
 *
 * @param prev   Current cursor position (pixels from top-left).
 * @param stick  Raw left-stick axes [x, y] (each in [-1, 1]).
 * @param dt     Elapsed time since last frame (seconds).
 * @param bounds Page dimensions to clamp within.
 * @returns      New cursor position, clamped to [0, bounds.width] × [0, bounds.height].
 */
export function nextCursorPos(prev: Vec2, stick: [number, number], dt: number, bounds: CursorBounds): Vec2 {
  const [sx, sy] = stick
  const ax = Math.abs(sx) > CURSOR_DEAD ? sx : 0
  const ay = Math.abs(sy) > CURSOR_DEAD ? sy : 0
  return {
    x: Math.max(0, Math.min(bounds.width,  prev.x + ax * CURSOR_SPEED * dt)),
    y: Math.max(0, Math.min(bounds.height, prev.y + ay * CURSOR_SPEED * dt)),
  }
}

/** Default edge-scroll zone (px) and speed (px/s) for cursor-driven page scroll. */
export const SCROLL_EDGE = 48
export const SCROLL_SPEED = 1200

/**
 * How long (ms) the virtual pointer stays visible after the left stick was last
 * used. Visibility only — A always clicks at the cursor's spot (and also fires),
 * so timing never blocks "A to play".
 */
const CURSOR_ACTIVE_MS = 2000

/**
 * Vertical page-scroll delta when the cursor is pinned at the top/bottom edge
 * and the stick keeps pushing further — so pushing the cursor down scrolls long
 * pages (e.g. Sats-Man). Returns 0 when not at an edge. Pure — exported for tests.
 */
export function edgeScrollDelta(
  cursorY: number,
  stickY: number,
  height: number,
  dt: number,
  edgePx = SCROLL_EDGE,
  speed = SCROLL_SPEED,
): number {
  if (stickY > CURSOR_DEAD && cursorY >= height - edgePx) return stickY * speed * dt
  if (stickY < -CURSOR_DEAD && cursorY <= edgePx) return stickY * speed * dt
  return 0
}

/**
 * Returns true on the first frame that `pressed` is true after being false.
 * Stateless helper — the caller owns the `prev` boolean.
 *
 * Exported for unit testing.
 */
export function risingEdge(prev: boolean, current: boolean): boolean {
  return !prev && current
}

// ── Brokered WebLN facade ─────────────────────────────────────────────────────

/**
 * Expose only the WebLN methods required by games. Main validates sender,
 * frame origin, capability, invoice, rate, idempotency and budgets before the
 * NWC provider is touched. Keysend, wallet signing and invoice creation are not
 * available to untrusted game content.
 */
function initWebLN(): void {
  const weblnApi = {
    enable: async (): Promise<void> => {},
    getInfo: async () => ({ methods: ['sendPayment'] }),
    sendPayment: (bolt11: string): Promise<{ preimage: string }> =>
      ipcRenderer.invoke('webgame:wallet:pay', bolt11),
  }

  // contextBridge.exposeInMainWorld is safe to call multiple times with the
  // same key — Electron throws on duplicate registrations. Guard with a flag
  // stored on the global object so reloads are handled cleanly.
  if (!(globalThis as Record<string, unknown>).__arcadeWebLNExposed) {
    contextBridge.exposeInMainWorld('webln', weblnApi)
    ;(globalThis as Record<string, unknown>).__arcadeWebLNExposed = true
  }
}

// ── Brokered guest Nostr (NIP-07) facade ──────────────────────────────────────

/**
 * Inject a guest NIP-07 `window.nostr` only after main grants `nostrSign` for
 * this manifest. Main owns the per-session key, validates the calling origin
 * and strictly bounds event templates before signing.
 *
 * A fresh key each session keeps booth players distinct on the board. nip04/nip44
 * are intentionally omitted — a kiosk guest never needs to decrypt DMs.
 */
function initGuestNostr(): void {
  if ((globalThis as Record<string, unknown>).__arcadeNostrExposed) return

  const nostrApi = {
    getPublicKey: (): Promise<string> => ipcRenderer.invoke('webgame:nostr:get-public-key'),
    signEvent: async (event: { kind: number; created_at?: number; tags?: string[][]; content?: string }) =>
      ipcRenderer.invoke('webgame:nostr:sign-event', event),
    getRelays: async (): Promise<Record<string, { read: boolean; write: boolean }>> => ({}),
  }

  try {
    contextBridge.exposeInMainWorld('nostr', nostrApi)
    ;(globalThis as Record<string, unknown>).__arcadeNostrExposed = true
  } catch (err) {
    // A real extension / prior expose already owns window.nostr — leave it be.
    console.error(`[arcade] guest nostr: expose skipped (${String(err)})`)
  }
}

/**
 * Dispatch a synthetic KeyboardEvent for `action` directly onto multiple
 * targets so games that listen on different objects all receive it.
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
 * Events are non-bubbling because each intended receiver is dispatched to
 * explicitly; bubbling caused document/window listeners to receive duplicates
 * from canvas/active-element dispatches plus their own direct dispatch.
 *
 * Legacy `keyCode` / `which` / `charCode` fields are populated from `keyInfo()`
 * for old-school games that read them instead of (or alongside) `key`.
 */
export function dispatchKey(action: KeyAction): void {
  const { code, keyCode } = keyInfo(action.key)
  const init: KeyboardEventInit = {
    key:        eventKeyValue(action.key),
    code,
    keyCode,
    which:      keyCode,
    // KeyAction is keydown/keyup only; printable keypress gets its own event below.
    charCode:   0,
    repeat:     action.repeat ?? false,
    bubbles:    false,
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

// ── Virtual cursor DOM element ────────────────────────────────────────────────

/**
 * Inject the virtual cursor element into the page.
 * Returns the element so the RAF loop can update its position.
 * Safe to call multiple times — returns the existing element if already present.
 */
function injectCursorElement(): HTMLElement {
  const existing = document.getElementById('__arcade_cursor')
  if (existing) return existing

  const el = document.createElement('div')
  el.id = '__arcade_cursor'
  Object.assign(el.style, {
    position:     'fixed',
    width:        '20px',
    height:       '20px',
    borderRadius: '50%',
    border:       '2px solid #fff',
    background:   'rgba(124,243,255,0.35)',
    boxShadow:    '0 0 0 1px rgba(0,0,0,0.6)',
    pointerEvents:'none',
    zIndex:       '2147483646',
    display:      'none',              // hidden until a gamepad connects
    transform:    'translate(-50%,-50%)',
    transition:   'none',
    willChange:   'transform',
  })
  document.body?.appendChild(el)
  return el
}

/**
 * Move the cursor element to `pos` and optionally show it.
 */
function moveCursorElement(el: HTMLElement, pos: Vec2, visible: boolean): void {
  el.style.display = visible ? 'block' : 'none'
  el.style.left = `${pos.x}px`
  el.style.top  = `${pos.y}px`
}

// ── Synthetic click + hover dispatch ─────────────────────────────────────────

/**
 * Synthesise a full mouse/pointer click sequence at (x, y).
 *
 * Dispatch order per spec:
 *   pointermove → mousemove → pointerdown → mousedown → pointerup → mouseup → click
 *
 * The target element is determined by `document.elementFromPoint(x, y)` so
 * both DOM-button menus (click lands on the element) and canvas games (which
 * hit-test clientX/clientY) receive the event correctly.
 */
export function dispatchClick(x: number, y: number): void {
  const target = document.elementFromPoint(x, y) ?? document.body
  if (!target) return

  const base = {
    bubbles:    true,
    cancelable: true,
    composed:   true,
    clientX:    x,
    clientY:    y,
    screenX:    x,
    screenY:    y,
    view:       window,
    button:     0,
  }

  const pointerBase: PointerEventInit = {
    ...base,
    pointerId:   1,
    pointerType: 'mouse',
    isPrimary:   true,
  }

  target.dispatchEvent(new PointerEvent('pointermove', { ...pointerBase, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('mousemove',    { ...base, buttons: 0 }))
  target.dispatchEvent(new PointerEvent('pointerdown', { ...pointerBase, buttons: 1 }))
  target.dispatchEvent(new MouseEvent('mousedown',    { ...base, buttons: 1 }))
  target.dispatchEvent(new PointerEvent('pointerup',   { ...pointerBase, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('mouseup',      { ...base, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('click',        { ...base, buttons: 0 }))
}

/**
 * Dispatch a throttled `pointermove` + `mousemove` at the cursor position so
 * DOM hover states update as the cursor moves across buttons.
 *
 * The element under the cursor receives the events; both `document` and
 * `window` also receive them for games that listen there.
 */
function dispatchHover(x: number, y: number): void {
  const target = document.elementFromPoint(x, y) ?? document.body
  if (!target) return

  const base = {
    bubbles: true, cancelable: true, composed: true,
    clientX: x, clientY: y, screenX: x, screenY: y,
    view: window, button: 0, buttons: 0,
  }
  const pointerBase: PointerEventInit = {
    ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true,
  }

  target.dispatchEvent(new PointerEvent('pointermove', pointerBase))
  target.dispatchEvent(new MouseEvent('mousemove', base))
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
  bar.textContent = 'Left stick = cursor · A = fire/select · D-pad = move · X = fire · MENU = back'
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

  // Virtual cursor state.
  let cursorPos: Vec2 = {
    x: (typeof window !== 'undefined' ? window.innerWidth  : 800) / 2,
    y: (typeof window !== 'undefined' ? window.innerHeight : 600) / 2,
  }
  let cursorEl: HTMLElement | null = null
  let gamepadConnected  = false
  let prevClickPressed  = false
  let lastHoverTime     = 0     // timestamp for hover throttle (ms)
  let lastFrameTime     = 0     // for delta-time calculation
  let lastStickActive   = 0     // timestamp the left stick was last used (cursor engage)

  // ── Temporary gamepad diagnostics (plan Phase 2A) ────────────────────────────
  // Throttled so journald isn't spammed; forwarded to main via the webContents
  // 'console-message' hook (wireGamepadConsole in index.ts). `focus`/`vis` reveal
  // whether Chromium's Gamepad API is even fed (it only updates a focused, visible
  // document). Remove with the rest of the [gp:*] logging in plan Phase 2D.
  let lastGpDiag = 0
  function gpSummary(): string {
    const live = Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[]
    const detail = live
      .map(p => `${p.index}:"${(p.id || '').slice(0, 28)}" map=${p.mapping || 'none'} btn=${p.buttons.length} ax=${p.axes.length}`)
      .join(' | ')
    return `pads=${live.length} focus=${document.hasFocus()} vis=${document.visibilityState} ${detail}`
  }
  window.addEventListener('gamepadconnected', e => {
    const g = (e as GamepadEvent).gamepad
    console.log(`[gp:web] connected idx=${g.index} id="${g.id}" map=${g.mapping || 'none'}`)
  })
  window.addEventListener('gamepaddisconnected', e => {
    const g = (e as GamepadEvent).gamepad
    console.log(`[gp:web] disconnected idx=${g.index} id="${g.id}"`)
  })

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
    console.log(`[gp:web] controls applied; doc-focused=${document.hasFocus()}`)
  })

  // Main sends only non-sensitive boolean grants after each navigation. No NWC
  // URL, budget, nsec, or other privileged configuration enters this process.
  ipcRenderer.on('arcade:session-grants', (_event, grants: { nostrSign?: boolean; walletPay?: boolean }) => {
    if (grants.nostrSign === true) initGuestNostr()
    if (grants.walletPay === true) initWebLN()
  })

  function tick(now: number): void {
    // ── Delta time (seconds) ──────────────────────────────────────────────
    const dt = lastFrameTime > 0 ? Math.min((now - lastFrameTime) / 1000, 0.1) : 1 / 60
    lastFrameTime = now

    if (now - lastGpDiag > 1000) {
      lastGpDiag = now
      console.log(`[gp:web] hb ${gpSummary()}`)
    }

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

    // ── Gamepad → keyboard translation (D-pad + X fire) ──────────────────
    let combined: InputSnapshot = { up: false, down: false, left: false, right: false, fire: false }
    gamepadConnected = false
    for (const pad of pads) {
      if (!pad) continue
      gamepadConnected = true
      combined = unionSnapshots(combined, snapshotFromGamepad(pad))
    }

    const actions = keyTranslator.diff(combined, activeControls, now)
    for (const action of actions) {
      dispatchKey(action)
    }

    // ── Virtual cursor (left stick) ───────────────────────────────────────
    // A plain pointer: the left stick moves it, A clicks exactly where it points.
    // No magnet (so wide buttons can't trap the cursor) and A is never hijacked
    // from play — A ALSO fires via the keyboard channel (FIRE_BUTTONS), so one A
    // press both clicks the cursor's spot AND fires in-game. The pointer shows
    // only for a short window after the stick is used, so d-pad-only play stays
    // clutter-free.
    if (gamepadConnected) {
      // Aggregate left-stick axes across all connected pads (first non-zero wins).
      let stickX = 0
      let stickY = 0
      for (const pad of pads) {
        if (!pad) continue
        const ax = pad.axes[0] ?? 0
        const ay = pad.axes[1] ?? 0
        if (Math.abs(ax) > CURSOR_DEAD || Math.abs(ay) > CURSOR_DEAD) {
          stickX = ax
          stickY = ay
          break
        }
      }
      if (Math.hypot(stickX, stickY) > CURSOR_DEAD) {
        lastStickActive = now
        const bounds: CursorBounds = { width: window.innerWidth, height: window.innerHeight }
        cursorPos = nextCursorPos(cursorPos, [stickX, stickY], dt, bounds)
        // Edge scroll: at the top/bottom edge a further stick push scrolls the page.
        const scrollDy = edgeScrollDelta(cursorPos.y, stickY, bounds.height, dt)
        if (scrollDy !== 0) window.scrollBy(0, scrollDy)
      }

      // The pointer is "live" (visible) for a short window after the stick moved.
      const cursorLive = now - lastStickActive < CURSOR_ACTIVE_MS
      if (cursorLive) {
        if (!cursorEl && typeof document !== 'undefined' && document.body) {
          cursorEl = injectCursorElement()
        }
        if (cursorEl) moveCursorElement(cursorEl, cursorPos, true)
        if (now - lastHoverTime > 33) {
          dispatchHover(cursorPos.x, cursorPos.y)
          lastHoverTime = now
        }
      } else if (cursorEl) {
        moveCursorElement(cursorEl, cursorPos, false)
      }

      // ── A (button 0): click where the cursor points (menus / mouse games).
      // A also fires Space via the keyboard channel, so this never blocks play.
      let clickPressed = false
      for (const pad of pads) {
        if (!pad) continue
        if (pad.buttons[0]?.pressed) { clickPressed = true; break }
      }
      if (risingEdge(prevClickPressed, clickPressed)) {
        dispatchClick(cursorPos.x, cursorPos.y)
      }
      prevClickPressed = clickPressed

    } else {
      // No gamepad — hide the cursor.
      if (cursorEl) {
        moveCursorElement(cursorEl, cursorPos, false)
      }
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
