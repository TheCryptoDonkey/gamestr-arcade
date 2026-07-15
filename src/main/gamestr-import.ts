/**
 * gamestr-arcade - one-tap game import.
 *
 * Turns a parsed gamestr catalogue entry into a `games/<slug>/game.json` the
 * folder scanner already understands (it reads name / tagline / url / gameId /
 * order / logoUrl / heroUrl). Art is referenced by URL so the existing icon +
 * hero resolvers fetch and cache it - no binary download here.
 *
 * Pure except for the injected `ImportDeps`, so it unit-tests without touching
 * the real filesystem.
 */

import { join } from 'node:path'
import type { GamestrCatalogueEntry } from '../shared/types'

export interface ImportDeps {
  mkdir(dir: string): Promise<void>
  writeFile(path: string, data: string): Promise<void>
  exists(path: string): Promise<boolean>
}

export interface ImportResult {
  slug: string
  gameJsonPath: string
  /** false when a game.json already existed (left untouched). */
  created: boolean
}

/** A slug safe to use as a folder name - no traversal, no separators. */
export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)
}

const TAGLINE_MAX = 140

/** Build the `game.json` contents for a gamestr catalogue entry. */
export function gameJsonFor(entry: GamestrCatalogueEntry): Record<string, unknown> {
  let playOrigin: string | undefined
  try { playOrigin = new URL(entry.url).origin } catch { /* scanner will report invalid URL */ }
  const json: Record<string, unknown> = {
    manifestVersion: 2,
    name: entry.name,
    url: entry.url,
    gameId: entry.slug,
    // Imported games sort after the hand-curated set; the operator can re-order
    // by editing `order` later.
    order: 900,
    // Provenance marker so it's clear these were auto-imported from gamestr.
    source: 'gamestr',
    network: 'required',
    // Gamestr titles commonly use NIP-07 for guest score publication. This is a
    // requested capability only; the isolated session broker remains authoritative.
    capabilities: { nostrSign: true, walletPay: false },
  }
  if (playOrigin) json.allowedOrigins = [playOrigin]
  if (entry.developer) json.developer = entry.developer
  if (entry.description) {
    json.tagline =
      entry.description.length > TAGLINE_MAX
        ? entry.description.slice(0, TAGLINE_MAX - 1).trimEnd() + '…'
        : entry.description
  }
  if (entry.image) {
    json.logoUrl = entry.image
    json.heroUrl = entry.image
  }
  if (entry.genres.length) json.genres = entry.genres
  // Carry the leaderboard scoring config for kind-5555 (Other Stuff) games so
  // the imported game's board reads + ranks the right field straight away.
  if (entry.scoreKind) json.scoreKind = entry.scoreKind
  if (entry.scoreField) json.scoreField = entry.scoreField
  if (entry.scoreDir) json.scoreDir = entry.scoreDir
  return json
}

/**
 * Write `games/<slug>/game.json` for an entry. No-ops (created: false) when a
 * game.json already exists, so re-importing never clobbers operator edits.
 */
export async function importGameToFolder(
  gamesDir: string,
  entry: GamestrCatalogueEntry,
  deps: ImportDeps,
): Promise<ImportResult> {
  if (!isSafeSlug(entry.slug)) throw new Error(`unsafe game slug: ${entry.slug}`)
  const dir = join(gamesDir, entry.slug)
  const gameJsonPath = join(dir, 'game.json')
  if (await deps.exists(gameJsonPath)) {
    return { slug: entry.slug, gameJsonPath, created: false }
  }
  await deps.mkdir(dir)
  await deps.writeFile(gameJsonPath, JSON.stringify(gameJsonFor(entry), null, 2) + '\n')
  return { slug: entry.slug, gameJsonPath, created: true }
}
