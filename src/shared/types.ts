export type GameKind = 'appimage' | 'web'

/**
 * Per-game gamepad→keyboard mapping.
 *
 * Each value is a key string as used in `KeyboardEvent.key` (e.g. `"ArrowLeft"`,
 * `"Space"`, `"a"`). Omitted entries fall back to the global DEFAULT_CONTROLS.
 */
export interface GameControls {
  up?: string
  down?: string
  left?: string
  right?: string
  fire?: string
}

/** Player-facing input families declared by a v2 game manifest. */
export type GameInputMode = 'gamepad' | 'keyboard' | 'pointer' | 'touch'

/** How much of a game remains usable when the cabinet loses connectivity. */
export type GameNetworkMode = 'required' | 'optional' | 'offline'

/**
 * Capabilities a game may request from the arcade session.
 *
 * These are declarations, not grants: the main-process session broker remains
 * the authority and may deny a capability even when it is listed here.
 */
export interface GameCapabilities {
  nostrSign?: boolean
  walletPay?: boolean
  persistentStorage?: boolean
  externalNavigation?: boolean
}

export interface GameRewardRules {
  enabled: boolean
  label?: string
}

export interface Game {
  id: string            // stable slug (folder or filename)
  name: string
  tagline?: string
  kind: GameKind
  exec?: string         // absolute .AppImage path (kind === 'appimage')
  args?: string[]       // extra CLI args for the native exec (game.json `args`, e.g. ['--no-sandbox'])
  url?: string          // web url (kind === 'web')
  localSite?: boolean   // true when url points to the local mirror server
  localRoot?: string    // absolute path to the game's site/ dir (set when localSite is true)
  // Download-only games can't be played in the kiosk (no embeddable web build).
  // They're kept in the carousel for showcase — greyed-out with a DOWNLOAD ONLY
  // ribbon — and pressing play opens a QR panel pointing at `downloadUrl` (or `url`)
  // so a visitor can grab the game on their own device.
  downloadOnly?: boolean
  downloadUrl?: string  // QR target for a download-only game; falls back to `url`
  gameId: string        // kind-30762 `game` tag value (leaderboard key)
  tHints?: string[]     // optional `#t` server-side filter hints; defaults to [gameId]
  logo: string          // absolute path to resolved logo image
  hero?: string         // absolute path to hero image or video
  accent?: string       // hex colour
  sounds?: { music?: string; voice?: string }
  controls?: GameControls  // gamepad→keyboard overrides for this game
  /** Versioned manifest metadata. Missing means the legacy v1 folder contract. */
  manifestVersion?: number
  developer?: string
  /** Author-declared Lightning address (or LNURL) for post-game tips. */
  tips?: string
  description?: string
  genres?: string[]
  inputModes?: GameInputMode[]
  /** Concise player-facing instructions, unlike `tHints` (relay filter hints). */
  controlHints?: string[]
  sessionMinutes?: number
  players?: { min: number; max: number }
  network?: GameNetworkMode
  ageRating?: string
  capabilities?: GameCapabilities
  rewardRules?: GameRewardRules
  /** Additional origins a web game may navigate to during an isolated session. */
  allowedOrigins?: string[]
  /** Scanner readiness result. Omitted by old fixtures means ready. */
  available?: boolean
  availabilityReason?: string
  order: number
  // Leaderboard scoring. Most games omit these (kind-30762 `score` tag, higher
  // is better). Other Stuff games (word5, unicornvssnakes) score via kind 5555
  // with a game-specific field (e.g. `streak`); these tell the board how to read
  // and rank them. See gamestr's bundle `Si` config.
  scoreKind?: number              // 30762 (default) or 5555
  scoreField?: string             // tag holding the score (5555 only; default 'score')
  scoreDir?: 'asc' | 'desc'       // ranking direction (default 'desc' = higher wins)
  // gamestr editorial flags (populated at runtime from the catalogue, by slug) —
  // surfaced as TRENDING / NEW badges on the carousel.
  trending?: boolean
  newRelease?: boolean
  featured?: boolean
  /** Runtime flag: this cabinet's most-played game tonight (local session stats). */
  hotTonight?: boolean
}

export interface LeaderboardEntry {
  eventId?: string       // verified Nostr event id, when sourced from a relay
  pubkey: string        // hex (player)
  name?: string         // legacy/pre-filled kind-0 display name
  picture?: string
  /** Player label included in and protected by the signed score event. */
  signedName?: string
  /** NIP-05 identifier included in and protected by the signed score event. */
  signedNip05?: string
  score: number
  sats?: number
  at: number            // unix seconds
}

/** How to read + rank a game's scores. Omitted → kind-30762 `score`, higher wins. */
export interface ScoreScoring {
  kind?: number              // 30762 (default) or 5555
  field?: string             // tag holding the score (5555 only; default 'score')
  dir?: 'asc' | 'desc'       // ranking direction (default 'desc' = higher wins)
}

export interface LeaderboardProvider {
  // Returns an unsubscribe fn. onUpdate fires with the current top-N whenever it changes.
  subscribe(
    gameId: string,
    onUpdate: (top: LeaderboardEntry[]) => void,
    scoring?: ScoreScoring,
  ): () => void
}

/**
 * A game in gamestr.io's catalogue (extracted from its frontend bundle — there
 * is no registry API). `url` is the external play URL; `image` is absolute.
 */
export interface GamestrCatalogueEntry {
  slug: string
  name: string
  description?: string
  image?: string
  genres: string[]
  url: string
  developer?: string
  featured?: boolean
  trending?: boolean
  newRelease?: boolean
  // Scoring config (kind 5555 games only) — see Game.scoreKind/scoreField/scoreDir.
  scoreKind?: number
  scoreField?: string
  scoreDir?: 'asc' | 'desc'
}

export interface GamestrCatalogueResult {
  entries: GamestrCatalogueEntry[]
  /** Whether these entries came from a live fetch or the offline cache. */
  source: 'live' | 'cache'
  /** Unix ms the entries were fetched (0 when neither live nor cache available). */
  fetchedAt: number
}

export interface GamestrImportResult {
  ok: boolean
  slug?: string
  /** false when a game.json already existed (import left it untouched). */
  created?: boolean
  error?: string
  /** Fresh games list after a successful import, so the shell can refresh. */
  games?: Game[]
}

export interface WebLNConfig {
  /** NWC connection string — e.g. `nostr+walletconnect://...` */
  nwc: string
  /**
   * Maximum payment amount in satoshis the kiosk will auto-pay without
   * operator confirmation. Invoices exceeding this are rejected.
   * Defaults to 100 sats.
   */
  maxSats?: number
  /**
   * Maximum cumulative amount reserved for one launched web-game session.
   * Defaults to five times `maxSats`. Pending/ambiguous payments count against
   * the budget so a timeout cannot be used to bypass the ceiling.
   */
  sessionBudgetSats?: number
  /** Maximum number of distinct payment attempts accepted per rolling minute. */
  maxPaymentsPerMinute?: number
}

export interface ArcadeConfig {
  gamesDir: string
  theme: { title: string; wordmark?: string; accent: string; crt: boolean }
  attractTimeoutMs: number
  kiosk: boolean
  leaderboard:
    | { provider: 'none' }
    | { provider: 'gamestr'; relays: string[]; topN: number }
  /**
   * Optional booth Lightning wallet for auto-paying WebLN-paywalled games.
   * When absent the kiosk does not inject `window.webln` — games fall back to
   * their own QR / payment flow.
   */
  webln?: WebLNConfig
  /**
   * Optional post-game donation ask. `address` is a RECEIVE-side Lightning
   * address (or LNURL) rendered as a QR — safe to expose to the renderer,
   * unlike the webln spend credentials. When absent, no ask is ever shown.
   */
  donation?: DonationConfig
}

export interface DonationConfig {
  address: string
  message?: string
  /** Only ask after a session at least this long (default 45 s) — never beg after a bounce. */
  minSessionSeconds?: number
  /** Auto-dismiss after this long (default 30 s). */
  showSeconds?: number
}
