/**
 * gamestr-arcade — main process entry.
 *
 * Launches a full-screen kiosk window with admin escape hatches.
 * Set ARCADE_KIOSK=0 for a normal windowed build during development.
 */

import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol, WebContentsView } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn as nodeSpawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { is } from '@electron-toolkit/utils'
import { NostrWebLNProvider } from '@getalby/sdk'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { buildGamesList, isPathAllowed, mediaUrlToPath, MEDIA_SCHEME } from './games'
import { fetchGamestrCatalogue } from './gamestr-catalogue'
import type { CatalogueDeps } from './gamestr-catalogue'
import { importGameToFolder } from './gamestr-import'
import type { ImportDeps } from './gamestr-import'
import { startLocalServer } from './local-server'
import type { LocalServer } from './local-server'
import { DEFAULT_CONFIG, parseConfig } from './config'
import { Launcher } from './launch'
import type { LaunchDeps } from './launch'
import { GamepadExitWatcher, realExitWatcherDeps } from './gamepad-exit'
import { PaymentPolicyError, paymentPolicyFromConfig, SessionPaymentBroker } from './payment-broker'
import { resolveStartupGamesDir, resolveStartupKiosk } from './startup-policy'
import {
  allowedOriginsForGame,
  grantsForGame,
  isAllowedWebNavigation,
  normaliseWebOrigin,
  parseGuestNostrTemplate,
  publicArcadeConfig,
  type WebSessionGrants,
} from './web-session-policy'
import type { ArcadeConfig, Game, GamestrCatalogueResult, GamestrImportResult, WebLNConfig } from '../shared/types'

// GPU flags: keep the hardware path active on booth hardware.
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

let kioskMode = DEFAULT_CONFIG.kiosk
let activeGamesDir: string | null = null

// Web-game/attract audio needs this command-line switch before async config can
// be read. It is harmless in the windowed development shell.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// ── Media protocol ────────────────────────────────────────────────────────────
// Must be registered BEFORE app ready.
// Allows the renderer to load local game assets (logos, heroes, sounds) via
// media://local/<abs-path> regardless of whether the page was loaded from an
// http origin (dev) or a file origin (prod).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

// ── Config resolution ───────────────────────────────────────────────────────
// `arcade.config.json` lives at the app root (project root in dev, resources in
// prod). Missing / malformed files fall back to DEFAULT_CONFIG so the booth
// always boots — a typo in the config must never leave a blank cabinet.
function resolveConfigPath(): string {
  if (process.env.ARCADE_CONFIG) return resolve(process.env.ARCADE_CONFIG)
  const base = is.dev ? app.getAppPath() : process.resourcesPath
  return join(base, 'arcade.config.json')
}

async function loadConfig(): Promise<ArcadeConfig> {
  const path = resolveConfigPath()
  try {
    const raw = await readFile(path, 'utf8')
    const cfg = parseConfig(JSON.parse(raw))
    cachedWebLN = cfg.webln ?? null
    return cfg
  } catch (err) {
    console.warn(`[arcade] config: using defaults (${path}): ${String(err)}`)
    cachedWebLN = null
    return DEFAULT_CONFIG
  }
}

let win: BrowserWindow | null = null
// Local static server — started once on app ready; serves mirrored game sites.
let localServer: LocalServer | null = null

// ── Games cache ───────────────────────────────────────────────────────────────
// `games:list` populates this so `game:launch` can resolve id → Game without a
// second filesystem scan.  Set to null until the first `games:list` call.
let cachedGames: Game[] | null = null
// Re-entrancy guard: in-flight buildGamesList promise so two rapid game:launch
// calls at startup share a single scan rather than double-rebuilding.
let buildingGames: Promise<Game[]> | null = null

// ── Web-game view ─────────────────────────────────────────────────────────────
// Every launch gets a new WebContentsView, in-memory partition, guest signer and
// wallet budget. Nothing privileged or persistent is reused between players.
let webView: WebContentsView | null = null

type WalletPaymentResult = Awaited<ReturnType<NostrWebLNProvider['sendPayment']>>

interface ActiveWebSession {
  view: WebContentsView
  partition: string
  allowedOrigins: Set<string>
  grants: WebSessionGrants
  nostrSecret: Uint8Array | null
  walletProvider: NostrWebLNProvider | null
  walletEnabled: Promise<void> | null
  paymentBroker: SessionPaymentBroker<WalletPaymentResult> | null
  /** Safety attach: reveals the view even if `did-finish-load` never fires. */
  readyTimer: ReturnType<typeof setTimeout> | null
}

let activeWebSession: ActiveWebSession | null = null

/** Lay out `webView` to cover the full window client area. */
function sizeWebView(): void {
  if (!win || !webView) return
  const [w, h] = win.getContentSize()
  webView.setBounds({ x: 0, y: 0, width: w, height: h })
}

/**
 * Forward gamepad diagnostic console lines (prefixed `[gp`) from a renderer / web
 * view to the main process stdout → journald. Renderer console output otherwise
 * never reaches the booth journal. TEMPORARY (plan Phase 2A — controller
 * intermittency diagnosis); remove with the renderer-side logging in Phase 2D.
 * Filtered to `[gp` so third-party game-page console spam isn't echoed.
 */
function wireGamepadConsole(wc: WebContents, tag: string): void {
  wc.on('console-message', (_event, _level, message) => {
    if (typeof message === 'string' && message.startsWith('[gp')) {
      console.log(`[arcade][${tag}] ${message}`)
    }
  })
}

/** Tear down the current untrusted renderer and every launch-scoped authority. */
function destroyWebSession(): void {
  const current = activeWebSession
  activeWebSession = null
  webView = null
  if (!current) return

  if (current.readyTimer !== null) clearTimeout(current.readyTimer)
  current.paymentBroker?.close()
  current.walletProvider?.close()
  win?.removeListener('resize', sizeWebView)

  const { webContents } = current.view
  const isolatedSession = webContents.session
  try { win?.contentView.removeChildView(current.view) } catch { /* already detached */ }
  // Unique non-persistent partitions are never reused, and best-effort clearing
  // prevents their storage/cache from accumulating until application exit.
  void isolatedSession.clearStorageData().catch(() => {})
  void isolatedSession.clearCache().catch(() => {})
  if (!webContents.isDestroyed()) webContents.close({ waitForBeforeUnload: false })
}

/** Create and attach one fresh, manifest-bound web-game session. */
function createWebSession(game: Game): ActiveWebSession {
  if (!win) throw new Error('createWebSession called before window exists')
  if (!game.url) throw new Error('createWebSession called without a game URL')
  destroyWebSession()

  const allowedOrigins = allowedOriginsForGame(game)
  if (allowedOrigins.size === 0) throw new Error(`Web game "${game.name}" has no safe http(s) launch origin`)
  const grants = grantsForGame(game, cachedWebLN !== null && cachedWebLN !== undefined)
  const partition = `gamestr-web-${randomUUID()}`
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/webgame.mjs'),
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      safeDialogs: true,
      spellcheck: false,
      // The view stays detached (invisible) until the game finishes loading —
      // without this, Chromium throttles the hidden page and slows that load.
      backgroundThrottling: false,
    },
  })

  const session: ActiveWebSession = {
    view,
    partition,
    allowedOrigins,
    grants,
    nostrSecret: grants.nostrSign ? generateSecretKey() : null,
    walletProvider: null,
    walletEnabled: null,
    paymentBroker: null,
    readyTimer: null,
  }

  if (grants.walletPay && cachedWebLN) {
    const walletConfig = cachedWebLN
    session.paymentBroker = new SessionPaymentBroker(paymentPolicyFromConfig(walletConfig), {
      async payInvoice(invoice) {
        if (!session.walletProvider) {
          session.walletProvider = new NostrWebLNProvider({ nostrWalletConnectUrl: walletConfig.nwc })
        }
        if (!session.walletEnabled) session.walletEnabled = session.walletProvider.enable()
        await session.walletEnabled
        const result = await session.walletProvider.sendPayment(invoice)
        const { reservedSats, distinctPayments } = session.paymentBroker?.snapshot()
          ?? { reservedSats: 0, distinctPayments: 0 }
        console.error(`[arcade] wallet payment settled — session reserved=${reservedSats} sats, payments=${distinctPayments}`)
        return result
      },
    })
  }

  activeWebSession = session
  webView = view
  wireGamepadConsole(view.webContents, 'webview')

  // This partition belongs to only this view, so deny every privileged browser
  // permission by default without affecting the trusted shell session.
  const isolatedSession = view.webContents.session
  isolatedSession.setPermissionCheckHandler(() => false)
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  isolatedSession.on('will-download', event => event.preventDefault())

  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  view.webContents.on('will-frame-navigate', event => {
    if (!isAllowedWebNavigation(event.url, allowedOrigins)) {
      console.warn(`[arcade] blocked web-game navigation to ${event.url}`)
      event.preventDefault()
    }
  })
  view.webContents.on('will-redirect', event => {
    if (!isAllowedWebNavigation(event.url, allowedOrigins)) {
      console.warn(`[arcade] blocked web-game redirect to ${event.url}`)
      event.preventDefault()
    }
  })

  // The view is NOT attached here: it loads detached while the shell shows the
  // launch overlay, and `loadWeb` reveals it on `did-finish-load` (or the safety
  // timer). Bounds are kept current so the reveal is already correctly sized.
  sizeWebView()
  win.on('resize', sizeWebView)

  // Navigation failure: route through the same path as a normal return so
  // launcher.running is reset, Escape is unregistered, and the shell is shown.
  view.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain) return // ignore sub-frame failures
    if (activeWebSession?.view !== view) return
    console.error(`[arcade] web game load failed: ${code} ${desc} ${url}`)
    // Surface a brief error toast to the renderer BEFORE back() so it is
    // already queued when the shell comes back into focus.
    win?.webContents.send('game:error', `Web game failed to load (${desc})`)
    // back() resets running, unregisters Escape, closes the view, shows the
    // shell and sends game:returned — the one authoritative return path.
    launcher.back()
  })

  return session
}

/**
 * Cached wallet config stays in main. `config:get` strips it and web-game
 * preloads receive only boolean capability grants.
 */
let cachedWebLN: WebLNConfig | null | undefined = null

/** Bind privileged IPC to the active view's main frame and manifest origins. */
function requireWebSession(event: IpcMainInvokeEvent): ActiveWebSession {
  const session = activeWebSession
  if (!session || event.sender !== session.view.webContents || event.sender.isDestroyed()) {
    throw new Error('web-game session is not active')
  }
  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame !== event.sender.mainFrame) {
    throw new Error('privileged web-game IPC is restricted to the main frame')
  }
  const origin = normaliseWebOrigin(senderFrame.url)
  if (!origin || !session.allowedOrigins.has(origin)) {
    throw new Error('web-game origin is not allowed for this session')
  }
  return session
}

/** Transient systemd unit name for the currently-running native game (one at a time). */
const GAME_UNIT = 'gamestr-arcade-game'

/** How long a web game may load before the view is revealed regardless. */
const WEB_REVEAL_SAFETY_MS = 45_000

/** Resolve a system binary to an absolute path. The electron main launched from a
 *  FUSE-mounted AppImage can inherit an EMPTY $PATH, so `spawn('systemd-run', …)`
 *  fails ENOENT. Fall back to the bare name if it's not in the usual dirs. */
function findBin(name: string): string {
  for (const dir of ['/usr/bin', '/bin', '/usr/local/bin', '/sbin', '/usr/sbin']) {
    if (existsSync(`${dir}/${name}`)) return `${dir}/${name}`
  }
  return name
}
const SYSTEMD_RUN = findBin('systemd-run')
const SYSTEMCTL = findBin('systemctl')

/** Env for systemd-run / systemctl --user. The electron main from a FUSE-mounted
 *  AppImage may have no XDG_RUNTIME_DIR (needed to reach the user bus) and no PATH
 *  — derive sane values so `--user` works regardless of how we were launched. */
function systemdEnv(): NodeJS.ProcessEnv {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000
  return {
    ...process.env,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${uid}`,
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  }
}

let _hasSystemdRun: boolean | undefined
/** True when native games should launch via `systemd-run --user` (Linux + systemd present). */
function hasSystemdRun(): boolean {
  if (_hasSystemdRun === undefined) {
    try {
      _hasSystemdRun =
        process.platform === 'linux' &&
        spawnSync(SYSTEMD_RUN, ['--version'], { stdio: 'ignore', env: systemdEnv() }).status === 0
    } catch {
      _hasSystemdRun = false
    }
  }
  return _hasSystemdRun
}

/** Build the real `LaunchDeps` for production use. */
function buildLaunchDeps(): LaunchDeps {
  return {
    spawn(exec, args = []) {
      // Launch native games via the systemd USER MANAGER, not as a child of this
      // Electron process. Spawned as our child, an Electron-based game (e.g.
      // Pallasite) cannot start its own Chromium subprocesses — controller-ws,
      // zygote, GPU and the network service all fail ("GPU process isn't usable",
      // "Failed to send … to zygote"). The manager gives the game its own clean
      // session/cgroup, where it launches normally. A plain (non-detached) spawn is
      // the fallback when systemd-run isn't available (non-systemd hosts / dev).
      const useUnit = hasSystemdRun()
      const env = systemdEnv()
      // AppImage games (e.g. Pallasite) run from a FUSE squashfs mount by default.
      // Under the transient unit that mount becomes unusable when Electron's
      // network-service child re-execs `/proc/self/exe`, faulting the mmap'd
      // squashfs → SIGBUS core dump (confirmed via coredumpctl: the crashed process
      // was `/tmp/.mount_Pallas*/pallasite-desktop`). APPIMAGE_EXTRACT_AND_RUN makes
      // the AppImage extract to real files and run those — no FUSE mount to lose, and
      // `/proc/self/exe` re-exec works. The unit inherits the systemd *manager* env,
      // not ours, so it must be injected with `--setenv`, not via the `env` below.
      let child: ReturnType<typeof nodeSpawn>
      if (useUnit) {
        // Clear any leftover unit from a prior game before reusing the name.
        try { spawnSync(SYSTEMCTL, ['--user', 'stop', GAME_UNIT], { stdio: 'ignore', env }) } catch { /* ignore */ }
        try { spawnSync(SYSTEMCTL, ['--user', 'reset-failed', GAME_UNIT], { stdio: 'ignore', env }) } catch { /* ignore */ }
        // --wait keeps systemd-run (our tracked child) alive until the game exits,
        // so onExit fires at the right time; --collect garbage-collects the unit.
        child = nodeSpawn(
          SYSTEMD_RUN,
          ['--user', '--wait', '--collect', '--quiet', '--setenv=APPIMAGE_EXTRACT_AND_RUN=1', '--unit', GAME_UNIT, '--', exec, ...args],
          { detached: false, env },
        )
      } else {
        child = nodeSpawn(exec, args, { detached: false, env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } })
      }
      let killTimer: ReturnType<typeof setTimeout> | null = null
      return {
        onExit(cb) {
          child.on('exit', (code) => {
            if (killTimer !== null) {
              clearTimeout(killTimer)
              killTimer = null
            }
            cb(code)
          })
        },
        onError(cb) {
          child.on('error', (err) => cb(err))
        },
        kill() {
          // Stopping the unit is authoritative (it tears down the game's whole
          // cgroup); also signal systemd-run/the child so it unwinds promptly.
          if (useUnit) {
            try { spawnSync(SYSTEMCTL, ['--user', 'stop', GAME_UNIT], { stdio: 'ignore', env: systemdEnv() }) } catch { /* ignore */ }
          }
          child.kill('SIGTERM')
          killTimer = setTimeout(() => {
            child.kill('SIGKILL')
            killTimer = null
          }, 3000)
        },
      }
    },

    chmodExec: (path) => chmod(path, 0o755),

    hideShell() {
      if (!win) return
      // A kiosk/fullscreen window won't yield the display on hide() under a
      // Wayland compositor (GNOME/Mutter): the kiosk surface stays mapped, so the
      // grid covers the native game and the game runs invisibly behind it. Drop
      // kiosk + fullscreen FIRST, then hide — showShell() restores them on return.
      win.setKiosk(false)
      win.setFullScreen(false)
      win.hide()
    },

    showShell() {
      if (!win) return
      win.show()
      win.setFullScreen(kioskMode)
      win.setKiosk(kioskMode)
      win.focus()
    },

    notifyReturned() {
      // Unregister force-back hotkeys — game has ended, player is back at grid.
      unregisterForceBack()
      win?.webContents.send('game:returned')
    },

    notifyError(msg) {
      // Terminal launch failures must also drop force-back handlers. Otherwise a
      // failed/crashed game leaves global Escape and the evdev watcher active on
      // the grid.
      unregisterForceBack()
      win?.webContents.send('game:error', msg)
    },

    loadWeb(game) {
      const session = createWebSession(game)
      const view = session.view
      const url = game.url!
      sizeWebView()

      // Send the resolved controls mapping to the webgame preload once the page
      // has finished loading (and again on any subsequent reload so remaps take
      // effect). The preload merges the per-game overrides with DEFAULT_CONTROLS.
      // Capability grants contain no secrets or wallet policy values.
      const sendSessionSetup = () => {
        view.webContents.send('arcade:controls', game.controls ?? {})
        view.webContents.send('arcade:session-grants', session.grants)
        // Kiosk-ify the game page (runs in the page's main world, so it bypasses
        // CSP and overrides the page's own globals):
        //   - neutralise native alert/confirm/prompt — the gamepad cursor can't
        //     close OS-level dialogs (e.g. Nostrich Run's "enter a valid NSEC"),
        //   - hide scrollbars — long pages (Sats-Man) scroll via the cursor edge.
        view.webContents
          .executeJavaScript(
            `(function(){try{` +
              `window.alert=function(){};window.confirm=function(){return true};window.prompt=function(){return null};` +
              `if(!document.getElementById('__arcade_kiosk_css')){var s=document.createElement('style');s.id='__arcade_kiosk_css';` +
              `s.textContent='html{scrollbar-width:none;}*::-webkit-scrollbar{width:0 !important;height:0 !important;display:none !important;}';` +
              `(document.head||document.documentElement).appendChild(s);}` +
            `}catch(e){}})();`,
            true,
          )
          .catch(() => {})
      }
      // Reveal: the detached view is attached only once the game has actually
      // loaded, so the shell's launch overlay owns the screen until the game is
      // ready instead of the player staring at a blank page. A safety timer
      // reveals it regardless, in case a page never settles into `load`.
      const reveal = () => {
        if (activeWebSession?.view !== view || !win) return
        if (activeWebSession.readyTimer !== null) {
          clearTimeout(activeWebSession.readyTimer)
          activeWebSession.readyTimer = null
        }
        win.contentView.addChildView(view) // idempotent for existing children
        sizeWebView()
        win.webContents.send('game:web-ready')
      }
      view.webContents.on('did-finish-load', () => {
        sendSessionSetup()
        reveal()
      })
      session.readyTimer = setTimeout(reveal, WEB_REVEAL_SAFETY_MS)

      view.webContents.loadURL(url).catch(err => {
        console.error(`[arcade] loadURL error: ${err}`)
      })
      // The back-hint bar and gamepad/keyboard exit are handled by the
      // webgame preload — no executeJavaScript injection needed here.
    },

    closeWeb() {
      destroyWebSession()
    },

    now: () => Date.now(),
  }
}

// ── Force-back hotkeys ────────────────────────────────────────────────────────
// Registered while any game (web or native) is running so the operator can
// always reclaim the arcade — even when a native app has OS focus and the
// arcade's gamepad listener is backgrounded.
//
// Primary:  Escape          — for a physical EXIT button wired to the Esc key.
// Fallback: Ctrl+Shift+Bksp — deliberate chord for keyboard/debug use.
// Gamepad:  View/Menu/Guide — read from evdev by `gamepadExit` (below), the
//                             only exit path for NATIVE games (which take X
//                             focus, so the renderer can't poll the gamepad and
//                             the web-view preload doesn't exist).
//
// All are registered on game launch and unregistered on return-to-grid.

const FORCE_BACK_SHORTCUTS = ['Escape', 'CommandOrControl+Shift+Backspace'] as const

// Reads gamepad evdev devices in the main process so a controller button can
// reclaim the arcade from a native fullscreen game. Created after app ready.
let gamepadExit: GamepadExitWatcher | null = null

function registerForceBack(): void {
  for (const accel of FORCE_BACK_SHORTCUTS) {
    // globalShortcut.register is a no-op if already registered; safe to call.
    globalShortcut.register(accel, () => launcher.forceBack())
  }
  // Begin watching the controller for a menu-button exit (Linux/native games).
  void gamepadExit?.start()
}

function unregisterForceBack(): void {
  for (const accel of FORCE_BACK_SHORTCUTS) {
    globalShortcut.unregister(accel)
  }
  gamepadExit?.stop()
}

// Lazy-initialised singleton launcher; created after app is ready.
let launcher: Launcher

function createWindow(): void {
  win = new BrowserWindow({
    fullscreen: kioskMode,
    kiosk: kioskMode,
    backgroundColor: '#05070f',
    autoHideMenuBar: true,
    webPreferences: {
      // electron-vite builds the preload as .mjs (ESM).
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  wireGamepadConsole(win.webContents, 'menu')

  win.on('close', destroyWebSession)
  win.on('closed', () => {
    win = null
  })

  // Renderer URL: hot-reload dev server in dev mode, built file in production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Directory and window mode are restart-scoped. Reloadable config:get calls
  // below may refresh theme/wallet values but always report these effective
  // startup values until the process restarts.
  const startupConfig = await loadConfig()
  kioskMode = resolveStartupKiosk(startupConfig.kiosk, process.env.ARCADE_KIOSK)
  const gamesDir = resolveStartupGamesDir(
    resolveConfigPath(),
    startupConfig.gamesDir,
    process.env.ARCADE_GAMES_DIR,
  )
  activeGamesDir = gamesDir
  const cacheDir = join(app.getPath('userData'), 'icon-cache')
  // App resources dir (holds the deterministic placeholder icon used when a
  // game ships no sibling/remote logo; AppImages are never executed for art).
  const resourcesDir = resolve(app.getAppPath(), 'resources')

  // Roots the media protocol is permitted to serve from.
  const allowedRoots = [gamesDir, cacheDir, resourcesDir]

  // ── Local static server ─────────────────────────────────────────────────
  // Serves mirrored game sites from games/<slug>/site/ on localhost.
  // Failures are non-fatal — games without a local mirror fall back to their
  // remote URL as normal.
  try {
    localServer = await startLocalServer()
    console.log(`[arcade] local server: http://127.0.0.1:${localServer.port}/`)
  } catch (err) {
    console.warn(`[arcade] local server: failed to start (${String(err)}) — offline mirrors unavailable`)
  }

  // ── Media protocol handler ──────────────────────────────────────────────
  // Serves files from the allowed roots only; rejects path-traversal attempts.
  protocol.handle(MEDIA_SCHEME, async req => {
    const absPath = mediaUrlToPath(req.url)
    if (!absPath) {
      return new Response('Bad request', { status: 400 })
    }
    // Sandbox: only allow paths inside an allowed root (path-traversal safe).
    if (!isPathAllowed(absPath, allowedRoots)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(`file://${resolve(absPath)}`)
  })

  // ── IPC handlers ────────────────────────────────────────────────────────
  ipcMain.handle('config:get', async () => {
    const config = await loadConfig()
    console.log(`[arcade] config: leaderboard=${config.leaderboard.provider}, crt=${config.theme.crt}`)
    // Wallet credentials and spend policy are main-process-only.
    return publicArcadeConfig({
      ...config,
      gamesDir: activeGamesDir ?? gamesDir,
      kiosk: kioskMode,
    })
  })

  ipcMain.handle('games:list', async () => {
    const games = await buildGamesList(gamesDir, cacheDir, localServer?.port)
    cachedGames = games
    const localCount = games.filter(g => g.localSite).length
    console.log(`[arcade] games dir: ${gamesDir} — ${games.length} game(s)${localCount ? ` (${localCount} local)` : ''}`)
    return games
  })

  // ── gamestr catalogue import ──────────────────────────────────────────────
  // gamestr.io has no registry API — its catalogue (incl. each game's external
  // play URL) is hardcoded in its frontend bundle. We fetch + parse it so the
  // operator can one-tap "add" a game the kiosk is missing. A last-good cache
  // under userData keeps this working when the booth is offline.
  const catalogueCachePath = join(app.getPath('userData'), 'gamestr-catalogue.json')
  const catalogueDeps: CatalogueDeps = {
    async fetchText(url) {
      const res = await net.fetch(url)
      if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`)
      return res.text()
    },
    now: () => Date.now(),
    async readCache() {
      try {
        return JSON.parse(await readFile(catalogueCachePath, 'utf8')) as GamestrCatalogueResult
      } catch {
        return null
      }
    },
    async writeCache(result) {
      try {
        await writeFile(catalogueCachePath, JSON.stringify(result))
      } catch {
        /* best-effort */
      }
    },
  }
  const importDeps: ImportDeps = {
    mkdir: async dir => {
      await mkdir(dir, { recursive: true })
    },
    writeFile: (path, data) => writeFile(path, data, 'utf8'),
    exists: async path => {
      try {
        await stat(path)
        return true
      } catch {
        return false
      }
    },
  }

  ipcMain.handle('gamestr:catalogue', async (): Promise<GamestrCatalogueResult> => {
    try {
      const result = await fetchGamestrCatalogue(catalogueDeps)
      console.log(`[arcade] gamestr catalogue: ${result.entries.length} games (${result.source})`)
      return result
    } catch (err) {
      console.warn(`[arcade] gamestr catalogue fetch failed: ${String(err)}`)
      return { entries: [], source: 'cache', fetchedAt: 0 }
    }
  })

  ipcMain.handle('gamestr:import', async (_event, slug: string): Promise<GamestrImportResult> => {
    try {
      const cat = await fetchGamestrCatalogue(catalogueDeps)
      const entry = cat.entries.find(e => e.slug === slug)
      if (!entry) return { ok: false, error: `"${slug}" is not in the gamestr catalogue` }
      const res = await importGameToFolder(gamesDir, entry, importDeps)
      // Force a rescan so the new game.json is picked up.
      cachedGames = null
      const games = await buildGamesList(gamesDir, cacheDir, localServer?.port)
      cachedGames = games
      console.log(`[arcade] imported gamestr game "${entry.name}" (${slug})${res.created ? '' : ' — already present'}`)
      return { ok: true, slug: res.slug, created: res.created, games }
    } catch (err) {
      console.error(`[arcade] gamestr import failed for "${slug}": ${String(err)}`)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('game:launch', async (_event, id: string) => {
    // Do not depend on the renderer having requested its sanitized config first.
    if (cachedWebLN === undefined) await loadConfig()
    // Resolve the game from the cache; rebuild if not yet populated.
    // Guard against re-entrancy: two rapid presses share a single in-flight scan.
    if (!cachedGames) {
      if (!buildingGames) {
        buildingGames = buildGamesList(gamesDir, cacheDir, localServer?.port).finally(() => { buildingGames = null })
      }
      cachedGames = await buildingGames
    }
    const game = cachedGames.find(g => g.id === id)
    if (!game) {
      console.error(`[arcade] game:launch — unknown id "${id}"`)
      win?.webContents.send('game:error', `Unknown game id: ${id}`)
      return
    }
    console.log(`[arcade] launching "${game.name}" (${game.kind})`)
    // Point the local server at this game's site/ dir before the web view loads
    // so the SPA router sees `/` as its base path (not a subpath).
    if (game.localSite && game.localRoot && localServer) {
      localServer.setRoot(game.localRoot)
    }
    const started = launcher.launch(game)
    // Register force-back hotkeys for the duration of this game session.
    // Covers both web and native — native apps steal OS focus so the arcade
    // renderer's key listeners are inactive; only global shortcuts fire.
    if (started) registerForceBack()
  })

  // Privileged web-game APIs are resolved in main and bound to the currently
  // active WebContents/main-frame origin. The preload receives no wallet URL or
  // private key material.
  ipcMain.handle('webgame:wallet:pay', async (event, invoice: unknown) => {
    const session = requireWebSession(event)
    if (!session.grants.walletPay || !session.paymentBroker) {
      throw new Error('wallet payment capability is not granted for this game')
    }
    try {
      return await session.paymentBroker.pay(invoice)
    } catch (err) {
      // Policy codes are safe for game UX; provider errors can contain relay or
      // connection details, so never serialize their messages across IPC.
      if (err instanceof PaymentPolicyError) throw new Error(`wallet request refused (${err.code})`)
      console.error('[arcade] wallet provider request failed')
      throw new Error('wallet payment failed')
    }
  })

  ipcMain.handle('webgame:nostr:get-public-key', event => {
    const session = requireWebSession(event)
    if (!session.grants.nostrSign || !session.nostrSecret) {
      throw new Error('Nostr signing capability is not granted for this game')
    }
    return getPublicKey(session.nostrSecret)
  })

  ipcMain.handle('webgame:nostr:sign-event', (event, rawTemplate: unknown) => {
    const session = requireWebSession(event)
    if (!session.grants.nostrSign || !session.nostrSecret) {
      throw new Error('Nostr signing capability is not granted for this game')
    }
    const template = parseGuestNostrTemplate(rawTemplate)
    if (!template) throw new Error('Nostr event template is malformed or outside session limits')
    return finalizeEvent(template, session.nostrSecret)
  })

  // Invoked by the shell renderer's preload (ipcRenderer.invoke).
  ipcMain.handle('game:back', () => {
    launcher.back()
  })

  // Sent (fire-and-forget) by the web-game preload (ipcRenderer.send).
  // Using ipcMain.on so it works even if the sender is a WebContentsView
  // rather than the main BrowserWindow renderer.
  ipcMain.on('game:back', event => {
    if (activeWebSession && event.sender === activeWebSession.view.webContents) launcher.back()
  })

  createWindow()

  // Initialise the launcher after the window exists.
  launcher = new Launcher(buildLaunchDeps())

  // Controller-based force-back for native games: reads gamepad evdev devices
  // in the main process (renderer/web-preload polling is unavailable once a
  // native game owns the display). Menu/View/Guide press → forceBack().
  gamepadExit = new GamepadExitWatcher(
    realExitWatcherDeps(
      () => launcher.forceBack(),
      msg => console.error(`[arcade] gamepad-exit: ${msg}`),
    ),
  )

  // Admin escape hatches — kiosk hides all browser chrome so these are
  // the only way out during a booth deployment.
  globalShortcut.register('CommandOrControl+Q', () => app.quit())
  globalShortcut.register('F5', () => win?.webContents.reload())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())

app.on('will-quit', () => {
  destroyWebSession()
  globalShortcut.unregisterAll()
  localServer?.close()
})
