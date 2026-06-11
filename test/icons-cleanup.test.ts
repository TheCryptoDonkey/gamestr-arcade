/**
 * Tests for the extractDirIcon tmp-dir cleanup fix.
 *
 * The real extractDirIcon (in realIconDeps) uses a tmp squashfs-root directory
 * that must be removed in a finally block regardless of success or failure.
 * We test the exported testable variant with injected dependencies.
 */

import { describe, it, expect } from 'vitest'
import { extractDirIconWithDeps, type ExtractDirIconDeps } from '../src/main/icons'

function makeSuccessDeps(): { deps: ExtractDirIconDeps; cleaned: string[] } {
  const cleaned: string[] = []
  const deps: ExtractDirIconDeps = {
    makeTmpDir: async () => '/tmp/arcade-icon-test',
    spawnExtract: async () => { /* success */ },
    readlink: async () => { throw Object.assign(new Error('not a symlink'), { code: 'EINVAL' }) },
    readFile: async () => {
      // PNG magic bytes: 89 50 4E 47 (followed by zeros)
      const buf = Buffer.alloc(8)
      buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47
      return buf
    },
    writeFile: async () => { /* ok */ },
    mkdir: async () => { /* ok */ },
    rm: async (path) => { cleaned.push(path) },
  }
  return { deps, cleaned }
}

function makeFailDeps(failAt: 'spawn' | 'readFile' | 'writeFile'): { deps: ExtractDirIconDeps; cleaned: string[] } {
  const cleaned: string[] = []
  const deps: ExtractDirIconDeps = {
    makeTmpDir: async () => '/tmp/arcade-icon-test',
    spawnExtract: async () => {
      if (failAt === 'spawn') throw new Error('spawn failed')
    },
    readlink: async () => { throw Object.assign(new Error('not a symlink'), { code: 'EINVAL' }) },
    readFile: async () => {
      if (failAt === 'readFile') throw new Error('read failed')
      const buf = Buffer.alloc(8)
      buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47
      return buf
    },
    writeFile: async () => {
      if (failAt === 'writeFile') throw new Error('write failed')
    },
    mkdir: async () => { /* ok */ },
    rm: async (path) => { cleaned.push(path) },
  }
  return { deps, cleaned }
}

describe('extractDirIconWithDeps — tmp dir cleanup', () => {
  it('removes the work dir on successful extraction', async () => {
    const { deps, cleaned } = makeSuccessDeps()
    const result = await extractDirIconWithDeps('/game.AppImage', '/cache/game.png', deps)
    expect(result).toBe(true)
    expect(cleaned).toContain('/tmp/arcade-icon-test')
  })

  it('removes the work dir when spawn fails', async () => {
    const { deps, cleaned } = makeFailDeps('spawn')
    const result = await extractDirIconWithDeps('/game.AppImage', '/cache/game.png', deps)
    expect(result).toBe(false)
    expect(cleaned).toContain('/tmp/arcade-icon-test')
  })

  it('removes the work dir when readFile fails', async () => {
    const { deps, cleaned } = makeFailDeps('readFile')
    const result = await extractDirIconWithDeps('/game.AppImage', '/cache/game.png', deps)
    expect(result).toBe(false)
    expect(cleaned).toContain('/tmp/arcade-icon-test')
  })

  it('removes the work dir when writeFile fails', async () => {
    const { deps, cleaned } = makeFailDeps('writeFile')
    const result = await extractDirIconWithDeps('/game.AppImage', '/cache/game.png', deps)
    expect(result).toBe(false)
    expect(cleaned).toContain('/tmp/arcade-icon-test')
  })

  it('returns false (not throws) when magic bytes are wrong (SVG)', async () => {
    const cleaned: string[] = []
    const deps: ExtractDirIconDeps = {
      makeTmpDir: async () => '/tmp/arcade-icon-test',
      spawnExtract: async () => {},
      readlink: async () => { throw new Error('not symlink') },
      readFile: async () => {
        const buf = Buffer.alloc(8) // all zeros — not a PNG
        return buf
      },
      writeFile: async () => {},
      mkdir: async () => {},
      rm: async (path) => { cleaned.push(path) },
    }
    const result = await extractDirIconWithDeps('/game.AppImage', '/cache/game.png', deps)
    expect(result).toBe(false)
    expect(cleaned).toContain('/tmp/arcade-icon-test')
  })
})
