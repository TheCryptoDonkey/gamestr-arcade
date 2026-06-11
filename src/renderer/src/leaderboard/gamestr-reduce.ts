import type { LeaderboardEntry } from '../../../shared/types'

export interface ScoreEvent {
  id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][]; sig: string
}

export interface ParsedAnyScore {
  gameId: string
  entry: LeaderboardEntry
}

export type Period = 'today' | 'all'

export function isScoreEvent(v: unknown): v is ScoreEvent {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return e.kind === 30762 && typeof e.id === 'string' && typeof e.pubkey === 'string'
    && typeof e.created_at === 'number' && Array.isArray(e.tags)
}

function tagValue(tags: string[][], name: string): string | undefined {
  for (const t of tags) if (t[0] === name && typeof t[1] === 'string') return t[1]
  return undefined
}

function hasTagValue(tags: string[][], name: string, value: string): boolean {
  return tags.some(t => t[0] === name && t[1] === value)
}

/** Port of pallasite/src/score.ts `consider`: game match, not cheated, score>0, player from `p` or pubkey. */
export function parseScoreEvent(e: ScoreEvent, gameId: string): LeaderboardEntry | null {
  if (!hasTagValue(e.tags, 'game', gameId)) return null
  if (hasTagValue(e.tags, 'cheated', 'true')) return null
  const score = parseInt(tagValue(e.tags, 'score') ?? '', 10)
  if (!Number.isFinite(score) || score <= 0) return null
  const pubkey = tagValue(e.tags, 'p') ?? e.pubkey
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) return null
  return { pubkey, score, sats: Math.max(0, parseInt(tagValue(e.tags, 'sats') ?? '0', 10) || 0), at: e.created_at }
}

/**
 * Parse a score event without a caller-supplied gameId — extracts the gameId
 * from the event's own `game` tag. Used by the catalogue's broad subscription.
 * Accepts score >= 0 (gamestr.io shows 0s on live boards; the per-game
 * parseScoreEvent retains score > 0 for backwards compatibility with existing tests).
 */
export function parseAnyScoreEvent(e: ScoreEvent): ParsedAnyScore | null {
  const gameId = tagValue(e.tags, 'game')
  if (!gameId) return null
  if (hasTagValue(e.tags, 'cheated', 'true')) return null
  const score = parseInt(tagValue(e.tags, 'score') ?? '', 10)
  if (!Number.isFinite(score) || score < 0) return null
  const pubkey = tagValue(e.tags, 'p') ?? e.pubkey
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) return null
  const entry: LeaderboardEntry = {
    pubkey,
    score,
    sats: Math.max(0, parseInt(tagValue(e.tags, 'sats') ?? '0', 10) || 0),
    at: e.created_at,
  }
  return { gameId, entry }
}

/**
 * Pure board computation: filter by period, keep best score per pubkey, sort
 * descending, slice to topN.
 *
 * @param entries  All entries for a given game (unfiltered).
 * @param period   'today' = created_at >= start of UTC day; 'all' = no filter.
 * @param topN     Maximum entries to return.
 * @param nowSec   Current unix timestamp in seconds (injected for testability — do NOT call Date.now() here).
 */
export function boardFor(
  entries: LeaderboardEntry[],
  period: Period,
  topN: number,
  nowSec: number,
): LeaderboardEntry[] {
  let filtered = entries
  if (period === 'today') {
    const d = new Date(nowSec * 1000)
    d.setUTCHours(0, 0, 0, 0)
    const dayStartSec = d.getTime() / 1000
    filtered = entries.filter(e => e.at >= dayStartSec)
  }
  const best = new Map<string, LeaderboardEntry>()
  for (const e of filtered) {
    const cur = best.get(e.pubkey)
    if (!cur || e.score > cur.score) best.set(e.pubkey, e)
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN)
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
