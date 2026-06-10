/**
 * gamestr-arcade — main process entry.
 *
 * Launches a full-screen kiosk window with admin escape hatches.
 * Set ARCADE_KIOSK=0 for a normal windowed build during development.
 */

import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol } from 'electron'
import { join, resolve } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { buildGamesList, mediaUrlToPath, MEDIA_SCHEME } from './games'

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

let win: BrowserWindow | null = null

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

app.whenReady().then(() => {
  const gamesDir = resolveGamesDir()
  const cacheDir = join(app.getPath('userData'), 'icon-cache')

  // ── Media protocol handler ──────────────────────────────────────────────
  // Serves files from the games dir only; rejects path-traversal attempts.
  protocol.handle(MEDIA_SCHEME, async req => {
    const absPath = mediaUrlToPath(req.url)
    if (!absPath) {
      return new Response('Bad request', { status: 400 })
    }
    const canonical = resolve(absPath)
    // Sandbox: only allow paths inside gamesDir or cacheDir.
    if (!canonical.startsWith(gamesDir) && !canonical.startsWith(cacheDir)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(`file://${canonical}`)
  })

  // ── IPC handlers ────────────────────────────────────────────────────────
  ipcMain.handle('games:list', async () => {
    const games = await buildGamesList(gamesDir, cacheDir)
    console.log(`[arcade] games dir: ${gamesDir} — ${games.length} game(s)`)
    return games
  })

  // Placeholder: real launch impl is a later task.
  ipcMain.handle('game:launch', async (_event, _id: string) => {
    // TODO: Task 10 — launch AppImage or open web game.
  })

  createWindow()

  // Admin escape hatches — kiosk hides all browser chrome so these are
  // the only way out during a booth deployment.
  globalShortcut.register('CommandOrControl+Q', () => app.quit())
  globalShortcut.register('F5', () => win?.webContents.reload())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())

app.on('will-quit', () => globalShortcut.unregisterAll())
