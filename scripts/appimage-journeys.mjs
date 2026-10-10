// Exercise the real packaged IPC and game views using disposable loopback fixtures.
// Keyboard/CDP evidence is separate from the physical conference controller gate.
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { verifyEvent } from 'nostr-tools/pure'

const root = process.argv[2]
if (!root) throw new Error('Pass the isolated runtime fixture directory')
let browser
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(`<!doctype html><title>Isolated runtime game</title><h1>Runtime fixture</h1><script>
    window.fixtureKeys = [];
    addEventListener('keydown', event => fixtureKeys.push({ key: event.key, trusted: event.isTrusted }));
  </script>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const debugPort = probe.address().port
await new Promise(resolve => probe.close(resolve))
for (const [index, slug] of ['game-a', 'game-b'].entries()) {
  const directory = `${root}/games/${slug}`
  mkdirSync(directory, { recursive: true })
  writeFileSync(`${directory}/game.json`, JSON.stringify({
    manifestVersion: 2, name: `Runtime ${index ? 'B' : 'A'}`, gameId: slug,
    order: index + 1, url: `${origin}/${slug}`, inputModes: ['keyboard'],
    network: 'optional', capabilities: { nostrSign: true, walletPay: true },
  }))
}
writeFileSync(`${root}/arcade.config.json`, JSON.stringify({
  gamesDir: `${root}/games`, kiosk: false, attractTimeoutMs: 120000,
  theme: { title: 'Packaged runtime journeys', accent: '#7cf3ff', crt: false },
  leaderboard: { provider: 'mock', relays: [], topN: 5 },
}))
writeFileSync(`${root}/debug-port`, String(debugPort))
writeFileSync(`${root}/fixture-ready`, 'ready')

const watchdog = setTimeout(() => { console.error('Packaged runtime journeys exceeded 75 seconds'); process.exit(1) }, 75000)
async function until(check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await delay(100) }
  throw new Error('Packaged runtime condition did not become ready')
}
try {
  await until(() => existsSync(`${root}/ready.json`), 35000)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
  const context = browser.contexts()[0]
  const shell = await until(() => context.pages().find(page => page.url().startsWith('file:')))
  const tile = shell.locator('.tile-active .tile-cap')
  await tile.waitFor({ state: 'visible' })
  assert.match(await tile.innerText(), /Runtime A/i)
  await shell.keyboard.press('ArrowRight')
  await until(async () => /Runtime B/i.test(await tile.innerText()))
  await shell.keyboard.press('ArrowLeft')
  await until(async () => /Runtime A/i.test(await tile.innerText()))

  async function launch() {
    await shell.bringToFront()
    await shell.keyboard.press('Enter')
    await shell.locator('.ready-overlay.is-open[aria-hidden="false"] .ready-start').waitFor({ state: 'visible' })
    await shell.keyboard.press('Enter')
    const game = await until(() => context.pages().find(page => page.url() === `${origin}/game-a`))
    await game.waitForFunction(() => !!window.nostr)
    // Preload IPC can be ready before did-finish-load reveals/focuses the view.
    // Exercise input after the real application gives the game keyboard focus.
    await game.waitForFunction(() => document.readyState === 'complete' && document.hasFocus())
    return game
  }
  const first = await launch()
  const pubkey = await first.evaluate(() => window.nostr.getPublicKey())
  assert.match(pubkey, /^[0-9a-f]{64}$/)
  const signed = await first.evaluate(() => window.nostr.signEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'Disposable packaged-runtime check; never published.' }))
  assert.equal(signed.pubkey, pubkey)
  assert.equal(verifyEvent(signed), true)
  await first.keyboard.press('ArrowUp')
  await first.waitForFunction(() => fixtureKeys.some(event => event.key === 'ArrowUp' && event.trusted))
  const authority = await first.evaluate(() => {
    localStorage.setItem('runtime-guest', 'previous visitor')
    document.cookie = 'runtime_guest=previous; path=/'
    return { wallet: typeof window.webln, node: typeof window.require, shellBridge: typeof window.arcade }
  })
  assert.deepEqual(authority, { wallet: 'undefined', node: 'undefined', shellBridge: 'undefined' })
  await first.keyboard.down('Escape')
  await until(() => first.isClosed())
  await shell.keyboard.up('Escape')
  await shell.waitForFunction(() => document.activeElement?.id === 'app')
  const second = await launch()
  const fresh = await second.evaluate(async () => ({ pubkey: await window.nostr.getPublicKey(), storage: localStorage.getItem('runtime-guest'), cookies: document.cookie, wallet: typeof window.webln }))
  assert.notEqual(fresh.pubkey, pubkey)
  assert.equal(fresh.storage, null)
  assert.equal(fresh.cookies, '')
  assert.equal(fresh.wallet, 'undefined')
  await second.keyboard.down('Escape')
  await until(() => second.isClosed())
  await shell.keyboard.up('Escape')
  await shell.waitForFunction(() => document.activeElement?.id === 'app')
  writeFileSync(`${root}/journeys.json`, JSON.stringify({
    keyboardCarouselNavigation: true, launchAndReturn: true, guestSignatureVerified: true,
    freshGuestOnRelaunch: true, gameStorageAndCookiesIsolated: true,
    trustedGameKeyboardInput: true, walletUnavailableWithoutConfiguration: true,
    noNodeOrShellBridgeInGame: true, physicalControllerAcceptance: 'pending',
  }))
} finally {
  clearTimeout(watchdog)
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
}
