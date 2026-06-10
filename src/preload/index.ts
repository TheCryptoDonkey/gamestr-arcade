/**
 * gamestr-arcade — preload script.
 *
 * Runs in a sandboxed context before the renderer page loads.
 * Exposes a minimal, typed IPC surface via contextBridge.
 * Never leak Node / Electron internals to the renderer.
 */

import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose the toolkit API under `window.electron` for the renderer.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (err) {
    console.error('[preload] contextBridge.exposeInMainWorld failed:', err)
  }
}
