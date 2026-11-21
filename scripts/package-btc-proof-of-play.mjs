import { chmod, cp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const gameId = 'btc-proof-of-play'
const usage = 'Usage: node scripts/package-btc-proof-of-play.mjs <output-games-dir> <AppImage-or-installed-game-dir> [relative-player-path]'

// The native launcher may start the game with a different working directory.
// exec keeps the player in the foreground so the arcade can track its exit.
const launcher = `#!/bin/sh
set -eu
cd "$(dirname -- "$0")/runtime/$(dirname -- "$1")"
exec "./$(basename -- "$1")"
`

// One manifest feeds this Linux tile and the linked Windows tile in the arcade.
const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'btc-proof-of-play.game.json')

function imageExtension(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return '.png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg'
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp'
  return undefined
}

// Offline booths cannot fetch the publisher's art on first start, so bundle it
// beside the manifest when this machine is online. Sibling art wins at runtime.
async function bundleArt(tile, name, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const extension = imageExtension(bytes)
    if (!extension || bytes.length > 20 * 1024 * 1024) throw new Error('not a supported image')
    await writeFile(join(tile, name + extension), bytes)
  } catch (error) {
    console.error(`Could not bundle the ${name} art (${error.message}). The arcade will fetch it when online.`)
  }
}

function isWithin(directory, path) {
  const fromDirectory = relative(directory, path)
  return fromDirectory !== '' && fromDirectory !== '..' && !fromDirectory.startsWith(`..${sep}`) && !isAbsolute(fromDirectory)
}

async function packageGame(output, input, playerPath) {
  const source = await realpath(input)
  const info = await stat(source)
  const appImage = info.isFile() && /\.AppImage$/i.test(input)
  if (appImage ? playerPath !== undefined : !info.isDirectory() || !playerPath || isAbsolute(playerPath)) {
    throw new Error('Supply an AppImage or an installed game directory and a relative path to its game executable.')
  }

  let player = basename(input)
  if (!appImage) {
    const executable = await realpath(join(source, playerPath))
    if (!isWithin(source, executable) || !(await stat(executable)).isFile()) {
      throw new Error('The game executable must be a file inside the installed game directory.')
    }
    player = relative(source, executable)
  }

  await mkdir(output, { recursive: true })
  const tile = join(await realpath(output), gameId)
  if (!appImage && isWithin(source, tile)) throw new Error('Use an output directory outside the installed game directory.')

  // Claim this tile exclusively and publish the manifest after copying the runtime.
  await mkdir(tile)
  try {
    const runtime = join(tile, 'runtime')
    if (appImage) await mkdir(runtime)
    await cp(source, appImage ? join(runtime, player) : runtime, { recursive: !appImage, verbatimSymlinks: true })
    await chmod(runtime, 0o755)
    const executable = join(runtime, player)
    await chmod(executable, (await stat(executable)).mode | 0o111)
    await writeFile(join(tile, 'launch.sh'), launcher, { mode: 0o755 })
    const manifest = { ...JSON.parse(await readFile(manifestPath, 'utf8')), exec: 'launch.sh', args: [player] }
    await Promise.all([bundleArt(tile, 'logo', manifest.logoUrl), bundleArt(tile, 'hero', manifest.heroUrl)])
    await writeFile(join(tile, 'game.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  } catch (error) {
    await rm(tile, { recursive: true, force: true })
    throw error
  }
  return tile
}

const [output, input, playerPath, extra] = process.argv.slice(2)
if (output === '--help') {
  console.log(usage)
} else if (!output || !input || extra !== undefined) {
  console.error(usage)
  process.exitCode = 1
} else {
  try {
    console.log(await packageGame(resolve(output), input, playerPath))
  } catch (error) {
    console.error(`Could not package BTC: Proof of Play. ${error.message}`)
    process.exitCode = 1
  }
}
