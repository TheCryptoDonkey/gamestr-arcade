import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve('scripts/conference-status.mjs')
const temporaryRoots: string[] = []

async function writeManifest(root: string, slug: string, manifest: Record<string, unknown>): Promise<void> {
  const folder = join(root, slug)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'game.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

function runStatus(root: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [script, root], { encoding: 'utf8' })
}

async function temporaryGamesRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gamestr-conference-status-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('conference source gate', () => {
  it('accepts a controller title only with complete physical evidence', async () => {
    const root = await temporaryGamesRoot()
    await writeManifest(root, 'ready-game', {
      manifestVersion: 2,
      name: 'Ready Game',
      gameId: 'ready-game',
      inputModes: ['gamepad'],
      controller: {
        adapter: 'native',
        certification: {
          level: 'hardware',
          testedAt: '2026-09-01',
          hardware: ['Xbox Wireless Controller - USB'],
          profiles: ['standard', 'linux-hat'],
          gameRevision: 'sha256:verified-package',
        },
      },
      controlHints: ['LEFT STICK = MOVE'],
      network: 'optional',
    })

    const result = runStatus(root)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Conference status: READY')
    expect(result.stdout).toContain('Physical controller certification: 1/1')
  })

  it('does not let a player title evade certification by dropping gamepad input', async () => {
    const root = await temporaryGamesRoot()
    await writeManifest(root, 'keyboard-only', {
      manifestVersion: 2,
      name: 'Keyboard Only',
      gameId: 'keyboard-only',
      inputModes: ['keyboard'],
      controlHints: ['ARROWS = MOVE'],
      network: 'offline',
    })

    const result = runStatus(root)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('BLOCKER: Player title is not controller-playable: Keyboard Only')
  })

  it('requires at least one explicit outage fallback', async () => {
    const root = await temporaryGamesRoot()
    await writeManifest(root, 'online-only', {
      manifestVersion: 2,
      name: 'Online Only',
      gameId: 'online-only',
      inputModes: ['gamepad'],
      controller: {
        adapter: 'native',
        certification: {
          level: 'hardware',
          testedAt: '2026-09-01',
          hardware: ['Xbox Wireless Controller - USB'],
          profiles: ['standard', 'linux-hat'],
          gameRevision: 'sha256:verified-package',
        },
      },
      controlHints: ['LEFT STICK = MOVE'],
      network: 'required',
    })

    const result = runStatus(root)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('BLOCKER: No player title declares an offline-capable conference fallback')
  })

  it('excludes operator and download-only entries from the player controller gate', async () => {
    const root = await temporaryGamesRoot()
    await writeManifest(root, 'operator-tool', {
      manifestVersion: 2,
      name: 'Operator Tool',
      gameId: 'operator-tool',
      inputModes: ['keyboard'],
      operatorOnly: true,
    })
    await writeManifest(root, 'download', {
      manifestVersion: 2,
      name: 'Download',
      gameId: 'download',
      inputModes: ['pointer'],
      downloadOnly: true,
    })

    const result = runStatus(root)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Player catalogue: 0 games (0 controller titles)')
  })
})
