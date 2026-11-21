import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from 'playwright'
import { playHangOnFren } from './play-hang-on-fren.mjs'
import { playPallasiteBooth } from './play-pallasite-booth.mjs'

assert.equal(process.platform, 'win32')
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const executable = resolve(process.argv[2])
const root = resolve(process.argv[3])
const player = join(process.env.LOCALAPPDATA, 'Programs', 'Pallasite', 'Pallasite.exe')

function powershell(code, extraEnv = {}) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], {
    encoding: 'utf8', env: { ...process.env, GAMESTR_TEST_PLAYER: player, ...extraEnv },
  }).trim()
}

async function until(check, message, timeout = 45_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await check()
    if (result) return result
    await delay(350)
  }
  throw new Error(message)
}

assert((await lstat(executable)).isFile())

async function openArcade(name) {
  const profile = join(root, `pallasite ${name} profile`)
  const env = { ...process.env, ARCADE_KIOSK: '0' }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ARCADE_CONFIG
  delete env.ARCADE_GAMES_DIR
  const app = await electron.launch({
    executablePath: executable,
    args: [
      '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling', '--user-data-dir=' + profile,
    ],
    env, timeout: 60_000,
  })
  app.process().once('exit', (code, signal) => console.log(`Gamestr ${name} process exited`, { code, signal }))
  app.process().stderr?.on('data', data => process.stderr.write(data))
  try {
    await app.context().addInitScript(() => {
      if (location.hostname === '127.0.0.1') localStorage.setItem('pallasite:quality', 'low')
    })
    const page = await app.firstWindow()
    page.once('crash', () => console.error(`Gamestr ${name} shell renderer crashed`))
    page.on('pageerror', error => console.error(`Gamestr ${name} shell renderer`, error.message))
    await waitForCabinet(page)
    const details = await app.evaluate(({ app }) => ({
      profile: app.getPath('userData'), version: app.getVersion(), executable: process.execPath,
    }))
    assert.equal(details.profile, profile)
    assert.equal(details.version, version)
    assert.equal(details.executable.toLowerCase(), executable.toLowerCase())
    return { app, page, profile }
  } catch (error) {
    await app.close()
    throw error
  }
}

async function waitForCabinet(page) {
  // The runner can suppress compositor frames while the game view closes or
  // the shell reloads. Wait for the new catalogue DOM before using its controls.
  await page.locator('.tile-active').waitFor({ state: 'attached', timeout: 90_000 })
}

async function click(locator) {
  await locator.waitFor()
  await locator.evaluate(button => button.click())
}

async function installFromSettings(page, label, id = 'pallasite', timeout = 240_000) {
  await page.keyboard.press('g')
  const settings = page.getByRole('dialog', { name: 'GAMES SETTINGS' })
  const status = settings.locator('.gp-local-status')
  const fail = status.filter({ hasText: /Error invoking remote method/ }).waitFor({ timeout })
    .then(async () => { throw new Error(await status.innerText()) })
  const reloaded = page.waitForEvent('domcontentloaded', { timeout })
  try {
    await Promise.all([
      Promise.race([reloaded, fail]),
      click(settings.getByRole('button', { name: label, exact: true })),
    ])
    await waitForCabinet(page)
  } catch (error) {
    const detail = await status.textContent({ timeout: 2000 }).catch(() => null)
    throw new Error(`${label} did not complete. ${detail ?? ''}`.trim(), { cause: error })
  }
  return page.evaluate(async id => (await window.arcade.listGames()).find(game => game.id === id), id)
}

async function selectGame(page, name) {
  const select = page.locator('button.dot').and(page.getByRole('button', { name: 'Select ' + name, exact: true }))
  await click(select)
}

async function openOfflineGame(app, page, name, site) {
  await selectGame(page, name)
  await click(page.getByRole('button', { name: 'Play ' + name, exact: true }))
  const [game] = await Promise.all([
    app.waitForEvent('window', { predicate: view => view !== page, timeout: 45_000 }),
    click(page.getByRole('button', { name: /start game/i })),
  ])
  game.on('pageerror', error => console.error(name + ' renderer:', error.message))
  const launchUrl = name === 'Pallasite' ? /^http:\/\/127\.0\.0\.1:\d+\/\?p1&fullfx=1$/ : /^http:\/\/127\.0\.0\.1:\d+\/$/
  await game.waitForURL(launchUrl, { waitUntil: 'commit' })
  const response = await fetch(game.url())
  assert.equal(response.status, 200)
  assert.equal(await response.text(), await readFile(join(site, 'index.html'), 'utf8'))
  return game
}

async function returnFromOfflineGame(page, game) {
  await Promise.all([game.waitForEvent('close'), page.evaluate(() => window.arcade.back())])
  await waitForCabinet(page)
}

async function checkOffline() {
  const { app, page, profile } = await openArcade('offline')
  try {
    const installed = await installFromSettings(page, 'Install Pallasite for offline play')
    assert.equal(installed?.cabinetInstall, 'installed')
    assert.equal(installed.network, 'offline')
    assert.equal(new URL(installed.url).search, '')
    const site = join(profile, 'cabinet-games', 'pallasite', 'site')
    assert.equal(installed.localRoot, site)
    console.log('The installed Gamestr app copied the bundled Pallasite files from Games Settings.')
    const game = await openOfflineGame(app, page, 'Pallasite', site)
    await game.getByText('PALLASITE · STATION 1', { exact: true }).waitFor()
    await playPallasiteBooth(game, click)
    console.log('Pallasite started an offline guest run from the Station 1 lobby.')
    await returnFromOfflineGame(page, game)

    const neon = await installFromSettings(page, 'Install Neon Sentinel for offline play', 'neon-sentinel')
    assert.equal(neon?.cabinetInstall, 'installed')
    assert.equal(neon.network, 'offline')
    const neonSite = join(profile, 'cabinet-games', 'neon-sentinel', 'site')
    assert.equal(neon.localRoot, neonSite)
    const neonGame = await openOfflineGame(app, page, 'Neon Sentinel', neonSite)
    await neonGame.locator('body[data-neon-phase="title"]').waitFor({ timeout: 45_000 })
    await neonGame.keyboard.press('Enter')
    const laterReward = neonGame.locator('#v4v-later:visible')
    const playing = neonGame.locator('body[data-neon-phase="playing"]')
    await laterReward.or(playing).first().waitFor()
    if (await laterReward.isVisible()) await click(laterReward)
    await playing.waitFor()
    await returnFromOfflineGame(page, neonGame)
    console.log('Neon Sentinel started an offline run and returned to the menu.')

    const fren = await installFromSettings(page, 'Install Hang On, Fren for offline play', 'hang-on-fren')
    assert.equal(fren?.cabinetInstall, 'installed')
    assert.equal(fren.network, 'offline')
    const frenSite = join(profile, 'cabinet-games', 'hang-on-fren', 'site')
    assert.equal(fren.localRoot, frenSite)
    const frenGame = await openOfflineGame(app, page, 'Hang On, Fren', frenSite)
    await playHangOnFren(frenGame)
    await returnFromOfflineGame(page, frenGame)
    console.log('Hang On, Fren started an offline ride and returned to the menu.')
  } finally {
    await app.close()
  }
  const restarted = await openArcade('offline')
  try {
    const games = await restarted.page.evaluate(() => window.arcade.listGames())
    assert.equal(games.find(game => game.id === 'pallasite')?.cabinetInstall, 'installed')
    assert.equal(games.find(game => game.id === 'neon-sentinel')?.cabinetInstall, 'installed')
    assert.equal(games.find(game => game.id === 'hang-on-fren')?.cabinetInstall, 'installed')
    console.log('The offline games stayed installed after restart.')
  } finally {
    await restarted.app.close()
  }
}

function playerWindow() {
  const result = powershell(`
    $p = Get-Process -Name 'Pallasite' -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -eq $env:GAMESTR_TEST_PLAYER -and $_.MainWindowHandle.ToInt64() -ne 0 } | Select-Object -First 1
    if ($p) {
      @{ id = $p.Id; title = $p.MainWindowTitle; path = $p.Path } | ConvertTo-Json -Compress
    }
    exit 0
  `)
  return result ? JSON.parse(result) : undefined
}

async function checkDesktop() {
  const { app, page } = await openArcade('desktop')
  try {
    // The publisher's setup is a much larger transfer than the local copies.
    const installed = await installFromSettings(page, 'Download and install Pallasite Desktop', 'pallasite', 600_000)
    assert.equal(installed?.kind, 'appimage')
    assert.equal(installed.exec.toLowerCase(), player.toLowerCase())
    assert((await lstat(player)).isFile())
    const gameVersion = powershell('(Get-Item -LiteralPath $env:GAMESTR_TEST_PLAYER).VersionInfo.ProductVersion')
    assert.match(gameVersion, /^0\.1\.4(?:\.|$)/)
    console.log(JSON.stringify({ installedPallasiteDesktop: player, gameVersion }))
    assert.equal(playerWindow(), undefined, 'Pallasite should launch separately after setup.')
    await selectGame(page, 'Pallasite')
    await click(page.locator('.cta[aria-label="Play now Pallasite"]'))
    assert.equal(await page.locator('.ready-overlay.is-open').count(), 0)
    const window = await until(playerWindow, 'Gamestr did not open the Pallasite Desktop window')
    assert.match(window.title, /Pallasite/i)
    const response = await fetch('http://127.0.0.1:8123/')
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Pallasite/i)
    console.log(JSON.stringify({ pallasiteDesktopOpened: window }))
    assert.equal(powershell(`
      $p = Get-Process -Id $env:GAMESTR_TEST_PID -ErrorAction SilentlyContinue
      if ($p.Path -eq $env:GAMESTR_TEST_PLAYER) { $p.CloseMainWindow() }
    `, { GAMESTR_TEST_PID: String(window.id) }), 'True')
    await until(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      'Gamestr did not return after closing Pallasite Desktop')
    console.log('Pallasite Desktop closed and Gamestr returned to the menu.')
  } finally {
    const remaining = playerWindow()
    if (remaining) process.kill(remaining.id)
    await app.close()
  }
}

const errors = []
for (const check of [checkDesktop, checkOffline]) {
  try {
    await check()
  } catch (error) {
    console.error(check.name, error)
    errors.push(error)
  }
}
if (errors.length) throw new AggregateError(errors, 'One or more Pallasite checks failed.')
