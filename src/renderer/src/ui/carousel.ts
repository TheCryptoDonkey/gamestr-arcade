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

/**
 * How many neighbours to show either side of the active tile in the filmstrip.
 * Capped at runtime so a small library (e.g. 5 games) never shows duplicate
 * tiles from wrap-around — the strip shows each game at most once.
 */
const FILMSTRIP_RADIUS = 3

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A two-letter monogram for the deterministic placeholder avatar / tile glyph. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/** Build the accent-derived atmospheric backdrop used when a game has no hero. */
function gradientHero(accent: string): string {
  // Layered radial gradients give depth (a "gradient mesh") rather than a flat fill.
  return [
    `radial-gradient(120% 90% at 18% 8%, ${accent}40 0%, transparent 55%)`,
    `radial-gradient(90% 80% at 88% 22%, ${accent}24 0%, transparent 60%)`,
    `radial-gradient(140% 120% at 70% 110%, ${accent}30 0%, transparent 62%)`,
    `linear-gradient(160deg, #0a0f1f 0%, #05070f 60%, #03040a 100%)`,
  ].join(', ')
}

export class Carousel {
  private readonly model: CarouselModel
  private readonly host: HTMLElement

  // Foreground (content) refs.
  private heroA!: HTMLElement
  private heroB!: HTMLElement
  private activeHero!: HTMLElement // points at heroA or heroB (whichever is showing)
  private logoEl!: HTMLElement
  private metaEl!: HTMLElement
  private nameEl!: HTMLElement
  private taglineEl!: HTMLElement
  private indexEl!: HTMLElement
  private filmstripEl!: HTMLElement
  private dotsEl!: HTMLElement

  private readonly external = new Set<SelectionListener>()
  private activeTl: gsap.core.Timeline | null = null

  constructor(games: readonly Game[], host: HTMLElement, startIndex = 0) {
    this.model = new CarouselModel(games, startIndex)
    this.host = host
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
            <span class="brand-word">GAMESTR<span class="brand-word-dim">ARCADE</span></span>
          </div>
          <div class="topbar-index"></div>
        </header>

        <section class="showcase">
          <div class="showcase-meta">
            <div class="kicker"><span class="kicker-dot"></span><span class="kicker-text">NOW SELECTING</span></div>
            <div class="logo-slot"></div>
            <h1 class="game-name"></h1>
            <p class="game-tagline"></p>
            <div class="cta">
              <span class="cta-key">⏎</span>
              <span class="cta-text">PRESS&nbsp;ENTER&nbsp;/&nbsp;Ⓐ&nbsp;TO&nbsp;PLAY</span>
            </div>
          </div>
        </section>

        <nav class="filmstrip-wrap">
          <div class="filmstrip"></div>
          <div class="dots"></div>
        </nav>
      </div>
    `

    this.heroA = this.q('.hero-a')
    this.heroB = this.q('.hero-b')
    this.activeHero = this.heroA
    this.logoEl = this.q('.logo-slot')
    this.nameEl = this.q('.game-name')
    this.taglineEl = this.q('.game-tagline')
    this.metaEl = this.q('.showcase-meta')
    this.indexEl = this.q('.topbar-index')
    this.filmstripEl = this.q('.filmstrip')
    this.dotsEl = this.q('.dots')

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
    const accent = game.accent || '#7cf3ff'
    if (game.hero) {
      layer.style.backgroundImage = `url("${game.hero}")`
      layer.classList.remove('hero-gradient')
      layer.classList.add('hero-image')
    } else {
      layer.style.backgroundImage = gradientHero(accent)
      layer.classList.add('hero-gradient')
      layer.classList.remove('hero-image')
      // Ghosted wordmark gives the gradient fallback a focal subject.
      layer.dataset.word = monogram(game.name)
    }
  }

  /** Render the foreground logo/wordmark slot for a game. */
  private renderLogo(game: Game): void {
    if (game.logo) {
      this.logoEl.innerHTML = `<img class="logo-img" src="${game.logo}" alt="${escapeHtml(game.name)}" />`
    } else {
      // Stylised text wordmark fallback — split for a two-tone neon treatment.
      this.logoEl.innerHTML = `<span class="logo-word">${escapeHtml(game.name)}</span>`
    }
  }

  /** Apply per-game theme + textual content (shared by immediate + animated paths). */
  private applyContent(game: Game, index: number): void {
    const accent = game.accent || '#7cf3ff'
    this.host.style.setProperty('--accent', accent)
    this.host.style.setProperty('--accent-soft', accent + '26')
    this.host.style.setProperty('--accent-glow', accent + '88')

    this.renderLogo(game)
    this.nameEl.textContent = game.name
    this.taglineEl.textContent = game.tagline || ''
    this.taglineEl.style.display = game.tagline ? '' : 'none'
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
      tile.className = 'tile' + (offset === 0 ? ' tile-active' : '')
      tile.dataset.offset = String(offset)
      tile.style.setProperty('--tile-accent', game.accent || '#7cf3ff')
      tile.setAttribute('aria-label', game.name)

      const art = document.createElement('span')
      art.className = 'tile-art'
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

      // Clicking/tapping a tile selects it (pointer support for testing + touch).
      tile.addEventListener('click', () => this.select(this.absolute(idx)))
      frag.appendChild(tile)
    }
    this.filmstripEl.replaceChildren(frag)

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
      dot.setAttribute('aria-label', `Game ${i + 1}`)
      dot.addEventListener('click', () => this.select(i))
      frag.appendChild(dot)
    }
    this.dotsEl.replaceChildren(frag)
  }

  private updateDots(active: number): void {
    const dots = this.dotsEl.children
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('dot-active', i === active)
    }
  }

  /** Normalise any (possibly wrapped) index into an absolute in-range index. */
  private absolute(i: number): number {
    const n = this.model.length
    return ((Math.trunc(i) % n) + n) % n
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
