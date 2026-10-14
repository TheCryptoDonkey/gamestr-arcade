import { test, expect, type Page } from '@playwright/test'
import { createServer } from 'node:http'
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
    const sockets: { requests: unknown[][]; publications: { id: string }[]; onmessage?: (event: { data: string }) => void }[] = []
    ;(window as unknown as { __fixturePublishedEvents: { id: string }[] }).__fixturePublishedEvents = []
    ;(window as unknown as { __fixturePublishOk(): void }).__fixturePublishOk = () => {
      for (const socket of sockets) for (const event of socket.publications) socket.onmessage?.({ data: JSON.stringify(['OK', event.id, true, 'fixture accepted']) })
    }
    ;(window as unknown as { __fixtureRelayEvent(event: { kind: number; pubkey: string }): void }).__fixtureRelayEvent = event => {
      for (const socket of sockets) for (const request of socket.requests) {
        const filter = request[2] as { kinds?: number[]; authors?: string[]; ids?: string[] }
        if (filter.ids ? !filter.ids.includes((event as { id?: string }).id ?? '') : !filter.kinds?.includes(event.kind)) continue
        if (filter.authors && !filter.authors.includes(event.pubkey)) continue
        socket.onmessage?.({ data: JSON.stringify(['EVENT', request[1], event]) })
        socket.onmessage?.({ data: JSON.stringify(['EOSE', request[1]]) })
      }
    }
    window.WebSocket = class {
      readyState = 1
      onopen?: () => void
      onmessage?: (event: { data: string }) => void
      requests: unknown[][] = []
      publications: { id: string }[] = []
      constructor(url: string, protocols?: string | string[]) { if (!url.startsWith('wss://')) return new Native(url, protocols) as unknown as this; sockets.push(this); setTimeout(() => this.onopen?.(), 0) }
      send(raw: string) {
        const request = JSON.parse(raw)
        if (request[0] === 'REQ') this.requests.push(request)
        if (request[0] === 'EVENT') { this.publications.push(request[1]); (window as unknown as { __fixturePublishedEvents: unknown[] }).__fixturePublishedEvents.push(request[1]) }
      } close() {} addEventListener() {} removeEventListener() {}
    } as unknown as typeof WebSocket
  }, { extension, pubkey })
  await page.route('**/catalogue.json', route => route.fulfill({ json: catalogue }))
  await page.route('https://**/*', route => route.abort())
}

for (const [edition, port] of [['gamestr', 4174], ['600', 4175]] as const) {
  test(`${edition}: completed challenge discloses missing history and ranks only its signed window`, async ({ page }) => {
    await setup(page)
    const now = Math.floor(Date.now() / 1000)
    const start = now - 3 * 86400
    const challenge = finalizeEvent({ kind: 23034, created_at: start, tags: [['game', 'pallasite'], ['r', 'https://pallasite.app/'], ['start', String(start)], ['end', String(start + 3600)]], content: JSON.stringify({ name: 'Earlier challenge' }) }, key)
    await page.goto(`http://127.0.0.1:${port}/challenge/${Buffer.from(JSON.stringify(challenge)).toString('base64url')}`)
    await expect(page.getByRole('heading', { name: 'OBSERVED STANDINGS', exact: true })).toBeVisible()
    await expect(page.locator('.challenge-standings')).toContainText('complete challenge history has not been established')
    await expect(page.locator('.challenge-board')).toContainText('No verified scores from this window have been received')
    const outside = finalizeEvent({ kind: 30762, created_at: now, tags: [['game', 'pallasite'], ['score', '999999']], content: '' }, key)
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), outside)
    await expect(page.locator('.challenge-board')).not.toContainText('999,999')
    const inside = finalizeEvent({ kind: 30762, created_at: start + 120, tags: [['game', 'pallasite'], ['score', '42']], content: '' }, other)
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), inside)
    await expect(page.locator('.challenge-board')).toContainText('42')
    await expect(page.locator('.challenge-board')).not.toContainText('999,999')
    await expect(page.locator('.challenge-standings')).toContainText('complete challenge history has not been established')
  })

  test(`${edition}: old score links resolve independently and finish with useful invalid or unavailable states`, async ({ page }) => {
    await setup(page)
    const old = finalizeEvent({ kind: 30762, created_at: 1_600_000_000, tags: [['game', 'pallasite'], ['score', '4242']], content: '' }, key)
    await page.goto(`http://127.0.0.1:${port}/score/${old.id}`)
    await expect(page.getByRole('heading', { name: 'Looking up this event…', exact: true })).toBeVisible()
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), old)
    await expect(page.locator('.score-detail')).toContainText('4,242')
    await expect(page.locator('.score-detail')).toContainText('PLAYER SIGNED')
    const invalid = { ...old, id: 'a'.repeat(64) }
    await page.goto(`http://127.0.0.1:${port}/score/${invalid.id}`)
    await expect(page.getByRole('heading', { name: 'Looking up this event…', exact: true })).toBeVisible()
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), invalid)
    await expect(page.getByRole('heading', { name: 'Score failed validation', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'RETRY LOOKUP', exact: true })).toBeEnabled()
    await page.goto(`http://127.0.0.1:${port}/score/${'b'.repeat(64)}`)
    await expect(page.getByRole('heading', { name: 'Score unavailable', exact: true })).toBeVisible({ timeout: 12000 })
    await expect(page.getByRole('button', { name: 'RETRY LOOKUP', exact: true })).toBeEnabled()
  })

  test(`${edition}: login remains operable without navigation overlap at narrow widths and zoom`, async ({ page }) => {
    await setup(page)
    await page.goto(`http://127.0.0.1:${port}/`)
    const login = page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })
    if (edition === 'gamestr') await expect(page.locator('.launch-login-note')).toContainText('may ask you to sign in there')
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

  test(`${edition}: a short viewport keeps the account menu scrollable and logout operable`, async ({ page }) => {
    await setup(page, true)
    await page.setViewportSize({ width: 320, height: 240 })
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await page.locator('.identity-trigger').click()
    const menu = page.getByRole('menu', { exact: true })
    const bounds = (await menu.boundingBox())!
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(240)
    expect(await menu.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
    const logout = page.getByRole('menuitem', { name: 'LOG OUT', exact: true })
    await logout.scrollIntoViewIfNeeded()
    const visibility = await logout.evaluate(node=> {const r=node.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {visible:hit===node || node.contains(hit),rect:{x:r.x,y:r.y,w:r.width,h:r.height},hits:document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).map(el=>el.tagName+'.'+el.className)}})
    expect(visibility.visible,JSON.stringify(visibility)).toBe(true)
    await logout.click()
    await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
  })

  test(`${edition}: extension login, refresh, account switch and logout enforce selected identity`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/game/pallasite`)
    if (edition === 'gamestr') await expect(page.locator('.launch-login-note')).toContainText('Your arcade login is not passed to it')
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

  test(`${edition}: game launch waits for account restoration only when it carries identity`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/game/pallasite`)
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await page.addInitScript(() => {
      const w = window as unknown as { nostr: { getPublicKey(): Promise<string> }; __releaseRestore?: () => void }
      const original = w.nostr.getPublicKey.bind(w.nostr)
      w.nostr.getPublicKey = () => new Promise(resolve => { w.__releaseRestore = () => { void original().then(resolve) } })
    })
    await page.reload()
    await page.waitForFunction(() => !!(window as unknown as { __releaseRestore?: () => void }).__releaseRestore)
    await expect(page.getByRole('button', { name: 'RESTORING ACCOUNT…', exact: true })).toBeDisabled()
    const play = page.getByRole('link', { name: 'PLAY ON PUBLISHER SITE ↗', exact: true })
    if (edition === '600') {
      await expect(play).toHaveAttribute('aria-disabled', 'true')
      let popups = 0
      page.on('popup', () => { popups++ })
      const box = (await play.boundingBox())!
      // A real pointer click verifies the handler; ARIA alone does not disable links.
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByRole('status')).toContainText('account is still restoring')
      expect(popups).toBe(0)
    } else {
      await expect(play).not.toHaveAttribute('aria-disabled', 'true')
    }
    await page.evaluate(() => (window as unknown as { __releaseRestore(): void }).__releaseRestore())
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(play).not.toHaveAttribute('aria-disabled', 'true')
    await expect(play).toHaveAttribute('title', edition === '600'
      ? 'Normal click carries your arcade identity; modifier clicks use the game’s own login.'
      : 'Opens the game with its own login.')
  })

  test(`${edition}: unavailable bunker preserves the account and exposes signer reconnection`, async ({ page }) => {
    await setup(page)
    const authEvent = finalizeEvent({ kind: 21236, created_at: Math.floor(Date.now() / 1000), tags: [['origin', `http://127.0.0.1:${port}`]], content: '' }, key)
    await page.addInitScript(({ pubkey, authEvent }) => {
      localStorage.setItem('signet:login.pubkey', pubkey)
      localStorage.setItem('signet:login.method', 'bunker')
      localStorage.setItem('signet:login.authEvent', JSON.stringify(authEvent))
      // Only private fixture sockets are available; the remote signer never replies.
      localStorage.setItem('signet:login.bunkerUri', `bunker://${pubkey}?relay=wss%3A%2F%2Frelay.invalid`)
      localStorage.setItem('signet:login.bunkerClientSk', '07'.repeat(32))
    }, { pubkey, authEvent })
    await page.goto(`http://127.0.0.1:${port}/game/pallasite`)
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(page.locator('.identity-trigger .signer-status')).toHaveText('IDENTITY CONNECTED · SIGNER NEEDED')
    await page.locator('.identity-trigger').click()
    await expect(page.getByRole('menuitem', { name: 'RECONNECT SIGNER', exact: true })).toBeEnabled()
    await page.getByRole('menuitem', { name: 'RECONNECT SIGNER', exact: true }).click()
    await expect(page.getByRole('button', { name: 'My Signet on this device', exact: true })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('signet:login.pubkey'))).toBe(pubkey)
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

  test(`${edition}: live profile and score events preserve filter values, selection and focused controls`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await page.locator('#arcade-search').fill('palla')
    await page.locator('#game-filter-featured').click()
    await expect(page.locator('#game-filter-featured')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#game-filter-all')).toHaveAttribute('aria-pressed', 'false')
    await page.locator('#game-genre').selectOption('arcade')
    await page.locator('#game-genre').focus()
    const profile = finalizeEvent({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ name: 'Live update player' }) }, key)
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), profile)
    await expect(page.locator('.identity-trigger')).toContainText('Live update player')
    await expect(page.locator('#game-genre')).toBeFocused()
    await expect(page.locator('#game-genre')).toHaveValue('arcade')
    await expect(page.locator('#arcade-search')).toHaveValue('palla')
    await expect(page.locator('#game-filter-featured')).toHaveAttribute('aria-pressed', 'true')
    const score = finalizeEvent({ kind: 30762, created_at: Math.floor(Date.now() / 1000), tags: [['game', 'pallasite'], ['score', '12345']], content: '' }, key)
    await page.locator('#favourite-card-pallasite').focus()
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), score)
    await expect(page.locator('.score-chip')).toContainText('12,345')
    await expect(page.locator('#favourite-card-pallasite')).toBeFocused()
    await page.locator('#activity-filter-following').click()
    await expect(page.locator('#activity-filter-following')).toBeFocused()
    await expect(page.locator('#activity-filter-following')).toHaveAttribute('aria-pressed', 'true')
    const next = finalizeEvent({ kind: 30762, created_at: score.created_at + 1, tags: [['game', 'pallasite'], ['score', '12346']], content: '' }, key)
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), next)
    await expect(page.locator('.score-chip')).toContainText('12,346')
    await expect(page.locator('#activity-filter-following')).toBeFocused()
  })

  test(`${edition}: manifest draft and focus survive SDK login, live profile updates and reload`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/developers`)
    const editor = page.locator('#manifest-json')
    await editor.fill('{"draft":"keep me"}')
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(editor).toHaveValue('{"draft":"keep me"}')
    await editor.focus()
    const profile = finalizeEvent({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ name: 'Draft player' }) }, key)
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), profile)
    await expect(page.locator('.identity-trigger')).toContainText('Draft player')
    await expect(editor).toHaveValue('{"draft":"keep me"}')
    await expect(editor).toBeFocused()
    await page.reload()
    await expect(editor).toHaveValue('{"draft":"keep me"}')
  })

  test(`${edition}: validated manifest and pending publication survive SDK login, profile updates and logout`, async ({ page }) => {
    await setup(page, true)
    await page.goto(`http://127.0.0.1:${port}/developers`)
    const studio = page.locator('.manifest-studio')
    const editor = page.locator('#manifest-json')
    const draft = await editor.inputValue()
    await studio.getByRole('button', { name: 'VALIDATE', exact: true }).click()
    await expect(studio.locator('.studio-status')).toContainText('Valid Manifest v2')
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(studio.locator('.studio-status')).toContainText('Valid Manifest v2')
    await expect(studio.getByRole('button', { name: 'SIGN & PUBLISH', exact: true })).toBeEnabled()
    await page.evaluate(() => {
      const w = window as unknown as { nostr: { signEvent(t: { kind: number }): Promise<unknown> }; __releaseManifest?: () => void }
      const sign = w.nostr.signEvent.bind(w.nostr)
      w.nostr.signEvent = async template => { if (template.kind === 31990) await new Promise<void>(resolve => { w.__releaseManifest = resolve }); return sign(template) }
    })
    await studio.getByRole('button', { name: 'SIGN & PUBLISH', exact: true }).click()
    await expect(studio.locator('.studio-status')).toContainText('Waiting for your Nostr signer')
    const profile = finalizeEvent({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ name: 'Publishing player' }) }, key)
    await page.evaluate(event => (window as unknown as { __fixtureRelayEvent(event: unknown): void }).__fixtureRelayEvent(event), profile)
    await expect(page.locator('.identity-trigger')).toContainText('Publishing player')
    await expect(studio.locator('.studio-status')).toContainText('Waiting for your Nostr signer')
    await expect(editor).toHaveValue(draft)
    await expect(editor).toHaveJSProperty('readOnly', true)
    await page.evaluate(() => (window as unknown as { __releaseManifest(): void }).__releaseManifest())
    await page.waitForFunction(() => (window as unknown as { __fixturePublishedEvents: unknown[] }).__fixturePublishedEvents.length > 0)
    await expect(studio.locator('.studio-status')).toContainText('Publishing the signed submission')
    await page.locator('.identity-trigger').click()
    await page.getByRole('menuitem', { name: 'LOG OUT', exact: true }).click()
    await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
    await expect(studio.locator('.studio-status')).toContainText('Publishing the signed submission')
    await expect(studio.getByRole('button', { name: 'SIGN & PUBLISH', exact: true })).toBeDisabled()
    await page.evaluate(() => (window as unknown as { __fixturePublishOk(): void }).__fixturePublishOk())
    await expect(studio.locator('.studio-status')).toContainText('Published')
    await expect(editor).toHaveValue(draft)
    await expect(editor).toHaveJSProperty('readOnly', false)
    expect(await page.evaluate(() => new Set((window as unknown as { __fixturePublishedEvents: { id: string }[] }).__fixturePublishedEvents.map(event => event.id)).size)).toBe(1)
  })
}

test('Android picker names Cambium and Amber', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 Android' }))
  await page.goto('http://127.0.0.1:4174/')
  await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cambium or Amber (Android signer)', exact: true })).toBeVisible()
})


test('600: a blocked game popup preserves the account and explains how to continue', async ({ page }) => {
  await setup(page, true)
  await page.goto('http://127.0.0.1:4175/game/pallasite')
  await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
  await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
  await expect(page.locator('.identity-trigger')).toBeVisible()
  const before = await page.evaluate(() => (window as unknown as { __signed: number }).__signed)
  await page.evaluate(() => { window.open = () => null })
  await page.getByRole('link', { name: 'PLAY ON PUBLISHER SITE ↗', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('The game popup was blocked')
  await expect(page.getByRole('status')).toContainText('sign in inside the game')
  await expect(page).toHaveURL('http://127.0.0.1:4175/game/pallasite')
  await page.locator('.identity-trigger').click()
  await expect(page.locator('.identity-dropdown .signer-status')).toHaveText('SIGNER CONNECTED')
  expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(before)
})

test('600: modifier-click opens an independent game without an identity proof or opener', async ({ page }) => {
  const publisher = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><title>Independent game login</title><h1>Sign in inside the game</h1>')
  })
  await new Promise<void>(resolve => publisher.listen(0, '127.0.0.1', resolve))
  try {
    const address = publisher.address()
    if (!address || typeof address === 'string') throw new Error('Publisher fixture did not bind')
    const target = `http://127.0.0.1:${address.port}/`
    await setup(page, true)
    await page.route('**/catalogue.json', route => route.fulfill({ json: [{ ...catalogue[0], url: target }] }))
    await page.goto('http://127.0.0.1:4175/game/pallasite')
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'Browser extension', exact: true }).click()
    await expect(page.locator('.identity-trigger')).toBeVisible()
    const play = page.getByRole('link', { name: 'PLAY ON PUBLISHER SITE ↗', exact: true })
    await expect(play).toHaveAttribute('title', 'Normal click carries your arcade identity; modifier clicks use the game’s own login.')
    const opened = page.context().waitForEvent('page')
    const modifier = await page.evaluate(() => navigator.platform.includes('Mac')) ? 'Meta' : 'Control'
    await play.click({ modifiers: [modifier] })
    const child = await opened
    await expect(child.getByRole('heading')).toHaveText('Sign in inside the game')
    expect(child.url()).toBe(target)
    expect(await child.evaluate(() => window.opener === null)).toBe(true)
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await child.close()
  } finally {
    publisher.closeAllConnections()
    await new Promise<void>((resolve, reject) => publisher.close(error => error ? reject(error) : resolve()))
  }
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
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(id); resolve({ timeout: true }); }, 1000);
      pending.set(id, result => { clearTimeout(timer); resolve(result); });
      bridge.port1.postMessage({ protocol: 'gamestr-auth-v1', type: 'sign', id, event: { kind: 30762, created_at: Math.floor(Date.now()/1000), tags: [['game', 'pallasite'], ['score', '1']], content: '' } });
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
  const request = async () => {
    await child.bringToFront()
    return child.evaluate(() => (window as unknown as { __request(): Promise<{ ok?: boolean; timeout?: boolean }> }).__request())
  }
  expect((await request()).ok).toBe(true)
  const signed = await page.evaluate(() => (window as unknown as { __signed: number }).__signed)
  await page.bringToFront()
  await page.locator('.identity-trigger').click()
  await page.getByRole('menuitem', { name: 'LOG OUT' }).click()
  expect((await request()).timeout).toBe(true)
  await login()
  expect((await request()).timeout).toBe(true)
  // Login signs a fresh auth proof, but the old child must never sign another score.
  await page.bringToFront()
  expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(signed + 1)
})
