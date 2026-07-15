import type { LeaderboardEntry } from '../../../shared/types'

export interface ScoreEvent {
  id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][]; sig: string
}

export type SupportedScoreKind = 30762 | 5555

export interface ParsedAnyScore {
  gameId: string
  entry: LeaderboardEntry
}

export type Period = 'today' | 'all'

const MIN_NOSTR_TIMESTAMP_SEC = 1_577_836_800 // 2020-01-01
const MAX_FUTURE_SKEW_SEC = 10 * 60
const MAX_EVENT_CONTENT_CHARS = 64 * 1024
const MAX_EVENT_TAGS = 64
const MAX_TAG_PARTS = 16
const MAX_TAG_PART_CHARS = 2_048

/** Reject impossible/poisoned relay timestamps while tolerating ordinary clock skew. */
export function isReasonableEventTimestamp(
  createdAt: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  return Number.isSafeInteger(createdAt)
    && createdAt >= MIN_NOSTR_TIMESTAMP_SEC
    && createdAt <= nowSec + MAX_FUTURE_SKEW_SEC
}

/**
 * Cheap structural validation performed before the more expensive Schnorr
 * verification at the WebSocket boundary.
 */
export function isScoreEvent(
  v: unknown,
  expectedKind?: SupportedScoreKind,
  nowSec = Math.floor(Date.now() / 1000),
): v is ScoreEvent {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  const kind = e.kind
  if (kind !== 30762 && kind !== 5555) return false
  if (expectedKind !== undefined && kind !== expectedKind) return false
  if (typeof e.id !== 'string' || !/^[0-9a-f]{64}$/.test(e.id)) return false
  if (typeof e.pubkey !== 'string' || !/^[0-9a-f]{64}$/.test(e.pubkey)) return false
  if (typeof e.sig !== 'string' || !/^[0-9a-f]{128}$/.test(e.sig)) return false
  if (typeof e.content !== 'string' || e.content.length > MAX_EVENT_CONTENT_CHARS) return false
  if (typeof e.created_at !== 'number' || !isReasonableEventTimestamp(e.created_at, nowSec)) return false
  if (!Array.isArray(e.tags) || e.tags.length > MAX_EVENT_TAGS) return false
  return e.tags.every(tag => Array.isArray(tag)
    && tag.length <= MAX_TAG_PARTS
    && tag.every(part => typeof part === 'string' && part.length <= MAX_TAG_PART_CHARS))
}

interface SingleTag {
  valid: boolean
  value?: string
}

/** Duplicate scalar tags are ambiguous and therefore rejected. */
function singleTagValue(tags: string[][], name: string): SingleTag {
  let value: string | undefined
  for (const tag of tags) {
    if (tag[0] !== name) continue
    if (typeof tag[1] !== 'string' || value !== undefined) return { valid: false }
    value = tag[1]
  }
  return { valid: true, value }
}

function hasTagValue(tags: string[][], name: string, value: string): boolean {
  return tags.some(t => t[0] === name && t[1] === value)
}

function parseNonNegativeInteger(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function parsePlayer(tags: string[][], fallback: string): string | null {
  const tagged = singleTagValue(tags, 'p')
  if (!tagged.valid) return null
  const pubkey = tagged.value ?? fallback
  return /^[0-9a-f]{64}$/i.test(pubkey) ? pubkey.toLowerCase() : null
}

function parseSats(tags: string[][]): number | null {
  const tagged = singleTagValue(tags, 'sats')
  if (!tagged.valid) return null
  return tagged.value === undefined ? 0 : parseNonNegativeInteger(tagged.value)
}

function parseGameId(tags: string[][]): string | null {
  const tagged = singleTagValue(tags, 'game')
  if (!tagged.valid || tagged.value === undefined) return null
  const gameId = tagged.value
  return gameId.length > 0 && gameId.length <= 256 && gameId.trim() === gameId ? gameId : null
}

function parseSignedLabel(tags: string[][], name: string, maxLength: number): string | undefined {
  const tagged = singleTagValue(tags, name)
  if (!tagged.valid || tagged.value === undefined) return
  const value = tagged.value.trim()
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) return
  return value
}

function parseSignedPlayerName(tags: string[][]): string | undefined {
  return parseSignedLabel(tags, 'playerName', 80) ?? parseSignedLabel(tags, 'player', 80)
}

function parseSignedNip05(tags: string[][]): string | undefined {
  const value = parseSignedLabel(tags, 'nip05', 254)?.toLowerCase()
  if (!value || !/^[a-z0-9._-]{1,64}@[a-z0-9.-]+$/.test(value)) return
  const [, domain] = value.split('@')
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return
  return value
}

function signedIdentity(tags: string[][]): Pick<LeaderboardEntry, 'signedName' | 'signedNip05'> {
  return {
    signedName: parseSignedPlayerName(tags),
    signedNip05: parseSignedNip05(tags),
  }
}

/** Extract the canonical game bucket from a structurally valid score event. */
export function scoreGameId(e: ScoreEvent): string | null {
  return isReasonableEventTimestamp(e.created_at) ? parseGameId(e.tags) : null
}

/** Port of pallasite/src/score.ts `consider`: game match, not cheated, score>0, player from `p` or pubkey. */
export function parseScoreEvent(e: ScoreEvent, gameId: string): LeaderboardEntry | null {
  if (e.kind !== 30762 || !isReasonableEventTimestamp(e.created_at)) return null
  if (parseGameId(e.tags) !== gameId) return null
  if (hasTagValue(e.tags, 'cheated', 'true')) return null
  const scoreTag = singleTagValue(e.tags, 'score')
  if (!scoreTag.valid) return null
  const score = parseNonNegativeInteger(scoreTag.value)
  if (score === null || score <= 0) return null
  const pubkey = parsePlayer(e.tags, e.pubkey)
  const sats = parseSats(e.tags)
  if (!pubkey || sats === null) return null
  return { eventId: e.id, pubkey, score, sats, at: e.created_at, ...signedIdentity(e.tags) }
}

/**
 * Parse a score event without a caller-supplied gameId - extracts the gameId
 * from the event's own `game` tag. Used by the catalogue's broad subscription.
 * Accepts score >= 0 (gamestr.io shows 0s on live boards; the per-game
 * parseScoreEvent retains score > 0 for backwards compatibility with existing tests).
 */
export function parseAnyScoreEvent(e: ScoreEvent): ParsedAnyScore | null {
  if (e.kind !== 30762 || !isReasonableEventTimestamp(e.created_at)) return null
  const gameId = parseGameId(e.tags)
  if (!gameId) return null
  if (hasTagValue(e.tags, 'cheated', 'true')) return null
  const scoreTag = singleTagValue(e.tags, 'score')
  if (!scoreTag.valid) return null
  const score = parseNonNegativeInteger(scoreTag.value)
  if (score === null) return null
  const pubkey = parsePlayer(e.tags, e.pubkey)
  const sats = parseSats(e.tags)
  if (!pubkey || sats === null) return null
  const entry: LeaderboardEntry = {
    eventId: e.id,
    pubkey,
    score,
    sats,
    at: e.created_at,
    ...signedIdentity(e.tags),
  }
  return { gameId, entry }
}

/**
 * Parse a kind-5555 (Other Stuff) score event. Unlike 30762, the "score" is a
 * game-specific tag (`field`, e.g. word5 → `streak`) and the player is the event
 * `pubkey` (player-signed) unless a `p` tag overrides it. There is no `cheated`
 * tag in this schema.
 */
export function parse5555Event(e: ScoreEvent, gameId: string, field: string): LeaderboardEntry | null {
  if (e.kind !== 5555 || !isReasonableEventTimestamp(e.created_at)) return null
  if (!field || field.length > 64 || parseGameId(e.tags) !== gameId) return null
  const scoreTag = singleTagValue(e.tags, field)
  if (!scoreTag.valid) return null
  const score = parseNonNegativeInteger(scoreTag.value)
  if (score === null) return null
  const pubkey = parsePlayer(e.tags, e.pubkey)
  const sats = parseSats(e.tags)
  if (!pubkey || sats === null) return null
  return { eventId: e.id, pubkey, score, sats, at: e.created_at, ...signedIdentity(e.tags) }
}

/**
 * Pure board computation: filter by period, keep the best score per pubkey, sort
 * by `dir`, slice to topN.
 *
 * @param entries  All entries for a given game (unfiltered).
 * @param period   'today' = created_at >= start of UTC day; 'all' = no filter.
 * @param topN     Maximum entries to return.
 * @param nowSec   Current unix timestamp in seconds (injected for testability - do NOT call Date.now() here).
 * @param dir      'desc' (default) = higher wins; 'asc' = lower wins (e.g. time/strokes).
 */
export function boardFor(
  entries: LeaderboardEntry[],
  period: Period,
  topN: number,
  nowSec: number,
  dir: 'asc' | 'desc' = 'desc',
): LeaderboardEntry[] {
  let filtered = entries
  if (period === 'today') {
    const d = new Date(nowSec * 1000)
    d.setUTCHours(0, 0, 0, 0)
    const dayStartSec = d.getTime() / 1000
    filtered = entries.filter(e => e.at >= dayStartSec)
  }
  const better = (a: number, b: number): boolean => (dir === 'asc' ? a < b : a > b)
  const best = new Map<string, LeaderboardEntry>()
  for (const e of filtered) {
    const cur = best.get(e.pubkey)
    if (!cur || better(e.score, cur.score)) best.set(e.pubkey, e)
  }
  return Array.from(best.values())
    .sort((a, b) => (dir === 'asc' ? a.score - b.score : b.score - a.score))
    .slice(0, topN)
}

export function collapseToBest(events: ScoreEvent[], gameId: string, topN: number): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>()
  for (const raw of events) {
    const e = parseScoreEvent(raw, gameId); if (!e) continue
    const cur = best.get(e.pubkey); if (cur && cur.score >= e.score) continue
    best.set(e.pubkey, e)
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN)
}
