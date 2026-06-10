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
import './styles/leaderboard.css'
import './styles/attract.css'
import './styles/crt.css'
import { Carousel } from './ui/carousel'
import { InputController } from './ui/input'
import { mountLeaderboard } from './ui/leaderboard-panel'
import { ArcadeAudio } from './ui/audio'
import { AttractMode } from './ui/attract'
import { CrtOverlay } from './ui/crt'
import type { ArcadeConfig, Game } from '../../shared/types'

const inElectron = typeof window.arcade !== 'undefined'

async function loadGames(): Promise<Game[]> {
  if (inElectron) return window.arcade.listGames()
  // Browser design-preview fallback — dynamically imported so it is tree-shaken
  // out of the Electron bundle entirely.
  const { MOCK_GAMES } = await import('./mock-games')
  return MOCK_GAMES
}

async function loadConfig(): Promise<ArcadeConfig> {
  if (inElectron) return window.arcade.getConfig()
  const { MOCK_CONFIG } = await import('./mock-config')
  return MOCK_CONFIG
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
  let config: ArcadeConfig
  try {
    ;[games, config] = await Promise.all([loadGames(), loadConfig()])
  } catch (err) {
    showMessage(host, `Failed to load games<span class="boot-dim">${String(err)}</span>`)
    return
  }

  if (games.length === 0) {
    showMessage(host, 'NO GAMES FOUND<span class="boot-dim">drop a game into the games folder</span>')
    return
  }

  const carousel = new Carousel(games, host)

  // ── Wow-layer: audio, leaderboard, attract, CRT ────────────────────────────
  // In kiosk mode autoplay is permitted (see main), so SFX start un-muted; in a
  // browser preview they stay silent until the first gesture resumes the ctx.
  const audio = new ArcadeAudio({ muted: false })

  // Leaderboard board on the right (null when provider is 'none').
  const showBoard = mountLeaderboard(host, config, inElectron)

  // CRT overlay mounted at the carousel's `.crt-anchor`, gated by config.
  const crtAnchor = host.querySelector<HTMLElement>('.crt-anchor') ?? host
  const crt = new CrtOverlay(crtAnchor, { enabled: config.theme.crt })

  // Attract mode (idle demo loop). Overlays the cabinet under the CRT.
  const attract = new AttractMode(crtAnchor, {
    timeoutMs: config.attractTimeoutMs,
    carousel,
    audio,
  })
  attract.start()

  // Drive the board + SFX off carousel selection. Suppress the move blip while
  // attract is auto-advancing so only the drone is heard in demo mode.
  carousel.onChange(game => {
    showBoard?.(game.gameId)
    if (!attract.isActive) audio.playMove()
  })
  // Seed the board with the initial selection (onChange only fires on movement).
  showBoard?.(carousel.current().gameId)

  // ── Toast for launch errors ──────────────────────────────────────────────────
  function showErrorToast(msg: string): void {
    const existing = host.querySelector<HTMLElement>('.launch-error-toast')
    if (existing) existing.remove()
    const el = document.createElement('div')
    el.className = 'launch-error-toast'
    el.textContent = msg
    host.appendChild(el)
    window.setTimeout(() => el.remove(), 5000)
  }

  // ── Launch / back ────────────────────────────────────────────────────────────
  // `inWebGame` tracks whether a web game is currently running so that the
  // input controller routes Back/Escape to the exit path while in-game.
  let inWebGame = false

  const launch = (): void => {
    if (inWebGame) return
    audio.playSelect()
    const game = carousel.current()
    if (inElectron) {
      void window.arcade.launch(game.id)
      if (game.kind === 'web') inWebGame = true
    } else {
      // No-op in the browser preview; pulse the CTA so the press is visible.
      host.classList.add('cta-fired')
      window.setTimeout(() => host.classList.remove('cta-fired'), 320)
    }
  }

  const backFromGame = (): void => {
    if (!inElectron || !inWebGame) {
      audio.playBack()
      return
    }
    audio.playBack()
    void window.arcade.back()
  }

  const input = new InputController({
    onPrev: () => carousel.prev(),
    onNext: () => carousel.next(),
    onLaunch: launch,
    onBack: backFromGame,
    onActivity: () => {
      // First real input resumes the audio context (browser autoplay gate).
      audio.resume()
      attract.onActivity()
    },
  })
  input.start()

  // Demo / admin keys: `c` toggles the CRT, `m` toggles mute. These are
  // intentionally outside InputController (they are not game-navigation intents).
  window.addEventListener('keydown', e => {
    if (e.key === 'c' || e.key === 'C') crt.toggle()
    else if (e.key === 'm' || e.key === 'M') audio.toggleMute()
  })

  // Returning from a launched game re-focuses the carousel.
  if (inElectron) {
    window.arcade.onReturn(() => {
      inWebGame = false
      carousel.refocus()
      host.focus()
    })
    window.arcade.onError(msg => showErrorToast(msg))
  }

  // Expose tiny hooks so design-verification scripts can drive the cabinet
  // deterministically without synthesising key events. Browser-only.
  if (!inElectron) {
    Object.assign(window as unknown as Record<string, unknown>, {
      __carousel: carousel,
      __crt: crt,
      __attract: attract,
      __audio: audio,
    })
  }
}

void boot()
