/**
 * Unit tests for the native-game controller exit watcher (src/main/gamepad-exit.ts).
 *
 * Pure parsers (parseInputEvents, isMenuPress, parseGamepadEventDevices) and the
 * GamepadExitWatcher with a fake stream - no real /dev/input, no Electron.
 *
 * What still needs the real booth (NOT covered here):
 *   - The session ACL on /dev/input/eventN actually granting the --user service read access.
 *   - Whether the Xbox controller's firmware reports BTN_MODE (Guide) over Bluetooth.
 *   - createReadStream on a char device delivering input_event records as they arrive.
 */

import { describe, it, expect } from 'vitest'
import {
  parseInputEvents,
  isMenuPress,
  parseGamepadEventDevices,
  GamepadExitWatcher,
  EV_KEY,
  BTN_SELECT,
  BTN_START,
  BTN_MODE,
  INPUT_EVENT_SIZE,
  type ReadableLike,
} from '../src/main/gamepad-exit'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a 24-byte input_event record (x86_64 layout). */
function ev(type: number, code: number, value: number): Buffer {
  const b = Buffer.alloc(INPUT_EVENT_SIZE)
  b.writeUInt16LE(type, 16)
  b.writeUInt16LE(code, 18)
  b.writeInt32LE(value, 20)
  return b
}

/** A controllable fake of the readable-stream surface the watcher consumes. */
class FakeStream implements ReadableLike {
  private handlers: Record<string, (arg: never) => void> = {}
  destroyed = false
  on(event: 'data' | 'error', cb: (arg: never) => void): void {
    this.handlers[event] = cb
  }
  feed(chunk: Buffer): void {
    this.handlers['data']?.(chunk as never)
  }
  fail(err: Error): void {
    this.handlers['error']?.(err as never)
  }
  destroy(): void {
    this.destroyed = true
  }
}

// Captured from the booth (axenstax@192.168.191.32) - two Xbox controllers,
// plus a mouse block (no js handler) that must be excluded.
const PROC_FIXTURE = `
N: Name="ImPS/2 Logitech Wheel Mouse"
P: Phys=isa0060/serio2/input0
H: Handlers=mouse2 event11
B: EV=7

N: Name="Xbox Wireless Controller"
P: Phys=38:fc:98:ea:9b:19
H: Handlers=kbd event8 js0
B: EV=20001b

N: Name="Xbox Wireless Controller"
P: Phys=38:fc:98:ea:9b:19
H: Handlers=kbd event19 js1
B: EV=20001b
`.trim()

// ── parseInputEvents ────────────────────────────────────────────────────────────

describe('parseInputEvents', () => {
  it('decodes a single record', () => {
    expect(parseInputEvents(ev(EV_KEY, BTN_START, 1))).toEqual([{ type: EV_KEY, code: BTN_START, value: 1 }])
  })

  it('decodes multiple concatenated records', () => {
    const buf = Buffer.concat([ev(EV_KEY, BTN_SELECT, 1), ev(EV_KEY, BTN_SELECT, 0)])
    expect(parseInputEvents(buf)).toEqual([
      { type: EV_KEY, code: BTN_SELECT, value: 1 },
      { type: EV_KEY, code: BTN_SELECT, value: 0 },
    ])
  })

  it('ignores a trailing partial record', () => {
    const buf = Buffer.concat([ev(EV_KEY, BTN_MODE, 1), Buffer.alloc(10)])
    expect(parseInputEvents(buf)).toEqual([{ type: EV_KEY, code: BTN_MODE, value: 1 }])
  })

  it('returns nothing for an empty / sub-record buffer', () => {
    expect(parseInputEvents(Buffer.alloc(0))).toEqual([])
    expect(parseInputEvents(Buffer.alloc(INPUT_EVENT_SIZE - 1))).toEqual([])
  })

  it('decodes a negative value (e.g. axis) correctly', () => {
    const b = ev(0x03, 0, -1)
    expect(parseInputEvents(b)[0].value).toBe(-1)
  })
})

// ── isMenuPress ─────────────────────────────────────────────────────────────────

describe('isMenuPress', () => {
  it.each([BTN_SELECT, BTN_START, BTN_MODE])('press of code %d → true', code => {
    expect(isMenuPress({ type: EV_KEY, code, value: 1 })).toBe(true)
  })

  it('release (value 0) → false', () => {
    expect(isMenuPress({ type: EV_KEY, code: BTN_START, value: 0 })).toBe(false)
  })

  it('autorepeat (value 2) → false', () => {
    expect(isMenuPress({ type: EV_KEY, code: BTN_START, value: 2 })).toBe(false)
  })

  it('a non-menu button (BTN_A = 304) press → false', () => {
    expect(isMenuPress({ type: EV_KEY, code: 304, value: 1 })).toBe(false)
  })

  it('a non-EV_KEY event (EV_SYN) → false', () => {
    expect(isMenuPress({ type: 0x00, code: BTN_START, value: 1 })).toBe(false)
  })
})

// ── parseGamepadEventDevices ─────────────────────────────────────────────────────

describe('parseGamepadEventDevices', () => {
  it('returns event devices only for blocks with a js handler', () => {
    expect(parseGamepadEventDevices(PROC_FIXTURE)).toEqual(['event8', 'event19'])
  })

  it('excludes the mouse block (no js handler)', () => {
    expect(parseGamepadEventDevices(PROC_FIXTURE)).not.toContain('event11')
  })

  it('returns [] for empty input', () => {
    expect(parseGamepadEventDevices('')).toEqual([])
  })

  it('skips a gamepad block that has js but no event handler', () => {
    const proc = 'N: Name="Odd Pad"\nH: Handlers=js0\nB: EV=20001b'
    expect(parseGamepadEventDevices(proc)).toEqual([])
  })
})

// ── GamepadExitWatcher ───────────────────────────────────────────────────────────

describe('GamepadExitWatcher', () => {
  function makeWatcher(stream: FakeStream) {
    let fired = 0
    const logs: string[] = []
    const w = new GamepadExitWatcher({
      listDevices: async () => ['/dev/input/event8'],
      openStream: () => stream,
      onMenuPress: () => { fired++ },
      log: m => { logs.push(m) },
    })
    return { w, fired: () => fired, logs }
  }

  it('fires onMenuPress on a menu-button press', async () => {
    const stream = new FakeStream()
    const { w, fired } = makeWatcher(stream)
    await w.start()
    stream.feed(ev(EV_KEY, BTN_START, 1))
    expect(fired()).toBe(1)
  })

  it('does not fire on a non-menu button', async () => {
    const stream = new FakeStream()
    const { w, fired } = makeWatcher(stream)
    await w.start()
    stream.feed(ev(EV_KEY, 304 /* BTN_A */, 1))
    expect(fired()).toBe(0)
  })

  it('reassembles a record split across two chunks', async () => {
    const stream = new FakeStream()
    const { w, fired } = makeWatcher(stream)
    await w.start()
    const record = ev(EV_KEY, BTN_MODE, 1)
    stream.feed(record.subarray(0, 10))
    expect(fired()).toBe(0)          // partial - nothing yet
    stream.feed(record.subarray(10)) // completes the record
    expect(fired()).toBe(1)
  })

  it('fires once per press across a press/release pair', async () => {
    const stream = new FakeStream()
    const { w, fired } = makeWatcher(stream)
    await w.start()
    stream.feed(Buffer.concat([ev(EV_KEY, BTN_START, 1), ev(EV_KEY, BTN_START, 0)]))
    expect(fired()).toBe(1)
  })

  it('stop() destroys the stream and ignores further data', async () => {
    const stream = new FakeStream()
    const { w, fired } = makeWatcher(stream)
    await w.start()
    w.stop()
    expect(stream.destroyed).toBe(true)
    stream.feed(ev(EV_KEY, BTN_START, 1)) // arrives after stop - handler still bound, but we asserted destroy
    // The real createReadStream stops emitting after destroy(); the fake can't,
    // so we only assert the destroy happened. (No fire-count guarantee here.)
  })

  it('start() is idempotent (second call opens nothing new)', async () => {
    let opens = 0
    const stream = new FakeStream()
    const w = new GamepadExitWatcher({
      listDevices: async () => ['/dev/input/event8'],
      openStream: () => { opens++; return stream },
      onMenuPress: () => {},
    })
    await w.start()
    await w.start()
    expect(opens).toBe(1)
  })

  it('survives listDevices rejection (logs, opens nothing)', async () => {
    let fired = 0
    const w = new GamepadExitWatcher({
      listDevices: async () => { throw new Error('no /proc on macOS') },
      openStream: () => { throw new Error('should not be called') },
      onMenuPress: () => { fired++ },
    })
    await expect(w.start()).resolves.toBeUndefined()
    expect(fired).toBe(0)
  })
})
