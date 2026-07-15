/**
 * gamestr-arcade - attract mode (idle demo loop).
 *
 * After `timeoutMs` of no input the cabinet enters ATTRACT: it auto-advances the
 * carousel on an interval and raises an "INSERT COIN / PRESS START" overlay.
 * ANY activity exits instantly. Attract is intentionally silent (no audio).
 *
 * The idle/active decision is a tiny pure state machine (`AttractTimer`) with
 * injected timer functions so it is unit-testable with a virtual clock - no real
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

// ── DOM controller (overlay + carousel auto-advance) ─────────────────────────

/** Minimal surface this controller needs from the carousel (keeps it decoupled). */
export interface AttractCarousel {
  next(): void
}

/** One row of the attract top-scores strip (already formatted for display). */
export interface AttractScoreRow {
  label: string
  score: string
}

export interface AttractModeOptions {
  timeoutMs: number
  /** How often to auto-advance the carousel while in attract (ms). */
  advanceMs?: number
  carousel: AttractCarousel
  /** Fires each time attract engages - the shell seeds the scores strip here. */
  onEnter?: () => void
}

export class AttractMode {
  private readonly timer: AttractTimer
  private readonly carousel: AttractCarousel
  private readonly advanceMs: number
  private readonly overlay: HTMLElement
  private readonly scoresEl: HTMLElement
  /** The shell root that gets `attract-cinema` (hides operational chrome). */
  private readonly cinemaRoot: HTMLElement
  private readonly enterHook: (() => void) | undefined
  private advanceHandle: number | null = null

  constructor(host: HTMLElement, opts: AttractModeOptions) {
    this.carousel = opts.carousel
    this.advanceMs = opts.advanceMs ?? 5200
    this.enterHook = opts.onEnter
    this.cinemaRoot = host.closest('.arcade') ?? host

    this.overlay = document.createElement('div')
    this.overlay.className = 'attract'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.overlay.innerHTML = `
      <div class="attract-veil"></div>
      <div class="attract-banner">
        <div class="attract-scores"></div>
        <div class="attract-coin">
          <span class="attract-bullet">●</span>
          <span class="attract-text">INSERT COIN</span>
          <span class="attract-bullet">●</span>
          <span class="attract-text attract-text-alt">PRESS START</span>
          <span class="attract-bullet">●</span>
        </div>
        <div class="attract-sub">DEMO MODE - TOUCH ANY CONTROL TO PLAY</div>
      </div>
    `
    host.appendChild(this.overlay)
    this.scoresEl = this.overlay.querySelector('.attract-scores') as HTMLElement

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

  /** Wire this to `input.onActivity` - any input resets / exits attract. */
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

  /**
   * Replace the top-scores strip for the game currently on the reel.
   * Rows arrive pre-formatted; labels may be relay-sourced names, so they are
   * rendered with textContent - never markup. Empty rows hide the strip.
   */
  setScores(rows: AttractScoreRow[]): void {
    this.scoresEl.replaceChildren()
    this.scoresEl.classList.toggle('attract-scores-empty', rows.length === 0)
    if (rows.length === 0) return
    const title = document.createElement('span')
    title.className = 'as-title'
    title.textContent = '★ TOP SCORES'
    this.scoresEl.appendChild(title)
    rows.forEach((row, i) => {
      const el = document.createElement('span')
      el.className = 'as-row' + (i === 0 ? ' as-row-first' : '')
      const rank = document.createElement('span')
      rank.className = 'as-rank'
      rank.textContent = String(i + 1).padStart(2, '0')
      const name = document.createElement('span')
      name.className = 'as-name'
      name.textContent = row.label
      const score = document.createElement('span')
      score.className = 'as-score'
      score.textContent = row.score
      el.append(rank, name, score)
      this.scoresEl.appendChild(el)
    })
  }

  private enter(): void {
    this.overlay.classList.add('attract-on')
    this.overlay.setAttribute('aria-hidden', 'false')
    // Cinema: fade the operational chrome so the hero reel owns the screen.
    this.cinemaRoot.classList.add('attract-cinema')
    this.enterHook?.()
    // Attract is silent by design - visuals + marquee only.
    this.advanceHandle = window.setInterval(() => this.carousel.next(), this.advanceMs)
  }

  private exit(): void {
    this.overlay.classList.remove('attract-on')
    this.overlay.setAttribute('aria-hidden', 'true')
    this.cinemaRoot.classList.remove('attract-cinema')
    if (this.advanceHandle !== null) {
      clearInterval(this.advanceHandle)
      this.advanceHandle = null
    }
  }
}
