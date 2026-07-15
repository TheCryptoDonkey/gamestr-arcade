import { defineConfig, type Plugin } from 'vite'
import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import editions from './web.editions.json'

const projectRoot = import.meta.dirname
const gamesDir = join(projectRoot, 'games')
const webRoot = join(projectRoot, 'src/web')
const manifestSchema = join(projectRoot, 'schemas/game-manifest-v2.schema.json')
const virtualValidator = 'virtual:gamestr-manifest-validator'
const resolvedVirtualValidator = `\0${virtualValidator}`

interface WebEdition {
  key: string
  defaultOrigin: string
  outDir: string
  gameSlugs: string[] | null
  featured: string[] | null
  trending: string[] | null
  newReleases: string[] | null
  siteTitle: string
  titleSuffix: string
  siteDescription: string
  themeColor: string
  pwaName: string
  pwaShortName: string
}

const editionKey = process.env.GAMESTR_WEB_EDITION ?? 'gamestr'
const edition = (editions as Record<string, WebEdition>)[editionKey]
if (!edition) throw new Error(`Unknown GAMESTR_WEB_EDITION: ${editionKey}`)
const outDirName = process.env.GAMESTR_WEB_OUT_DIR ?? edition.outDir
const outDir = join(projectRoot, outDirName)
const webOrigin = (process.env.GAMESTR_WEB_ORIGIN ?? edition.defaultOrigin).replace(/\/$/, '')
const allowedGames = edition.gameSlugs ? new Set(edition.gameSlugs) : null

interface WebGame {
  slug: string
  gameId: string
  name: string
  tagline: string
  description?: string
  developer?: string
  genres: string[]
  url: string
  accent: string
  hero?: string
  logo?: string
  featured: boolean
  trending: boolean
  newRelease: boolean
  walletPay: boolean
  players?: { min: number; max: number }
  scoreKind?: number
  scoreField?: string
  scoreDir?: 'asc' | 'desc'
}

function isTracked(path: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relative(projectRoot, path)], { cwd: projectRoot, stdio: 'ignore' })
    return true
  } catch { return false }
}

async function catalogue(): Promise<WebGame[]> {
  const editorial = JSON.parse(await readFile(join(projectRoot, 'web.editorial.json'), 'utf8')) as Record<string, any>
  const entries = await readdir(gamesDir, { withFileTypes: true })
  const games: WebGame[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'payment-lab') continue
    if (allowedGames && !allowedGames.has(entry.name)) continue
    let manifest: Record<string, any>
    try { manifest = JSON.parse(await readFile(join(gamesDir, entry.name, 'game.json'), 'utf8')) } catch { continue }
    if (typeof manifest.url !== 'string' || !manifest.url.startsWith('https://')) continue
    const localHero = ['hero.webp', 'hero.jpg', 'hero.png'].find(name => isTracked(join(gamesDir, entry.name, name)))
    const localLogo = ['logo.webp', 'logo.svg', 'logo.png'].find(name => isTracked(join(gamesDir, entry.name, name)))
    games.push({
      slug: entry.name,
      gameId: String(manifest.gameId ?? entry.name),
      name: String(manifest.name ?? entry.name),
      tagline: String(manifest.tagline ?? 'Play on the decentralized arcade.'),
      description: typeof manifest.description === 'string' ? manifest.description : undefined,
      developer: typeof manifest.developer === 'string' ? manifest.developer : undefined,
      genres: Array.isArray(manifest.genres) && manifest.genres.length ? manifest.genres.map(String) : ['arcade'],
      url: manifest.url,
      accent: /^#[0-9a-f]{6}$/i.test(manifest.accent) ? manifest.accent : '#7cf3ff',
      hero: editorial.hero?.[entry.name] ?? (localHero ? `/game-art/${entry.name}/${localHero}` : manifest.heroUrl ?? (localLogo ? `/game-art/${entry.name}/${localLogo}` : undefined)),
      logo: editorial.logo?.[entry.name] ?? (localLogo ? `/game-art/${entry.name}/${localLogo}` : manifest.logoUrl),
      featured: (edition.featured ?? editorial.featured)?.includes(entry.name) ?? false,
      trending: (edition.trending ?? editorial.trending)?.includes(entry.name) ?? false,
      newRelease: (edition.newReleases ?? editorial.new)?.includes(entry.name) ?? false,
      walletPay: manifest.capabilities?.walletPay === true,
      players: manifest.players,
      scoreKind: manifest.scoreKind,
      scoreField: manifest.scoreField,
      scoreDir: manifest.scoreDir,
    })
  }
  return games.sort((a, b) => {
    if (edition.gameSlugs) return edition.gameSlugs.indexOf(a.slug) - edition.gameSlugs.indexOf(b.slug)
    return Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name)
  })
}

async function copyArt(games: WebGame[]): Promise<void> {
  const target = join(outDir, 'game-art')
  const included = new Set(games.map(game => game.slug))
  await rm(target, { recursive: true, force: true })
  for (const game of await readdir(gamesDir, { withFileTypes: true })) {
    if (!game.isDirectory() || !included.has(game.name)) continue
    for (const name of ['hero.webp', 'hero.jpg', 'hero.png', 'logo.webp', 'logo.svg', 'logo.png']) {
      const source = join(gamesDir, game.name, name)
      if (!existsSync(source) || !isTracked(source)) continue
      const destination = join(target, game.name, name)
      await mkdir(join(target, game.name), { recursive: true })
      await copyFile(source, destination)
    }
  }
}

function htmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function routeShell(shell: string, title: string, description: string, path: string, image?: string): string {
  const canonical = `${webOrigin}${path}`
  let html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${htmlEscape(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${htmlEscape(description)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${htmlEscape(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${htmlEscape(description)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`)
  if (image) {
    const absolute = image.startsWith('/') ? `${webOrigin}${image}` : image
    html = html.replace('<meta property="og:type"', `<meta property="og:image" content="${htmlEscape(absolute)}">\n  <meta property="og:type"`)
  }
  return html
}

async function prerenderRoutes(games: WebGame[]): Promise<void> {
  const shell = await readFile(join(outDir, 'index.html'), 'utf8')
  const routes: Array<{ path: string; title: string; description: string; image?: string }> = [
    { path: '/scores', title: `Verified scores — ${edition.titleSuffix}`, description: `Live cryptographically verified Nostr leaderboards across the ${edition.titleSuffix}.` },
    { path: '/developers', title: 'Build for Gamestr', description: 'Validate, sign, and publish a sovereign Nostr game for web players and physical cabinets.' },
    ...games.map(game => ({ path: `/game/${game.slug}`, title: `${game.name} — ${edition.titleSuffix}`, description: game.description ?? game.tagline, image: game.hero })),
  ]
  for (const route of routes) {
    const directory = join(outDir, route.path.slice(1))
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'index.html'), routeShell(shell, route.title, route.description, `${route.path}/`, route.image))
  }
}

function editionHtml(html: string): string {
  return html
    .replace('<html lang="en">', `<html lang="en" data-web-edition="${htmlEscape(edition.key)}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${htmlEscape(edition.siteTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${htmlEscape(edition.siteDescription)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${htmlEscape(edition.siteTitle)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${htmlEscape(edition.siteDescription)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${webOrigin}/">`)
    .replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${htmlEscape(edition.themeColor)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${webOrigin}/">`)
}

async function writeEditionManifest(): Promise<void> {
  const path = join(outDir, 'manifest.webmanifest')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  manifest.name = edition.pwaName
  manifest.short_name = edition.pwaShortName
  manifest.description = edition.siteDescription
  manifest.background_color = edition.themeColor
  manifest.theme_color = edition.themeColor
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
  if (edition.key === '600') {
    await writeFile(join(outDir, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="600 Billion Arcade"><circle cx="64" cy="64" r="64" fill="#f7931a"/><g fill="#fff" font-family="Impact, sans-serif" font-size="34" font-weight="900" text-anchor="middle"><text x="64" y="37">600</text><text x="64" y="68">000</text><text x="64" y="99">000</text><text x="64" y="124">000</text></g></svg>\n`)
  }
}

function webData(): Plugin {
  return {
    name: 'gamestr-web-catalogue',
    transformIndexHtml: editionHtml,
    configureServer(server) {
      server.middlewares.use('/catalogue.json', async (_req, res) => {
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(await catalogue()))
      })
      server.middlewares.use('/schemas/game-manifest-v2.schema.json', async (_req, res) => {
        res.setHeader('content-type', 'application/schema+json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(await readFile(manifestSchema))
      })
      server.middlewares.use('/game-art', async (req, res, next) => {
        const match = /^\/([a-z0-9-]+)\/(hero|logo)\.(png|jpg|webp|svg)$/.exec(req.url ?? '')
        if (!match) return next()
        const path = join(gamesDir, match[1], `${match[2]}.${match[3]}`)
        try {
          const info = await stat(path)
          if (!info.isFile()) return next()
          res.setHeader('content-type', match[3] === 'svg' ? 'image/svg+xml' : `image/${match[3] === 'jpg' ? 'jpeg' : match[3]}`)
          res.end(await readFile(path))
        } catch { next() }
      })
    },
    async closeBundle() {
      const games = await catalogue()
      await writeFile(join(outDir, 'catalogue.json'), `${JSON.stringify(games, null, 2)}\n`)
      await mkdir(join(outDir, 'schemas'), { recursive: true })
      await copyFile(manifestSchema, join(outDir, 'schemas/game-manifest-v2.schema.json'))
      await copyArt(games)
      await writeEditionManifest()
      await prerenderRoutes(games)
    },
  }
}

function manifestValidator(): Plugin {
  return {
    name: 'gamestr-manifest-validator',
    resolveId(id) { return id === virtualValidator ? resolvedVirtualValidator : null },
    async load(id) {
      if (id !== resolvedVirtualValidator) return
      const schema = JSON.parse(await readFile(manifestSchema, 'utf8'))
      // URL syntax and HTTPS/credential policy are checked with the browser's URL parser after structural validation.
      const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, formats: { uri: true }, code: { source: true, esm: true } })
      let code = standaloneCode(ajv, ajv.compile(schema))
      code = code
        .replace('const func2 = require("ajv/dist/runtime/ucs2length").default;', 'const func2 = str => Array.from(str).length;')
        .replace('const func0 = require("ajv/dist/runtime/equal").default;', 'const func0 = (a,b) => a === b || (a && b && typeof a === "object" && typeof b === "object" && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => func0(a[key], b[key])));')
      if (code.includes('require(')) throw new Error('Manifest validator contains a non-browser runtime dependency')
      return code
    },
  }
}

export default defineConfig({
  root: webRoot,
  publicDir: join(webRoot, 'public'),
  plugins: [manifestValidator(), webData()],
  define: { __GAMESTR_WEB_EDITION__: JSON.stringify(edition.key) },
  build: { outDir, emptyOutDir: true, sourcemap: true },
  server: { host: '127.0.0.1', port: 4174 },
})
