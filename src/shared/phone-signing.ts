import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type Event, type EventTemplate } from 'nostr-tools/pure'
import { getConversationKey, encrypt, decrypt } from 'nostr-tools/nip44'
import { SimplePool } from 'nostr-tools/pool'

export const PHONE_SIGNING_RELAY = 'wss://relay.trotters.cc'
export const PAIRING_MS = 2 * 60_000
export const PLAYER_MS = 20 * 60_000
export const SIGNING_MS = 90_000
export const PHONE_SIGNING_KINDS = [21236, 30762, 5555, 27235, 23033, 23034, 9734] as const
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
export const hexKey = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
export const confirmationCode = (proof: Event) => proof.id.slice(-6).toUpperCase().match(/.../g)!.join(' ')
export function keyBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Invalid connection key.')
  return Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16))
}

export interface PhoneInvitation {
  uri: string
  proof: EventTemplate
  expiresAt: number
}

export function pairingCode(invitation: PhoneInvitation): string {
  // The code identifies the invitation; the TV still requires local confirmation
  // of the signed player identity before granting any game signing access.
  return new URL(invitation.uri).hostname.slice(-6).toUpperCase().match(/.../g)!.join(' ')
}

export function phonePairingUrl(origin: string, invitation: PhoneInvitation): string {
  const url = new URL('/phone-pair/', origin)
  const uri = new URL(invitation.uri)
  // Keep the camera payload compact: the fixed protocol, relay and proof tags
  // are reconstructed on the phone rather than percent-encoded twice in a QR.
  const compact = [uri.hostname, uri.searchParams.get('secret'), invitation.proof.tags[0][1], invitation.proof.created_at, invitation.expiresAt, uri.searchParams.get('name')]
  const bytes = new TextEncoder().encode(JSON.stringify(compact))
  url.hash = `pairing=${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  return url.href
}

export function decodePhonePairing(encoded: string, origin: string, now = Date.now()): PhoneInvitation {
  if (!/^[A-Za-z0-9_-]{1,2048}$/.test(encoded)) throw new Error('Invalid pairing link.')
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const fields = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), char => char.charCodeAt(0))))
  if (!Array.isArray(fields) || fields.length !== 6) throw new Error('Invalid pairing link.')
  const [client, secret, challenge, created_at, expiresAt, name] = fields
  if (typeof client !== 'string' || typeof secret !== 'string' || typeof challenge !== 'string' || typeof name !== 'string') throw new Error('Invalid pairing link.')
  const params = new URLSearchParams({ relay: PHONE_SIGNING_RELAY, secret, name, url: origin, perms: PHONE_SIGNING_KINDS.map(kind => `sign_event:${kind}`).join(',') })
  return parsePhoneInvitation({ uri: `nostrconnect://${client}?${params}`, proof: { kind: 21236, created_at, content: '', tags: [['challenge', challenge], ['origin', origin], ['app', name]] }, expiresAt }, origin, now)
}

export function parsePhoneInvitation(value: unknown, origin: string, now = Date.now(), relay = PHONE_SIGNING_RELAY): PhoneInvitation {
  if (!value || typeof value !== 'object') throw new Error('Scan a fresh pairing code on the arcade.')
  const invitation = value as PhoneInvitation
  if (typeof invitation.uri !== 'string' || invitation.uri.length > 4096) throw new Error('Invalid pairing link.')
  const uri = new URL(invitation.uri)
  const params = uri.searchParams
  if (uri.protocol !== 'nostrconnect:' || !/^[0-9a-f]{64}$/.test(uri.hostname)
    || !/^[0-9a-f]{64}$/.test(params.get('secret') ?? '') || params.getAll('relay').length !== 1
    || params.get('relay') !== relay || params.get('url') !== origin) throw new Error('This pairing link is not for this arcade.')
  const name = params.get('name')
  const proof = signingTemplate(invitation.proof, now)
  if (!name || name.length > 64 || !proof || proof.kind !== 21236 || proof.content !== ''
    || proof.tags.length !== 3 || proof.tags.some(tag => tag.length !== 2)
    || proof.tags[0][0] !== 'challenge' || !/^[0-9a-f]{64}$/.test(proof.tags[0][1])
    || JSON.stringify(proof.tags.slice(1)) !== JSON.stringify([['origin', origin], ['app', name]])
    || !Number.isSafeInteger(invitation.expiresAt) || invitation.expiresAt <= now
    || invitation.expiresAt > now + PAIRING_MS || proof.created_at * 1000 > now + 30_000
    || proof.created_at * 1000 < now - PAIRING_MS) throw new Error('Pairing expired. Scan a fresh code on the arcade.')
  return { uri: invitation.uri, proof, expiresAt: invitation.expiresAt }
}

/** A small, explicit conference permission set, with bounded untrusted input. */
export function signingTemplate(value: unknown, now = Date.now()): EventTemplate | null {
  if (!value || typeof value !== 'object') return null
  const event = value as EventTemplate
  if (!(PHONE_SIGNING_KINDS as readonly number[]).includes(event.kind)
    || !Number.isSafeInteger(event.created_at) || Math.abs(event.created_at - Math.floor(now / 1000)) > 600
    || typeof event.content !== 'string' || event.content.length > 16_384 || !Array.isArray(event.tags) || event.tags.length > 64
    || event.tags.some(tag => !Array.isArray(tag) || tag.length > 16 || tag.some(part => typeof part !== 'string' || part.length > 2048))) return null
  return { kind: event.kind, created_at: event.created_at, tags: structuredClone(event.tags), content: event.content }
}

export function signedFor(value: unknown, template: EventTemplate, pubkey?: string): value is Event {
  try {
    const event = value as Event
    return (!pubkey || event.pubkey === pubkey) && event.kind === template.kind && event.created_at === template.created_at
      && event.content === template.content && JSON.stringify(event.tags) === JSON.stringify(template.tags)
      && verifyEvent({ ...event })
  } catch { return false }
}

export interface Nip46Message { id: string; method?: string; params?: string[]; result?: string; error?: string }

/** NIP-46/NIP-44 only. Neither relay nor peer ever receives the user's private key. */
export class PhoneSigningChannel {
  readonly publicKey: string
  private pool = new SimplePool({ enableReconnect: true })
  private subscription?: { close(): void }
  private closed = false

  constructor(private key: Uint8Array, private relay: string, private receive: (peer: string, message: Nip46Message) => void) {
    this.publicKey = getPublicKey(key)
    this.pool.automaticallyAuth = () => async template => finalizeEvent(template, key)
  }

  async open(): Promise<void> {
    await this.pool.ensureRelay(this.relay, { connectionTimeout: 8000 })
    if (this.closed) throw new Error('Connection ended.')
    this.subscription = this.pool.subscribeMany([this.relay], { kinds: [24133], '#p': [this.publicKey], since: Math.floor(Date.now() / 1000) - 120 }, {
      onevent: event => {
        if (this.closed || event.kind !== 24133 || !event.tags.some(tag => tag[0] === 'p' && tag[1] === this.publicKey)
          || event.content.length > 100_000 || event.created_at < Date.now() / 1000 - 120 || event.created_at > Date.now() / 1000 + 30) return
        try {
          const message = JSON.parse(decrypt(event.content, getConversationKey(this.key, event.pubkey))) as Nip46Message
          if (message && typeof message.id === 'string' && message.id.length > 0 && message.id.length <= 128) this.receive(event.pubkey, message)
        } catch { /* Unrelated, malformed and unauthenticated envelopes cannot authorise work. */ }
      },
    })
  }

  async send(peer: string, message: Nip46Message): Promise<void> {
    if (this.closed) throw new Error('Connection ended.')
    const event = finalizeEvent({ kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [['p', peer]], content: encrypt(JSON.stringify(message), getConversationKey(this.key, peer)) }, this.key)
    await Promise.any(this.pool.publish([this.relay], event, { maxWait: 8000 }))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.subscription?.close()
    this.pool.destroy()
    this.key.fill(0)
  }
}

export { generateSecretKey, getPublicKey }
