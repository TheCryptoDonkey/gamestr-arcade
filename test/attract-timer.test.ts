import { describe, it, expect, vi } from 'vitest'
import { AttractTimer, type TimerFns } from '../src/renderer/src/ui/attract'

/**
 * A virtual clock: deterministic timer functions for the state machine, so we
 * test idle/enter/exit transitions with zero real waits.
 */
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
    clearTimeout(id) {
      pending.delete(id)
    },
  }
  function advance(ms: number): void {
    const target = now + ms
    // Fire due timers in chronological order until we reach the target time.
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

function makeTimer(timeoutMs = 1000) {
  const clock = virtualTimers()
  const onEnter = vi.fn()
  const onExit = vi.fn()
  const timer = new AttractTimer({ timeoutMs, onEnter, onExit, timers: clock.fns })
  return { timer, onEnter, onExit, ...clock }
}

describe('AttractTimer', () => {
  it('does not enter attract before the timeout elapses', () => {
    const { timer, onEnter, advance } = makeTimer(1000)
    timer.start()
    advance(999)
    expect(onEnter).not.toHaveBeenCalled()
    expect(timer.isActive).toBe(false)
  })

  it('enters attract exactly once when idle past the timeout', () => {
    const { timer, onEnter, advance } = makeTimer(1000)
    timer.start()
    advance(1000)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(timer.isActive).toBe(true)
    // No further enters even if more virtual time passes.
    advance(5000)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('poke() before timeout re-arms the countdown (resets idle)', () => {
    const { timer, onEnter, advance } = makeTimer(1000)
    timer.start()
    advance(800)
    timer.poke() // reset at t=800
    advance(800) // t=1600, but only 800 since last activity
    expect(onEnter).not.toHaveBeenCalled()
    advance(200) // now 1000 since the poke
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('poke() while in attract exits instantly and re-arms', () => {
    const { timer, onEnter, onExit, advance } = makeTimer(1000)
    timer.start()
    advance(1000)
    expect(timer.isActive).toBe(true)
    timer.poke()
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(timer.isActive).toBe(false)
    // It re-arms, so going idle again re-enters.
    advance(1000)
    expect(onEnter).toHaveBeenCalledTimes(2)
  })

  it('only ever fires onExit after an entry (no spurious exit on idle poke)', () => {
    const { timer, onExit, advance } = makeTimer(1000)
    timer.start()
    advance(500)
    timer.poke()
    advance(500)
    timer.poke()
    expect(onExit).not.toHaveBeenCalled()
  })

  it('stop() exits if active and disarms the countdown', () => {
    const { timer, onEnter, onExit, advance, pendingCount } = makeTimer(1000)
    timer.start()
    advance(1000)
    timer.stop()
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(timer.isActive).toBe(false)
    expect(pendingCount()).toBe(0)
    // After stop, pokes are ignored and nothing re-enters.
    timer.poke()
    advance(10000)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('forceEnter() enters immediately and is idempotent', () => {
    const { timer, onEnter } = makeTimer(1000)
    timer.start()
    timer.forceEnter()
    timer.forceEnter()
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(timer.isActive).toBe(true)
  })

  it('a zero/negative timeout never auto-enters', () => {
    const { timer, onEnter, advance } = makeTimer(0)
    timer.start()
    advance(100000)
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('ignores pokes before start()', () => {
    const { timer, onEnter, advance } = makeTimer(1000)
    timer.poke()
    advance(2000)
    expect(onEnter).not.toHaveBeenCalled()
  })
})
