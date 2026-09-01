import { describe, expect, it } from 'vitest'
import {
  adapterUsesKeyboard,
  adapterUsesPointer,
  keyboardInputEvents,
  mouseInputEvents,
  parseBridgedKeyAction,
  parseBridgedPointerAction,
  resolveGameInputAdapter,
  resolveInputAdapter,
} from '../src/main/web-input'

describe('web-game input adapter policy', () => {
  it('preserves the legacy hybrid bridge when a manifest has no contract', () => {
    expect(resolveInputAdapter()).toBe('hybrid')
    expect(adapterUsesKeyboard()).toBe(true)
    expect(adapterUsesPointer()).toBe(true)
  })

  it('fails closed for a v2 manifest missing its required adapter', () => {
    expect(resolveGameInputAdapter({ manifestVersion: 2 })).toBe('native')
    expect(resolveGameInputAdapter({})).toBe('hybrid')
  })

  it('honours the game manifest adapter', () => {
    expect(resolveGameInputAdapter({
      manifestVersion: 2,
      controller: { adapter: 'pointer' },
    })).toBe('pointer')
  })

  it.each([
    ['native', false, false],
    ['keyboard', true, false],
    ['pointer', false, true],
    ['hybrid', true, true],
  ] as const)('%s exposes only its declared synthetic channels', (adapter, keyboard, pointer) => {
    expect(adapterUsesKeyboard(adapter)).toBe(keyboard)
    expect(adapterUsesPointer(adapter)).toBe(pointer)
  })
})

describe('trusted keyboard input bridge', () => {
  it('maps browser arrow names to Electron accelerator names', () => {
    const action = parseBridgedKeyAction({ type: 'keydown', key: 'ArrowLeft' })
    expect(action).not.toBeNull()
    expect(keyboardInputEvents(action!)).toEqual([{ type: 'keyDown', keyCode: 'Left', modifiers: undefined }])
  })

  it('emits keyDown plus char for printable input and keyUp on release', () => {
    expect(keyboardInputEvents({ type: 'keydown', key: 'Space' })).toEqual([
      { type: 'keyDown', keyCode: 'Space', modifiers: undefined },
      { type: 'char', keyCode: ' ', modifiers: undefined },
    ])
    expect(keyboardInputEvents({ type: 'keyup', key: 'x' })).toEqual([{ type: 'keyUp', keyCode: 'x' }])
  })

  it('marks held controller input as an autorepeat', () => {
    expect(keyboardInputEvents({ type: 'keydown', key: 'a', repeat: true })).toEqual([
      { type: 'keyDown', keyCode: 'a', modifiers: ['isautorepeat'] },
      { type: 'char', keyCode: 'a', modifiers: ['isautorepeat'] },
    ])
  })

  it.each([
    null,
    { type: 'press', key: 'Space' },
    { type: 'keydown', key: 'F12' },
    { type: 'keydown', key: 'Control' },
    { type: 'keydown', key: 'ab' },
    { type: 'keydown', key: 'Space', repeat: 'yes' },
  ])('rejects malformed or privileged key input %#', value => {
    expect(parseBridgedKeyAction(value)).toBeNull()
  })
})

describe('trusted pointer input bridge', () => {
  it('creates a native move/down/up sequence for a click', () => {
    expect(mouseInputEvents({ type: 'click', x: 20.4, y: 30.6 }, { width: 100, height: 100 })).toEqual([
      { type: 'mouseMove', x: 20, y: 31 },
      { type: 'mouseDown', x: 20, y: 31, button: 'left', clickCount: 1 },
      { type: 'mouseUp', x: 20, y: 31, button: 'left', clickCount: 1 },
    ])
  })

  it('clamps pointer coordinates to the active view', () => {
    expect(mouseInputEvents({ type: 'move', x: -20, y: 900 }, { width: 640, height: 480 })).toEqual([
      { type: 'mouseMove', x: 0, y: 479 },
    ])
  })

  it.each([
    undefined,
    { type: 'wheel', x: 1, y: 2 },
    { type: 'click', x: Number.NaN, y: 2 },
    { type: 'move', x: 1, y: '2' },
  ])('rejects malformed pointer input %#', value => {
    expect(parseBridgedPointerAction(value)).toBeNull()
  })
})
