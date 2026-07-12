import type { ArcadeConfig, Game } from '../shared/types'

const MAX_NOSTR_CONTENT_CHARS = 64 * 1024
const MAX_NOSTR_TAGS = 64
const MAX_NOSTR_TAG_PARTS = 16
const MAX_NOSTR_TAG_PART_CHARS = 2_048
const MAX_NOSTR_CLOCK_SKEW_SEC = 10 * 60

export interface WebSessionGrants {
  nostrSign: boolean
  walletPay: boolean
}

export interface GuestNostrEventTemplate {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/** Return HTTPS origins plus HTTP only for the cabinet's loopback mirror. */
export function normaliseWebOrigin(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * The launch origin is always admitted. Additional declared origins are grants
 * only when the manifest explicitly enables external navigation.
 */
export function allowedOriginsForGame(game: Pick<Game, 'url' | 'allowedOrigins' | 'capabilities'>): Set<string> {
  const allowed = new Set<string>()
  if (game.url) {
    const launchOrigin = normaliseWebOrigin(game.url)
    if (launchOrigin) allowed.add(launchOrigin)
  }
  if (game.capabilities?.externalNavigation) {
    for (const raw of game.allowedOrigins ?? []) {
      const origin = normaliseWebOrigin(raw)
      if (origin) allowed.add(origin)
    }
  }
  return allowed
}

export function isAllowedWebNavigation(rawUrl: string, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = normaliseWebOrigin(rawUrl)
  return origin !== null && allowedOrigins.has(origin)
}

/** Capabilities are fail-closed and wallet availability is decided in main. */
export function grantsForGame(game: Pick<Game, 'capabilities'>, walletConfigured: boolean): WebSessionGrants {
  return {
    nostrSign: game.capabilities?.nostrSign === true,
    walletPay: walletConfigured && game.capabilities?.walletPay === true,
  }
}

/** Strip the wallet connection object before config crosses into the shell. */
export function publicArcadeConfig(config: ArcadeConfig): ArcadeConfig {
  const { webln: _walletSecret, ...safe } = config
  return safe
}

/** Strictly bound the shape/size/time of events an ephemeral guest key may sign. */
export function parseGuestNostrTemplate(
  raw: unknown,
  nowSec = Math.floor(Date.now() / 1000),
): GuestNostrEventTemplate | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const event = raw as Record<string, unknown>
  if (!Number.isSafeInteger(event.kind) || (event.kind as number) < 0 || (event.kind as number) > 65_535) {
    return null
  }
  const createdAt = event.created_at === undefined ? nowSec : event.created_at
  if (!Number.isSafeInteger(createdAt)
    || (createdAt as number) < nowSec - MAX_NOSTR_CLOCK_SKEW_SEC
    || (createdAt as number) > nowSec + MAX_NOSTR_CLOCK_SKEW_SEC) {
    return null
  }
  const content = event.content === undefined ? '' : event.content
  if (typeof content !== 'string' || content.length > MAX_NOSTR_CONTENT_CHARS) return null
  const tags = event.tags === undefined ? [] : event.tags
  if (!Array.isArray(tags) || tags.length > MAX_NOSTR_TAGS) return null
  if (!tags.every(tag => Array.isArray(tag)
    && tag.length <= MAX_NOSTR_TAG_PARTS
    && tag.every(part => typeof part === 'string' && part.length <= MAX_NOSTR_TAG_PART_CHARS))) {
    return null
  }
  return {
    kind: event.kind as number,
    created_at: createdAt as number,
    tags: tags as string[][],
    content,
  }
}
