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

export interface Game {
  id: string            // stable slug (folder or filename)
  name: string
  tagline?: string
  kind: GameKind
  exec?: string         // absolute .AppImage path (kind === 'appimage')
  url?: string          // web url (kind === 'web')
  localSite?: boolean   // true when url points to the local mirror server
  localRoot?: string    // absolute path to the game's site/ dir (set when localSite is true)
  gameId: string        // kind-30762 `game` tag value (leaderboard key)
  tHints?: string[]     // optional `#t` server-side filter hints; defaults to [gameId]
  logo: string          // absolute path to resolved logo png
  hero?: string         // absolute path to hero png|mp4
  accent?: string       // hex colour
  sounds?: { music?: string; voice?: string }
  controls?: GameControls  // gamepad→keyboard overrides for this game
  order: number
}

export interface LeaderboardEntry {
  pubkey: string        // hex (player)
  name?: string         // resolved from kind-0, async
  picture?: string
  score: number
  sats?: number
  at: number            // unix seconds
}

export interface LeaderboardProvider {
  // Returns an unsubscribe fn. onUpdate fires with the current top-N whenever it changes.
  subscribe(gameId: string, onUpdate: (top: LeaderboardEntry[]) => void): () => void
}

export interface ArcadeConfig {
  gamesDir: string
  theme: { title: string; wordmark?: string; accent: string; crt: boolean }
  attractTimeoutMs: number
  kiosk: boolean
  leaderboard:
    | { provider: 'none' }
    | { provider: 'gamestr'; relays: string[]; topN: number }
}
