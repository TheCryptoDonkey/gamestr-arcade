/**
 * gamestr-arcade - booth mode for games that have one.
 *
 * The cabinet is a walk-up booth, so a game with a booth surface is opened on
 * it at launch time. Catalogue data keeps the public URL, so nothing shown to a
 * phone or the web edition carries the booth flags.
 */

import type { Game } from '../shared/types'

/** Pallasite's booth kiosk: the walk-up lobby at full effects (`?p1`). */
const PALLASITE_BOOTH_QUERY = 'p1&fullfx=1'

/**
 * Return the game as the cabinet should launch it. Web builds (hosted, local
 * mirror or offline package) get the booth query; the native desktop app reads
 * the same query from its environment, as it ignores URL flags.
 */
export function withBoothMode(game: Game, kiosk: boolean): Game {
  if (game.gameId !== 'pallasite') return game
  if (game.kind === 'appimage') {
    return {
      ...game,
      launchEnv: { ...game.launchEnv, PALLASITE_BOOT_QUERY: PALLASITE_BOOTH_QUERY, PALLASITE_KIOSK: kiosk ? '1' : '0' },
    }
  }
  if (!game.url) return game
  try {
    const url = new URL(game.url)
    if (url.searchParams.has('p1') || url.searchParams.has('p2')) return game
    url.search = url.search ? `${url.search.slice(1)}&${PALLASITE_BOOTH_QUERY}` : PALLASITE_BOOTH_QUERY
    return { ...game, url: url.href }
  } catch {
    return game
  }
}
