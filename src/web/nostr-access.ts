import type { LoginPickerMethod, NostrEvent, SignetSession } from 'signet-login'

export const NOSTR_SESSION_EVENT = 'gamestr:nostr-session'

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
}

export interface ConnectNostrOptions {
  appName: string
  relays: string[]
  signingRequired?: boolean
}

let activeSession: SignetSession | null = null

function accessFor(session: SignetSession): NostrAccess {
  return {
    pubkey: session.pubkey,
    method: session.method,
    canSignEvents: session.signer.capabilities.canSignEvents,
  }
}

function activate(session: SignetSession): NostrAccess {
  activeSession = session
  const access = accessFor(session)
  window.dispatchEvent(new CustomEvent<NostrAccess>(NOSTR_SESSION_EVENT, { detail: access }))
  return access
}

function preferredRelay(relays: string[]): string {
  return relays.find(relay => relay === 'wss://relay.damus.io') ?? relays[0] ?? 'wss://relay.damus.io'
}

/** The selected Signet signer wins; a raw extension is only a pre-login fallback. */
export function currentNostrSigner(): ArcadeNostrSigner | undefined {
  if (activeSession) return activeSession.signer.capabilities.canSignEvents ? activeSession.signer : undefined
  return (window as Nip07Window).nostr
}

export async function connectNostrAccess(options: ConnectNostrOptions): Promise<NostrAccess | null> {
  const methods: LoginPickerMethod[] = options.signingRequired
    ? ['nip07', 'nostrconnect', 'bunker']
    : ['local-signet', 'remote-signet', 'nip07', 'amber', 'nostrconnect', 'bunker']
  const { login } = await import('signet-login')
  const session = await login({
    appName: options.appName,
    methods,
    advancedMethods: options.signingRequired ? [] : ['nostrconnect', 'bunker'],
    relayUrl: preferredRelay(options.relays),
    relayUrls: options.relays,
    nostrConnectPerms: ['sign_event'],
    theme: document.documentElement.dataset.webEdition === '600' ? 'light' : 'dark',
  })
  return session ? activate(session) : null
}

export async function restoreNostrAccess(relays: string[]): Promise<NostrAccess | null> {
  try {
    // Keep the sizeable QR/NIP-46 SDK off the wire for anonymous first-time visitors.
    if (!localStorage.getItem('signet:login.pubkey')) return null
    const { restoreSession } = await import('signet-login')
    const session = await restoreSession({ defaultRelay: preferredRelay(relays) })
    return session ? activate(session) : null
  } catch {
    return null
  }
}

export async function disconnectNostrAccess(): Promise<void> {
  const { logout } = await import('signet-login')
  const session = activeSession
  await logout(session ?? undefined)
  activeSession = null
}
