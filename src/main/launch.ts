/**
 * gamestr-arcade — game launcher.
 *
 * Handles two launch modes:
 *   - native: chmod the AppImage, spawn it, hide the shell while it runs, restore on exit.
 *   - web:    load the URL into a WebContentsView layered over the window.
 *
 * Designed for unit-testability: all Electron / Node side-effects are injected
 * via `LaunchDeps`, so tests on macOS can exercise the full lifecycle without
 * spawning anything or requiring a real BrowserWindow.
 *
 * Native AppImage spawning is [Linux]-only — tests and macOS dev verify the
 * logic path only; actual execution is unverified on macOS.
 */

import type { Game, GameControls } from '../shared/types'

// ── Deps interface ────────────────────────────────────────────────────────────

/** A handle returned by `LaunchDeps.spawn` representing the running child. */
export interface SpawnHandle {
  /** Register an exit callback (code is null when the process was killed). */
  onExit(cb: (code: number | null) => void): void
  /** Register an error callback (e.g. ENOENT — executable not found). */
  onError(cb: (err: Error) => void): void
  /**
   * Force-terminate the child process.
   * Sends SIGTERM immediately; escalates to SIGKILL after 3 s if still running.
   */
  kill(): void
}

/**
 * All Electron/Node side-effects used by `Launcher`, injectable for tests.
 *
 * In production, wire these up in `src/main/index.ts` with real Electron APIs.
 * In tests, pass a `FakeDeps` object that records what was called.
 */
export interface LaunchDeps {
  /** Spawn the AppImage at `exec` (with optional extra args). Returns a handle for exit/error callbacks. */
  spawn(exec: string, args?: string[]): SpawnHandle
  /** Ensure the file at `path` is executable (chmod 755). */
  chmodExec(path: string): Promise<void>
  /** Hide the shell window (native game taking over the display). */
  hideShell(): void
  /** Show the shell window + bring it to front. */
  showShell(): void
  /** Notify the renderer that control has returned to the grid. */
  notifyReturned(): void
  /** Notify the renderer of a launch error with a human-readable message. */
  notifyError(msg: string): void
  /** Load `url` into the web view (creates it if needed). Send `controls` to the preload after load. */
  loadWeb(url: string, controls?: GameControls): void
  /** Close the web view and reveal the shell. */
  closeWeb(): void
  /** Current time in ms (injectable so crash-cooldown timing is testable). */
  now(): number
}

/**
 * A native game that exits this soon after launch — and not because WE killed
 * it — is treated as a crash rather than a normal quit.
 */
export const NATIVE_CRASH_THRESHOLD_MS = 5000
/**
 * After a native game crashes on launch, block relaunching THAT game for this
 * long. Stops a held A-button (or impatient retries) from crash-looping the
 * booth — the screen flickering launcher↔crash is what strands the operator.
 */
export const NATIVE_CRASH_COOLDOWN_MS = 15000

// ── Launcher ──────────────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of a launched game.
 *
 * Single-flight: while a game is running, additional `launch()` calls are
 * silently dropped.  This prevents double-launch from a held button press.
 *
 * Error recovery: if spawn fails or the AppImage exits with a non-zero code,
 * the shell is always restored and the renderer is notified — we never leave
 * the window hidden.
 */
export class Launcher {
  private readonly deps: LaunchDeps
  private running = false
  /** Handle for the currently-running native child, if any. */
  private nativeChild: SpawnHandle | null = null
  /** Set when WE kill the child (forceBack) so its exit isn't mistaken for a crash. */
  private intentionalExit = false
  /** Game id that crashed on launch, and the time (ms) until it may relaunch. */
  private crashedGameId: string | null = null
  private crashCooldownUntil = 0

  constructor(deps: LaunchDeps) {
    this.deps = deps
  }

  /**
   * Launch `game`.
   *   - native (AppImage): chmod → spawn → hideShell; on exit → showShell + notifyReturned.
   *   - web: loadWeb(url); call `back()` to return.
   *
   * No-op if a game is already running (single-flight guard).
   */
  launch(game: Game): void {
    if (this.running) return

    // Crash cooldown: if this game just crashed on launch, refuse to relaunch it
    // for a while so a held button can't loop the booth. Drop silently — the
    // crash was already reported once; spamming the error on every press is worse.
    if (game.id === this.crashedGameId && this.deps.now() < this.crashCooldownUntil) {
      return
    }

    this.running = true

    if (game.kind === 'appimage') {
      this.launchNative(game)
    } else {
      this.launchWeb(game)
    }
  }

  /**
   * Return from a web game to the grid.
   * No-op if no web game is currently running.
   */
  back(): void {
    if (!this.running) return
    this.deps.closeWeb()
    this.deps.showShell()
    this.deps.notifyReturned()
    this.running = false
  }

  /**
   * Force the current game (web or native) to exit and return to the grid.
   *
   * - Web game: equivalent to `back()` — closes the WebContentsView immediately.
   * - Native game: calls `kill()` on the child handle; the existing `onExit`
   *   handler then calls `showShell` + `notifyReturned` + clears `running`.
   * - No game running: silent no-op.
   *
   * Idempotent: safe to call when nothing is running or when already returning.
   */
  forceBack(): void {
    if (!this.running) return

    if (this.nativeChild) {
      // Kill the native process; the onExit handler restores the shell. Flag it
      // so the exit isn't mistaken for a launch crash (no cooldown on a manual exit).
      this.intentionalExit = true
      this.nativeChild.kill()
    } else {
      // Web game — use the normal back path.
      this.deps.closeWeb()
      this.deps.showShell()
      this.deps.notifyReturned()
      this.running = false
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private launchNative(game: Game): void {
    const exec = game.exec
    if (!exec) {
      // Defensive: kind===appimage but no exec path — shouldn't happen but never hang.
      this.deps.notifyError(`Game "${game.name}" has no executable path.`)
      this.running = false
      return
    }

    // chmod first (async), then spawn.  Errors at either stage restore the shell.
    this.deps
      .chmodExec(exec)
      .then(() => {
        const startedAt = this.deps.now()
        this.intentionalExit = false
        const child = this.deps.spawn(exec, game.args)
        this.nativeChild = child
        this.deps.hideShell()

        child.onExit((code) => {
          this.nativeChild = null
          this.deps.showShell()
          // An abnormal exit (signal → null, or non-zero) very soon after launch,
          // that WE didn't trigger, is a crash on launch. Report it and start a
          // cooldown so the game can't be relaunched into a flickering loop. A
          // clean (code 0) quit — or a slow exit — is treated as a normal return.
          const crashed =
            !this.intentionalExit &&
            code !== 0 &&
            this.deps.now() - startedAt < NATIVE_CRASH_THRESHOLD_MS
          if (crashed) {
            this.crashedGameId = game.id
            this.crashCooldownUntil = this.deps.now() + NATIVE_CRASH_COOLDOWN_MS
            this.deps.notifyError(
              `"${game.name}" crashed on launch — skipping it for now. Try another game.`,
            )
          } else {
            this.deps.notifyReturned()
          }
          this.intentionalExit = false
          this.running = false
        })

        child.onError(err => {
          this.nativeChild = null
          this.deps.showShell()
          this.deps.notifyError(`Failed to launch "${game.name}": ${err.message}`)
          this.running = false
        })
      })
      .catch((err: Error) => {
        this.deps.notifyError(`Cannot make "${game.name}" executable: ${err.message}`)
        this.running = false
      })
  }

  private launchWeb(game: Game): void {
    const url = game.url
    if (!url) {
      this.deps.notifyError(`Web game "${game.name}" has no URL.`)
      this.running = false
      return
    }
    this.deps.loadWeb(url, game.controls)
    // The shell stays visible; the web view is layered on top.
    // back() returns control to the grid.
  }
}
