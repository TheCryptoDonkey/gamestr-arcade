import { verifyEvent } from 'nostr-tools/pure'

// Application-local ephemeral envelope. Challenges travel in links and are never sent to relays.
export const GAME_CHALLENGE_KIND = 23034
export const MAX_CHALLENGE_SECONDS = 7 * 24 * 60 * 60

export interface GameChallengeEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface GameChallenge {
  event: GameChallengeEvent
  name: string
  gameId: string
  gameUrl: string
  startsAt: number
  endsAt: number
}

function signatureIsValid(event: GameChallengeEvent): boolean {
  return verifyEvent({ id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags, content: event.content, sig: event.sig })
}

export function challengeTemplate(gameId: string, gameUrl: string, name: string, durationSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)) {
  const cleanName = name.trim().replace(/\s+/g, ' ')
  if (!cleanName || cleanName.length > 60 || /[\u0000-\u001f\u007f]/.test(cleanName)) throw new Error('Challenge name must be 1–60 printable characters.')
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 15 * 60 || durationSeconds > MAX_CHALLENGE_SECONDS) throw new Error('Challenge duration is outside the supported range.')
  return {
    kind: GAME_CHALLENGE_KIND,
    created_at: nowSeconds,
    tags: [
      ['game', gameId],
      ['r', gameUrl],
      ['start', String(nowSeconds)],
      ['end', String(nowSeconds + durationSeconds)],
      ['t', 'gamestr-challenge'],
      ['alt', `Gamestr challenge: ${cleanName}`],
    ],
    content: JSON.stringify({ name: cleanName }),
  }
}

function tagValue(tags: string[][], name: string): string | undefined { return tags.find(tag => tag[0] === name)?.[1] }

export function parseChallenge(event: GameChallengeEvent, nowSeconds = Math.floor(Date.now() / 1000)): GameChallenge | undefined {
  if (event.kind !== GAME_CHALLENGE_KIND || !signatureIsValid(event)) return
  const gameId = tagValue(event.tags, 'game')
  const gameUrl = tagValue(event.tags, 'r')
  const startsAt = Number(tagValue(event.tags, 'start'))
  const endsAt = Number(tagValue(event.tags, 'end'))
  let name: unknown
  try { name = (JSON.parse(event.content) as { name?: unknown }).name } catch { return }
  if (!gameId || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(gameId) || typeof name !== 'string' || !name.trim() || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) return
  if (!Number.isSafeInteger(startsAt) || !Number.isSafeInteger(endsAt) || startsAt !== event.created_at || endsAt <= startsAt || endsAt > startsAt + MAX_CHALLENGE_SECONDS) return
  if (nowSeconds > endsAt + MAX_CHALLENGE_SECONDS) return
  try {
    const url = new URL(gameUrl ?? '')
    if (url.protocol !== 'https:' || url.username || url.password) return
  } catch { return }
  return { event, name: name.trim(), gameId, gameUrl: gameUrl!, startsAt, endsAt }
}

export function encodeChallenge(event: GameChallengeEvent): string {
  return BufferlessBase64.encode(JSON.stringify(event))
}

export function decodeChallenge(encoded: string): GameChallengeEvent | undefined {
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) return
  try { return JSON.parse(BufferlessBase64.decode(encoded)) as GameChallengeEvent } catch { return }
}

const BufferlessBase64 = {
  encode(value: string): string {
    const bytes = new TextEncoder().encode(value); let binary = ''
    bytes.forEach(byte => { binary += String.fromCharCode(byte) })
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(value: string): string {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)))
  },
}
