import { describe, it, expect, vi } from 'vitest'
import { CarouselModel } from '../src/renderer/src/ui/carousel-model'
import type { Game } from '../src/shared/types'

function game(id: string, order: number): Game {
  return { id, name: id.toUpperCase(), kind: 'web', url: `https://x.test/${id}`, gameId: id, logo: '', order }
}

const GAMES: Game[] = [game('a', 0), game('b', 1), game('c', 2)]

describe('CarouselModel', () => {
  it('starts on the first game by default', () => {
    const m = new CarouselModel(GAMES)
    expect(m.currentIndex).toBe(0)
    expect(m.current().id).toBe('a')
    expect(m.length).toBe(3)
  })

  it('accepts a wrapped start index', () => {
    expect(new CarouselModel(GAMES, 1).current().id).toBe('b')
    // Out-of-range start indices wrap into range.
    expect(new CarouselModel(GAMES, 4).current().id).toBe('b')
    expect(new CarouselModel(GAMES, -1).current().id).toBe('c')
  })

  it('throws on an empty game list', () => {
    expect(() => new CarouselModel([])).toThrow()
  })

  it('next() advances and wraps last → first', () => {
    const m = new CarouselModel(GAMES)
    m.next()
    expect(m.current().id).toBe('b')
    m.next()
    expect(m.current().id).toBe('c')
    m.next() // wrap
    expect(m.current().id).toBe('a')
  })

  it('prev() steps back and wraps first → last', () => {
    const m = new CarouselModel(GAMES)
    m.prev() // wrap from a → c
    expect(m.current().id).toBe('c')
    m.prev()
    expect(m.current().id).toBe('b')
  })

  it('select() jumps to an absolute index and wraps out-of-range values', () => {
    const m = new CarouselModel(GAMES)
    m.select(2)
    expect(m.current().id).toBe('c')
    m.select(3) // wraps to 0
    expect(m.current().id).toBe('a')
    m.select(-1) // wraps to 2
    expect(m.current().id).toBe('c')
  })

  it('at() reads neighbours with wrap-around without moving the cursor', () => {
    const m = new CarouselModel(GAMES)
    expect(m.at(-1).id).toBe('c') // left neighbour of first wraps to last
    expect(m.at(3).id).toBe('a') // right wrap
    expect(m.currentIndex).toBe(0) // cursor unchanged
  })

  it('onChange fires on genuine movement only, never on a no-op select', () => {
    const m = new CarouselModel(GAMES)
    const seen: string[] = []
    m.onChange((g, i) => seen.push(`${g.id}:${i}`))

    m.next() // a → b
    m.select(1) // no-op (already b) — must NOT fire
    m.prev() // b → a

    expect(seen).toEqual(['b:1', 'a:0'])
  })

  it('onChange returns a working unsubscribe', () => {
    const m = new CarouselModel(GAMES)
    const cb = vi.fn()
    const off = m.onChange(cb)
    m.next()
    off()
    m.next()
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
