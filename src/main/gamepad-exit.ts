/**
 * gamestr-arcade - native-game controller exit watcher.
 *
 * Native AppImage games (e.g. Pallasite) take exclusive X focus, so the
 * launcher's renderer is backgrounded and cannot poll navigator.getGamepads();
 * the web-view preload's gamepad→game:back path only exists for WEB games. That
 * left native games exitable only via the global Escape shortcut - useless on a
 * gamepad-only cabinet with no keyboard.
 *
 * This watcher reads the Linux evdev input devices directly from the MAIN
 * process (which stays alive while the native game runs). A plain read does NOT
 * grab the device (no EVIOCGRAB), so the game still receives every event - we
 * only observe. On a press of a "menu" button (View / Menu / Guide) it invokes
 * the supplied callback, which the caller wires to `Launcher.forceBack()`.
 *
 * Linux-only by nature. On any failure (no `/proc/bus/input/devices`, no
 * readable device, parse error) it degrades silently - the global Escape
 * force-back remains the backstop, and on macOS dev it simply watches nothing.
 */

import { readFile, open as fsOpen } from 'node:fs/promises'

// ── evdev constants ───────────────────────────────────────────────────────────

/** EV_KEY event type (button/key state change). */
export const EV_KEY = 0x01

/**
 * Linux gamepad "menu" button codes (include/uapi/linux/input-event-codes.h).
 * These are firmware/driver-independent semantic codes, unlike the joystick
 * API's driver-assigned button numbers - so the same three codes identify the
 * View/Menu/Guide buttons across controllers.
 *
 *   BTN_SELECT (314) - View / Back / Share   (≙ Standard-Mapping index 8)
 *   BTN_START  (315) - Menu / Start / Options (≙ Standard-Mapping index 9)
 *   BTN_MODE   (316) - Guide / Home / Xbox     (≙ Standard-Mapping index 16)
 */
export const BTN_SELECT = 314
export const BTN_START = 315
export const BTN_MODE = 316
export const MENU_BUTTON_CODES: readonly number[] = [BTN_SELECT, BTN_START, BTN_MODE]

/**
 * Size of `struct input_event` on a 64-bit kernel:
 *   struct timeval time;  // 16 bytes (tv_sec: i64, tv_usec: i64)
 *   __u16 type;           // offset 16
 *   __u16 code;           // offset 18
 *   __s32 value;          // offset 20
 * → 24 bytes total. The booth is x86_64; 32-bit kernels are not supported.
 */
export const INPUT_EVENT_SIZE = 24

/** A decoded evdev record (only the fields we care about). */
export interface InputEventRecord {
  type: number
  code: number
  value: number
}

// ── Pure parsers (unit-tested) ──────────────────────────────────────────────

/**
 * Decode whole `input_event` records from a buffer. Any trailing partial record
 * (fewer than INPUT_EVENT_SIZE bytes) is ignored - the caller buffers the
 * remainder and prepends it to the next chunk.
 */
export function parseInputEvents(buf: Buffer): InputEventRecord[] {
  const out: InputEventRecord[] = []
  const count = Math.floor(buf.length / INPUT_EVENT_SIZE)
  for (let i = 0; i < count; i++) {
    const off = i * INPUT_EVENT_SIZE
    out.push({
      type: buf.readUInt16LE(off + 16),
      code: buf.readUInt16LE(off + 18),
      value: buf.readInt32LE(off + 20),
    })
  }
  return out
}

/** True for a menu/View/Menu/Guide button *press* (value 1; ignores release 0 and autorepeat 2). */
export function isMenuPress(rec: InputEventRecord): boolean {
  return rec.type === EV_KEY && rec.value === 1 && MENU_BUTTON_CODES.includes(rec.code)
}

/**
 * Parse `/proc/bus/input/devices` and return the evdev device basenames for
 * gamepads. A device block is a gamepad iff its `H: Handlers=` line contains a
 * `jsN` token - only joysticks expose the joystick interface, so this reliably
 * excludes keyboards and mice. We watch the block's `eventN` handler (evdev),
 * not the `jsN` one, because evdev carries the standard BTN_ codes.
 *
 * Pure and dependency-free so it can be unit-tested against captured fixtures.
 */
export function parseGamepadEventDevices(procContents: string): string[] {
  const devices: string[] = []
  for (const block of procContents.split(/\n\s*\n/)) {
    const handlerLine = block.split('\n').find(l => l.startsWith('H:'))
    if (!handlerLine) continue
    const handlers = handlerLine.replace(/^H:\s*Handlers=/, '').trim().split(/\s+/)
    if (!handlers.some(h => /^js\d+$/.test(h))) continue
    const eventHandler = handlers.find(h => /^event\d+$/.test(h))
    if (eventHandler) devices.push(eventHandler)
  }
  return devices
}

// ── Watcher ───────────────────────────────────────────────────────────────────

/** Minimal readable-stream surface the watcher needs (so tests can fake it). */
export interface ReadableLike {
  on(event: 'data', cb: (chunk: Buffer) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  destroy(): void
}

/** Injected side-effects, so the watcher is testable without real devices. */
export interface ExitWatcherDeps {
  /** Resolve the gamepad evdev device paths to watch (e.g. ['/dev/input/event8']). */
  listDevices(): Promise<string[]>
  /** Open a device path for streaming reads. */
  openStream(path: string): ReadableLike
  /** Invoked on each menu-button press observed on any watched device. */
  onMenuPress(): void
  /** Optional diagnostic logger (no-op by default). */
  log?(msg: string): void
}

/**
 * Watches gamepad evdev devices for menu-button presses while a game runs.
 *
 * `start()` is idempotent and self-healing: failures to enumerate or open a
 * device are logged and swallowed (other devices still work; the global Escape
 * shortcut remains as a backstop). `stop()` closes every open device fd.
 */
export class GamepadExitWatcher {
  private readonly deps: ExitWatcherDeps
  private streams: ReadableLike[] = []
  private leftovers = new WeakMap<ReadableLike, Buffer>()
  private active = false
  /** Button codes already logged this session - so each is reported once, not per press. */
  private loggedCodes = new Set<number>()

  constructor(deps: ExitWatcherDeps) {
    this.deps = deps
  }

  async start(): Promise<void> {
    if (this.active) return
    this.active = true
    this.loggedCodes.clear()

    let paths: string[] = []
    try {
      paths = await this.deps.listDevices()
    } catch (err) {
      this.deps.log?.(`listDevices failed: ${String(err)}`)
    }
    // A stop() may have raced in while we awaited the device list.
    if (!this.active) return

    for (const path of paths) {
      try {
        const stream = this.deps.openStream(path)
        this.leftovers.set(stream, Buffer.alloc(0))
        stream.on('error', err => this.deps.log?.(`device ${path}: ${String(err)}`))
        stream.on('data', chunk => this.handleChunk(stream, chunk))
        this.streams.push(stream)
        this.deps.log?.(`watching ${path}`)
      } catch (err) {
        this.deps.log?.(`open ${path} failed: ${String(err)}`)
      }
    }
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    for (const stream of this.streams) {
      try {
        stream.destroy()
      } catch {
        // best-effort close
      }
    }
    this.streams = []
  }

  private handleChunk(stream: ReadableLike, chunk: Buffer): void {
    const prev = this.leftovers.get(stream) ?? Buffer.alloc(0)
    const buf = Buffer.concat([prev, chunk])
    const wholeBytes = Math.floor(buf.length / INPUT_EVENT_SIZE) * INPUT_EVENT_SIZE
    this.leftovers.set(stream, buf.subarray(wholeBytes))
    for (const rec of parseInputEvents(buf.subarray(0, wholeBytes))) {
      if (rec.type !== EV_KEY || rec.value !== 1) continue // button presses only
      // Diagnostic: report each distinct button code once per session, so the
      // booth's controller map is discoverable from the journal (which physical
      // button emits which code) without a separate capture tool.
      if (!this.loggedCodes.has(rec.code)) {
        this.loggedCodes.add(rec.code)
        this.deps.log?.(`button code=${rec.code}${MENU_BUTTON_CODES.includes(rec.code) ? ' → MENU (exit)' : ''}`)
      }
      if (isMenuPress(rec)) this.deps.onMenuPress()
    }
  }
}

// ── Production deps ─────────────────────────────────────────────────────────

/**
 * Build real watcher deps backed by `/proc/bus/input/devices` + evdev reads.
 * Used in `src/main/index.ts`; on a non-Linux host the readFile rejects and the
 * watcher simply watches nothing.
 */
export function realExitWatcherDeps(onMenuPress: () => void, log: (msg: string) => void): ExitWatcherDeps {
  return {
    async listDevices() {
      const proc = await readFile('/proc/bus/input/devices', 'utf8')
      return parseGamepadEventDevices(proc).map(ev => `/dev/input/${ev}`)
    },
    openStream(path) {
      return openEvdevStream(path)
    },
    onMenuPress,
    log,
  }
}

/**
 * Open an evdev character device and stream its input_event records via a manual
 * read loop. Preferred over `fs.createReadStream` for `/dev/input/event*`, which
 * are blocking char devices that ReadStream can mishandle (early EOF / no data).
 * Each blocking `read()` returns as soon as the kernel has events; we copy the
 * bytes out and loop. `destroy()` stops the loop and closes the fd.
 */
function openEvdevStream(path: string): ReadableLike {
  const handlers: { data?: (chunk: Buffer) => void; error?: (err: Error) => void } = {}
  let closed = false
  let handle: Awaited<ReturnType<typeof fsOpen>> | null = null

  fsOpen(path, 'r')
    .then(h => {
      if (closed) { void h.close().catch(() => {}); return }
      handle = h
      const buf = Buffer.allocUnsafe(INPUT_EVENT_SIZE * 64)
      const loop = (): void => {
        if (closed || !handle) return
        handle
          .read(buf, 0, buf.length, null)
          .then(({ bytesRead }) => {
            if (closed) return
            if (bytesRead > 0) handlers.data?.(Buffer.from(buf.subarray(0, bytesRead)))
            loop()
          })
          .catch(err => { if (!closed) handlers.error?.(err as Error) })
      }
      loop()
    })
    .catch(err => handlers.error?.(err as Error))

  return {
    on(event, cb) { handlers[event] = cb as never },
    destroy() {
      closed = true
      void handle?.close().catch(() => {})
      handle = null
    },
  }
}
