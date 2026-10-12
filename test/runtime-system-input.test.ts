import { describe, expect, it, vi } from 'vitest'
import { probeSystemInput, sendOwnedSystemKey } from '../scripts/runtime-system-input.mjs'

function fixture(owner = 123, focused = 456) {
  const run = vi.fn(async (_binary: string, args: string[]) => ({ stdout:
    args[0] === 'getwindowfocus' ? String(focused) : args[0] === 'getwindowpid' ? String(owner) : '' }))
  const inspector = {
    systemInputContext: vi.fn(async () => ({ pid: 123, windowId: 456, display: ':99', xauthority: '/tmp/private-fixture-Xauthority' })),
    read: vi.fn(async () => ({ windows: [], contents: [] })),
  }
  const page = { isClosed: () => false, evaluate: async () => [{ key: 'ArrowUp', trusted: true }] }
  return { run, inspector, page, wait: async () => {}, platform: 'linux', key: 'Up' }
}

describe('isolated native system-input probe', () => {
  it('never sends a key to another process on the display', async () => {
    const input = fixture(999)
    expect((await probeSystemInput(input)).attempted).toBe(false)
    expect(input.run.mock.calls.map(([, args]) => args[0])).toEqual(['getwindowfocus', 'getwindowpid'])
  })
  it('never activates or sends a key to a different window in the same process', async () => {
    const input = fixture(123, 987)
    expect((await probeSystemInput(input)).attempted).toBe(false)
    expect(input.run.mock.calls.map(([, args]) => args[0])).toEqual(['getwindowfocus', 'getwindowpid'])
  })
  it('refuses input outside the private local X display', async () => {
    const input = fixture()
    input.inspector.systemInputContext.mockResolvedValue({ pid: 123, windowId: 456, display: 'remote:99', xauthority: '' })
    expect((await probeSystemInput(input)).attempted).toBe(false)
    expect(input.run).not.toHaveBeenCalled()
  })
  it('refuses arbitrary commands or keys', async () => {
    const input = fixture()
    expect((await probeSystemInput({ ...input, key: 'Return' })).attempted).toBe(false)
    expect(input.run).not.toHaveBeenCalled()
  })
  it('does not send desktop input on a Mac', async () => {
    const input = fixture()
    expect((await probeSystemInput({ ...input, platform: 'darwin' })).attempted).toBe(false)
    expect(input.inspector.systemInputContext).not.toHaveBeenCalled()
    expect(input.run).not.toHaveBeenCalled()
  })
  it('reports the owned-window result without activating or changing focus', async () => {
    const input = fixture()
    const result = await probeSystemInput(input)
    expect(result).toMatchObject({ attempted: true, method: 'X11 XTEST', trustedPageKeyObserved: true })
    expect(input.run.mock.calls.map(([, args]) => args)).toEqual([
      ['getwindowfocus'], ['getwindowpid', '456'], ['key', '--clearmodifiers', 'Up'],
    ])
  })
})

describe('primary isolated system input', () => {
  it.each([[999, 456], [123, 987]])('fails without sending input when ownership differs (%i, %i)', async (owner, focused) => {
    const input = fixture(owner, focused)
    await expect(sendOwnedSystemKey(input)).rejects.toThrow('focus-does-not-match-isolated-window')
    expect(input.run.mock.calls.map(([, args]) => args[0])).toEqual(['getwindowfocus', 'getwindowpid'])
  })
  it('rejects unsupported actions before any native inspection', async () => {
    const input = fixture()
    await expect(sendOwnedSystemKey({ ...input, action: 'windowactivate' })).rejects.toThrow('Unsupported')
    expect(input.run).not.toHaveBeenCalled()
    expect(input.inspector.systemInputContext).not.toHaveBeenCalled()
  })
  it('cannot silently skip input on a developer Mac', async () => {
    const input = fixture()
    await expect(sendOwnedSystemKey({ ...input, platform: 'darwin' })).rejects.toThrow('unavailable')
    expect(input.run).not.toHaveBeenCalled()
  })
  it('holds and releases Escape only in the owned window', async () => {
    const input = fixture()
    await sendOwnedSystemKey({ ...input, key: 'Escape', action: 'keydown' })
    await sendOwnedSystemKey({ ...input, key: 'Escape', action: 'keyup' })
    expect(input.run.mock.calls.filter(([, args]) => args[0].startsWith('key')).map(([, args]) => args)).toEqual([
      ['keydown', '--clearmodifiers', 'Escape'], ['keyup', '--clearmodifiers', 'Escape'],
    ])
  })
})
