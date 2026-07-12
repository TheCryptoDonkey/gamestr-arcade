import { describe, expect, it, vi } from 'vitest'
import { PaymentAuthority, invoiceKey, positiveInt, requiredHex, validateRequestEvent } from '../deploy/phoenixd/gateway.mjs'

const invoice = 'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567'

describe('hardened NWC gateway', () => {
  it('requires stable explicit secrets and bounded limits', () => {
    expect(requiredHex('secret', 'a'.repeat(64))).toHaveLength(64)
    expect(() => requiredHex('secret', 'A'.repeat(64))).toThrow()
    expect(positiveInt('limit', '5', 1, 10)).toBe(5)
    expect(() => positiveInt('limit', '11', 1, 10)).toThrow()
  })

  it('binds valid fresh signed requests to exactly one client and gateway', () => {
    const event = { kind: 23194, pubkey: 'client', created_at: 100, content: 'ciphertext', tags: [['p', 'bridge']] }
    expect(() => validateRequestEvent(event, { bridgePubkey: 'bridge', clientPubkey: 'client', nowSeconds: 100, verify: () => true })).not.toThrow()
    expect(() => validateRequestEvent({ ...event, pubkey: 'attacker' }, { bridgePubkey: 'bridge', clientPubkey: 'client', nowSeconds: 100, verify: () => true })).toThrow('unauthorised')
    expect(() => validateRequestEvent(event, { bridgePubkey: 'bridge', clientPubkey: 'client', nowSeconds: 100, verify: () => false })).toThrow('signature')
    expect(() => validateRequestEvent({ ...event, created_at: 1 }, { bridgePubkey: 'bridge', clientPubkey: 'client', nowSeconds: 100, verify: () => true })).toThrow('stale')
  })

  it('allows only get_info and pay_invoice', async () => {
    const authority = new PaymentAuthority({ phoenixd: vi.fn(), store: { load: vi.fn(), save: vi.fn() }, maxPaymentSats: 100, dailyBudgetSats: 500, maxPaymentsPerMinute: 5 })
    await expect(authority.handle({ method: 'make_invoice', params: {} })).rejects.toThrow('not allowed')
    await expect(authority.handle({ method: 'get_info', params: {} })).resolves.toMatchObject({ methods: ['get_info', 'pay_invoice'] })
  })

  it('reserves persistent budget before the wallet call and returns cached paid results', async () => {
    const state = { day: '', reservedSats: 0, invoices: {} }
    const store = { load: vi.fn(async () => state), save: vi.fn(async next => Object.assign(state, structuredClone(next))) }
    const phoenixd = vi.fn(async () => ({ paymentPreimage: 'preimage' }))
    const authority = new PaymentAuthority({ phoenixd, store, maxPaymentSats: 2_000, dailyBudgetSats: 5_000, maxPaymentsPerMinute: 5, now: () => Date.parse('2026-07-12T12:00:00Z') })
    await expect(authority.handle({ method: 'pay_invoice', params: { invoice } })).resolves.toEqual({ preimage: 'preimage' })
    expect(store.save).toHaveBeenCalledTimes(2)
    expect(phoenixd).toHaveBeenCalledTimes(1)
    await expect(authority.handle({ method: 'pay_invoice', params: { invoice } })).resolves.toEqual({ preimage: 'preimage' })
    expect(phoenixd).toHaveBeenCalledTimes(1)
    expect(Object.keys(state.invoices)).toEqual([invoiceKey(invoice)])
  })
})
