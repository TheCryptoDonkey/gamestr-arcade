/**
 * Unit tests for src/main/launch.ts.
 *
 * All Electron / Node side-effects are replaced with fake deps, making these
 * tests runnable on macOS without spawning anything.
 *
 * NOTE: actual AppImage execution is [Linux]-only.  These tests verify the
 * decision/lifecycle logic only.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Launcher } from '../src/main/launch'
import type { LaunchDeps, SpawnHandle } from '../src/main/launch'
import type { Game } from '../src/shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNativeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'test-native',
    name: 'Test Native',
    kind: 'appimage',
    exec: '/games/test.AppImage',
    gameId: 'test-native',
    logo: '',
    order: 0,
    ...overrides,
  }
}

function makeWebGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'test-web',
    name: 'Test Web',
    kind: 'web',
    url: 'https://example.test/game',
    gameId: 'test-web',
    logo: '',
    order: 1,
    ...overrides,
  }
}

interface FakeDepsState {
  hidden: boolean
  shown: boolean
  returned: boolean
  errors: string[]
  loadedUrls: string[]
  webClosed: boolean
  chmodPaths: string[]
  spawnedExecs: string[]
  killCount: number
  // Control: call these from outside to simulate child events.
  simulateExit: (code: number | null) => void
  simulateError: (err: Error) => void
}

function makeFakeDeps(): { deps: LaunchDeps; state: FakeDepsState } {
  let exitCb: ((code: number | null) => void) | null = null
  let errorCb: ((err: Error) => void) | null = null

  const state: FakeDepsState = {
    hidden: false,
    shown: false,
    returned: false,
    errors: [],
    loadedUrls: [],
    webClosed: false,
    chmodPaths: [],
    spawnedExecs: [],
    killCount: 0,
    simulateExit: (code) => exitCb?.(code),
    simulateError: (err) => errorCb?.(err),
  }

  const spawnHandle: SpawnHandle = {
    onExit: (cb) => { exitCb = cb },
    onError: (cb) => { errorCb = cb },
    kill: () => { state.killCount++ },
  }

  const deps: LaunchDeps = {
    spawn: (exec) => {
      state.spawnedExecs.push(exec)
      return spawnHandle
    },
    chmodExec: async (path) => { state.chmodPaths.push(path) },
    hideShell: () => { state.hidden = true },
    showShell: () => { state.shown = true },
    notifyReturned: () => { state.returned = true },
    notifyError: (msg) => { state.errors.push(msg) },
    loadWeb: (url) => { state.loadedUrls.push(url) },
    closeWeb: () => { state.webClosed = true },
  }

  return { deps, state }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Launcher — native AppImage', () => {
  it('chmodExec then spawns and hides the shell', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    // chmodExec is async — wait a microtask tick for the promise chain to run.
    await Promise.resolve()

    expect(state.chmodPaths).toContain('/games/test.AppImage')
    expect(state.spawnedExecs).toContain('/games/test.AppImage')
    expect(state.hidden).toBe(true)
  })

  it('shows shell and notifies on exit', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    await Promise.resolve()

    expect(state.shown).toBe(false)
    state.simulateExit(0)
    expect(state.shown).toBe(true)
    expect(state.returned).toBe(true)
  })

  it('shows shell and notifies error on spawn error', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    await Promise.resolve()

    state.simulateError(new Error('ENOENT'))
    expect(state.shown).toBe(true)
    expect(state.errors.length).toBe(1)
    expect(state.errors[0]).toContain('ENOENT')
  })

  it('shows shell and notifies error when chmodExec rejects', async () => {
    const { deps, state } = makeFakeDeps()
    // Override chmodExec to reject.
    deps.chmodExec = async () => { throw new Error('chmod denied') }

    const launcher = new Launcher(deps)
    launcher.launch(makeNativeGame())
    // Two ticks: one for chmodExec promise, one for the .catch() handler.
    await Promise.resolve()
    await Promise.resolve()

    expect(state.errors.length).toBe(1)
    expect(state.errors[0]).toContain('chmod denied')
    expect(state.hidden).toBe(false) // never hid because chmod failed
  })

  it('single-flight: second launch() while running is a no-op', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    await Promise.resolve()
    launcher.launch(makeNativeGame({ exec: '/games/other.AppImage' }))
    await Promise.resolve()

    // Only one spawn happened.
    expect(state.spawnedExecs).toHaveLength(1)
    expect(state.spawnedExecs[0]).toBe('/games/test.AppImage')
  })

  it('allows a second launch after the first game exits', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    await Promise.resolve()
    state.simulateExit(0)

    // After exit the running flag is cleared.
    launcher.launch(makeNativeGame({ exec: '/games/second.AppImage' }))
    await Promise.resolve()
    expect(state.spawnedExecs).toHaveLength(2)
  })

  it('notifies error and does not spawn when exec is missing', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame({ exec: undefined }))
    await Promise.resolve()

    expect(state.spawnedExecs).toHaveLength(0)
    expect(state.errors.length).toBe(1)
    expect(state.errors[0]).toContain('no executable path')
  })
})

describe('Launcher — web game', () => {
  it('calls loadWeb with the game URL', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeWebGame())
    expect(state.loadedUrls).toContain('https://example.test/game')
  })

  it('back() closes web view, shows shell, and notifies returned', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeWebGame())
    launcher.back()

    expect(state.webClosed).toBe(true)
    expect(state.shown).toBe(true)
    expect(state.returned).toBe(true)
  })

  it('back() is a no-op when no game is running', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.back() // no launch first
    expect(state.webClosed).toBe(false)
    expect(state.returned).toBe(false)
  })

  it('single-flight blocks a second web launch while one is active', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeWebGame())
    launcher.launch(makeWebGame({ url: 'https://example.test/other' }))

    expect(state.loadedUrls).toHaveLength(1)
    expect(state.loadedUrls[0]).toBe('https://example.test/game')
  })

  it('allows a second web launch after back()', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeWebGame())
    launcher.back()
    launcher.launch(makeWebGame({ url: 'https://example.test/second' }))

    expect(state.loadedUrls).toHaveLength(2)
  })

  it('notifies error and does not load when url is missing', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeWebGame({ url: undefined }))
    expect(state.loadedUrls).toHaveLength(0)
    expect(state.errors.length).toBe(1)
    expect(state.errors[0]).toContain('no URL')
  })

  // Fix #1 — did-fail-load must route through back() so running resets.
  // Simulate: main process `did-fail-load` calls back() (the corrected path).
  // Previously the handler bypassed back() and left running=true.
  it('back() after a did-fail-load resets running so a subsequent launch proceeds', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    // Web game launches and load subsequently fails (simulated as did-fail-load
    // calling back() — the corrected index.ts handler).
    launcher.launch(makeWebGame())
    launcher.back() // simulates did-fail-load → launcher.back() path

    // The cabinet must be able to launch again.
    launcher.launch(makeWebGame({ url: 'https://example.test/second' }))
    expect(state.loadedUrls).toHaveLength(2)
    expect(state.loadedUrls[1]).toBe('https://example.test/second')
  })
})

// ── forceBack() ───────────────────────────────────────────────────────────────

describe('Launcher — forceBack()', () => {
  it('is a no-op when nothing is running', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.forceBack()

    expect(state.killCount).toBe(0)
    expect(state.webClosed).toBe(false)
    expect(state.returned).toBe(false)
  })

  it('kills the native child and exit handler returns to grid', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    await Promise.resolve() // allow chmodExec + spawn to settle

    expect(state.spawnedExecs).toHaveLength(1)

    launcher.forceBack()

    // kill() must have been called on the child handle.
    expect(state.killCount).toBe(1)

    // The exit handler fires when the OS kills the process.
    state.simulateExit(null)

    expect(state.shown).toBe(true)
    expect(state.returned).toBe(true)
  })

  it('killing the native child clears running so a new launch is allowed', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    await Promise.resolve()

    launcher.forceBack()
    state.simulateExit(null) // exit handler clears running

    // A second launch must proceed.
    launcher.launch(makeNativeGame({ exec: '/games/second.AppImage' }))
    await Promise.resolve()
    expect(state.spawnedExecs).toHaveLength(2)
  })

  it('closes web view and returns to grid for a running web game', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeWebGame())
    launcher.forceBack()

    expect(state.webClosed).toBe(true)
    expect(state.shown).toBe(true)
    expect(state.returned).toBe(true)
  })

  it('forceBack on web game clears running so a new launch is allowed', () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeWebGame())
    launcher.forceBack()

    launcher.launch(makeWebGame({ url: 'https://example.test/second' }))
    expect(state.loadedUrls).toHaveLength(2)
  })

  it('forceBack is idempotent — second call when not running is silent', async () => {
    const { deps, state } = makeFakeDeps()
    const launcher = new Launcher(deps)

    launcher.launch(makeNativeGame())
    await Promise.resolve()

    launcher.forceBack()
    state.simulateExit(null)

    // Already back at grid — second forceBack must not throw or double-fire.
    launcher.forceBack()
    expect(state.killCount).toBe(1)
    expect(state.loadedUrls).toHaveLength(0)
  })
})
