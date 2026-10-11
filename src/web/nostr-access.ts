import { verifyEvent } from 'nostr-tools/pure'
import { startAndroidSignerLogin } from './android-signer'
import { pickLoginMethod } from './login-method-picker'
import { revokeNostrGameBridges } from './game-auth-handoff'
import type { LoginPickerMethod, NostrEvent, SignetSession, SignetStorage } from 'signet-login'

export const NOSTR_SESSION_EVENT = 'gamestr:nostr-session'
// Authentication needs a reachable rendezvous regardless of score-feed settings.
export const NOSTR_AUTH_RELAY = 'wss://relay.trotters.cc'

export interface ArcadeNostrSigner {
  signEvent(event: { created_at: number; kind: number; tags: string[][]; content: string }): Promise<NostrEvent>
}

interface Nip07Window extends Window {
  nostr?: {
    getPublicKey(): Promise<string>
    signEvent(event: { created_at: number; kind: number; tags: string[][]; content: string }): Promise<NostrEvent>
  }
}

export interface NostrAccess {
  pubkey: string
  method: SignetSession['method']
  canSignEvents: boolean
  signerStatus: 'connected' | 'identity-only' | 'unavailable'
}

export interface NostrGameSessionProof {
  pubkey: string
  canSignEvents: boolean
  authEvent: NostrEvent
}

export interface ConnectNostrOptions {
  appName: string
  relays: string[]
  signingRequired?: boolean
}

let activeSession: SignetSession | null = null
let generation = 0
let signerUnavailable = false

export const NOSTR_SIGN_TIMEOUT_MS = 45_000

async function boundedSigning<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Signer did not respond. Wake your signer and reconnect; pairing credentials were retained.')), NOSTR_SIGN_TIMEOUT_MS) })])
  } finally { clearTimeout(timer) }
}

function sessionStorageFor(epoch: number): { storage: SignetStorage; commit(): void } {
  const staged = new Map<string, string | null>()
  let committed = false
  const sessionKeys = new Set(['pubkey', 'method', 'authEvent', 'bunkerUri', 'bunkerClientSk', 'expiresAt', 'displayName'].map(key => `signet:login.${key}`))
  const write = (key: string, value: string | null) => {
    if (generation !== epoch) return
    if (!committed && sessionKeys.has(key)) { staged.set(key, value); return }
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* session stays usable in memory */ }
  }
  return {
    storage: {
      getItem(key) { try { return staged.has(key) ? staged.get(key)! : localStorage.getItem(key) } catch { return null } },
      setItem: (key, value) => write(key, value),
      removeItem: key => write(key, null),
    },
    commit() {
      committed = true
      for (const [key, value] of staged) write(key, value)
      staged.clear()
    },
  }
}

function closeSession(session: SignetSession | null): void {
  if (session) void Promise.resolve(session.signer.close()).catch(() => {})
}

function accessFor(session: SignetSession): NostrAccess {
  return {
    pubkey: session.pubkey,
    method: session.method,
    canSignEvents: session.signer.capabilities.canSignEvents && !signerUnavailable,
    signerStatus: signerUnavailable ? 'unavailable' : session.signer.capabilities.canSignEvents ? 'connected' : 'identity-only',
  }
}

function activate(session: SignetSession): NostrAccess {
  revokeNostrGameBridges()
  if (activeSession !== session) closeSession(activeSession)
  activeSession = session
  signerUnavailable = false
  const access = accessFor(session)
  window.dispatchEvent(new CustomEvent<NostrAccess>(NOSTR_SESSION_EVENT, { detail: access }))
  return access
}

/** A signer is a capability of one selected session, never ambient extension access. */
export function currentNostrSigner(): ArcadeNostrSigner | undefined {
  const session = activeSession
  const epoch = generation
  if (!session?.signer.capabilities.canSignEvents || signerUnavailable) return undefined
  return {
    async signEvent(template) {
      const expected = structuredClone(template)
      const assertActive = () => {
        if (signerUnavailable) throw new Error('Signer unavailable. Reconnect the selected account to sign.')
        if (generation !== epoch || activeSession !== session) throw new Error('Nostr session revoked. Connect again to sign.')
      }
      assertActive()
      try {
        return await boundedSigning(async () => {
        if (session.method === 'nip07') {
          const extension = (window as Nip07Window).nostr
          if (!extension || await extension.getPublicKey() !== session.pubkey) {
            throw new Error('Your extension account changed. Connect the selected account again.')
          }
          assertActive()
        }
        const signed = await session.signer.signEvent(structuredClone(expected))
        assertActive()
        if (signed.pubkey !== session.pubkey || !verifyEvent({ id: signed.id, pubkey: signed.pubkey, sig: signed.sig, kind: signed.kind, created_at: signed.created_at, content: signed.content, tags: signed.tags })
          || signed.kind !== expected.kind || signed.created_at !== expected.created_at
          || signed.content !== expected.content || JSON.stringify(signed.tags) !== JSON.stringify(expected.tags)) {
          throw new Error('The signer returned an event for a different account or request.')
        }
        return signed
        })
      } catch (error) {
        // The SDK can fail before our outer deadline. Approval denial does not
        // mean the connection is unavailable, so recognise transport errors only.
        const sdkUnavailable = session.method === 'bunker' && error instanceof Error
          && (/^(nip46-sign_event-timeout|bunker-closed|bunker-connect-timeout)$/.test(error.message)
            || error.message === 'this signer is not open anymore, create a new one'
            || error.message.startsWith('signer-auth-only:'))
        if (generation === epoch && activeSession === session && error instanceof Error
          && (sdkUnavailable || /did not respond|account changed|different account or request/.test(error.message))) {
          signerUnavailable = true
          revokeNostrGameBridges()
          window.dispatchEvent(new CustomEvent<NostrAccess>(NOSTR_SESSION_EVENT, { detail: accessFor(session) }))
          if (sdkUnavailable) throw new Error('Signer unavailable. Wake your signer and reconnect; pairing credentials were retained.', { cause: error })
        }
        throw error
      }
    },
  }
}

export function currentNostrAccess(): NostrAccess | undefined { return activeSession ? accessFor(activeSession) : undefined }

export function currentNostrGameSession(): NostrGameSessionProof | undefined {
  if (!activeSession) return undefined
  return {
    pubkey: activeSession.pubkey,
    canSignEvents: activeSession.signer.capabilities.canSignEvents && !signerUnavailable,
    authEvent: activeSession.authEvent,
  }
}

export async function connectNostrAccess(options: ConnectNostrOptions): Promise<NostrAccess | null> {
  const epoch = ++generation
  const expectedPubkey = options.signingRequired ? activeSession?.pubkey : undefined
  const persistence = sessionStorageFor(epoch)
  revokeNostrGameBridges()
  const method = await pickLoginMethod(options.signingRequired)
  if (!method || generation !== epoch) return null
  if (method === 'android-signer') return startAndroidSignerLogin(options.appName, persistence.storage)
  const methods: LoginPickerMethod[] = ['local-signet', 'remote-signet', 'nip07', 'nostrconnect', 'bunker']
  const { login } = await import('signet-login')
  const session = await login({
    appName: options.appName,
    storage: persistence.storage,
    methods,
    preferredMethod: method,
    advancedMethods: options.signingRequired ? [] : ['nostrconnect', 'bunker'],
    relayUrl: NOSTR_AUTH_RELAY,
    timeout: 60_000,
    // NIP-55 markers belong only to the Android signer flow. The SDK checks
    // those first and would reject a My Signet URL return as a missing event.
    redirectCallback: window.location.href,
    nostrConnectPerms: ['sign_event'],
    theme: document.documentElement.dataset.webEdition === '600' ? 'light' : 'dark',
  })
  if (!session) return null
  if (generation !== epoch || (expectedPubkey && session.pubkey !== expectedPubkey)) {
    closeSession(session)
    if (generation === epoch) throw new Error('Connect the same Nostr account to enable signing.')
    return null
  }
  persistence.commit()
  return activate(session)
}

export async function restoreNostrAccess(_relays: string[]): Promise<NostrAccess | null> {
  const epoch = ++generation
  const persistence = sessionStorageFor(epoch)
  try {
    const params = new URL(window.location.href).searchParams
    const callback = ['signet_amber', 'event', 'pubkey', 'signature', 'eventId', 'error'].some(key => params.has(key))
    // Anonymous visits still avoid downloading the SDK unless a callback is present.
    if (!callback && !persistence.storage.getItem('signet:login.pubkey') && !persistence.storage.getItem('signet:login.pendingRelayAuth')) return null
    const { handleRedirectCallback, restoreSession } = await import('signet-login')
    const result = await handleRedirectCallback({ storage: persistence.storage })
    if (generation !== epoch) {
      if (result.kind === 'session') closeSession(result.session)
      return null
    }
    if (result.kind === 'denied' || result.kind === 'invalid') {
      throw new Error(result.kind === 'denied' ? 'Nostr login was declined.' : 'Nostr login callback expired or failed validation. Please connect again.')
    }
    if (result.kind !== 'session' && persistence.storage.getItem('signet:login.method') === 'bunker') {
      // Recognised identity must remain available while the remote signer is
      // asleep. Let the SDK restore its auth-only session without relay work,
      // then reconnect in the background. Explicit reconnect/logout supersedes
      // that operation and closes its late result.
      const identity = await restoreSession({ storage: persistence.storage, reconnectBunker: false })
      if (!identity) return null
      if (generation !== epoch) { closeSession(identity); return null }
      persistence.commit()
      const access = activate(identity)
      void restoreSession({ storage: persistence.storage }).then(session => {
        if (!session) return
        if (generation !== epoch || activeSession !== identity || session.pubkey !== identity.pubkey
          || session.signer.pubkey !== identity.pubkey) { closeSession(session); return }
        activate(session)
      }).catch(() => { /* recognised account and pairing remain available for explicit reconnect */ })
      return access
    }
    const session = result.kind === 'session' ? result.session : await restoreSession({ storage: persistence.storage })
    if (!session) return null
    if (generation !== epoch) { closeSession(session); return null }
    persistence.commit()
    return activate(session)
  } catch (error) {
    if (generation === epoch) window.dispatchEvent(new CustomEvent('gamestr:nostr-error', { detail: error instanceof Error ? error.message : 'Nostr session could not be restored.' }))
    return null
  }
}

export async function disconnectNostrAccess(): Promise<void> {
  const session = activeSession
  const epoch = ++generation
  activeSession = null
  revokeNostrGameBridges()
  window.dispatchEvent(new CustomEvent(NOSTR_SESSION_EVENT, { detail: null }))
  const persistence = sessionStorageFor(epoch)
  persistence.commit()
  // A refresh during SDK cleanup must not restore the account or a pending login.
  for (const key of ['pubkey', 'method', 'authEvent', 'bunkerUri', 'bunkerClientSk', 'expiresAt', 'displayName', 'pendingRedirect', 'pendingRelayAuth']) persistence.storage.removeItem(`signet:login.${key}`)
  const { logout } = await import('signet-login')
  await logout(session ?? undefined, { storage: persistence.storage })
}
