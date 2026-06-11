/**
 * gamestr-arcade — relay store (booth-configurable relay list).
 *
 * Wraps the config-supplied relay list with per-relay enable/disable state,
 * persisted to localStorage so a booth operator's changes survive reboots.
 *
 * Rules:
 *   - The canonical list starts from the config relays (Pallasite's set).
 *   - The operator may add/remove/toggle. An added relay defaults to enabled.
 *   - Persistence is a flat array of `{url, enabled}` records keyed to a
 *     single localStorage entry. The config relays are always present as the
 *     base; the override layer only records mutations on top of that base.
 *   - Deduplication is by URL string; adding the same URL twice is a no-op.
 *   - The store is observable: register a listener and it fires on every
 *     mutation with the current enabled URL list.
 *
 * Storage is injected (like the board cache) so the unit tests never touch
 * DOM globals.
 */

import type { KeyValueStore } from './cache'

const STORE_KEY = 'gamestr-arcade.relays.v1'

export interface RelayEntry {
  url: string
  enabled: boolean
}

type ChangeListener = (enabledUrls: string[]) => void

function defaultStore(): KeyValueStore | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage
    return ls ?? null
  } catch {
    return null
  }
}

function isValidRelayUrl(url: string): boolean {
  return /^wss?:\/\/.+/.test(url.trim())
}

function load(store: KeyValueStore | null, baseRelays: readonly string[]): RelayEntry[] {
  if (store) {
    try {
      const raw = store.getItem(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          const entries = (parsed as unknown[]).filter(
            (e): e is RelayEntry =>
              typeof e === 'object' && e !== null &&
              typeof (e as Record<string, unknown>).url === 'string' &&
              typeof (e as Record<string, unknown>).enabled === 'boolean',
          )
          if (entries.length > 0) return entries
        }
      }
    } catch {
      /* malformed — fall through to base */
    }
  }
  // Seed from base relays, all enabled.
  return baseRelays.map(url => ({ url, enabled: true }))
}

export class RelayStore {
  private entries: RelayEntry[]
  private readonly store: KeyValueStore | null
  private readonly listeners: ChangeListener[] = []

  constructor(baseRelays: readonly string[], store: KeyValueStore | null = defaultStore()) {
    this.store = store
    this.entries = load(store, baseRelays)
    // Ensure any base relays missing from the persisted list are appended
    // (handles the case where the config gains a new relay after a booth session).
    for (const url of baseRelays) {
      if (!this.entries.some(e => e.url === url)) {
        this.entries.push({ url, enabled: true })
      }
    }
  }

  /** All relay entries (enabled + disabled), in order. */
  getAll(): RelayEntry[] {
    return [...this.entries]
  }

  /** Only enabled relay URLs — the live subscription set. */
  getEnabled(): string[] {
    return this.entries.filter(e => e.enabled).map(e => e.url)
  }

  /** Toggle a relay on/off by URL. No-op if URL is unknown. */
  toggle(url: string): void {
    const entry = this.entries.find(e => e.url === url)
    if (!entry) return
    entry.enabled = !entry.enabled
    this.persist()
    this.emit()
  }

  /**
   * Add a new relay. Validates the URL (must be `ws://` or `wss://`).
   * Returns `true` if added, `false` if invalid or duplicate.
   */
  add(url: string): boolean {
    const trimmed = url.trim()
    if (!isValidRelayUrl(trimmed)) return false
    if (this.entries.some(e => e.url === trimmed)) return false
    this.entries.push({ url: trimmed, enabled: true })
    this.persist()
    this.emit()
    return true
  }

  /**
   * Remove a relay by URL.
   * Returns `true` if removed, `false` if not found.
   */
  remove(url: string): boolean {
    const idx = this.entries.findIndex(e => e.url === url)
    if (idx === -1) return false
    this.entries.splice(idx, 1)
    this.persist()
    this.emit()
    return true
  }

  /** Register a listener that fires whenever the enabled set changes. */
  onChange(listener: ChangeListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx !== -1) this.listeners.splice(idx, 1)
    }
  }

  private persist(): void {
    if (!this.store) return
    try {
      this.store.setItem(STORE_KEY, JSON.stringify(this.entries))
    } catch {
      /* quota / disabled — best-effort */
    }
  }

  private emit(): void {
    const enabled = this.getEnabled()
    for (const fn of this.listeners) fn(enabled)
  }
}
