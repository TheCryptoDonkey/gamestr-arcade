import { join } from 'node:path'
import { stat, mkdir, readlink } from 'node:fs/promises'
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

// Real deps (Linux for extractDirIcon; the rest are cross-platform).
export const realIconDeps = (placeholderPng: string): IconDeps => ({
  exists: async p => { try { await stat(p); return true } catch { return false } },
  mtime: async p => { try { return (await stat(p)).mtimeMs } catch { return 0 } },
  placeholder: () => placeholderPng,
  // `<appimage> --appimage-extract .DirIcon` writes ./squashfs-root/.DirIcon (often a PNG symlink).
  async extractDirIcon(appImagePath, outPng) {
    try {
      const work = join(tmpdir(), `arcade-icon-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      await mkdir(work, { recursive: true })
      await new Promise<void>((res, rej) => {
        const p = spawn(appImagePath, ['--appimage-extract', '.DirIcon'], { cwd: work, stdio: 'ignore' })
        p.on('error', rej); p.on('exit', code => code === 0 ? res() : rej(new Error(`extract ${code}`)))
      })
      let icon = join(work, 'squashfs-root', '.DirIcon')
      try { const target = await readlink(icon); icon = join(work, 'squashfs-root', target) } catch { /* not a symlink */ }
      // Only accept PNG (magic bytes 89 50 4E 47); SVG/other → fall back to placeholder.
      const { readFile, writeFile } = await import('node:fs/promises')
      const buf = await readFile(icon)
      if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) return false
      await mkdir(cacheDirOf(outPng), { recursive: true }); await writeFile(outPng, buf)
      return true
    } catch { return false }
  }
})

function cacheDirOf(file: string): string { return file.slice(0, file.lastIndexOf('/')) }
