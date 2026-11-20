import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from 'playwright'

if (process.platform !== 'win32') throw new Error('This installer check requires Windows')

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const root = resolve(process.argv[2])
const profile = join(root, 'arcade test profile')
const appData = join(root, 'publisher test appdata')
const games = join(root, 'catalogue')
const id = 'btc-proof-of-play'
const stage = join(root, 'native fixture')
const player = join(stage, 'BTC Proof of Play Alias.exe')
const marker = join(stage, 'launched.txt')
const publisherGame = join(appData, 'btcpop-launcher', 'game')
const publisherExe = join(publisherGame, 'BTC Proof of Play.exe')

await mkdir(join(games, id), { recursive: true })
await writeFile(join(games, id, 'game.json'), JSON.stringify({
  name: 'BTC: Proof of Play', url: 'https://btcproofofplay.itch.io/btcproofofplay',
  order: 0, textLogo: true,
}))
await mkdir(join(publisherGame, 'BTC Proof of Play_Data'), { recursive: true })
await copyFile(player, publisherExe)
await writeFile(join(publisherGame, 'UnityPlayer.dll'), '')

function targetFromStartMenu() {
  const code = String.raw`$p = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Gamestr Arcade.lnk'
if (!(Test-Path -LiteralPath $p)) { throw 'Gamestr Arcade Start shortcut missing' }
[Console]::Write((New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath)`
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8' }).trim()
}

async function install() {
  const installer = join(root, `gamestr-arcade-${version}-x64-setup.exe`)
  await new Promise((resolve, reject) => {
    const proc = spawn(installer, ['/S'], { stdio: 'ignore' })
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`Setup ${version} did not finish within 90 seconds`))
    }, 90_000)
    proc.once('error', error => { clearTimeout(timer); reject(error) })
    proc.once('exit', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Setup ${version} exited with code ${code}`))
    })
  })
  const executable = targetFromStartMenu()
  assert((await lstat(executable)).isFile())
  return executable
}

function shellState(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return { hidden: w.testHideCount, shown: w.testShowCount, pickers: w.testPickerCount, visible: w.isVisible() }
  })
}

async function open(executable) {
  const env = { ...process.env, ARCADE_KIOSK: '0', ARCADE_GAMES_DIR: games, BTC_PLAY_TEST_MARKER: marker }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: executable, args: ['--disable-gpu', '--user-data-dir=' + profile], env, timeout: 60_000,
  })
  try {
    const page = await app.firstWindow()
    await page.locator('.tile-active').waitFor({ timeout: 60_000 })
    const build = await app.evaluate(({ app, BrowserWindow, dialog }, path) => {
      app.setPath('appData', path)
      const w = BrowserWindow.getAllWindows()[0]
      w.testHideCount = 0
      w.testShowCount = 0
      w.testPickerCount = 0
      w.on('hide', () => { w.testHideCount++ })
      w.on('show', () => { w.testShowCount++ })
      dialog.showOpenDialog = async (_window, options) => {
        w.testPickerCount++
        if (options.buttonLabel !== 'Play Now') throw new Error('Unexpected picker opened')
        return w.testSelectedPath
          ? { canceled: false, filePaths: [w.testSelectedPath] }
          : { canceled: true, filePaths: [] }
      }
      return { version: app.getVersion(), executable: process.execPath }
    }, appData)
    assert.equal(build.version, version)
    assert.equal(build.executable.toLowerCase(), executable.toLowerCase())
    const catalogue = await page.evaluate(() => window.arcade.listGames())
    const entries = catalogue.filter(game => game.id === id)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].kind, 'appimage')
    assert.equal(entries[0].url, undefined)
    assert.deepEqual(entries[0].inputModes, ['keyboard', 'pointer'])
    const select = page.getByRole('button', { name: 'Select BTC: Proof of Play', exact: true })
    if (await select.count()) await select.evaluate(button => button.click())
    const play = page.locator('.cta[aria-label="Play now BTC: Proof of Play"]')
    await play.waitFor()
    assert.match(await play.innerText(), /PLAY\s+NOW/)
    console.log(JSON.stringify({ installedMenu: build, nativeTile: entries[0].name }))
    return { app, page, play }
  } catch (error) {
    await app.close()
    throw error
  }
}

async function until(check, message) {
  const deadline = Date.now() + 15_000
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error(message)
    await delay(100)
  }
}

async function plays({ app, page, play }, expectedExe, expectedPickers, keyboard = false) {
  const before = await shellState(app)
  await rm(marker, { force: true })
  if (keyboard) await play.press('Enter')
  else await play.evaluate(button => button.click())
  await until(async () => {
    const state = await shellState(app)
    return state.hidden > before.hidden && state.shown > before.shown && state.visible
  }, 'The game did not open and return to the menu after one activation of Play Now.')
  assert.equal((await readFile(marker, 'utf8')).toLowerCase(), dirname(expectedExe).toLowerCase())
  assert.equal((await shellState(app)).pickers, expectedPickers)
  assert.equal(await page.locator('.ready-overlay').isVisible(), false)
}

const launcher = await install()
const first = await open(launcher)
try {
  await plays(first, publisherExe, 0)
  console.log('Play Now started the EXE in the publisher layout and returned to Gamestr when it exited.')

  await rm(publisherExe)
  await rm(marker)
  await first.play.evaluate(button => button.click())
  await until(async () => (await shellState(first.app)).pickers === 1, 'The location picker did not open.')
  await delay(300)
  await assert.rejects(readFile(marker), { code: 'ENOENT' })
  assert.equal((await shellState(first.app)).visible, true)
  await first.app.evaluate(({ BrowserWindow }, path) => {
    BrowserWindow.getAllWindows()[0].testSelectedPath = path
  }, player)
  await plays(first, player, 2)
  console.log('Cancel kept the menu open. Choosing a custom EXE started it in the same Play Now action.')
} finally {
  await first.app.close()
}

const second = await open(launcher)
try {
  await plays(second, player, 0, true)
  console.log('After restarting Gamestr, Enter launched the remembered EXE without a picker.')
} finally {
  await second.app.close()
}
