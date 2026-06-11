/**
 * gamestr-arcade — games list builder.
 *
 * Assembles the full games list by combining the folder scanner with the icon
 * resolver, then rewrites every local file path to a servable `media://` URL
 * so the renderer can load assets identically in dev and production.
 */

import { join, resolve, sep } from 'node:path'
import { stat } from 'node:fs/promises'
import { app } from 'electron'
import { scanGames } from './scanner'
import { resolveIcon, realIconDeps } from './icons'
import { localUrlFor } from './local-server'
import type { Game } from '../shared/types'

export const MEDIA_SCHEME = 'media'

/**
 * Decide whether a resolved absolute path may be served by the media protocol.
 *
 * A path is permitted only if it equals, or is nested under, one of the allowed
 * roots. The separator is appended before the prefix test so a sibling root that
 * merely shares a string prefix (e.g. "/games-old" vs "/games") cannot slip
 * through — guarding against both path traversal and prefix-confusion.
 *
 * Pure and dependency-free so the security decision is unit-testable.
 */
export function isPathAllowed(absPath: string, roots: readonly string[]): boolean {
  const canonical = resolve(absPath)
  return roots.some(root => {
    const canonicalRoot = resolve(root)
    return canonical === canonicalRoot || canonical.startsWith(canonicalRoot + sep)
  })
}

/**
 * Convert an absolute local path to a `media://local/<path>` URL.
 * Passes empty string through unchanged (no logo case).
 */
export function pathToMediaUrl(absPath: string): string {
  if (!absPath) return ''
  // Strip the leading slash so the URL host is "local" and path is the rest.
  // e.g. /games/neon/logo.png → media://local/games/neon/logo.png
  return `${MEDIA_SCHEME}://local${absPath.startsWith('/') ? absPath : '/' + absPath}`
}

/**
 * Extract the absolute file path from a `media://local/<path>` URL.
 * Returns empty string for any non-media URL.
 */
export function mediaUrlToPath(url: string): string {
  if (!url.startsWith(`${MEDIA_SCHEME}://local`)) return ''
  return url.slice(`${MEDIA_SCHEME}://local`.length) || ''
}

function rewriteGame(game: Game): Game {
  return {
    ...game,
    logo: game.logo ? pathToMediaUrl(game.logo) : game.logo,
    hero: game.hero ? pathToMediaUrl(game.hero) : game.hero,
    sounds: game.sounds
      ? {
          music: game.sounds.music ? pathToMediaUrl(game.sounds.music) : game.sounds.music,
          voice: game.sounds.voice ? pathToMediaUrl(game.sounds.voice) : game.sounds.voice,
        }
      : game.sounds,
  }
}

/**
 * Build the full games list for the IPC handler.
 *
 * 1. Scans `gamesDir` for game folders / AppImages.
 * 2. Resolves logos via the icon resolver (sibling logo.png → cached extract → placeholder).
 * 3. Rewrites all local file paths to `media://` URLs so the renderer can load
 *    them via the registered protocol handler regardless of origin.
 * 4. If `localPort` is provided, any web game that has a `site/index.html` mirror
 *    under `gamesDir/<slug>/site/` has its url rewritten to the local server and
 *    `localSite: true` is set on the game — so the carousel can badge it "LOCAL".
 *
 * Unit-testable: pass `FAKE_CACHE` for `cacheDir`; the icon resolver will fall
 * back to placeholder for any game without a `logo.png` sibling.
 */
export async function buildGamesList(
  gamesDir: string,
  cacheDir: string,
  localPort?: number,
): Promise<Game[]> {
  const placeholderPng = resourcePlaceholder()
  const iconDeps = realIconDeps(placeholderPng)

  const logoResolver = (g: { slug: string; appImagePath?: string; siblingLogo?: string }) =>
    resolveIcon(g, cacheDir, iconDeps)

  const games = await scanGames(gamesDir, logoResolver)
  const rewritten = games.map(rewriteGame)

  if (localPort === undefined) return rewritten

  // Prefer local mirror: for each web game, check whether a site/index.html
  // exists under the games dir and rewrite the url if so.
  return Promise.all(
    rewritten.map(async (game): Promise<Game> => {
      if (game.kind !== 'web') return game
      const siteIndex = join(gamesDir, game.id, 'site', 'index.html')
      const hasMirror = await stat(siteIndex).then(s => s.isFile()).catch(() => false)
      if (!hasMirror) return game
      const localRoot = join(gamesDir, game.id, 'site')
      return { ...game, url: localUrlFor(localPort), localSite: true, localRoot }
    }),
  )
}

/**
 * Return the path to the bundled placeholder icon PNG.
 * Works in both dev (project root / resources/) and packaged (app.asar resources).
 */
function resourcePlaceholder(): string {
  try {
    // app may not be ready in tests — fall back gracefully.
    return join(app.getAppPath(), 'resources', 'icon.png')
  } catch {
    return join(process.cwd(), 'resources', 'icon.png')
  }
}
