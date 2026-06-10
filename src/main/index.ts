/**
 * gamestr-arcade — main process entry.
 *
 * Launches a full-screen kiosk window with admin escape hatches.
 * Set ARCADE_KIOSK=0 for a normal windowed build during development.
 */

import { app, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

// GPU flags: keep the hardware path active on booth hardware.
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

const kioskMode = process.env.ARCADE_KIOSK !== '0'

// Allow autoplay in kiosk mode so attract-mode audio starts without a gesture.
if (kioskMode) {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
}

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    fullscreen: true,
    kiosk: kioskMode,
    backgroundColor: '#05070f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
