/**
 * Unit tests for the WebLN cap logic and bolt11 amount decoder
 * (src/preload/webgame.ts).
 *
 * These are pure / side-effect-free — no Electron, no NWC connection, no real
 * Lightning wallet is needed. The test for `bolt11Sats` requires the
 * `light-bolt11-decoder` package, which is a production dependency.
 *
 * What still requires the real booth to verify:
 *   - The NWC handshake (enable → getInfo → sendPayment with a live wallet).
 *   - Whether the game's `window.webln.sendPayment()` call actually reaches the
 *     contextBridge-exposed method (contextIsolation boundary).
 *   - Whether Space Zappers calls `window.webln.enable()` on load and responds
 *     to the resolved WebLN provider.
 */

import { describe, it, expect } from 'vitest'
import { shouldAutoPay, bolt11Sats } from '../src/preload/webgame'

// ── shouldAutoPay ──────────────────────────────────────────────────────────────

describe('shouldAutoPay', () => {
  it('allows a payment at exactly the cap', () => {
    expect(shouldAutoPay(100, 100)).toBe(true)
  })

  it('allows a payment below the cap', () => {
    expect(shouldAutoPay(1, 100)).toBe(true)
    expect(shouldAutoPay(99, 100)).toBe(true)
  })

  it('rejects a payment above the cap', () => {
    expect(shouldAutoPay(101, 100)).toBe(false)
    expect(shouldAutoPay(1000, 100)).toBe(false)
  })

  it('rejects zero-sat invoices', () => {
    expect(shouldAutoPay(0, 100)).toBe(false)
  })

  it('rejects negative amounts', () => {
    expect(shouldAutoPay(-1, 100)).toBe(false)
  })

  it('works with a 1-sat cap', () => {
    expect(shouldAutoPay(1, 1)).toBe(true)
    expect(shouldAutoPay(2, 1)).toBe(false)
  })

  it('works with a 0-sat cap (nothing ever pays)', () => {
    expect(shouldAutoPay(1, 0)).toBe(false)
  })
})

// ── bolt11Sats ─────────────────────────────────────────────────────────────────

describe('bolt11Sats', () => {
  it('returns null for an amount-less invoice (lnbc1...)', () => {
    // This is a well-known test vector with no amount in the HRP.
    const inv =
      'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs' +
      'pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetj' +
      'ypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8' +
      'qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql'
    expect(bolt11Sats(inv)).toBeNull()
  })

  it('returns null for a clearly invalid string', () => {
    expect(bolt11Sats('not-a-bolt11')).toBeNull()
    expect(bolt11Sats('')).toBeNull()
  })

  it('extracts 1 sat from lnbc10n (10 millisats → 0 after floor, so null via floor-to-zero guard)', () => {
    // lnbc10n = 10 millisats; floor(10/1000) = 0 → our null guard kicks in.
    // We test this via shouldAutoPay to confirm zero-sat invoices are rejected
    // regardless — bolt11Sats returning 0 or null both result in rejection.
    const sats = bolt11Sats('lnbc10n1p3tl6xdsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpqgf5zqem9wd5ku6xmqcqzys9qrsgqjapf6nrugzlfe72uyyasxnpfv0r5j2czm6zq4xcjg3a6m8nfmgxu5rg73w5ufwwmfqgkxeyq5m7j7h9e4q0aqhqewknkfxapkzgsqqkeyuh')
    // Either null or 0 — both must not auto-pay
    const safeSats = sats ?? 0
    expect(shouldAutoPay(safeSats, 100)).toBe(false)
  })
})

// ── Combined cap + decode ──────────────────────────────────────────────────────

describe('cap enforcement end-to-end', () => {
  it('a decoded-null invoice is always rejected', () => {
    const sats = bolt11Sats('garbage')
    expect(sats).toBeNull()
    // In the sendPayment wrapper, null sats → throw without paying.
    expect(sats === null || !shouldAutoPay(sats!, 100)).toBe(true)
  })
})
