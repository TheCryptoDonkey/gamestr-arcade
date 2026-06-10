/**
 * gamestr-arcade — preload script.
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
  onReturn: (cb: () => void) => ipcRenderer.on('game:returned', () => cb()),
  onError: (cb: (msg: string) => void) => ipcRenderer.on('game:error', (_e, msg: string) => cb(msg)),
})
