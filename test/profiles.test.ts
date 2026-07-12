import { describe, it, expect, vi, afterEach } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { hexToNpub, shortenNpub, avatarSeed, avatarGradient, avatarCss, resolveProfiles } from '../src/renderer/src/leaderboard/profiles'

// A known Nostr pubkey ↔ npub pair (fiatjaf) pins the bech32 encoder.
const FIATJAF_HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
const FIATJAF_NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6'

describe('hexToNpub (bech32)', () => {
  it('encodes a known pubkey to its canonical npub', () => {
    expect(hexToNpub(FIATJAF_HEX)).toBe(FIATJAF_NPUB)
  })

  it('always produces an npub1-prefixed string of stable length', () => {
    const npub = hexToNpub('00'.repeat(32))
    expect(npub.startsWith('npub1')).toBe(true)
    expect(npub.length).toBe(63) // npub1 + 52 data + 6 checksum
  })
})

describe('shortenNpub', () => {
  it('keeps a recognisable head and tail and elides the middle', () => {
    const short = shortenNpub(FIATJAF_HEX)
    expect(short.startsWith('npub1')).toBe(true)
    expect(short).toContain('…')
    expect(short).toBe(`${FIATJAF_NPUB.slice(0, 8)}…${FIATJAF_NPUB.slice(-4)}`)
  })

  it('is deterministic for the same pubkey', () => {
    expect(shortenNpub(FIATJAF_HEX)).toBe(shortenNpub(FIATJAF_HEX))
  })

  it('respects custom head/tail lengths', () => {
    const short = shortenNpub(FIATJAF_HEX, 10, 6)
    expect(short).toBe(`${FIATJAF_NPUB.slice(0, 10)}…${FIATJAF_NPUB.slice(-6)}`)
  })

  it('passes through non-hex input untouched when too short to elide', () => {
    expect(shortenNpub('alice')).toBe('alice')
  })
})

describe('avatarSeed (deterministic)', () => {
  it('is stable across calls for the same pubkey', () => {
    expect(avatarSeed(FIATJAF_HEX)).toBe(avatarSeed(FIATJAF_HEX))
  })

  it('differs for different pubkeys', () => {
    expect(avatarSeed('aa'.repeat(32))).not.toBe(avatarSeed('bb'.repeat(32)))
  })

  it('returns an unsigned 32-bit integer', () => {
    const seed = avatarSeed(FIATJAF_HEX)
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('avatarGradient', () => {
  it('derives two distinct hues plus an angle, all in range', () => {
    const g = avatarGradient(FIATJAF_HEX)
    expect(g.hueA).toBeGreaterThanOrEqual(0)
    expect(g.hueA).toBeLessThan(360)
    expect(g.hueB).toBeGreaterThanOrEqual(0)
    expect(g.hueB).toBeLessThan(360)
    expect(g.angle).toBeGreaterThanOrEqual(0)
    expect(g.angle).toBeLessThan(360)
  })

  it('keeps the two hues visibly apart (never a flat single-hue smear)', () => {
    for (const pk of ['aa'.repeat(32), 'bf'.repeat(32), '12'.repeat(32), FIATJAF_HEX]) {
      const { hueA, hueB } = avatarGradient(pk)
      const delta = Math.abs(hueA - hueB)
      const circular = Math.min(delta, 360 - delta)
      expect(circular).toBeGreaterThanOrEqual(20)
    }
  })

  it('avatarCss yields a deterministic linear-gradient string', () => {
    const css = avatarCss(FIATJAF_HEX)
    expect(css).toMatch(/^linear-gradient\(\d+deg, hsl\(\d+ 85% 58%\), hsl\(\d+ 80% 42%\)\)$/)
    expect(avatarCss(FIATJAF_HEX)).toBe(css)
  })
})

describe('resolveProfiles trust boundary', () => {
  interface MockWsInstance {
    sentMessages: string[]
    onopen: (() => void) | null
    onmessage: ((event: { data: string }) => void) | null
    triggerOpen(): void
    triggerMessage(data: string): void
  }

  function installMockWebSocket(): MockWsInstance[] {
    const instances: MockWsInstance[] = []
    class MockWebSocket {
      sentMessages: string[] = []
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      constructor(_url: string) { instances.push(this) }
      send(message: string) { this.sentMessages.push(message) }
      close() {}
      triggerOpen() { this.onopen?.() }
      triggerMessage(data: string) { this.onmessage?.({ data }) }
    }
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    return instances
  }

  const AUTHOR_KEY = new Uint8Array(32).fill(11)
  const OTHER_KEY = new Uint8Array(32).fill(12)
  const AUTHOR = getPublicKey(AUTHOR_KEY)
  const NOW = Math.floor(Date.now() / 1000)

  function profileMessage(subId: string, key: Uint8Array, content: Record<string, unknown>, createdAt = NOW): string {
    const event = finalizeEvent({
      kind: 0,
      created_at: createdAt,
      content: JSON.stringify(content),
      tags: [],
    }, key)
    return JSON.stringify(['EVENT', subId, event])
  }

  afterEach(() => vi.unstubAllGlobals())

  it('resolves a requested author only after ID and signature verification', () => {
    const sockets = installMockWebSocket()
    const resolved: Array<[string, { name?: string }]> = []
    const dispose = resolveProfiles(['wss://relay.test'], [AUTHOR], (pubkey, profile) => {
      resolved.push([pubkey, profile])
    })
    const ws = sockets[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    // A correctly signed but unsolicited author is outside the requested set.
    ws.triggerMessage(profileMessage(subId, OTHER_KEY, { name: 'Mallory' }))

    // Mutating signed content leaves a well-shaped event with an invalid ID/signature.
    const tampered = JSON.parse(profileMessage(subId, AUTHOR_KEY, { name: 'Alice' })) as ['EVENT', string, { content: string }]
    tampered[2].content = JSON.stringify({ name: 'Forged Alice' })
    ws.triggerMessage(JSON.stringify(tampered))

    const badSignature = JSON.parse(profileMessage(subId, AUTHOR_KEY, { name: 'Alice' })) as ['EVENT', string, { sig: string }]
    badSignature[2].sig = '0'.repeat(128)
    ws.triggerMessage(JSON.stringify(badSignature))
    expect(resolved).toEqual([])

    ws.triggerMessage(profileMessage(subId, AUTHOR_KEY, { display_name: 'Alice' }))
    expect(resolved).toEqual([[AUTHOR, { name: 'Alice', picture: undefined }]])
    dispose()
  })

  it('rejects a signed kind-0 with an unreasonable future timestamp', () => {
    const sockets = installMockWebSocket()
    const resolved: string[] = []
    resolveProfiles(['wss://relay.test'], [AUTHOR], pubkey => resolved.push(pubkey))
    const ws = sockets[0]
    ws.triggerOpen()
    const subId = (JSON.parse(ws.sentMessages[0]) as [string, string])[1]

    ws.triggerMessage(profileMessage(subId, AUTHOR_KEY, { name: 'Future Alice' }, NOW + 3_600))
    expect(resolved).toEqual([])
  })
})
