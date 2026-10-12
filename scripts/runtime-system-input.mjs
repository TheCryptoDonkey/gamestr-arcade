// Diagnostic only: XTEST input on this test's private Xvfb display after an
// original assertion fails. Never activates another window or retries a gate.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
const command = promisify(execFile)

export async function probeSystemInput({ inspector, page, key,
  platform = process.platform, run = command, wait = delay }) {
  if (platform !== 'linux' || page.isClosed()) return { attempted: false, reason: 'unavailable' }
  if (!['Up', 'Escape'].includes(key)) return { attempted: false, reason: 'unsupported-key' }
  try {
    const context = await inspector.systemInputContext()
    if (!context || !Number.isSafeInteger(context.pid) || !Number.isSafeInteger(context.windowId) ||
        !/^:\d+(\.\d+)?$/.test(context.display ?? '')) return { attempted: false, reason: 'unavailable-context' }
    const options = { timeout: 3000, env: { ...process.env, DISPLAY: context.display,
      ...(context.xauthority ? { XAUTHORITY: context.xauthority } : {}) } }
    const focused = (await run('xdotool', ['getwindowfocus'], options)).stdout.trim()
    if (!/^\d+$/.test(focused)) return { attempted: false, reason: 'unknown-focus' }
    const owner = Number((await run('xdotool', ['getwindowpid', focused], options)).stdout.trim())
    // Check both native window and process ownership before sending any key.
    if (owner !== context.pid || Number(focused) !== context.windowId) {
      return { attempted: false, reason: 'focus-does-not-match-isolated-window' }
    }
    await run('xdotool', ['key', '--clearmodifiers', key], options)
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
