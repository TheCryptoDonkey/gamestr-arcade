/**
 * Unit tests for MenuPressDetector (src/preload/webgame.ts).
 *
 * Pure rising-edge detector - no Electron APIs, no DOM, no gamepad hardware.
 *
 * What still needs a real gamepad at the booth (NOT covered here):
 *   - Which physical button on the cabinet's controller maps to index 8/9/16.
 *   - RAF polling actually delivering the press inside the focused web view.
 *   - ipcRenderer.send('game:back') reaching main → launcher.back().
 */

import { describe, it, expect } from 'vitest'
import { MenuPressDetector, MENU_BUTTON_INDICES } from '../src/preload/webgame'

describe('MENU_BUTTON_INDICES', () => {
  it('covers Select/View (8), Start/Menu (9) and Guide (16)', () => {
    expect(MENU_BUTTON_INDICES).toEqual([8, 9, 16])
  })
})

describe('MenuPressDetector', () => {
  it('does not fire while never pressed', () => {
    const d = new MenuPressDetector()
    expect(d.update(false)).toBe(false)
    expect(d.update(false)).toBe(false)
  })

  it('fires once on the rising edge (press)', () => {
    const d = new MenuPressDetector()
    expect(d.update(true)).toBe(true)
  })

  it('does not repeat while the button is held', () => {
    const d = new MenuPressDetector()
    expect(d.update(true)).toBe(true) // press → fire once
    expect(d.update(true)).toBe(false) // still held
    expect(d.update(true)).toBe(false) // still held
  })

  it('resets on release so the next press fires again', () => {
    const d = new MenuPressDetector()
    expect(d.update(true)).toBe(true)
    expect(d.update(false)).toBe(false) // release
    expect(d.update(true)).toBe(true) // next press fires
  })

  it('fires on the first frame even if already pressed', () => {
    const d = new MenuPressDetector()
    expect(d.update(true)).toBe(true)
    expect(d.update(true)).toBe(false)
  })

  it('handles rapid press / release / press', () => {
    const d = new MenuPressDetector()
    expect(d.update(true)).toBe(true)
    expect(d.update(false)).toBe(false)
    expect(d.update(true)).toBe(true)
    expect(d.update(false)).toBe(false)
    expect(d.update(true)).toBe(true)
  })
})
