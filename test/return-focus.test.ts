// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { restoreCarouselFocus } from '../src/renderer/src/ui/return-focus'

let paint: () => void
let host: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<main id="app" tabindex="-1"><button class="cta">Play</button><input></main>'
  host = document.getElementById('app')!
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    paint = () => callback(0)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { paint = () => {} })
})
afterEach(() => vi.restoreAllMocks())

it('repairs the last native button focus restored after the return handler', () => {
  restoreCarouselFocus(host, () => true)
  expect(document.activeElement).toBe(host)
  host.querySelector<HTMLButtonElement>('.cta')!.focus()
  paint()
  expect(document.activeElement).toBe(host)
})

it.each(['keydown', 'pointerdown'])('respects player %s input before the next paint', type => {
  restoreCarouselFocus(host, () => true)
  host.querySelector<HTMLButtonElement>('.cta')!.focus()
  window.dispatchEvent(new Event(type))
  paint()
  expect(document.activeElement).toBe(host.querySelector('.cta'))
})

it('does not take focus from another control', () => {
  restoreCarouselFocus(host, () => true)
  host.querySelector<HTMLInputElement>('input')!.focus()
  paint()
  expect(document.activeElement).toBe(host.querySelector('input'))
})

it('does not restore focus after a panel or another game opens', () => {
  let allowed = true
  restoreCarouselFocus(host, () => allowed)
  host.querySelector<HTMLButtonElement>('.cta')!.focus()
  allowed = false
  paint()
  expect(document.activeElement).toBe(host.querySelector('.cta'))
})
