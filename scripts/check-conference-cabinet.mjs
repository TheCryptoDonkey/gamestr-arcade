// Real Electron shell, preload and isolated guest game; no public signer or keys.
// This checks the local build and does not certify Linux/physical booth hardware.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { verifyEvent } from 'nostr-tools/pure'

const scratch = await mkdtemp(join(tmpdir(), 'gamestr-conference-cabinet-'))
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end('<!doctype html><title>Disposable conference game</title><h1>Guest fixture</h1>')
})
let app
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const games = join(scratch, 'games'), game = join(games, 'fixture')
  await mkdir(game, { recursive: true })
  await writeFile(join(game, 'game.json'), JSON.stringify({ manifestVersion: 2, gameId: 'fixture', name: 'Guest fixture', url: origin, inputModes: ['keyboard'], network: 'optional', capabilities: { nostrSign: true } }))
  const config = join(scratch, 'arcade.config.json')
  await writeFile(config, JSON.stringify({ gamesDir: games, kiosk: false, attractTimeoutMs: 120000, leaderboard: { provider: 'none' }, theme: { title: 'Conference runtime check', crt: false } }))
  const env = { ...process.env, ARCADE_CONFIG: config, ARCADE_KIOSK: '0' }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [`--user-data-dir=${join(scratch, 'profile')}`, resolve('out/main/index.js')], env, timeout: 30000 })
  const shell = await app.firstWindow()
  await shell.locator('.tile-active').waitFor()
  assert.equal(await realpath(await app.evaluate(({ app }) => app.getPath('userData'))), await realpath(join(scratch, 'profile')))
  await shell.keyboard.press('p')
  await shell.locator('.player-pairing').waitFor()
  assert.deepEqual(await shell.locator('.player-pair-choice strong').allTextContents(), ['My Signet', 'Cambium', 'Another Nostr signer'])
  assert.match(await shell.evaluate(async () => { try { await window.arcade.confirmPlayerPairing(); return 'accepted' } catch (error) { return String(error) } }), /no longer available/)
  await shell.getByRole('button', { name: 'Play as guest', exact: true }).click()
  assert.equal(await shell.locator('.player-pairing').count(), 0)
  let previous
  for (let attempt = 0; attempt < 2; attempt++) {
    const gameWindow = app.waitForEvent('window', { predicate: page => page !== shell })
    const id = await shell.evaluate(async () => (await window.arcade.listGames())[0].id)
    await shell.evaluate(id => window.arcade.launch(id), id)
    const page = await gameWindow
    await page.waitForFunction(() => !!window.nostr)
    const result = await page.evaluate(async () => ({ shellApi: typeof window.arcade, pubkey: await window.nostr.getPublicKey(), event: await window.nostr.signEvent({ kind: 5555, created_at: Math.floor(Date.now() / 1000), content: '42', tags: [['game', 'fixture']] }) }))
    assert.equal(result.shellApi, 'undefined')
    assert.equal(result.event.pubkey, result.pubkey)
    assert.equal(verifyEvent(result.event), true)
    if (previous) assert.notEqual(result.pubkey, previous)
    previous = result.pubkey
    const closed = page.waitForEvent('close')
    await shell.evaluate(() => window.arcade.back())
    await closed
  }
  console.log('PASS: Electron own-product order, keyboard pairing, guest exit, confirmation guard, isolated signed guest games and fresh identity on relaunch.')
} finally {
  if (app) await app.close()
  await new Promise(resolve => server.close(resolve))
  await rm(scratch, { recursive: true, force: true })
}
