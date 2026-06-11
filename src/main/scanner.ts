import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Game } from '../shared/types'

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

export type LogoResolver = (g: { slug: string; appImagePath?: string; siblingLogo?: string }) => Promise<string>
const passthroughLogo: LogoResolver = async g => g.siblingLogo ?? ''

export async function scanGames(gamesDir: string, resolveLogo: LogoResolver = passthroughLogo): Promise<Game[]> {
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
      games.push(await build(slug, gamesDir, { kind: 'appimage', exec: full }, null, resolveLogo, undefined))
      continue
    }
    if (!info.isDirectory()) continue

    const meta = await readJson(join(full, 'game.json'))
    const appImage = await firstAppImage(full)
    // Precedence: loose *.AppImage in folder > game.json.exec > game.json.url
    const execPath = !appImage && meta?.exec
      ? (meta.exec as string).startsWith('/') ? meta.exec : join(full, meta.exec)
      : undefined
    if (appImage) {
      games.push(await build(entry, full, { kind: 'appimage', exec: appImage }, meta, resolveLogo, appImage))
    } else if (execPath) {
      games.push(await build(entry, full, { kind: 'appimage', exec: execPath }, meta, resolveLogo, execPath))
    } else if (meta?.url) {
      games.push(await build(entry, full, { kind: 'web', url: meta.url }, meta, resolveLogo, undefined))
    } // else: neither AppImage, exec, nor url → skip (empty/placeholder folder)
  }
  return games.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

async function build(
  slug: string, dir: string,
  launch: { kind: 'appimage'; exec: string } | { kind: 'web'; url: string },
  meta: Record<string, any> | null, resolveLogo: LogoResolver, appImagePath?: string
): Promise<Game> {
  const siblingLogo = (await exists(join(dir, 'logo.png'))) ? join(dir, 'logo.png') : undefined
  const heroPng = join(dir, 'hero.png'); const heroMp4 = join(dir, 'hero.mp4')
  const hero = (await exists(heroPng)) ? heroPng : (await exists(heroMp4)) ? heroMp4 : undefined
  const gameId = meta?.gameId ?? slug
  return {
    id: slug,
    name: meta?.name ?? prettify(slug),
    tagline: meta?.tagline,
    ...launch,
    gameId,
    tHints: meta?.tHints,
    logo: await resolveLogo({ slug, appImagePath, siblingLogo }),
    hero,
    accent: meta?.accent,
    sounds: { music: (await exists(join(dir, 'music.ogg'))) ? join(dir, 'music.ogg') : undefined,
              voice: (await exists(join(dir, 'voice.ogg'))) ? join(dir, 'voice.ogg') : undefined },
    order: typeof meta?.order === 'number' ? meta.order : 999
  }
}
