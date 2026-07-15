import { decode } from 'light-bolt11-decoder'
import { bech32 } from '@scure/base'
import { verifyEvent } from 'nostr-tools/pure'

export interface WebLNProvider {
  enable(): Promise<void>
  sendPayment(invoice: string): Promise<{ preimage?: string }>
}

interface PayRequest {
  tag: 'payRequest'
  callback: string
  minSendable: number
  maxSendable: number
  allowsNostr?: boolean
  nostrPubkey?: string
}

interface ZapSigner {
  signEvent(event: { created_at: number; kind: number; tags: string[][]; content: string }): Promise<{ id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string }>
}

export interface RewardOptions {
  zap?: { recipientPubkey: string; signer: ZapSigner; relays: string[] }
}

const MAX_REWARD_SATS = 100_000

function httpsUrl(raw: unknown): URL | undefined {
  if (typeof raw !== 'string' || raw.length > 2_048) return
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password) return
    return url
  } catch { return }
}

export function lightningAddressEndpoint(address: string): string | undefined {
  const [name, domain, extra] = address.trim().toLowerCase().split('@')
  if (extra || !name || !domain || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/.test(name) || !/^[a-z0-9.-]+$/.test(domain) || domain.includes('..')) return
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`
}

export function lud06Endpoint(lud06: string): string | undefined {
  const value = lud06.trim().toLowerCase()
  if (!value.startsWith('lnurl1') || value.length > 2_000) return
  try {
    const decoded = bech32.decode(value as `${string}1${string}`, 2_000)
    if (decoded.prefix !== 'lnurl') return
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bech32.fromWords(decoded.words)))
    return httpsUrl(raw)?.href
  } catch { return }
}

export function lightningDestinationEndpoint(destination: string): string | undefined {
  return lightningAddressEndpoint(destination) ?? lud06Endpoint(destination)
}

function invoiceAmountMsats(invoice: string): bigint | undefined {
  try {
    const raw = decode(invoice).sections.find(section => section.name === 'amount')?.value
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return
    return BigInt(raw)
  } catch { return }
}

export async function rewardLightningAddress(
  address: string,
  sats: number,
  provider: WebLNProvider,
  fetcher: typeof fetch = fetch,
  options: RewardOptions = {},
): Promise<{ preimage?: string }> {
  if (!Number.isSafeInteger(sats) || sats < 1 || sats > MAX_REWARD_SATS) throw new Error('Reward must be between 1 and 100,000 sats.')
  const endpoint = lightningDestinationEndpoint(address)
  if (!endpoint) throw new Error('Player Lightning address or LNURL is invalid.')
  const amount = sats * 1_000
  const metadataResponse = await fetcher(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
  if (!metadataResponse.ok) throw new Error('Lightning address provider is unavailable.')
  const metadata = await metadataResponse.json() as Partial<PayRequest>
  const callback = httpsUrl(metadata.callback)
  if (metadata.tag !== 'payRequest' || !callback || !Number.isSafeInteger(metadata.minSendable) || !Number.isSafeInteger(metadata.maxSendable) || amount < metadata.minSendable! || amount > metadata.maxSendable!) throw new Error('Reward amount is outside the recipient’s supported range.')
  callback.searchParams.set('amount', String(amount))
  if (options.zap) {
    if (metadata.allowsNostr !== true || typeof metadata.nostrPubkey !== 'string' || !/^[0-9a-f]{64}$/.test(metadata.nostrPubkey)) throw new Error('Recipient does not support public Nostr zap receipts.')
    if (!/^[0-9a-f]{64}$/.test(options.zap.recipientPubkey)) throw new Error('Zap recipient key is invalid.')
    const lnurl = bech32.encode('lnurl', bech32.toWords(new TextEncoder().encode(endpoint)), 2_000)
    const relays = Array.from(new Set(options.zap.relays.filter(relay => relay.startsWith('wss://')))).slice(0, 6)
    const signed = await options.zap.signer.signEvent({ kind: 9734, created_at: Math.floor(Date.now() / 1000), content: '', tags: [['relays', ...relays], ['amount', String(amount)], ['lnurl', lnurl], ['p', options.zap.recipientPubkey]] })
    const canonical = { id: signed.id, pubkey: signed.pubkey, created_at: signed.created_at, kind: signed.kind, tags: signed.tags, content: signed.content, sig: signed.sig }
    if (signed.kind !== 9734 || !verifyEvent(canonical)) throw new Error('Signer returned an invalid zap request.')
    callback.searchParams.set('nostr', JSON.stringify(signed))
    callback.searchParams.set('lnurl', lnurl)
  }
  const invoiceResponse = await fetcher(callback, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
  if (!invoiceResponse.ok) throw new Error('Lightning invoice could not be created.')
  const invoicePayload = await invoiceResponse.json() as { pr?: unknown; status?: unknown; reason?: unknown }
  if (invoicePayload.status === 'ERROR') throw new Error(typeof invoicePayload.reason === 'string' ? invoicePayload.reason.slice(0, 160) : 'Lightning provider rejected the reward.')
  if (typeof invoicePayload.pr !== 'string' || invoicePayload.pr.length > 8_192) throw new Error('Lightning provider returned an invalid invoice.')
  if (invoiceAmountMsats(invoicePayload.pr) !== BigInt(amount)) throw new Error('Lightning invoice amount does not match the approved reward.')
  await provider.enable()
  return provider.sendPayment(invoicePayload.pr)
}
