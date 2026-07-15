/**
 * Unit tests for the gamepad virtual cursor helpers (src/preload/webgame.ts).
 *
 * Tests the pure, side-effect-free functions:
 *   - nextCursorPos()  - stick-to-pixel movement, clamp, deadzone, speed scaling
 *   - risingEdge()     - edge detector used for A-button click
 *
 * What still requires a real gamepad + browser page at the booth (NOT covered):
 *   - dispatchClick() DOM event delivery to a canvas / DOM-button game
 *   - dispatchHover() updating CSS :hover state on real elements
 *   - elementFromPoint() returning the correct element for the cursor position
 *   - RAF timing accuracy and visual cursor rendering
 *   - Physical button 0 (A) on the cabinet controller
 */

import { describe, it, expect } from 'vitest'
import {
  nextCursorPos,
  risingEdge,
  CURSOR_DEAD,
  CURSOR_SPEED,
  type Vec2,
  type CursorBounds,
} from '../src/preload/webgame'

// ── Helpers ────────────────────────────────────────────────────────────────────

const BOUNDS: CursorBounds = { width: 1920, height: 1080 }
const CENTRE: Vec2 = { x: 960, y: 540 }

/** Run nextCursorPos with a fixed 60 Hz frame (≈16.67 ms). */
function step(prev: Vec2, stick: [number, number], bounds = BOUNDS): Vec2 {
  return nextCursorPos(prev, stick, 1 / 60, bounds)
}

// ── nextCursorPos - deadzone ───────────────────────────────────────────────────

describe('nextCursorPos - deadzone', () => {
  it('stick exactly at zero → no movement', () => {
    const next = step(CENTRE, [0, 0])
    expect(next).toEqual(CENTRE)
  })

  it('stick just inside deadzone on x → no movement', () => {
    const next = step(CENTRE, [CURSOR_DEAD - 0.01, 0])
    expect(next).toEqual(CENTRE)
  })

  it('stick exactly at deadzone boundary on x → no movement', () => {
    // Values ≤ CURSOR_DEAD are inside deadzone (Math.abs(sx) > CURSOR_DEAD is false).
    const next = step(CENTRE, [CURSOR_DEAD, 0])
    expect(next).toEqual(CENTRE)
  })

  it('stick just inside deadzone on y → no movement', () => {
    const next = step(CENTRE, [0, -(CURSOR_DEAD - 0.01)])
    expect(next).toEqual(CENTRE)
  })

  it('negative stick inside deadzone → no movement', () => {
    const next = step(CENTRE, [-CURSOR_DEAD + 0.01, -CURSOR_DEAD + 0.01])
    expect(next).toEqual(CENTRE)
  })
})

// ── nextCursorPos - direction ─────────────────────────────────────────────────

describe('nextCursorPos - direction', () => {
  it('full right stick → cursor moves right', () => {
    const next = step(CENTRE, [1, 0])
    expect(next.x).toBeGreaterThan(CENTRE.x)
    expect(next.y).toBe(CENTRE.y)
  })

  it('full left stick → cursor moves left', () => {
    const next = step(CENTRE, [-1, 0])
    expect(next.x).toBeLessThan(CENTRE.x)
    expect(next.y).toBe(CENTRE.y)
  })

  it('full down stick → cursor moves down', () => {
    const next = step(CENTRE, [0, 1])
    expect(next.y).toBeGreaterThan(CENTRE.y)
    expect(next.x).toBe(CENTRE.x)
  })

  it('full up stick → cursor moves up', () => {
    const next = step(CENTRE, [0, -1])
    expect(next.y).toBeLessThan(CENTRE.y)
    expect(next.x).toBe(CENTRE.x)
  })

  it('diagonal stick → moves both x and y', () => {
    const next = step(CENTRE, [0.8, 0.6])
    expect(next.x).toBeGreaterThan(CENTRE.x)
    expect(next.y).toBeGreaterThan(CENTRE.y)
  })
})

// ── nextCursorPos - speed scaling ─────────────────────────────────────────────

describe('nextCursorPos - speed scaling', () => {
  it('full stick for 1 second moves exactly CURSOR_SPEED pixels', () => {
    const next = nextCursorPos(CENTRE, [1, 0], 1, BOUNDS)
    expect(next.x).toBeCloseTo(CENTRE.x + CURSOR_SPEED, 5)
    expect(next.y).toBe(CENTRE.y)
  })

  it('half-deflection moves at half the speed', () => {
    const full = nextCursorPos(CENTRE, [1, 0], 1, BOUNDS)
    const half = nextCursorPos(CENTRE, [0.5, 0], 1, BOUNDS)
    expect(half.x).toBeCloseTo(CENTRE.x + CURSOR_SPEED * 0.5, 5)
    expect(full.x - CENTRE.x).toBeCloseTo(2 * (half.x - CENTRE.x), 5)
  })

  it('movement is proportional to dt (frame-rate independent)', () => {
    const at60fps   = nextCursorPos(CENTRE, [1, 0], 1 / 60,  BOUNDS)
    const at30fps   = nextCursorPos(CENTRE, [1, 0], 1 / 30,  BOUNDS)
    const at144fps  = nextCursorPos(CENTRE, [1, 0], 1 / 144, BOUNDS)
    // 30 fps moves twice as far per frame as 60 fps.
    expect(at30fps.x - CENTRE.x).toBeCloseTo(2 * (at60fps.x - CENTRE.x), 5)
    // 144 fps moves less per frame than 60 fps.
    expect(at144fps.x).toBeLessThan(at60fps.x)
  })
})

// ── nextCursorPos - clamping ───────────────────────────────────────────────────

describe('nextCursorPos - edge clamping', () => {
  it('clamps at right edge (x = bounds.width)', () => {
    const nearRight: Vec2 = { x: BOUNDS.width - 1, y: CENTRE.y }
    const next = step(nearRight, [1, 0])
    expect(next.x).toBe(BOUNDS.width)
  })

  it('clamps at left edge (x = 0)', () => {
    const nearLeft: Vec2 = { x: 1, y: CENTRE.y }
    const next = step(nearLeft, [-1, 0])
    expect(next.x).toBe(0)
  })

  it('clamps at bottom edge (y = bounds.height)', () => {
    const nearBottom: Vec2 = { x: CENTRE.x, y: BOUNDS.height - 1 }
    const next = step(nearBottom, [0, 1])
    expect(next.y).toBe(BOUNDS.height)
  })

  it('clamps at top edge (y = 0)', () => {
    const nearTop: Vec2 = { x: CENTRE.x, y: 1 }
    const next = step(nearTop, [0, -1])
    expect(next.y).toBe(0)
  })

  it('starting outside bounds → clamped to [0, width] × [0, height]', () => {
    const outside: Vec2 = { x: -100, y: -200 }
    const next = step(outside, [0, 0])
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
  })

  it('does not overshoot the right edge with high-speed stick', () => {
    const atEdge: Vec2 = { x: BOUNDS.width, y: CENTRE.y }
    const next = nextCursorPos(atEdge, [1, 0], 10, BOUNDS)  // huge dt
    expect(next.x).toBe(BOUNDS.width)
  })

  it('does not overshoot the bottom edge with high-speed stick', () => {
    const atEdge: Vec2 = { x: CENTRE.x, y: BOUNDS.height }
    const next = nextCursorPos(atEdge, [0, 1], 10, BOUNDS)  // huge dt
    expect(next.y).toBe(BOUNDS.height)
  })
})

// ── nextCursorPos - small bounds ──────────────────────────────────────────────

describe('nextCursorPos - small bounds', () => {
  it('clamps correctly within a 100×100 viewport', () => {
    const tiny: CursorBounds = { width: 100, height: 100 }
    const pos: Vec2 = { x: 50, y: 50 }
    const next = nextCursorPos(pos, [1, 1], 1, tiny)
    expect(next.x).toBe(100)
    expect(next.y).toBe(100)
  })
})

// ── risingEdge ────────────────────────────────────────────────────────────────

describe('risingEdge', () => {
  it('false → false: no edge', () => {
    expect(risingEdge(false, false)).toBe(false)
  })

  it('false → true: rising edge fires', () => {
    expect(risingEdge(false, true)).toBe(true)
  })

  it('true → true: already held, no edge', () => {
    expect(risingEdge(true, true)).toBe(false)
  })

  it('true → false: falling edge, no fire', () => {
    expect(risingEdge(true, false)).toBe(false)
  })

  it('simulates a full press/hold/release cycle', () => {
    let prev = false
    // Press
    expect(risingEdge(prev, true)).toBe(true);  prev = true
    // Hold × 3
    expect(risingEdge(prev, true)).toBe(false); prev = true
    expect(risingEdge(prev, true)).toBe(false); prev = true
    expect(risingEdge(prev, true)).toBe(false); prev = true
    // Release
    expect(risingEdge(prev, false)).toBe(false); prev = false
    // Press again
    expect(risingEdge(prev, true)).toBe(true);  prev = true
  })

  it('rapid press / release / press fires twice', () => {
    let prev = false
    expect(risingEdge(prev, true)).toBe(true);  prev = true
    expect(risingEdge(prev, false)).toBe(false); prev = false
    expect(risingEdge(prev, true)).toBe(true)
  })
})
