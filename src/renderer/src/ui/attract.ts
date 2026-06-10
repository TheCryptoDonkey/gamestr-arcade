/**
 * gamestr-arcade — attract mode (idle demo loop).
 *
 * After `timeoutMs` of no input the cabinet enters ATTRACT: it auto-advances the
 * carousel on an interval, raises an "INSERT COIN / PRESS START" overlay and
 * starts the attract drone. ANY activity exits instantly.
 *
 * The idle/active decision is a tiny pure state machine (`AttractTimer`) with
 * injected timer functions so it is unit-testable with a virtual clock — no real
 * waits, no DOM. `AttractMode` composes it with the overlay + carousel + audio.
 */

// ── Pure idle-timer state machine (injected timing → unit-testable) ───────────

export interface TimerFns {
  setTimeout(cb: () => void, ms: number): number
  clearTimeout(id: number): void
}

/**
 * Tracks "has the user been idle for `timeoutMs`?" and fires `onEnter` once when
 * the idle threshold is crossed and `onExit` when activity resumes after entry.
 *
 *   - `poke()` records activity: it (re)arms the idle countdown and, if we were
 *     in attract, exits immediately.
 *   - Entering is edge-triggered (fires once); subsequent timer ticks are
 *     impossible because the timer is only armed while NOT in attract.
 *
 * Re-entrancy is safe: callbacks run after internal state is already updated.
 */
export class AttractTimer {
  private readonly timeoutMs: number
  private readonly timers: TimerFns
  private readonly onEnter: () => void
  private readonly onExit: () => void
  private handle: number | null = null
  private active = false
  private started = false

  constructor(opts: {
    timeoutMs: number
    onEnter: () => void
    onExit: () => void
    timers?: TimerFns
  }) {
    this.timeoutMs = opts.timeoutMs
    this.onEnter = opts.onEnter
    this.onExit = opts.onExit
    this.timers = opts.timers ?? {
      setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
      clearTimeout: id => globalThis.clearTimeout(id),
    }
  }

  /** Whether attract is currently active. */
  get isActive(): boolean {
    return this.active
  }

  /** Begin watching for idle (arms the countdown from now). */
  start(): void {
    this.started = true
    this.arm()
  }

  /** Stop watching entirely (also exits attract if active). */
  stop(): void {
    this.started = false
    this.disarm()
    if (this.active) {
      this.active = false
      this.onExit()
    }
  }

  /** Record user activity: re-arm the countdown; exit attract if we were in it. */
  poke(): void {
    if (!this.started) return
    if (this.active) {
      this.active = false
      this.arm()
      this.onExit()
      return
    }
    this.arm()
  }

  /** Force attract on (used by tests / manual demo). */
  forceEnter(): void {
    if (!this.started || this.active) return
    this.disarm()
    this.active = true
    this.onEnter()
  }

  private arm(): void {
    this.disarm()
    if (this.timeoutMs <= 0) return
    this.handle = this.timers.setTimeout(() => {
      this.handle = null
      if (!this.started || this.active) return
      this.active = true
      this.onEnter()
    }, this.timeoutMs)
  }

  private disarm(): void {
    if (this.handle !== null) {
      this.timers.clearTimeout(this.handle)
      this.handle = null
    }
  }
}

// ── DOM controller (overlay + carousel auto-advance + drone) ──────────────────

/** Minimal surface this controller needs from the carousel (keeps it decoupled). */
export interface AttractCarousel {
  next(): void
}

/** Minimal surface from the audio layer. */
export interface AttractAudio {
  startDrone(): void
  stopDrone(): void
}

export interface AttractModeOptions {
  timeoutMs: number
  /** How often to auto-advance the carousel while in attract (ms). */
  advanceMs?: number
  carousel: AttractCarousel
  audio?: AttractAudio
}

export class AttractMode {
  private readonly timer: AttractTimer
  private readonly carousel: AttractCarousel
  private readonly audio?: AttractAudio
  private readonly advanceMs: number
  private readonly overlay: HTMLElement
  private advanceHandle: number | null = null

  constructor(host: HTMLElement, opts: AttractModeOptions) {
    this.carousel = opts.carousel
    this.audio = opts.audio
    this.advanceMs = opts.advanceMs ?? 5200

    this.overlay = document.createElement('div')
    this.overlay.className = 'attract'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.innerHTML = `
      <div class="attract-veil"></div>
      <div class="attract-banner">
        <div class="attract-coin">
          <span class="attract-bullet">●</span>
          <span class="attract-text">INSERT COIN</span>
          <span class="attract-bullet">●</span>
          <span class="attract-text attract-text-alt">PRESS START</span>
          <span class="attract-bullet">●</span>
        </div>
        <div class="attract-sub">DEMO MODE — TOUCH ANY CONTROL TO PLAY</div>
      </div>
    `
    host.appendChild(this.overlay)

    this.timer = new AttractTimer({
      timeoutMs: opts.timeoutMs,
      onEnter: () => this.enter(),
      onExit: () => this.exit(),
    })
  }

  /** Start watching for idle. */
  start(): void {
    this.timer.start()
  }

  /** Stop watching (and exit if active). */
  stop(): void {
    this.timer.stop()
  }

  /** Wire this to `input.onActivity` — any input resets / exits attract. */
  onActivity = (): void => {
    this.timer.poke()
  }

  /** Force attract on immediately (admin "demo now" / design verification). */
  forceEnter(): void {
    this.timer.forceEnter()
  }

  /** True while the demo overlay is showing. */
  get isActive(): boolean {
    return this.timer.isActive
  }

  private enter(): void {
    this.overlay.classList.add('attract-on')
    this.overlay.setAttribute('aria-hidden', 'false')
    this.audio?.startDrone()
    // Kick the first advance after a beat, then on the steady cadence.
    this.advanceHandle = window.setInterval(() => this.carousel.next(), this.advanceMs)
  }

  private exit(): void {
    this.overlay.classList.remove('attract-on')
    this.overlay.setAttribute('aria-hidden', 'true')
    this.audio?.stopDrone()
    if (this.advanceHandle !== null) {
      clearInterval(this.advanceHandle)
      this.advanceHandle = null
    }
  }
}
