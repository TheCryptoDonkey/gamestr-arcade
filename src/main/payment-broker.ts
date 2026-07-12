import { decode as decodeBolt11 } from 'light-bolt11-decoder'
import type { WebLNConfig } from '../shared/types'

export const DEFAULT_MAX_PAYMENT_SATS = 100
export const DEFAULT_MAX_PAYMENTS_PER_MINUTE = 5
export const PAYMENT_RATE_WINDOW_MS = 60_000
export const MAX_INVOICE_CHARS = 8_192

export interface PaymentPolicy {
  maxPaymentSats: number
  sessionBudgetSats: number
  maxPaymentsPerMinute: number
}

export type PaymentErrorCode =
  | 'SESSION_CLOSED'
  | 'INVALID_INVOICE'
  | 'AMOUNT_REQUIRED'
  | 'PAYMENT_CAP_EXCEEDED'
  | 'SESSION_BUDGET_EXCEEDED'
  | 'RATE_LIMITED'

export class PaymentPolicyError extends Error {
  readonly code: PaymentErrorCode

  constructor(code: PaymentErrorCode, message: string) {
    super(message)
    this.name = 'PaymentPolicyError'
    this.code = code
  }
}

function nonNegativeInt(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value >= 0 ? value : fallback
}

function positiveInt(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0 ? value : fallback
}

/** Build the authoritative per-session policy without retaining the NWC URL. */
export function paymentPolicyFromConfig(config: WebLNConfig): PaymentPolicy {
  const maxPaymentSats = nonNegativeInt(config.maxSats, DEFAULT_MAX_PAYMENT_SATS)
  const defaultBudget = Number.isSafeInteger(maxPaymentSats * 5) ? maxPaymentSats * 5 : maxPaymentSats
  return {
    maxPaymentSats,
    sessionBudgetSats: nonNegativeInt(config.sessionBudgetSats, defaultBudget),
    maxPaymentsPerMinute: positiveInt(config.maxPaymentsPerMinute, DEFAULT_MAX_PAYMENTS_PER_MINUTE),
  }
}

/** Inclusive per-payment ceiling check retained as a small pure policy helper. */
export function shouldAutoPay(amountSats: number, maxSats: number): boolean {
  return Number.isSafeInteger(amountSats)
    && Number.isSafeInteger(maxSats)
    && amountSats > 0
    && amountSats <= maxSats
}

export function millisatsToWholeSats(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const millisats = BigInt(raw)
  if (millisats <= 0n) return null
  const sats = (millisats + 999n) / 1_000n
  return sats <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sats) : null
}

/**
 * Extract a conservative whole-satoshi amount from a checksum-valid BOLT-11.
 * Millisatoshi invoices round UP, never down, so a fractional sat cannot sneak
 * below a configured ceiling. Amount-less/invalid/unsafe invoices return null.
 */
export function bolt11Sats(rawInvoice: string): number | null {
  const invoice = typeof rawInvoice === 'string' ? rawInvoice.trim() : ''
  if (!invoice || invoice.length > MAX_INVOICE_CHARS) return null
  try {
    const decoded = decodeBolt11(invoice)
    const amount = decoded.sections.find(section => section.name === 'amount')?.value
    return millisatsToWholeSats(amount)
  } catch {
    return null
  }
}

export interface PaymentBrokerDeps<Result> {
  payInvoice(invoice: string): Promise<Result>
  now?: () => number
  decodeAmount?: (invoice: string) => number | null
}

/**
 * One launch-scoped wallet authority.
 *
 * New invoices reserve budget and a rate-limit slot before any asynchronous
 * wallet call begins. Reservations deliberately survive failures/timeouts:
 * those outcomes can be ambiguous, so releasing them could permit a paid
 * invoice to be retried past the session ceiling. Identical invoices share the
 * same cached promise and can never trigger a second wallet request.
 */
export class SessionPaymentBroker<Result> {
  private readonly attempts: number[] = []
  private readonly payments = new Map<string, Promise<Result>>()
  private readonly now: () => number
  private readonly decodeAmount: (invoice: string) => number | null
  private reservedSats = 0
  private closed = false

  constructor(
    private readonly policy: PaymentPolicy,
    private readonly deps: PaymentBrokerDeps<Result>,
  ) {
    this.now = deps.now ?? (() => Date.now())
    this.decodeAmount = deps.decodeAmount ?? bolt11Sats
  }

  pay(rawInvoice: unknown): Promise<Result> {
    if (this.closed) {
      return Promise.reject(new PaymentPolicyError('SESSION_CLOSED', 'web-game payment session is closed'))
    }
    if (typeof rawInvoice !== 'string') {
      return Promise.reject(new PaymentPolicyError('INVALID_INVOICE', 'payment invoice must be a string'))
    }
    const trimmedInvoice = rawInvoice.trim()
    if (trimmedInvoice !== trimmedInvoice.toLowerCase() && trimmedInvoice !== trimmedInvoice.toUpperCase()) {
      return Promise.reject(new PaymentPolicyError('INVALID_INVOICE', 'mixed-case BOLT-11 invoices are invalid'))
    }
    const invoice = trimmedInvoice.toLowerCase()
    if (!invoice || invoice.length > MAX_INVOICE_CHARS || !/^ln[a-z0-9]+$/.test(invoice)) {
      return Promise.reject(new PaymentPolicyError('INVALID_INVOICE', 'payment invoice is malformed'))
    }

    // Invoice identity is stronger than a caller-provided request ID: a hostile
    // page cannot vary an ID to make the same Lightning invoice pay twice.
    const existing = this.payments.get(invoice)
    if (existing) return existing

    const amountSats = this.decodeAmount(invoice)
    if (amountSats === null || !Number.isSafeInteger(amountSats) || amountSats <= 0) {
      return Promise.reject(new PaymentPolicyError('AMOUNT_REQUIRED', 'amount-less or invalid invoices are refused'))
    }
    if (!shouldAutoPay(amountSats, this.policy.maxPaymentSats)) {
      return Promise.reject(new PaymentPolicyError(
        'PAYMENT_CAP_EXCEEDED',
        `invoice for ${amountSats} sats exceeds the ${this.policy.maxPaymentSats} sat payment cap`,
      ))
    }
    if (this.reservedSats + amountSats > this.policy.sessionBudgetSats) {
      return Promise.reject(new PaymentPolicyError(
        'SESSION_BUDGET_EXCEEDED',
        `invoice would exceed the ${this.policy.sessionBudgetSats} sat session budget`,
      ))
    }

    const now = this.now()
    const cutoff = now - PAYMENT_RATE_WINDOW_MS
    while (this.attempts.length > 0 && this.attempts[0] <= cutoff) this.attempts.shift()
    if (this.attempts.length >= this.policy.maxPaymentsPerMinute) {
      return Promise.reject(new PaymentPolicyError('RATE_LIMITED', 'web-game payment rate limit exceeded'))
    }

    this.attempts.push(now)
    this.reservedSats += amountSats
    const payment = Promise.resolve().then(() => this.deps.payInvoice(invoice))
    this.payments.set(invoice, payment)
    return payment
  }

  close(): void {
    this.closed = true
  }

  /** Read-only operational state; never exposed to the game page. */
  snapshot(): { reservedSats: number; distinctPayments: number } {
    return { reservedSats: this.reservedSats, distinctPayments: this.payments.size }
  }
}
