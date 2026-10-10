// Exercise the real packaged IPC and game views using disposable loopback fixtures.
// Keyboard/CDP evidence is separate from the physical conference controller gate.
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { verifyEvent } from 'nostr-tools/pure'
import { connectNativeFocusInspector } from './runtime-native-focus.mjs'

const root = process.argv[2]
if (!root) throw new Error('Pass the isolated runtime fixture directory')
let browser
let stage = 'starting runtime'
let shellPage
let gamePage
let nativeInspector
const nativeFocus = []
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
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const nativeDebugPort = probe.address().port
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
writeFileSync(`${root}/native-debug-port`, String(nativeDebugPort))
writeFileSync(`${root}/fixture-ready`, 'ready')

const watchdog = setTimeout(() => { console.error('Packaged runtime journeys exceeded 75 seconds'); process.exit(1) }, 75000)
async function until(check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await delay(100) }
  throw new Error('Packaged runtime condition did not become ready')
}
try {
  await until(() => existsSync(`${root}/ready.json`), 35000)
  nativeInspector = await connectNativeFocusInspector(nativeDebugPort)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
  const context = browser.contexts()[0]
  const shell = await until(() => context.pages().find(page => page.url().startsWith('file:')))
  shellPage = shell
  await shell.evaluate(() => {
    window.runtimeFocusHistory = []
    window.runtimeKeyHistory = []
    window.runtimeFocusCalls = []
    const originalFocus = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function (...args) {
      runtimeFocusCalls.push({ id: this.id, className: this.className,
        at: performance.now(), documentFocused: document.hasFocus(),
        stack: new Error().stack?.split('\n').slice(2, 6) })
      if (runtimeFocusCalls.length > 30) runtimeFocusCalls.shift()
      return Reflect.apply(originalFocus, this, args)
    }
    const record = event => {
      const active = document.activeElement
      runtimeFocusHistory.push({ event, id: active?.id, className: active?.className,
        at: performance.now(), documentFocused: document.hasFocus(),
        readyOpen: !!document.querySelector('.ready-overlay.is-open') })
      if (runtimeFocusHistory.length > 20) runtimeFocusHistory.shift()
    }
    addEventListener('focusin', () => record('focusin'))
    addEventListener('focus', () => record('window-focus'))
    addEventListener('blur', () => record('window-blur'))
    for (const type of ['keydown', 'keyup']) addEventListener(type, event => {
      runtimeKeyHistory.push({ type, key: event.key, trusted: event.isTrusted, id: document.activeElement?.id })
      if (runtimeKeyHistory.length > 20) runtimeKeyHistory.shift()
    }, true)
  })
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
    gamePage = game
    await game.waitForFunction(() => !!window.nostr)
    // Preload IPC can be ready before did-finish-load reveals/focuses the view.
    // Exercise input after the real application gives the game keyboard focus.
    await game.waitForFunction(() => document.readyState === 'complete' && document.hasFocus())
    return game
  }
  const first = await launch()
  stage = 'first game signing'
  const pubkey = await first.evaluate(() => window.nostr.getPublicKey())
  assert.match(pubkey, /^[0-9a-f]{64}$/)
  const signed = await first.evaluate(() => window.nostr.signEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'Disposable packaged-runtime check; never published.' }))
  assert.equal(signed.pubkey, pubkey)
  assert.equal(verifyEvent(signed), true)
  stage = 'first game trusted ArrowUp'
  nativeFocus.push({ stage, ...await nativeInspector.read() })
  await first.keyboard.press('ArrowUp')
  await first.waitForFunction(() => fixtureKeys.some(event => event.key === 'ArrowUp' && event.trusted))
  const authority = await first.evaluate(() => {
    localStorage.setItem('runtime-guest', 'previous visitor')
    document.cookie = 'runtime_guest=previous; path=/'
    return { wallet: typeof window.webln, node: typeof window.require, shellBridge: typeof window.arcade }
  })
  assert.deepEqual(authority, { wallet: 'undefined', node: 'undefined', shellBridge: 'undefined' })
  stage = 'first game Escape return'
  await first.keyboard.down('Escape')
  await until(() => first.isClosed())
  await shell.keyboard.up('Escape')
  await shell.waitForFunction(() => document.activeElement?.id === 'app')
  stage = 'second game launch'
  const second = await launch()
  stage = 'second game isolation'
  const fresh = await second.evaluate(async () => ({ pubkey: await window.nostr.getPublicKey(), storage: localStorage.getItem('runtime-guest'), cookies: document.cookie, wallet: typeof window.webln }))
  assert.notEqual(fresh.pubkey, pubkey)
  assert.equal(fresh.storage, null)
  assert.equal(fresh.cookies, '')
  assert.equal(fresh.wallet, 'undefined')
  stage = 'second game Escape return'
  nativeFocus.push({ stage, ...await nativeInspector.read() })
  await second.keyboard.down('Escape')
  await until(() => second.isClosed())
  await shell.keyboard.up('Escape')
  await shell.waitForFunction(() => document.activeElement?.id === 'app')
  writeFileSync(`${root}/journeys.json`, JSON.stringify({
    keyboardCarouselNavigation: true, launchAndReturn: true, guestSignatureVerified: true,
    freshGuestOnRelaunch: true, gameStorageAndCookiesIsolated: true,
    trustedGameKeyboardInput: true, walletUnavailableWithoutConfiguration: true,
    noNodeOrShellBridgeInGame: true, physicalControllerAcceptance: 'pending',
    nativeFocus,
    shellFocus: await shell.evaluate(() => ({
      history: window.runtimeFocusHistory ?? [],
      calls: window.runtimeFocusCalls ?? [],
    })),
  }))
} catch (error) {
  const pages = {}
  for (const [name, page] of [['shell', shellPage], ['game', gamePage]]) {
    pages[name] = !page ? { available: false } : page.isClosed() ? { closed: true } : await page.evaluate(() => ({
      closed: false, readyState: document.readyState, focused: document.hasFocus(),
      visibility: document.visibilityState, activeElement: document.activeElement?.tagName,
      activeElementId: document.activeElement?.id, activeElementClass: document.activeElement?.className,
      activeElementInert: !!document.activeElement?.closest('[inert]'),
      readyOpen: !!document.querySelector('.ready-overlay.is-open'),
      focusHistory: window.runtimeFocusHistory ?? [],
      focusCalls: window.runtimeFocusCalls ?? [],
      keyHistory: window.runtimeKeyHistory ?? [],
      keys: window.fixtureKeys ?? [],
    })).catch(() => ({ inspectionFailed: true }))
  }
  const currentNativeFocus = nativeInspector ? await nativeInspector.read().catch(() => ({ inspectionFailed: true })) : null
  const failure = { stage, error: error instanceof Error ? error.message : String(error), pages, nativeFocus, currentNativeFocus }
  writeFileSync(`${root}/journeys-failure.json`, JSON.stringify(failure, null, 2))
  console.error('Packaged runtime failure diagnostics:', JSON.stringify(failure))
  throw error
} finally {
  clearTimeout(watchdog)
  nativeInspector?.close()
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
}
