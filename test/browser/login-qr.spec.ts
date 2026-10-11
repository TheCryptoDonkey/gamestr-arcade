import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Exercise the SDK's own decoder and the PNG reader already shipped by its QR
// dependency. This checks the displayed artifact, rather than its render options.
const jsQR = require('jsqr') as (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null
const { PNG } = require('pngjs') as { PNG: { sync: { read(buffer: Buffer): { data: Uint8Array; width: number; height: number } } } }

for (const [edition, port] of [['gamestr', 4174], ['600', 4175]] as const) {
  for (const [choice, canvasId, payloadId] of [
    ['My Signet on another device (QR)', 'signet-login-qr', 'signet-login-open-signet'],
    ['Connect a Nostr signer (NIP-46 QR)', 'signet-login-nc-qr', 'signet-login-nc-uri'],
  ] as const) {
    test(`${edition}: ${choice} displays a decodable exact payload across resizing`, async ({ page }) => {
      await page.route('https://**/*', route => route.abort())
      await page.context().routeWebSocket('wss://**', socket => socket.close())
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${port}/`)
      await page.getByRole('button', { name: 'CONNECT NOSTR', exact: true }).click()
      await page.getByRole('button', { name: choice, exact: true }).click()
      const canvas = page.locator(`#${canvasId}`)
      await canvas.waitFor()
      const payload = await page.locator(`#${payloadId}`).evaluate(node => node instanceof HTMLAnchorElement ? node.getAttribute('href')! : (node as HTMLTextAreaElement).value)
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 820 })
        await expect.poll(async () => {
          const png = PNG.sync.read(await canvas.screenshot())
          return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data === payload
        }, { timeout: 5_000 }).toBe(true)
        const box = await canvas.boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      }
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(canvas).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'CONNECT NOSTR', exact: true })).toBeEnabled()
      expect(errors).toEqual([])
    })
  }
}
