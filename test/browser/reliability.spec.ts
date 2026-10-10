import { test, expect, type Page } from '@playwright/test'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'

const key = new Uint8Array(32).fill(7)
const other = new Uint8Array(32).fill(8)
const pubkey = getPublicKey(key)
const otherPubkey = getPublicKey(other)
const catalogue = [{ slug: 'pallasite', gameId: 'pallasite', name: 'Pallasite', tagline: 'Test game', genres: ['arcade'], url: 'https://pallasite.app/', accent: '#7cf3ff', featured: true, trending: true, newRelease: false, walletPay: false, nostrHandoff: { protocol: 'gamestr-auth-v1', editions: ['600'], signKinds: [30762, 27235] } }]

async function setup(page: Page, extension = false) {
  await page.context().exposeFunction('__testSign', (template: Parameters<typeof finalizeEvent>[0], selected: string) => finalizeEvent(template, selected === otherPubkey ? other : key))
  await page.addInitScript(({ extension, pubkey }) => {
    const w = window as unknown as { nostr?: unknown; __selected: string; __signed: number; __testSign: (template: unknown, selected: string) => Promise<unknown> }
    w.__selected = pubkey; w.__signed = 0
    if (extension) w.nostr = { getPublicKey: async () => w.__selected, signEvent: async (template: unknown) => { ++w.__signed; return w.__testSign(template, w.__selected) } }
    const Native = window.WebSocket
    window.WebSocket = class {
      readyState = 1
      onopen?: () => void
      constructor(url: string, protocols?: string | string[]) { if (!url.startsWith('wss://')) return new Native(url, protocols) as unknown as this; setTimeout(() => this.onopen?.(), 0) }
      send() {} close() {} addEventListener() {} removeEventListener() {}
    } as unknown as typeof WebSocket
  }, { extension, pubkey })
  await page.route('**/catalogue.json', route => route.fulfill({ json: catalogue }))
  await page.route('https://**/*', route => route.abort())
}

for (const [edition, port] of [['gamestr', 4174], ['600', 4175]] as const) {
  test(`${edition}: login remains operable without navigation overlap at narrow widths and zoom`, async ({ page }) => {
    await setup(page)
    await page.goto(`http://127.0.0.1:${port}/`)
    const login = page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(login).toBeVisible()
      const loginBox = (await login.boundingBox())!
      const navBox = (await page.getByRole('navigation', { name: 'Primary' }).boundingBox())!
      expect(loginBox.x).toBeGreaterThanOrEqual(0)
      expect(loginBox.x + loginBox.width).toBeLessThanOrEqual(width)
      expect(loginBox.y + loginBox.height <= navBox.y || navBox.x + navBox.width <= loginBox.x).toBeTruthy()
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '2' })
    await expect(login).toBeVisible()
    await login.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(login).toBeEnabled()
  })

  test(`${edition}: extension login, refresh, account switch and logout enforce selected identity`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/game/pallasite`)
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await page.reload()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await page.evaluate(selected => { (window as unknown as { __selected: string }).__selected = selected }, otherPubkey)
    const count = await page.evaluate(() => (window as unknown as { __signed: number }).__signed)
    await page.getByRole('button', { name: 'INVITE TO PLAY', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('account changed')
    expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(count)
    await page.locator('.identity-trigger').click()
    await expect(page.getByText('SIGNER UNAVAILABLE').last()).toBeVisible()
    await page.getByRole('menuitem', { name: 'LOG OUT' }).click()
    await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'INVITE TO PLAY', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(count)
  })

  test(`${edition}: guest preferences require explicit import and stay isolated between accounts`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/game/pallasite`)
    const favourite = page.locator('#favourite-detail-pallasite')
    await favourite.click()
    await expect(favourite).toHaveText('★ IN MY ARCADE')
    await expect(favourite).toBeFocused()
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(favourite).toHaveText('☆ ADD TO MY ARCADE')
    await page.locator('.identity-trigger').click()
    await page.getByRole('menuitem', { name: 'IMPORT DEVICE PREFERENCES' }).click()
    await expect(page.getByRole('dialog')).toContainText('1 guest favourites')
    await expect(page.locator('#app')).toHaveJSProperty('inert', true)
    await page.getByRole('button', { name: 'CANCEL', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeFocused()
    await expect(favourite).toHaveText('☆ ADD TO MY ARCADE')
    await page.locator('.identity-trigger').click()
    await page.getByRole('menuitem', { name: 'IMPORT DEVICE PREFERENCES' }).click()
    await page.getByRole('button', { name: 'COPY TO MY ACCOUNT' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('#app')).toHaveJSProperty('inert', false)
    await expect(page.locator('.identity-trigger')).toBeFocused()
    await expect(favourite).toHaveText('★ IN MY ARCADE')
    expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(1)
    await page.reload()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(favourite).toHaveText('★ IN MY ARCADE')
    await page.locator('.identity-trigger').click()
    await page.getByRole('menuitem', { name: 'LOG OUT' }).click()
    await expect(favourite).toHaveText('★ IN MY ARCADE')
    await page.evaluate(selected => { (window as unknown as { __selected: string }).__selected = selected }, otherPubkey)
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(favourite).toHaveText('☆ ADD TO MY ARCADE')
    expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(1)
  })

  test(`${edition}: unavailable storage keeps preferences for the visit and explains the limitation`, async ({ page }) => {
    await setup(page)
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (name, value) {
        if (name.startsWith('gamestr:social:')) throw new DOMException('Storage unavailable', 'QuotaExceededError')
        setItem.call(this, name, value)
      }
    })
    await page.goto(`http://127.0.0.1:${port}/game/pallasite`)
    await page.locator('#favourite-detail-pallasite').click()
    await expect(page.locator('#favourite-detail-pallasite')).toHaveText('★ IN MY ARCADE')
    await expect(page.getByRole('status')).toContainText('for this visit; browser storage is unavailable')
    await page.reload()
    await expect(page.locator('#favourite-detail-pallasite')).toHaveText('☆ ADD TO MY ARCADE')
  })

  test(`${edition}: logout during pending SDK restoration cannot reactivate the account`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/game/pallasite`)
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await page.addInitScript(() => {
      const w = window as unknown as { nostr: { getPublicKey: () => Promise<string> }; __releaseRestore?: () => Promise<void> }
      const original = w.nostr.getPublicKey
      w.nostr.getPublicKey = () => new Promise(resolve => { w.__releaseRestore = async () => { resolve(await original()); await new Promise<void>(done => requestAnimationFrame(() => done())) } })
    })
    await page.reload()
    await page.waitForFunction(() => !!(window as unknown as { __releaseRestore?: () => Promise<void> }).__releaseRestore)
    await page.evaluate(async () => {
      // This is the production module used by the logout button, not a fake session event.
      // @ts-expect-error Vite resolves this browser URL at runtime.
      const access = await import('/nostr-access.ts')
      await access.disconnectNostrAccess()
      await (window as unknown as { __releaseRestore: () => Promise<void> }).__releaseRestore()
    })
    await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('signet:login.pubkey'))).toBeNull()
    await page.reload()
    await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
  })

  test(`${edition}: manifest draft and focus survive identity changes and reload`, async ({ page }) => {
    await setup(page)
    await page.goto(`http://127.0.0.1:${port}/developers`)
    const editor = page.locator('#manifest-json')
    await editor.fill('{"draft":"keep me"}')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('gamestr:nostr-session', { detail: { pubkey: 'a'.repeat(64), method: 'redirect', canSignEvents: false } })))
    await expect(editor).toHaveValue('{"draft":"keep me"}')
    await expect(editor).toBeFocused()
    await page.reload()
    await expect(editor).toHaveValue('{"draft":"keep me"}')
  })
}

test('Android picker names Cambium and Amber', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 Android' }))
  await page.goto('http://127.0.0.1:4174/')
  await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cambium or Amber (Android signer)', exact: true })).toBeVisible()
})


test('600: an actual child signing port stays revoked after logout and signing back in', async ({ page }) => {
  await setup(page, true)
  await page.context().route('https://pallasite.app/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><script>
    const token = new URLSearchParams(location.hash.slice(1)).get('gamestr-auth');
    const payload = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/')));
    const bridge = new MessageChannel();
    window.__connected = false;
    const pending = new Map();
    bridge.port1.onmessage = ({ data }) => {
      if (data.type === 'connected') window.__connected = true;
      if (data.type === 'result') { pending.get(data.id)?.(data); pending.delete(data.id); }
    };
    window.__request = () => new Promise(resolve => {
      const id = crypto.randomUUID(); pending.set(id, resolve);
      bridge.port1.postMessage({ protocol: 'gamestr-auth-v1', type: 'sign', id, event: { kind: 30762, created_at: Math.floor(Date.now()/1000), tags: [['game', 'pallasite'], ['score', '1']], content: '' } });
      setTimeout(() => { pending.delete(id); resolve({ timeout: true }); }, 1000);
    });
    opener.postMessage({ protocol: 'gamestr-auth-v1', type: 'connect', channel: payload.channel }, 'http://127.0.0.1:4175', [bridge.port2]);
  </script>` }))
  await page.goto('http://127.0.0.1:4175/game/pallasite')
  async function login() {
    await page.bringToFront()
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
  }
  await login()
  const opened = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'PLAY ON PUBLISHER SITE ↗', exact: true }).click()
  const child = await opened
  await child.waitForFunction(() => (window as unknown as { __connected: boolean }).__connected)
  const request = () => child.evaluate(() => (window as unknown as { __request(): Promise<{ ok?: boolean; timeout?: boolean }> }).__request())
  expect((await request()).ok).toBe(true)
  const signed = await page.evaluate(() => (window as unknown as { __signed: number }).__signed)
  await page.locator('.identity-trigger').click()
  await page.getByRole('menuitem', { name: 'LOG OUT' }).click()
  expect((await request()).timeout).toBe(true)
  await login()
  expect((await request()).timeout).toBe(true)
  // Login signs a fresh auth proof, but the old child must never sign another score.
  expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(signed + 1)
})
