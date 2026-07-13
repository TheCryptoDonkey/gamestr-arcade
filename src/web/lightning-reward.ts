import { decode } from 'light-bolt11-decoder'

export interface WebLNProvider {
  enable(): Promise<void>
  sendPayment(invoice: string): Promise<{ preimage?: string }>
}

interface PayRequest {
  tag: 'payRequest'
  callback: string
  minSendable: number
  maxSendable: number
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
): Promise<{ preimage?: string }> {
  if (!Number.isSafeInteger(sats) || sats < 1 || sats > MAX_REWARD_SATS) throw new Error('Reward must be between 1 and 100,000 sats.')
  const endpoint = lightningAddressEndpoint(address)
  if (!endpoint) throw new Error('Player Lightning address is invalid.')
  const amount = sats * 1_000
  const metadataResponse = await fetcher(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
  if (!metadataResponse.ok) throw new Error('Lightning address provider is unavailable.')
  const metadata = await metadataResponse.json() as Partial<PayRequest>
  const callback = httpsUrl(metadata.callback)
  if (metadata.tag !== 'payRequest' || !callback || !Number.isSafeInteger(metadata.minSendable) || !Number.isSafeInteger(metadata.maxSendable) || amount < metadata.minSendable! || amount > metadata.maxSendable!) throw new Error('Reward amount is outside the recipient’s supported range.')
  callback.searchParams.set('amount', String(amount))
  const invoiceResponse = await fetcher(callback, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
  if (!invoiceResponse.ok) throw new Error('Lightning invoice could not be created.')
  const invoicePayload = await invoiceResponse.json() as { pr?: unknown; status?: unknown; reason?: unknown }
  if (invoicePayload.status === 'ERROR') throw new Error(typeof invoicePayload.reason === 'string' ? invoicePayload.reason.slice(0, 160) : 'Lightning provider rejected the reward.')
  if (typeof invoicePayload.pr !== 'string' || invoicePayload.pr.length > 8_192) throw new Error('Lightning provider returned an invalid invoice.')
  if (invoiceAmountMsats(invoicePayload.pr) !== BigInt(amount)) throw new Error('Lightning invoice amount does not match the approved reward.')
  await provider.enable()
  return provider.sendPayment(invoicePayload.pr)
}
