import { verifyEvent } from 'nostr-tools/pure'
import type { NostrEvent } from 'signet-login'
import type { ArcadeNostrSigner } from './nostr-access'
import { readSocialState, type SocialState } from './social-state'

export const ARCADE_PREFERENCES_KIND = 30078
export const ARCADE_PREFERENCES_TAG = 'gamestr:preferences:v1'

export function preferenceState(event: NostrEvent, pubkey: string): SocialState | undefined {
  if (event.pubkey !== pubkey || event.kind !== ARCADE_PREFERENCES_KIND || event.content.length > 32_768
    || event.tags.filter(tag => tag[0] === 'd').length !== 1 || event.tags.find(tag => tag[0] === 'd')?.[1] !== ARCADE_PREFERENCES_TAG
    || !Number.isSafeInteger(event.created_at) || event.created_at > Math.floor(Date.now() / 1000) + 600 || !verifyEvent(event)) return
  try {
    const content = JSON.parse(event.content)
    if (!content || typeof content !== 'object' || !Array.isArray(content.favourites) || !Array.isArray(content.follows)) return
    return readSocialState({ getItem: () => event.content, setItem() {} })
  } catch { return }
}

export function mergePreferences(local: SocialState, remote: SocialState): SocialState {
  return { favourites: [...new Set([...local.favourites, ...remote.favourites])].slice(0, 250), follows: [...new Set([...local.follows, ...remote.follows])].slice(0, 250) }
}

export async function loadRemotePreferences(pubkey: string, relays: string[], timeoutMs = 8_000): Promise<SocialState> {
  const results = await Promise.all([...new Set(relays)].slice(0, 6).map(url => new Promise<NostrEvent | undefined>(resolve => {
    let socket: WebSocket | undefined
    let best: NostrEvent | undefined
    let settled = false
    const id = `preferences-${crypto.randomUUID()}`
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); try { socket?.close() } catch {}; resolve(best) }
    const timer = setTimeout(finish, timeoutMs)
    try {
      if (!url.startsWith('wss://')) { finish(); return }
      socket = new WebSocket(url)
      socket.onopen = () => socket!.send(JSON.stringify(['REQ', id, { authors: [pubkey], kinds: [ARCADE_PREFERENCES_KIND], '#d': [ARCADE_PREFERENCES_TAG], limit: 1 }]))
      socket.onmessage = message => {
        try {
          const data = JSON.parse(typeof message.data === 'string' ? message.data : '')
          if (!Array.isArray(data) || data[1] !== id) return
          if (data[0] === 'EOSE') { finish(); return }
          if (data[0] === 'EVENT' && preferenceState(data[2], pubkey) && (!best || data[2].created_at > best.created_at)) best = data[2]
        } catch { /* ignore untrusted relay payload */ }
      }
      socket.onerror = finish; socket.onclose = finish
    } catch { finish() }
  })))
  const latest = results.filter((event): event is NostrEvent => !!event).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0]
  return latest ? preferenceState(latest, pubkey)! : { favourites: [], follows: [] }
}

export async function publishPreferences(state: SocialState, pubkey: string, signer: ArcadeNostrSigner, relays: string[], stillApproved: () => boolean = () => true): Promise<number> {
  if (!stillApproved()) return 0
  const signed = await signer.signEvent({ kind: ARCADE_PREFERENCES_KIND, created_at: Math.floor(Date.now() / 1000), tags: [['d', ARCADE_PREFERENCES_TAG]], content: JSON.stringify(state) })
  if (!preferenceState(signed, pubkey)) throw new Error('Invalid preference signature.')
  if (!stillApproved()) return 0
  const results = await Promise.all([...new Set(relays)].filter(url => url.startsWith('wss://')).slice(0, 6).map(url => new Promise<boolean>(resolve => {
    let socket: WebSocket | undefined
    let settled = false
    const finish = (ok = false) => { if (settled) return; settled = true; clearTimeout(timer); try { socket?.close() } catch {}; resolve(ok) }
    const timer = setTimeout(() => finish(), 8_000)
    try {
      socket = new WebSocket(url)
      socket.onopen = () => { if (!stillApproved()) { finish(); return }; socket!.send(JSON.stringify(['EVENT', signed])) }
      socket.onmessage = message => { try { const data = JSON.parse(typeof message.data === 'string' ? message.data : ''); if (Array.isArray(data) && data[0] === 'OK' && data[1] === signed.id) finish(data[2] === true) } catch {} }
      socket.onerror = () => finish(); socket.onclose = () => finish()
    } catch { finish() }
  })))
  return results.filter(Boolean).length
}
