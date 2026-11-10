// Exercise the real packaged IPC and game views using disposable loopback fixtures.
// Automated keyboard evidence is separate from the physical controller gate.
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { verifyEvent } from 'nostr-tools/pure'
import { WebSocket, WebSocketServer } from 'ws'
import { connectNativeFocusInspector } from './runtime-native-focus.mjs'
import { probeSystemInput, sendOwnedSystemKey } from './runtime-system-input.mjs'

const root = process.argv[2]
if (!root) throw new Error('Pass the isolated runtime fixture directory')
let browser
let stage = 'starting runtime'
let shellPage
let gamePage
let nativeInspector
let phoneSocket
let relayPhoneSocket
let hostSocket
let hostJoined = false
let relayOrigin
const phoneSpecs = []
const nativeFocus = []
const returnFocus = []
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(`<!doctype html><title>Isolated runtime game</title><h1>Runtime fixture</h1><script>
    window.fixtureKeys = [];
    addEventListener('keydown', event => fixtureKeys.push({ key: event.key, trusted: event.isTrusted }));
  </script>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const controllerRelay = `ws://127.0.0.1:${server.address().port}/controller`
// A disposable protocol fixture exercises the shipped host SDK and the actual
// shell WebSocket. It never contacts the public relay or handles a real key.
const relay = new WebSocketServer({ noServer: true })
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, origin)
  if (url.pathname !== '/controller' || url.searchParams.get('v') !== '2') { socket.destroy(); return }
  relay.handleUpgrade(request, socket, head, client => {
    if (url.searchParams.get('r') === 'host') {
      hostSocket = client
      relayOrigin = request.headers.origin
      client.on('message', data => {
        const frame = JSON.parse(String(data))
        if (frame.type === 'host-join') {
          hostJoined = /^[a-f0-9]{64}$/.test(frame.hostToken) && Object.keys(frame).sort().join(',') === 'hostToken,type'
          if (hostJoined) client.send(JSON.stringify({ type: 'host-ready', version: 2 }))
        } else if (frame.type === 'controller-spec' && relayPhoneSocket?.readyState === WebSocket.OPEN) {
          relayPhoneSocket.send(JSON.stringify(frame))
        }
      })
    } else if (url.searchParams.get('r') === 'phone' && hostJoined) {
      relayPhoneSocket = client
      client.on('message', data => {
        const frame = JSON.parse(String(data))
        if (frame.type === 'controller-join') hostSocket.send(JSON.stringify({ type: 'peer-up' }))
        else if (frame.type === undefined && typeof frame.k === 'string' && typeof frame.v === 'string') hostSocket.send(JSON.stringify(frame))
      })
      client.on('close', () => {
        if (hostSocket?.readyState === WebSocket.OPEN) hostSocket.send(JSON.stringify({ type: 'peer-down' }))
      })
    } else client.close(1008, 'fixture-role')
  })
})
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
  controllerRelay,
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
  await nativeInspector.observeInput()
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
        readyOpen: !!document.querySelector('.ready-overlay.is-open'),
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

  stage = 'custom controller relay handshake'
  await shell.getByRole('button', { name: 'Pair phone', exact: true }).click()
  const pairingLink = shell.getByRole('link', { name: 'Browser, iPhone, iPad and Android options' })
  await pairingLink.waitFor({ state: 'visible' })
  const pairing = new URL(await pairingLink.getAttribute('href'))
  assert.equal(pairing.searchParams.get('w'), controllerRelay)
  assert.equal(pairing.searchParams.get('v'), '2')
  assert.match(pairing.searchParams.get('s'), /^[A-Z]{6}$/)
  assert.equal(pairing.searchParams.has('hostToken'), false)
  await until(() => hostJoined)
  assert.notEqual(relayOrigin, 'https://arcade.600.wtf', 'Custom relay Origin must be untouched')
  const phoneEndpoint = new URL(controllerRelay)
  for (const [key, value] of [['s', pairing.searchParams.get('s')], ['v', '2'], ['r', 'phone']]) phoneEndpoint.searchParams.set(key, value)
  phoneSocket = new WebSocket(phoneEndpoint)
  phoneSocket.on('message', data => {
    const frame = JSON.parse(String(data))
    if (frame.type === 'controller-spec') phoneSpecs.push(frame.spec)
  })
  await new Promise((resolve, reject) => { phoneSocket.once('open', resolve); phoneSocket.once('error', reject) })
  phoneSocket.send(JSON.stringify({ type: 'controller-join' }))
  await until(() => phoneSpecs.some(spec => spec.name === 'Gamestr Arcade'))
  await shell.getByRole('button', { name: 'Phone connected', exact: true }).waitFor({ state: 'visible' })
  await shell.locator('#app').focus()

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
    // Native focus alone can precede the renderer's first presented frame.
    // Wait for the actual fixture content and a rendered frame before input;
    // this does not create a key handler or change any trusted-key assertion.
    await game.getByRole('heading', { name: 'Runtime fixture', exact: true }).waitFor({ state: 'visible' })
    await game.evaluate(() => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Focused game did not render a frame')), 3000)
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(true) }))
    }))
    return game
  }
  async function returnFromGame(game, label) {
    stage = `${label} Escape close`
    if (process.platform === 'linux') await sendOwnedSystemKey({ inspector: nativeInspector, key: 'Escape', action: 'keydown' })
    else await game.keyboard.down('Escape')
    await until(() => game.isClosed())
    const snapshot = phase => shell.evaluate(phase => ({
      phase, at: performance.now(), focused: document.hasFocus(),
      activeElementId: document.activeElement?.id,
      activeElementClass: document.activeElement?.className,
    }), phase)
    stage = `${label} shell focus after Escape`
    returnFocus.push({ game: label, ...await snapshot('before key release') })
    if (process.platform === 'linux') await sendOwnedSystemKey({ inspector: nativeInspector, key: 'Escape', action: 'keyup' })
    else await shell.keyboard.up('Escape')
    returnFocus.push({ game: label, ...await snapshot('after key release') })
    await shell.waitForFunction(() => document.activeElement?.id === 'app')
  }
  const first = await launch()
  stage = 'native phone relay gamepad bridge'
  await until(() => phoneSpecs.some(spec => spec.name === 'Gamestr game'))
  phoneSocket.send(JSON.stringify({ k: 'joyL-x', v: '600' }))
  phoneSocket.send(JSON.stringify({ k: 'A', v: '1' }))
  await first.waitForFunction(()=>navigator.getGamepads()[0]?.id==='Gamestr Joystick phone')
  await first.waitForFunction(()=>navigator.getGamepads()[0]?.axes[0]===.6 && navigator.getGamepads()[0]?.buttons[0].pressed)
  assert.deepEqual(await first.evaluate(()=>({axis:navigator.getGamepads()[0].axes[0],fire:navigator.getGamepads()[0].buttons[0].pressed})),{axis:.6,fire:true})
  phoneSocket.close()
  // A disconnected phone may leave an allocated virtual pad. Input must be
  // neutral immediately; physical controllers remain available beside it.
  await first.waitForFunction(()=>!navigator.getGamepads()[0]?.buttons[0]?.pressed && !navigator.getGamepads()[0]?.axes.some(axis=>axis!==0))
  stage = 'first game signing' 
  const pubkey = await first.evaluate(() => window.nostr.getPublicKey())
  assert.match(pubkey, /^[0-9a-f]{64}$/)
  const signed = await first.evaluate(() => window.nostr.signEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'Disposable packaged-runtime check; never published.' }))
  assert.equal(signed.pubkey, pubkey)
  assert.equal(verifyEvent(signed), true)
  stage = 'first game trusted ArrowUp'
  nativeFocus.push({ stage, ...await nativeInspector.read() })
  if (process.platform === 'linux') await sendOwnedSystemKey({ inspector: nativeInspector, key: 'Up' })
  else await first.keyboard.press('ArrowUp')
  await first.waitForFunction(() => fixtureKeys.some(event => event.key === 'ArrowUp' && event.trusted))
  if (process.platform === 'linux') {
    const state = await nativeInspector.read()
    assert(state.nativeInputEvents.some(event => event.role === 'game' && event.type === 'keyDown' && event.key === 'ArrowUp'))
  }
  const authority = await first.evaluate(() => {
    localStorage.setItem('runtime-guest', 'previous visitor')
    document.cookie = 'runtime_guest=previous; path=/'
    return { wallet: typeof window.webln, node: typeof window.require, shellBridge: typeof window.arcade }
  })
  assert.deepEqual(authority, { wallet: 'undefined', node: 'undefined', shellBridge: 'undefined' })
  await returnFromGame(first, 'first game')
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
  await returnFromGame(second, 'second game')
  writeFileSync(`${root}/journeys.json`, JSON.stringify({
    keyboardCarouselNavigation: true, launchAndReturn: true, guestSignatureVerified: true, nativePhoneGamepad:true, nativePhoneRelease:true,
    nativePhoneRelayHandshake: true, customRelayOriginUnchanged: true,
    freshGuestOnRelaunch: true, gameStorageAndCookiesIsolated: true,
    trustedGameKeyboardInput: true, walletUnavailableWithoutConfiguration: true,
    gameKeyboardDriver: process.platform === 'linux' ? 'X11 XTEST' : 'CDP',
    noNodeOrShellBridgeInGame: true, physicalControllerAcceptance: 'pending',
    nativeFocus, returnFocus,
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
      phoneGamepad: (() => { const pad = [...navigator.getGamepads()].find(pad => pad?.id === 'Gamestr Joystick phone'); return pad ? { id: pad.id, axes: [...pad.axes], pressed: pad.buttons.map(button => button.pressed) } : null })(),
    })).catch(() => ({ inspectionFailed: true }))
  }
  const currentNativeFocus = nativeInspector ? await nativeInspector.read().catch(() => ({ inspectionFailed: true })) : null
  // Keep the original failure. A separate OS-input probe helps distinguish
  // debugger injection from keyboard delivery without making the gate pass.
  const systemInput = nativeInspector && gamePage &&
    (stage === 'first game trusted ArrowUp' || stage === 'first game Escape close' || stage === 'second game Escape close')
    ? await probeSystemInput({ inspector: nativeInspector, page: gamePage,
      key: stage === 'first game trusted ArrowUp' ? 'Up' : 'Escape' })
    : { attempted: false };
  const failure = { stage, error: error instanceof Error ? error.message : String(error), pages, nativeFocus, currentNativeFocus, returnFocus, systemInput }
  writeFileSync(`${root}/journeys-failure.json`, JSON.stringify(failure, null, 2))
  console.error('Packaged runtime failure diagnostics:', JSON.stringify(failure))
  throw error
} finally {
  clearTimeout(watchdog)
  if (nativeInspector) await nativeInspector.close()
  if (browser) await browser.close()
  for (const client of relay.clients) client.terminate()
  if (phoneSocket) phoneSocket.terminate()
  await new Promise(resolve => relay.close(resolve))
  await new Promise(resolve => server.close(resolve))
}
