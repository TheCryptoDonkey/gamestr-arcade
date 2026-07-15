/**
 * gamestr-arcade - kind-0 profile cache with a 24-hour TTL.
 *
 * Two-layer caching strategy:
 *
 *   1. **In-memory memo** (a `Map`) - zero-cost lookup within a session. Entries
 *      are only added here once a full resolve+persist cycle completes, so a
 *      concurrent fetch for the same pubkey does not trigger a double request.
 *
 *   2. **localStorage persistence** - survives page reloads / Electron restarts
 *      for one "booth day" (~24h TTL). On load, a hit younger than TTL_MS is
 *      returned directly and the pubkey is also inserted into the in-memory memo
 *      so subsequent lookups within the same session are instant.
 *
 * Storage is injected (defaults to `window.localStorage`) so the TTL logic is
 * fully unit-testable with a stub clock and an in-memory store, no DOM required.
 */

import type { KeyValueStore } from './cache'
import { sanitiseLightningAddress, sanitiseLnurl, sanitiseNip05, sanitisePicture, type Profile } from './profiles'

/** 24-hour TTL for a "booth day". */
export const PROFILE_TTL_MS = 24 * 60 * 60 * 1000

const STORE_PREFIX = 'gamestr-arcade.profile.v1.'

interface CachedProfile {
  /** Unix ms the record was written. */
  at: number
  name?: string
  picture?: string
  nip05?: string
  lud16?: string
  lud06?: string
}

function isCachedProfile(v: unknown): v is CachedProfile {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.at === 'number'
}

function defaultStore(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage
    return ls ?? null
  } catch {
    return null
  }
}

export class ProfileCache {
  /** In-memory memo - session-scoped, avoids redundant localStorage reads. */
  private readonly memo = new Map<string, Profile>()
  private readonly store: KeyValueStore | null
  /** Injectable clock - `Date.now` in production, a stub in tests. */
  private readonly now: () => number

  constructor(store: KeyValueStore | null = defaultStore(), now: () => number = Date.now) {
    this.store = store
    this.now = now
  }

  /**
   * Read a profile for a pubkey.
   *
   * Returns the cached `Profile` if:
   *   - it is already in the in-memory memo (same session), OR
   *   - localStorage has a record younger than `PROFILE_TTL_MS`.
   *
   * Returns `undefined` if absent or expired (caller should re-fetch).
   */
  get(pubkey: string): Profile | undefined {
    // 1. In-memory hit - no deserialization needed.
    const memo = this.memo.get(pubkey)
    if (memo) return memo

    // 2. Persistent hit - check TTL.
    if (!this.store) return undefined
    let raw: string | null
    try {
      raw = this.store.getItem(STORE_PREFIX + pubkey)
    } catch {
      return undefined
    }
    if (!raw) return undefined
    try {
      const rec = JSON.parse(raw) as unknown
      if (!isCachedProfile(rec)) return undefined
      if (this.now() - rec.at > PROFILE_TTL_MS) return undefined
      const profile: Profile = {}
      if (typeof rec.name === 'string') profile.name = rec.name.trim().slice(0, 80) || undefined
      profile.picture = sanitisePicture(rec.picture)
      profile.nip05 = sanitiseNip05(rec.nip05)
      profile.lud16 = sanitiseLightningAddress(rec.lud16)
      profile.lud06 = sanitiseLnurl(rec.lud06)
      if (!profile.name && !profile.picture && !profile.nip05 && !profile.lud16 && !profile.lud06) return undefined
      // Warm the in-memory memo so subsequent reads within the session are free.
      this.memo.set(pubkey, profile)
      return profile
    } catch {
      return undefined
    }
  }

  /**
   * Write a resolved `Profile` for a pubkey. Stores both in the memo and in
   * localStorage with the current timestamp.
   */
  set(pubkey: string, profile: Profile): void {
    this.memo.set(pubkey, profile)
    if (!this.store) return
    const rec: CachedProfile = { at: this.now() }
    if (profile.name) rec.name = profile.name
    if (profile.picture) rec.picture = profile.picture
    if (profile.nip05) rec.nip05 = profile.nip05
    if (profile.lud16) rec.lud16 = profile.lud16
    if (profile.lud06) rec.lud06 = profile.lud06
    try {
      this.store.setItem(STORE_PREFIX + pubkey, JSON.stringify(rec))
    } catch {
      /* quota / disabled - best-effort */
    }
  }

  /**
   * Returns the pubkeys from `candidates` that are NOT already cached (i.e.
   * those that need a kind-0 fetch). Skips anything already in the memo or
   * still within TTL in localStorage.
   */
  missing(candidates: string[]): string[] {
    return candidates.filter(pk => !this.get(pk))
  }
}
