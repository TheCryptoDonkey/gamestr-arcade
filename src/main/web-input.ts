import type { KeyboardInputEvent, MouseInputEvent } from 'electron'
import type { Game, GameInputAdapter } from '../shared/types'

export interface BridgedKeyAction {
  type: 'keydown' | 'keyup'
  key: string
  repeat?: boolean
}

export interface BridgedPointerAction {
  type: 'move' | 'click'
  x: number
  y: number
}

export interface InputBounds {
  width: number
  height: number
}

/** Legacy manifests retain the previous keyboard + pointer behaviour. */
export function resolveInputAdapter(adapter?: GameInputAdapter): GameInputAdapter {
  return adapter ?? 'hybrid'
}

/**
 * V2 manifests are expected to choose their synthetic input surface explicitly.
 * Fail closed when one does not: Chromium's native Gamepad API remains available,
 * but the shell must not also invent keyboard and pointer input. Legacy manifests
 * retain the historical hybrid bridge until they are upgraded.
 */
export function resolveGameInputAdapter(
  game: Pick<Game, 'controller' | 'manifestVersion'>,
): GameInputAdapter {
  if (game.controller?.adapter) return game.controller.adapter
  return (game.manifestVersion ?? 1) >= 2 ? 'native' : 'hybrid'
}

export function adapterUsesKeyboard(adapter?: GameInputAdapter): boolean {
  const resolved = resolveInputAdapter(adapter)
  return resolved === 'keyboard' || resolved === 'hybrid'
}

export function adapterUsesPointer(adapter?: GameInputAdapter): boolean {
  const resolved = resolveInputAdapter(adapter)
  return resolved === 'pointer' || resolved === 'hybrid'
}

function acceleratorKey(key: string): string | null {
  const named: Record<string, string> = {
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    Space: 'Space',
    ' ': 'Space',
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  }
  if (named[key]) return named[key]
  if (/^[a-z0-9]$/i.test(key)) return key
  return null
}

/** Accept only the small, manifest-controlled keyboard vocabulary. */
export function parseBridgedKeyAction(raw: unknown): BridgedKeyAction | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.type !== 'keydown' && value.type !== 'keyup') return null
  if (typeof value.key !== 'string' || acceleratorKey(value.key) === null) return null
  if (value.repeat !== undefined && typeof value.repeat !== 'boolean') return null
  return {
    type: value.type,
    key: value.key,
    ...(value.repeat === true ? { repeat: true } : {}),
  }
}

/** Convert a validated controller action into Chromium's trusted input stream. */
export function keyboardInputEvents(action: BridgedKeyAction): KeyboardInputEvent[] {
  const keyCode = acceleratorKey(action.key)
  if (!keyCode) return []
  if (action.type === 'keyup') return [{ type: 'keyUp', keyCode }]

  const modifiers = action.repeat ? ['isautorepeat' as const] : undefined
  const events: KeyboardInputEvent[] = [{ type: 'keyDown', keyCode, modifiers }]
  if (keyCode === 'Space' || keyCode.length === 1) {
    events.push({ type: 'char', keyCode: keyCode === 'Space' ? ' ' : keyCode, modifiers })
  }
  return events
}

export function parseBridgedPointerAction(raw: unknown): BridgedPointerAction | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.type !== 'move' && value.type !== 'click') return null
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return null
  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return null
  return { type: value.type, x: value.x, y: value.y }
}

function clampedCoordinate(value: number, extent: number): number {
  if (!Number.isFinite(extent) || extent <= 0) return 0
  return Math.round(Math.max(0, Math.min(extent - 1, value)))
}

/** Build native mouse movement/click events, clamped to the active view. */
export function mouseInputEvents(action: BridgedPointerAction, bounds: InputBounds): MouseInputEvent[] {
  const x = clampedCoordinate(action.x, bounds.width)
  const y = clampedCoordinate(action.y, bounds.height)
  const move: MouseInputEvent = { type: 'mouseMove', x, y }
  if (action.type === 'move') return [move]
  return [
    move,
    { type: 'mouseDown', x, y, button: 'left', clickCount: 1 },
    { type: 'mouseUp', x, y, button: 'left', clickCount: 1 },
  ]
}
