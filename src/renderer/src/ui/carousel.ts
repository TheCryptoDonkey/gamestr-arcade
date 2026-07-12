/**
 * gamestr-arcade — hero carousel (DOM + GSAP render layer).
 *
 * The centrepiece "attract/select" screen: the selected game fills the screen as
 * a full-bleed cinematic hero, with an oversized logo, tagline and a pulsing
 * "press to play" prompt, over a filmstrip of neighbours and page dots.
 *
 * Composition: this class owns the DOM and motion only — the selection cursor
 * lives in the pure `CarouselModel` so the navigation logic stays unit-testable.
 *
 * Motion is GSAP-driven (cross-fade + slide + logo pop + parallax) and honours
 * `prefers-reduced-motion` by snapping. A CRT overlay layer is added by a later
 * task on top of `.crt-anchor`; this module leaves that seam free.
 */

import { gsap } from 'gsap'
import type { Game } from '../../../shared/types'
import { CarouselModel, type SelectionListener } from './carousel-model'

export interface CarouselOptions {
  title?: string
  wordmark?: string
  accent?: string
}

/**
 * How many neighbours to show either side of the active tile in the filmstrip.
 * Capped at runtime so a small library (e.g. 5 games) never shows duplicate
 * tiles from wrap-around — the strip shows each game at most once.
 */
const FILMSTRIP_RADIUS = 3

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Result of analysing a logo bitmap for the logo-on-left treatment. */
interface LogoInfo {
  /** URL to render — the trimmed data-URL for a padded cut-out, else the original. */
  url: string
  /** Content aspect ratio (width / height) used for the wide-vs-square decision. */
  ratio: number
  /** True when the art is a transparent cut-out (composite bare); false = opaque plate. */
  transparent: boolean
}

/** gamestr editorial badges to surface for a game (TRENDING / NEW). */
function gameBadges(game: Game): Array<{ label: string; cls: string }> {
  const out: Array<{ label: string; cls: string }> = []
  if (game.trending) out.push({ label: 'TRENDING', cls: 'badge-trend' })
  if (game.newRelease) out.push({ label: 'NEW', cls: 'badge-new' })
  return out
}

/** A two-letter monogram for the deterministic placeholder avatar / tile glyph. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/**
 * Build the accent-derived "fancy" backdrop used when a game has no clean hero
 * (or opts out, like Pallasite whose og-image clashes with logo-on-left).
 *
 * This is a *premium* neon backdrop — not a flat fill — so a logo-on-left tile
 * looks great with no photographic hero. Layers, back-to-front:
 *   1. deep diagonal space base (navy → near-black)
 *   2. a broad accent aurora bloom on the RIGHT (balances the logo on the left)
 *   3. a soft accent wash low-right + a faint bleed into the left third
 *   4. (the motif + vignette + grain are separate DOM layers, see CSS)
 *
 * An accompanying SVG motif (concentric orbital rings) is painted as a *separate*
 * layer via `motifBackground()` so it can sit between the wash and the vignette
 * without being clipped by `background-size: cover` on the photographic path.
 */
function gradientHero(accent: string): string {
  return [
    // Right-weighted aurora bloom — the focal "where a hero render would sit".
    `radial-gradient(72% 96% at 70% 40%, ${accent}55 0%, ${accent}26 24%, transparent 58%)`,
    // Low-right accent wash for floor glow.
    `radial-gradient(95% 85% at 88% 106%, ${accent}3a 0%, transparent 56%)`,
    // A soft pool behind the logo on the LEFT so it sits in light, not on black.
    `radial-gradient(48% 62% at 12% 64%, ${accent}28 0%, transparent 60%)`,
    // Cool top-left haze for depth.
    `radial-gradient(120% 90% at 14% 2%, ${accent}26 0%, transparent 50%)`,
    // Deep diagonal base.
    `linear-gradient(155deg, #0c1530 0%, #070c1c 50%, #03040a 100%)`,
  ].join(', ')
}

/**
 * A concentric "orbital rings" motif as an inline-SVG data-URI, tinted to accent.
 * Painted as its own layer (right-of-centre, behind the logo's negative space) to
 * give the fancy backdrop an arcade subject without a literal hero or monogram.
 */
function motifBackground(accent: string): string {
  const c = encodeURIComponent(accent)
  // Concentric rings + a couple of tilted orbital ellipses + a faint core bloom,
  // centred ~72% across (the right side) at mid-height. viewBox is 16:9.
  const rings = [0, 1, 2, 3, 4, 5]
    .map(i => {
      const r = 60 + i * 70
      const op = (0.5 - i * 0.06).toFixed(3)
      const w = i === 1 ? 3 : 1.6
      return `<circle cx='690' cy='300' r='${r}' fill='none' stroke='${c}' stroke-opacity='${op}' stroke-width='${w}'/>`
    })
    .join('')
  const orbits =
    `<ellipse cx='690' cy='300' rx='360' ry='128' fill='none' stroke='${c}' stroke-opacity='0.28' stroke-width='1.6' transform='rotate(-18 690 300)'/>` +
    `<ellipse cx='690' cy='300' rx='250' ry='86' fill='none' stroke='${c}' stroke-opacity='0.32' stroke-width='1.4' transform='rotate(22 690 300)'/>`
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'>` +
    `<g>${rings}${orbits}</g></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

export class Carousel {
  private readonly model: CarouselModel
  private readonly host: HTMLElement
  private readonly options: Required<CarouselOptions>

  // Foreground (content) refs.
  private heroA!: HTMLElement
  private heroB!: HTMLElement
  private activeHero!: HTMLElement // points at heroA or heroB (whichever is showing)
  private logoEl!: HTMLElement
  private metaEl!: HTMLElement
  private nameEl!: HTMLElement
  private taglineEl!: HTMLElement
  private ctaTextEl!: HTMLElement
  private ctaEl!: HTMLButtonElement
  private ribbonEl!: HTMLElement
  private indexEl!: HTMLElement
  private badgesEl!: HTMLElement
  private filmstripEl!: HTMLElement
  private dotsEl!: HTMLElement

  private readonly external = new Set<SelectionListener>()
  private readonly activationListeners = new Set<(game: Game) => void>()
  private activeTl: gsap.core.Timeline | null = null

  /**
   * Cache of analysed logos keyed by source URL. Logos are shipped in two awkward
   * shapes we must normalise for a clean logo-on-left:
   *   - artwork centred in transparent padding (a wide wordmark in a square PNG) —
   *     natural aspect lies about the shape, so we trim to the opaque bounds;
   *   - an *opaque* (usually dark) background plate rather than a cut-out — which
   *     would otherwise read as an ugly rectangle floating on the backdrop.
   * We analyse once and reuse. `null` = analysis failed (e.g. tainted canvas) →
   * fall back to the raw image + natural aspect + bare treatment.
   */
  private readonly trimmedLogo = new Map<string, LogoInfo | null>()

  constructor(games: readonly Game[], host: HTMLElement, startIndex = 0, options: CarouselOptions = {}) {
    this.model = new CarouselModel(games, startIndex)
    this.host = host
    this.options = {
      title: options.title || 'gamestr arcade',
      wordmark: options.wordmark || options.title || 'gamestr arcade',
      accent: options.accent || '#7cf3ff',
    }
    this.build()
    // Internal subscription drives the DOM; direction is derived from index delta.
    this.renderImmediate(this.model.current(), this.model.currentIndex)
  }

  // ── Public selection API (delegates to the model, animates the DOM) ──────────

  current(): Game {
    return this.model.current()
  }

  next(): void {
    this.animateTo(this.model.currentIndex + 1, 1)
  }

  prev(): void {
    this.animateTo(this.model.currentIndex - 1, -1)
  }

  select(index: number): void {
    const target = ((Math.trunc(index) % this.model.length) + this.model.length) % this.model.length
    if (target === this.model.currentIndex) return
    // Choose the visually shorter direction for a jump (wrap-aware).
    const forward = (target - this.model.currentIndex + this.model.length) % this.model.length
    const dir = forward <= this.model.length / 2 ? 1 : -1
    this.animateTo(index, dir)
  }

  /** Subscribe to selection changes (fires after the cursor moves). */
  onChange(listener: SelectionListener): () => void {
    this.external.add(listener)
    return () => this.external.delete(listener)
  }

  /** Subscribe to pointer/touch activation of the selected game. */
  onActivate(listener: (game: Game) => void): () => void {
    this.activationListeners.add(listener)
    return () => this.activationListeners.delete(listener)
  }

  /**
   * Re-render the current game in place (no animation).
   * Called when returning from a web game — the overlay is gone but the carousel
   * DOM is intact; this ensures the hero and content are freshly painted.
   */
  refocus(): void {
    this.renderImmediate(this.model.current(), this.model.currentIndex)
  }

  // ── DOM construction ─────────────────────────────────────────────────────────

  private build(): void {
    this.host.classList.add('arcade')
    this.host.innerHTML = `
      <div class="crt-anchor">
        <div class="stage" aria-hidden="false">
          <div class="hero-layer hero-a"></div>
          <div class="hero-layer hero-b"></div>
          <div class="stage-vignette"></div>
          <div class="stage-grain"></div>
        </div>

        <header class="topbar">
          <div class="brand">
            <span class="brand-mark"></span>
            <span class="brand-word"></span>
          </div>
          <div class="topbar-index"></div>
        </header>

        <section class="showcase">
          <div class="showcase-meta">
            <div class="kicker"><span class="kicker-dot"></span><span class="kicker-text">NOW SELECTING</span><span class="showcase-badges"></span></div>
            <div class="download-ribbon" hidden><span class="dl-glyph">⤓</span>DOWNLOAD&nbsp;ONLY</div>
            <div class="logo-slot"></div>
            <h1 class="game-name"></h1>
            <p class="game-tagline"></p>
            <button class="cta" type="button">
              <span class="cta-key">⏎</span>
              <span class="cta-text">PRESS&nbsp;ENTER&nbsp;/&nbsp;Ⓐ&nbsp;TO&nbsp;PLAY</span>
            </button>
          </div>
        </section>

        <nav class="filmstrip-wrap" aria-label="Game catalogue">
          <div class="filmstrip"></div>
          <div class="dots" aria-label="Jump to game"></div>
        </nav>
      </div>
    `

    this.heroA = this.q('.hero-a')
    this.heroB = this.q('.hero-b')
    this.activeHero = this.heroA
    this.logoEl = this.q('.logo-slot')
    this.nameEl = this.q('.game-name')
    this.taglineEl = this.q('.game-tagline')
    this.ctaEl = this.q<HTMLButtonElement>('.cta')
    this.ctaTextEl = this.q('.cta-text')
    this.ribbonEl = this.q('.download-ribbon')
    this.metaEl = this.q('.showcase-meta')
    this.indexEl = this.q('.topbar-index')
    this.badgesEl = this.q('.showcase-badges')
    this.filmstripEl = this.q('.filmstrip')
    this.dotsEl = this.q('.dots')

    const brand = this.q('.brand-word')
    brand.textContent = this.options.wordmark.toUpperCase()
    brand.setAttribute('aria-label', this.options.title)
    this.ctaEl.addEventListener('click', () => this.activateCurrent())

    this.buildDots()
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    const el = this.host.querySelector<T>(sel)
    if (!el) throw new Error(`carousel: missing element ${sel}`)
    return el
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  /** Paint a hero layer's background from a game's hero image or accent fallback. */
  private paintHero(layer: HTMLElement, game: Game): void {
    const accent = game.accent || this.options.accent
    if (game.hero) {
      layer.replaceChildren()
      layer.style.removeProperty('--motif')
      layer.classList.remove('hero-fancy')
      layer.classList.add('hero-image')
      if (/\.mp4(?:$|[?#])/i.test(game.hero)) {
        // Hero reels are ambient cabinet art: always muted and non-interactive.
        // The whole layer cross-fades, so image and video heroes share one path.
        const video = document.createElement('video')
        video.className = 'hero-video'
        video.src = game.hero
        video.autoplay = true
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.preload = 'metadata'
        video.setAttribute('aria-hidden', 'true')
        layer.style.backgroundImage = gradientHero(accent)
        layer.appendChild(video)
        void video.play().catch(() => { /* first interaction or next repaint retries */ })
      } else {
        // Clean photographic hero: use it as the full-bleed background. The logo
        // still renders on the left (handled in renderLogo) — hero + logo coexist.
        layer.style.backgroundImage = `url("${game.hero}")`
      }
    } else {
      // No clean hero → the *fancy* accent-driven neon backdrop. The orbital motif
      // is a separate var-driven layer so it reads as a subject without a literal
      // monogram (which would clash with the logo-on-left treatment).
      layer.style.backgroundImage = gradientHero(accent)
      layer.replaceChildren()
      layer.style.setProperty('--motif', motifBackground(accent))
      layer.classList.add('hero-fancy')
      layer.classList.remove('hero-image')
    }
  }

  /**
   * Render the foreground logo/wordmark slot for a game.
   *
   * Logo-on-left is the headline element. We support both shapes of art:
   *   - a *square* icon/medallion (e.g. Pallasite's crystal) — sized by height and
   *     given a subtle plinth so it reads as a crisp badge, not a floating sticker;
   *   - a *wide* wordmark (e.g. Sats-Man) — allowed to run wider, sized by width.
   *
   * Shape is decided from the *content* aspect (after trimming transparent padding,
   * since logos are often a wide wordmark centred on a square canvas — see
   * `loadTrimmedLogo`). With a logo image present the redundant H1 name is hidden.
   *
   * Falls back to a styled neon *name wordmark* when a game has no logo.
   */
  private renderLogo(game: Game): void {
    if (game.logo) {
      this.logoEl.classList.add('has-logo')
      this.logoEl.classList.remove('has-word', 'is-wide', 'is-square', 'is-plated', 'is-bare')
      const img = document.createElement('img')
      img.className = 'logo-img'
      img.alt = game.name
      img.decoding = 'async'
      img.src = game.logo
      this.logoEl.replaceChildren(img)

      // Analyse once (async). The slot defaults to a square + plated treatment via
      // CSS until known, so there's no resize flash and an opaque logo never flashes
      // a raw rectangle on the backdrop.
      const logoSrc = game.logo
      void this.loadTrimmedLogo(logoSrc).then(info => {
        // Bail if the selection moved on while analysing (avoid cross-tagging).
        if (this.logoEl.querySelector('img.logo-img') !== img) return
        const ratio = info ? info.ratio : img.naturalWidth / Math.max(1, img.naturalHeight)
        const wide = ratio >= 1.7
        this.logoEl.classList.toggle('is-wide', wide)
        this.logoEl.classList.toggle('is-square', !wide)
        // A logo with real transparency composites directly (bare); an opaque
        // background gets a deliberate "cartridge plate" so the box reads as design.
        const bare = info ? info.transparent : false
        this.logoEl.classList.toggle('is-bare', bare)
        this.logoEl.classList.toggle('is-plated', !bare)
        // Swap to the trimmed (padding-free) art so a wide wordmark fills its box
        // instead of sitting small inside a square canvas.
        if (info && img.getAttribute('src') !== info.url) img.src = info.url
      })
    } else {
      // Stylised text wordmark fallback — oversized condensed neon.
      this.logoEl.classList.add('has-word')
      this.logoEl.classList.remove('has-logo', 'is-wide', 'is-square')
      const span = document.createElement('span')
      span.className = 'logo-word'
      span.textContent = game.name
      this.logoEl.replaceChildren(span)
    }
  }

  /**
   * Analyse a logo (trim transparent padding, content aspect, transparency).
   * Cached per source URL. Returns `null` if the image can't be read (e.g. a
   * tainted canvas) so the caller falls back to the raw image + bare treatment.
   */
  private async loadTrimmedLogo(src: string): Promise<LogoInfo | null> {
    const cached = this.trimmedLogo.get(src)
    if (cached !== undefined) return cached
    const result = await analyseLogo(src).catch(() => null)
    this.trimmedLogo.set(src, result)
    return result
  }

  /** Apply per-game theme + textual content (shared by immediate + animated paths). */
  private applyContent(game: Game, index: number): void {
    const accent = game.accent || this.options.accent
    this.host.style.setProperty('--accent', accent)
    this.host.style.setProperty('--accent-soft', accent + '26')
    this.host.style.setProperty('--accent-glow', accent + '88')

    // Download-only games stay on show but greyed-out, with a ribbon + a "get it"
    // call-to-action (pressing play opens the QR panel — see main.ts). The grey is
    // scoped in CSS to the artwork (hero + logo), not the whole frame.
    const downloadOnly = !!game.downloadOnly
    this.host.classList.toggle('is-download-only', downloadOnly)
    this.ribbonEl.hidden = !downloadOnly
    const unavailable = game.available === false
    this.ctaEl.disabled = unavailable
    this.ctaEl.setAttribute('aria-label', unavailable ? `${game.name} is unavailable` : `${downloadOnly ? 'Download' : 'Play'} ${game.name}`)
    this.ctaTextEl.innerHTML = unavailable
      ? 'NOT&nbsp;AVAILABLE&nbsp;ON&nbsp;THIS&nbsp;CABINET'
      : downloadOnly
        ? 'PRESS&nbsp;ENTER&nbsp;/&nbsp;Ⓐ&nbsp;TO&nbsp;DOWNLOAD'
        : 'PRESS&nbsp;ENTER&nbsp;/&nbsp;Ⓐ&nbsp;FOR&nbsp;DETAILS'

    this.renderLogo(game)
    this.nameEl.textContent = game.name
    this.taglineEl.textContent = game.tagline || ''
    this.taglineEl.style.display = game.tagline ? '' : 'none'

    // gamestr TRENDING / NEW badges for the selected game (live editorial flags).
    const badges = gameBadges(game)
    this.badgesEl.replaceChildren(
      ...badges.map(b => {
        const s = document.createElement('span')
        s.className = 'show-badge ' + b.cls
        s.textContent = b.label
        return s
      }),
    )
    this.badgesEl.style.display = badges.length ? '' : 'none'
    const human = String(index + 1).padStart(2, '0')
    const total = String(this.model.length).padStart(2, '0')
    this.indexEl.innerHTML = `<span class="idx-cur">${human}</span><span class="idx-sep">/</span><span class="idx-total">${total}</span>`

    this.renderFilmstrip(index)
    this.updateDots(index)
  }

  /** First paint — no animation, everything in place. */
  private renderImmediate(game: Game, index: number): void {
    this.paintHero(this.activeHero, game)
    this.activeHero.style.opacity = '1'
    this.applyContent(game, index)
  }

  // ── Transition ───────────────────────────────────────────────────────────────

  private animateTo(rawIndex: number, dir: 1 | -1): void {
    const from = this.model.currentIndex
    this.model.select(rawIndex)
    const to = this.model.currentIndex
    if (to === from) return

    const game = this.model.current()
    for (const listener of this.external) listener(game, to)

    if (reduceMotion) {
      this.paintHero(this.activeHero, game)
      this.applyContent(game, to)
      return
    }

    // Under rapid input, snap any in-flight transition to its end first so the
    // active-layer bookkeeping is settled before we pick incoming/outgoing.
    if (this.activeTl) this.activeTl.progress(1)

    // Cross-fade between the two hero layers so the navy base never flashes.
    const incoming = this.activeHero === this.heroA ? this.heroB : this.heroA
    const outgoing = this.activeHero
    this.paintHero(incoming, game)

    const slide = 90 * dir

    gsap.killTweensOf([incoming, outgoing, this.metaEl, this.logoEl])
    gsap.set(incoming, { opacity: 0, xPercent: 0, scale: 1.08, x: slide })
    gsap.set(outgoing, { zIndex: 1 })
    gsap.set(incoming, { zIndex: 2 })

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        this.activeHero = incoming
        gsap.set(outgoing, { opacity: 0 })
        outgoing.querySelector('video')?.pause()
        this.activeTl = null
      },
    })
    this.activeTl = tl

    tl.to(outgoing, { opacity: 0, scale: 1.04, x: -slide * 0.4, duration: 0.55 }, 0)
    tl.to(incoming, { opacity: 1, scale: 1, x: 0, duration: 0.7 }, 0)

    // Content swaps at the crossover for a crisp logo "pop".
    tl.add(() => this.applyContent(game, to), 0.18)
    tl.fromTo(
      this.metaEl,
      { opacity: 0, y: 26, filter: 'blur(6px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power2.out' },
      0.18,
    )
    // Logo "pop": overshoot scale-in on the freshly-swapped logo/wordmark.
    tl.fromTo(
      this.logoEl,
      { scale: 0.82, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(2.2)', transformOrigin: 'left bottom' },
      0.2,
    )
  }

  // ── Filmstrip + dots ──────────────────────────────────────────────────────────

  private renderFilmstrip(centre: number): void {
    const frag = document.createDocumentFragment()
    // Never show the same game twice via wrap: cap neighbours at floor((n-1)/2).
    const radius = Math.min(FILMSTRIP_RADIUS, Math.floor((this.model.length - 1) / 2))
    for (let offset = -radius; offset <= radius; offset++) {
      const idx = centre + offset
      const game = this.model.at(idx)
      const tile = document.createElement('button')
      tile.type = 'button'
      tile.className = 'tile' + (offset === 0 ? ' tile-active' : '') + (game.downloadOnly ? ' tile-download' : '')
      tile.dataset.offset = String(offset)
      tile.style.setProperty('--tile-accent', game.accent || this.options.accent)
      tile.setAttribute('aria-label', offset === 0 ? `Open details for ${game.name}` : `Select ${game.name}`)
      if (offset === 0) tile.setAttribute('aria-current', 'true')

      const art = document.createElement('span')
      art.className = 'tile-art'
      art.setAttribute('aria-hidden', 'true')
      if (game.logo) {
        const img = document.createElement('img')
        img.src = game.logo
        img.alt = ''
        img.className = 'tile-img'
        art.appendChild(img)
      } else {
        art.classList.add('tile-art-mono')
        art.textContent = monogram(game.name)
      }
      tile.appendChild(art)

      const cap = document.createElement('span')
      cap.className = 'tile-cap'
      cap.textContent = game.name
      tile.appendChild(cap)

      // LOCAL badge — shown when the game is served from the local mirror server.
      if (game.localSite) {
        const badge = document.createElement('span')
        badge.className = 'tile-local-badge'
        badge.textContent = 'LOCAL'
        badge.setAttribute('aria-label', 'served from local mirror')
        tile.appendChild(badge)
      }

      // Download-only badge — a download glyph chip (top-right; a download-only
      // game never has a local mirror, so it can't collide with the LOCAL badge).
      if (game.downloadOnly) {
        const badge = document.createElement('span')
        badge.className = 'tile-dl-badge'
        badge.textContent = '⤓'
        badge.setAttribute('aria-label', 'download only')
        tile.appendChild(badge)
      }

      // gamestr TRENDING / NEW badges (top-left, stacked) from the live catalogue.
      const editorial = gameBadges(game)
      if (editorial.length) {
        const wrap = document.createElement('span')
        wrap.className = 'tile-badges'
        for (const b of editorial) {
          const el = document.createElement('span')
          el.className = 'tile-badge ' + b.cls
          el.textContent = b.label
          wrap.appendChild(el)
        }
        tile.appendChild(wrap)
      }

      // Clicking/tapping a tile selects it (pointer support for testing + touch).
      tile.addEventListener('click', () => {
        if (offset === 0) this.activateCurrent()
        else this.select(this.absolute(idx))
      })
      frag.appendChild(tile)
    }
    this.filmstripEl.replaceChildren(frag)

    if (window.matchMedia('(max-width: 720px)').matches) {
      this.filmstripEl.querySelector('.tile-active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
    }

    if (!reduceMotion) {
      gsap.fromTo(
        this.filmstripEl.children,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.035, ease: 'power2.out' },
      )
    }
  }

  private buildDots(): void {
    const frag = document.createDocumentFragment()
    for (let i = 0; i < this.model.length; i++) {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'dot'
      dot.setAttribute('aria-label', `Select ${this.model.at(i).name}`)
      dot.addEventListener('click', () => this.select(i))
      frag.appendChild(dot)
    }
    this.dotsEl.replaceChildren(frag)
  }

  private updateDots(active: number): void {
    const dots = this.dotsEl.children
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('dot-active', i === active)
      ;(dots[i] as HTMLButtonElement).tabIndex = i === active ? 0 : -1
      if (i === active) dots[i].setAttribute('aria-current', 'true')
      else dots[i].removeAttribute('aria-current')
    }
  }

  /** Normalise any (possibly wrapped) index into an absolute in-range index. */
  private absolute(i: number): number {
    const n = this.model.length
    return ((Math.trunc(i) % n) + n) % n
  }

  private activateCurrent(): void {
    const game = this.model.current()
    if (game.available === false) return
    for (const listener of this.activationListeners) listener(game)
  }
}

/**
 * Analyse a logo bitmap: detect whether it's a transparent cut-out or an opaque
 * plate, find its content aspect ratio, and (for a padded cut-out) return the
 * cropped content as a PNG data-URL.
 *
 * Logos arrive in two awkward shapes. (1) A wide wordmark (or compact icon) centred
 * on a square canvas with transparent margins, so the *canvas* aspect lies about the
 * *art* shape — we scan the alpha channel for the opaque bounding box and crop to it.
 * (2) An *opaque* (usually dark) background plate rather than a cut-out — we detect
 * this from the transparent-pixel fraction so the caller can frame it as a deliberate
 * "cartridge plate" instead of letting a raw rectangle float on the backdrop.
 *
 * Rejects (caller maps to `null`) if the canvas can't be read (tainted).
 */
async function analyseLogo(src: string): Promise<LogoInfo> {
  const img = await loadImage(src)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) throw new Error('logo has no intrinsic size')

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h) // throws if tainted → caller → null

  // Opaque bounding box + count of transparent pixels (for the cut-out decision).
  const ALPHA = 24
  let top = h
  let left = w
  let right = -1
  let bottom = -1
  let transparentPx = 0
  const total = w * h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3]
      if (a <= ALPHA) {
        transparentPx++
        continue
      }
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  // A logo is a cut-out (composite bare) when a meaningful share of pixels are
  // transparent; otherwise it's an opaque plate (frame it). Fully transparent art
  // is treated as bare with the canvas aspect.
  const transparent = transparentPx / total >= 0.06
  if (right < left || bottom < top) return { url: src, ratio: w / h, transparent: true }

  const cw = right - left + 1
  const ch = bottom - top + 1
  // Only crop when there's real transparent padding to remove AND the logo is a
  // cut-out — never crop into an opaque plate (its bbox is the whole canvas anyway).
  const padded = cw < w * 0.98 || ch < h * 0.98
  if (!transparent || !padded) {
    return { url: src, ratio: transparent ? cw / ch : w / h, transparent }
  }

  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  out.getContext('2d')!.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch)
  return { url: out.toDataURL('image/png'), ratio: cw / ch, transparent: true }
}

/** Promise wrapper around HTMLImageElement load. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load ${src}`))
    img.src = src
  })
}
