// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  restoreSession: vi.fn(),
}))

vi.mock('signet-login', () => ({
  login: mocks.login,
  restoreSession: mocks.restoreSession,
}))

const PUBKEY = 'a'.repeat(64)
const signer = {
  pubkey: PUBKEY,
  method: 'bunker' as const,
  capabilities: { canSignEvents: true, hasNip44: false },
  signEvent: vi.fn(),
  close: vi.fn(),
}

describe('Signet Nostr access', () => {
  beforeEach(() => {
    mocks.login.mockReset()
    mocks.restoreSession.mockReset()
    document.documentElement.dataset.webEdition = '600'
  })

  it('opens the Signet picker without offering an nsec input and activates its signer', async () => {
    const session = { pubkey: PUBKEY, method: 'bunker' as const, signer, authEvent: {} }
    mocks.login.mockResolvedValue(session)
    const { connectNostrAccess, currentNostrSigner, NOSTR_SESSION_EVENT } = await import('../src/web/nostr-access')
    const seen: string[] = []
    window.addEventListener(NOSTR_SESSION_EVENT, event => seen.push((event as CustomEvent<{ pubkey: string }>).detail.pubkey), { once: true })

    const access = await connectNostrAccess({ appName: '600 Billion Arcade', relays: ['wss://relay.damus.io'] })

    expect(access).toMatchObject({ pubkey: PUBKEY, method: 'bunker', canSignEvents: true })
    expect(currentNostrSigner()).toBe(signer)
    expect(seen).toEqual([PUBKEY])
    expect(mocks.login).toHaveBeenCalledWith(expect.objectContaining({
      appName: '600 Billion Arcade',
      methods: ['local-signet', 'remote-signet', 'nip07', 'amber', 'nostrconnect', 'bunker'],
      theme: 'light',
    }))
    expect(mocks.login.mock.calls[0][0].methods).not.toContain('nsec')
  })
})
