import type { Event } from 'nostr-tools/pure'
import type { SignetSession } from 'signet-login'
import { PhoneSigningChannel, PHONE_SIGNING_RELAY, PHONE_SIGNING_KINDS, PAIRING_MS, PLAYER_MS, SIGNING_MS, generateSecretKey, getPublicKey, randomToken, signedFor, signingTemplate, confirmationCode, type Nip46Message, type PhoneInvitation } from './phone-signing'

export type PlayerState = { status: 'guest' | 'pairing' | 'confirm' | 'connected' | 'unavailable'; pubkey?: string; message?: string; confirmationCode?: string }
export type ChannelFactory = (key: Uint8Array, relay: string, receive: (peer: string, message: Nip46Message) => void) => Pick<PhoneSigningChannel, 'open' | 'send' | 'close'>

/** One TV player, with in-memory credentials and explicit local confirmation. */
export class ConferencePlayer {
  private generation = 0
  private channel?: ReturnType<ChannelFactory>
  private peer?: string
  private proof?: Event
  private invitation?: PhoneInvitation
  private deadline?: ReturnType<typeof setTimeout>
  private pending = new Map<string, { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  private signing = false
  state: PlayerState = { status: 'guest' }

  constructor(private options: { appName: string; origin: string; onChange(state: PlayerState): void; relay?: string; channel?: ChannelFactory }) {}

  private update(state: PlayerState): void { this.state = state; this.options.onChange(state) }

  async start(): Promise<PhoneInvitation> {
    this.end()
    const generation = this.generation
    const key = generateSecretKey()
    const params = new URLSearchParams({ relay: this.options.relay ?? PHONE_SIGNING_RELAY, secret: randomToken(), name: this.options.appName, url: this.options.origin, perms: PHONE_SIGNING_KINDS.map(kind => `sign_event:${kind}`).join(',') })
    const invitation: PhoneInvitation = {
      uri: `nostrconnect://${getPublicKey(key)}?${params}`,
      proof: { kind: 21236, created_at: Math.floor(Date.now() / 1000), content: '', tags: [['challenge', randomToken()], ['origin', this.options.origin], ['app', this.options.appName]] },
      expiresAt: Date.now() + PAIRING_MS,
    }
    this.invitation = invitation
    this.update({ status: 'pairing' })
    this.deadline = setTimeout(() => this.fail('Pairing expired. Show a fresh code and try again.'), PAIRING_MS)
    this.channel = (this.options.channel ?? ((...args) => new PhoneSigningChannel(...args)))(key, params.get('relay')!, (peer, message) => {
      if (generation !== this.generation) return
      if (!this.peer && message.result === params.get('secret')) {
        this.peer = peer
        void this.identify(generation, invitation)
      } else if (this.peer === peer) {
        if (message.method === 'logout') { this.fail('Player disconnected on their phone.'); return }
        const pending = this.pending.get(message.id)
        if (!pending || typeof message.method === 'string') return
        this.pending.delete(message.id); clearTimeout(pending.timer)
        if (typeof message.error === 'string') pending.reject(new Error('The phone declined or could not sign this request.'))
        else if (typeof message.result === 'string') pending.resolve(message.result)
        else pending.reject(new Error('Invalid signer response.'))
      }
    })
    try { await this.channel.open() } catch { if (generation === this.generation) this.fail('Cannot reach the signing relay. Retry or play as guest.'); throw new Error('Signing relay unavailable.') }
    if (generation !== this.generation) throw new Error('Pairing cancelled.')
    return invitation
  }

  private async identify(generation: number, invitation: PhoneInvitation): Promise<void> {
    try {
      const pubkey = await this.request('get_public_key', [])
      if (generation !== this.generation) return
      if (!/^[0-9a-f]{64}$/.test(pubkey)) throw new Error('Invalid signer identity.')
      const proof = JSON.parse(await this.request('sign_event', [JSON.stringify({ ...invitation.proof, pubkey })]))
      if (!signedFor(proof, invitation.proof, pubkey)) throw new Error('The signer returned a different identity or request.')
      if (generation !== this.generation) return
      this.proof = proof
      this.update({ status: 'confirm', pubkey, confirmationCode: confirmationCode(proof) })
    } catch { if (generation === this.generation) this.fail('Phone approval did not complete. Retry or play as guest.') }
  }

  confirm(): SignetSession {
    if (this.state.status !== 'confirm' || !this.proof || !this.invitation || Date.now() >= this.invitation.expiresAt) throw new Error('Pairing is no longer available.')
    clearTimeout(this.deadline)
    const generation = this.generation
    const proof = this.proof
    this.update({ status: 'connected', pubkey: proof.pubkey })
    this.deadline = setTimeout(() => this.fail('Player session ended. Connect again or play as guest.'), PLAYER_MS)
    return { pubkey: proof.pubkey, method: 'bunker', authEvent: proof as SignetSession['authEvent'], signer: {
      pubkey: proof.pubkey, method: 'bunker', capabilities: { canSignEvents: true, hasNip44: false },
      signEvent: async raw => {
        const template = signingTemplate({ ...raw, created_at: raw.created_at ?? Math.floor(Date.now() / 1000), tags: raw.tags ?? [] })
        if (!template) throw new Error('This event is outside the conference signing permissions.')
        if (generation !== this.generation || this.state.status !== 'connected') throw new Error('Player session ended.')
        if (this.signing) throw new Error('Finish the pending phone approval first.')
        this.signing = true
        try {
          const event = JSON.parse(await this.request('sign_event', [JSON.stringify({ ...template, pubkey: proof.pubkey })]))
          if (generation !== this.generation || this.state.status !== 'connected') throw new Error('Player session ended.')
          if (!signedFor(event, template, proof.pubkey)) { this.fail('Signer identity changed. Connect again.'); throw new Error('Signer identity changed.') }
          return event
        } finally { if (generation === this.generation) this.signing = false }
      },
      close: async () => { if (generation === this.generation) this.end() },
    } }
  }

  private request(method: string, params: string[]): Promise<string> {
    const channel = this.channel, peer = this.peer
    if (!channel || !peer) return Promise.reject(new Error('Signer disconnected.'))
    const id = randomToken()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Phone did not respond.')); this.fail('Phone did not respond. Reconnect or play as guest.') }, SIGNING_MS)
      this.pending.set(id, { resolve, reject, timer })
      void channel.send(peer, { id, method, params }).catch(() => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id); clearTimeout(timer); reject(new Error('Signing relay unavailable.'))
        this.fail('Signing relay unavailable. Reconnect or play as guest.')
      })
    })
  }

  private fail(message: string): void {
    const pubkey = this.state.pubkey
    this.end()
    this.update({ status: 'unavailable', ...(pubkey ? { pubkey } : {}), message })
  }

  end(): void {
    ++this.generation
    clearTimeout(this.deadline)
    const channel = this.channel, peer = this.peer
    this.channel = undefined; this.peer = undefined; this.proof = undefined; this.invitation = undefined; this.signing = false
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Player session ended.')) }
    this.pending.clear()
    // Local revocation is immediate. Remote logout is best effort and must not
    // leave a socket or a signing capability alive if a phone is asleep.
    if (channel && peer) void channel.send(peer, { id: randomToken(), method: 'logout', params: [] }).catch(() => {}).finally(() => channel.close())
    else channel?.close()
    this.update({ status: 'guest' })
  }
}
