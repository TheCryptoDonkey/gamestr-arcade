/**
 * Controller normalisation shared by the launcher menu and launched web games.
 *
 * Chromium exposes recognised controllers using the W3C Standard Mapping. The
 * Linux booth has also presented the same Xbox pad as an unmapped joystick whose
 * d-pad is a HAT on axes 6/7. Keeping both interpretations here prevents the
 * launcher and the web-game bridge from quietly drifting apart again.
 */

export interface GamepadButtonLike {
  pressed: boolean
}

/** Structural subset used by the normaliser, deliberately independent of DOM types. */
export interface GamepadLike {
  mapping: string
  buttons: ArrayLike<GamepadButtonLike>
  axes: ArrayLike<number>
}

export const DPAD = { UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const
export const STICK_AXIS = { X: 0, Y: 1 } as const
export const HAT_AXIS = { X: 6, Y: 7 } as const
export const STICK_DEADZONE = 0.5
export const HAT_THRESHOLD = 0.5
export const FIRE_BUTTONS = [0, 2] as const
export const CABINET_EXIT_BUTTONS = { VIEW: 8, MENU: 9, GUIDE: 16 } as const

export type ControllerProfileId = 'standard' | 'linux-hat'

/** The profile Chromium is exposing for this connection, never its array index. */
export function controllerProfileFor(pad: GamepadLike): ControllerProfileId {
  return pad.mapping === 'standard' ? 'standard' : 'linux-hat'
}

export interface DirectionalState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export interface GamepadInputSnapshot extends DirectionalState {
  fire: boolean
}

const IDLE_DIRECTIONS: DirectionalState = {
  up: false,
  down: false,
  left: false,
  right: false,
}

export function unionDirections(a: DirectionalState, b: DirectionalState): DirectionalState {
  return {
    up: a.up || b.up,
    down: a.down || b.down,
    left: a.left || b.left,
    right: a.right || b.right,
  }
}

export function hatDirections(pad: GamepadLike): DirectionalState {
  if (controllerProfileFor(pad) === 'standard') return { ...IDLE_DIRECTIONS }
  const x = pad.axes[HAT_AXIS.X] ?? 0
  const y = pad.axes[HAT_AXIS.Y] ?? 0
  return {
    up: y <= -HAT_THRESHOLD,
    down: y >= HAT_THRESHOLD,
    left: x <= -HAT_THRESHOLD,
    right: x >= HAT_THRESHOLD,
  }
}

export function dpadDirections(pad: GamepadLike): DirectionalState {
  const pressed = (index: number): boolean => !!pad.buttons[index]?.pressed
  return unionDirections({
    up: pressed(DPAD.UP),
    down: pressed(DPAD.DOWN),
    left: pressed(DPAD.LEFT),
    right: pressed(DPAD.RIGHT),
  }, hatDirections(pad))
}

export function stickDirectionsFor(pad: GamepadLike): DirectionalState {
  const x = pad.axes[STICK_AXIS.X] ?? 0
  const y = pad.axes[STICK_AXIS.Y] ?? 0
  return {
    up: y <= -STICK_DEADZONE,
    down: y >= STICK_DEADZONE,
    left: x <= -STICK_DEADZONE,
    right: x >= STICK_DEADZONE,
  }
}

export function snapshotFromPad(pad: GamepadLike): GamepadInputSnapshot {
  const directions = unionDirections(dpadDirections(pad), stickDirectionsFor(pad))
  return {
    ...directions,
    fire: FIRE_BUTTONS.some(index => !!pad.buttons[index]?.pressed),
  }
}

export function unionPadSnapshots(a: GamepadInputSnapshot, b: GamepadInputSnapshot): GamepadInputSnapshot {
  return {
    ...unionDirections(a, b),
    fire: a.fire || b.fire,
  }
}

/** Menu navigation step: -1 = previous, 0 = idle, +1 = next. */
export type Direction = -1 | 0 | 1

export function menuDirectionFromPad(pad: GamepadLike): Direction {
  const state = snapshotFromPad(pad)
  if (state.left || state.up) return -1
  if (state.right || state.down) return 1
  return 0
}

export function menuDirectionFromPads(pads: ArrayLike<GamepadLike | null>): Direction {
  let direction: Direction = 0
  for (let index = 0; index < pads.length; index++) {
    const pad = pads[index]
    if (!pad) continue
    const candidate = menuDirectionFromPad(pad)
    if (candidate === -1) return -1
    if (candidate === 1) direction = 1
  }
  return direction
}

/**
 * A deliberate cabinet exit that does not steal Start/Menu from the game.
 * Guide exits on its own when Chromium exposes it; otherwise View + Menu is the
 * two-button fallback. The chord avoids colliding with games that use either
 * button for pause, cancel, bombs or score screens.
 */
export function cabinetExitPressed(pad: GamepadLike): boolean {
  const pressed = (index: number): boolean => !!pad.buttons[index]?.pressed
  return pressed(CABINET_EXIT_BUTTONS.GUIDE)
    || (pressed(CABINET_EXIT_BUTTONS.VIEW) && pressed(CABINET_EXIT_BUTTONS.MENU))
}

export function cabinetExitPressedFromPads(pads: ArrayLike<GamepadLike | null>): boolean {
  for (let index = 0; index < pads.length; index++) {
    const pad = pads[index]
    if (pad && cabinetExitPressed(pad)) return true
  }
  return false
}
