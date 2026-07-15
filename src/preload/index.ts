/**
 * gamestr-arcade - preload script.
 *
 * Runs in a sandboxed context before the renderer page loads.
 * Exposes a minimal, typed IPC surface via contextBridge.
 * Never leak Node / Electron internals to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('arcade', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  listGames: () => ipcRenderer.invoke('games:list'),
  launch: (id: string) => ipcRenderer.invoke('game:launch', id),
  back: () => ipcRenderer.invoke('game:back'),
  gamestrCatalogue: () => ipcRenderer.invoke('gamestr:catalogue'),
  gamestrImport: (slug: string) => ipcRenderer.invoke('gamestr:import', slug),
  onReturn: (cb: () => void) => {
    // F5 (admin rescan) re-runs the preload - removeAllListeners ensures only
    // one handler survives each reload (prevents stacking across hot-reloads).
    ipcRenderer.removeAllListeners('game:returned')
    ipcRenderer.on('game:returned', () => cb())
  },
  onWebReady: (cb: () => void) => {
    ipcRenderer.removeAllListeners('game:web-ready')
    ipcRenderer.on('game:web-ready', () => cb())
  },
  onError: (cb: (msg: string) => void) => {
    ipcRenderer.removeAllListeners('game:error')
    ipcRenderer.on('game:error', (_e, msg: string) => cb(msg))
  },
})
