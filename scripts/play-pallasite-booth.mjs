/** Start a solo guest run through the installed game's Station 1 lobby. */
export async function playPallasiteBooth(game, activate) {
  await activate(game.getByRole('button', { name: /tap to start/i }))
  await activate(game.getByRole('button', { name: /^PLAYER 1 .*PRESS/ }))
  await activate(game.getByRole('button', { name: /start · solo/i }))
  await activate(game.getByRole('button', { name: /play as guest/i }))
  await game.keyboard.type('CABINET')
  await activate(game.getByRole('button', { name: /done/i }))
  await activate(game.getByRole('button', { name: /^CLASSIC/ }))
  await activate(game.getByRole('button', { name: 'Skip intro', exact: true }))
  await game.locator('body[data-phase="playing"]').waitFor({ timeout: 60_000 })
}
