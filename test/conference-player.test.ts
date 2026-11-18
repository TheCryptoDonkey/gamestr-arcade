import { afterEach, describe, expect, it, vi } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { ConferencePlayer, type ChannelFactory } from '../src/shared/conference-player'
import { PAIRING_MS, PLAYER_MS, SIGNING_MS, type Nip46Message } from '../src/shared/phone-signing'

const identity = new Uint8Array(32).fill(19), pubkey = getPublicKey(identity), peer = getPublicKey(new Uint8Array(32).fill(20))
const players: ConferencePlayer[] = []
function fixture() {
  let receive!: (peer: string, message: Nip46Message) => void
  const sent: Nip46Message[] = [], close = vi.fn(), onChange = vi.fn()
  const channel: ChannelFactory = (_key, _relay, listener) => { receive = listener; return { open: async () => {}, send: async (_peer, message) => { sent.push(message) }, close } }
  const player = new ConferencePlayer({ appName: 'Gamestr Arcade', origin: 'https://arcade.example', channel, onChange })
  players.push(player)
  const send = (message: Nip46Message, sender = peer) => receive(sender, message)
  const reply = (result: string, sender = peer) => send({ id: sent.at(-1)!.id, result }, sender)
  async function pair() {
    const invitation = await player.start()
    send({ id: 'ack', result: new URL(invitation.uri).searchParams.get('secret')! })
    reply(pubkey)
    await vi.waitFor(() => expect(sent.at(-1)?.method).toBe('sign_event'))
    reply(JSON.stringify(finalizeEvent(invitation.proof, identity)))
    await vi.waitFor(() => expect(player.state.status).toBe('confirm'))
    return invitation
  }
  return { player, sent, close, onChange, send, reply, pair }
}
afterEach(() => { for (const player of players.splice(0)) player.end(); vi.useRealTimers() })

describe('conference player consent and revocation', () => {
  it('allows time to unlock a hardware signer without replacing or extending the invitation', async () => {
    vi.useFakeTimers()
    const f = fixture(), invitation = await f.player.start()
    const secret = new URL(invitation.uri).searchParams.get('secret')!
    expect(invitation.expiresAt - Date.now()).toBe(5 * 60_000)
    await vi.advanceTimersByTimeAsync(150_000)
    expect(f.player.state.status).toBe('pairing')
    f.send({ id: 'ack', result: secret }); f.reply(pubkey)
    await vi.advanceTimersByTimeAsync(0)
    f.reply(JSON.stringify(finalizeEvent(invitation.proof, identity)))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.player.state.status).toBe('confirm')
    await vi.advanceTimersByTimeAsync(150_000)
    expect(() => f.player.confirm()).toThrow('no longer')
  })

  it('requires an exact signed challenge and local confirmation before signing', async () => {
    const f = fixture(), invitation = await f.pair()
    expect(f.player.state).toMatchObject({ status: 'confirm', pubkey, confirmationCode: expect.stringMatching(/^[A-F0-9]{3} [A-F0-9]{3}$/) })
    const session = f.player.confirm()
    expect(session.authEvent).toMatchObject({ pubkey, tags: invitation.proof.tags })
    const template = { kind: 30762, created_at: Math.floor(Date.now() / 1000), tags: [['game', 'pallasite']], content: '123' }
    const signing = session.signer.signEvent(template)
    f.reply(JSON.stringify(finalizeEvent(template, identity)))
    expect(await signing).toMatchObject({ pubkey, kind: 30762 })
    await expect(session.signer.signEvent({ ...template, kind: 1 })).rejects.toThrow('outside')
    f.player.end()
    await expect(session.signer.signEvent(template)).rejects.toThrow('session ended')
  })

  it('ignores a response from another transport peer, even with the correct request id', async () => {
    const f = fixture(), invitation = await f.player.start()
    expect(() => f.player.confirm()).toThrow('no longer')
    f.send({ id: 'ack', result: 'wrong-secret' }); expect(f.sent).toHaveLength(0)
    f.send({ id: 'ack', result: new URL(invitation.uri).searchParams.get('secret')! })
    f.reply(pubkey, getPublicKey(new Uint8Array(32).fill(22)))
    await Promise.resolve(); expect(f.sent.at(-1)?.method).toBe('get_public_key')
    f.reply(pubkey)
    await vi.waitFor(() => expect(f.sent.at(-1)?.method).toBe('sign_event'))
    f.reply(JSON.stringify(finalizeEvent({ ...invitation.proof, content: 'changed' }, identity)))
    await vi.waitFor(() => expect(f.player.state.status).toBe('unavailable'))
  })

  it('discards a late signature and keeps old sessions revoked after same-account pairing', async () => {
    const f = fixture(); await f.pair()
    const old = f.player.confirm(), template = { kind: 5555, created_at: Math.floor(Date.now() / 1000), content: 'score', tags: [] }
    const signing = old.signer.signEvent(template), rejected = expect(signing).rejects.toThrow('session ended')
    f.player.end(); await rejected
    await f.pair(); f.player.confirm()
    await expect(old.signer.signEvent(template)).rejects.toThrow('session ended')
  })

  it('does not end a replacement pairing when an old request settles', async () => {
    const f = fixture(); await f.pair(); const old = f.player.confirm()
    const request = old.signer.signEvent({ kind: 5555, created_at: Math.floor(Date.now() / 1000), content: '', tags: [] })
    const rejected = expect(request).rejects.toThrow('session ended')
    await f.player.start(); await rejected
    expect(f.player.state.status).toBe('pairing')
    expect(() => f.player.confirm()).toThrow()
  })

  it('bounds pairing, phone approval and player lifetime', async () => {
    vi.useFakeTimers()
    const f = fixture(); await f.player.start(); await vi.advanceTimersByTimeAsync(PAIRING_MS)
    expect(f.player.state.status).toBe('unavailable')
    vi.useRealTimers(); await f.pair(); const session = f.player.confirm(); vi.useFakeTimers()
    const pending = session.signer.signEvent({ kind: 5555, created_at: Math.floor(Date.now() / 1000), content: '', tags: [] })
    const rejected = expect(pending).rejects.toThrow('did not respond')
    await vi.advanceTimersByTimeAsync(SIGNING_MS); await rejected
    expect(f.player.state.status).toBe('unavailable')
    vi.useRealTimers(); await f.pair(); vi.useFakeTimers(); f.player.confirm(); await vi.advanceTimersByTimeAsync(PLAYER_MS)
    expect(f.player.state.status).toBe('unavailable')
  })

  it('does not send an old challenge over a replacement connection', async () => {
    const f = fixture(), invitation = await f.player.start()
    f.send({ id: 'ack', result: new URL(invitation.uri).searchParams.get('secret')! })
    f.reply(pubkey)
    // Replace synchronously before identify resumes from the public-key reply.
    await f.player.start()
    await Promise.resolve()
    expect(f.sent.filter(message => message.method === 'sign_event')).toHaveLength(0)
    expect(f.player.state.status).toBe('pairing')
  })

  it('phone logout revokes the TV session immediately', async () => {
    const f = fixture(); await f.pair(); const session = f.player.confirm()
    f.send({ id: 'phone-end', method: 'logout', params: [] })
    expect(f.player.state.status).toBe('unavailable')
    await expect(session.signer.signEvent({ kind: 5555, content: '' })).rejects.toThrow('session ended')
  })
})
