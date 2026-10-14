import { test, expect } from '@playwright/test'

test('600 game definition review works with strict CSP and keeps draft compatibility separate', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:4175')
  await page.getByRole('link', { name: 'GAME DEFINITIONS', exact: true }).click()
  await expect(page).toHaveURL('http://127.0.0.1:4175/definitions/600/')
  await expect(page.locator('article.game')).toHaveCount(4)
  await expect(page.locator('.pill.live')).toHaveText('Existing layout')
  await expect(page.locator('.pill:not(.live)')).toHaveCount(3)
  const published = await page.evaluate(async () => {
    const catalogue = await (await fetch('/catalogue.json')).json()
    const review = await (await fetch('/definitions/600/games.json')).json()
    return { live: catalogue.filter((game: any) => game.phoneController).map((game: any) => game.slug),
      reviewed: review.map((game: any) => ({ slug: game.slug, live: game.livePhone })) }
  })
  expect(published.live).toEqual(['hang-on-fren'])
  expect(published.reviewed.filter(game => game.live).map(game => game.slug)).toEqual(['hang-on-fren'])
  await page.getByRole('button', { name: 'Portrait', exact: true }).click()
  await expect(page.locator('.layout-heading span')).toHaveText(['PORTRAIT', 'PORTRAIT', 'PORTRAIT', 'PORTRAIT'])
  await page.getByRole('button', { name: 'Landscape', exact: true }).click()
  await expect(page.locator('.layout-heading span')).toHaveText(['LANDSCAPE', 'LANDSCAPE', 'LANDSCAPE', 'LANDSCAPE'])
  await page.getByRole('button', { name: 'iPad landscape', exact: true }).click()
  await expect(page.locator('.layout-heading span')).toHaveText(['IPAD LANDSCAPE','IPAD LANDSCAPE','IPAD LANDSCAPE','IPAD LANDSCAPE'])
  await page.getByRole('button', { name: 'Landscape', exact: true }).click()
  const ledger = page.locator('article[data-slug=takemetoyourledger]')
  await ledger.getByRole('button', { name: 'Read full description', exact: true }).click()
  await expect(ledger.locator('.description')).toHaveClass(/expanded/)
  const racer = page.locator('article[data-slug=hang-on-fren]')
  await racer.getByRole('button', { name: 'Inspect definition', exact: true }).click()
  await expect(racer.locator('pre')).toContainText('"controller"')
  const downloadPromise = page.waitForEvent('download')
  await racer.getByRole('link', { name: 'Download draft game.json', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('hang-on-fren-draft-game.json')
  expect(errors).toEqual([])
})

test('preview releases held input on blur and rotation and fits narrow screens', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/definitions/600/')
  const fire = page.getByRole('button', { name: 'Pallasite: Fire', exact: true })
  await fire.scrollIntoViewIfNeeded()
  const box = await fire.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await expect(fire).toHaveClass(/pressed/)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(fire).not.toHaveClass(/pressed/)
  await page.mouse.up()
  await page.getByRole('button', { name: 'Portrait', exact: true }).click()
  await expect(page.locator('.pressed')).toHaveCount(0)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})


test('all preview action clusters use the exported game controls and bounded thumb reach', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/definitions/600/')
  const result = await page.evaluate(async () => {
    const games = await (await fetch('./games.json')).json()
    return games.every((game: any) => !game.draft.controller.profile.layout && Object.values(game.resolved).every((layout: any) => {
      const a = layout.slots.A
      return a.zone.width >= 100 && layout.width-a.x <= 116 && Object.entries(layout.slots).every(([key,p]: [string,any]) => key === 'start' || key.startsWith('joy') || Math.hypot(p.x-a.x,p.y-a.y) <= 180)
    }))
  })
  expect(result).toBe(true)
  const fire = page.getByRole('button', { name: 'Pallasite: Fire', exact: true })
  const bounds = await fire.boundingBox()
  expect(bounds!.width).toBeGreaterThan(bounds!.height)
})
