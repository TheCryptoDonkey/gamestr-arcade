/**
 * gamestr-arcade — synthesised arcade SFX (Web Audio API, zero asset files).
 *
 * Everything is generated at runtime from oscillators + envelopes, so the booth
 * is offline-perfect: no sample loading, no CDN, no decode latency. The palette
 * is deliberately "neon cabinet" — clean FM-ish blips and chimes rather than
 * gritty chiptune.
 *
 *   playMove()   — short rising blip on carousel navigation
 *   playSelect() — bright two-note confirm chime on launch
 *   playBack()   — descending tone on back/cancel
 *
 * Attract mode is intentionally SILENT (visuals + marquee only) — a continuous
 * pad grates over an all-day booth, so there is no looping music.
 *
 * A single shared AudioContext is created lazily and resumed on first use
 * (kiosk autoplay policy is relaxed in main, but we resume defensively so the
 * same code works in a normal browser after a user gesture). `muted` gates all
 * output; toggle it from a key for the demo.
 */

export class ArcadeAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private _muted: boolean

  constructor(opts: { muted?: boolean } = {}) {
    this._muted = opts.muted ?? false
  }

  get muted(): boolean {
    return this._muted
  }

  /** Toggle mute; returns the new state. */
  toggleMute(): boolean {
    this._muted = !this._muted
    return this._muted
  }

  setMuted(muted: boolean): void {
    this._muted = muted
  }

  /** Resume the audio context (call from a real input handler if autoplay is gated). */
  resume(): void {
    const ctx = this.ensureCtx()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }

  // ── SFX ──────────────────────────────────────────────────────────────────────

  /** A short, bright blip — carousel move. */
  playMove(): void {
    const ctx = this.audible()
    if (!ctx) return
    const t = ctx.now
    // Quick upward pitch sweep gives a crisp "tick-up" without being shrill.
    this.blip(ctx, { type: 'triangle', from: 540, to: 880, dur: 0.09, peak: 0.16, t })
    // A faint sine octave above adds sparkle.
    this.blip(ctx, { type: 'sine', from: 1080, to: 1760, dur: 0.07, peak: 0.05, t })
  }

  /** A rising two-note confirm chime — launch. */
  playSelect(): void {
    const ctx = this.audible()
    if (!ctx) return
    const t = ctx.now
    // Perfect-fifth-ish rising arpeggio: confident, "coin accepted" feel.
    this.blip(ctx, { type: 'triangle', from: 660, to: 660, dur: 0.1, peak: 0.18, t })
    this.blip(ctx, { type: 'triangle', from: 990, to: 990, dur: 0.16, peak: 0.2, t: t + 0.085 })
    this.blip(ctx, { type: 'sine', from: 1980, to: 1980, dur: 0.18, peak: 0.06, t: t + 0.085 })
    // A soft sub thump underpins the launch.
    this.blip(ctx, { type: 'sine', from: 180, to: 120, dur: 0.22, peak: 0.16, t })
  }

  /** A descending tone — back / cancel. */
  playBack(): void {
    const ctx = this.audible()
    if (!ctx) return
    const t = ctx.now
    this.blip(ctx, { type: 'triangle', from: 620, to: 360, dur: 0.16, peak: 0.16, t })
    this.blip(ctx, { type: 'sine', from: 310, to: 180, dur: 0.18, peak: 0.07, t })
  }

  /** A warm ascending sparkle — celebrations and the donation ask. */
  playChime(): void {
    const ctx = this.audible()
    if (!ctx) return
    const t = ctx.now
    // Gentle major arpeggio with a shimmer on top — friendly, not demanding.
    this.blip(ctx, { type: 'sine', from: 523, to: 523, dur: 0.14, peak: 0.12, t })
    this.blip(ctx, { type: 'sine', from: 659, to: 659, dur: 0.14, peak: 0.12, t: t + 0.09 })
    this.blip(ctx, { type: 'sine', from: 784, to: 784, dur: 0.2, peak: 0.13, t: t + 0.18 })
    this.blip(ctx, { type: 'triangle', from: 1568, to: 1568, dur: 0.26, peak: 0.05, t: t + 0.18 })
  }

  // ── plumbing ──────────────────────────────────────────────────────────────────

  private ensureCtx(): (AudioContext & { now: number }) | null {
    if (this.ctx) return Object.assign(this.ctx, { now: this.ctx.currentTime })
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      this.ctx = new Ctor()
    } catch {
      return null
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(this.ctx.destination)
    return Object.assign(this.ctx, { now: this.ctx.currentTime })
  }

  /** Resolve a live, un-muted context (and refresh `.now`); null if unavailable/muted. */
  private audible(): (AudioContext & { now: number }) | null {
    if (this._muted) return null
    const ctx = this.ensureCtx()
    if (!ctx) return null
    if (ctx.state === 'suspended') void ctx.resume()
    ctx.now = ctx.currentTime
    return ctx
  }

  /** One enveloped oscillator voice with an optional pitch glide. */
  private blip(
    ctx: AudioContext,
    o: { type: OscillatorType; from: number; to: number; dur: number; peak: number; t: number },
  ): void {
    if (!this.master) return
    const osc = ctx.createOscillator()
    osc.type = o.type
    osc.frequency.setValueAtTime(o.from, o.t)
    if (o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), o.t + o.dur)

    const env = ctx.createGain()
    // Fast attack, exponential decay → a clean percussive blip.
    env.gain.setValueAtTime(0.0001, o.t)
    env.gain.exponentialRampToValueAtTime(o.peak, o.t + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur)

    osc.connect(env).connect(this.master)
    osc.start(o.t)
    osc.stop(o.t + o.dur + 0.02)
  }
}
