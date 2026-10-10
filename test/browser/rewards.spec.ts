import { test, expect, type Page } from '@playwright/test'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'

const recipientKey = new Uint8Array(32).fill(7)
const senderKey = new Uint8Array(32).fill(8)
const recipient = getPublicKey(recipientKey)
const sender = getPublicKey(senderKey)
const profile = finalizeEvent({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ name: 'Test recipient', lud16: 'player@example.com' }) }, recipientKey)
const invoice = 'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567'
type WalletMode = 'none' | 'uncertain' | 'hold' | 'success'

async function setup(page: Page, mode: WalletMode = 'none') {
  await page.context().exposeFunction('__signFixture', (template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, senderKey))
  await page.addInitScript(({ profile, sender, mode }) => {
    const w = window as unknown as { nostr: unknown; webln?: unknown; __signFixture: (t: unknown) => Promise<unknown>; __enabled: number; __paid: string[]; __signed: number; __releaseWallet?: () => void }
    w.__enabled = 0; w.__paid = []; w.__signed = 0
    w.nostr = { getPublicKey: async () => sender, signEvent: (t: unknown) => { ++w.__signed; return w.__signFixture(t) } }
    if (mode !== 'none') w.webln = {
      enable: async () => { ++w.__enabled; if (mode === 'hold') await new Promise<void>(resolve => { w.__releaseWallet = resolve }) },
      sendPayment: async (invoice: string) => { w.__paid.push(invoice); if (mode === 'uncertain') throw new Error('Wallet connection lost; payment state unknown.'); return { preimage: 'test-result' } },
    }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const Native = window.WebSocket
    window.WebSocket = class {
      readyState = 1
      onopen?: () => void
      onmessage?: (event: { data: string }) => void
      constructor(url: string, protocols?: string | string[]) {
        if (!url.startsWith('wss://')) return new Native(url, protocols) as unknown as this
        setTimeout(() => this.onopen?.(), 0)
      }
      send(raw: string) {
        const message = JSON.parse(raw)
        if (message[0] === 'REQ' && message[2]?.kinds?.includes(0) && message[2]?.authors?.includes(profile.pubkey)) setTimeout(() => this.onmessage?.({ data: JSON.stringify(['EVENT', message[1], profile]) }), 0)
      }
      close() {} addEventListener() {} removeEventListener() {}
    } as unknown as typeof WebSocket
  }, { profile, sender, mode })
  await page.route('https://**/*', route => route.abort())
  await page.route('**/catalogue.json', route => route.fulfill({ json: [] }))
  await page.route('https://example.com/.well-known/lnurlp/player', route => route.fulfill({ json: { tag: 'payRequest', callback: 'https://pay.example.com/cb', minSendable: 1000, maxSendable: 5_000_000, allowsNostr: true, nostrPubkey: recipient } }))
}

for (const [edition, port] of [['gamestr', 4174], ['600', 4175]] as const) {
  test(`${edition}: mobile invoice has QR, copy and wallet link without WebLN, with dialog keyboard recovery`, async ({ page }) => {
    await setup(page)
    let requests = 0
    await page.route('https://pay.example.com/cb?*', route => { ++requests; expect(new URL(route.request().url()).searchParams.get('amount')).toBe('2000000'); return route.fulfill({ json: { pr: invoice } }) })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`http://127.0.0.1:${port}/player/${recipient}`)
    const opener = page.getByRole('button', { name: '⚡ ZAP PLAYER', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Zap Test recipient', exact: true })
    await expect(dialog.getByRole('checkbox')).not.toBeChecked()
    const amount = dialog.getByRole('spinbutton', { name: 'Amount in sats' })
    await expect(amount).toBeFocused()
    await dialog.getByRole('button', { name: 'CANCEL', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(amount).toBeFocused()
    await amount.fill('2000')
    await dialog.getByRole('button', { name: 'OPEN MY WALLET', exact: true }).click()
    await expect(dialog.getByRole('img', { name: 'Lightning invoice for 2000 sats to Test recipient' })).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'OPEN LIGHTNING WALLET', exact: true })).toHaveAttribute('href', `lightning:${invoice}`)
    await expect(dialog.getByRole('textbox', { name: 'Exact Lightning invoice' })).toHaveValue(invoice)
    await dialog.getByRole('button', { name: 'COPY INVOICE', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('clipboard access is unavailable')
    await expect(amount).toBeDisabled()
    expect(requests).toBe(1)
    expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test(`${edition}: uncertain WebLN result keeps one invoice and never automatically pays again`, async ({ page }) => {
    await setup(page, 'uncertain')
    let requests = 0
    await page.route('https://pay.example.com/cb?*', route => { ++requests; return route.fulfill({ json: { pr: invoice } }) })
    await page.goto(`http://127.0.0.1:${port}/player/${recipient}`)
    await page.getByRole('button', { name: '⚡ ZAP PLAYER', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('spinbutton').fill('2000')
    await dialog.getByRole('button', { name: 'OPEN MY WALLET', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Check your wallet before retrying')
    await expect(dialog.getByRole('button', { name: 'INVOICE READY', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('textbox')).toHaveValue(invoice)
    expect(requests).toBe(1)
    expect(await page.evaluate(() => (window as unknown as { __paid: string[] }).__paid)).toEqual([invoice])
  })
}

test('cancelling while WebLN approval is pending prevents the payment request', async ({ page }) => {
  await setup(page, 'hold')
  await page.route('https://pay.example.com/cb?*', route => route.fulfill({ json: { pr: invoice } }))
  await page.goto(`http://127.0.0.1:4174/player/${recipient}`)
  await page.getByRole('button', { name: '⚡ ZAP PLAYER', exact: true }).click()
  await page.getByRole('spinbutton').fill('2000')
  await page.getByRole('button', { name: 'OPEN MY WALLET', exact: true }).click()
  await page.waitForFunction(() => (window as unknown as { __enabled: number }).__enabled === 1)
  await page.getByRole('button', { name: 'CANCEL', exact: true }).click()
  await page.evaluate(() => (window as unknown as { __releaseWallet: () => void }).__releaseWallet())
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __paid: string[] }).__paid)).toEqual([])
})

test('a wrong-amount invoice never reaches WebLN or a QR payment action', async ({ page }) => {
  await setup(page, 'success')
  await page.route('https://pay.example.com/cb?*', route => route.fulfill({ json: { pr: invoice } }))
  await page.goto(`http://127.0.0.1:4174/player/${recipient}`)
  await page.getByRole('button', { name: '⚡ ZAP PLAYER', exact: true }).click()
  await page.getByRole('button', { name: 'OPEN MY WALLET', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('does not match')
  await expect(page.locator('.reward-qr')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __enabled: number }).__enabled)).toBe(0)
})
