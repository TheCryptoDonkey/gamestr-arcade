/**
 * gamestr-arcade — mock leaderboard data for browser-only design verification.
 *
 * Used ONLY when `window.arcade` is undefined. Supplies a handful of fake
 * boards keyed by `gameId` so the leaderboard panel is fully populated in
 * screenshots — including resolved names + a deterministic empty board to show
 * the "be the first" state. Pubkeys are real-shaped 64-hex so npub encoding and
 * the identicon avatars render exactly as they will against live relays.
 *
 * Never imported on the Electron path (guarded behind the `inElectron` check).
 */

import type { LeaderboardEntry } from '../../shared/types'

const NOW = Math.floor(Date.now() / 1000)

/** A deterministic 64-hex pubkey from a label (so avatars/npubs are stable). */
function fakePubkey(label: string): string {
  let h = 0x811c9dc5
  const bytes: number[] = []
  for (let i = 0; i < 32; i++) {
    h ^= label.charCodeAt(i % label.length) + i * 7
    h = Math.imul(h, 0x01000193) >>> 0
    bytes.push((h >>> (i % 4) * 8) & 0xff)
  }
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('')
}

function entry(label: string, name: string | undefined, score: number, sats: number, agoMin: number): LeaderboardEntry {
  return { pubkey: fakePubkey(label), name, score, sats, at: NOW - agoMin * 60 }
}

/**
 * Boards keyed by gameId. Names are pre-filled here to emulate the *resolved*
 * state (in Electron these arrive async via kind-0); a couple are left
 * undefined so the shortened-npub + identicon placeholder is also visible.
 */
export const MOCK_BOARDS: Record<string, LeaderboardEntry[]> = {
  pallasite: [
    entry('satoshi-belt', 'satoshi', 184_320, 21_000, 6),
    entry('astra-miner', 'astra', 152_990, 12_500, 41),
    entry('voidrunner-7', 'voidrunner', 121_450, 8_000, 92),
    entry('nyx-orbital', undefined, 98_700, 4_200, 180),
    entry('cmdr-lina', 'lina.btc', 76_240, 2_100, 320),
  ],
  axenstax: [
    entry('blockstacker', 'blockstacker', 64_800, 9_000, 12),
    entry('mempool-mara', 'mara', 51_120, 5_400, 55),
    entry('axe-of-kings', 'kingsmoot', 44_390, 3_300, 140),
    entry('splitter-99', undefined, 30_870, 1_500, 210),
    entry('hodl-tetra', 'tetra', 22_010, 800, 400),
  ],
  'hash-dash': [
    entry('proofsprint', 'proofsprint', 41_260, 6_100, 8),
    entry('grid-ghost', 'ghost', 33_980, 3_900, 70),
    entry('nonce-nadia', undefined, 27_540, 2_200, 150),
  ],
  'satori-rush': [
    entry('flowstate', 'flowstate', 58_900, 7_700, 19),
    entry('combo-koa', 'koa', 47_330, 4_800, 88),
    entry('zen-degen', 'zendegen', 39_010, 2_900, 175),
    entry('satori-sol', undefined, 28_700, 1_300, 260),
  ],
  // Deliberately empty → exercises the "BE THE FIRST" empty state.
  'lumen-drift': [],
}

/** Look up a mock board for a gameId (empty array if unknown). */
export function mockBoardFor(gameId: string): LeaderboardEntry[] {
  return MOCK_BOARDS[gameId] ?? []
}
