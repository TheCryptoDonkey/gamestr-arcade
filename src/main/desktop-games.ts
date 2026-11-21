import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import type { DesktopGameId, Game } from '../shared/types'

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

export const WINDOWS_EXE = {
  pallasite: 'Pallasite.exe',
  'btc-proof-of-play': 'BTC Proof of Play.exe',
}

const PROOF_OF_PLAY = 'btc-proof-of-play'
const PROOF_OF_PLAY_BUILD = {
  version: '5.1.0',
  url: 'https://updates.btcproofofplay.xyz/btcpop/windows/btcpop-windows-5.1.0.zip',
  size: 409750087,
  sha256: 'd15d36e73b2d33484577ea4063f142e1638b56386f1a1ec446ed6b773d61cb47',
}
const runFile = promisify(execFile)

export function withProofOfPlayGraphics(game: Game, platform: NodeJS.Platform = process.platform): Game {
  if (platform !== 'linux' || game.kind !== 'appimage' || game.gameId !== PROOF_OF_PLAY ||
    !game.exec || basename(game.exec) !== 'btcproofofplay.x86_64') return game

  const args = (game.args ?? []).filter(arg => arg !== '-force-vulkan')
  if (!args.some(arg => /^-force-glcore(?:32|33|40|41|42|43|44|45)?$/.test(arg))) args.push('-force-glcore')
  return { ...game, args }
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(info => info.isFile(), () => false)
}

export async function isWindowsGame(id: DesktopGameId, executable: string): Promise<boolean> {
  if (!isAbsolute(executable) || basename(executable).toLowerCase() !== WINDOWS_EXE[id].toLowerCase()) return false
  if (!await fileExists(executable)) return false
  const directory = dirname(executable)
  if (id === 'pallasite') return fileExists(join(directory, 'resources', 'dist', 'index.html'))
  const player = await realpath(executable).catch(() => undefined)
  if (!player || basename(player).toLowerCase() !== WINDOWS_EXE[id].toLowerCase()) return false
  const runtime = dirname(player)
  const data = join(runtime, 'BTC Proof of Play_Data')
  return await fileExists(join(runtime, 'UnityPlayer.dll'))
    && await fileExists(join(data, 'boot.config'))
    && await fileExists(join(data, 'globalgamemanagers'))
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
): Promise<string | undefined> {
  const limit = 400
  const directories = async (path: string) =>
    (await readdir(path, { withFileTypes: true }).catch(() => [])).filter(entry => entry.isDirectory())
  for (const root of roots) {
    const queue = (await directories(root.path))
      .filter(entry => root.anyName || INSTALL_FOLDER[id].test(entry.name))
      .slice(0, limit)
      .map(entry => ({ path: join(root.path, entry.name), depth: 1 }))
    if (root.anyName) queue.unshift({ path: root.path, depth: 0 })
    for (let visited = 0; visited < Math.min(queue.length, limit); visited++) {
      const { path, depth } = queue[visited]
      const executable = join(path, WINDOWS_EXE[id])
      if (await isWindowsGame(id, executable)) return executable
      if (depth >= 5 || queue.length >= limit) continue
      for (const entry of await directories(path)) {
        // Unity data folders hold thousands of assets and never the client.
        if (!/_Data$/i.test(entry.name)) queue.push({ path: join(path, entry.name), depth: depth + 1 })
        if (queue.length >= limit) break
      }
    }
  }
  return undefined
}

export async function writeVerifiedDownload(
  response: Response,
  target: string,
  expected: { size: number; sha256: string },
  title = 'Pallasite',
): Promise<void> {
  if (!response.ok || !response.body) throw new Error(`${title} download is unavailable.`)
  let bytes = 0
  const hash = createHash('sha256')
  const reader = response.body.getReader()
  const chunks = async function* () {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > expected.size) throw new Error(`The ${title} download exceeded the expected size.`)
        hash.update(value)
        yield value
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
  await pipeline(Readable.from(chunks()), createWriteStream(target, { flags: 'wx', mode: 0o700 }))
  if (bytes !== expected.size || hash.digest('hex') !== expected.sha256) {
    throw new Error(`The ${title} download did not match the publisher’s checksum.`)
  }
}

export class DesktopGames {
  private installing: Promise<void> | undefined
  private installingProofOfPlay: Promise<void> | undefined

  constructor(private readonly directory: string) {}

  canDownloadPallasite(): boolean {
    return process.arch === 'x64' && (process.platform === 'linux' || process.platform === 'win32')
  }

  canDownloadProofOfPlay(): boolean {
    return process.platform === 'win32' && process.arch === 'x64'
  }

  async linked(id: DesktopGameId): Promise<string | undefined> {
    const executable = await readFile(join(this.directory, id + '.path'), 'utf8').catch(() => '')
    if (!executable) return undefined
    if (process.platform === 'win32') {
      return await isWindowsGame(id, executable) ? executable : undefined
    }
    return process.platform === 'linux' && id === 'pallasite'
      && executable === join(this.directory, ASSETS.linux.name) && await fileExists(executable)
      ? executable : undefined
  }

  private proofOfPlayPackDirectory(): string {
    return join(this.directory, PROOF_OF_PLAY, PROOF_OF_PLAY_BUILD.version)
  }

  async installedProofOfPlayPack(): Promise<string | undefined> {
    if (!this.canDownloadProofOfPlay()) return undefined
    const executable = join(this.proofOfPlayPackDirectory(), WINDOWS_EXE[PROOF_OF_PLAY])
    return await isWindowsGame(PROOF_OF_PLAY, executable) ? executable : undefined
  }

  async findWindowsProofOfPlay(appData: string, configured?: string): Promise<string | undefined> {
    const linked = await this.installedProofOfPlayPack() ?? await this.linked(PROOF_OF_PLAY)
    if (linked) return linked
    if (configured && await isWindowsGame(PROOF_OF_PLAY, configured)) return configured

    // The publisher's launcher unpacks the playable Unity build into userData/game.
    for (const name of ['btcpop-launcher', 'BTC Proof of Play']) {
      const executable = join(appData, name, 'game', WINDOWS_EXE[PROOF_OF_PLAY])
      if (await isWindowsGame(PROOF_OF_PLAY, executable)) return executable
    }
    return undefined
  }

  async detectWindowsGame(id: DesktopGameId): Promise<boolean> {
    if (process.platform !== 'win32') return false
    const executable = await findInstalledGame(id, windowsSearchRoots(process.env))
    if (!executable) return false
    await this.saveLink(id, executable)
    return true
  }

  async linkWindowsGame(id: DesktopGameId, selected: string): Promise<string> {
    if (process.platform !== 'win32') throw new Error('Linking an installed game requires Windows.')
    // A launcher or installer is often selected by mistake. Look for the real
    // client beside it before asking the player to choose again.
    const executable = await isWindowsGame(id, selected)
      ? selected
      : await findInstalledGame(id, [{ path: dirname(selected), anyName: true }])
    if (!executable) {
      if (id === PROOF_OF_PLAY) {
        throw new Error('Choose BTC Proof of Play.exe in the game folder, or install the game pack in Games Settings.')
      }
      throw new Error('Select Pallasite.exe in its installed game folder.')
    }
    await this.saveLink(id, executable)
    return executable
  }

  async useOfflinePallasite(): Promise<void> {
    await rm(join(this.directory, 'pallasite.path'), { force: true })
  }

  installPallasite(runSetup: (installer: string) => Promise<void>): Promise<void> {
    this.installing ??= this.downloadPallasite(runSetup).finally(() => { this.installing = undefined })
    return this.installing
  }

  installProofOfPlay(): Promise<void> {
    this.installingProofOfPlay ??= this.downloadProofOfPlay().finally(() => { this.installingProofOfPlay = undefined })
    return this.installingProofOfPlay
  }

  private async downloadProofOfPlay(): Promise<void> {
    if (!this.canDownloadProofOfPlay()) throw new Error('The BTC: Proof of Play game pack requires 64-bit Windows.')
    if (await this.installedProofOfPlayPack()) return
    const target = this.proofOfPlayPackDirectory()
    const parent = dirname(target)
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const staging = await mkdtemp(join(parent, '.download-'))
    try {
      const archive = join(staging, 'game.zip')
      const runtime = join(staging, 'game')
      const response = await fetch(PROOF_OF_PLAY_BUILD.url, { signal: AbortSignal.timeout(20 * 60_000) })
      await writeVerifiedDownload(response, archive, PROOF_OF_PLAY_BUILD, 'BTC: Proof of Play')
      // The verified publisher ZIP contains the Unity client at its root.
      const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      await runFile(powershell, [
        '-NoProfile', '-NonInteractive', '-Command',
        '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.IO.Compression.FileSystem; '
          + '[System.IO.Compression.ZipFile]::ExtractToDirectory($env:GAMESTR_GAME_ZIP, $env:GAMESTR_GAME_DEST)',
      ], { windowsHide: true, timeout: 180_000, env: { ...process.env, GAMESTR_GAME_ZIP: archive, GAMESTR_GAME_DEST: runtime } })
      if (!await isWindowsGame(PROOF_OF_PLAY, join(runtime, WINDOWS_EXE[PROOF_OF_PLAY]))) {
        throw new Error('The game pack is missing the Unity client.')
      }
      try {
        await rename(runtime, target)
      } catch (error) {
        if (!await this.installedProofOfPlayPack()) throw error
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
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
        if (await this.detectWindowsGame('pallasite')) return
        throw new Error('Use Find Pallasite Desktop on this PC if you installed Pallasite in a different folder.')
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}
