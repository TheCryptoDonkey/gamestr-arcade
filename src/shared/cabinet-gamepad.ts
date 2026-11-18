import { hatDirections } from './gamepad'

const neutralButton: GamepadButton = { pressed: false, touched: false, value: 0 }

function button(value: number): GamepadButton {
  return { pressed: value > 0.5, touched: value > 0, value }
}

export function cabinetGamepadProfile(pad: Gamepad): 'standard' | 'linux-xinput' | null {
  if (pad.mapping === 'standard') return 'standard'
  if (!pad.mapping && /xbox|x-box/i.test(pad.id) && pad.axes.length === 8 && pad.buttons.length === 11) {
    return 'linux-xinput'
  }
  return null
}

/** The Linux XInput layout exposes triggers and the D-pad as axes. */
export function normaliseCabinetGamepad(pad: Gamepad): Gamepad | null {
  const profile = cabinetGamepadProfile(pad)
  if (!profile) return null
  const buttons = Array.from({ length: 17 }, (_, index) => {
    const input = pad.buttons[index]
    return input ? { pressed: input.pressed, touched: input.touched, value: input.value } : neutralButton
  })
  const axes = [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0]
  if (profile === 'linux-xinput') {
    const hat = hatDirections(pad)
    const trigger = (index: number) => button(((pad.axes[index] ?? -1) + 1) / 2)
    buttons.splice(6, 11, trigger(2), trigger(5), buttons[6], buttons[7],
      buttons[9], buttons[10], button(+hat.up), button(+hat.down), button(+hat.left), button(+hat.right), buttons[8])
    axes[2] = pad.axes[3] ?? 0
    axes[3] = pad.axes[4] ?? 0
  }
  return {
    id: 'Gamestr Arcade Controller', index: 0, connected: true, mapping: 'standard',
    timestamp: pad.timestamp, axes, buttons, vibrationActuator: null,
  } as unknown as Gamepad
}

const neutralPad = {
  id: 'Gamestr Arcade Controller', index: 0, connected: true, mapping: 'standard',
  timestamp: 0, axes: [0, 0, 0, 0], buttons: Array<GamepadButton>(17).fill(neutralButton), vibrationActuator: null,
} as unknown as Gamepad

function connectionKey(pad: Gamepad): string {
  return JSON.stringify([pad.index, pad.id, pad.mapping, pad.axes.length, pad.buttons.length])
}

function controlsReleased(pad: Gamepad): boolean {
  return pad.buttons.every(value => !value.pressed && value.value < 0.2)
    && pad.axes.every(value => Math.abs(value) < 0.15)
}

export class CabinetGamepadSession {
  private active: string | null = null
  private requireRelease = false
  private readonly released = new Set<string>()
  disconnected = false

  disconnect(pad: Gamepad): void {
    if (this.active === connectionKey(pad)) this.losePad()
    this.released.delete(connectionKey(pad))
  }

  sample(pads: readonly Gamepad[]): Gamepad | null {
    if (this.active !== null) {
      const current = pads.find(pad => pad.connected && connectionKey(pad) === this.active)
      const input = current ? normaliseCabinetGamepad(current) : null
      if (!input) {
        this.losePad()
        return neutralPad
      }
      if (this.requireRelease) {
        if (!controlsReleased(input)) return neutralPad
        this.requireRelease = false
      }
      return input
    }

    for (const pad of pads) {
      if (!pad.connected) continue
      const input = normaliseCabinetGamepad(pad)
      if (!input) continue
      const key = connectionKey(pad)
      if (controlsReleased(input)) this.released.add(key)
      if (!input.buttons[0].pressed || (this.disconnected && !this.released.has(key))) continue
      this.active = key
      this.requireRelease = this.disconnected
      this.disconnected = false
      this.released.clear()
      return this.requireRelease ? neutralPad : input
    }
    return this.disconnected ? neutralPad : null
  }

  private losePad(): void {
    this.active = null
    this.disconnected = true
    this.released.clear()
  }
}
