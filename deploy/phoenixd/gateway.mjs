import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { decode as decodeBolt11 } from 'light-bolt11-decoder'

export const REQUEST_KIND = 23194
export const RESPONSE_KIND = 23195
export const MAX_EVENT_AGE_SECONDS = 60
export const MAX_FUTURE_SKEW_SECONDS = 15
export const MAX_CONTENT_CHARS = 16_384

export function requiredHex(name, value) {
  if (!/^[0-9a-f]{64}$/.test(value ?? '')) throw new Error(`${name} must be 32-byte lowercase hex`)
  return value
}

export function positiveInt(name, value, fallback, ceiling) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > ceiling) {
    throw new Error(`${name} must be an integer from 1 to ${ceiling}`)
  }
  return parsed
}

export function invoiceSats(invoice) {
  if (typeof invoice !== 'string' || invoice.length === 0 || invoice.length > 8_192) return null
  if (invoice !== invoice.toLowerCase() && invoice !== invoice.toUpperCase()) return null
  try {
    const amount = decodeBolt11(invoice).sections.find(section => section.name === 'amount')?.value
    if (typeof amount !== 'string' || !/^\d+$/.test(amount)) return null
    const millisats = BigInt(amount)
    if (millisats <= 0n) return null
    const sats = (millisats + 999n) / 1_000n
    return sats <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sats) : null
  } catch {
    return null
  }
}

export function validateRequestEvent(event, { bridgePubkey, clientPubkey, nowSeconds, verify }) {
  if (!event || event.kind !== REQUEST_KIND) throw new Error('invalid request kind')
  if (event.pubkey !== clientPubkey) throw new Error('unauthorised client')
  if (!verify(event)) throw new Error('invalid event signature')
  if (!event.tags?.some(tag => tag.length === 2 && tag[0] === 'p' && tag[1] === bridgePubkey)) {
    throw new Error('request is not addressed to this gateway')
  }
  if (!Number.isSafeInteger(event.created_at)
      || event.created_at < nowSeconds - MAX_EVENT_AGE_SECONDS
      || event.created_at > nowSeconds + MAX_FUTURE_SKEW_SECONDS) {
    throw new Error('stale request')
  }
  if (typeof event.content !== 'string' || event.content.length === 0 || event.content.length > MAX_CONTENT_CHARS) {
    throw new Error('invalid encrypted request size')
  }
}

export function invoiceKey(invoice) {
  return createHash('sha256').update(invoice).digest('hex')
}

function utcDay(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10)
}

export class JsonStateStore {
  constructor(path) { this.path = path }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'))
      return {
        day: typeof parsed.day === 'string' ? parsed.day : '',
        reservedSats: Number.isSafeInteger(parsed.reservedSats) ? parsed.reservedSats : 0,
        invoices: typeof parsed.invoices === 'object' && parsed.invoices ? parsed.invoices : {},
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return { day: '', reservedSats: 0, invoices: {} }
      throw error
    }
  }

  async save(state) {
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 })
    await rename(temporary, this.path)
  }
}

export class PaymentAuthority {
  constructor({ phoenixd, store, maxPaymentSats, dailyBudgetSats, maxPaymentsPerMinute, now = Date.now }) {
    this.phoenixd = phoenixd
    this.store = store
    this.maxPaymentSats = maxPaymentSats
    this.dailyBudgetSats = dailyBudgetSats
    this.maxPaymentsPerMinute = maxPaymentsPerMinute
    this.now = now
    this.attempts = []
    this.queue = Promise.resolve()
  }

  handle(request) {
    const task = this.queue.then(() => this.#handle(request))
    this.queue = task.catch(() => undefined)
    return task
  }

  async #handle(request) {
    if (!request || typeof request !== 'object' || typeof request.method !== 'string') throw new Error('invalid NWC request')
    if (request.method === 'get_info') {
      return { alias: 'Gamestr Arcade', color: 'facc15', pubkey: '', network: 'mainnet', block_height: 0, block_hash: '', methods: ['get_info', 'pay_invoice'] }
    }
    if (request.method !== 'pay_invoice') throw new Error('method not allowed')
    const invoice = request.params?.invoice
    const amountSats = invoiceSats(invoice)
    if (amountSats === null) throw new Error('amount-bearing valid BOLT-11 invoice required')
    if (amountSats > this.maxPaymentSats) throw new Error('per-payment limit exceeded')

    const nowMs = this.now()
    const cutoff = nowMs - 60_000
    this.attempts = this.attempts.filter(attempt => attempt > cutoff)
    if (this.attempts.length >= this.maxPaymentsPerMinute) throw new Error('payment rate limit exceeded')

    const state = await this.store.load()
    const day = utcDay(nowMs)
    if (state.day !== day) Object.assign(state, { day, reservedSats: 0, invoices: {} })
    const key = invoiceKey(invoice.toLowerCase())
    const existing = state.invoices[key]
    if (existing?.status === 'paid') return existing.result
    if (existing) throw new Error('invoice already attempted; outcome may be ambiguous')
    if (state.reservedSats + amountSats > this.dailyBudgetSats) throw new Error('daily wallet budget exceeded')

    this.attempts.push(nowMs)
    state.reservedSats += amountSats
    state.invoices[key] = { status: 'pending', amountSats, attemptedAt: nowMs }
    await this.store.save(state)
    const paid = await this.phoenixd('POST', '/payinvoice', { invoice: invoice.toLowerCase() })
    const result = { preimage: paid.paymentPreimage || paid.preimage || '' }
    state.invoices[key] = { ...state.invoices[key], status: 'paid', result }
    await this.store.save(state)
    return result
  }
}
