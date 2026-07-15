/**
 * gamestr-arcade - last-known leaderboard cache (localStorage).
 *
 * The booth should never show an empty board on selection just because the
 * relay round-trip hasn't completed. We persist the most recent top-N per
 * `gameId` and render it INSTANTLY on select; live data then replaces it.
 *
 * Storage is injected (defaults to `window.localStorage`) so the round-trip is
 * unit-testable against a plain in-memory stub, with no DOM/browser globals.
 */

import type { LeaderboardEntry } from '../../../shared/types'

/** The minimal subset of the Web Storage API we rely on (keeps tests trivial). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'gamestr-arcade.lb.'
const VERSION = 1

interface CacheRecord {
  v: number
  at: number // unix ms the snapshot was written
  entries: LeaderboardEntry[]
}

function keyFor(gameId: string): string {
  return PREFIX + gameId
}

function defaultStore(): KeyValueStore | null {
  try {
    // `globalThis.localStorage` is absent in Node / Electron-main; guard so the
    // cache degrades to a no-op rather than throwing off-browser.
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage
    return ls ?? null
  } catch {
    return null
  }
}

function isEntry(v: unknown): v is LeaderboardEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.pubkey === 'string' && typeof e.score === 'number' && typeof e.at === 'number'
}

/**
 * Read the cached board for a game. Returns `[]` when nothing is cached, the
 * record is malformed, or the schema version has moved on (forward-safe).
 */
export function readCachedBoard(gameId: string, store: KeyValueStore | null = defaultStore()): LeaderboardEntry[] {
  if (!store) return []
  let raw: string | null
  try {
    raw = store.getItem(keyFor(gameId))
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const rec = JSON.parse(raw) as CacheRecord
    if (!rec || rec.v !== VERSION || !Array.isArray(rec.entries)) return []
    return rec.entries.filter(isEntry)
  } catch {
    return []
  }
}

/**
 * Persist the latest board for a game. Empty boards are not written (so a
 * transient empty live update never clobbers a good cached snapshot); to clear
 * a cache entry use `clearCachedBoard`.
 */
export function writeCachedBoard(
  gameId: string,
  entries: LeaderboardEntry[],
  store: KeyValueStore | null = defaultStore(),
): void {
  if (!store || entries.length === 0) return
  const rec: CacheRecord = { v: VERSION, at: Date.now(), entries }
  try {
    store.setItem(keyFor(gameId), JSON.stringify(rec))
  } catch {
    /* quota / disabled storage - caching is best-effort, never fatal */
  }
}

/** Drop the cached board for a game. */
export function clearCachedBoard(gameId: string, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return
  try {
    store.removeItem(keyFor(gameId))
  } catch {
    /* ignore */
  }
}
