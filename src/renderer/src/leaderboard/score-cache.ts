import { verifyEvent } from 'nostr-tools/pure'
import { isScoreEvent, type ScoreEvent } from './gamestr-reduce'

export interface ScoreCacheStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
const KEY = 'gamestr:verified-score-cache:v1'
const MAX_BYTES = 512 * 1024
const MAX_EVENTS = 256

/** Public signed events only; cached entries are always verified again on load. */
export function readScoreCache(storage?: ScoreCacheStorage): ScoreEvent[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(KEY)
    if (!raw || raw.length > MAX_BYTES) return []
    const events: unknown = JSON.parse(raw)
    if (!Array.isArray(events) || events.length > MAX_EVENTS) return []
    return events.filter((event): event is ScoreEvent => isScoreEvent(event) && verifyEvent(event))
  } catch { return [] }
}

/** Priority order puts retained personal records ahead of recent activity. */
export function writeScoreCache(storage: ScoreCacheStorage | undefined, events: Iterable<ScoreEvent>): void {
  if (!storage) return
  const unique = new Map<string, ScoreEvent>()
  let size = 2
  for (const event of events) {
    if (unique.has(event.id)) continue
    const encoded = JSON.stringify(event)
    if (size + encoded.length + 1 > MAX_BYTES) continue
    unique.set(event.id, event)
    size += encoded.length + 1
    if (unique.size >= MAX_EVENTS) break
  }
  try { storage.setItem(KEY, JSON.stringify([...unique.values()])) } catch { /* storage failure leaves the live feed usable */ }
}
