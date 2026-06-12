/**
 * Unit tests for the virtual-cursor maths (src/preload/webgame.ts):
 *   - edgeScrollDelta — cursor-driven page scroll at the top/bottom edge
 *
 * The magnetic snap-to-button was removed: it repeatedly hijacked the A button
 * (fire vs click) and trapped the cursor on wide buttons. The cursor is now a
 * plain pointer — stick moves it, A clicks where it points and also fires.
 *
 * Pure function only — no DOM, no gamepad, no Electron.
 */

import { describe, it, expect } from 'vitest'
import { edgeScrollDelta, SCROLL_SPEED } from '../src/preload/webgame'

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
