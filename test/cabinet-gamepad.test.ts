import { describe, expect, it } from 'vitest'
import { CabinetGamepadSession, normaliseCabinetGamepad } from '../src/shared/cabinet-gamepad'
import { cabinetExitPressed } from '../src/shared/gamepad'

function pad(index: number, pressed: number[] = [], axes = [0, 0, 0, 0], raw = false): Gamepad {
  return {
    index, id: 'Xbox Wireless Controller', connected: true, timestamp: 0,
    mapping: raw ? '' : 'standard', axes,
    buttons: Array.from({ length: raw ? 11 : 17 }, (_, i) => ({
      pressed: pressed.includes(i), touched: pressed.includes(i), value: +pressed.includes(i),
    })),
  } as Gamepad
}

describe('cabinet controller assignment', () => {
  it('normalises the Linux Xbox trigger, stick, D-pad and cabinet exit layout', () => {
    const normal = normaliseCabinetGamepad(pad(0, [6, 7], [0.3, 0, -1, 0.7, -0.2, 1, 0, -1], true))!
    expect(normal.axes).toEqual([0.3, 0, 0.7, -0.2])
    expect(normal.buttons[6].value).toBe(0)
    expect(normal.buttons[7].value).toBe(1)
    expect(normal.buttons[12].pressed).toBe(true)
    expect(cabinetExitPressed(normal)).toBe(true)
  })

  it('never moves the live slot to an identical spare pad or forwards a held reconnect button', () => {
    const session = new CabinetGamepadSession()
    expect(session.sample([pad(0), pad(1, [0])])?.buttons[0].pressed).toBe(true)
    expect(session.sample([pad(0, [7]), pad(1)])?.buttons[7].pressed).toBe(false)
    expect(session.sample([pad(0), pad(1, [7])])?.buttons[7].pressed).toBe(true)

    session.disconnect(pad(1))
    expect(session.sample([pad(0, [0, 7]), pad(1, [0, 7])])?.buttons.some(button => button.pressed)).toBe(false)
    expect(session.disconnected).toBe(true)
    session.sample([pad(0), pad(1)])
    expect(session.sample([pad(0), pad(1, [0])])?.buttons[0].pressed).toBe(false)
    expect(session.disconnected).toBe(false)
    expect(session.sample([pad(0), pad(1, [0, 7])])?.buttons[7].pressed).toBe(false)
    session.sample([pad(0), pad(1)])
    expect(session.sample([pad(0), pad(1, [7])])?.buttons[7].pressed).toBe(true)
  })

  it('releases input if a pad reports a different layout during play', () => {
    const session = new CabinetGamepadSession()
    session.sample([pad(0, [0])])
    expect(session.sample([pad(0, [0], [0, 0, -1, 0, 0, -1, 0, 0], true)])?.buttons[0].pressed).toBe(false)
    expect(session.disconnected).toBe(true)
  })
})
