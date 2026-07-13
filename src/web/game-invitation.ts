import { verifyEvent } from 'nostr-tools/pure'

// Application-local ephemeral envelope. Invitation events are embedded in links and never published to relays.
export const GAME_INVITE_KIND = 23033
export const MAX_INVITE_AGE_SECONDS = 7 * 24 * 60 * 60

export interface GameInvitationEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface GameInvitation {
  event: GameInvitationEvent
  gameId: string
  gameUrl: string
  expiresAt: number
}

export function invitationTemplate(gameId: string, gameUrl: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  return {
    kind: GAME_INVITE_KIND,
    created_at: nowSeconds,
    tags: [
      ['game', gameId],
      ['r', gameUrl],
      ['expiration', String(nowSeconds + MAX_INVITE_AGE_SECONDS)],
      ['t', 'gamestr-invite'],
      ['alt', `Invitation to play ${gameId} on Gamestr`],
    ],
    content: '',
  }
}

function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find(tag => tag[0] === name)?.[1]
}

export function parseInvitation(event: GameInvitationEvent, nowSeconds = Math.floor(Date.now() / 1000)): GameInvitation | undefined {
  if (event.kind !== GAME_INVITE_KIND || !verifyEvent(event) || event.content !== '') return
  const gameId = tagValue(event.tags, 'game')
  const gameUrl = tagValue(event.tags, 'r')
  const expiresAt = Number(tagValue(event.tags, 'expiration'))
  if (!gameId || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(gameId)) return
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > event.created_at + MAX_INVITE_AGE_SECONDS) return
  try {
    const url = new URL(gameUrl ?? '')
    if (url.protocol !== 'https:' || url.username || url.password) return
  } catch { return }
  return { event, gameId, gameUrl: gameUrl!, expiresAt }
}

export function encodeInvitation(event: GameInvitationEvent): string {
  const bytes = new TextEncoder().encode(JSON.stringify(event))
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeInvitation(encoded: string): GameInvitationEvent | undefined {
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) return
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    const value = JSON.parse(new TextDecoder().decode(bytes)) as GameInvitationEvent
    return value && typeof value === 'object' ? value : undefined
  } catch { return }
}
