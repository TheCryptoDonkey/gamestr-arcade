import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'
import { describe, expect, it } from 'vitest'
import { challengeTemplate, decodeChallenge, encodeChallenge, parseChallenge } from '../src/web/game-challenge'

describe('signed game challenges', () => {
  it('round-trips a bounded challenge definition', () => {
    const event = finalizeEvent(challengeTemplate('forge-realms', 'https://forgesworn.dev/forge-realms/', 'Forge Friday', 86_400, 1_700_000_000), generateSecretKey())
    const challenge = parseChallenge(decodeChallenge(encodeChallenge(event))!, 1_700_000_001)
    expect(challenge).toMatchObject({ name: 'Forge Friday', gameId: 'forge-realms', startsAt: 1_700_000_000, endsAt: 1_700_086_400 })
    expect(challenge?.event.id).toBe(event.id)
  })

  it('rejects invalid duration, unsafe origin, tampering, and stale definitions', () => {
    expect(() => challengeTemplate('game', 'https://example.com/', 'Too short', 60)).toThrow()
    expect(() => challengeTemplate('game', 'https://example.com/', '\n', 3600)).toThrow()
    const key = generateSecretKey()
    const event = finalizeEvent(challengeTemplate('game', 'https://example.com/', 'Valid Cup', 3600, 1_700_000_000), key)
    expect(parseChallenge({ ...event, content: '{"name":"Changed"}' }, 1_700_000_001)).toBeUndefined()
    const unsafe = finalizeEvent(challengeTemplate('game', 'https://user:pass@example.com/', 'Unsafe Cup', 3600, 1_700_000_000), key)
    expect(parseChallenge(unsafe, 1_700_000_001)).toBeUndefined()
    expect(parseChallenge(event, 1_800_000_000)).toBeUndefined()
  })
})
