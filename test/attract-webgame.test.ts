/**
 * Tests that attract mode stops when a web game launches and resumes on return.
 *
 * Uses AttractTimer directly (pure state machine) with a virtual clock so no
 * DOM or real timers are needed. AttractMode's own unit tests live in
 * attract-timer.test.ts; this file focuses on the web-game pause/resume contract.
 */

import { describe, it, expect, vi } from 'vitest'
import { AttractTimer, type TimerFns } from '../src/renderer/src/ui/attract'

function virtualTimers() {
  let now = 0
  let nextId = 1
  const pending = new Map<number, { at: number; cb: () => void }>()
  const fns: TimerFns = {
    setTimeout(cb, ms) {
      const id = nextId++
      pending.set(id, { at: now + ms, cb })
      return id
    },
    clearTimeout(id) { pending.delete(id) },
  }
  function advance(ms: number): void {
    const target = now + ms
    for (;;) {
      let soonest: number | null = null
      for (const [id, t] of pending) {
        if (t.at <= target && (soonest === null || t.at < pending.get(soonest)!.at)) soonest = id
      }
      if (soonest === null) break
      const t = pending.get(soonest)!
      pending.delete(soonest)
      now = t.at
      t.cb()
    }
    now = target
  }
  return { fns, advance, pendingCount: () => pending.size }
}

describe('AttractTimer - web game pause/resume', () => {
  it('stop() while idle prevents attract from entering', () => {
    const clock = virtualTimers()
    const onEnter = vi.fn()
    const onExit = vi.fn()
    const timer = new AttractTimer({ timeoutMs: 1000, onEnter, onExit, timers: clock.fns })

    timer.start()
    // Simulate web game launching - attract must stop.
    timer.stop()

    // Even well past the timeout, onEnter must not fire.
    clock.advance(5000)
    expect(onEnter).not.toHaveBeenCalled()
    expect(timer.isActive).toBe(false)
  })

  it('stop() while in attract exits and prevents re-enter', () => {
    const clock = virtualTimers()
    const onEnter = vi.fn()
    const onExit = vi.fn()
    const timer = new AttractTimer({ timeoutMs: 1000, onEnter, onExit, timers: clock.fns })

    timer.start()
    clock.advance(1000) // enter attract
    expect(timer.isActive).toBe(true)

    // Web game returned while attract was showing.
    timer.stop()
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(timer.isActive).toBe(false)
  })

  it('start() after stop() resumes the idle countdown', () => {
    const clock = virtualTimers()
    const onEnter = vi.fn()
    const timer = new AttractTimer({ timeoutMs: 1000, onEnter, timers: clock.fns, onExit: vi.fn() })

    timer.start()
    timer.stop() // web game launches
    clock.advance(5000) // time passes while game plays
    expect(onEnter).not.toHaveBeenCalled()

    // Game returns - resume attract watching.
    timer.start()
    clock.advance(1000) // idle for the full timeout
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('poke() while stopped does nothing (no re-arm while game is running)', () => {
    const clock = virtualTimers()
    const onEnter = vi.fn()
    const timer = new AttractTimer({ timeoutMs: 1000, onEnter, timers: clock.fns, onExit: vi.fn() })

    timer.start()
    timer.stop()

    // Any pokes during the game (e.g. spurious events) must be ignored.
    timer.poke()
    timer.poke()
    clock.advance(5000)
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('enter() (via onEnter callback) never fires while stopped', () => {
    const clock = virtualTimers()
    const entered: boolean[] = []
    // Wire onEnter to record entry; after stop it must never be called.
    const timer = new AttractTimer({
      timeoutMs: 500,
      onEnter: () => entered.push(true),
      onExit: vi.fn(),
      timers: clock.fns,
    })

    timer.start()
    clock.advance(400)
    timer.stop() // stop before timeout elapses

    clock.advance(10_000) // way past timeout
    expect(entered).toHaveLength(0)
  })
})
