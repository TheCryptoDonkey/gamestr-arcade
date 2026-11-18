import { test, expect, type BrowserContext, type WebSocketRoute, type Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'

const require = createRequire(import.meta.url), jsQR = require('jsqr'), { PNG } = require('pngjs')
const key = new Uint8Array(32).fill(41), pubkey = getPublicKey(key)

/** Disposable relay: real browser NIP-46 encryption and signatures, no public network. */
function relayFixture() {
  const subscribers = new Map<WebSocketRoute, Map<string, any[]>>(), events: any[] = []
  const matches = (event: any, filter: any) => (!filter.kinds || filter.kinds.includes(event.kind))
    && (!filter.authors || filter.authors.includes(event.pubkey)) && (!filter.since || event.created_at >= filter.since)
    && (!filter['#p'] || event.tags.some((tag: string[]) => tag[0] === 'p' && filter['#p'].includes(tag[1])))
  const deliver = (socket: WebSocketRoute, id: string, filters: any[], event: any) => { if (filters.some(filter => matches(event, filter))) socket.send(JSON.stringify(['EVENT', id, event])) }
  return async (context: BrowserContext) => {
    await context.route('https://**/*', route => route.abort())
    await context.routeWebSocket('wss://**', socket => {
      if (new URL(socket.url()).hostname !== 'relay.primal.net') { socket.close(); return }
      const subscriptions = new Map<string, any[]>(); subscribers.set(socket, subscriptions)
      socket.onClose(() => subscribers.delete(socket))
      socket.onMessage(raw => {
        const [type, id, ...values] = JSON.parse(String(raw))
        if (type === 'REQ') { subscriptions.set(id, values); for (const event of events) deliver(socket, id, values, event); socket.send(JSON.stringify(['EOSE', id])) }
        if (type === 'CLOSE') subscriptions.delete(id)
        if (type === 'EVENT') {
          events.push(id); if (events.length > 256) events.shift()
          socket.send(JSON.stringify(['OK', id.id, true, '']))
          for (const [client, requests] of subscribers) for (const [requestId, filters] of requests) deliver(client, requestId, filters, id)
        }
      })
    })
  }
}

async function qrPayload(page: Page): Promise<string> {
  const qr = page.getByRole('img', { name: 'Scan to connect your signer', exact: true })
  await expect(qr).toBeVisible()
  let payload = ''
  await expect.poll(async () => {
    const png = PNG.sync.read(await qr.screenshot())
    payload = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? ''
    return payload.length > 0
  }).toBe(true)
  return payload
}

async function approve(phone: Page, newTab = false): Promise<Page> {
  const link = phone.getByRole('link', { name: 'Approve with Cambium', exact: true })
  const href = (await link.getAttribute('href'))!
  expect(href).toContain('package=dev.forgesworn.cambium')
  await link.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }))
  await link.click()
  const request = new URL(href.split('#Intent;')[0].replace(/^intent:/, 'nostrsigner:'))
  const template = JSON.parse(decodeURIComponent(request.pathname))
  const callback = request.searchParams.get('callbackUrl')! + encodeURIComponent(JSON.stringify(finalizeEvent(template, key)))
  const returned = newTab ? await phone.context().newPage() : phone
  await returned.goto(callback)
  await expect(returned.getByRole('heading', { name: 'Your phone is connected.', exact: true })).toBeVisible()
  expect(returned.url()).not.toContain('event=')
  expect(returned.url()).not.toContain('request=')
  return returned
}

for (const [edition, port] of [['gamestr', 4174], ['600', 4175]] as const) {
  test(`${edition}: Cambium phone approval pairs, signs, returns in another tab and clears the next player`, async ({ browser, context, page }, testInfo) => {
    const relay = relayFixture(); await relay(context)
    const mobile = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/133.0 Mobile Safari/537.36', viewport: { width: 390, height: 844 } })
    try {
      // Android's API-35 image ships Chrome 124, whose custom-scheme URL
      // authority is empty. Retain that real-device regression in fast CI.
      await mobile.addInitScript(() => {
        const NativeURL = window.URL
        window.URL = class extends NativeURL {
          get hostname(): string { return this.protocol === 'nostrconnect:' ? '' : super.hostname }
        }
      })
      await relay(mobile)
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.goto(`http://127.0.0.1:${port}/`)
      await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
      await page.getByRole('button', { name: 'Pair a phone (Signet or Cambium)', exact: true }).click()
      const choices = page.locator('.player-pair-choice strong')
      await expect(choices).toHaveText(['My Signet', 'Cambium', 'Another Nostr signer'])
      await page.getByRole('button', { name: 'Cambium Approve on Android. Heartwood keeps your key', exact: true }).click()
      const pairing = await qrPayload(page)
      expect(new URL(pairing).pathname).toBe('/phone-pair/')
      expect(new URL(pairing).search).toBe('')
      expect(pairing.length).toBeLessThan(600)
      await expect(page.locator('.player-pair-method')).toHaveText('Cambium · scan with your Android phone camera')
      await expect(page.locator('.player-pair-code')).toBeHidden()
      // A second press on the selected method must not invalidate a code
      // already scanned while the visitor unlocks their hardware signer.
      await page.getByRole('button', { name: 'Cambium Approve on Android. Heartwood keeps your key', exact: true }).click()
      expect(await qrPayload(page)).toBe(pairing)
      expect(await page.locator('.player-pairing').evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('tv-pairing.jpg'), type: 'jpeg', quality: 70 })
      let phone = await mobile.newPage(); await phone.goto(pairing)
      await expect(phone.locator('body')).toHaveCSS('margin', '0px')
      await expect(phone.getByRole('heading', { name: 'Connect with Cambium.', exact: true })).toBeVisible()
      await expect(phone.locator('.code')).toHaveCount(0)
      await expect(phone.getByText('A confirmation code will appear after you approve.')).toBeVisible()
      phone = await approve(phone, true)
      await phone.screenshot({ path: testInfo.outputPath('phone-confirmation.jpg'), type: 'jpeg', quality: 70 })
      await expect(page.getByRole('button', { name: 'That’s me. Let’s play', exact: true })).toBeVisible()
      await expect(page.locator('.player-pair-code')).toBeVisible()
      await expect(phone.getByText('Account confirmation code', { exact: true })).toBeVisible()
      expect(await page.locator('.player-pair-code').textContent()).toBe(await phone.locator('.code').textContent())
      await expect(page.locator('.player-pair-identity')).toContainText('npub1')
      await page.getByRole('button', { name: 'That’s me. Let’s play', exact: true }).click()
      await expect(page.locator('.identity-trigger')).toBeVisible()
      expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('signet:login.')))).toEqual([])
      await page.evaluate(async () => {
        const { currentNostrSigner } = await import('/nostr-access.ts')
        const w = window as any; w.oldConferenceSigner = currentNostrSigner()
        w.conferenceResult = w.oldConferenceSigner.signEvent({ kind: 5555, created_at: Math.floor(Date.now() / 1000), content: '42', tags: [['game', 'pallasite']] }).then((event: any) => ({ event }), (error: Error) => ({ error: error.message }))
      })
      await expect(phone.getByRole('heading', { name: 'Approve this game action.', exact: true })).toBeVisible()
      phone = await approve(phone)
      const result = await page.evaluate(() => (window as any).conferenceResult)
      expect(result.event).toMatchObject({ pubkey, kind: 5555, content: '42' })
      await page.locator('.identity-trigger').click()
      await page.getByRole('menuitem', { name: 'FINISH / NEXT PLAYER', exact: true }).click()
      await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
      await expect(phone.getByRole('heading', { name: 'You’re disconnected.', exact: true })).toBeVisible()
      expect(await phone.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('gamestr:phone-pair:')))).toEqual([])
      const after = await page.evaluate(async () => { try { await (window as any).oldConferenceSigner.signEvent({ kind: 5555, content: '', tags: [], created_at: Math.floor(Date.now() / 1000) }); return 'signed' } catch { return 'revoked' } })
      expect(after).toBe('revoked')
    } finally { await mobile.close() }
  })
}

test('hardware pairing keeps its QR for five minutes and only retries when asked', async ({ page, context }) => {
  await relayFixture()(context)
  await page.clock.install()
  await page.goto('http://127.0.0.1:4174/')
  await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
  await page.getByRole('button', { name: 'Pair a phone (Signet or Cambium)', exact: true }).click()
  const cambium = page.getByRole('button', { name: 'Cambium Approve on Android. Heartwood keeps your key', exact: true })
  await cambium.click()
  const pairing = await qrPayload(page)
  await page.clock.fastForward(150_000)
  await expect(page.locator('.player-pair-expiry')).toContainText('Time to approve: 2:')
  await cambium.click()
  expect(await qrPayload(page)).toBe(pairing)
  await page.clock.fastForward(150_000)
  await expect(page.getByRole('img', { name: 'Scan to connect your signer', exact: true })).toBeHidden()
  await expect(page.locator('.player-pairing [role=status]')).toContainText('Pairing expired')
  await expect(page.getByRole('button', { name: 'That’s me. Let’s play', exact: true })).toBeHidden()
  await cambium.click()
  expect(await qrPayload(page)).not.toBe(pairing)
})

test('My Signet and other signer QR routes complete the standard NIP-46 handshake', async ({ page, context }) => {
  await relayFixture()(context)
  for (const method of ['My Signet', 'Another Nostr signer']) {
    await page.goto('http://127.0.0.1:4174/')
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Pair a phone (Signet or Cambium)', exact: true }).click()
    await page.locator('.player-pair-choice').filter({ has: page.locator('strong', { hasText: method }) }).click()
    const payload = await qrPayload(page)
    await expect(page.locator('.player-pair-code')).toBeHidden()
    const uri = method === 'My Signet' ? new URL(payload).searchParams.get('nostrconnect')! : payload
    if (method === 'My Signet') expect(new URL(payload).origin).toBe('https://mysignet.app')
    expect(new URL(uri).protocol).toBe('nostrconnect:')
    await page.evaluate(async ({ uri, source, pure }) => {
      const { PhoneSigningChannel, generateSecretKey, getPublicKey } = await import(source)
      const { finalizeEvent } = await import(pure)
      const transport = generateSecretKey(), identity = generateSecretKey(), host = new URL(uri)
      const channel = new PhoneSigningChannel(transport, host.searchParams.get('relay')!, async (peer, message) => {
        if (peer !== host.hostname) return
        if (message.method === 'get_public_key') await channel.send(peer, { id: message.id, result: getPublicKey(identity) })
        if (message.method === 'sign_event') await channel.send(peer, { id: message.id, result: JSON.stringify(finalizeEvent(JSON.parse(message.params![0]), identity)) })
        if (message.method === 'logout') channel.close()
      })
      await channel.open()
      await channel.send(host.hostname, { id: 'fixture-ack', result: host.searchParams.get('secret')! })
    }, { uri, source: `/@fs/${process.cwd()}/src/shared/phone-signing.ts`, pure: `/@fs/${process.cwd()}/node_modules/nostr-tools/lib/esm/pure.js` })
    await expect(page.getByRole('button', { name: 'That’s me. Let’s play', exact: true })).toBeVisible()
    await expect(page.locator('.player-pair-code')).toBeHidden()
    await expect(page.locator('.player-pairing [role=status]')).toHaveText('Check that this is your account before continuing on this TV.')
    await page.getByRole('button', { name: 'That’s me. Let’s play', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await page.locator('.identity-trigger').click()
    await page.getByRole('menuitem', { name: 'FINISH / NEXT PLAYER', exact: true }).click()
    await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
  }
})

test('guest play opens no signer subscription; a phone controller cannot confirm an account', async ({ page, context }) => {
  let requests = 0
  await context.routeWebSocket('wss://relay.primal.net/**', socket => {
    socket.onMessage(raw => { const frame = JSON.parse(String(raw)); if (frame[0] === 'REQ' && frame.slice(2).some((filter: any) => filter.kinds?.includes(24133))) ++requests })
  })
  await page.goto('http://127.0.0.1:4174/')
  await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
  await page.getByRole('button', { name: 'Pair a phone (Signet or Cambium)', exact: true }).click()
  await page.getByRole('button', { name: 'Play as guest', exact: true }).click()
  expect(requests).toBe(0)
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('signet:login.')))).toEqual([])
  const result = await page.evaluate(async source => {
    const original = navigator.getGamepads.bind(navigator)
    let pressed = false, approvals = 0, launches = 0
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ id: 'Physical controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: index === 0 && pressed })) }] })
    const { InputController } = await import(source)
    const { applyPhoneGamepad, neutralPhone } = await import(source.replace('/renderer/src/ui/input.ts', '/shared/phone-input.ts'))
    const snapshot = neutralPhone(); snapshot.connected = true; snapshot.buttons[0] = true
    applyPhoneGamepad(snapshot)
    const dialog = document.createElement('dialog'); dialog.className = 'player-pairing'
    const confirm = document.createElement('button'); confirm.textContent = 'Confirm'; confirm.onclick = () => ++approvals; dialog.append(confirm); document.body.append(dialog); dialog.showModal(); confirm.focus()
    const input = new InputController({ onPrev() {}, onNext() {}, onBack() {}, onLaunch() { ++launches } }, { keyboard: false })
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    try {
      input.start(); await wait(100); snapshot.buttons[0] = false; applyPhoneGamepad(snapshot); await wait(100)
      const phoneApprovals = approvals
      pressed = true; await wait(100)
      return { phoneApprovals, localApprovals: approvals, launches }
    } finally { input.stop(); applyPhoneGamepad(neutralPhone()); dialog.close(); dialog.remove(); Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: original }) }
  }, `/@fs/${process.cwd()}/src/renderer/src/ui/input.ts`)
  expect(result).toEqual({ phoneApprovals: 0, localApprovals: 1, launches: 0 })
})
