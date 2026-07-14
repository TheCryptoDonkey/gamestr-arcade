import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  Game,
  GameCapabilities,
  GameInputMode,
  GameNetworkMode,
  GameRewardRules,
} from '../shared/types'

const APPIMAGE_RE = /\.AppImage$/i

function prettify(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function firstAppImage(dir: string): Promise<string | undefined> {
  const entries = await readdir(dir)
  const hit = entries.find(e => APPIMAGE_RE.test(e))
  return hit ? join(dir, hit) : undefined
}

async function readJson(path: string): Promise<Record<string, any> | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

async function firstExisting(dir: string, names: readonly string[]): Promise<string | undefined> {
  for (const name of names) {
    const path = join(dir, name)
    if (await exists(path)) return path
  }
  return undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = Array.from(new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean)))
  return out.length ? out : undefined
}

const INPUT_MODES = new Set<GameInputMode>(['gamepad', 'keyboard', 'pointer', 'touch'])
function inputModes(value: unknown): GameInputMode[] | undefined {
  const values = stringArray(value)?.filter((v): v is GameInputMode => INPUT_MODES.has(v as GameInputMode))
  return values?.length ? values : undefined
}

function networkMode(value: unknown, kind: Game['kind']): GameNetworkMode {
  if (value === 'required' || value === 'optional' || value === 'offline') return value
  return kind === 'web' ? 'required' : 'optional'
}

function capabilities(value: unknown): GameCapabilities | undefined {
  if (typeof value !== 'object' || !value) return undefined
  const o = value as Record<string, unknown>
  const result: GameCapabilities = {}
  for (const key of ['nostrSign', 'walletPay', 'persistentStorage', 'externalNavigation'] as const) {
    if (typeof o[key] === 'boolean') result[key] = o[key]
  }
  return Object.keys(result).length ? result : undefined
}

function rewardRules(value: unknown): GameRewardRules | undefined {
  if (typeof value !== 'object' || !value) return undefined
  const o = value as Record<string, unknown>
  if (typeof o.enabled !== 'boolean') return undefined
  return { enabled: o.enabled, label: typeof o.label === 'string' ? o.label.trim() || undefined : undefined }
}

function playerRange(value: unknown): { min: number; max: number } | undefined {
  if (typeof value !== 'object' || !value) return undefined
  const o = value as Record<string, unknown>
  const min = Number(o.min)
  const max = Number(o.max)
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min || max > 64) return undefined
  return { min, max }
}

function normaliseOrigins(value: unknown): string[] | undefined {
  const out: string[] = []
  for (const raw of stringArray(value) ?? []) {
    try {
      const url = new URL(raw)
      if (validWebUrl(url.href)) out.push(url.origin)
    } catch { /* invalid origin → omit */ }
  }
  const unique = Array.from(new Set(out))
  return unique.length ? unique : undefined
}

function validWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  } catch {
    return false
  }
}

export type LogoResolver = (g: { slug: string; appImagePath?: string; siblingLogo?: string; logoUrl?: string; gameUrl?: string }) => Promise<string>
export type HeroResolver = (g: { heroUrl?: string; gameUrl?: string }) => Promise<string | null>
const passthroughLogo: LogoResolver = async g => g.siblingLogo ?? ''
const noHero: HeroResolver = async () => null

export async function scanGames(
  gamesDir: string,
  resolveLogo: LogoResolver = passthroughLogo,
  resolveHero: HeroResolver = noHero,
): Promise<Game[]> {
  let entries: string[] = []
  try { entries = await readdir(gamesDir) } catch { return [] }
  const games: Game[] = []

  for (const entry of entries) {
    const full = join(gamesDir, entry)
    const info = await stat(full).catch(() => null)
    if (!info) continue

    // Loose top-level *.AppImage → native game, slug from filename.
    if (info.isFile() && APPIMAGE_RE.test(entry)) {
      const slug = entry.replace(APPIMAGE_RE, '')
      games.push(await build(slug, gamesDir, { kind: 'appimage', exec: full }, null, resolveLogo, resolveHero, undefined))
      continue
    }
    if (!info.isDirectory()) continue

    const meta = await readJson(join(full, 'game.json'))
    const appImage = await firstAppImage(full)
    // Precedence: a present local AppImage wins; a declared web URL is the
    // graceful fallback when an optional native build has not been installed.
    const execPath = !appImage && meta?.exec
      ? (meta.exec as string).startsWith('/') ? meta.exec : join(full, meta.exec)
      : undefined
    if (appImage) {
      games.push(await build(entry, full, { kind: 'appimage', exec: appImage }, meta, resolveLogo, resolveHero, appImage))
    } else if (execPath && await exists(execPath)) {
      games.push(await build(entry, full, { kind: 'appimage', exec: execPath }, meta, resolveLogo, resolveHero, execPath))
    } else if (meta?.url) {
      games.push(await build(entry, full, { kind: 'web', url: meta.url }, meta, resolveLogo, resolveHero, undefined))
    } else if (execPath) {
      // Keep exec-only manifests visible so operators get a concrete readiness
      // diagnosis instead of a silently missing catalogue tile.
      games.push(await build(entry, full, { kind: 'appimage', exec: execPath }, meta, resolveLogo, resolveHero, execPath))
    } // else: neither AppImage, exec, nor url → skip (empty/placeholder folder)
  }
  return games.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

async function build(
  slug: string, dir: string,
  launch: { kind: 'appimage'; exec: string } | { kind: 'web'; url: string },
  meta: Record<string, any> | null,
  resolveLogo: LogoResolver,
  resolveHero: HeroResolver,
  appImagePath?: string
): Promise<Game> {
  const siblingLogo = await firstExisting(dir, ['logo.png', 'logo.webp', 'logo.jpg', 'logo.jpeg', 'logo.svg'])
  const siblingHero = await firstExisting(dir, ['hero.mp4', 'hero.webm', 'hero.webp', 'hero.png', 'hero.jpg', 'hero.jpeg'])

  // game.json optional art URLs.
  const logoUrl: string | undefined = meta?.logoUrl
  const heroUrl: string | undefined = meta?.heroUrl
  // The game's web URL — used for page-derived art (og:image, favicons).
  const gameUrl: string | undefined = launch.kind === 'web' ? launch.url : meta?.url

  const gameId = meta?.gameId ?? slug

  // Sibling hero wins; otherwise try resolveHero (heroUrl / og:image derivation).
  const hero = siblingHero ?? (await resolveHero({ heroUrl, gameUrl })) ?? undefined

  const available = launch.kind === 'appimage' ? await exists(launch.exec) : validWebUrl(launch.url)
  const availabilityReason = available
    ? undefined
    : launch.kind === 'appimage'
      ? 'Native game file is missing.'
      : 'Game URL is invalid.'

  const sessionMinutes = Number(meta?.sessionMinutes)
  const manifestVersion = Number(meta?.manifestVersion)

  return {
    id: slug,
    name: meta?.name ?? prettify(slug),
    tagline: meta?.tagline,
    ...launch,
    args: Array.isArray(meta?.args) ? (meta.args as unknown[]).map(String) : undefined,
    gameId,
    tHints: meta?.tHints,
    // `textLogo: true` opts out of icon art entirely so the shell renders its neon
    // text wordmark (and the filmstrip a monogram) — used for games whose only art
    // is a backdrop, not a clean cut-out logo.
    logo: meta?.textLogo === true ? '' : await resolveLogo({ slug, appImagePath, siblingLogo, logoUrl, gameUrl }),
    hero,
    accent: meta?.accent,
    // Download-only games stay in the carousel (greyed + ribboned) but can't be
    // launched in the kiosk; downloadUrl is the QR target (falls back to url).
    downloadOnly: meta?.downloadOnly === true ? true : undefined,
    downloadUrl: typeof meta?.downloadUrl === 'string' ? meta.downloadUrl : undefined,
    sounds: { music: (await exists(join(dir, 'music.ogg'))) ? join(dir, 'music.ogg') : undefined,
              voice: (await exists(join(dir, 'voice.ogg'))) ? join(dir, 'voice.ogg') : undefined },
    controls: meta?.controls ?? undefined,
    manifestVersion: Number.isSafeInteger(manifestVersion) && manifestVersion > 0 ? manifestVersion : undefined,
    developer: typeof meta?.developer === 'string' ? meta.developer.trim() || undefined : undefined,
    // Author-declared Lightning address — the post-game zap ask tips the game's
    // developer directly, falling back to the booth's own donation address.
    tips: typeof meta?.tips === 'string' && meta.tips.trim().length >= 6 ? meta.tips.trim() : undefined,
    description: typeof meta?.description === 'string' ? meta.description.trim() || undefined : undefined,
    genres: stringArray(meta?.genres),
    inputModes: inputModes(meta?.inputModes),
    controlHints: stringArray(meta?.controlHints),
    sessionMinutes: Number.isSafeInteger(sessionMinutes) && sessionMinutes > 0 && sessionMinutes <= 1440 ? sessionMinutes : undefined,
    players: playerRange(meta?.players),
    network: networkMode(meta?.network, launch.kind),
    ageRating: typeof meta?.ageRating === 'string' ? meta.ageRating.trim() || undefined : undefined,
    capabilities: capabilities(meta?.capabilities),
    rewardRules: rewardRules(meta?.rewardRules),
    allowedOrigins: normaliseOrigins(meta?.allowedOrigins),
    available,
    availabilityReason,
    order: typeof meta?.order === 'number' ? meta.order : 999,
    scoreKind: typeof meta?.scoreKind === 'number' ? meta.scoreKind : undefined,
    scoreField: typeof meta?.scoreField === 'string' ? meta.scoreField : undefined,
    scoreDir: meta?.scoreDir === 'asc' || meta?.scoreDir === 'desc' ? meta.scoreDir : undefined,
  }
}
