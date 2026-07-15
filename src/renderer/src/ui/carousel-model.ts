/**
 * gamestr-arcade - carousel selection model (pure, no DOM).
 *
 * Owns *which* game is selected and notifies subscribers on change. Kept free of
 * any DOM/GSAP so the navigation logic (next/prev/wrap/select) is unit-testable
 * in a plain Node environment. The DOM-rendering `Carousel` class composes this.
 */

import type { Game } from '../../../shared/types'

export type SelectionListener = (game: Game, index: number) => void

/**
 * A wrap-around selection cursor over an ordered list of games.
 *
 * - `next()` / `prev()` step the cursor, wrapping at the ends.
 * - `select(i)` jumps to an absolute index (also wrapped, so out-of-range and
 *   negative indices are always normalised to a valid slot).
 * - `onChange()` registers a listener fired only when the index actually moves
 *   (selecting the current index is a no-op, so motion never re-triggers).
 */
export class CarouselModel {
  private readonly games: readonly Game[]
  private index = 0
  private readonly listeners = new Set<SelectionListener>()

  constructor(games: readonly Game[], startIndex = 0) {
    if (games.length === 0) {
      throw new Error('CarouselModel requires at least one game')
    }
    this.games = games
    this.index = this.wrap(startIndex)
  }

  /** Number of games in the carousel. */
  get length(): number {
    return this.games.length
  }

  /** The currently selected index (always in range). */
  get currentIndex(): number {
    return this.index
  }

  /** The currently selected game. */
  current(): Game {
    return this.games[this.index]
  }

  /** The game at an absolute (wrapped) index - handy for filmstrip neighbours. */
  at(i: number): Game {
    return this.games[this.wrap(i)]
  }

  /** Advance to the next game (wraps from last → first). */
  next(): void {
    this.go(this.index + 1)
  }

  /** Step back to the previous game (wraps from first → last). */
  prev(): void {
    this.go(this.index - 1)
  }

  /** Jump to an absolute index; out-of-range values wrap into range. */
  select(i: number): void {
    this.go(this.wrap(i))
  }

  /**
   * Subscribe to selection changes. Returns an unsubscribe function.
   * The listener fires only on genuine movement, never on a no-op select.
   */
  onChange(listener: SelectionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Normalise any integer into [0, length) with positive-modulo wrap-around. */
  private wrap(i: number): number {
    const n = this.games.length
    return ((Math.trunc(i) % n) + n) % n
  }

  private go(rawIndex: number): void {
    const nextIndex = this.wrap(rawIndex)
    if (nextIndex === this.index) return
    this.index = nextIndex
    const game = this.current()
    for (const listener of this.listeners) listener(game, this.index)
  }
}
