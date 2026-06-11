export type GameKind = 'appimage' | 'web'

export interface Game {
  id: string            // stable slug (folder or filename)
  name: string
  tagline?: string
  kind: GameKind
  exec?: string         // absolute .AppImage path (kind === 'appimage')
  url?: string          // web url (kind === 'web')
  localSite?: boolean   // true when url points to the local mirror server
  gameId: string        // kind-30762 `game` tag value (leaderboard key)
  tHints?: string[]     // optional `#t` server-side filter hints; defaults to [gameId]
  logo: string          // absolute path to resolved logo png
  hero?: string         // absolute path to hero png|mp4
  accent?: string       // hex colour
  sounds?: { music?: string; voice?: string }
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
