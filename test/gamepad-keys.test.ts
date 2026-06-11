/**
 * Unit tests for the gamepad→keyboard translation layer (src/preload/webgame.ts).
 *
 * Tests the pure, side-effect-free classes and helpers:
 *   - GamepadKeyTranslator.diff()  — edge detection, hold suppression, multiple channels
 *   - snapshotFromGamepad()        — d-pad buttons only (left stick is cursor, not keys)
 *   - unionSnapshots()             — multi-gamepad merging
 *   - keyInfo()                    — legacy keyCode lookup table
 *   - resolveControls()            — per-game override merging
 *
 * Control split (since virtual-cursor addition):
 *   Left stick + A (button 0) → virtual cursor + click  (NOT keyboard)
 *   D-pad + X  (button 2)     → arrow keys + Space      (keyboard)
 *
 * What still requires a real gamepad and game page at the booth (NOT covered here):
 *   - dispatchKey() reaching a canvas game's event listeners
 *   - RAF timing / polling latency
 *   - Physical button→Standard Mapping index mapping on the cabinet controller
 */

import { describe, it, expect } from 'vitest'
import {
  GamepadKeyTranslator,
  DEFAULT_CONTROLS,
  resolveControls,
  snapshotFromGamepad,
  unionSnapshots,
  keyInfo,
  STICK_DEAD,
  DPAD,
  FIRE_BUTTONS,
  type InputSnapshot,
  type ResolvedControls,
} from '../src/preload/webgame'

// ── Helpers ────────────────────────────────────────────────────────────────────

const IDLE: InputSnapshot = { up: false, down: false, left: false, right: false, fire: false }

function makeSnapshot(partial: Partial<InputSnapshot>): InputSnapshot {
  return { ...IDLE, ...partial }
}

/** Build a minimal fake Gamepad with the given button indices pressed and axes values. */
function fakeGamepad(options: {
  pressed?: number[]
  axes?: [number, number]
}): Gamepad {
  const pressed = new Set(options.pressed ?? [])
  const axes = options.axes ?? [0, 0]
  // Gamepad has 17 standard buttons (indices 0-16)
  const buttons = Array.from({ length: 17 }, (_, i): GamepadButton => ({
    pressed: pressed.has(i),
    touched: pressed.has(i),
    value:   pressed.has(i) ? 1 : 0,
  }))
  return {
    id:        'Fake Gamepad',
    index:     0,
    connected: true,
    mapping:   'standard',
    timestamp: 0,
    axes:      [axes[0], axes[1]],
    buttons,
    hapticActuators: [],
    vibrationActuator: null as unknown as GamepadHapticActuator,
  }
}

// ── GamepadKeyTranslator ───────────────────────────────────────────────────────

describe('GamepadKeyTranslator — basic edge detection', () => {
  it('pressing left emits keydown ArrowLeft', () => {
    const t = new GamepadKeyTranslator()
    const actions = t.diff(makeSnapshot({ left: true }), DEFAULT_CONTROLS)
    expect(actions).toEqual([{ type: 'keydown', key: 'ArrowLeft' }])
  })

  it('holding left emits nothing on subsequent frames', () => {
    const t = new GamepadKeyTranslator()
    t.diff(makeSnapshot({ left: true }), DEFAULT_CONTROLS) // press
    const actions = t.diff(makeSnapshot({ left: true }), DEFAULT_CONTROLS) // hold
    expect(actions).toHaveLength(0)
  })

  it('releasing left emits keyup ArrowLeft', () => {
    const t = new GamepadKeyTranslator()
    t.diff(makeSnapshot({ left: true }), DEFAULT_CONTROLS)  // press
    t.diff(makeSnapshot({ left: true }), DEFAULT_CONTROLS)  // hold
    const actions = t.diff(IDLE, DEFAULT_CONTROLS)           // release
    expect(actions).toEqual([{ type: 'keyup', key: 'ArrowLeft' }])
  })

  it('no activity when always idle', () => {
    const t = new GamepadKeyTranslator()
    expect(t.diff(IDLE, DEFAULT_CONTROLS)).toHaveLength(0)
    expect(t.diff(IDLE, DEFAULT_CONTROLS)).toHaveLength(0)
  })
})

describe('GamepadKeyTranslator — fire button', () => {
  it('fire active → keydown Space', () => {
    const t = new GamepadKeyTranslator()
    const actions = t.diff(makeSnapshot({ fire: true }), DEFAULT_CONTROLS)
    expect(actions).toEqual([{ type: 'keydown', key: 'Space' }])
  })

  it('fire released → keyup Space', () => {
    const t = new GamepadKeyTranslator()
    t.diff(makeSnapshot({ fire: true }), DEFAULT_CONTROLS)
    const actions = t.diff(IDLE, DEFAULT_CONTROLS)
    expect(actions).toEqual([{ type: 'keyup', key: 'Space' }])
  })
})

describe('GamepadKeyTranslator — diagonal (two channels at once)', () => {
  it('left + up simultaneously → two keydowns', () => {
    const t = new GamepadKeyTranslator()
    const actions = t.diff(makeSnapshot({ left: true, up: true }), DEFAULT_CONTROLS)
    expect(actions).toHaveLength(2)
    expect(actions).toContainEqual({ type: 'keydown', key: 'ArrowLeft' })
    expect(actions).toContainEqual({ type: 'keydown', key: 'ArrowUp' })
  })

  it('releasing one of two simultaneously-held directions only fires keyup for that one', () => {
    const t = new GamepadKeyTranslator()
    t.diff(makeSnapshot({ left: true, up: true }), DEFAULT_CONTROLS) // both pressed
    const actions = t.diff(makeSnapshot({ left: true }), DEFAULT_CONTROLS) // up released
    expect(actions).toEqual([{ type: 'keyup', key: 'ArrowUp' }])
  })
})

describe('GamepadKeyTranslator — all directional defaults', () => {
  it.each([
    ['up',    'ArrowUp'],
    ['down',  'ArrowDown'],
    ['left',  'ArrowLeft'],
    ['right', 'ArrowRight'],
  ] as const)('%s → keydown %s', (dir, key) => {
    const t = new GamepadKeyTranslator()
    const actions = t.diff(makeSnapshot({ [dir]: true }), DEFAULT_CONTROLS)
    expect(actions).toEqual([{ type: 'keydown', key }])
  })
})

describe('GamepadKeyTranslator — remapped controls', () => {
  it('remapped fire to "a" emits keydown a', () => {
    const t = new GamepadKeyTranslator()
    const controls: ResolvedControls = { ...DEFAULT_CONTROLS, fire: 'a' }
    const actions = t.diff(makeSnapshot({ fire: true }), controls)
    expect(actions).toEqual([{ type: 'keydown', key: 'a' }])
  })

  it('remapped left to "z" emits keydown z', () => {
    const t = new GamepadKeyTranslator()
    const controls: ResolvedControls = { ...DEFAULT_CONTROLS, left: 'z' }
    const actions = t.diff(makeSnapshot({ left: true }), controls)
    expect(actions).toEqual([{ type: 'keydown', key: 'z' }])
  })
})

describe('GamepadKeyTranslator — full press/hold/release cycle', () => {
  it('press → hold × 3 → release produces exactly one keydown and one keyup', () => {
    const t = new GamepadKeyTranslator()
    const snap = makeSnapshot({ right: true })
    const down = t.diff(snap, DEFAULT_CONTROLS)
    expect(down).toEqual([{ type: 'keydown', key: 'ArrowRight' }])
    expect(t.diff(snap, DEFAULT_CONTROLS)).toHaveLength(0)
    expect(t.diff(snap, DEFAULT_CONTROLS)).toHaveLength(0)
    expect(t.diff(snap, DEFAULT_CONTROLS)).toHaveLength(0)
    const up = t.diff(IDLE, DEFAULT_CONTROLS)
    expect(up).toEqual([{ type: 'keyup', key: 'ArrowRight' }])
  })
})

// ── resolveControls ────────────────────────────────────────────────────────────

describe('resolveControls', () => {
  it('returns DEFAULT_CONTROLS when no override given', () => {
    expect(resolveControls()).toEqual(DEFAULT_CONTROLS)
    expect(resolveControls({})).toEqual(DEFAULT_CONTROLS)
  })

  it('merges a partial override: only fire overridden', () => {
    const resolved = resolveControls({ fire: 'z' })
    expect(resolved.fire).toBe('z')
    expect(resolved.left).toBe('ArrowLeft')
    expect(resolved.right).toBe('ArrowRight')
    expect(resolved.up).toBe('ArrowUp')
    expect(resolved.down).toBe('ArrowDown')
  })

  it('full override replaces all five fields', () => {
    const resolved = resolveControls({ up: 'w', down: 's', left: 'a', right: 'd', fire: 'Space' })
    expect(resolved).toEqual({ up: 'w', down: 's', left: 'a', right: 'd', fire: 'Space' })
  })
})

// ── snapshotFromGamepad ────────────────────────────────────────────────────────

describe('snapshotFromGamepad — d-pad buttons', () => {
  it('d-pad up (button 12) → up=true', () => {
    const snap = snapshotFromGamepad(fakeGamepad({ pressed: [DPAD.UP] }))
    expect(snap).toMatchObject({ up: true, down: false, left: false, right: false, fire: false })
  })

  it('d-pad down (button 13) → down=true', () => {
    expect(snapshotFromGamepad(fakeGamepad({ pressed: [DPAD.DOWN] }))).toMatchObject({ down: true })
  })

  it('d-pad left (button 14) → left=true', () => {
    expect(snapshotFromGamepad(fakeGamepad({ pressed: [DPAD.LEFT] }))).toMatchObject({ left: true })
  })

  it('d-pad right (button 15) → right=true', () => {
    expect(snapshotFromGamepad(fakeGamepad({ pressed: [DPAD.RIGHT] }))).toMatchObject({ right: true })
  })
})

describe('snapshotFromGamepad — fire buttons', () => {
  it('button 2 (X) → fire=true', () => {
    expect(snapshotFromGamepad(fakeGamepad({ pressed: [FIRE_BUTTONS[0]] }))).toMatchObject({ fire: true })
  })

  it('button 0 (A) → fire=false (A is now cursor click, not fire)', () => {
    expect(snapshotFromGamepad(fakeGamepad({ pressed: [0] }))).toMatchObject({ fire: false })
  })
})

describe('snapshotFromGamepad — left stick axes do NOT affect keyboard snapshot', () => {
  // Since the virtual-cursor addition, the left stick drives the cursor only.
  // It must never contribute to the keyboard InputSnapshot.

  it('stick past deadzone left → left remains false (stick is cursor, not keys)', () => {
    const snap = snapshotFromGamepad(fakeGamepad({ axes: [-(STICK_DEAD + 0.1), 0] }))
    expect(snap.left).toBe(false)
    expect(snap.right).toBe(false)
  })

  it('stick past deadzone right → right remains false', () => {
    const snap = snapshotFromGamepad(fakeGamepad({ axes: [STICK_DEAD + 0.1, 0] }))
    expect(snap.right).toBe(false)
    expect(snap.left).toBe(false)
  })

  it('stick past deadzone up → up remains false', () => {
    const snap = snapshotFromGamepad(fakeGamepad({ axes: [0, -(STICK_DEAD + 0.1)] }))
    expect(snap.up).toBe(false)
    expect(snap.down).toBe(false)
  })

  it('stick past deadzone down → down remains false', () => {
    const snap = snapshotFromGamepad(fakeGamepad({ axes: [0, STICK_DEAD + 0.1] }))
    expect(snap.down).toBe(false)
    expect(snap.up).toBe(false)
  })

  it('stick fully deflected in all directions → all keyboard directions false', () => {
    const snap = snapshotFromGamepad(fakeGamepad({ axes: [1, 1] }))
    expect(snap).toMatchObject({ up: false, down: false, left: false, right: false })
  })
})

describe('snapshotFromGamepad — d-pad only, stick ignored', () => {
  it('d-pad left + stick right → only left=true (stick does not affect keyboard)', () => {
    const snap = snapshotFromGamepad(fakeGamepad({ pressed: [DPAD.LEFT], axes: [STICK_DEAD + 0.1, 0] }))
    expect(snap.left).toBe(true)
    expect(snap.right).toBe(false)   // stick does not contribute
  })
})

describe('snapshotFromGamepad — all idle', () => {
  it('no buttons, stick centred → all false', () => {
    const snap = snapshotFromGamepad(fakeGamepad({}))
    expect(snap).toEqual(IDLE)
  })
})

// ── unionSnapshots ─────────────────────────────────────────────────────────────

describe('unionSnapshots', () => {
  it('idle + idle = idle', () => {
    expect(unionSnapshots(IDLE, IDLE)).toEqual(IDLE)
  })

  it('left on first pad, right on second → both true', () => {
    const a = makeSnapshot({ left: true })
    const b = makeSnapshot({ right: true })
    expect(unionSnapshots(a, b)).toMatchObject({ left: true, right: true })
  })

  it('fire on either pad → fire true', () => {
    expect(unionSnapshots(makeSnapshot({ fire: true }), IDLE)).toMatchObject({ fire: true })
    expect(unionSnapshots(IDLE, makeSnapshot({ fire: true }))).toMatchObject({ fire: true })
  })
})

// ── keyInfo ────────────────────────────────────────────────────────────────────

describe('keyInfo', () => {
  it.each([
    ['ArrowLeft',  37, 'ArrowLeft'],
    ['ArrowUp',    38, 'ArrowUp'],
    ['ArrowRight', 39, 'ArrowRight'],
    ['ArrowDown',  40, 'ArrowDown'],
    ['Space',      32, 'Space'],
  ] as const)('%s → keyCode %d, code %s', (key, code, expectedCode) => {
    const info = keyInfo(key)
    expect(info.keyCode).toBe(code)
    expect(info.code).toBe(expectedCode)
  })

  it('lowercase letter a → KeyA, 65', () => {
    const info = keyInfo('a')
    expect(info.code).toBe('KeyA')
    expect(info.keyCode).toBe(65)
  })

  it('uppercase letter Z → KeyZ, 90', () => {
    const info = keyInfo('Z')
    expect(info.code).toBe('KeyZ')
    expect(info.keyCode).toBe(90)
  })

  it('digit 0 → Digit0, 48', () => {
    const info = keyInfo('0')
    expect(info.code).toBe('Digit0')
    expect(info.keyCode).toBe(48)
  })

  it('unknown key → code=key, keyCode=0', () => {
    const info = keyInfo('Tab')
    expect(info.code).toBe('Tab')
    expect(info.keyCode).toBe(0)
  })
})
