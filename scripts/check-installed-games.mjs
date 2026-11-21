import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { playHangOnFren } from './play-hang-on-fren.mjs'
import { playPallasiteBooth } from './play-pallasite-booth.mjs'

const args = process.argv.slice(2)
const verifyGameplay = !args.includes('--install-only')
const verifyKiosk = args.includes('--kiosk')
const artifactPath = args.find(arg => !arg.startsWith('--'))
const artifact = artifactPath ? resolve(artifactPath) : undefined
const scratch = await mkdtemp(join(tmpdir(), 'gamestr-installed-games-'))
const profile = join(scratch, 'profile')
const tiles = [['pallasite', 'Pallasite'], ['neon-sentinel', 'Neon Sentinel'], ['hang-on-fren', 'Hang On, Fren']]
let app

async function openArcade() {
  const env = { ...process.env, ARCADE_KIOSK: verifyKiosk ? '1' : '0' }
  delete env.ARCADE_GAMES_DIR
  delete env.ARCADE_CONFIG
  delete env.ELECTRON_RUN_AS_NODE
  if (artifact?.endsWith('.AppImage')) env.APPIMAGE_EXTRACT_AND_RUN = '1'
  if (!artifact) {
    env.ARCADE_GAMES_DIR = join(scratch, 'games')
    env.ARCADE_CABINET_GAMES_DIR = resolve('release/cabinet-games')
  }
  app = await electron.launch({
    executablePath: artifact,
    args: [
      ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []),
      `--user-data-dir=${profile}`,
      ...(artifact ? [] : [resolve('out/main/index.js')]),
    ],
    env,
    timeout: 60000,
  })
  if (verifyGameplay && process.platform === 'linux') {
    // The virtual X11 display has no hardware acceleration.
    await app.context().addInitScript(() => {
      if (location.hostname === '127.0.0.1') localStorage.setItem('pallasite:quality', 'low')
    })
  }
  const page = await app.firstWindow()
  await page.locator('.tile-active').waitFor()
  return page
}

async function activate(button) {
  // The Windows runner can suppress compositor frames during an animation.
  if (process.platform === 'win32') {
    await button.waitFor()
    await button.evaluate(element => element.click())
  } else {
    await button.click()
  }
}

async function tapMenuPad(shell, { buttons = [], hat } = {}) {
  await shell.evaluate(async ({ buttons, hat }) => {
    const pad = {
      id: 'Xbox Test Controller', index: 0, connected: true,
      mapping: hat ? '' : 'standard',
      axes: hat ? [0, 0, 0, 0, 0, 0, ...hat] : [0, 0, 0, 0],
      buttons: Array.from({ length: hat ? 11 : 17 }, (_, index) => ({
        pressed: buttons.includes(index), touched: buttons.includes(index), value: Number(buttons.includes(index)),
      })),
    }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
    const sample = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await sample()
    pad.axes.fill(0)
    pad.buttons = pad.buttons.map(() => ({ pressed: false, touched: false, value: 0 }))
    await sample()
  }, { buttons, hat })
}

async function setTestController(game, { connected = true, pressA = false }) {
  await app.evaluate(async ({ webContents }, { url, connected, pressA }) => {
    const view = webContents.getAllWebContents().find(contents => contents.getURL() === url)
    if (!view) throw new Error('Could not find the installed game view.')
    await view.executeJavaScriptInIsolatedWorld(999, [{ code: `
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [${JSON.stringify(connected ? {
          index: 0, id: 'Xbox Test Controller', timestamp: 1,
          connected, mapping: 'standard', axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, (_, index) => {
            const pressed = pressA && index === 0
            return { pressed, touched: pressed, value: Number(pressed) }
          }),
        } : null)}],
      })
    ` }])
  }, { url: game.url(), connected, pressA })
}

async function checkPlayable(game, id) {
  game.setDefaultTimeout(12000)
  await game.waitForFunction(() => document.hasFocus(), undefined, { polling: 100 })
  if (id === 'pallasite') {
    await playPallasiteBooth(game, activate)
  } else if (id === 'hang-on-fren') {
    await playHangOnFren(game)
  } else {
    await game.locator('body[data-neon-phase="title"]').waitFor()
    await game.waitForFunction(() => document.hasFocus() && document.visibilityState === 'visible', undefined, { polling: 100 })
    await game.evaluate(() => window.addEventListener('keydown', event => {
      document.body.dataset.cabinetTestKey = `${event.code} (trusted: ${event.isTrusted})`
    }, { capture: true }))
    const later = game.locator('#v4v-later:visible')
    const playing = game.locator('body[data-neon-phase="playing"]')
    const started = later.or(playing).first()
    await game.keyboard.press('Enter', { delay: 100 })
    try {
      await started.waitFor({ timeout: 3_000 })
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error
      await game.keyboard.press('Space', { delay: 100 })
      await started.waitFor({ timeout: 45_000 })
    }
    if (await later.isVisible()) await later.click()
    await playing.waitFor({ timeout: 45_000 })
  }
  await setTestController(game, { pressA: true })
  await game.waitForFunction(() => navigator.getGamepads()[0]?.buttons[0].pressed)
  await setTestController(game, { connected: false })
  const notice = game.getByText(/Controller disconnected/, { exact: false })
  await notice.waitFor()
  const paused = {
    pallasite: game.getByRole('heading', { name: 'PAUSED', exact: true }),
    'neon-sentinel': game.locator('body[data-neon-phase="paused"]'),
    'hang-on-fren': game.locator('body[data-phase="playing"][data-paused="1"]'),
  }[id]
  await paused.waitFor()
  await setTestController(game, {})
  await game.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))
  await setTestController(game, { pressA: true })
  await notice.waitFor({ state: 'detached' })
  assert.equal(await game.evaluate(() => navigator.getGamepads()[0]?.buttons[0].pressed), false)
  await paused.waitFor()
  if (id === 'hang-on-fren') {
    await setTestController(game, {})
    await game.waitForFunction(() => navigator.getGamepads()[0]?.timestamp === 1)
    await setTestController(game, { pressA: true })
    await paused.waitFor({ state: 'detached' })
    await game.locator('body[data-phase="playing"]').waitFor()
  }
}

try {
  const shell = await openArcade()
  const gamesDir = await shell.evaluate(async () => (await window.arcade.getConfig()).gamesDir)
  assert.equal(gamesDir, artifact ? join(profile, 'games') : join(scratch, 'games'))
  await mkdir(gamesDir, { recursive: true })
  await writeFile(join(gamesDir, '.write-test'), '')
  console.log('PASS: the cabinet catalogue writes to the user profile or the configured override.')
  const missingLogos = await shell.evaluate(async () => {
    const games = await window.arcade.listGames()
    const results = await Promise.all(games.map(game => {
      const logo = new Image()
      logo.src = game.logo
      return logo.decode().then(() => null, () => game.id)
    }))
    return results.filter(Boolean)
  })
  assert.deepEqual(missingLogos, [], 'The bundled game logos should load from the installed app.')
  if (verifyKiosk) {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setKiosk(false)
      window.setFullScreen(false)
    })
    let restored = false
    for (let attempt = 0; attempt < 30 && !restored; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      restored = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        return window.isKiosk() && window.isFullScreen()
      })
    }
    assert(restored, 'Kiosk mode should recover fullscreen after a window transition.')
    console.log('PASS: the cabinet restores fullscreen automatically in kiosk mode.')
  }
  await shell.keyboard.press('Enter')
  const ready = shell.getByRole('dialog', { name: 'Pallasite', exact: true })
  await ready.locator('.ready-start:focus').waitFor()
  await shell.keyboard.press('Shift+Tab')
  await ready.locator('.ready-cancel:focus').waitFor()
  await shell.keyboard.press('Enter')
  await ready.waitFor({ state: 'hidden' })
  await shell.getByRole('button', { name: 'Install Pallasite', exact: true }).waitFor()
  console.log('PASS: pressing Enter with Back focused closes the game details without installing.')

  await shell.keyboard.press('g')
  const settings = shell.getByRole('dialog', { name: 'GAMES SETTINGS' })
  await settings.waitFor()
  await shell.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })
  await tapMenuPad(shell, { buttons: [2] })
  await settings.waitFor()
  if (process.arch === 'x64' && (process.platform === 'linux' || process.platform === 'win32')) {
    await settings.getByRole('button', { name: 'Download and install Pallasite Desktop' }).waitFor()
  }
  if (process.platform === 'win32') await settings.getByRole('button', { name: 'Find BTC Proof of Play on this PC' }).waitFor()
  await settings.locator('.gp-selected').filter({ hasText: 'Install Pallasite for offline play' }).waitFor()
  await tapMenuPad(shell, { hat: [0, 1] })
  await settings.locator('.gp-selected:focus').filter({ hasText: 'Install Neon Sentinel for offline play' }).waitFor()
  await tapMenuPad(shell, { hat: [0, -1] })
  await settings.locator('.gp-selected:focus').filter({ hasText: 'Install Pallasite for offline play' }).waitFor()
  await tapMenuPad(shell, { buttons: [0], hat: [0, 0] })
  try {
    await settings.waitFor({ state: 'hidden' })
  } catch (error) {
    console.error('Pallasite install status:', await settings.locator('.gp-local-status').textContent({ timeout: 1000 }).catch(() => 'unavailable'))
    throw error
  }
  await shell.getByRole('button', { name: 'Play Pallasite', exact: true }).waitFor()
  console.log('PASS: G and controller X open Games Settings, and a Linux HAT controller can select and install Pallasite.')
  for (const [id, name] of tiles) {
    if (id !== 'pallasite') {
      await activate(shell.locator('button.dot').and(shell.getByRole('button', { name: `Select ${name}`, exact: true })))
    }
    if (id === 'pallasite') {
      await activate(shell.getByRole('button', { name: 'Play Pallasite', exact: true }))
    } else {
      await activate(shell.getByRole('button', { name: `Install ${name}`, exact: true }))
      await activate(shell.getByRole('button', { name: /install on this arcade/i }))
    }
    const play = shell.getByRole('button', { name: /start game/i })
    await play.waitFor()
    const installed = join(profile, 'cabinet-games', id)
    const revision = await readFile(join(installed, 'revision'), 'utf8')
    assert.match(revision, /^[a-f0-9]{40}\n$/)
    const [game] = await Promise.all([
      app.waitForEvent('window', { predicate: page => page !== shell }),
      activate(play),
    ])
    const pageErrors = []
    game.on('pageerror', error => pageErrors.push(error.message))
    const launchUrl = id === 'pallasite' ? /^http:\/\/127\.0\.0\.1:\d+\/\?p1&fullfx=1$/ : /^http:\/\/127\.0\.0\.1:\d+\/$/
    await game.waitForURL(launchUrl, { waitUntil: 'commit' })
    if (id === 'pallasite') {
      await game.getByText('PALLASITE · STATION 1', { exact: true }).waitFor()
      console.log('PASS: installed Pallasite opened the Station 1 lobby.')
    }
    const response = await fetch(game.url())
    assert.equal(response.status, 200)
    assert.equal(await response.text(), await readFile(join(installed, 'site', 'index.html'), 'utf8'))
    if (verifyGameplay) {
      try {
        await game.waitForFunction(() => typeof window.gamestrCabinetGamepad === 'function', undefined, { polling: 100 })
        assert.equal(await game.evaluate(() => typeof window.arcade), 'undefined')
        await game.locator('canvas').first().waitFor({ state: 'attached' })
        const canReachApi = await game.evaluate(() => fetch('/api/game-config').then(() => true, () => false))
        assert.equal(canReachApi, false)
        await checkPlayable(game, id)
      } catch (error) {
        const viewState = await Promise.race([
          game.evaluate(() => ({
            phase: document.body.dataset.phase ?? document.body.dataset.neonPhase,
            focus: document.hasFocus(),
            lastKey: document.body.dataset.cabinetTestKey,
            overlay: [...document.querySelectorAll('.overlay h2, [role="dialog"]:not([hidden]) h2')].map(heading => heading.textContent),
          })).catch(() => undefined),
          new Promise(resolve => setTimeout(resolve, 3000).unref()),
        ])
        console.error(`${name} game state at failure`, { ...viewState, pageErrors })
        throw error
      }
    }
    const closed = game.waitForEvent('close')
    await shell.evaluate(() => window.arcade.back())
    await closed
    await shell.getByRole('button', { name: `Play ${name}`, exact: true }).waitFor()
    const actions = verifyGameplay ? 'starts a local run, pauses on controller loss' : 'loads its local assets'
    console.log(`PASS: ${name} installs, ${actions} and returns to the cabinet.`)
  }
  await app.close()
  app = undefined
  const afterRestart = await openArcade()
  const games = await afterRestart.evaluate(() => window.arcade.listGames())
  // The Windows catalogue also lists the downloadable BTC: Proof of Play pack.
  const bundled = games.filter(game => tiles.some(([id]) => id === game.id))
  assert.deepEqual(bundled.map(game => [game.id, game.cabinetInstall]), tiles.map(([id]) => [id, 'installed']))
  console.log('PASS: the games remain installed after restarting the cabinet.')
} finally {
  if (app) await app.close()
  await rm(scratch, { recursive: true, force: true })
}
