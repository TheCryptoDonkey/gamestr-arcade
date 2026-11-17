// Real Android Chrome -> published Cambium -> Chrome, with a disposable NIP-46
// signer replacing Heartwood. Run only against a task-owned, blank emulator.
import { _android, chromium, expect } from '@playwright/test'
import { SimplePool } from 'nostr-tools/pool'
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import * as nip44 from 'nostr-tools/nip44'
import * as nip04 from 'nostr-tools/nip04'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const serial = process.argv[2], output = process.argv[3]
if (!/^emulator-\d+$/.test(serial ?? '') || !output) throw Error('Usage: node scripts/check-android-signer.mjs emulator-SERIAL evidence-directory')
const adb = `${process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`}/platform-tools/adb`
if (execFileSync(adb, ['-s', serial, 'shell', 'getprop', 'ro.kernel.qemu']).toString().trim() !== '1') throw Error('Refusing a physical device')
if (!execFileSync(adb, ['-s', serial, 'emu', 'avd', 'name']).toString().startsWith('GamestrPairing')) throw Error('Use a disposable GamestrPairing AVD')
const require = createRequire(import.meta.url), jsQR = require('jsqr'), { PNG } = require('pngjs')
const relay = 'wss://relay.primal.net', origin = 'http://127.0.0.1:4174'
const key = generateSecretKey(), pubkey = getPublicKey(key), secret = crypto.randomUUID()
const pool = new SimplePool(), seen = new Set(), authorised = new Set(), calls = []
pool.automaticallyAuth = () => async event => finalizeEvent(event, key)
let subscription, device, mobile, browser, tv, phone, invitation
const watchdog = setTimeout(() => { console.error('Android signer rehearsal exceeded six minutes'); process.exit(1) }, 360_000)
// Use fresh accessibility snapshots across app transitions. Keep UIAutomator
// exclusive: a second persistent automation driver can retain a stale root.
async function nativeElement(resourceId, text, timeout = 30_000) {
  const path = '/sdcard/gamestr-pairing-ui.xml'
  let element
  await expect.poll(async () => {
    execFileSync(adb, ['-s', serial, 'shell', 'uiautomator', 'dump', path], { timeout: 15_000 })
    const xml = execFileSync(adb, ['-s', serial, 'shell', 'cat', path]).toString()
    execFileSync(adb, ['-s', serial, 'shell', 'rm', path])
    const node = Array.from(xml.matchAll(/<node\b[^>]*>/g), match => match[0]).find(node => node.includes(`resource-id="dev.forgesworn.cambium:id/${resourceId}"`))
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    const escapedText = text?.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    if (!node || text && !node.includes(`text="${escapedText}"`) || !node.includes('enabled="true"') || !bounds) return false
    const [left, top, right, bottom] = bounds.slice(1).map(Number)
    if (right <= left || bottom <= top) return false
    element = { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) }
    return true
  }, { timeout }).toBe(true)
  return element
}
async function tapNative(element) {
  const { x, y } = element
  await device.shell(`input tap ${x} ${y}`)
}
async function fillNative(resourceId, value) {
  await tapNative(await nativeElement(resourceId))
  // Short injections let the emulator's input queue settle without losing the
  // end of a bunker URI. Verify the whole value before leaving the field.
  for (let offset = 0; offset < value.length; offset += 8) {
    const chunk = value.slice(offset, offset + 8).replace(/'/g, "'\\''").replace(/ /g, '%s')
    await device.shell(`input text '${chunk}'`)
  }
  await nativeElement(resourceId, value)
  await device.shell('input keyevent KEYCODE_BACK')
}
await mkdir(output, { recursive: true })
try {
  await pool.ensureRelay(relay, { connectionTimeout: 8000 })
  subscription = pool.subscribeMany([relay], { kinds: [24133], '#p': [pubkey], since: Math.floor(Date.now() / 1000) - 1 }, {
    onevent: async event => {
      try {
        if (!verifyEvent(event)) return
        const legacy = event.content.includes('?iv=')
        const conversation = nip44.getConversationKey(key, event.pubkey)
        const request = JSON.parse(legacy ? await nip04.decrypt(key, event.pubkey, event.content) : nip44.decrypt(event.content, conversation))
        if (seen.has(event.id)) return
        seen.add(event.id)
        calls.push(request.method)
        let result, error
        if (request.method === 'connect') {
          if (!authorised.has(event.pubkey) && request.params?.[1] !== secret) throw Error('Wrong disposable bunker secret')
          authorised.add(event.pubkey)
          result = 'ack'
        } else if (!authorised.has(event.pubkey)) throw Error('Unauthorised disposable bunker client')
        else if (request.method === 'get_public_key') result = pubkey
        else if (request.method === 'ping') result = 'pong'
        else if (request.method === 'sign_event') result = JSON.stringify(finalizeEvent(JSON.parse(request.params[0]), key))
        else error = 'Unsupported fixture operation'
        const payload = JSON.stringify({ id: request.id, ...(error ? { error } : { result }) })
        const content = legacy ? await nip04.encrypt(key, event.pubkey, payload) : nip44.encrypt(payload, conversation)
        await Promise.any(pool.publish([relay], finalizeEvent({ kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [['p', event.pubkey]], content }, key), { maxWait: 8000 }))
      } catch (error) { console.error('Disposable signer:', error.message) }
    },
  })
  device = (await _android.devices()).find(item => item.serial() === serial)
  if (!device) throw Error(`Emulator ${serial} not found`)
  device.setDefaultTimeout(30_000)
  await device.shell('pm clear dev.forgesworn.cambium')
  await device.shell('am start -n dev.forgesworn.cambium/.MainActivity')
  await fillNative('bunkerInput', `bunker://${pubkey}?${new URLSearchParams({ relay, secret })}`)
  await fillNative('labelInput', 'Disposable arcade rehearsal')
  await tapNative(await nativeElement('pairButton'))
  await nativeElement('pairingLabelValue', 'Disposable arcade rehearsal', 60_000)
  console.log('Published Cambium paired with disposable software bunker')
  mobile = await device.launchBrowser()
  mobile.setDefaultTimeout(20_000)
  browser = await chromium.launch()
  tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await tv.goto(origin)
  await tv.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
  await tv.getByRole('button', { name: 'Pair a phone (Signet or Cambium)', exact: true }).click()
  const method = tv.getByRole('button', { name: 'Cambium Approve on Android. Heartwood keeps your key', exact: true })
  await method.click()
  const qr = tv.getByRole('img', { name: 'Scan to connect your signer', exact: true })
  const png = PNG.sync.read(await qr.screenshot()); invitation = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data
  expect(invitation).toBeTruthy()
  phone = await mobile.newPage()
  await phone.goto(invitation)
  await expect(phone.getByRole('heading', { name: 'Connect with Cambium.', exact: true })).toBeVisible()
  await phone.getByRole('link', { name: 'Approve with Cambium', exact: true }).click({ noWaitAfter: true })
  const approval = await nativeElement('approveButton', 'Approve')
  await writeFile(`${output}/android-native-approval.png`, await device.screenshot())
  // Exercise a second press while native approval is open: it must preserve QR.
  await method.click()
  const repeated = PNG.sync.read(await qr.screenshot())
  expect(jsQR(new Uint8ClampedArray(repeated.data), repeated.width, repeated.height)?.data).toBe(invitation)
  await tapNative(approval)
  const connected = async () => {
    for (const tab of mobile.pages()) if (await tab.getByRole('heading', { name: 'Your phone is connected.', exact: true }).count()) return tab
  }
  await expect.poll(async () => !!await connected(), { timeout: 60_000 }).toBe(true)
  phone = await connected()
  await expect(tv.getByRole('button', { name: 'That’s me. Let’s play', exact: true })).toBeVisible({ timeout: 30_000 })
  expect(await tv.locator('.player-pair-code').textContent()).toBe(await phone.locator('.code').textContent())
  expect(phone.url()).not.toContain('event=')
  await phone.screenshot({ path: `${output}/android-connected.png` })
  await tv.getByRole('button', { name: 'That’s me. Let’s play', exact: true }).click()
  await expect(tv.locator('.identity-trigger')).toBeVisible()
  await tv.evaluate(async () => {
    const { currentNostrSigner } = await import('/nostr-access.ts')
    window.rehearsalSigner = currentNostrSigner()
    window.rehearsalScore = window.rehearsalSigner.signEvent({ kind: 5555, content: '42', tags: [['game', 'pallasite']], created_at: Math.floor(Date.now() / 1000) }).then(event => ({ event }), error => ({ error: error.message }))
  })
  await expect(phone.getByRole('heading', { name: 'Approve this game action.', exact: true })).toBeVisible()
  await phone.getByRole('link', { name: 'Approve with Cambium', exact: true }).click({ noWaitAfter: true })
  await tapNative(await nativeElement('approveButton', 'Approve'))
  const score = await tv.evaluate(() => window.rehearsalScore)
  expect(score.event).toMatchObject({ pubkey, kind: 5555, content: '42' })
  expect(verifyEvent(score.event)).toBe(true)
  await tv.locator('.identity-trigger').click()
  await tv.getByRole('menuitem', { name: 'FINISH / NEXT PLAYER', exact: true }).click()
  await expect.poll(async () => {
    for (const tab of mobile.pages()) if (await tab.getByRole('heading', { name: 'You’re disconnected.', exact: true }).count()) return true
    return false
  }).toBe(true)
  expect(await tv.evaluate(async () => {
    try { await window.rehearsalSigner.signEvent({ kind: 5555, content: '', tags: [], created_at: Math.floor(Date.now() / 1000) }); return 'signed' } catch { return 'revoked' }
  })).toBe('revoked')
  const report = { at: new Date().toISOString(), platform: 'Android emulator', android: (await device.shell('getprop ro.build.version.release')).toString().trim(), chrome: await phone.evaluate(() => navigator.userAgent), cambium: (await device.shell('dumpsys package dev.forgesworn.cambium')).toString().match(/versionName=(\S+)/)?.[1], relay, checks: ['native app launch', 'native consent', 'unchanged invitation during consent', 'real browser callback', 'matching confirmation code', 'signed score', 'next-player revocation'], calls, boundary: 'Published Cambium, real Android Chrome and public relay; disposable software NIP-46 signer replaces physical Heartwood. Camera scan and hardware consent remain separate.' }
  await writeFile(`${output}/android-signer.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} catch (error) {
  if (phone && invitation) console.error(await phone.evaluate(async ({ invitation, root }) => {
    try {
      const { decodePhonePairing } = await import(`/@fs/${root}/src/shared/phone-signing.ts`)
      const { newPhoneSigner } = await import(`/@fs/${root}/src/shared/phone-signer.ts`)
      const state = newPhoneSigner(decodePhonePairing(new URLSearchParams(new URL(invitation).hash.slice(1)).get('pairing'), location.origin))
      return { diagnostic: 'Invitation and key generation valid', state: !!state, now: Date.now(), text: document.body.innerText }
    } catch (error) { return { diagnostic: error.stack, now: Date.now(), text: document.body.innerText } }
  }, { invitation, root: process.cwd() }).catch(error => ({ diagnostic: error.message })))
  if (device) await writeFile(`${output}/android-failure.png`, await device.screenshot()).catch(() => {})
  throw error
} finally {
  clearTimeout(watchdog)
  await mobile?.close()
  await browser?.close()
  await device?.close()
  subscription?.close()
  pool.destroy()
  key.fill(0)
}
