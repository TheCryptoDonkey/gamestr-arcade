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
import './styles/download-panel.css'
import './styles/ready-panel.css'
import './styles/launch-overlay.css'
import './styles/donation-panel.css'
import { Carousel } from './ui/carousel'
import { InputController } from './ui/input'
import { formatScore, mountLeaderboard } from './ui/leaderboard-panel'
import { readCachedBoard } from './leaderboard/cache'
import { boardFor } from './leaderboard/gamestr-reduce'
import { shortenNpub } from './leaderboard/profiles'
import { RelayPanel } from './ui/relay-panel'
import { GamesPanel } from './ui/games-panel'
import { DownloadPanel } from './ui/download-panel'
import { ReadyPanel } from './ui/ready-panel'
import { LaunchOverlay } from './ui/launch-overlay'
import { DonationPanel } from './ui/donation-panel'
import { RelayStore } from './leaderboard/relay-store'
import { ArcadeAudio } from './ui/audio'
import { AttractMode } from './ui/attract'
import { CrtOverlay } from './ui/crt'
import type { ArcadeConfig, Game } from '../../shared/types'

const inElectron = typeof window.arcade !== 'undefined'

async function loadGames(): Promise<Game[]> {
  if (inElectron) return window.arcade.listGames()
  // Browser preview: prefer the dev server's real-games bridge (vite.preview.config.ts
  // serves /__games from the actual folder scan) so the preview reflects the real
  // cabinet. Falls back to MOCK_GAMES when the bridge isn't present (plain `vite`).
  try {
    const res = await fetch('/__games')
    if (res.ok) {
      const real = (await res.json()) as Game[]
      if (Array.isArray(real) && real.length) return real
    }
  } catch {
    /* no bridge → design-preview mock */
  }
  // Dynamically imported so the mock is tree-shaken out of the Electron bundle.
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
  const appHost = host

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

  document.title = config.theme.title
  const carousel = new Carousel(games, host, 0, {
    title: config.theme.title,
    wordmark: config.theme.wordmark,
    accent: config.theme.accent,
  })

  // Decorate the carousel with gamestr's live editorial flags (TRENDING / NEW).
  // Async + non-blocking: the cabinet shows instantly, badges pop in once the
  // catalogue (cached in the main process) resolves. Matched by slug.
  if (inElectron) {
    void window.arcade
      .gamestrCatalogue()
      .then(res => {
        const flags = new Map(res.entries.map(e => [e.slug, e]))
        let changed = false
        for (const g of games) {
          const c = flags.get(g.id) ?? flags.get(g.gameId)
          if (!c) continue
          g.trending = c.trending
          g.newRelease = c.newRelease
          g.featured = c.featured
          changed = true
        }
        if (changed) carousel.refocus()
      })
      .catch(() => {
        /* offline / no catalogue → no badges, no harm */
      })
  }

  // ── Wow-layer: audio, leaderboard, attract, CRT ────────────────────────────
  // In kiosk mode autoplay is permitted (see main), so SFX start un-muted; in a
  // browser preview they stay silent until the first gesture resumes the ctx.
  const audio = new ArcadeAudio({ muted: false })

  // Leaderboard board on the right (null when provider is 'none').
  const { show: showBoard, panel: lbPanel } = mountLeaderboard(host, config, inElectron)

  // CRT overlay mounted at the carousel's `.crt-anchor`, gated by config.
  const crtAnchor = host.querySelector<HTMLElement>('.crt-anchor') ?? host
  const crt = new CrtOverlay(crtAnchor, { enabled: config.theme.crt })

  // Per-game scoring (kind 5555 Other Stuff games carry their own score field +
  // direction; most games omit these and use the kind-30762 default).
  const scoringOf = (game: Game) =>
    game.scoreKind || game.scoreField || game.scoreDir
      ? { kind: game.scoreKind, field: game.scoreField, dir: game.scoreDir }
      : undefined

  // Feed the attract reel's top-scores strip from the cached all-time board —
  // no extra relay traffic, and cache freshness is maintained by the live panel.
  function attractScoresFor(game: Game): void {
    const raw = readCachedBoard(game.gameId)
    const dir = scoringOf(game)?.dir ?? 'desc'
    const top = boardFor(raw, 'all', 3, Math.floor(Date.now() / 1000), dir)
    attract.setScores(
      top.map(e => ({ label: e.name ?? shortenNpub(e.pubkey), score: formatScore(e.score) })),
    )
  }

  // Attract mode (idle demo reel). Overlays the cabinet under the CRT.
  const attract = new AttractMode(crtAnchor, {
    timeoutMs: config.attractTimeoutMs,
    carousel,
    onEnter: () => attractScoresFor(carousel.current()),
  })
  attract.start()

  // Drive the board + SFX off carousel selection. Stay silent while attract is
  // auto-advancing so idle demo mode makes no sound at all.
  carousel.onChange(game => {
    showBoard(game.gameId, scoringOf(game))
    if (attract.isActive) attractScoresFor(game)
    else audio.playMove()
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
    onClose: () => {
      audio.playBack()
      attract.start()
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
    onClose: () => {
      audio.playBack()
      attract.start()
    },
  })

  // Download-only games can't run in the kiosk — pressing play opens this panel
  // with a QR of the game's download URL so a visitor can grab it on their phone.
  const downloadPanel = new DownloadPanel(host, {
    onClose: () => {
      audio.playBack()
      attract.start()
    },
  })
  const closeDownloadPanel = (): void => {
    if (!downloadPanel.isOpen) return
    downloadPanel.close()
  }

  // ── Toast for launch errors ──────────────────────────────────────────────────
  function showErrorToast(msg: string): void {
    const existing = appHost.querySelector<HTMLElement>('.launch-error-toast')
    if (existing) existing.remove()
    const el = document.createElement('div')
    el.className = 'launch-error-toast'
    el.setAttribute('role', 'alert')
    el.textContent = msg
    appHost.appendChild(el)
    window.setTimeout(() => el.remove(), 5000)
  }

  // ── Launch / back ────────────────────────────────────────────────────────────
  // `inWebGame` tracks whether a web game is currently running so that the
  // input controller routes Back/Escape to the exit path while in-game.
  let inWebGame = false

  // Interstitial shown while a web game loads detached in the main process;
  // dismissed by game:web-ready / game:returned / game:error below.
  const launchOverlay = new LaunchOverlay(host)

  // Post-game donation ask: raised on return from a real session (gated below
  // on minSessionSeconds), dismissed by any control press or its own timer.
  const donationPanel = new DonationPanel(host, { onClose: () => attract.start() })
  let sessionStartedAt = 0
  let sessionGame: Game | null = null

  const startGame = (game: Game): void => {
    if (inWebGame || downloadPanel.isOpen) return
    audio.playSelect()
    attract.stop()
    if (inElectron) {
      void window.arcade.launch(game.id)
      sessionStartedAt = Date.now()
      sessionGame = game
      if (game.kind === 'web') {
        inWebGame = true
        launchOverlay.show(game)
      }
    } else {
      // No-op in the browser preview; pulse the CTA so the press is visible.
      host.classList.add('cta-fired')
      window.setTimeout(() => {
        host.classList.remove('cta-fired')
        attract.start()
      }, 320)
    }
  }

  const readyPanel = new ReadyPanel(host, {
    onConfirm: startGame,
    onCancel: () => {
      audio.playBack()
      attract.start()
    },
  })

  const requestLaunch = (game = carousel.current()): void => {
    if (donationPanel.isOpen) { donationPanel.close(); return }
    if (inWebGame || downloadPanel.isOpen || gamesPanel.isOpen || relayPanel.isOpen) return
    // Download-only titles keep their direct take-home QR path.
    if (game.downloadOnly) {
      audio.playSelect()
      attract.stop()
      downloadPanel.open(game)
      return
    }
    attract.stop()
    readyPanel.open(game)
  }
  carousel.onActivate(requestLaunch)

  const backFromGame = (): void => {
    if (!inElectron || !inWebGame) {
      audio.playBack()
      return
    }
    audio.playBack()
    void window.arcade.back()
  }

  // When the add-games panel is open it captures navigation so the operator can
  // pick + add a game with the gamepad (or keyboard) — a kiosk has no usable mouse
  // cursor. up/left → previous row, down/right → next, Ⓐ/Enter → ADD, Ⓑ/Start/Esc → close.
  const input = new InputController({
    onPrev: () => {
      if (donationPanel.isOpen) { donationPanel.close(); return }
      if (gamesPanel.isOpen) gamesPanel.moveSelection(-1)
      else if (!readyPanel.isOpen && !downloadPanel.isOpen && !relayPanel.isOpen) carousel.prev()
    },
    onNext: () => {
      if (donationPanel.isOpen) { donationPanel.close(); return }
      if (gamesPanel.isOpen) gamesPanel.moveSelection(1)
      else if (!readyPanel.isOpen && !downloadPanel.isOpen && !relayPanel.isOpen) carousel.next()
    },
    onLaunch: () => {
      if (donationPanel.isOpen) { donationPanel.close(); return }
      if (gamesPanel.isOpen) { gamesPanel.activateSelected(); return }
      if (readyPanel.isOpen) { readyPanel.confirm(); return }
      if (downloadPanel.isOpen || relayPanel.isOpen) return
      requestLaunch()
    },
    onBack: () => {
      if (donationPanel.isOpen) { donationPanel.close(); return }
      if (readyPanel.isOpen) { readyPanel.close(); return }
      if (relayPanel.isOpen) { relayPanel.close(); return }
      if (gamesPanel.isOpen) { gamesPanel.close(); return }
      if (downloadPanel.isOpen) { closeDownloadPanel(); return }
      backFromGame()
    },
    onActivity: () => {
      // First real input resumes the audio context (browser autoplay gate).
      audio.resume()
      attract.onActivity()
    },
  })
  input.start()

  // Grab keyboard focus so ← → / Enter work the moment the cabinet loads. In a
  // plain browser a freshly-opened tab leaves focus on the address bar, so the
  // window-level key handling sees nothing until the page is clicked — make the
  // shell focusable, focus it now, and re-grab on any click. Harmless under
  // Electron (the kiosk already owns focus; this just makes host.focus() effective).
  host.tabIndex = -1
  host.focus()
  host.addEventListener('pointerdown', () => host.focus())

  // Admin / demo keys. Intentionally outside InputController (not game-navigation intents).
  window.addEventListener('keydown', e => {
    // Ignore single-key shortcuts while typing in a field (e.g. the relay panel's
    // URL input — "wss://relay.gamestr.io" contains 'g', 'c', 'm', 'r'). Escape is
    // handled by the focused input's own handler.
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.key === 'c' || e.key === 'C') crt.toggle()
    else if (e.key === 'm' || e.key === 'M') audio.toggleMute()
    else if (e.key === 'r' || e.key === 'R') {
      readyPanel.close(false)
      gamesPanel.close()
      closeDownloadPanel()
      relayPanel.toggle()
      if (relayPanel.isOpen) attract.stop(); else attract.start()
    }
    else if (e.key === 'g' || e.key === 'G') {
      readyPanel.close(false)
      relayPanel.close()
      closeDownloadPanel()
      gamesPanel.toggle()
      if (gamesPanel.isOpen) attract.stop(); else attract.start()
    }
    else if (e.key === 'Escape') {
      donationPanel.close()
      readyPanel.close()
      relayPanel.close()
      gamesPanel.close()
      closeDownloadPanel()
    }
  })

  // Returning from a launched game re-focuses the carousel and resumes attract.
  if (inElectron) {
    window.arcade.onReturn(() => {
      inWebGame = false
      launchOverlay.hide()
      // Resume attract watching — the timeout restarts from now so the player
      // gets the full idle period before demo mode kicks in again.
      attract.start()
      carousel.refocus()
      host.focus()
      // The donation ask: only after a real session, never after a bounce.
      // A game author's manifest `tips` address wins (zap the developer);
      // the booth's own donation config is the fallback (zap the arcade).
      const donation = config.donation
      const playedMs = sessionStartedAt ? Date.now() - sessionStartedAt : 0
      const playedGame = sessionGame
      sessionStartedAt = 0
      sessionGame = null
      const tipAddress = playedGame?.tips
      if (playedGame && (tipAddress || donation) && playedMs >= (donation?.minSessionSeconds ?? 45) * 1000) {
        attract.stop()
        donationPanel.show(playedGame, {
          address: tipAddress ?? donation!.address,
          message: tipAddress
            ? `ZAP ${(playedGame.developer ?? 'THE DEVELOPER').toUpperCase()} — VALUE FOR VALUE`
            : donation!.message,
          showSeconds: donation?.showSeconds,
        })
        audio.playChime()
      }
    })
    window.arcade.onWebReady(() => {
      launchOverlay.hide()
    })
    window.arcade.onError(msg => {
      inWebGame = false
      sessionStartedAt = 0
      sessionGame = null
      launchOverlay.hide()
      attract.start()
      showErrorToast(msg)
    })
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
      __downloadPanel: downloadPanel,
      __readyPanel: readyPanel,
    })
    // Deterministic visual-QA route used by screenshots and accessibility checks.
    // It exists only in the browser preview; production Electron never reads it.
    if (new URLSearchParams(window.location.search).get('panel') === 'ready') {
      window.setTimeout(() => requestLaunch(), 0)
    }
  }
}

void boot()
