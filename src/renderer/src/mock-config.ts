/**
 * gamestr-arcade - mock config for browser-only design verification.
 *
 * Used ONLY when `window.arcade` is undefined (renderer served in a plain
 * browser via Vite, not inside Electron). Mirrors the shape of the real
 * `arcade.config.json` so the wow-layer (leaderboard panel, attract mode, CRT)
 * renders exactly as it would on the booth. Never imported on the Electron path.
 *
 * The `gamestr` provider here is nominal: in browser mode the panel substitutes
 * mock leaderboard entries (see `mock-leaderboard.ts`) rather than opening real
 * relay sockets, so screenshots are deterministic and offline.
 */

import type { ArcadeConfig } from '../../shared/types'

export const MOCK_CONFIG: ArcadeConfig = {
  gamesDir: 'games',
  theme: { title: 'gamestr arcade', accent: '#7cf3ff', crt: true },
  // Short enough that a design script can trigger attract quickly if desired,
  // but the screenshot harness drives attract directly rather than waiting.
  attractTimeoutMs: 20000,
  kiosk: false,
  leaderboard: {
    provider: 'gamestr',
    relays: [
      'wss://relay.gamestr.io',
      'wss://relay.trotters.cc',
      'wss://nos.lol',
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://relay.primal.net',
      'wss://relay.ditto.pub',
    ],
    topN: 5,
  },
}
