import { verifyEvent } from 'nostr-tools/pure'
import type { NostrEvent } from 'signet-login'

export const GAME_AUTH_FRAGMENT = 'gamestr-auth'
export const GAME_AUTH_PROTOCOL = 'gamestr-auth-v1'
export const GAME_AUTH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

interface HandoffProfile {
  name?: string
  nip05?: string
  picture?: string
}

export interface NostrGameSessionProof {
  pubkey: string
  canSignEvents: boolean
  authEvent: NostrEvent
}

export interface NostrGameLaunch {
  url: string
  channel: string
  targetOrigin: string
  pubkey: string
}

interface HandoffPayload {
  v: 1
  game: string
  target: string
  channel: string
  canSign: boolean
  profile?: HandoffProfile
  event: NostrEvent
}

interface PendingLaunch {
  child: Window
  targetOrigin: string
  pubkey: string
  expires: number
}

interface SigningTemplate {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

interface ArcadeSigner {
  signEvent(event: SigningTemplate): Promise<NostrEvent>
}

const launches = new Map<string, PendingLaunch>()
let bridgeInstalled = false

function eventTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(tag => tag[0] === name)?.[1]
}

function cleanProfile(profile: HandoffProfile | undefined): HandoffProfile | undefined {
  if (!profile) return undefined
  const name = typeof profile.name === 'string' ? profile.name.trim().slice(0, 80) : undefined
  const nip05 = typeof profile.nip05 === 'string' ? profile.nip05.trim().toLowerCase().slice(0, 254) : undefined
  let picture: string | undefined
  if (typeof profile.picture === 'string' && profile.picture.length <= 2_000) {
    try {
      const url = new URL(profile.picture)
      if (url.protocol === 'https:' || url.protocol === 'http:') picture = url.toString()
    } catch { /* ignore malformed profile images */ }
  }
  return name || nip05 || picture ? { name: name || undefined, nip05: nip05 || undefined, picture } : undefined
}

function encodeBase64Url(value: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeNostrGameHandoffToken(token: string): HandoffPayload | null {
  if (!/^[A-Za-z0-9_-]{1,12000}$/.test(token)) return null
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - token.length % 4) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    const value = JSON.parse(new TextDecoder().decode(bytes)) as HandoffPayload
    return value
  } catch {
    return null
  }
}

export function createNostrGameLaunch(options: {
  gameId: string
  targetUrl: string
  sourceOrigin: string
  sourceApp: string
  session: NostrGameSessionProof
  profile?: HandoffProfile
  nowSeconds?: number
  channel?: string
}): NostrGameLaunch | null {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const event = options.session.authEvent
  if (event.pubkey !== options.session.pubkey || event.kind !== 21236 || !verifyEvent(event)) return null
  if (eventTag(event, 'origin') !== options.sourceOrigin || eventTag(event, 'app') !== options.sourceApp) return null
  if (event.created_at > now + 300 || event.created_at < now - GAME_AUTH_MAX_AGE_SECONDS) return null

  let target: URL
  try {
    target = new URL(options.targetUrl)
  } catch {
    return null
  }
  if (target.protocol !== 'https:' && target.hostname !== '127.0.0.1' && target.hostname !== 'localhost') return null

  const channel = options.channel ?? crypto.randomUUID()
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(channel)) return null
  const payload: HandoffPayload = {
    v: 1,
    game: options.gameId,
    target: target.origin,
    channel,
    canSign: options.session.canSignEvents,
    profile: cleanProfile(options.profile),
    event,
  }
  const fragment = new URLSearchParams(target.hash.slice(1))
  fragment.set(GAME_AUTH_FRAGMENT, encodeBase64Url(JSON.stringify(payload)))
  target.hash = fragment.toString()
  return { url: target.toString(), channel, targetOrigin: target.origin, pubkey: event.pubkey }
}

export function validGameSigningTemplate(value: unknown): value is SigningTemplate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const template = value as Partial<SigningTemplate>
  if (!Number.isSafeInteger(template.kind) || template.kind! < 0 || template.kind! > 65_535) return false
  if (!Number.isSafeInteger(template.created_at) || template.created_at! < 0) return false
  if (typeof template.content !== 'string' || template.content.length > 256_000) return false
  if (!Array.isArray(template.tags) || template.tags.length > 256) return false
  return template.tags.every(tag => Array.isArray(tag)
    && tag.length > 0
    && tag.length <= 16
    && tag.every(item => typeof item === 'string' && item.length <= 4_096))
}

export function installNostrGameBridge(getSigner: () => ArcadeSigner | undefined): void {
  if (bridgeInstalled) return
  bridgeInstalled = true
  window.addEventListener('message', event => {
    const data = event.data as { protocol?: unknown; type?: unknown; channel?: unknown }
    if (data?.protocol !== GAME_AUTH_PROTOCOL || data.type !== 'connect' || typeof data.channel !== 'string') return
    const pending = launches.get(data.channel)
    const port = event.ports[0]
    if (!pending || !port || pending.expires < Date.now()) return
    if (event.origin !== pending.targetOrigin || event.source !== pending.child) return
    launches.delete(data.channel)
    port.onmessage = async message => {
      const request = message.data as { protocol?: unknown; type?: unknown; id?: unknown; event?: unknown }
      if (request?.protocol !== GAME_AUTH_PROTOCOL || request.type !== 'sign' || typeof request.id !== 'string') return
      if (!validGameSigningTemplate(request.event)) {
        port.postMessage({ protocol: GAME_AUTH_PROTOCOL, type: 'result', id: request.id, ok: false, error: 'invalid-event-template' })
        return
      }
      const signer = getSigner()
      if (!signer) {
        port.postMessage({ protocol: GAME_AUTH_PROTOCOL, type: 'result', id: request.id, ok: false, error: 'signer-unavailable' })
        return
      }
      try {
        const signed = await signer.signEvent(request.event)
        if (signed.pubkey !== pending.pubkey || !verifyEvent(signed)) throw new Error('invalid-signed-event')
        if (signed.kind !== request.event.kind
          || signed.created_at !== request.event.created_at
          || signed.content !== request.event.content
          || JSON.stringify(signed.tags) !== JSON.stringify(request.event.tags)) {
          throw new Error('signed-event-template-mismatch')
        }
        port.postMessage({ protocol: GAME_AUTH_PROTOCOL, type: 'result', id: request.id, ok: true, event: signed })
      } catch (error) {
        port.postMessage({
          protocol: GAME_AUTH_PROTOCOL,
          type: 'result',
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message.slice(0, 160) : 'signing-failed',
        })
      }
    }
    port.start()
    port.postMessage({ protocol: GAME_AUTH_PROTOCOL, type: 'connected' })
  })
}

export function openNostrGame(launch: NostrGameLaunch): void {
  const child = window.open('', '_blank')
  if (!child) {
    window.location.assign(launch.url)
    return
  }
  launches.set(launch.channel, {
    child,
    targetOrigin: launch.targetOrigin,
    pubkey: launch.pubkey,
    expires: Date.now() + 60_000,
  })
  window.setTimeout(() => launches.delete(launch.channel), 60_000)
  child.location.replace(launch.url)
}
