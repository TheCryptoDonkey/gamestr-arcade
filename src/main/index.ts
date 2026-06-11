/**
 * gamestr-arcade — main process entry.
 *
 * Launches a full-screen kiosk window with admin escape hatches.
 * Set ARCADE_KIOSK=0 for a normal windowed build during development.
 */

import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol, WebContentsView } from 'electron'
import { chmod } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn as nodeSpawn } from 'node:child_process'
import { is } from '@electron-toolkit/utils'
import { buildGamesList, isPathAllowed, mediaUrlToPath, MEDIA_SCHEME } from './games'
import { startLocalServer } from './local-server'
import type { LocalServer } from './local-server'
import { DEFAULT_CONFIG, parseConfig } from './config'
import { Launcher } from './launch'
import type { LaunchDeps } from './launch'
import type { ArcadeConfig, Game, GameControls } from '../shared/types'

// GPU flags: keep the hardware path active on booth hardware.
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

const kioskMode = process.env.ARCADE_KIOSK !== '0'

// Allow autoplay in kiosk mode so attract-mode audio starts without a gesture.
if (kioskMode) {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
}

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

// ── Games dir resolution ──────────────────────────────────────────────────────
function resolveGamesDir(): string {
  if (process.env.ARCADE_GAMES_DIR) return resolve(process.env.ARCADE_GAMES_DIR)
  const base = is.dev ? app.getAppPath() : process.resourcesPath
  return join(base, 'games')
}

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
    return parseConfig(JSON.parse(raw))
  } catch (err) {
    console.warn(`[arcade] config: using defaults (${path}): ${String(err)}`)
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
// A `WebContentsView` layered over the shell window when a web game is running.
// Created on first web launch, reused thereafter.
let webView: WebContentsView | null = null

/** Lay out `webView` to cover the full window client area. */
function sizeWebView(): void {
  if (!win || !webView) return
  const [w, h] = win.getContentSize()
  webView.setBounds({ x: 0, y: 0, width: w, height: h })
}

/** Create the web view and attach it to `win`. Called at most once. */
function ensureWebView(): WebContentsView {
  if (webView) return webView

  if (!win) throw new Error('ensureWebView called before window exists')

  // The webgame preload polls gamepads and sends game:back when the player
  // holds Start (≥700 ms) or presses Escape — bridging the focus gap where the
  // launcher's renderer is backgrounded and cannot poll navigator.getGamepads().
  // sandbox: false is required so the preload can use ipcRenderer.send.
  // contextIsolation: true ensures the third-party game page cannot reach the
  // preload's scope.
  webView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/webgame.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.contentView.addChildView(webView)
  sizeWebView()

  // Resize the overlay whenever the window resizes.
  win.on('resize', sizeWebView)

  // Navigation failure: route through the same path as a normal return so
  // launcher.running is reset, Escape is unregistered, and the shell is shown.
  webView.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain) return // ignore sub-frame failures
    console.error(`[arcade] web game load failed: ${code} ${desc} ${url}`)
    // Surface a brief error toast to the renderer BEFORE back() so it is
    // already queued when the shell comes back into focus.
    win?.webContents.send('game:error', `Web game failed to load (${desc})`)
    // back() resets running, unregisters Escape, closes the view, shows the
    // shell and sends game:returned — the one authoritative return path.
    launcher.back()
  })

  return webView
}

/** Build the real `LaunchDeps` for production use. */
function buildLaunchDeps(): LaunchDeps {
  return {
    spawn(exec) {
      const child = nodeSpawn(exec, [], { detached: false })
      return {
        onExit(cb) {
          child.on('exit', (code) => cb(code))
        },
        onError(cb) {
          child.on('error', (err) => cb(err))
        },
      }
    },

    chmodExec: (path) => chmod(path, 0o755),

    hideShell() {
      win?.hide()
    },

    showShell() {
      win?.show()
      win?.focus()
    },

    notifyReturned() {
      win?.webContents.send('game:returned')
    },

    notifyError(msg) {
      win?.webContents.send('game:error', msg)
    },

    loadWeb(url, controls?: GameControls) {
      const view = ensureWebView()
      sizeWebView()

      // Send the resolved controls mapping to the webgame preload once the page
      // has finished loading (and again on any subsequent reload so remaps take
      // effect). The preload merges the per-game overrides with DEFAULT_CONTROLS.
      const sendControls = () => {
        view.webContents.send('arcade:controls', controls ?? {})
      }
      // Remove any previous listener to avoid accumulation across launches.
      view.webContents.removeAllListeners('did-finish-load')
      view.webContents.on('did-finish-load', sendControls)

      view.webContents.loadURL(url).catch(err => {
        console.error(`[arcade] loadURL error: ${err}`)
      })
      // Bring the view to the front.
      // The back-hint bar and gamepad/keyboard exit are handled by the
      // webgame preload — no executeJavaScript injection needed here.
      if (win) {
        win.contentView.addChildView(view) // addChildView is idempotent for existing children
      }
      // Register global Escape while web game is active.
      globalShortcut.register('Escape', () => launcher.back())
    },

    closeWeb() {
      // Unregister the Escape shortcut (back to normal kiosk navigation).
      globalShortcut.unregister('Escape')
      if (webView && win) {
        win.contentView.removeChildView(webView)
        webView.webContents.loadURL('about:blank').catch(() => {})
      }
    },
  }
}

// Lazy-initialised singleton launcher; created after app is ready.
let launcher: Launcher

function createWindow(): void {
  win = new BrowserWindow({
    fullscreen: true,
    kiosk: kioskMode,
    backgroundColor: '#05070f',
    autoHideMenuBar: true,
    webPreferences: {
      // electron-vite builds the preload as .mjs (ESM).
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

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
  const gamesDir = resolveGamesDir()
  const cacheDir = join(app.getPath('userData'), 'icon-cache')
  // App resources dir (holds the bundled placeholder icon used for every
  // AppImage game where `.DirIcon` extraction cannot run — e.g. on macOS dev).
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
    return config
  })

  ipcMain.handle('games:list', async () => {
    const games = await buildGamesList(gamesDir, cacheDir, localServer?.port)
    cachedGames = games
    const localCount = games.filter(g => g.localSite).length
    console.log(`[arcade] games dir: ${gamesDir} — ${games.length} game(s)${localCount ? ` (${localCount} local)` : ''}`)
    return games
  })

  ipcMain.handle('game:launch', async (_event, id: string) => {
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
    launcher.launch(game)
  })

  // Invoked by the shell renderer's preload (ipcRenderer.invoke).
  ipcMain.handle('game:back', () => {
    launcher.back()
  })

  // Sent (fire-and-forget) by the web-game preload (ipcRenderer.send).
  // Using ipcMain.on so it works even if the sender is a WebContentsView
  // rather than the main BrowserWindow renderer.
  ipcMain.on('game:back', () => {
    launcher.back()
  })

  createWindow()

  // Initialise the launcher after the window exists.
  launcher = new Launcher(buildLaunchDeps())

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
  globalShortcut.unregisterAll()
  localServer?.close()
})
