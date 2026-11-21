import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from 'playwright'

if (process.platform !== 'win32') throw new Error('This installer check requires Windows')

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const executable = resolve(process.argv[2])
const root = resolve(process.argv[3])
const profile = join(root, 'arcade test profile')
const appData = join(root, 'publisher test appdata')
const games = join(root, 'catalogue')
const id = 'btc-proof-of-play'
const stage = join(root, 'native fixture')
const staleSetup = join(stage, 'BTC Proof of Play Setup.exe')
const marker = join(stage, 'wrong-setup-launched.txt')
const desktopGames = join(profile, 'desktop-games')
const player = join(desktopGames, id, '5.1.0', 'BTC Proof of Play.exe')

await mkdir(join(games, id), { recursive: true })
await writeFile(join(games, id, 'game.json'), JSON.stringify({
  name: 'BTC: Proof of Play', url: 'https://btcproofofplay.itch.io/btcproofofplay',
  order: 0, textLogo: true,
}))
await mkdir(appData, { recursive: true })
await mkdir(desktopGames, { recursive: true })
await writeFile(join(desktopGames, id + '.path'), staleSetup)

async function selectGame(page) {
  const tile = page.locator('button.tile').and(page.getByRole('button', { name: 'Select BTC: Proof of Play', exact: true }))
  if (await tile.count()) await tile.evaluate(button => button.click())
}

function nativePlayer() {
  const code = `$p = Get-Process -Name 'BTC Proof of Play' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $env:GAMESTR_TEST_PLAYER } | Select-Object -First 1
if ($p) {
    @{ id = $p.Id; title = $p.MainWindowTitle; handle = $p.MainWindowHandle.ToInt64(); path = $p.Path } | ConvertTo-Json -Compress
}
exit 0`
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], {
    encoding: 'utf8', env: { ...process.env, GAMESTR_TEST_PLAYER: player },
  })
  return output.trim() ? JSON.parse(output) : undefined
}

function closePlayer(pid) {
  const code = `$p = Get-Process -Id $env:GAMESTR_TEST_PID -ErrorAction SilentlyContinue
if ($p.Path -eq $env:GAMESTR_TEST_PLAYER) { $p.CloseMainWindow() }`
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], {
    encoding: 'utf8', env: { ...process.env, GAMESTR_TEST_PID: String(pid), GAMESTR_TEST_PLAYER: player },
  }).trim()
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
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile)
    const build = await app.evaluate(({ app }, path) => {
      app.setPath('appData', path)
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
    await selectGame(page)
    console.log(JSON.stringify({ installedMenu: build, nativeTile: entries[0].name }))
    return { app, page, game: entries[0] }
  } catch (error) {
    await app.close()
    throw error
  }
}

async function until(check, message, timeout = 45_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await check()
    if (result) return result
    await delay(400)
  }
  throw new Error(message)
}

assert((await lstat(executable)).isFile())
const { app, page, game } = await open(executable)
try {
  assert.equal(game.cabinetInstall, 'available')
  assert.equal(game.exec, undefined)
  await app.evaluate(({ dialog }, exe) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exe] })
  }, staleSetup)
  const refused = await page.evaluate(async () => {
    try { await window.arcade.linkWindowsGame('btc-proof-of-play') }
    catch (error) { return error.message }
  })
  assert.match(refused, /Choose BTC Proof of Play\.exe in the game folder/)
  assert.equal(await page.evaluate(() => window.arcade.launch('btc-proof-of-play')), false)
  await assert.rejects(readFile(marker), { code: 'ENOENT' })
  console.log('Gamestr refused both the stored setup path and a setup EXE chosen in the picker.')

  await page.keyboard.press('g')
  const installPack = page.getByRole('button', { name: 'Install BTC: Proof of Play game pack', exact: true })
  await installPack.waitFor()
  // The Games Settings install refreshes the shell once the game is ready.
  const status = page.locator('.gp-local-status').filter({ hasText: /Error invoking remote method/ })
  const reloaded = page.waitForEvent('domcontentloaded', { timeout: 300_000 })
  const failed = status.waitFor({ timeout: 300_000 }).then(async () => { throw new Error(await status.innerText()) })
  await Promise.all([
    Promise.race([reloaded, failed]),
    installPack.evaluate(button => button.click()),
  ])
  await page.locator('.tile-active').waitFor()
  await selectGame(page)
  const play = page.locator('.cta[aria-label="Play now BTC: Proof of Play"]')
  assert((await lstat(player)).isFile())
  console.log(JSON.stringify({ installedPublisherGame: player }))
  await play.evaluate(button => button.click())
  const gameWindow = await until(() => {
    const p = nativePlayer()
    return p?.handle && /BTC.*Proof of Play/i.test(p.title) && p
  }, 'Play Now did not open the actual Unity game window.')
  console.log(JSON.stringify({ actualUnityWindow: gameWindow }))
  assert.equal(await page.locator('.ready-overlay.is-open').count(), 0)
  await assert.rejects(readFile(marker), { code: 'ENOENT' })
  assert.equal(closePlayer(gameWindow.id), 'True')
  await until(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    'Gamestr did not return when the Unity window closed.')
  console.log('The Unity game closed and Gamestr returned to the menu.')
} finally {
  const remaining = nativePlayer()
  if (remaining) process.kill(remaining.id)
  await app.close()
}
