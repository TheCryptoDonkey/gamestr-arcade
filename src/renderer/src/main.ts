/**
 * gamestr-arcade — renderer entry point.
 *
 * Bootstraps the UI. The attract-mode carousel, leaderboard panel,
 * and game launcher will be added in subsequent tasks.
 *
 * For now: fetches the games list via IPC and renders a temporary
 * placeholder so we can verify the media protocol + IPC bridge work.
 */

const app = document.getElementById('app')

if (app) {
  app.textContent = 'gamestr arcade — loading…'

  window.arcade.listGames().then(games => {
    app.innerHTML = ''

    if (games.length === 0) {
      app.textContent = 'No games found.'
      return
    }

    const list = document.createElement('ul')
    list.style.cssText = 'list-style:none;margin:2rem;padding:0;font-family:monospace;color:#7cf3ff'

    for (const game of games) {
      const item = document.createElement('li')
      item.style.cssText = 'display:flex;align-items:center;gap:1rem;margin:0.5rem 0'

      if (game.logo) {
        const img = document.createElement('img')
        img.src = game.logo
        img.alt = game.name
        img.style.cssText = 'width:48px;height:48px;object-fit:contain'
        item.appendChild(img)
      }

      const label = document.createElement('span')
      label.textContent = game.name
      item.appendChild(label)

      list.appendChild(item)
    }

    app.appendChild(list)
  }).catch(err => {
    if (app) app.textContent = `Error loading games: ${err}`
  })
}
