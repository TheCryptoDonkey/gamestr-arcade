import type { Event, EventTemplate } from 'nostr-tools/pure'
import { PhoneSigningChannel, PHONE_SIGNING_RELAY, PLAYER_MS, SIGNING_MS, generateSecretKey, hexKey, keyBytes, randomToken, signedFor, signingTemplate, phoneConnection, type Nip46Message, type PhoneInvitation } from './phone-signing'

export interface PhoneApproval { id: string; token: string; template: EventTemplate; expiresAt: number }
export interface PhoneSignerState {
  invitation: PhoneInvitation
  connectionKey: string
  expiresAt: number
  proof?: Event
  pending?: PhoneApproval
  answered: string[]
}

export function newPhoneSigner(invitation: PhoneInvitation): PhoneSignerState {
  return { invitation, connectionKey: hexKey(generateSecretKey()), expiresAt: invitation.expiresAt, answered: [] }
}

export function initialApproval(state: PhoneSignerState): PhoneApproval {
  return state.pending = { id: 'login', token: randomToken(), template: state.invitation.proof, expiresAt: state.invitation.expiresAt }
}

export function androidApprovalUrl(state: PhoneSignerState, callbackOrigin: string, cambium = true): string {
  const pending = state.pending
  if (!pending || pending.expiresAt <= Date.now()) throw new Error('Approval expired. Return to the arcade and try again.')
  const callback = new URL('/phone-pair/', callbackOrigin)
  if (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname))) throw new Error('Phone approval requires HTTPS.')
  callback.searchParams.set('session', phoneConnection(state.invitation.uri).publicKey)
  callback.searchParams.set('request', pending.token)
  const params = new URLSearchParams({ type: 'sign_event', compressionType: 'none', returnType: 'event', callbackUrl: `${callback.href}&event=` })
  if (state.proof) params.set('current_user', state.proof.pubkey)
  const event = state.proof ? { ...pending.template, pubkey: state.proof.pubkey } : pending.template
  const payload = `${encodeURIComponent(JSON.stringify(event))}?${params}`
  // Android intent targeting keeps Cambium first while the ordinary NIP-55
  // scheme remains available to Amber and other installed signer apps.
  return cambium ? `intent:${payload}#Intent;scheme=nostrsigner;package=dev.forgesworn.cambium;end` : `nostrsigner:${payload}`
}

export function acceptPhoneApproval(state: PhoneSignerState, token: string, encoded: string, now = Date.now()): Event {
  const pending = state.pending
  if (!pending || token !== pending.token || pending.expiresAt <= now || state.expiresAt <= now || encoded.length > 100_000) throw new Error('This approval expired or was already used.')
  let event: unknown
  try { event = JSON.parse(encoded) } catch {
    try { event = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)))) } catch { throw new Error('The signer returned an invalid event.') }
  }
  if (!signedFor(event, pending.template, state.proof?.pubkey)) throw new Error('The signer returned a different account or request.')
  if (pending.id === 'login') { state.proof = event; state.expiresAt = now + PLAYER_MS }
  state.pending = undefined
  return event
}

export class PhoneSigner {
  private channel?: PhoneSigningChannel
  private closed = false
  private timer?: ReturnType<typeof setTimeout>
  private host: string
  constructor(readonly state: PhoneSignerState, private callbacks: { save(): void; pending(): void; ended(): void; error(message: string): void }, private relay = PHONE_SIGNING_RELAY) {
    this.host = phoneConnection(state.invitation.uri).publicKey
  }

  async start(): Promise<void> {
    if (this.channel || this.closed) return
    if (!this.state.proof || this.state.expiresAt <= Date.now()) throw new Error('Phone session expired.')
    this.channel = new PhoneSigningChannel(keyBytes(this.state.connectionKey), this.relay, (peer, message) => {
      if (peer === this.host && !this.closed) void this.receive(message).catch(() => this.callbacks.error('Signing relay unavailable. Return to the arcade and reconnect.'))
    })
    this.timer = setTimeout(() => this.end(), this.state.expiresAt - Date.now())
    await this.channel.open()
    if (this.closed) return
    // On Android a callback may open a new tab. The same short-lived transport
    // key resumes that session; the TV pins its peer and ignores a repeated ACK.
    await this.channel.send(this.host, { id: randomToken(), result: phoneConnection(this.state.invitation.uri).params.get('secret')! })
  }

  private async receive(message: Nip46Message): Promise<void> {
    if (this.state.expiresAt <= Date.now()) { this.end(); return }
    if (typeof message.method !== 'string' || !Array.isArray(message.params) || message.params.some(param => typeof param !== 'string')) return
    if (message.method === 'logout') { await this.reply(message.id, 'ack'); this.end(); return }
    if (message.method === 'get_public_key') { await this.reply(message.id, this.state.proof!.pubkey); return }
    if (message.method === 'ping') { await this.reply(message.id, 'pong'); return }
    if (message.method === 'switch_relays') { await this.reply(message.id, 'null'); return }
    if (message.method !== 'sign_event' || message.params.length !== 1) { await this.reply(message.id, undefined, 'Permission not granted.'); return }
    if (this.state.answered.includes(message.id) || this.state.pending?.id === message.id) return
    let template: EventTemplate | null = null
    try { template = signingTemplate(JSON.parse(message.params[0])) } catch { /* Refuse malformed templates. */ }
    if (!template) { await this.reply(message.id, undefined, 'Event outside conference permissions.'); return }
    // The phone's first visible approval is the exact challenge the TV requests.
    // Returning that same proof avoids asking twice during a single pairing.
    if (signedFor(this.state.proof, template)) { await this.reply(message.id, JSON.stringify(this.state.proof)); return }
    if (this.state.pending) { await this.reply(message.id, undefined, 'Finish the pending phone approval first.'); return }
    this.state.pending = { id: message.id, token: randomToken(), template, expiresAt: Math.min(Date.now() + SIGNING_MS, this.state.expiresAt) }
    this.callbacks.save()
    this.callbacks.pending()
  }

  async complete(id: string, event: Event): Promise<void> {
    if (this.closed) return
    this.remember(id)
    await this.reply(id, JSON.stringify(event))
  }

  async decline(): Promise<void> {
    const pending = this.state.pending
    this.state.pending = undefined
    this.callbacks.save()
    if (!pending || pending.id === 'login') { this.end(); return }
    this.remember(pending.id)
    await this.reply(pending.id, undefined, 'User declined the request.')
  }

  private remember(id: string): void {
    if (!this.state.answered.includes(id)) this.state.answered.push(id)
    if (this.state.answered.length > 256) this.state.answered.shift()
    this.callbacks.save()
  }
  private async reply(id: string, result?: string, error?: string): Promise<void> {
    await this.channel?.send(this.host, { id, ...(result !== undefined ? { result } : {}), ...(error ? { error } : {}) })
  }
  pause(): void { this.channel?.close(); this.channel = undefined; clearTimeout(this.timer) }
  end(): void {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.timer)
    const channel = this.channel; this.channel = undefined
    if (channel) void channel.send(this.host, { id: randomToken(), method: 'logout', params: [] }).catch(() => {}).finally(() => channel.close())
    this.callbacks.ended()
  }
}
