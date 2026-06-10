/**
 * gamestr-arcade — renderer entry point.
 *
 * Boots the hero carousel and wires keyboard + gamepad input to it.
 *
 * Data source:
 *   - Electron: real games via `window.arcade.listGames()` (IPC → folder scan).
 *   - Plain browser (Vite preview, no `window.arcade`): a mock list, so the
 *     carousel can be screenshotted at 1920×1080 during design work. The guard
 *     ensures the mock is never reached — nor even imported — on the Electron path.
 */

import './styles/carousel.css'
import { Carousel } from './ui/carousel'
import { InputController } from './ui/input'
import type { Game } from '../../shared/types'

const inElectron = typeof window.arcade !== 'undefined'

async function loadGames(): Promise<Game[]> {
  if (inElectron) return window.arcade.listGames()
  // Browser design-preview fallback — dynamically imported so it is tree-shaken
  // out of the Electron bundle entirely.
  const { MOCK_GAMES } = await import('./mock-games')
  return MOCK_GAMES
}

function showMessage(host: HTMLElement, text: string): void {
  host.classList.add('arcade')
  host.innerHTML = `<div class="boot-message">${text}</div>`
}

async function boot(): Promise<void> {
  const host = document.getElementById('app')
  if (!host) return

  showMessage(host, 'GAMESTR ARCADE<span class="boot-dim">booting…</span>')

  let games: Game[]
  try {
    games = await loadGames()
  } catch (err) {
    showMessage(host, `Failed to load games<span class="boot-dim">${String(err)}</span>`)
    return
  }

  if (games.length === 0) {
    showMessage(host, 'NO GAMES FOUND<span class="boot-dim">drop a game into the games folder</span>')
    return
  }

  const carousel = new Carousel(games, host)

  const launch = (): void => {
    const game = carousel.current()
    if (inElectron) {
      void window.arcade.launch(game.id)
    } else {
      // No-op in the browser preview; pulse the CTA so the press is visible.
      host.classList.add('cta-fired')
      window.setTimeout(() => host.classList.remove('cta-fired'), 320)
    }
  }

  const input = new InputController({
    onPrev: () => carousel.prev(),
    onNext: () => carousel.next(),
    onLaunch: launch,
    onBack: () => {
      /* reserved for in-app web-game view (later task) */
    },
  })
  input.start()

  // Returning from a launched game re-focuses the window; nothing else needed yet.
  if (inElectron) window.arcade.onReturn(() => host.focus())

  // Expose a tiny hook so design-verification scripts can drive selection
  // deterministically without synthesising key events. Browser-only.
  if (!inElectron) {
    ;(window as unknown as { __carousel?: Carousel }).__carousel = carousel
  }
}

void boot()
