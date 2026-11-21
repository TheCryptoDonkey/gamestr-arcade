import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DesktopGameId } from '../shared/types'

const RELEASE = 'https://github.com/TheCryptoDonkey/pallasite-releases/releases/download/v0.1.4'
const ASSETS = {
  linux: {
    name: 'Pallasite-linux-x86_64.AppImage',
    size: 408079273,
    sha256: '57adf116a15f7539a4f5c9c42b47512d332a3080179f19efe0e67d9b5b113fc6',
  },
  win32: {
    name: 'Pallasite-win-x64.exe',
    size: 379301043,
    sha256: '3ca7b02b1a7da07e7708cabf098e7558c1332094b49ad6de09bc54287f4359b2',
  },
}

const WINDOWS_EXE = {
  pallasite: 'Pallasite.exe',
  'btc-proof-of-play': 'BTC Proof of Play.exe',
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(info => info.isFile(), () => false)
}

export async function isWindowsGame(id: DesktopGameId, executable: string): Promise<boolean> {
  if (!isAbsolute(executable) || basename(executable).toLowerCase() !== WINDOWS_EXE[id].toLowerCase()) return false
  if (!await fileExists(executable)) return false
  const directory = dirname(executable)
  if (id === 'pallasite') return fileExists(join(directory, 'resources', 'dist', 'index.html'))
  const data = await stat(join(directory, 'BTC Proof of Play_Data')).catch(() => null)
  return !!data?.isDirectory() && await fileExists(join(directory, 'UnityPlayer.dll'))
}

const INSTALL_FOLDER = {
  pallasite: /pallasite/i,
  'btc-proof-of-play': /proof.?of.?play|btc.?pop/i,
}

export interface SearchRoot {
  path: string
  /** Search every child folder instead of only folders named after the game. */
  anyName?: boolean
}

/** Places publishers, itch and players commonly install Windows games. */
export function windowsSearchRoots(env: NodeJS.ProcessEnv): SearchRoot[] {
  const paths = [
    env.LOCALAPPDATA, env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs'),
    env.APPDATA, env.APPDATA && join(env.APPDATA, 'itch', 'apps'),
    env.ProgramFiles, env['ProgramFiles(x86)'],
    env.USERPROFILE && join(env.USERPROFILE, 'Desktop'), env.USERPROFILE && join(env.USERPROFILE, 'Downloads'),
    env.USERPROFILE && join(env.USERPROFILE, 'Documents'), env.USERPROFILE && join(env.USERPROFILE, 'Games'),
    env.SystemDrive && join(env.SystemDrive + '\\', 'Games'),
  ]
  return [...new Set(paths.filter((path): path is string => !!path))].map(path => ({ path }))
}

/**
 * Find an installed game client below the given roots. Launchers often install
 * themselves beside the real client, so this checks the folder layout as well
 * as the executable name. The walk is bounded so a large drive cannot stall it.
 */
export async function findInstalledGame(
  id: DesktopGameId,
  roots: SearchRoot[],
  check: (id: DesktopGameId, executable: string) => Promise<boolean> = isWindowsGame,
): Promise<string | undefined> {
  const directories = async (path: string) =>
    (await readdir(path, { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory())
  for (const root of roots) {
    const queue = (await directories(root.path))
      .filter(entry => root.anyName || INSTALL_FOLDER[id].test(entry.name))
      .map(entry => ({ path: join(root.path, entry.name), depth: 1 }))
    if (root.anyName) queue.unshift({ path: root.path, depth: 0 })
    for (let visited = 0; queue.length && visited < 400; visited++) {
      const { path, depth } = queue.shift()!
      const executable = join(path, WINDOWS_EXE[id])
      if (await check(id, executable)) return executable
      if (depth >= 5) continue
      for (const entry of await directories(path)) {
        // Unity data folders hold thousands of assets and never the client.
        if (!/_Data$/i.test(entry.name)) queue.push({ path: join(path, entry.name), depth: depth + 1 })
      }
    }
  }
  return undefined
}

export async function writeVerifiedDownload(
  response: Response,
  target: string,
  expected: { size: number; sha256: string },
): Promise<void> {
  if (!response.ok || !response.body) throw new Error('Pallasite download is unavailable.')
  let bytes = 0
  const hash = createHash('sha256')
  const reader = response.body.getReader()
  const chunks = async function* () {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > expected.size) throw new Error('The Pallasite download exceeded the expected size.')
        hash.update(value)
        yield value
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
  await pipeline(Readable.from(chunks()), createWriteStream(target, { flags: 'wx', mode: 0o700 }))
  if (bytes !== expected.size || hash.digest('hex') !== expected.sha256) {
    throw new Error('The Pallasite download did not match the publisher’s checksum.')
  }
}

export class DesktopGames {
  private installing: Promise<void> | undefined

  constructor(private readonly directory: string) {}

  canDownloadPallasite(): boolean {
    return process.arch === 'x64' && (process.platform === 'linux' || process.platform === 'win32')
  }

  async linked(id: DesktopGameId): Promise<string | undefined> {
    const executable = await readFile(join(this.directory, id + '.path'), 'utf8').catch(() => '')
    if (!executable) return undefined
    if (process.platform === 'win32') return await isWindowsGame(id, executable) ? executable : undefined
    return process.platform === 'linux' && id === 'pallasite'
      && executable === join(this.directory, ASSETS.linux.name) && await fileExists(executable)
      ? executable : undefined
  }

  /** Link an installed client found in the usual install folders. */
  async detectWindowsGame(id: DesktopGameId, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
    if (process.platform !== 'win32') return false
    const executable = await findInstalledGame(id, windowsSearchRoots(env))
    if (!executable) return false
    await this.saveLink(id, executable)
    return true
  }

  async linkWindowsGame(id: DesktopGameId, selected: string): Promise<void> {
    if (process.platform !== 'win32') throw new Error('Linking an installed game requires Windows.')
    // A launcher or installer is often selected by mistake. Look for the real
    // client beside it before asking the player to choose again.
    const executable = await isWindowsGame(id, selected)
      ? selected
      : await findInstalledGame(id, [{ path: dirname(selected), anyName: true }])
    if (!executable) {
      const data = id === 'pallasite' ? 'resources' : 'BTC Proof of Play_Data and UnityPlayer.dll'
      throw new Error('That is not the game itself. Choose ' + WINDOWS_EXE[id] + ' in the folder that also contains ' + data + '.')
    }
    await this.saveLink(id, executable)
  }

  async useOfflinePallasite(): Promise<void> {
    await rm(join(this.directory, 'pallasite.path'), { force: true })
  }

  installPallasite(runSetup: (installer: string) => Promise<void>): Promise<void> {
    this.installing ??= this.downloadPallasite(runSetup).finally(() => { this.installing = undefined })
    return this.installing
  }

  private async saveLink(id: DesktopGameId, executable: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const staging = await mkdtemp(join(this.directory, '.link-'))
    try {
      const file = join(staging, 'path')
      await writeFile(file, executable, { mode: 0o600 })
      await rename(file, join(this.directory, id + '.path'))
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }

  private async downloadPallasite(runSetup: (installer: string) => Promise<void>): Promise<void> {
    const platform = process.platform
    if (!this.canDownloadPallasite() || (platform !== 'win32' && platform !== 'linux')) {
      throw new Error('The Pallasite desktop download requires 64-bit Windows or Linux.')
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const asset = ASSETS[platform]
    const staging = await mkdtemp(join(this.directory, '.download-'))
    try {
      const file = join(staging, asset.name)
      const response = await fetch(RELEASE + '/' + asset.name, { signal: AbortSignal.timeout(20 * 60_000) })
      await writeVerifiedDownload(response, file, asset)
      if (platform === 'linux') {
        const game = join(this.directory, asset.name)
        await rename(file, game)
        await this.saveLink('pallasite', game)
      } else {
        await runSetup(file)
        const directories = [
          process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Pallasite'),
          process.env.ProgramFiles && join(process.env.ProgramFiles, 'Pallasite'),
        ]
        for (const directory of directories) {
          if (!directory) continue
          const game = join(directory, WINDOWS_EXE.pallasite)
          if (await isWindowsGame('pallasite', game)) {
            await this.saveLink('pallasite', game)
            return
          }
        }
        throw new Error('Use Find Pallasite Desktop on this PC if you installed Pallasite in a different folder.')
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}
