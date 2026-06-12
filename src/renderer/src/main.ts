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
import './styles/relay-panel.css'
import './styles/games-panel.css'
import { Carousel } from './ui/carousel'
import { InputController } from './ui/input'
import { mountLeaderboard } from './ui/leaderboard-panel'
import { RelayPanel } from './ui/relay-panel'
import { GamesPanel } from './ui/games-panel'
import { RelayStore } from './leaderboard/relay-store'
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
  const { show: showBoard, panel: lbPanel } = mountLeaderboard(host, config, inElectron)

  // CRT overlay mounted at the carousel's `.crt-anchor`, gated by config.
  const crtAnchor = host.querySelector<HTMLElement>('.crt-anchor') ?? host
  const crt = new CrtOverlay(crtAnchor, { enabled: config.theme.crt })

  // Attract mode (idle demo loop). Overlays the cabinet under the CRT.
  const attract = new AttractMode(crtAnchor, {
    timeoutMs: config.attractTimeoutMs,
    carousel,
  })
  attract.start()

  // Per-game scoring (kind 5555 Other Stuff games carry their own score field +
  // direction; most games omit these and use the kind-30762 default).
  const scoringOf = (game: Game) =>
    game.scoreKind || game.scoreField || game.scoreDir
      ? { kind: game.scoreKind, field: game.scoreField, dir: game.scoreDir }
      : undefined

  // Drive the board + SFX off carousel selection. Stay silent while attract is
  // auto-advancing so idle demo mode makes no sound at all.
  carousel.onChange(game => {
    showBoard(game.gameId, scoringOf(game))
    if (!attract.isActive) audio.playMove()
  })
  // Seed the board with the initial selection (onChange only fires on movement).
  showBoard(carousel.current().gameId, scoringOf(carousel.current()))

  // Relay admin overlay: press 'r' to open/close.
  const relayConfig = config.leaderboard.provider === 'gamestr' ? config.leaderboard.relays : []
  const relayStore = new RelayStore(relayConfig)
  const relayPanel = new RelayPanel(host, relayStore, {
    onRelaysChanged: (enabledUrls) => {
      lbPanel?.setRelays(enabledUrls)
      // Re-seed the current game so scores reload on the new relay set.
      const currentGame = carousel.current()
      showBoard(currentGame.gameId)
    },
  })

  // Add-games overlay: press 'g' to open/close. Lists gamestr games the kiosk
  // is missing (catalogue from the gamestr bundle, liveness from the score feed)
  // and adds them with one tap. Only meaningful under Electron (needs the IPC
  // bridge); harmless to construct in the browser preview.
  let installedGames = games
  const gamesPanel = new GamesPanel(host, {
    getInstalledIds: () => installedGames.map(g => g.id),
    relays: () => relayStore.getEnabled(),
    onAdded: fresh => {
      installedGames = fresh
      // A freshly-added game needs to enter the carousel. The robust kiosk path
      // (matching the F5 admin rescan) is to refresh the shell; the operator is
      // already in the service menu, so a brief reload is acceptable.
      showMessage(host, 'GAME ADDED<span class="boot-dim">refreshing cabinet…</span>')
      window.setTimeout(() => window.location.reload(), 700)
    },
  })

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
      if (game.kind === 'web') {
        inWebGame = true
        // Pause attract while the web game is active so the overlay and carousel
        // auto-advance don't fire behind the game. Native games hide the shell
        // window entirely so attract is already visually suppressed, but we also
        // stop it for native to ensure no carousel drift if the player alt-tabs.
        attract.stop()
      }
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

  // Admin / demo keys. Intentionally outside InputController (not game-navigation intents).
  window.addEventListener('keydown', e => {
    // Ignore single-key shortcuts while typing in a field (e.g. the relay panel's
    // URL input — "wss://relay.gamestr.io" contains 'g', 'c', 'm', 'r'). Escape is
    // handled by the focused input's own handler.
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.key === 'c' || e.key === 'C') crt.toggle()
    else if (e.key === 'm' || e.key === 'M') audio.toggleMute()
    else if (e.key === 'r' || e.key === 'R') relayPanel.toggle()
    else if (e.key === 'g' || e.key === 'G') gamesPanel.toggle()
    else if (e.key === 'Escape') { relayPanel.close(); gamesPanel.close() }
  })

  // Returning from a launched game re-focuses the carousel and resumes attract.
  if (inElectron) {
    window.arcade.onReturn(() => {
      inWebGame = false
      // Resume attract watching — the timeout restarts from now so the player
      // gets the full idle period before demo mode kicks in again.
      attract.start()
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
      __relayPanel: relayPanel,
      __relayStore: relayStore,
    })
  }
}

void boot()
