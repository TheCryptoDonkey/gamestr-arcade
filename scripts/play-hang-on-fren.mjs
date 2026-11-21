export async function playHangOnFren(game) {
  await game.locator('body[data-phase="title"]').waitFor({ timeout: 45_000 })
  await game.waitForFunction(() => document.hasFocus() && document.visibilityState === 'visible', undefined, { polling: 100 })
  const started = game.locator('body[data-phase="loading"], body[data-phase="playing"]')
  await game.keyboard.press('Enter', { delay: 100 })
  try {
    await started.waitFor({ timeout: 3_000 })
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error
    await game.keyboard.press('Space', { delay: 100 })
  }
  await game.locator('body[data-phase="playing"]').waitFor({ timeout: 45_000 })
}
