/**
 * Unit tests for the menu navigator's gamepad direction resolver
 * (src/renderer/src/ui/input.ts → directionFromGamepad).
 *
 * This is the menu-side counterpart to gamepad-keys.test.ts (which covers the
 * in-game keyboard translation in src/preload/webgame.ts). Both booths use an
 * official Xbox pad, but they enumerate differently:
 *
 *   • .32 booth      — Chromium gives it the W3C Standard Mapping; the d-pad is
 *                      buttons 12–15 and `pad.mapping === 'standard'`.
 *   • bitfest-1      — its pad's connection lands OUTSIDE the mapping table, so
 *                      `pad.mapping === ''` and the d-pad is a HAT on axes 6/7.
 *
 * The menu must navigate on BOTH pads, horizontally AND vertically, from the
 * d-pad OR the analogue stick — and the HAT path must stay gated behind the
 * non-standard mapping so it can never disturb a pad that already works. These
 * tests lock all of that in so it can't silently regress.
 *
 * Not covered here (needs a real pad + RAF loop at the booth): InputController's
 * auto-repeat cadence, edge detection of A / Start, and navigator polling.
 */

import { describe, it, expect } from 'vitest'
import {
  directionFromGamepad,
  DPAD,
  STICK_DEADZONE,
  type Direction,
} from '../src/renderer/src/ui/input'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a fake Gamepad. Defaults to the Standard Mapping; pass `mapping: ''` for
 * a non-standard pad. The d-pad HAT always lives on axes[6] (X) / axes[7] (Y)
 * and the left stick on axes[0] (X) / axes[1] (Y), so the same builder exercises
 * both code paths — the resolver decides which axes to honour from `mapping`.
 */
function fakePad(opts: {
  mapping?: GamepadMappingType
  pressed?: number[]
  stick?: [number, number]
  hat?: [number, number]
}): Gamepad {
  const pressed = new Set(opts.pressed ?? [])
  const [sx, sy] = opts.stick ?? [0, 0]
  const [hx, hy] = opts.hat ?? [0, 0]
  const buttons = Array.from({ length: 17 }, (_, i): GamepadButton => ({
    pressed: pressed.has(i),
    touched: pressed.has(i),
    value:   pressed.has(i) ? 1 : 0,
  }))
  // LX, LY, LT, RX, RY, RT, HAT0X, HAT0Y — stick on 0/1, d-pad HAT on 6/7.
  const axes = [sx, sy, 0, 0, 0, 0, hx, hy]
  return {
    id:        opts.mapping === '' ? 'Fake Non-Standard Pad' : 'Fake Standard Pad',
    index:     0,
    connected: true,
    mapping:   opts.mapping ?? 'standard',
    timestamp: 0,
    axes,
    buttons,
    hapticActuators:   [],
    vibrationActuator: null as unknown as GamepadHapticActuator,
  }
}

const PUSH = STICK_DEADZONE + 0.1 // safely past the deadzone
const NUDGE = STICK_DEADZONE - 0.2 // safely short of it

const PREV: Direction = -1
const NONE: Direction = 0
const NEXT: Direction = 1

// ── Standard-Mapping pad: d-pad buttons ──────────────────────────────────────
// The .32 booth. D-pad is buttons 12–15; the stick is axes 0/1.

describe('directionFromGamepad — standard pad, d-pad buttons', () => {
  it('d-pad left (button 14) → prev', () => {
    expect(directionFromGamepad(fakePad({ pressed: [DPAD.LEFT] }))).toBe(PREV)
  })

  it('d-pad right (button 15) → next', () => {
    expect(directionFromGamepad(fakePad({ pressed: [DPAD.RIGHT] }))).toBe(NEXT)
  })

  it('d-pad up (button 12) → prev (vertical now navigates)', () => {
    expect(directionFromGamepad(fakePad({ pressed: [DPAD.UP] }))).toBe(PREV)
  })

  it('d-pad down (button 13) → next (vertical now navigates)', () => {
    expect(directionFromGamepad(fakePad({ pressed: [DPAD.DOWN] }))).toBe(NEXT)
  })

  it('nothing pressed, sticks centred → none', () => {
    expect(directionFromGamepad(fakePad({}))).toBe(NONE)
  })
})

// ── Standard-Mapping pad: analogue stick (both axes) ─────────────────────────

describe('directionFromGamepad — standard pad, analogue stick', () => {
  it('stick left (axes[0] = −1) → prev', () => {
    expect(directionFromGamepad(fakePad({ stick: [-1, 0] }))).toBe(PREV)
  })

  it('stick right (axes[0] = +1) → next', () => {
    expect(directionFromGamepad(fakePad({ stick: [1, 0] }))).toBe(NEXT)
  })

  it('stick up (axes[1] = −1) → prev', () => {
    expect(directionFromGamepad(fakePad({ stick: [0, -1] }))).toBe(PREV)
  })

  it('stick down (axes[1] = +1) → next', () => {
    expect(directionFromGamepad(fakePad({ stick: [0, 1] }))).toBe(NEXT)
  })

  it('stick just past the deadzone counts; just short of it does not', () => {
    expect(directionFromGamepad(fakePad({ stick: [PUSH, 0] }))).toBe(NEXT)
    expect(directionFromGamepad(fakePad({ stick: [NUDGE, 0] }))).toBe(NONE)
    expect(directionFromGamepad(fakePad({ stick: [0, -PUSH] }))).toBe(PREV)
    expect(directionFromGamepad(fakePad({ stick: [0, -NUDGE] }))).toBe(NONE)
  })
})

// ── Non-standard pad: d-pad on the HAT axes ──────────────────────────────────
// bitfest-1's pad. D-pad is a HAT on axes 6/7; mapping is "".

describe('directionFromGamepad — non-standard pad, d-pad HAT axes', () => {
  it('HAT x = −1 (axes[6]) → prev — the bitfest-1 menu regression', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', hat: [-1, 0] }))).toBe(PREV)
  })

  it('HAT x = +1 → next', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', hat: [1, 0] }))).toBe(NEXT)
  })

  it('HAT y = −1 (axes[7]) → prev (vertical d-pad on the HAT)', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', hat: [0, -1] }))).toBe(PREV)
  })

  it('HAT y = +1 → next', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', hat: [0, 1] }))).toBe(NEXT)
  })

  it('HAT centred → none', () => {
    expect(directionFromGamepad(fakePad({ mapping: '' }))).toBe(NONE)
  })

  it('HAT x = −0.3 (below threshold) → none', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', hat: [-0.3, 0] }))).toBe(NONE)
  })

  it('the left stick still navigates on a non-standard pad too', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', stick: [0, 1] }))).toBe(NEXT)
    expect(directionFromGamepad(fakePad({ mapping: '', stick: [-1, 0] }))).toBe(PREV)
  })
})

// ── Controller detection: the mapping gates the HAT read ─────────────────────
// The crux of "make sure both controllers work and we can tell them apart": a
// Standard-Mapping pad must NEVER read the HAT axes (its d-pad is buttons 12–15
// and those same axis indices may carry a trigger/stick), while a non-standard
// pad must.

describe('directionFromGamepad — mapping gates the HAT (detect between pads)', () => {
  it('standard pad with HAT axes deflected → ignored (none)', () => {
    expect(directionFromGamepad(fakePad({ mapping: 'standard', hat: [-1, 0] }))).toBe(NONE)
    expect(directionFromGamepad(fakePad({ mapping: 'standard', hat: [0, 1] }))).toBe(NONE)
  })

  it('non-standard pad with the SAME HAT deflection → honoured', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', hat: [-1, 0] }))).toBe(PREV)
    expect(directionFromGamepad(fakePad({ mapping: '', hat: [0, 1] }))).toBe(NEXT)
  })

  it('standard pad still navigates by buttons + stick despite the HAT being ignored', () => {
    expect(directionFromGamepad(fakePad({ mapping: 'standard', pressed: [DPAD.UP], hat: [1, 1] }))).toBe(PREV)
    expect(directionFromGamepad(fakePad({ mapping: 'standard', stick: [1, 0], hat: [-1, -1] }))).toBe(NEXT)
  })
})

// ── Precedence ───────────────────────────────────────────────────────────────

describe('directionFromGamepad — precedence & merging', () => {
  it('prev wins when prev and next are both asserted', () => {
    // Left (prev) and right (next) at once — prev takes precedence, matching the
    // original left-before-right ordering.
    expect(directionFromGamepad(fakePad({ pressed: [DPAD.LEFT, DPAD.RIGHT] }))).toBe(PREV)
  })

  it('d-pad and stick agreeing both resolve the same way', () => {
    expect(directionFromGamepad(fakePad({ pressed: [DPAD.DOWN], stick: [0, 1] }))).toBe(NEXT)
  })

  it('a disconnected-feeling pad (no buttons, axes centred) → none', () => {
    expect(directionFromGamepad(fakePad({ mapping: '', stick: [0, 0], hat: [0, 0] }))).toBe(NONE)
  })
})
