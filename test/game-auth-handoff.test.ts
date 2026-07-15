// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { createNostrGameLaunch, decodeNostrGameHandoffToken, GAME_AUTH_FRAGMENT, validGameSigningTemplate } from '../src/web/game-auth-handoff'

const SECRET = new Uint8Array(32).fill(7)
const PUBKEY = getPublicKey(SECRET)
const NOW = 1_800_000_000

function authEvent(createdAt = NOW) {
  return finalizeEvent({
    kind: 21236,
    created_at: createdAt,
    content: '',
    tags: [
      ['challenge', 'a'.repeat(64)],
      ['origin', 'https://arcade.600.wtf'],
      ['app', '600 Billion Arcade'],
    ],
  }, SECRET)
}

describe('600B Nostr game handoff', () => {
  it('places a verified identity proof and bridge channel in the URL fragment', () => {
    const launch = createNostrGameLaunch({
      gameId: 'pallasite',
      targetUrl: 'https://pallasite.app/',
      sourceOrigin: 'https://arcade.600.wtf',
      sourceApp: '600 Billion Arcade',
      session: { pubkey: PUBKEY, canSignEvents: true, authEvent: authEvent() },
      profile: { name: 'Alice', nip05: 'alice@example.com', picture: 'https://example.com/alice.webp' },
      nowSeconds: NOW,
      channel: 'test-channel-1234567890',
    })

    expect(launch).not.toBeNull()
    const url = new URL(launch!.url)
    expect(url.search).toBe('')
    const token = new URLSearchParams(url.hash.slice(1)).get(GAME_AUTH_FRAGMENT)
    const payload = decodeNostrGameHandoffToken(token!)
    expect(payload).toMatchObject({
      v: 1,
      game: 'pallasite',
      target: 'https://pallasite.app',
      channel: 'test-channel-1234567890',
      canSign: true,
      profile: { name: 'Alice', nip05: 'alice@example.com' },
      event: { pubkey: PUBKEY, kind: 21236 },
    })
  })

  it('rejects stale, mismatched, and incorrectly scoped login proofs', () => {
    const base = {
      gameId: 'pallasite',
      targetUrl: 'https://pallasite.app/',
      sourceOrigin: 'https://arcade.600.wtf',
      sourceApp: '600 Billion Arcade',
      nowSeconds: NOW,
      channel: 'test-channel-1234567890',
    }
    expect(createNostrGameLaunch({ ...base, session: { pubkey: PUBKEY, canSignEvents: false, authEvent: authEvent(NOW - 31 * 24 * 60 * 60) } })).toBeNull()
    expect(createNostrGameLaunch({ ...base, session: { pubkey: 'b'.repeat(64), canSignEvents: false, authEvent: authEvent() } })).toBeNull()
    expect(createNostrGameLaunch({ ...base, sourceApp: 'Wrong Arcade', session: { pubkey: PUBKEY, canSignEvents: false, authEvent: authEvent() } })).toBeNull()
  })

  it('bounds event templates accepted by the cross-origin signing bridge', () => {
    expect(validGameSigningTemplate({ kind: 27235, created_at: NOW, content: '', tags: [['u', 'https://game.example/api/claim'], ['method', 'POST']] })).toBe(true)
    expect(validGameSigningTemplate({ kind: -1, created_at: NOW, content: '', tags: [] })).toBe(false)
    expect(validGameSigningTemplate({ kind: 1, created_at: NOW, content: '', tags: Array.from({ length: 257 }, () => ['t', 'x']) })).toBe(false)
    expect(validGameSigningTemplate({ kind: 1, created_at: NOW, content: 'x'.repeat(256_001), tags: [] })).toBe(false)
  })
})
