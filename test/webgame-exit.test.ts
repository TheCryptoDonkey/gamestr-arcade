/**
 * Unit tests for MenuPressDetector (src/preload/webgame.ts).
 *
 * Pure rising-edge detector - no Electron APIs, no DOM, no gamepad hardware.
 *
 * What still needs a real gamepad at the booth (NOT covered here):
 *   - Which physical buttons map to View/Menu/Guide on both booth controllers.
 *   - RAF polling actually delivering the press inside the focused web view.
 *   - ipcRenderer.send('game:back') reaching main → launcher.back().
 */

import { describe, it, expect } from 'vitest'
import { MenuPressDetector, CABINET_EXIT_BUTTON_INDICES } from '../src/preload/webgame'
import { cabinetExitPressedFromPads } from '../src/shared/gamepad'

describe('CABINET_EXIT_BUTTON_INDICES', () => {
  it('documents Select/View (8), Start/Menu (9) and Guide (16)', () => {
    expect(CABINET_EXIT_BUTTON_INDICES).toEqual([8, 9, 16])
  })
})

function padWith(...pressed: number[]): Gamepad {
  const active = new Set(pressed)
  return {
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: active.has(index),
      touched: active.has(index),
      value: active.has(index) ? 1 : 0,
    })),
  } as Gamepad
}

describe('cabinet exit gesture', () => {
  it('leaves Start/Menu available to the launched game', () => {
    expect(cabinetExitPressedFromPads([padWith(9)])).toBe(false)
  })

  it('leaves View available to the launched game', () => {
    expect(cabinetExitPressedFromPads([padWith(8)])).toBe(false)
  })

  it('accepts the deliberate View + Menu chord', () => {
    expect(cabinetExitPressedFromPads([padWith(8, 9)])).toBe(true)
  })

  it('accepts Guide when Chromium exposes it', () => {
    expect(cabinetExitPressedFromPads([padWith(16)])).toBe(true)
  })

  it('does not form a chord across two different controllers', () => {
    expect(cabinetExitPressedFromPads([padWith(8), padWith(9)])).toBe(false)
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
