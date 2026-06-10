import type { LeaderboardEntry } from '../../../shared/types'

export interface ScoreEvent {
  id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][]; sig: string
}

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
  return { pubkey, score, sats: parseInt(tagValue(e.tags, 'sats') ?? '0', 10) || 0, at: e.created_at }
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
