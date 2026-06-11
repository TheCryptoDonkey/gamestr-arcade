import { join } from 'node:path'
import { stat, mkdir, readlink, readFile, writeFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

export interface IconDeps {
  exists(path: string): Promise<boolean>
  mtime(path: string): Promise<number>
  extractDirIcon(appImagePath: string, outPng: string): Promise<boolean>
  placeholder(slug: string): string
}

export async function resolveIcon(
  game: { slug: string; appImagePath?: string; siblingLogo?: string },
  cacheDir: string, deps: IconDeps
): Promise<string> {
  if (game.siblingLogo && await deps.exists(game.siblingLogo)) return game.siblingLogo
  if (game.appImagePath) {
    const cachePng = join(cacheDir, `${game.slug}.png`)
    if (await deps.exists(cachePng) && await deps.mtime(cachePng) >= await deps.mtime(game.appImagePath)) return cachePng
    if (await deps.extractDirIcon(game.appImagePath, cachePng)) return cachePng
  }
  return deps.placeholder(game.slug)
}

// ── Testable extraction deps ──────────────────────────────────────────────────

/**
 * Injectable dependencies for `extractDirIconWithDeps`.
 * All filesystem and process operations are injected so the cleanup behaviour
 * can be unit-tested without touching real tmp directories.
 */
export interface ExtractDirIconDeps {
  makeTmpDir(): Promise<string>
  spawnExtract(appImagePath: string, cwd: string): Promise<void>
  readlink(path: string): Promise<string>
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: Buffer): Promise<void>
  mkdir(path: string): Promise<void>
  rm(path: string): Promise<void>
}

/**
 * Extract `.DirIcon` from an AppImage into `outPng`.
 * Returns `true` on success, `false` on any failure.
 *
 * The work directory is ALWAYS removed in a `finally` block whether or not
 * extraction succeeds — preventing the ~100 MB squashfs-root leak on every run.
 */
export async function extractDirIconWithDeps(
  appImagePath: string,
  outPng: string,
  deps: ExtractDirIconDeps,
): Promise<boolean> {
  const work = await deps.makeTmpDir()
  try {
    await deps.spawnExtract(appImagePath, work)
    let icon = join(work, 'squashfs-root', '.DirIcon')
    try {
      const target = await deps.readlink(icon)
      icon = join(work, 'squashfs-root', target)
    } catch { /* not a symlink */ }
    const buf = await deps.readFile(icon)
    // Only accept PNG (magic bytes 89 50 4E 47); SVG/other → fall back to placeholder.
    if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) return false
    const outDir = outPng.slice(0, outPng.lastIndexOf('/'))
    await deps.mkdir(outDir)
    await deps.writeFile(outPng, buf)
    return true
  } catch {
    return false
  } finally {
    // Always remove the work directory to avoid ~100 MB squashfs-root leaks.
    await deps.rm(work)
  }
}

// ── Real deps ─────────────────────────────────────────────────────────────────

/** Real extraction deps: Linux-only (AppImage execution requires x86-64 Linux). */
function realExtractDeps(): ExtractDirIconDeps {
  return {
    makeTmpDir: async () => {
      const work = join(tmpdir(), `arcade-icon-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      await mkdir(work, { recursive: true })
      return work
    },
    spawnExtract: (appImagePath, cwd) => new Promise<void>((res, rej) => {
      const p = spawn(appImagePath, ['--appimage-extract', '.DirIcon'], { cwd, stdio: 'ignore' })
      p.on('error', rej)
      p.on('exit', code => code === 0 ? res() : rej(new Error(`extract ${code}`)))
    }),
    readlink,
    readFile: (p) => readFile(p),
    writeFile: (p, data) => writeFile(p, data),
    mkdir: async (path) => { await mkdir(path, { recursive: true }) },
    rm: async (path) => { await rm(path, { recursive: true, force: true }) },
  }
}

// Real deps (Linux for extractDirIcon; the rest are cross-platform).
export const realIconDeps = (placeholderPng: string): IconDeps => ({
  exists: async p => { try { await stat(p); return true } catch { return false } },
  mtime: async p => { try { return (await stat(p)).mtimeMs } catch { return 0 } },
  placeholder: () => placeholderPng,
  // `<appimage> --appimage-extract .DirIcon` writes ./squashfs-root/.DirIcon (often a PNG symlink).
  extractDirIcon: (appImagePath, outPng) => extractDirIconWithDeps(appImagePath, outPng, realExtractDeps()),
})
