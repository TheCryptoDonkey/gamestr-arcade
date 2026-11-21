import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Game, LocalGameSettings } from '../shared/types'
import { pathToMediaUrl } from './games'
import { localUrlFor } from './local-server'
import { scanGames } from './scanner'

const CABINET_IDS = ['pallasite', 'neon-sentinel', 'hang-on-fren']

async function hasBundle(directory: string): Promise<boolean> {
  try {
    const revision = (await readFile(join(directory, 'revision'), 'utf8')).trim()
    return /^[a-f0-9]{40}$/.test(revision) && (await lstat(join(directory, 'site', 'index.html'))).isFile()
  } catch {
    return false
  }
}

export class CabinetGames {
  private readonly installing = new Map<string, Promise<void>>()

  constructor(
    private readonly packages: string,
    private readonly library: string,
  ) {}

  async listPackages(): Promise<LocalGameSettings['bundled']> {
    const bundles = await scanGames(this.packages)
    const installed = await scanGames(this.library)
    const packages: LocalGameSettings['bundled'] = []
    for (const id of CABINET_IDS) {
      const present = await hasBundle(join(this.library, id))
      const game = bundles.find(game => game.id === id) ?? installed.find(game => game.id === id)
      if (game && (present || await hasBundle(join(this.packages, id)))) {
        packages.push({ id, name: game.name, installed: present })
      }
    }
    return packages
  }

  async addToCatalogue(games: Game[], port?: number): Promise<Game[]> {
    const bundled = await scanGames(this.packages)
    for (const id of CABINET_IDS) {
      const index = games.findIndex(game => game.id === id)
      const existing = games[index]
      const directory = join(this.library, id)
      const installed = await hasBundle(directory)
      // Operators with a Hang On, Fren tile can switch to the offline copy in Games Settings.
      if (!installed && existing?.available !== false &&
        (existing?.kind === 'appimage' || (id === 'hang-on-fren' && existing?.kind === 'web'))) continue
      let pack = bundled.find(game => game.id === id)
      if (!await hasBundle(join(this.packages, id))) pack = undefined
      if (!pack && installed) pack = (await scanGames(this.library)).find(game => game.id === id)
      if (!pack) {
        if (existing && existing.kind === 'web' && !existing.localSite) {
          games[index] = { ...existing, available: false, availabilityReason: 'The cabinet package is unavailable.' }
        }
        continue
      }
      const game: Game = {
        ...pack,
        kind: 'web',
        exec: undefined,
        args: undefined,
        logo: pathToMediaUrl(pack.logo),
        operatorOnly: existing?.operatorOnly ?? pack.operatorOnly,
        url: installed && port !== undefined ? localUrlFor(port) : undefined,
        localRoot: installed ? join(directory, 'site') : undefined,
        localSite: installed,
        cabinetInstall: installed ? 'installed' : 'available',
        available: port !== undefined,
        availabilityReason: port === undefined ? 'The cabinet’s local game server is unavailable.' : undefined,
        network: 'offline',
        conferenceFallback: undefined,
        capabilities: undefined,
        allowedOrigins: undefined,
      }
      if (index === -1) games.push(game)
      else games[index] = game
    }
    return games.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  }

  async install(id: string): Promise<void> {
    if (!CABINET_IDS.includes(id)) throw new Error('This game has no cabinet package.')
    let pending = this.installing.get(id)
    if (!pending) {
      pending = this.copyPackage(id).finally(() => this.installing.delete(id))
      this.installing.set(id, pending)
    }
    await pending
  }

  private async copyPackage(id: string): Promise<void> {
    const destination = join(this.library, id)
    if (await hasBundle(destination)) return
    const source = join(this.packages, id)
    if (!await hasBundle(source)) throw new Error('The game package is missing or incomplete.')
    await mkdir(this.library, { recursive: true, mode: 0o700 })
    const staging = await mkdtemp(join(this.library, '.install-'))
    try {
      const next = join(staging, id)
      await cp(source, next, {
        recursive: true,
        filter: async path => {
          const info = await lstat(path)
          if (!info.isFile() && !info.isDirectory()) throw new Error('The game package contains an unsupported file.')
          return true
        },
      })
      if (!await hasBundle(next)) throw new Error('The copied game package is incomplete.')
      try {
        await rename(next, destination)
      } catch (error) {
        if (!await hasBundle(destination)) throw error
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}
