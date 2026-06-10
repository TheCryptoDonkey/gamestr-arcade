/**
 * gamestr-arcade — renderer entry point.
 *
 * Bootstraps the UI. The attract-mode carousel, leaderboard panel,
 * and game launcher will be added in subsequent tasks.
 */

const app = document.getElementById('app')

if (app) {
  app.textContent = 'gamestr arcade — loading…'
}
