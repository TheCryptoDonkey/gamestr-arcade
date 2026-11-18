import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CabinetGames } from '../src/main/cabinet-games'

describe('cabinet game installation', () => {
  let root: string
  let bundled: string
  let library: string
  let cabinet: CabinetGames

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'gamestr-install-test-'))
    bundled = join(root, 'packages', 'pallasite')
    library = join(root, 'installed')
    cabinet = new CabinetGames(join(root, 'packages'), library)
    await mkdir(join(bundled, 'site'), { recursive: true })
    await writeFile(join(bundled, 'revision'), '0'.repeat(40))
    await writeFile(join(bundled, 'game.json'), JSON.stringify({
      name: 'Pallasite', url: 'https://pallasite.app/', capabilities: { walletPay: true },
      conferenceFallback: true,
    }))
    await writeFile(join(bundled, 'site', 'index.html'), '<canvas>local game</canvas>')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('installs once across concurrent requests and resolves only the copied local game', async () => {
    const [available] = await cabinet.addToCatalogue([], 31234)
    expect(available).toMatchObject({ cabinetInstall: 'available' })
    expect(available.url).toBeUndefined()
    await Promise.all([cabinet.install('pallasite'), cabinet.install('pallasite')])
    expect(await readFile(join(library, 'pallasite', 'site', 'index.html'), 'utf8')).toContain('local game')

    const freshCabinet = new CabinetGames(join(root, 'packages'), library)
    const [installed] = await freshCabinet.addToCatalogue([], 31235)
    expect(installed).toMatchObject({ cabinetInstall: 'installed', url: 'http://127.0.0.1:31235/', network: 'offline' })
    expect(installed.capabilities).toBeUndefined()
    expect(installed.conferenceFallback).toBeUndefined()
  })

  it('preserves a working native game selected by the operator', async () => {
    const [available] = await cabinet.addToCatalogue([], 31234)
    const native = { ...available, kind: 'appimage' as const, exec: '/games/Pallasite.AppImage', cabinetInstall: undefined }
    expect(await cabinet.addToCatalogue([native], 31234)).toEqual([native])
  })

  it('keeps a failed copy uninstalled, accepts a retry and refuses outside paths', async () => {
    const link = join(bundled, 'site', 'outside')
    await symlink(root, link)
    await expect(cabinet.install('pallasite')).rejects.toThrow('unsupported file')
    expect((await cabinet.addToCatalogue([], 31234))[0].cabinetInstall).toBe('available')
    await rm(link)
    await expect(cabinet.install('pallasite')).resolves.toBeUndefined()
    await expect(cabinet.install('../pallasite')).rejects.toThrow('no cabinet package')
  })
})
