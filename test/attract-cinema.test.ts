// @vitest-environment happy-dom
/**
 * Tests for attract mode v2 - the cinema reel.
 *
 * Entering attract must fade the operational chrome (via `attract-cinema` on
 * the shell root), fire the onEnter hook so the shell can seed the scores
 * strip, and render pushed score rows as text (relay-sourced names must never
 * become markup). Exiting must restore everything.
 */

import { describe, it, expect, vi } from 'vitest'
import { AttractMode } from '../src/renderer/src/ui/attract'

function makeShell(): { root: HTMLElement; anchor: HTMLElement } {
  const root = document.createElement('div')
  root.className = 'arcade'
  const anchor = document.createElement('div')
  anchor.className = 'crt-anchor'
  root.appendChild(anchor)
  document.body.appendChild(root)
  return { root, anchor }
}

const carousel = { next: vi.fn() }

describe('AttractMode - cinema reel', () => {
  it('toggles attract-cinema on the shell root across enter/exit', () => {
    const { root, anchor } = makeShell()
    const attract = new AttractMode(anchor, { timeoutMs: 60_000, carousel })
    attract.start()

    attract.forceEnter()
    expect(root.classList.contains('attract-cinema')).toBe(true)

    attract.onActivity() // any input exits
    expect(root.classList.contains('attract-cinema')).toBe(false)
  })

  it('fires the onEnter hook each time attract engages', () => {
    const { anchor } = makeShell()
    const onEnter = vi.fn()
    const attract = new AttractMode(anchor, { timeoutMs: 60_000, carousel, onEnter })
    attract.start()

    attract.forceEnter()
    expect(onEnter).toHaveBeenCalledTimes(1)
    attract.onActivity()
    attract.forceEnter()
    expect(onEnter).toHaveBeenCalledTimes(2)
  })

  it('renders pushed score rows and hides the strip when empty', () => {
    const { anchor } = makeShell()
    const attract = new AttractMode(anchor, { timeoutMs: 60_000, carousel })

    attract.setScores([
      { label: 'TheCryptoDonkey', score: '673 046' },
      { label: 'npub1ab…xyz', score: '640 083' },
    ])
    const strip = anchor.querySelector('.attract-scores') as HTMLElement
    expect(strip.classList.contains('attract-scores-empty')).toBe(false)
    expect(strip.querySelectorAll('.as-row')).toHaveLength(2)
    expect(strip.textContent).toContain('TheCryptoDonkey')
    expect(strip.textContent).toContain('673 046')
    expect(strip.querySelector('.as-row-first')).not.toBeNull()

    attract.setScores([])
    expect(strip.classList.contains('attract-scores-empty')).toBe(true)
    expect(strip.querySelectorAll('.as-row')).toHaveLength(0)
  })

  it('never interprets a relay-sourced name as markup', () => {
    const { anchor } = makeShell()
    const attract = new AttractMode(anchor, { timeoutMs: 60_000, carousel })

    attract.setScores([{ label: '<img src=x onerror=alert(1)>', score: '1' }])
    const strip = anchor.querySelector('.attract-scores') as HTMLElement
    expect(strip.querySelector('img')).toBeNull()
    expect(strip.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
