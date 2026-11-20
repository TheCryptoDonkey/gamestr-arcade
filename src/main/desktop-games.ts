import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DesktopGameId } from '../shared/types'

const RELEASE = 'https://github.com/TheCryptoDonkey/pallasite-releases/releases/download/v0.1.2'
const ASSETS = {
  linux: {
    name: 'Pallasite-linux-x86_64.AppImage',
    size: 393601289,
    sha256: '76ecabe92fcf46abc238f6b40209db8e0c4dac75ec0a790a642967fc23cb8bb4',
  },
  win32: {
    name: 'Pallasite-win-x64.exe',
    size: 366292880,
    sha256: '53bedbb2cf45a1df1407d7d936226d4a13f89a5ac65612c6646f12cacf6bf65d',
  },
}

const WINDOWS_EXE = {
  pallasite: 'Pallasite.exe',
  'btc-proof-of-play': 'BTC Proof of Play.exe',
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(info => info.isFile(), () => false)
}

/** The cabinet operator selects the installed Windows executable in a file picker. */
export async function resolveSelectedWindowsExe(path: string): Promise<string | undefined> {
  if (!isAbsolute(path) || !/\.exe$/i.test(path)) return undefined
  const executable = await realpath(path).catch(() => undefined)
  if (!executable || !/\.exe$/i.test(executable) || !await fileExists(executable)) return undefined
  return executable
}

export async function isWindowsGame(id: DesktopGameId, executable: string): Promise<boolean> {
  if (!isAbsolute(executable) || basename(executable).toLowerCase() !== WINDOWS_EXE[id].toLowerCase()) return false
  if (!await fileExists(executable)) return false
  const directory = dirname(executable)
  if (id === 'pallasite') return fileExists(join(directory, 'resources', 'dist', 'index.html'))
  const data = await stat(join(directory, 'BTC Proof of Play_Data')).catch(() => null)
  return !!data?.isDirectory() && await fileExists(join(directory, 'UnityPlayer.dll'))
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
    if (process.platform === 'win32') {
      if (id === 'btc-proof-of-play') return resolveSelectedWindowsExe(executable)
      return await isWindowsGame(id, executable) ? executable : undefined
    }
    return process.platform === 'linux' && id === 'pallasite'
      && executable === join(this.directory, ASSETS.linux.name) && await fileExists(executable)
      ? executable : undefined
  }

  async linkWindowsGame(id: DesktopGameId, executable: string): Promise<void> {
    if (process.platform !== 'win32') throw new Error('Linking an installed Windows game requires Windows.')
    if (id === 'btc-proof-of-play') {
      const selected = await resolveSelectedWindowsExe(executable)
      if (!selected) throw new Error('Choose the installed Windows .exe that opens the game.')
      await this.saveLink(id, selected)
      return
    }
    if (!await isWindowsGame(id, executable)) {
      throw new Error('Select ' + WINDOWS_EXE[id] + ' in its installed game folder.')
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
        throw new Error('Use Locate Pallasite.exe if you installed Pallasite in a different folder.')
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}
