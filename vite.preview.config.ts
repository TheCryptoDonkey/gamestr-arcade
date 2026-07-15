/**
 * gamestr-arcade - browser preview config (DEV ONLY).
 *
 * Serves the renderer as a plain web page (no Electron) but backed by the REAL
 * games, so `localhost:5199` reflects the actual cabinet rather than MOCK_GAMES.
 *
 * The browser can't do what Electron does (filesystem scan + `media://` art), so
 * this dev server bridges the gap:
 *   - GET `/__games` runs the real folder scanner and returns the games list,
 *     with each local `logo`/`hero` path rewritten to Vite's `/@fs/<abs>` URL
 *     (which the dev server serves for any path under `fs.allow`).
 *   - the renderer's browser fallback fetches `/__games` first (see main.ts),
 *     falling back to MOCK_GAMES only if the bridge isn't present.
 *
 * Not used by the Electron build (that uses electron.vite.config.ts). Run with:
 *   npm run preview:web   →   vite --config vite.preview.config.ts
 */

import { defineConfig, type PluginOption } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanGames } from './src/main/scanner'

const repoRoot = dirname(fileURLToPath(import.meta.url))
const gamesDir = resolve(repoRoot, 'games')

/** Dev middleware: scan the real games folder and serve it as JSON. */
function realGamesPlugin(): PluginOption {
  const toFsUrl = (abs?: string): string | undefined =>
    abs ? '/@fs' + abs : abs
  return {
    name: 'real-games-preview',
    configureServer(server) {
      server.middlewares.use('/__games', async (_req, res) => {
        try {
          const games = await scanGames(gamesDir)
          // Rewrite local logo/hero absolute paths to Vite-served /@fs URLs.
          const out = games.map(g => ({
            ...g,
            logo: g.logo ? toFsUrl(g.logo) : g.logo,
            hero: g.hero ? toFsUrl(g.hero) : g.hero,
          }))
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(out))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  root: resolve(repoRoot, 'src/renderer'),
  // Allow the dev server to serve the art that lives outside the renderer root.
  server: { fs: { allow: [repoRoot] }, port: 5199, strictPort: true },
  plugins: [realGamesPlugin()],
})
