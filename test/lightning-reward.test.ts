import { describe, expect, it, vi } from 'vitest'
import { finalizeEvent, generateSecretKey, verifyEvent } from 'nostr-tools/pure'
import { lightningAddressEndpoint, rewardLightningAddress } from '../src/web/lightning-reward'

const INVOICE_2000_SATS = 'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567'

describe('user-owned Lightning rewards', () => {
  it('derives a constrained HTTPS LNURL-pay endpoint', () => {
    expect(lightningAddressEndpoint('Player@Example.com')).toBe('https://example.com/.well-known/lnurlp/player')
    expect(lightningAddressEndpoint('bad@@example.com')).toBeUndefined()
    expect(lightningAddressEndpoint('player@../evil')).toBeUndefined()
  })

  it('checks metadata and exact invoice amount before opening WebLN', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: 'payRequest', callback: 'https://pay.example.com/cb', minSendable: 1_000, maxSendable: 5_000_000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: INVOICE_2000_SATS }), { status: 200 }))
    const provider = { enable: vi.fn(async () => undefined), sendPayment: vi.fn(async () => ({ preimage: 'paid' })) }
    await expect(rewardLightningAddress('player@example.com', 2000, provider, fetcher)).resolves.toEqual({ preimage: 'paid' })
    expect(fetcher.mock.calls[1][0].toString()).toBe('https://pay.example.com/cb?amount=2000000')
    expect(provider.enable).toHaveBeenCalledOnce()
    expect(provider.sendPayment).toHaveBeenCalledWith(INVOICE_2000_SATS)
  })

  it('rejects mismatched invoices and never opens the wallet', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: 'payRequest', callback: 'https://pay.example.com/cb', minSendable: 1_000, maxSendable: 5_000_000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: INVOICE_2000_SATS }), { status: 200 }))
    const provider = { enable: vi.fn(async () => undefined), sendPayment: vi.fn(async () => ({})) }
    await expect(rewardLightningAddress('player@example.com', 21, provider, fetcher)).rejects.toThrow('does not match')
    expect(provider.enable).not.toHaveBeenCalled()
    expect(provider.sendPayment).not.toHaveBeenCalled()
  })

  it('adds an explicitly signed NIP-57 request only when public receipts are requested', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ tag: 'payRequest', callback: 'https://pay.example.com/cb', minSendable: 1_000, maxSendable: 5_000_000, allowsNostr: true, nostrPubkey: 'c'.repeat(64) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pr: INVOICE_2000_SATS }), { status: 200 }))
    const key = generateSecretKey()
    const signer = { signEvent: vi.fn(async template => finalizeEvent(template, key)) }
    const provider = { enable: vi.fn(async () => undefined), sendPayment: vi.fn(async () => ({})) }
    await rewardLightningAddress('player@example.com', 2000, provider, fetcher, { zap: { recipientPubkey: 'a'.repeat(64), signer, relays: ['wss://nos.lol'] } })
    const callback = new URL(fetcher.mock.calls[1][0].toString())
    const zap = JSON.parse(callback.searchParams.get('nostr')!)
    expect(zap.kind).toBe(9734)
    expect(zap.tags).toContainEqual(['p', 'a'.repeat(64)])
    expect(zap.tags).toContainEqual(['amount', '2000000'])
    expect(verifyEvent(zap)).toBe(true)
    expect(callback.searchParams.get('lnurl')).toMatch(/^lnurl1/)
  })
})
