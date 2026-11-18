import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const args = process.argv.slice(2)
const verifyGameplay = !args.includes('--install-only')
const artifactPath = args.find(arg => arg !== '--install-only')
const artifact = artifactPath ? resolve(artifactPath) : undefined
const scratch = await mkdtemp(join(tmpdir(), 'gamestr-installed-games-'))
const profile = join(scratch, 'profile')
const tiles = [['pallasite', 'Pallasite'], ['neon-sentinel', 'Neon Sentinel']]
let app

async function openArcade() {
  const env = { ...process.env, ARCADE_KIOSK: '0' }
  delete env.ARCADE_GAMES_DIR
  delete env.ARCADE_CONFIG
  delete env.ELECTRON_RUN_AS_NODE
  if (artifact) env.APPIMAGE_EXTRACT_AND_RUN = '1'
  else {
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

async function setTestController(game, { connected = true, pressA = false }) {
  await app.evaluate(async ({ webContents }, { url, connected, pressA }) => {
    const view = webContents.getAllWebContents().find(contents => contents.getURL() === url)
    if (!view) throw new Error('Could not find the installed game view.')
    await view.executeJavaScriptInIsolatedWorld(999, [{ code: `
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [${JSON.stringify(connected ? {
          index: 0, id: 'Xbox Test Controller', timestamp: 0,
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
    await game.getByRole('button', { name: 'PLAY ▶', exact: true }).click()
    await game.getByRole('button', { name: /play as guest/i }).click()
    await game.keyboard.type('CABINET')
    await game.getByRole('button', { name: /done/i }).click()
    await game.getByRole('button', { name: /^IGNITE/ }).click()
    await game.getByRole('button', { name: 'Skip intro', exact: true }).click()
    const later = game.getByRole('button', { name: 'NEXT TIME', exact: true })
    if (await later.isVisible()) await later.click()
    await game.locator('body[data-phase="playing"]').waitFor({ timeout: 45000 })
  } else {
    await game.locator('body[data-neon-phase="title"]').waitFor()
    await game.keyboard.press('Enter')
    const later = game.locator('#v4v-later')
    const playing = game.locator('body[data-neon-phase="playing"]')
    await later.or(playing).waitFor()
    if (await later.isVisible()) await later.click()
    await playing.waitFor()
  }
  await setTestController(game, { pressA: true })
  await game.waitForFunction(() => navigator.getGamepads()[0]?.buttons[0].pressed)
  await setTestController(game, { connected: false })
  const notice = game.getByText(/Controller disconnected/, { exact: false })
  await notice.waitFor()
  const paused = id === 'pallasite'
    ? game.getByRole('heading', { name: 'PAUSED', exact: true })
    : game.locator('body[data-neon-phase="paused"]')
  await paused.waitFor()
  await setTestController(game, {})
  await game.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))
  await setTestController(game, { pressA: true })
  await notice.waitFor({ state: 'detached' })
  assert.equal(await game.evaluate(() => navigator.getGamepads()[0]?.buttons[0].pressed), false)
  await paused.waitFor()
}

try {
  const shell = await openArcade()
  const gamesDir = await shell.evaluate(async () => (await window.arcade.getConfig()).gamesDir)
  assert.equal(gamesDir, artifact ? join(profile, 'games') : join(scratch, 'games'))
  await mkdir(gamesDir, { recursive: true })
  await writeFile(join(gamesDir, '.write-test'), '')
  console.log('PASS: the cabinet catalogue writes to the user profile or the configured override.')
  for (const [index, [id, name]] of tiles.entries()) {
    if (index) await shell.keyboard.press('ArrowRight')
    await shell.getByRole('button', { name: `Install ${name}`, exact: true }).click()
    await shell.getByRole('button', { name: /install on this arcade/i }).click()
    const play = shell.getByRole('button', { name: /start game/i })
    await play.waitFor()
    const installed = join(profile, 'cabinet-games', id)
    const revision = await readFile(join(installed, 'revision'), 'utf8')
    assert.match(revision, /^[a-f0-9]{40}\n$/)
    const view = app.waitForEvent('window', { predicate: page => page !== shell })
    await play.click()
    const game = await view
    const pageErrors = []
    game.on('pageerror', error => pageErrors.push(error.message))
    await game.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/$/, { waitUntil: 'commit' })
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
  assert.deepEqual(games.map(game => [game.id, game.cabinetInstall]), tiles.map(([id]) => [id, 'installed']))
  console.log('PASS: both tiles remain installed after restarting the cabinet.')
} finally {
  if (app) await app.close()
  await rm(scratch, { recursive: true, force: true })
}
