import { describe, expect, it } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { androidApprovalUrl, acceptPhoneApproval, initialApproval, newPhoneSigner } from '../src/shared/phone-signer'
import { PAIRING_MS, PHONE_SIGNING_RELAY, parsePhoneInvitation, phonePairingUrl, signingTemplate, type PhoneInvitation } from '../src/shared/phone-signing'
import { parsePlayerNostrTemplate } from '../src/main/web-session-policy'

const now = Date.now(), secret = new Uint8Array(32).fill(31), pubkey = getPublicKey(secret), origin = 'https://arcade.example'
function invitation(): PhoneInvitation {
  const params = new URLSearchParams({ relay: PHONE_SIGNING_RELAY, secret: 'b'.repeat(64), name: 'Gamestr Arcade', url: origin })
  return { uri: `nostrconnect://${'a'.repeat(64)}?${params}`, expiresAt: now + PAIRING_MS, proof: { kind: 21236, content: '', created_at: Math.floor(now / 1000), tags: [['challenge', 'c'.repeat(64)], ['origin', origin], ['app', 'Gamestr Arcade']] } }
}
describe('phone signer pairing and Android callbacks', () => {
  it('keeps the invitation in a fragment and rejects unrelated origins and relays', () => {
    const invite = invitation(), url = new URL(phonePairingUrl(origin, invite))
    expect(url.search).toBe(''); expect(url.pathname).toBe('/phone-pair/')
    expect(parsePhoneInvitation(invite, origin, now)).toEqual(invite)
    expect(() => parsePhoneInvitation(invite, 'https://other.example', now)).toThrow()
    expect(() => parsePhoneInvitation(invite, origin, now + PAIRING_MS)).toThrow()
    const uri = new URL(invite.uri); uri.searchParams.set('relay', 'wss://unrelated.example')
    expect(() => parsePhoneInvitation({ ...invite, uri: uri.href }, origin, now)).toThrow()
    expect(() => parsePhoneInvitation({ ...invite, proof: { ...invite.proof, tags: [...invite.proof.tags, ['origin', 'https://evil.example']] } }, origin, now)).toThrow()
  })

  it('targets Cambium first and retains the standard NIP-55 option', () => {
    const state = newPhoneSigner(invitation()); initialApproval(state)
    const cambium = androidApprovalUrl(state, origin)
    expect(cambium).toContain('scheme=nostrsigner;package=dev.forgesworn.cambium;end')
    expect(cambium).not.toContain(state.connectionKey)
    expect(androidApprovalUrl(state, origin, false)).toMatch(/^nostrsigner:/)
    expect(decodeURIComponent(cambium)).toContain('returnType=event')
    expect(decodeURIComponent(cambium)).not.toContain('nsec')
  })

  it('accepts an exact signed return once and pins later approvals to that identity', () => {
    const state = newPhoneSigner(invitation()), pending = initialApproval(state)
    const event = finalizeEvent(pending.template, secret)
    expect(acceptPhoneApproval(state, pending.token, JSON.stringify(event), now).pubkey).toBe(pubkey)
    expect(state.proof).toEqual(JSON.parse(JSON.stringify(event))); expect(state.pending).toBeUndefined()
    expect(() => acceptPhoneApproval(state, pending.token, JSON.stringify(event), now)).toThrow('already used')
    state.pending = { ...pending, id: 'score', template: { kind: 5555, created_at: Math.floor(now / 1000), content: 'score', tags: [] } }
    expect(androidApprovalUrl(state, origin)).toContain(`current_user=${pubkey}`)
    const other = finalizeEvent(state.pending.template, new Uint8Array(32).fill(32))
    expect(() => acceptPhoneApproval(state, pending.token, JSON.stringify(other), now)).toThrow('different account')
    expect(state.pending).toBeDefined()
  })

  it('rejects mismatched, tampered, expired and unsolicited approval results', () => {
    const state = newPhoneSigner(invitation()), pending = initialApproval(state), event = finalizeEvent(pending.template, secret)
    expect(() => acceptPhoneApproval(state, 'wrong-token', JSON.stringify(event), now)).toThrow()
    expect(() => acceptPhoneApproval(state, pending.token, JSON.stringify({ ...event, content: 'changed' }), now)).toThrow()
    expect(() => acceptPhoneApproval(state, pending.token, JSON.stringify(event), now + PAIRING_MS)).toThrow()
    expect(() => acceptPhoneApproval(state, pending.token, '{', now)).toThrow()
    expect(acceptPhoneApproval(state, pending.token, btoa(JSON.stringify(event)), now).pubkey).toBe(pubkey)
  })
})

describe('personal game signing scope', () => {
  const template = { kind: 5555, content: '', tags: [['game', 'pallasite']], created_at: Math.floor(Date.now() / 1000) }, origins = new Set(['https://play.example'])
  it('admits supported scores while rejecting other games, posts, and origin mismatches', () => {
    expect(parsePlayerNostrTemplate(template, 'pallasite', origins)).toEqual(template)
    expect(parsePlayerNostrTemplate(template, 'other', origins)).toBeNull()
    expect(parsePlayerNostrTemplate({ ...template, kind: 1 }, 'pallasite', origins)).toBeNull()
    expect(parsePlayerNostrTemplate({ ...template, kind: 27235, tags: [['u', 'https://evil.example/api']] }, 'pallasite', origins)).toBeNull()
    expect(parsePlayerNostrTemplate({ ...template, kind: 27235, tags: [['u', 'https://play.example/api']] }, 'pallasite', origins)).not.toBeNull()
    expect(parsePlayerNostrTemplate({ ...template, kind: 21236, tags: [['origin', 'https://play.example']] }, 'pallasite', origins)).not.toBeNull()
    expect(signingTemplate({ ...template, content: 'x'.repeat(16_385) })).toBeNull()
    expect(signingTemplate({ ...template, tags: [['game', 3]] })).toBeNull()
  })
})
