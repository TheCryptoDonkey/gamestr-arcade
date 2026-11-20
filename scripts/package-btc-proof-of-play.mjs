import { chmod, cp, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

const gameId = 'btc-proof-of-play'
const usage = 'Usage: node scripts/package-btc-proof-of-play.mjs <output-games-dir> <AppImage-or-installed-game-dir> [relative-player-path]'

// The native launcher may start the game with a different working directory.
// exec keeps the player in the foreground so the arcade can track its exit.
const launcher = `#!/bin/sh
set -eu
cd "$(dirname -- "$0")/runtime/$(dirname -- "$1")"
exec "./$(basename -- "$1")"
`

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
    const manifest = {
      manifestVersion: 2,
      name: 'BTC: Proof of Play',
      tagline: 'Build your deck and battle in a Bitcoin strategy card game',
      developer: 'BTC Proof of Play',
      gameId,
      exec: 'launch.sh',
      args: [player],
      textLogo: true,
      inputModes: ['keyboard', 'pointer'],
    }
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
