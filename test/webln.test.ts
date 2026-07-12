/**
 * Unit tests for the main-process wallet policy and launch-scoped broker.
 *
 * These are pure / side-effect-free — no Electron, no NWC connection, no real
 * Lightning wallet is needed. The test for `bolt11Sats` requires the
 * `light-bolt11-decoder` package, which is a production dependency.
 *
 * The actual NWC handshake still requires a funded booth wallet.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  PaymentPolicyError,
  SessionPaymentBroker,
  bolt11Sats,
  millisatsToWholeSats,
  paymentPolicyFromConfig,
  shouldAutoPay,
  type PaymentPolicy,
} from '../src/main/payment-broker'

const INVOICE_2000_SATS =
  'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567'

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
  it('extracts a checksum-valid 2,000 sat amount', () => {
    expect(bolt11Sats(INVOICE_2000_SATS)).toBe(2000)
  })

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

  it('rounds a fractional-sat invoice up for conservative cap accounting', () => {
    expect(millisatsToWholeSats('10')).toBe(1)
    expect(millisatsToWholeSats('1001')).toBe(2)
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

describe('paymentPolicyFromConfig', () => {
  it('derives a bounded launch policy without retaining the NWC URL', () => {
    expect(paymentPolicyFromConfig({ nwc: 'nostr+walletconnect://secret', maxSats: 20 })).toEqual({
      maxPaymentSats: 20,
      sessionBudgetSats: 100,
      maxPaymentsPerMinute: 5,
    })
  })
})

describe('SessionPaymentBroker', () => {
  const policy: PaymentPolicy = {
    maxPaymentSats: 10,
    sessionBudgetSats: 20,
    maxPaymentsPerMinute: 3,
  }

  function brokerWith(
    amounts: Record<string, number | null>,
    overrides: Partial<PaymentPolicy> = {},
    now: () => number = () => 1_000,
  ) {
    const payInvoice = vi.fn(async (invoice: string) => ({ preimage: `paid:${invoice}` }))
    const broker = new SessionPaymentBroker({ ...policy, ...overrides }, {
      payInvoice,
      now,
      decodeAmount: invoice => amounts[invoice] ?? null,
    })
    return { broker, payInvoice }
  }

  it('enforces per-payment and cumulative session ceilings', async () => {
    const { broker, payInvoice } = brokerWith(
      { lnbc1first: 7, lnbc1overcap: 11, lnbc1overbudget: 7 },
      { sessionBudgetSats: 12 },
    )
    await expect(broker.pay('lnbc1first')).resolves.toEqual({ preimage: 'paid:lnbc1first' })
    await expect(broker.pay('lnbc1overcap')).rejects.toMatchObject({ code: 'PAYMENT_CAP_EXCEEDED' })
    await expect(broker.pay('lnbc1overbudget')).rejects.toMatchObject({ code: 'SESSION_BUDGET_EXCEEDED' })
    expect(payInvoice).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed and mixed-case invoices before amount decoding', async () => {
    const { broker, payInvoice } = brokerWith({ lnbc1valid: 1 })
    await expect(broker.pay('not-an-invoice')).rejects.toMatchObject({ code: 'INVALID_INVOICE' })
    await expect(broker.pay('lnbc1VaLiD')).rejects.toMatchObject({ code: 'INVALID_INVOICE' })
    expect(payInvoice).not.toHaveBeenCalled()
  })

  it('uses invoice identity for concurrent and later idempotent retries', async () => {
    const { broker, payInvoice } = brokerWith({ lnbc1same: 5 })
    const first = broker.pay('LNBC1SAME')
    const duplicate = broker.pay('lnbc1same')
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { preimage: 'paid:lnbc1same' },
      { preimage: 'paid:lnbc1same' },
    ])
    expect(payInvoice).toHaveBeenCalledTimes(1)
    expect(broker.snapshot()).toEqual({ reservedSats: 5, distinctPayments: 1 })
  })

  it('retains a failed attempt reservation and rejection for safe idempotency', async () => {
    const payInvoice = vi.fn(async () => { throw new Error('ambiguous wallet timeout') })
    const broker = new SessionPaymentBroker(policy, {
      payInvoice,
      decodeAmount: () => 5,
    })
    await expect(broker.pay('lnbc1timeout')).rejects.toThrow('ambiguous wallet timeout')
    await expect(broker.pay('lnbc1timeout')).rejects.toThrow('ambiguous wallet timeout')
    expect(payInvoice).toHaveBeenCalledTimes(1)
    expect(broker.snapshot().reservedSats).toBe(5)
  })

  it('rate-limits distinct invoices in a rolling minute', async () => {
    let now = 10_000
    const { broker, payInvoice } = brokerWith(
      { lnbc1one: 1, lnbc1two: 1, lnbc1three: 1 },
      { maxPaymentsPerMinute: 2 },
      () => now,
    )
    await broker.pay('lnbc1one')
    await broker.pay('lnbc1two')
    await expect(broker.pay('lnbc1three')).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    now += 60_001
    await expect(broker.pay('lnbc1three')).resolves.toEqual({ preimage: 'paid:lnbc1three' })
    expect(payInvoice).toHaveBeenCalledTimes(3)
  })

  it('rejects all requests after the launch session closes', async () => {
    const { broker } = brokerWith({ lnbc1one: 1 })
    broker.close()
    await expect(broker.pay('lnbc1one')).rejects.toBeInstanceOf(PaymentPolicyError)
    await expect(broker.pay('lnbc1one')).rejects.toMatchObject({ code: 'SESSION_CLOSED' })
  })
})
