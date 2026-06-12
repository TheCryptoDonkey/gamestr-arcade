/**
 * gamestr-arcade — main process entry.
 *
 * Launches a full-screen kiosk window with admin escape hatches.
 * Set ARCADE_KIOSK=0 for a normal windowed build during development.
 */

import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol, WebContentsView } from 'electron'
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn as nodeSpawn, spawnSync } from 'node:child_process'
import { is } from '@electron-toolkit/utils'
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
import type { ArcadeConfig, Game, GameControls, GamestrCatalogueResult, GamestrImportResult, WebLNConfig } from '../shared/types'

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

/**
 * Cached WebLN config from the last `loadConfig()` call — used by `loadWeb` to
 * push the NWC credentials into the web-game preload on each launch.
 * Set to `null` until the config is first loaded.
 */
let cachedWebLN: WebLNConfig | null | undefined = null

/** Transient systemd unit name for the currently-running native game (one at a time). */
const GAME_UNIT = 'gamestr-arcade-game'

let _hasSystemdRun: boolean | undefined
/** True when native games should launch via `systemd-run --user` (Linux + systemd present). */
function hasSystemdRun(): boolean {
  if (_hasSystemdRun === undefined) {
    try {
      _hasSystemdRun =
        process.platform === 'linux' &&
        spawnSync('systemd-run', ['--version'], { stdio: 'ignore' }).status === 0
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
      let child: ReturnType<typeof nodeSpawn>
      if (useUnit) {
        // Clear any leftover unit from a prior game before reusing the name.
        try { spawnSync('systemctl', ['--user', 'stop', GAME_UNIT], { stdio: 'ignore' }) } catch { /* ignore */ }
        try { spawnSync('systemctl', ['--user', 'reset-failed', GAME_UNIT], { stdio: 'ignore' }) } catch { /* ignore */ }
        // --wait keeps systemd-run (our tracked child) alive until the game exits,
        // so onExit fires at the right time; --collect garbage-collects the unit.
        child = nodeSpawn(
          'systemd-run',
          ['--user', '--wait', '--collect', '--quiet', '--unit', GAME_UNIT, '--', exec, ...args],
          { detached: false },
        )
      } else {
        child = nodeSpawn(exec, args, { detached: false })
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
            try { spawnSync('systemctl', ['--user', 'stop', GAME_UNIT], { stdio: 'ignore' }) } catch { /* ignore */ }
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
      win.setFullScreen(true)
      if (kioskMode) win.setKiosk(true)
      win.focus()
    },

    notifyReturned() {
      // Unregister force-back hotkeys — game has ended, player is back at grid.
      unregisterForceBack()
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
      // Also send the WebLN config if the booth has an NWC wallet configured —
      // the preload uses it to inject `window.webln` into the game page.
      const sendControls = () => {
        view.webContents.send('arcade:controls', controls ?? {})
        if (cachedWebLN) {
          view.webContents.send('arcade:webln', {
            nwc: cachedWebLN.nwc,
            maxSats: cachedWebLN.maxSats ?? 100,
          })
        }
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
    },

    closeWeb() {
      if (webView && win) {
        win.contentView.removeChildView(webView)
        webView.webContents.loadURL('about:blank').catch(() => {})
      }
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
    // Register force-back hotkeys for the duration of this game session.
    // Covers both web and native — native apps steal OS focus so the arcade
    // renderer's key listeners are inactive; only global shortcuts fire.
    registerForceBack()
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

  // Audit log: the web-game preload fires this after every successful NWC
  // auto-payment so the operator can reconcile the booth wallet spend.
  // console.error routes to the systemd journal on the deployed kiosk.
  ipcMain.on('webln:paid', (_event, info: { amountSats: number; result: unknown }) => {
    console.error(`[arcade] webln:paid — ${info.amountSats} sats | result: ${JSON.stringify(info.result)}`)
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
  globalShortcut.unregisterAll()
  localServer?.close()
})
