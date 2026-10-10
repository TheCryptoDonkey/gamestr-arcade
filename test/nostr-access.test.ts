// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'

const mocks = vi.hoisted(() => ({ login: vi.fn(), restoreSession: vi.fn(), logout: vi.fn(), handleRedirectCallback: vi.fn() }))
vi.mock('signet-login', () => mocks)
vi.mock('../src/web/login-method-picker', () => ({ pickLoginMethod: vi.fn(async () => 'bunker') }))
const SECRET = new Uint8Array(32).fill(7)
const PUBKEY = getPublicKey(SECRET)
const OTHER = new Uint8Array(32).fill(8)
const template = { kind: 1, created_at: 1_800_000_000, content: 'test', tags: [] as string[][] }
function session(method: 'bunker' | 'nip07' = 'bunker') {
  return { pubkey: PUBKEY, method, authEvent: {}, signer: {
    pubkey: PUBKEY, method, capabilities: { canSignEvents: true, hasNip44: false },
    signEvent: vi.fn(async event => finalizeEvent(event, SECRET)), close: vi.fn(),
  } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('selected Nostr session', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handleRedirectCallback.mockResolvedValue({ kind: 'no-callback' })
    mocks.logout.mockResolvedValue(undefined)
    localStorage.clear()
    window.history.replaceState(null, '', '/')
    delete (window as Window & { nostr?: unknown }).nostr
    document.documentElement.dataset.webEdition = '600'
  })

  it('offers Signet for signing upgrades without private-key input or score-relay overrides', async () => {
    mocks.login.mockResolvedValue(session())
    const access = await import('../src/web/nostr-access')
    expect(await access.connectNostrAccess({ appName: '600 Billion Arcade', relays: ['wss://relay.damus.io'], signingRequired: true })).toMatchObject({ pubkey: PUBKEY, canSignEvents: true })
    const options = mocks.login.mock.calls[0][0]
    expect(options.methods).toContain('local-signet')
    expect(options.methods).toContain('remote-signet')
    expect(options.methods).not.toContain('nsec')
    expect(options.relayUrl).toBeUndefined()
    expect(options.relayUrls).toBeUndefined()
    expect(await access.currentNostrSigner()!.signEvent(template)).toMatchObject({ pubkey: PUBKEY })
  })

  it('never signs through an ambient extension and revokes before cleanup completes', async () => {
    const extension = { getPublicKey: vi.fn(), signEvent: vi.fn() }
    Object.assign(window, { nostr: extension })
    const access = await import('../src/web/nostr-access')
    expect(access.currentNostrSigner()).toBeUndefined()
    mocks.login.mockResolvedValue(session())
    await access.connectNostrAccess({ appName: 'Arcade', relays: [] })
    const oldSigner = access.currentNostrSigner()!
    const cleanup = deferred<void>()
    mocks.logout.mockReturnValue(cleanup.promise)
    localStorage.setItem('signet:login.pubkey', PUBKEY)
    localStorage.setItem('signet:login.pendingRelayAuth', 'pending')
    const logout = access.disconnectNostrAccess()
    expect(localStorage.getItem('signet:login.pubkey')).toBeNull()
    expect(localStorage.getItem('signet:login.pendingRelayAuth')).toBeNull()
    expect(access.currentNostrSigner()).toBeUndefined()
    await expect(oldSigner.signEvent(template)).rejects.toThrow('revoked')
    cleanup.resolve(undefined)
    await logout
    expect(extension.signEvent).not.toHaveBeenCalled()
  })

  it('rejects an extension account change before requesting a signature', async () => {
    const selected = session('nip07')
    mocks.login.mockResolvedValue(selected)
    Object.assign(window, { nostr: { getPublicKey: vi.fn(async () => getPublicKey(OTHER)) } })
    const access = await import('../src/web/nostr-access')
    await access.connectNostrAccess({ appName: 'Arcade', relays: [] })
    await expect(access.currentNostrSigner()!.signEvent(template)).rejects.toThrow('account changed')
    expect(selected.signer.signEvent).not.toHaveBeenCalled()
  })

  it('rejects valid signatures by a different key and changed templates', async () => {
    const selected = session()
    mocks.login.mockResolvedValue(selected)
    const access = await import('../src/web/nostr-access')
    await access.connectNostrAccess({ appName: 'Arcade', relays: [] })
    selected.signer.signEvent.mockImplementation(async event => finalizeEvent(event, OTHER))
    await expect(access.currentNostrSigner()!.signEvent(template)).rejects.toThrow('different account or request')
    await access.connectNostrAccess({ appName: 'Arcade', relays: [] })
    selected.signer.signEvent.mockImplementation(async event => finalizeEvent({ ...event, content: 'changed' }, SECRET))
    await expect(access.currentNostrSigner()!.signEvent(template)).rejects.toThrow('different account or request')
  })

  it('does not return an in-flight signature after logout or same-key re-login', async () => {
    const selected = session()
    const pending = deferred<ReturnType<typeof finalizeEvent>>()
    selected.signer.signEvent.mockReturnValue(pending.promise)
    mocks.login.mockResolvedValue(selected)
    const access = await import('../src/web/nostr-access')
    await access.connectNostrAccess({ appName: 'Arcade', relays: [] })
    const signed = access.currentNostrSigner()!.signEvent(template)
    await access.disconnectNostrAccess()
    mocks.login.mockResolvedValue(session())
    await access.connectNostrAccess({ appName: 'Arcade', relays: [] })
    pending.resolve(finalizeEvent(template, SECRET))
    await expect(signed).rejects.toThrow('revoked')
  })

  it('closes late login results instead of reactivating after logout', async () => {
    const pending = deferred<ReturnType<typeof session>>()
    mocks.login.mockReturnValue(pending.promise)
    const access = await import('../src/web/nostr-access')
    const login = access.connectNostrAccess({ appName: 'Arcade', relays: [] })
    await vi.waitFor(() => expect(mocks.login).toHaveBeenCalled())
    await access.disconnectNostrAccess()
    const late = session()
    pending.resolve(late)
    expect(await login).toBeNull()
    expect(late.signer.close).toHaveBeenCalled()
    expect(access.currentNostrSigner()).toBeUndefined()
  })

  it('consumes an incoming callback without a stored identity before attempting restore', async () => {
    window.history.replaceState(null, '', '/scores?signet_amber=1&event=test')
    mocks.handleRedirectCallback.mockResolvedValue({ kind: 'session', session: session() })
    const access = await import('../src/web/nostr-access')
    expect(await access.restoreNostrAccess([])).toMatchObject({ pubkey: PUBKEY })
    expect(mocks.handleRedirectCallback).toHaveBeenCalled()
    expect(mocks.restoreSession).not.toHaveBeenCalled()
  })

  it('rejects a late restore result and preserves anonymous visits without SDK work', async () => {
    const access = await import('../src/web/nostr-access')
    expect(await access.restoreNostrAccess([])).toBeNull()
    expect(mocks.handleRedirectCallback).not.toHaveBeenCalled()
    localStorage.setItem('signet:login.pubkey', PUBKEY)
    const pending = deferred<ReturnType<typeof session>>()
    mocks.restoreSession.mockReturnValue(pending.promise)
    const restoring = access.restoreNostrAccess([])
    await vi.waitFor(() => expect(mocks.restoreSession).toHaveBeenCalled())
    await access.disconnectNostrAccess()
    const late = session()
    pending.resolve(late)
    expect(await restoring).toBeNull()
    expect(late.signer.close).toHaveBeenCalled()
  })
})
