import { describe, it, expect } from 'vitest'
import { hexToNpub, shortenNpub, avatarSeed, avatarGradient, avatarCss } from '../src/renderer/src/leaderboard/profiles'

// A known Nostr pubkey ↔ npub pair (fiatjaf) pins the bech32 encoder.
const FIATJAF_HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
const FIATJAF_NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6'

describe('hexToNpub (bech32)', () => {
  it('encodes a known pubkey to its canonical npub', () => {
    expect(hexToNpub(FIATJAF_HEX)).toBe(FIATJAF_NPUB)
  })

  it('always produces an npub1-prefixed string of stable length', () => {
    const npub = hexToNpub('00'.repeat(32))
    expect(npub.startsWith('npub1')).toBe(true)
    expect(npub.length).toBe(63) // npub1 + 52 data + 6 checksum
  })
})

describe('shortenNpub', () => {
  it('keeps a recognisable head and tail and elides the middle', () => {
    const short = shortenNpub(FIATJAF_HEX)
    expect(short.startsWith('npub1')).toBe(true)
    expect(short).toContain('…')
    expect(short).toBe(`${FIATJAF_NPUB.slice(0, 8)}…${FIATJAF_NPUB.slice(-4)}`)
  })

  it('is deterministic for the same pubkey', () => {
    expect(shortenNpub(FIATJAF_HEX)).toBe(shortenNpub(FIATJAF_HEX))
  })

  it('respects custom head/tail lengths', () => {
    const short = shortenNpub(FIATJAF_HEX, 10, 6)
    expect(short).toBe(`${FIATJAF_NPUB.slice(0, 10)}…${FIATJAF_NPUB.slice(-6)}`)
  })

  it('passes through non-hex input untouched when too short to elide', () => {
    expect(shortenNpub('alice')).toBe('alice')
  })
})

describe('avatarSeed (deterministic)', () => {
  it('is stable across calls for the same pubkey', () => {
    expect(avatarSeed(FIATJAF_HEX)).toBe(avatarSeed(FIATJAF_HEX))
  })

  it('differs for different pubkeys', () => {
    expect(avatarSeed('aa'.repeat(32))).not.toBe(avatarSeed('bb'.repeat(32)))
  })

  it('returns an unsigned 32-bit integer', () => {
    const seed = avatarSeed(FIATJAF_HEX)
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('avatarGradient', () => {
  it('derives two distinct hues plus an angle, all in range', () => {
    const g = avatarGradient(FIATJAF_HEX)
    expect(g.hueA).toBeGreaterThanOrEqual(0)
    expect(g.hueA).toBeLessThan(360)
    expect(g.hueB).toBeGreaterThanOrEqual(0)
    expect(g.hueB).toBeLessThan(360)
    expect(g.angle).toBeGreaterThanOrEqual(0)
    expect(g.angle).toBeLessThan(360)
  })

  it('keeps the two hues visibly apart (never a flat single-hue smear)', () => {
    for (const pk of ['aa'.repeat(32), 'bf'.repeat(32), '12'.repeat(32), FIATJAF_HEX]) {
      const { hueA, hueB } = avatarGradient(pk)
      const delta = Math.abs(hueA - hueB)
      const circular = Math.min(delta, 360 - delta)
      expect(circular).toBeGreaterThanOrEqual(20)
    }
  })

  it('avatarCss yields a deterministic linear-gradient string', () => {
    const css = avatarCss(FIATJAF_HEX)
    expect(css).toMatch(/^linear-gradient\(\d+deg, hsl\(\d+ 85% 58%\), hsl\(\d+ 80% 42%\)\)$/)
    expect(avatarCss(FIATJAF_HEX)).toBe(css)
  })
})
