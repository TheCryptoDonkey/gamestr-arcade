import { test, expect } from '@playwright/test'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'

const key = new Uint8Array(32).fill(7)
const pubkey = getPublicKey(key)
const challenge = 'a'.repeat(64)

for (const [edition, port] of [['gamestr', 4174], ['600', 4175]] as const) {
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
      await page.goto(target.toString())
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
        await page.goto(target.toString())
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
