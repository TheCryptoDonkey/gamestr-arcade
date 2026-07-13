import { defineConfig, type Plugin } from 'vite'
import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const projectRoot = import.meta.dirname
const gamesDir = join(projectRoot, 'games')
const webRoot = join(projectRoot, 'src/web')
const outDir = join(projectRoot, 'dist-web')
const manifestSchema = join(projectRoot, 'schemas/game-manifest-v2.schema.json')
const virtualValidator = 'virtual:gamestr-manifest-validator'
const resolvedVirtualValidator = `\0${virtualValidator}`

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
      hero: editorial.hero?.[entry.name] ?? (localHero ? `/game-art/${entry.name}/${localHero}` : manifest.heroUrl),
      logo: localLogo ? `/game-art/${entry.name}/${localLogo}` : manifest.logoUrl,
      featured: editorial.featured?.includes(entry.name) ?? false,
      trending: editorial.trending?.includes(entry.name) ?? false,
      newRelease: editorial.new?.includes(entry.name) ?? false,
      walletPay: manifest.capabilities?.walletPay === true,
      players: manifest.players,
      scoreKind: manifest.scoreKind,
      scoreField: manifest.scoreField,
      scoreDir: manifest.scoreDir,
    })
  }
  return games.sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name))
}

async function copyArt(): Promise<void> {
  const target = join(outDir, 'game-art')
  await rm(target, { recursive: true, force: true })
  for (const game of await readdir(gamesDir, { withFileTypes: true })) {
    if (!game.isDirectory()) continue
    for (const name of ['hero.webp', 'hero.jpg', 'hero.png', 'logo.webp', 'logo.svg', 'logo.png']) {
      const source = join(gamesDir, game.name, name)
      if (!existsSync(source) || !isTracked(source)) continue
      const destination = join(target, game.name, name)
      await mkdir(join(target, game.name), { recursive: true })
      await copyFile(source, destination)
    }
  }
}

function webData(): Plugin {
  return {
    name: 'gamestr-web-catalogue',
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
      await writeFile(join(outDir, 'catalogue.json'), `${JSON.stringify(await catalogue(), null, 2)}\n`)
      await mkdir(join(outDir, 'schemas'), { recursive: true })
      await copyFile(manifestSchema, join(outDir, 'schemas/game-manifest-v2.schema.json'))
      await copyArt()
    },
  }
}

function manifestValidator(): Plugin {
  return {
    name: 'gamestr-manifest-validator',
    resolveId(id) { if (id === virtualValidator) return resolvedVirtualValidator },
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
  build: { outDir, emptyOutDir: true, sourcemap: true },
  server: { host: '127.0.0.1', port: 4174 },
})
