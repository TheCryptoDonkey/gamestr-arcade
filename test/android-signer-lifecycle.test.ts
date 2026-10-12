// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startAndroidSignerLogin } from '../src/web/android-signer'

const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
}
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  window.location.href = 'https://arcade.example/scores?mode=play'
})
afterEach(() => { vi.useRealTimers() })

it('backing out clears the pending proof and timeout without claiming login', async () => {
  const result = startAndroidSignerLogin('Arcade', storage)
  await Promise.resolve()
  expect(localStorage.getItem('signet:login.pendingRedirect')).not.toBeNull()
  window.dispatchEvent(new Event('pageshow'))
  await expect(result).resolves.toBeNull()
  expect(localStorage.getItem('signet:login.pendingRedirect')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it('an unhandled signer request expires with an actionable error and no replayable proof', async () => {
  const result = startAndroidSignerLogin('Arcade', storage)
  const rejected = expect(result).rejects.toThrow('Open Cambium or Amber')
  await vi.advanceTimersByTimeAsync(60_000)
  await rejected
  expect(localStorage.getItem('signet:login.pendingRedirect')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
  window.dispatchEvent(new Event('pageshow'))
})
