import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'
import { describe, expect, it } from 'vitest'
import { decodeInvitation, encodeInvitation, invitationTemplate, parseInvitation } from '../src/web/game-invitation'

describe('structured game invitations', () => {
  it('round-trips a signed, expiring invitation without a server inbox', () => {
    const event = finalizeEvent(invitationTemplate('sovereign-racer', 'https://play.example.com/', 1_700_000_000), generateSecretKey())
    const decoded = decodeInvitation(encodeInvitation(event))!
    const invitation = parseInvitation(decoded, 1_700_000_001)
    expect(invitation).toMatchObject({ gameId: 'sovereign-racer', gameUrl: 'https://play.example.com/' })
    expect(invitation?.event.pubkey).toBe(event.pubkey)
  })

  it('rejects expired, tampered, credentialed, and oversized links', () => {
    const event = finalizeEvent(invitationTemplate('sovereign-racer', 'https://play.example.com/', 1_700_000_000), generateSecretKey())
    expect(parseInvitation(event, 1_800_000_000)).toBeUndefined()
    expect(parseInvitation({ ...event, content: 'hello' }, 1_700_000_001)).toBeUndefined()
    const credentialed = finalizeEvent(invitationTemplate('sovereign-racer', 'https://user:pass@play.example.com/', 1_700_000_000), generateSecretKey())
    expect(parseInvitation(credentialed, 1_700_000_001)).toBeUndefined()
    expect(decodeInvitation('a'.repeat(4097))).toBeUndefined()
  })
})
