import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { lstat, mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const root = resolve(process.argv[2])
const stage = join(root, 'native fixture')
const player = join(stage, 'BTC Proof of Play Alias.exe')
const marker = join(stage, 'launched.txt')
const profile = join(root, 'upgrade profile')
const games = join(root, 'catalogue')
await mkdir(games, { recursive: true })

function targetFromStartMenu() {
  const code = String.raw`$p = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Gamestr Arcade.lnk'
if (!(Test-Path -LiteralPath $p)) { throw 'Gamestr Arcade Start shortcut missing' }
[Console]::Write((New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath)`
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8' }).trim()
}

async function install(version) {
  const installer = join(root, 'gamestr-arcade-' + version + '-x64-setup.exe')
  await new Promise((resolve, reject) => {
    const proc = spawn(installer, ['/S'], { stdio: 'ignore' })
    proc.once('error', reject)
    proc.once('exit', code => code === 0 ? resolve() : reject(new Error('Setup ' + version + ' exited with code ' + code)))
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('Setup ' + version + ' did not finish within 90 seconds'))
    }, 90_000)
    proc.once('exit', () => clearTimeout(timer))
    proc.once('error', () => clearTimeout(timer))
  })
  const executable = targetFromStartMenu()
  assert((await lstat(executable)).isFile())
  return executable
}

async function open(executable, version) {
  const env = {
    ...process.env,
    ARCADE_KIOSK: '0',
    ARCADE_GAMES_DIR: games,
    BTC_PLAY_TEST_MARKER: marker,
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: executable, args: ['--disable-gpu', '--user-data-dir=' + profile], env, timeout: 60_000 })
  try {
    const build = await app.evaluate(({ app }) => ({ version: app.getVersion(), executable: process.execPath }))
    assert.equal(build.version, version, JSON.stringify(build))
    const page = await app.firstWindow()
    await page.locator('.tile-active').waitFor({ timeout: 60_000 })
    console.log(JSON.stringify({ runningFromStartShortcut: build }))
    return { app, page }
  } catch (error) {
    await app.close()
    throw error
  }
}

async function choose({ app, page }) {
  await app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths })
  }, [player])
  return page.evaluate(async () => {
    try {
      return { game: (await window.arcade.linkWindowsGame('btc-proof-of-play')).find(game => game.id === 'btc-proof-of-play') }
    } catch (error) {
      return { error: error.message }
    }
  })
}

const previousTarget = await install('0.2.11')
let old = (await open(previousTarget, '0.2.11'))
try {
  const rejection = await choose(old)
  assert.match(rejection.error, /Select BTC Proof of Play\.exe in its installed game folder\./)
  console.log(JSON.stringify({ reproducedPreviousMessage: rejection.error }))
  await old.app.close()
  old = undefined
  const upgradedTarget = await install('0.2.12')
  assert.equal(upgradedTarget.toLowerCase(), previousTarget.toLowerCase())
  const updated = await open(upgradedTarget, '0.2.12')
  try {
    const { game, error } = await choose(updated)
    assert.equal(error, undefined)
    assert.equal(game.kind, 'appimage')
    assert.equal(game.exec.toLowerCase(), player.toLowerCase())
    assert.equal(game.available, true)
    console.log('The released 0.2.12 installer upgrades the same shortcut and accepts the runnable EXE with a different name and layout.')
    await updated.page.evaluate(() => window.arcade.launch('btc-proof-of-play'))
    const timeout = Date.now() + 15_000
    while (true) {
      try {
        const cwd = await readFile(marker, 'utf8')
        assert.equal(cwd.toLowerCase(), dirname(player).toLowerCase())
        break
      } catch (error) {
        if (error.code !== 'ENOENT' || Date.now() >= timeout) throw error
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    console.log('Gamestr started the actual Windows child process in its game folder.')
  } finally {
    await updated.app.close()
  }
} finally {
  await old?.app.close()
}
