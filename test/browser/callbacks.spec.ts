import { test, expect } from '@playwright/test'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'

const key = new Uint8Array(32).fill(7)
const pubkey = getPublicKey(key)
const challenge = 'a'.repeat(64)

for (const [edition, port] of [['gamestr', 4174], ['600', 4175]] as const) {
  test(`${edition}: My Signet denial is consumed without a saved account or Android marker`, async ({ page }) => {
    const origin = `http://127.0.0.1:${port}`
    await page.addInitScript(({ challenge, origin }) => {
      localStorage.setItem('signet:login.pendingRedirect', JSON.stringify({ challenge, origin, appName: 'Arcade', createdAt: Date.now() }))
    }, { challenge, origin })
    await page.route('https://**/*', route => route.abort())
    await page.route('**/catalogue.json', route => route.fulfill({ json: [] }))
    await page.goto(`${origin}/scores?mode=play&error=denied`)
    await expect(page.getByRole('status')).toContainText('declined')
    await expect(page).toHaveURL(`${origin}/scores?mode=play`)
    expect(await page.evaluate(() => localStorage.getItem('signet:login.pendingRedirect'))).toBeNull()
    await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeEnabled()
  })

  test(`${edition}: My Signet callback keeps its destination and validates its own signed proof`, async ({ page }) => {
    const origin = `http://127.0.0.1:${port}`
    await page.route('https://**/*', route => route.abort())
    await page.route('**/catalogue.json', route => route.fulfill({ json: [] }))
    await page.goto(`${origin}/scores?mode=play`)
    await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
    await page.getByRole('button', { name: 'My Signet on this device', exact: true }).click()
    const openSignet = page.getByRole('link', { name: 'Open My Signet', exact: true })
    await expect(openSignet).toBeVisible()
    const request = new URL((await openSignet.getAttribute('href'))!)
    const callback = new URL(request.searchParams.get('callback')!)
    expect(request.searchParams.get('relay')).toBe('wss://relay.trotters.cc')
    expect(callback.pathname).toBe('/scores')
    expect(callback.searchParams.get('mode')).toBe('play')
    const event = finalizeEvent({ kind: 21236, created_at: Math.floor(Date.now() / 1000), content: '', tags: [['challenge', request.searchParams.get('challenge')!], ['origin', origin]] }, key)
    // Exercise the URL-return contract independently of the default relay flow.
    // This fixture is a signed protocol response, not a live My Signet approval.
    await page.evaluate(({ challenge, origin, appName }) => {
      localStorage.setItem('signet:login.pendingRedirect', JSON.stringify({ challenge, origin, appName, createdAt: Date.now() }))
    }, { challenge: request.searchParams.get('challenge')!, origin, appName: request.searchParams.get('name')! })
    for (const [name, value] of Object.entries({ pubkey: event.pubkey, signature: event.sig, eventId: event.id, t: String(event.created_at) })) callback.searchParams.set(name, value)
    await page.goto(callback.toString())
    await expect(page.locator('.identity-trigger')).toBeVisible()
    await expect(page).toHaveURL(`${origin}/scores?mode=play`)
    expect(await page.evaluate(() => localStorage.getItem('signet:login.pubkey'))).toBe(pubkey)
    expect(await page.evaluate(() => localStorage.getItem('signet:login.pendingRedirect'))).toBeNull()
    await page.locator('.identity-trigger').click()
    await expect(page.getByText('IDENTITY CONNECTED · SIGNER NEEDED').last()).toBeVisible()
    await page.getByRole('menuitem', { name: 'LOG OUT' }).click()
    await page.goto(callback.toString())
    await expect(page.getByRole('status')).toContainText('failed validation')
    await expect(page.locator('.identity-trigger')).toHaveCount(0)
  })

  for (const result of ['json', 'base64', 'denied', 'tampered', 'expired'] as const) {
    test(`${edition}: real SDK consumes ${result} Android return before restoring a saved identity`, async ({ page }) => {
      const origin = `http://127.0.0.1:${port}`
      const event = finalizeEvent({ kind: 21236, created_at: Math.floor(Date.now() / 1000), content: '', tags: [['challenge', challenge], ['origin', origin], ['app', 'Arcade']] }, key)
      if (result === 'tampered') event.content = 'changed after signing'
      const target = new URL('/scores?mode=play&signet_amber=1', origin)
      if (result === 'denied') target.searchParams.set('error', 'denied')
      else target.searchParams.set('event', result === 'base64' ? Buffer.from(JSON.stringify(event)).toString('base64') : JSON.stringify(event))
      await page.addInitScript(({ challenge, origin, result }) => {
        // Install only once: a reload must use the SDK's persisted state, not a new challenge.
        if (!sessionStorage.getItem('fixture-installed')) {
          sessionStorage.setItem('fixture-installed', '1')
          localStorage.setItem('signet:login.pendingRedirect', JSON.stringify({ challenge, origin, appName: 'Arcade', createdAt: Date.now() - (result === 'expired' ? 600_000 : 0) }))
        }
        const Native = window.WebSocket
        window.WebSocket = class {
          readyState = 1
          onopen?: () => void
          constructor(url: string, protocols?: string | string[]) { if (!url.startsWith('wss://')) return new Native(url, protocols) as unknown as this; setTimeout(() => this.onopen?.(), 0) }
          send() {} close() {} addEventListener() {} removeEventListener() {}
        } as unknown as typeof WebSocket
      }, { challenge, origin, result })
      await page.route('https://**/*', route => route.abort())
      await page.route('**/catalogue.json', route => route.fulfill({ json: [] }))
      // Callback assertions wait for the application state themselves. Waiting
      // for unrelated page resources can miss its five-second error message.
      await page.goto(target.toString(), { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(`${origin}/scores?mode=play`)
      expect(await page.evaluate(() => localStorage.getItem('signet:login.pendingRedirect'))).toBeNull()
      if (result === 'json' || result === 'base64') {
        await expect(page.locator('.identity-trigger')).toBeVisible()
        expect(await page.evaluate(() => localStorage.getItem('signet:login.pubkey'))).toBe(pubkey)
        await page.locator('.identity-trigger').click()
        await expect(page.getByText('IDENTITY CONNECTED · SIGNER NEEDED').last()).toBeVisible()
        await page.reload()
        await expect(page.locator('.identity-trigger')).toBeVisible()
        await page.locator('.identity-trigger').click()
        await page.getByRole('menuitem', { name: 'LOG OUT' }).click()
        await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeVisible()
        await page.goto(target.toString(), { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('status')).toContainText('failed validation')
        await expect(page.locator('.identity-trigger')).toHaveCount(0)
      } else {
        await expect(page.getByRole('status')).toContainText(result === 'denied' ? 'declined' : 'failed validation')
        await expect(page.locator('.identity-trigger')).toHaveCount(0)
        expect(await page.evaluate(() => localStorage.getItem('signet:login.pubkey'))).toBeNull()
      }
    })
  }
}
