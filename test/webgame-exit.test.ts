/**
 * Unit tests for ExitHoldDetector (src/preload/webgame.ts).
 *
 * The detector is a pure class with injectable time — no Electron APIs,
 * no DOM, no gamepad hardware required.
 *
 * What needs a real gamepad at the booth (NOT covered here):
 *   - Physical button index 9 on a specific controller mapping to "Start".
 *   - RAF polling rate and actual felt latency of the 700 ms threshold.
 *   - The ipcRenderer.send('game:back') call firing and reaching main.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ExitHoldDetector, HOLD_THRESHOLD_MS, EXIT_BUTTON_INDEX } from '../src/preload/webgame'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a detector with a manually controlled clock. */
function makeDetector(thresholdMs = HOLD_THRESHOLD_MS) {
  let t = 0
  const now = () => t
  const detector = new ExitHoldDetector({ holdThresholdMs: thresholdMs, now })
  const advance = (ms: number) => { t += ms }
  return { detector, advance, setTime: (ms: number) => { t = ms } }
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('EXIT_BUTTON_INDEX is 9 (Standard Mapping: Start)', () => {
    expect(EXIT_BUTTON_INDEX).toBe(9)
  })

  it('HOLD_THRESHOLD_MS is 700', () => {
    expect(HOLD_THRESHOLD_MS).toBe(700)
  })
})

// ── ExitHoldDetector ─────────────────────────────────────────────────────────

describe('ExitHoldDetector', () => {
  describe('not pressed', () => {
    it('returns false when button is never pressed', () => {
      const { detector } = makeDetector()
      expect(detector.update(false)).toBe(false)
      expect(detector.update(false)).toBe(false)
    })
  })

  describe('tap (released before threshold)', () => {
    it('does not fire when held for less than the threshold', () => {
      const { detector, advance } = makeDetector()

      // Press down at t=0
      expect(detector.update(true)).toBe(false)
      advance(699)
      // Still held, but under threshold
      expect(detector.update(true)).toBe(false)
      // Release
      expect(detector.update(false)).toBe(false)
    })

    it('does not fire when held for exactly 1 ms less than threshold', () => {
      const { detector, advance } = makeDetector(700)

      detector.update(true)         // t=0  — start hold
      advance(699)
      expect(detector.update(true)).toBe(false)
    })
  })

  describe('hold (meets threshold)', () => {
    it('fires when held for exactly the threshold duration', () => {
      const { detector, advance } = makeDetector()

      detector.update(true)         // t=0
      advance(HOLD_THRESHOLD_MS)    // t=700
      expect(detector.update(true)).toBe(true)
    })

    it('fires when held beyond the threshold', () => {
      const { detector, advance } = makeDetector()

      detector.update(true)         // t=0
      advance(1000)
      expect(detector.update(true)).toBe(true)
    })

    it('fires on the first frame that crosses the threshold', () => {
      const { detector, advance } = makeDetector()

      detector.update(true)  // t=0
      advance(400)
      expect(detector.update(true)).toBe(false)  // 400 ms — not yet
      advance(300)
      expect(detector.update(true)).toBe(true)   // 700 ms — fires
    })
  })

  describe('no double-fire', () => {
    it('returns false on subsequent frames after firing while still held', () => {
      const { detector, advance } = makeDetector()

      detector.update(true)
      advance(HOLD_THRESHOLD_MS)
      expect(detector.update(true)).toBe(true)   // fires once

      advance(100)
      expect(detector.update(true)).toBe(false)  // still held — no double
      advance(500)
      expect(detector.update(true)).toBe(false)  // still held — no double
    })
  })

  describe('reset on release', () => {
    it('resets after release so a subsequent hold can fire again', () => {
      const { detector, advance } = makeDetector()

      // First hold — fires
      detector.update(true)
      advance(HOLD_THRESHOLD_MS)
      expect(detector.update(true)).toBe(true)

      // Release
      detector.update(false)

      // Second hold — should fire again
      advance(HOLD_THRESHOLD_MS)
      detector.update(true)         // t = now; hold starts fresh
      advance(HOLD_THRESHOLD_MS)
      expect(detector.update(true)).toBe(true)
    })

    it('does not fire again immediately after release if still at old time', () => {
      const { detector, advance } = makeDetector()

      // First full hold + fire
      detector.update(true)
      advance(HOLD_THRESHOLD_MS)
      detector.update(true)  // fires

      // Release
      detector.update(false)

      // Re-press but haven't advanced time yet — threshold not met
      detector.update(true)  // hold starts at current time
      expect(detector.update(true)).toBe(false)
    })
  })

  describe('edge: press then immediately release then re-press', () => {
    it('tracks the second press independently', () => {
      const { detector, advance } = makeDetector()

      // Short tap (no fire)
      detector.update(true)
      advance(100)
      detector.update(false)

      // Re-press and hold to threshold
      advance(0)
      detector.update(true)  // second hold starts
      advance(HOLD_THRESHOLD_MS)
      expect(detector.update(true)).toBe(true)
    })
  })

  describe('custom threshold', () => {
    it('respects a custom threshold passed to the constructor', () => {
      const { detector, advance } = makeDetector(300)

      detector.update(true)
      advance(299)
      expect(detector.update(true)).toBe(false)
      advance(1)
      expect(detector.update(true)).toBe(true)
    })
  })
})
