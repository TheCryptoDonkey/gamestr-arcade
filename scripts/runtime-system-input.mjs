// XTEST input on the smoke test's private Xvfb display. Never activates a
// window; the focused native window and process must belong to this launch.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
const command = promisify(execFile)

async function ownedInputOptions({ inspector, key, platform, run }) {
  if (platform !== 'linux') return { reason: 'unavailable' }
  if (!['Up', 'Escape'].includes(key)) return { reason: 'unsupported-key' }
  const context = await inspector.systemInputContext()
  if (!context || !Number.isSafeInteger(context.pid) || !Number.isSafeInteger(context.windowId) ||
      !/^:\d+(\.\d+)?$/.test(context.display ?? '')) return { reason: 'unavailable-context' }
  const options = { timeout: 3000, env: { ...process.env, DISPLAY: context.display,
    ...(context.xauthority ? { XAUTHORITY: context.xauthority } : {}) } }
  const focused = (await run('xdotool', ['getwindowfocus'], options)).stdout.trim()
  if (!/^\d+$/.test(focused)) return { reason: 'unknown-focus' }
  const owner = Number((await run('xdotool', ['getwindowpid', focused], options)).stdout.trim())
  if (owner !== context.pid || Number(focused) !== context.windowId) {
    return { reason: 'focus-does-not-match-isolated-window' }
  }
  return { options }
}

export async function sendOwnedSystemKey({ inspector, key, action = 'key',
  platform = process.platform, run = command }) {
  if (!['key', 'keydown', 'keyup'].includes(action)) throw new Error('Unsupported system-input action')
  const context = await ownedInputOptions({ inspector, key, platform, run })
  if (context.reason) throw new Error(`Isolated system input refused: ${context.reason}`)
  await run('xdotool', [action, '--clearmodifiers', key], context.options)
}

export async function probeSystemInput({ inspector, page, key,
  platform = process.platform, run = command, wait = delay }) {
  if (platform !== 'linux' || page.isClosed()) return { attempted: false, reason: 'unavailable' }
  try {
    const context = await ownedInputOptions({ inspector, key, platform, run })
    if (context.reason) return { attempted: false, reason: context.reason }
    await run('xdotool', ['key', '--clearmodifiers', key], context.options)
    await wait(300)
    const closed = page.isClosed()
    const keys = closed ? [] : await page.evaluate(() => window.fixtureKeys ?? [])
    const expected = key === 'Up' ? 'ArrowUp' : 'Escape'
    return { attempted: true, method: 'X11 XTEST', key: expected, pageClosed: closed,
      trustedPageKeyObserved: keys.some(event => event.key === expected && event.trusted),
      nativeStateAfterInput: await inspector.read() }
  } catch {
    return { attempted: false, reason: 'system-input-probe-unavailable' }
  }
}
