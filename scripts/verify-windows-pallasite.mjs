import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { _electron as electron } from 'playwright'

assert.equal(process.platform, 'win32')
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const root = resolve(process.argv[2])
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

async function installArcade() {
  const setup = spawn(join(root, `gamestr-arcade-${version}-x64-setup.exe`), ['/S'], { stdio: 'ignore' })
  await new Promise((done, fail) => {
    const timer = setTimeout(() => { setup.kill(); fail(new Error('Gamestr setup timed out')) }, 120_000)
    setup.once('error', error => { clearTimeout(timer); fail(error) })
    setup.once('exit', code => {
      clearTimeout(timer)
      if (code === 0) done()
      else fail(new Error('Gamestr setup exited with code ' + code))
    })
  })
  return powershell(String.raw`
    $shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Gamestr Arcade.lnk'
    (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut).TargetPath
  `)
}

const executable = await installArcade()
assert((await lstat(executable)).isFile())

async function openArcade(name) {
  const profile = join(root, `pallasite ${name} profile`)
  const env = { ...process.env, ARCADE_KIOSK: '0' }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ARCADE_CONFIG
  delete env.ARCADE_GAMES_DIR
  const app = await electron.launch({
    executablePath: executable, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--user-data-dir=' + profile],
    env, timeout: 60_000,
  })
  try {
    await app.context().addInitScript(() => {
      if (location.hostname === '127.0.0.1') localStorage.setItem('pallasite:quality', 'low')
    })
    const page = await app.firstWindow()
    await page.locator('.tile-active').waitFor()
    const details = await app.evaluate(({ app }) => ({ profile: app.getPath('userData'), version: app.getVersion() }))
    assert.deepEqual(details, { profile, version })
    return { app, page, profile }
  } catch (error) {
    await app.close()
    throw error
  }
}

async function click(locator) {
  await locator.waitFor()
  await locator.evaluate(button => button.click())
}

async function installFromSettings(page, label, completeSetup) {
  await page.keyboard.press('g')
  const settings = page.getByRole('dialog', { name: 'GAMES SETTINGS' })
  const status = settings.locator('.gp-local-status')
  const fail = status.filter({ hasText: /Error invoking remote method/ }).waitFor({ timeout: 240_000 })
    .then(async () => { throw new Error(await status.innerText()) })
  const reloaded = page.waitForEvent('domcontentloaded', { timeout: 240_000 })
  const verify = Promise.race([reloaded, fail])
  await click(settings.getByRole('button', { name: label, exact: true }))
  if (completeSetup) await Promise.race([verify, completeSetup()])
  await verify
  await page.locator('.tile-active').waitFor()
  return page.evaluate(async () => (await window.arcade.listGames()).find(game => game.id === 'pallasite'))
}

async function launchPallasite(page) {
  const select = page.getByRole('button', { name: 'Select Pallasite', exact: true })
  if (await select.count()) await click(select)
  const direct = page.locator('.cta[aria-label="Play now Pallasite"]')
  if (await direct.count()) return click(direct)
  await click(page.getByRole('button', { name: 'Play Pallasite', exact: true }))
  await click(page.getByRole('button', { name: /start game/i }))
}

async function checkOffline() {
  const { app, page, profile } = await openArcade('offline')
  try {
    const installed = await installFromSettings(page, 'Install Pallasite for offline play')
    assert.equal(installed?.cabinetInstall, 'installed')
    assert.equal(installed.network, 'offline')
    const site = join(profile, 'cabinet-games', 'pallasite', 'site')
    assert.equal(installed.localRoot, site)
    console.log('The installed Gamestr app copied the bundled Pallasite files from Games Settings.')
    const view = app.waitForEvent('window', { predicate: view => view !== page, timeout: 30_000 })
    await launchPallasite(page)
    const game = await view
    game.on('pageerror', error => console.error('Pallasite renderer:', error.message))
    await game.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/$/, { waitUntil: 'commit' })
    const response = await fetch(game.url())
    assert.equal(response.status, 200)
    assert.equal(await response.text(), await readFile(join(site, 'index.html'), 'utf8'))
    await click(game.getByRole('button', { name: 'PLAY ▶', exact: true }))
    await click(game.getByRole('button', { name: /play as guest/i }))
    await game.keyboard.type('CABINET')
    await click(game.getByRole('button', { name: /done/i }))
    await click(game.getByRole('button', { name: /^IGNITE/ }))
    await click(game.getByRole('button', { name: 'Skip intro', exact: true }))
    const later = game.getByRole('button', { name: 'NEXT TIME', exact: true })
    if (await later.isVisible()) await click(later)
    await game.locator('body[data-phase="playing"]').waitFor({ timeout: 45_000 })
    console.log('Pallasite started an offline guest run from the installed copy.')
    const closed = game.waitForEvent('close')
    await page.evaluate(() => window.arcade.back())
    await closed
    await page.locator('.tile-active').waitFor()
  } finally {
    await app.close()
  }
  const restarted = await openArcade('offline')
  try {
    const games = await restarted.page.evaluate(() => window.arcade.listGames())
    assert.equal(games.find(game => game.id === 'pallasite')?.cabinetInstall, 'installed')
    console.log('Pallasite returned to the Gamestr menu and stayed installed after restart.')
  } finally {
    await restarted.app.close()
  }
}

async function finishPallasiteSetup(profile) {
  await until(() => {
    const result = powershell(String.raw`
      Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
      $setup = Get-Process -Name 'Pallasite-win-x64' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path.StartsWith($env:GAMESTR_TEST_SETUP_ROOT + '\') -and $_.MainWindowHandle } |
        Select-Object -First 1
      if (!$setup) { exit 0 }
      $dialog = [System.Windows.Automation.AutomationElement]::FromHandle($setup.MainWindowHandle)
      $children = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition)
      $next = $children | Where-Object {
        $_.Current.IsEnabled -and $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
          ($_.Current.Name -replace '&','') -match '^(Next|Install|Finish)( >)?$'
      } | Select-Object -First 1
      if (!$next) { exit 0 }
      $finishing = $next.Current.Name -match 'Finish'
      if ($finishing) {
        $run = $children | Where-Object { ($_.Current.Name -replace '&','') -eq 'Run Pallasite' } | Select-Object -First 1
        if ($run) {
          $toggle = $run.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
          if ($toggle.Current.ToggleState -eq 'On') { $toggle.Toggle() }
        }
      }
      $next.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      if ($finishing) { 'finished' }
      exit 0
    `, { GAMESTR_TEST_SETUP_ROOT: join(profile, 'desktop-games') })
    return result === 'finished'
  }, 'Could not complete the publisher’s Windows setup wizard.', 235_000)
}

function playerWindow() {
  const result = powershell(`
    $p = Get-Process -Name 'Pallasite' -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -eq $env:GAMESTR_TEST_PLAYER -and $_.MainWindowHandle } | Select-Object -First 1
    if ($p) {
      @{ id = $p.Id; title = $p.MainWindowTitle; path = $p.Path } | ConvertTo-Json -Compress
    }
    exit 0
  `)
  return result ? JSON.parse(result) : undefined
}

async function checkDesktop() {
  const { app, page, profile } = await openArcade('desktop')
  try {
    const installed = await installFromSettings(page, 'Download and install Pallasite Desktop', () => finishPallasiteSetup(profile))
    assert.equal(installed?.kind, 'appimage')
    assert.equal(installed.exec.toLowerCase(), player.toLowerCase())
    assert((await lstat(player)).isFile())
    console.log(JSON.stringify({ installedPallasiteDesktop: player }))
    assert.equal(playerWindow(), undefined, 'Pallasite should launch separately after setup.')
    await launchPallasite(page)
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
for (const check of [checkOffline, checkDesktop]) {
  try {
    await check()
  } catch (error) {
    console.error(check.name, error)
    errors.push(error)
  }
}
if (errors.length) throw new AggregateError(errors, 'One or more Pallasite checks failed.')
