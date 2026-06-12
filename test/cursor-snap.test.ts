/**
 * Unit tests for the virtual-cursor maths (src/preload/webgame.ts):
 *   - snapToNearest  — magnetic pull toward the nearest clickable
 *   - edgeScrollDelta — cursor-driven page scroll at the top/bottom edge
 *
 * Pure functions only — no DOM, no gamepad, no Electron.
 */

import { describe, it, expect } from 'vitest'
import {
  snapToNearest,
  edgeScrollDelta,
  SNAP_MAX_DIST,
  SCROLL_SPEED,
  type ButtonRect,
} from '../src/preload/webgame'

// ── snapToNearest ────────────────────────────────────────────────────────────

describe('snapToNearest', () => {
  it('returns null when nothing is within range', () => {
    const rects: ButtonRect[] = [{ x: 1000, y: 1000, w: 40, h: 20 }]
    expect(snapToNearest({ x: 0, y: 0 }, rects)).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(snapToNearest({ x: 50, y: 50 }, [])).toBeNull()
  })

  it('snaps toward a nearby button (from outside) without yanking to its centre', () => {
    const rects: ButtonRect[] = [{ x: 100, y: 100, w: 40, h: 20 }] // x[100,140] y[100,120]
    const snap = snapToNearest({ x: 70, y: 110 }, rects)
    expect(snap).not.toBeNull()
    expect(snap!.index).toBe(0)
    // Pulled toward the nearest EDGE (x≈100), not the far centre (x=120).
    expect(snap!.pos.x).toBeGreaterThan(70)
    expect(snap!.pos.x).toBeLessThan(100)
  })

  it('applies no pull once the cursor is inside the button (free to move back out)', () => {
    const rects: ButtonRect[] = [{ x: 100, y: 100, w: 40, h: 20 }]
    const snap = snapToNearest({ x: 120, y: 110 }, rects) // inside
    expect(snap!.index).toBe(0)
    expect(snap!.pos).toEqual({ x: 120, y: 110 })
  })

  it('strength 0 → still highlights the nearest but applies no pull (firm stick escapes)', () => {
    const rects: ButtonRect[] = [{ x: 100, y: 100, w: 40, h: 20 }]
    const snap = snapToNearest({ x: 70, y: 110 }, rects, SNAP_MAX_DIST, 0)
    expect(snap!.index).toBe(0)
    expect(snap!.pos).toEqual({ x: 70, y: 110 })
  })

  it('picks the nearest of several buttons', () => {
    const rects: ButtonRect[] = [
      { x: 0, y: 0, w: 20, h: 20 },     // centre (10,10) — far from (200,200)
      { x: 190, y: 190, w: 20, h: 20 }, // centre (200,200) — nearest
    ]
    const snap = snapToNearest({ x: 205, y: 205 }, rects)
    expect(snap!.index).toBe(1)
  })

  it('ignores zero-size rects', () => {
    const rects: ButtonRect[] = [{ x: 100, y: 100, w: 0, h: 0 }]
    expect(snapToNearest({ x: 100, y: 100 }, rects)).toBeNull()
  })

  it('pull is stronger the closer the cursor already is', () => {
    const rect: ButtonRect[] = [{ x: 100, y: 100, w: 0.0001, h: 0.0001 }] // ~point at (100,100)
    const near = snapToNearest({ x: 99, y: 100 }, rect, SNAP_MAX_DIST, 0.5)!
    const far = snapToNearest({ x: 100 - 150, y: 100 }, rect, SNAP_MAX_DIST, 0.5)!
    // Fraction of the gap closed is larger when starting nearer.
    const nearFrac = (near.pos.x - 99) / (100 - 99)
    const farFrac = (far.pos.x - (100 - 150)) / 150
    expect(nearFrac).toBeGreaterThan(farFrac)
  })
})

// ── edgeScrollDelta ──────────────────────────────────────────────────────────

describe('edgeScrollDelta', () => {
  const H = 600
  const DT = 0.1

  it('returns 0 in the middle of the page', () => {
    expect(edgeScrollDelta(300, 0.8, H, DT)).toBe(0)
  })

  it('scrolls down (positive) at the bottom edge with downward stick', () => {
    const d = edgeScrollDelta(580, 0.5, H, DT)
    expect(d).toBeCloseTo(0.5 * SCROLL_SPEED * DT)
    expect(d).toBeGreaterThan(0)
  })

  it('scrolls up (negative) at the top edge with upward stick', () => {
    const d = edgeScrollDelta(20, -0.5, H, DT)
    expect(d).toBeLessThan(0)
  })

  it('returns 0 when the stick is within the deadzone', () => {
    expect(edgeScrollDelta(580, 0.1, H, DT)).toBe(0)
  })

  it('does not scroll down when at the bottom but pushing up', () => {
    expect(edgeScrollDelta(580, -0.5, H, DT)).toBe(0)
  })
})
