# gamestr-arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, world-class arcade launcher (an Electron→AppImage kiosk "attract/select" front-screen) that launches native AppImage or web games discovered from a folder, with live gamestr (kind-30762) leaderboard tiles - configured for the BTC Prague 2026 booth as its first instance.

**Architecture:** One Electron app. The **main process** owns OS concerns (kiosk window, child-process launching, filesystem scan, icon extraction). The **renderer** owns the UI (hero carousel, input, audio, attract mode) and the Nostr leaderboard subscription (browser WebSocket). Booth specifics are pure data: a `games/` folder + `arcade.config.json` + a theme. The leaderboard lives behind a `LeaderboardProvider` interface; gamestr/kind-30762 is the first implementation.

**Tech Stack:** TypeScript (ESM, ES2022) · Electron · electron-vite (Vite-based build for main/preload/renderer, HMR) · electron-builder (Linux AppImage) · Vitest (unit tests) · GSAP (motion, now free) · Howler (audio) · raw WebSocket for Nostr (no nostr-tools dependency). Reference implementation to mirror: `pallasite/desktop/` (kiosk + AppImage) and `pallasite/src/score.ts` (leaderboard reader).

**Reference spec:** `docs/superpowers/specs/2026-06-10-gamestr-arcade-design.md`.

---

## Logistics (resolve before/at execution)

- **Dev on macOS** (`npm run dev` via electron-vite) builds and runs the shell and the UI; **web-game launch is testable on macOS**. **Native AppImage spawning + `.DirIcon` extraction + the AppImage build are Linux-only** - verify on the booth Linux laptop (or an Ubuntu CI runner mirroring `pallasite/.github/workflows/desktop-release.yml`). Tasks tagged **[Linux]** must run there.
- **Open spec questions (non-blocking for Phases 0–2):** relay choice on the day (`relay.trotters.cc` only vs add a local relay); who wraps AxeNStax as an AppImage + whether it publishes 30762; day-one line-up + `game` tag ids; AI-generated logos vs official art.

## File Structure

```
gamestr-arcade/
  package.json
  tsconfig.json
  tsconfig.node.json
  electron.vite.config.ts        # electron-vite: main + preload + renderer
  electron-builder.yml           # Linux AppImage target (cloned from pallasite)
  vitest.config.ts
  arcade.config.json             # runtime config (gamesDir, theme, leaderboard, attract)
  resources/
    icon.png                     # the launcher's own AppImage icon
  src/
    shared/
      types.ts                   # Game, GameKind, LeaderboardEntry, LeaderboardProvider, ArcadeConfig
    main/
      index.ts                   # Electron entry: kiosk window, IPC wiring, lifecycle
      config.ts                  # loadConfig(): ArcadeConfig
      scanner.ts                 # scanGames(dir): Promise<Game[]>
      icons.ts                   # resolveIcon(...) + real IconDeps (child_process extractor)
      launch.ts                  # launchNative()/launchWeb() + exit → return-to-grid
    preload/
      index.ts                   # contextBridge: window.arcade API
    renderer/
      index.html
      src/
        main.ts                  # boot UI: fetch games over IPC, build carousel
        ui/
          carousel.ts            # hero carousel + selection model
          input.ts               # keyboard + gamepad → nav events
          audio.ts               # Howler sfx/music
          attract.ts             # idle attract-mode controller
          leaderboard-panel.ts   # render LeaderboardEntry[] for current game
          crt.ts                 # CRT overlay toggle
        leaderboard/
          gamestr-reduce.ts      # PURE: parseScoreEvent, collapseToBest (TDD'd)
          gamestr.ts             # createGamestrProvider() - raw-WS subscription
          profiles.ts            # async kind-0 name/picture resolution
          cache.ts               # localStorage cache of last-known boards
        styles/                  # CSS (theme tokens, carousel, board, crt)
  test/
    scanner.test.ts
    icons.test.ts
    gamestr-reduce.test.ts
    fixtures/
      games/                     # sample folders incl. a web game.json + sibling logos
  games/                         # BOOTH INSTANCE DATA (gitignored; populated per booth)
  systemd/
    gamestr-arcade.service       # Restart=always kiosk unit (booth laptop)
```

**Decomposition rationale:** `gamestr-reduce.ts` (pure) is split from `gamestr.ts` (I/O) so leaderboard logic is unit-testable without a relay. `icons.ts` takes an injected `IconDeps` so the resolve logic is testable on macOS while the real `.DirIcon` extractor is Linux-only. UI files split by responsibility (carousel/input/audio/attract/board/crt), each holdable in context.

---

## Phase 0 - Scaffold & de-risk packaging (do FIRST)

> The scariest unknown is "does it build to a kiosk AppImage and run full-screen on the laptop." Prove that with a near-empty app before building features.

### Task 1: Repo scaffold (electron-vite + TS + Vitest)

**Files:** Create `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `vitest.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.ts`, `.gitignore`.

- [ ] **Step 1: Scaffold via electron-vite**

```bash
cd /Users/darren/WebstormProjects
npm create @quick-start/electron@latest gamestr-arcade -- --template vanilla-ts
cd gamestr-arcade
npm install
npm install -D vitest
npm install gsap howler
npm install -D @types/howler
```

- [ ] **Step 2: Enforce house style** - set `"type": "module"`, `"target": "ES2022"` in `tsconfig.json`; British English in all strings/comments; add `.gitignore` entries: `node_modules/`, `out/`, `dist/`, `games/`, `.DS_Store`, `*.AppImage`.

- [ ] **Step 3: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "electron-vite build && electron-builder --linux AppImage",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } })
```

- [ ] **Step 5: Verify dev boots**

Run: `npm run dev`
Expected: an Electron window opens showing the template page (close it). No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold gamestr-arcade (electron-vite + ts + vitest)"
```

### Task 2: Kiosk window + admin hotkeys (the shell skeleton)

**Files:** Modify `src/main/index.ts`.

- [ ] **Step 1: Replace the main entry with a kiosk window**

```ts
import { app, BrowserWindow, globalShortcut } from 'electron'
import { join } from 'node:path'

const isDev = !!process.env.ELECTRON_RENDERER_URL

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: process.env.ARCADE_KIOSK !== '0',
    backgroundColor: '#05070f',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  const win = createWindow()
  // Admin escape hatches so a booth operator is never trapped.
  globalShortcut.register('CommandOrControl+Q', () => app.quit())
  globalShortcut.register('F5', () => win.webContents.reload())
})

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => globalShortcut.unregisterAll())
```

- [ ] **Step 2: Verify full-screen kiosk + Ctrl+Q**

Run: `npm run dev`
Expected: full-screen window, no menu bar; `Ctrl+Q` quits. (Run with `ARCADE_KIOSK=0 npm run dev` for a normal window while developing.)

- [ ] **Step 3: Commit** - `git commit -am "feat: kiosk window + admin hotkeys"`

### Task 3: [Linux] Build the AppImage and run it on the laptop

**Files:** Create `electron-builder.yml`, `resources/icon.png`.

- [ ] **Step 1: Create `electron-builder.yml`** (mirrors `pallasite/desktop/electron-builder.yml`)

```yaml
appId: dev.forgesworn.gamestr-arcade
productName: gamestr arcade
directories:
  output: release
  buildResources: resources
files:
  - out/**
linux:
  target: [AppImage]
  category: Game
  icon: resources/icon.png
  artifactName: gamestr-arcade-${version}-${arch}.AppImage
```

- [ ] **Step 2: [Linux] Build**

Run (on the booth Linux laptop or Ubuntu CI): `npm run dist`
Expected: `release/gamestr-arcade-0.0.0-x86_64.AppImage` produced.

- [ ] **Step 3: [Linux] Smoke-run** - `chmod +x release/*.AppImage && ./release/gamestr-arcade-*.AppImage`
Expected: boots full-screen kiosk; `Ctrl+Q` quits. **Packaging is now de-risked.**

- [ ] **Step 4: Commit** - `git commit -am "build: linux AppImage target"`

---

## Phase 1 - Core modules (TDD, parallelisable)

> Tasks 4–8 are independent and can be built by parallel subagents. They share only `src/shared/types.ts` (Task 4), which must land first.

### Task 4: Shared types (land first - everything imports these)

**Files:** Create `src/shared/types.ts`.

- [ ] **Step 1: Define the contracts**

```ts
export type GameKind = 'appimage' | 'web'

export interface Game {
  id: string            // stable slug (folder or filename)
  name: string
  tagline?: string
  kind: GameKind
  exec?: string         // absolute .AppImage path (kind === 'appimage')
  url?: string          // web url (kind === 'web')
  gameId: string        // kind-30762 `game` tag value (leaderboard key)
  tHints?: string[]     // optional `#t` server-side filter hints; defaults to [gameId]
  logo: string          // absolute path to resolved logo png
  hero?: string         // absolute path to hero png|mp4
  accent?: string       // hex colour
  sounds?: { music?: string; voice?: string }
  order: number
}

export interface LeaderboardEntry {
  pubkey: string        // hex (player)
  name?: string         // resolved from kind-0, async
  picture?: string
  score: number
  sats?: number
  at: number            // unix seconds
}

export interface LeaderboardProvider {
  // Returns an unsubscribe fn. onUpdate fires with the current top-N whenever it changes.
  subscribe(gameId: string, onUpdate: (top: LeaderboardEntry[]) => void): () => void
}

export interface ArcadeConfig {
  gamesDir: string
  theme: { title: string; wordmark?: string; accent: string; crt: boolean }
  attractTimeoutMs: number
  kiosk: boolean
  leaderboard:
    | { provider: 'none' }
    | { provider: 'gamestr'; relays: string[]; topN: number }
}
```

- [ ] **Step 2: Typecheck** - `npm run typecheck` → Expected: passes.
- [ ] **Step 3: Commit** - `git add src/shared/types.ts && git commit -m "feat: shared types"`

### Task 5: Config loader

**Files:** Create `src/main/config.ts`, `arcade.config.json`. Test: `test/config.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseConfig, DEFAULT_CONFIG } from '../src/main/config'

describe('parseConfig', () => {
  it('fills defaults when fields are missing', () => {
    const c = parseConfig({})
    expect(c.theme.title).toBe(DEFAULT_CONFIG.theme.title)
    expect(c.leaderboard.provider).toBe('none')
    expect(c.attractTimeoutMs).toBe(20000)
  })
  it('keeps a gamestr provider with relays', () => {
    const c = parseConfig({ leaderboard: { provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 } })
    expect(c.leaderboard).toEqual({ provider: 'gamestr', relays: ['wss://relay.trotters.cc'], topN: 5 })
  })
})
```

- [ ] **Step 2: Run → FAIL** - `npx vitest run test/config.test.ts` → "Cannot find module".

- [ ] **Step 3: Implement**

```ts
import type { ArcadeConfig } from '../shared/types'

export const DEFAULT_CONFIG: ArcadeConfig = {
  gamesDir: 'games',
  theme: { title: 'gamestr arcade', accent: '#7cf3ff', crt: true },
  attractTimeoutMs: 20000,
  kiosk: true,
  leaderboard: { provider: 'none' }
}

export function parseConfig(raw: unknown): ArcadeConfig {
  const o = (typeof raw === 'object' && raw) ? raw as Record<string, any> : {}
  const lb = o.leaderboard
  const leaderboard: ArcadeConfig['leaderboard'] =
    lb?.provider === 'gamestr' && Array.isArray(lb.relays)
      ? { provider: 'gamestr', relays: lb.relays, topN: Number(lb.topN) || 5 }
      : { provider: 'none' }
  return {
    gamesDir: typeof o.gamesDir === 'string' ? o.gamesDir : DEFAULT_CONFIG.gamesDir,
    theme: {
      title: o.theme?.title ?? DEFAULT_CONFIG.theme.title,
      wordmark: o.theme?.wordmark,
      accent: o.theme?.accent ?? DEFAULT_CONFIG.theme.accent,
      crt: o.theme?.crt ?? DEFAULT_CONFIG.theme.crt
    },
    attractTimeoutMs: Number(o.attractTimeoutMs) || DEFAULT_CONFIG.attractTimeoutMs,
    kiosk: o.kiosk ?? DEFAULT_CONFIG.kiosk,
    leaderboard
  }
}
```

- [ ] **Step 4: Run → PASS** - `npx vitest run test/config.test.ts`.
- [ ] **Step 5: Commit** - `git commit -am "feat: arcade config loader with defaults"`

### Task 6: Game scanner

**Files:** Create `src/main/scanner.ts`. Test: `test/scanner.test.ts`, `test/fixtures/games/`.

- [ ] **Step 1: Create fixtures** - `test/fixtures/games/neon/game.json` = `{ "name": "Neon Sentinel", "url": "https://example.test/neon", "gameId": "neon-sentinel", "order": 2 }` plus `test/fixtures/games/neon/logo.png` (any small png); and `test/fixtures/games/zzz-empty/` (empty folder, must be skipped).

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { scanGames } from '../src/main/scanner'
import { join } from 'node:path'

const DIR = join(__dirname, 'fixtures/games')

describe('scanGames', () => {
  it('reads a web game from game.json and skips empty folders', async () => {
    const games = await scanGames(DIR)
    const neon = games.find(g => g.id === 'neon')
    expect(neon).toBeTruthy()
    expect(neon!.kind).toBe('web')
    expect(neon!.url).toBe('https://example.test/neon')
    expect(neon!.gameId).toBe('neon-sentinel')
    expect(games.find(g => g.id === 'zzz-empty')).toBeUndefined()
  })
  it('sorts by order then name', async () => {
    const games = await scanGames(DIR)
    expect(games.map(g => g.order)).toEqual([...games.map(g => g.order)].sort((a, b) => a - b))
  })
})
```

- [ ] **Step 3: Run → FAIL** - `npx vitest run test/scanner.test.ts`.

- [ ] **Step 4: Implement** (icon resolution is injected so the scanner stays testable; the main process wires the real resolver in Task 7)

```ts
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Game } from '../shared/types'

const APPIMAGE_RE = /\.AppImage$/i
function prettify(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
async function firstAppImage(dir: string): Promise<string | undefined> {
  const entries = await readdir(dir)
  const hit = entries.find(e => APPIMAGE_RE.test(e))
  return hit ? join(dir, hit) : undefined
}
async function readJson(path: string): Promise<Record<string, any> | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}
async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

export type LogoResolver = (g: { slug: string; appImagePath?: string; siblingLogo?: string }) => Promise<string>
const passthroughLogo: LogoResolver = async g => g.siblingLogo ?? ''

export async function scanGames(gamesDir: string, resolveLogo: LogoResolver = passthroughLogo): Promise<Game[]> {
  let entries: string[] = []
  try { entries = await readdir(gamesDir) } catch { return [] }
  const games: Game[] = []

  for (const entry of entries) {
    const full = join(gamesDir, entry)
    const info = await stat(full).catch(() => null)
    if (!info) continue

    // Loose top-level *.AppImage → native game, slug from filename.
    if (info.isFile() && APPIMAGE_RE.test(entry)) {
      const slug = entry.replace(APPIMAGE_RE, '')
      games.push(await build(slug, gamesDir, { kind: 'appimage', exec: full }, null, resolveLogo, undefined))
      continue
    }
    if (!info.isDirectory()) continue

    const meta = await readJson(join(full, 'game.json'))
    const appImage = await firstAppImage(full)
    if (appImage) {
      games.push(await build(entry, full, { kind: 'appimage', exec: appImage }, meta, resolveLogo, appImage))
    } else if (meta?.url) {
      games.push(await build(entry, full, { kind: 'web', url: meta.url }, meta, resolveLogo, undefined))
    } // else: neither AppImage nor url → skip (empty/placeholder folder)
  }
  return games.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

async function build(
  slug: string, dir: string,
  launch: { kind: 'appimage'; exec: string } | { kind: 'web'; url: string },
  meta: Record<string, any> | null, resolveLogo: LogoResolver, appImagePath?: string
): Promise<Game> {
  const siblingLogo = (await exists(join(dir, 'logo.png'))) ? join(dir, 'logo.png') : undefined
  const heroPng = join(dir, 'hero.png'); const heroMp4 = join(dir, 'hero.mp4')
  const hero = (await exists(heroPng)) ? heroPng : (await exists(heroMp4)) ? heroMp4 : undefined
  const gameId = meta?.gameId ?? slug
  return {
    id: slug,
    name: meta?.name ?? prettify(slug),
    tagline: meta?.tagline,
    ...launch,
    gameId,
    tHints: meta?.tHints,
    logo: await resolveLogo({ slug, appImagePath, siblingLogo }),
    hero,
    accent: meta?.accent,
    sounds: { music: (await exists(join(dir, 'music.ogg'))) ? join(dir, 'music.ogg') : undefined,
              voice: (await exists(join(dir, 'voice.ogg'))) ? join(dir, 'voice.ogg') : undefined },
    order: typeof meta?.order === 'number' ? meta.order : 999
  }
}
```

- [ ] **Step 5: Run → PASS** - `npx vitest run test/scanner.test.ts`.
- [ ] **Step 6: Commit** - `git commit -am "feat: game folder scanner (appimage + web, injected logo resolver)"`

### Task 7: Icon resolver (injectable deps; real extractor is [Linux])

**Files:** Create `src/main/icons.ts`. Test: `test/icons.test.ts`.

- [ ] **Step 1: Write the failing test** (tests the decision logic with fake deps - no real AppImage needed)

```ts
import { describe, it, expect } from 'vitest'
import { resolveIcon, type IconDeps } from '../src/main/icons'

function deps(over: Partial<IconDeps>): IconDeps {
  return {
    exists: async () => false,
    mtime: async () => 0,
    extractDirIcon: async () => false,
    placeholder: (slug) => `/placeholder/${slug}.png`,
    ...over
  }
}

describe('resolveIcon', () => {
  it('prefers a sibling logo.png when present', async () => {
    const out = await resolveIcon({ slug: 'a', siblingLogo: '/g/a/logo.png' }, '/cache', deps({ exists: async p => p === '/g/a/logo.png' }))
    expect(out).toBe('/g/a/logo.png')
  })
  it('uses cached png when fresh (cache mtime >= appimage mtime)', async () => {
    const out = await resolveIcon({ slug: 'a', appImagePath: '/g/a.AppImage' }, '/cache',
      deps({ exists: async p => p === '/cache/a.png', mtime: async p => (p === '/cache/a.png' ? 200 : 100) }))
    expect(out).toBe('/cache/a.png')
  })
  it('extracts then returns cache png when no cache exists', async () => {
    let extracted = false
    const out = await resolveIcon({ slug: 'a', appImagePath: '/g/a.AppImage' }, '/cache',
      deps({ extractDirIcon: async () => { extracted = true; return true } }))
    expect(extracted).toBe(true)
    expect(out).toBe('/cache/a.png')
  })
  it('falls back to placeholder when extraction fails', async () => {
    const out = await resolveIcon({ slug: 'a', appImagePath: '/g/a.AppImage' }, '/cache', deps({}))
    expect(out).toBe('/placeholder/a.png')
  })
})
```

- [ ] **Step 2: Run → FAIL** - `npx vitest run test/icons.test.ts`.

- [ ] **Step 3: Implement decision logic + real deps**

```ts
import { join } from 'node:path'
import { stat, mkdir, copyFile, readlink } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

export interface IconDeps {
  exists(path: string): Promise<boolean>
  mtime(path: string): Promise<number>
  extractDirIcon(appImagePath: string, outPng: string): Promise<boolean>
  placeholder(slug: string): string
}

export async function resolveIcon(
  game: { slug: string; appImagePath?: string; siblingLogo?: string },
  cacheDir: string, deps: IconDeps
): Promise<string> {
  if (game.siblingLogo && await deps.exists(game.siblingLogo)) return game.siblingLogo
  if (game.appImagePath) {
    const cachePng = join(cacheDir, `${game.slug}.png`)
    if (await deps.exists(cachePng) && await deps.mtime(cachePng) >= await deps.mtime(game.appImagePath)) return cachePng
    if (await deps.extractDirIcon(game.appImagePath, cachePng)) return cachePng
  }
  return deps.placeholder(game.slug)
}

// Real deps (Linux for extractDirIcon; the rest are cross-platform).
export const realIconDeps = (placeholderPng: string): IconDeps => ({
  exists: async p => { try { await stat(p); return true } catch { return false } },
  mtime: async p => { try { return (await stat(p)).mtimeMs } catch { return 0 } },
  placeholder: () => placeholderPng,
  // `<appimage> --appimage-extract .DirIcon` writes ./squashfs-root/.DirIcon (often a PNG symlink).
  async extractDirIcon(appImagePath, outPng) {
    try {
      const work = join(tmpdir(), `arcade-icon-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      await mkdir(work, { recursive: true })
      await new Promise<void>((res, rej) => {
        const p = spawn(appImagePath, ['--appimage-extract', '.DirIcon'], { cwd: work, stdio: 'ignore' })
        p.on('error', rej); p.on('exit', code => code === 0 ? res() : rej(new Error(`extract ${code}`)))
      })
      let icon = join(work, 'squashfs-root', '.DirIcon')
      try { const target = await readlink(icon); icon = join(work, 'squashfs-root', target) } catch { /* not a symlink */ }
      // Only accept PNG (magic bytes 89 50 4E 47); SVG/other → fall back to placeholder.
      const { readFile, writeFile } = await import('node:fs/promises')
      const buf = await readFile(icon)
      if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) return false
      await mkdir(cacheDirOf(outPng), { recursive: true }); await writeFile(outPng, buf)
      return true
    } catch { return false }
  }
})
function cacheDirOf(file: string): string { return file.slice(0, file.lastIndexOf('/')) }
```

- [ ] **Step 4: Run → PASS** - `npx vitest run test/icons.test.ts`.
- [ ] **Step 5: [Linux] Integration check** - point `realIconDeps` at a real `Pallasite-*.AppImage`; confirm a `<slug>.png` lands in the cache dir and looks correct.
- [ ] **Step 6: Commit** - `git commit -am "feat: icon resolver (.DirIcon extract + cache + fallbacks)"`

### Task 8: gamestr leaderboard - pure reducer (TDD'd) + provider

**Files:** Create `src/renderer/src/leaderboard/gamestr-reduce.ts`, `gamestr.ts`. Test: `test/gamestr-reduce.test.ts`.

- [ ] **Step 1: Write the failing test** (ports the exact rules from `pallasite/src/score.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { parseScoreEvent, collapseToBest, type ScoreEvent } from '../src/renderer/src/leaderboard/gamestr-reduce'

const P1 = 'a'.repeat(64), P2 = 'b'.repeat(64), GAME = 'g'.repeat(64)
function ev(over: Partial<ScoreEvent>): ScoreEvent {
  return { id: 'i', pubkey: GAME, kind: 30762, created_at: 100, content: '', sig: 's',
    tags: [['game', 'pallasite'], ['p', P1], ['score', '500']], ...over }
}

describe('parseScoreEvent', () => {
  it('parses a valid game-signed event (player from p tag)', () => {
    const e = parseScoreEvent(ev({}), 'pallasite')!
    expect(e.pubkey).toBe(P1); expect(e.score).toBe(500)
  })
  it('rejects wrong game, cheated, and non-positive scores', () => {
    expect(parseScoreEvent(ev({ tags: [['game', 'other'], ['p', P1], ['score', '500']] }), 'pallasite')).toBeNull()
    expect(parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['cheated', 'true'], ['p', P1], ['score', '9']] }), 'pallasite')).toBeNull()
    expect(parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '0']] }), 'pallasite')).toBeNull()
  })
  it('falls back to event.pubkey when no p tag', () => {
    const e = parseScoreEvent(ev({ pubkey: P2, tags: [['game', 'pallasite'], ['score', '10']] }), 'pallasite')!
    expect(e.pubkey).toBe(P2)
  })
})

describe('collapseToBest', () => {
  it('keeps highest score per pubkey, sorts desc, slices topN', () => {
    const events = [
      ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '300']] }),
      ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '900']] }),
      ev({ tags: [['game', 'pallasite'], ['p', P2], ['score', '500']] })
    ]
    const top = collapseToBest(events, 'pallasite', 5)
    expect(top.map(e => [e.pubkey, e.score])).toEqual([[P1, 900], [P2, 500]])
  })
})
```

- [ ] **Step 2: Run → FAIL** - `npx vitest run test/gamestr-reduce.test.ts`.

- [ ] **Step 3: Implement the pure reducer**

```ts
import type { LeaderboardEntry } from '../../../shared/types'

export interface ScoreEvent {
  id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][]; sig: string
}
export function isScoreEvent(v: unknown): v is ScoreEvent {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return e.kind === 30762 && typeof e.id === 'string' && typeof e.pubkey === 'string'
    && typeof e.created_at === 'number' && Array.isArray(e.tags)
}
function tagValue(tags: string[][], name: string): string | undefined {
  for (const t of tags) if (t[0] === name && typeof t[1] === 'string') return t[1]
  return undefined
}
function hasTagValue(tags: string[][], name: string, value: string): boolean {
  return tags.some(t => t[0] === name && t[1] === value)
}

/** Port of pallasite/src/score.ts `consider`: game match, not cheated, score>0, player from `p` or pubkey. */
export function parseScoreEvent(e: ScoreEvent, gameId: string): LeaderboardEntry | null {
  if (!hasTagValue(e.tags, 'game', gameId)) return null
  if (hasTagValue(e.tags, 'cheated', 'true')) return null
  const score = parseInt(tagValue(e.tags, 'score') ?? '', 10)
  if (!Number.isFinite(score) || score <= 0) return null
  const pubkey = tagValue(e.tags, 'p') ?? e.pubkey
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) return null
  return { pubkey, score, sats: parseInt(tagValue(e.tags, 'sats') ?? '0', 10) || 0, at: e.created_at }
}

export function collapseToBest(events: ScoreEvent[], gameId: string, topN: number): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>()
  for (const raw of events) {
    const e = parseScoreEvent(raw, gameId); if (!e) continue
    const cur = best.get(e.pubkey); if (cur && cur.score >= e.score) continue
    best.set(e.pubkey, e)
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN)
}
```

- [ ] **Step 4: Run → PASS** - `npx vitest run test/gamestr-reduce.test.ts`.

- [ ] **Step 5: Implement the provider** (raw-WS subscription, debounced; mirrors `subscribeGlobalHighScores`)

```ts
import type { LeaderboardEntry, LeaderboardProvider } from '../../../shared/types'
import { isScoreEvent, parseScoreEvent, type ScoreEvent } from './gamestr-reduce'

export function createGamestrProvider(relays: string[], topN: number): LeaderboardProvider {
  return {
    subscribe(gameId, onUpdate) {
      if (relays.length === 0) { setTimeout(() => onUpdate([]), 0); return () => {} }
      const sockets: WebSocket[] = []
      const best = new Map<string, LeaderboardEntry>()
      let closed = false, pending: ReturnType<typeof setTimeout> | null = null
      const tHints = [gameId]
      const emit = () => {
        if (closed || pending) return
        pending = setTimeout(() => {
          pending = null; if (closed) return
          onUpdate(Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, topN))
        }, 200)
      }
      const consider = (e: ScoreEvent) => {
        const entry = parseScoreEvent(e, gameId); if (!entry) return
        const cur = best.get(entry.pubkey); if (cur && cur.score >= entry.score) return
        best.set(entry.pubkey, entry); emit()
      }
      for (const url of relays) {
        let ws: WebSocket; try { ws = new WebSocket(url) } catch { continue }
        sockets.push(ws)
        const subId = 'lb' + Math.random().toString(36).slice(2, 10)
        ws.onopen = () => ws.send(JSON.stringify(['REQ', subId, { kinds: [30762], '#t': tHints, limit: 200 }]))
        ws.onmessage = ev => {
          let msg: unknown; try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
          if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[1] === subId && isScoreEvent(msg[2])) consider(msg[2])
        }
        ws.onerror = () => {}
      }
      return () => { closed = true; if (pending) clearTimeout(pending); sockets.forEach(s => { try { s.close() } catch {} }) }
    }
  }
}
```

- [ ] **Step 6: Commit** - `git commit -am "feat: gamestr (kind-30762) leaderboard reducer + provider"`

---

## Phase 2 - Renderer / UI (world-class; frontend-design-driven, visual verification)

> **Build with the `frontend-design` skill** to hit the world-class bar and avoid generic AI aesthetics. UI is animation-heavy: verify **visually** (manual acceptance below) rather than with fabricated unit tests. Run dev windowed: `ARCADE_KIOSK=0 npm run dev`. Each task ends in a commit.

### Task 9: IPC bridge + boot the games list

**Files:** `src/preload/index.ts`, `src/main/index.ts` (wire `ipcMain.handle('games:list')` calling `scanGames` + `resolveIcon`), `src/renderer/src/main.ts`.

- [ ] **Step 1:** In preload, expose `window.arcade = { listGames: () => ipcRenderer.invoke('games:list'), launch: (id) => ipcRenderer.invoke('game:launch', id), onReturn: (cb) => ipcRenderer.on('game:returned', cb) }` via `contextBridge`.
- [ ] **Step 2:** In main, register `ipcMain.handle('games:list', () => scanGames(absoluteGamesDir, logoResolver))` where `logoResolver` calls `resolveIcon(..., realIconDeps(placeholder))`. Convert local file paths to `file://` (or register a custom protocol) so the renderer can load logos/heroes.
- [ ] **Step 3:** In renderer `main.ts`, `const games = await window.arcade.listGames()` and render a temporary `<pre>` of names. **Acceptance:** running with a populated `games/` shows the game names. **Commit.**

### Task 10: Hero carousel (the centrepiece)

**Files:** `src/renderer/src/ui/carousel.ts`, `styles/carousel.css`.

- [ ] **Step 1:** Implement a selection model: `class Carousel { constructor(games: Game[], host: HTMLElement); select(index): void; next(): void; prev(): void; current(): Game; onChange(cb: (g: Game) => void): void }`.
- [ ] **Step 2:** Render full-bleed hero (`hero` image/video or a tinted fallback from `accent`/`logo`), the big `logo`, `name` + `tagline`, and a "PRESS ⏎ / Ⓐ TO PLAY" prompt. Below: a filmstrip of neighbours + page dots.
- [ ] **Step 3:** Animate transitions with GSAP - hero cross-fade + slide, logo pop, parallax; honour `prefers-reduced-motion`.
- [ ] **Acceptance (visual):** moving selection slides smoothly at 60fps; the accent colour themes the active frame; missing hero/logo degrades gracefully. **Commit.**

### Task 11: Input - keyboard (primary) + gamepad (additive)

**Files:** `src/renderer/src/ui/input.ts`.

- [ ] **Step 1:** Keyboard: `ArrowLeft/ArrowRight` → prev/next, `Enter` → launch, `Escape` → back (from web game), `F5`/`Ctrl+Q` already global. Map to carousel methods.
- [ ] **Step 2:** Gamepad via `requestAnimationFrame` polling `navigator.getGamepads()`: d-pad/stick → prev/next (with repeat-debounce), button 0 (A) → launch, button 9 (Start) → back. 
- [ ] **Acceptance (manual):** full navigation by keyboard; if a gamepad is plugged, it drives the same actions. **Commit.**

### Task 12: Audio - move/select/back + attract music

**Files:** `src/renderer/src/ui/audio.ts`, `src/renderer/theme/` (royalty-free `move.ogg`, `select.ogg`, `back.ogg`, `attract.ogg`).

- [ ] **Step 1:** Wrap Howler: `playMove()`, `playSelect()`, `playBack()`, `startAttractMusic()/stopAttractMusic()`; respect a `muted` flag. Source SFX from a royalty-free pack (e.g. Kenny.nl arcade UI). Optional per-game `sounds.music` plays on highlight.
- [ ] **Step 2:** Wire to carousel events (move→playMove, launch→playSelect). 
- [ ] **Acceptance (manual):** a crisp whoosh on move, a chunk-chime on select; no audio glitching on rapid navigation. **Commit.**

### Task 13: Attract mode

**Files:** `src/renderer/src/ui/attract.ts`.

- [ ] **Step 1:** After `config.attractTimeoutMs` of no input, enter attract: auto-advance the carousel on an interval, start attract music, show a blinking "PRESS START". Any key/gamepad/pointer input exits attract and stops the music.
- [ ] **Acceptance (manual):** idle → attract cycles; pressing anything returns to normal browse instantly. **Commit.**

### Task 14: Leaderboard panel + CRT overlay

**Files:** `src/renderer/src/ui/leaderboard-panel.ts`, `src/renderer/src/ui/crt.ts`, `src/renderer/src/leaderboard/profiles.ts`, `cache.ts`, `styles/board.css`, `styles/crt.css`.

- [ ] **Step 1:** On carousel change, if `config.leaderboard.provider === 'gamestr'`, `subscribe(currentGame.gameId, render)` via `createGamestrProvider(relays, topN)`; unsubscribe on change. Render rank · player · score (sats). Empty → "Be the first - play to claim the top spot."
- [ ] **Step 2:** `profiles.ts`: async kind-0 resolution - raw-WS `REQ {kinds:[0], authors:[...]}`, fill `name`/`picture`, re-render. Until resolved, show shortened npub + a deterministic avatar.
- [ ] **Step 3:** `cache.ts`: persist the last-known board per gameId to `localStorage`; render cache instantly on select, then live data replaces it. Show a subtle "reconnecting" dot when no socket is open.
- [ ] **Step 4:** `crt.ts`: a toggleable scanline/vignette overlay (CSS), gated by `config.theme.crt`.
- [ ] **Acceptance (manual):** with `relay.trotters.cc` reachable, Pallasite's tile shows a live board that updates when a new score lands; offline shows the cache + empty state; CRT toggles. **Commit.**

---

## Phase 3 - Launch integration

### Task 15: Native AppImage launch + return-to-grid

**Files:** `src/main/launch.ts`, wire `ipcMain.handle('game:launch')` in `src/main/index.ts`.

- [ ] **Step 1:** `launchNative(win, game)`: `chmod +x` the AppImage; `const child = spawn(game.exec, [], { detached: false })`; hide the launcher window; on `child.on('exit')` → show + focus the window and `win.webContents.send('game:returned')`. On `child.on('error')` → keep the window, send an error to toast.
- [ ] **Step 2:** Single-flight guard: ignore launch requests while a child is running.
- [ ] **Acceptance (manual, [Linux]):** select Pallasite → it launches full-screen; quit it → arcade reappears on the grid; a bad path shows a toast, not a crash. **Commit.**

### Task 16: Web game launch + back

**Files:** `src/main/launch.ts` (web branch), `src/renderer` web-view handling.

- [ ] **Step 1:** `launchWeb(win, game)`: load `game.url` into a full-screen `WebContentsView` (or a second BrowserWindow) layered over the grid; show a persistent "Start/Esc = menu" hint; `Escape`/Start → close the view and return to the grid.
- [ ] **Step 2:** On load failure (offline), show a clear message and a "back" affordance; never hang.
- [ ] **Acceptance (manual):** a web tile opens the game full-screen; Esc returns; offline shows a message. **Commit.**

---

## Phase 4 - Booth instance & robustness

### Task 17: BTC Prague config + games folder

**Files:** `arcade.config.json`, `games/<slug>/…` (booth data; gitignored), bootstrapped art.

- [ ] **Step 1:** Write `arcade.config.json`: `theme.title = "gamestr arcade"`, `leaderboard = { provider: "gamestr", relays: ["wss://relay.trotters.cc", "wss://nos.lol", "wss://relay.damus.io"], topN: 5 }`, `attractTimeoutMs: 20000`, `theme.crt: true`. **(Confirm the relay list per the open question - add a local relay if chosen.)**
- [ ] **Step 2:** Populate `games/pallasite/` (the real Pallasite AppImage + `game.json {"gameId":"pallasite","tagline":"Cosmic arcade Asteroids"}` + bootstrapped `logo.png`/`hero.png`), and folders for AxeNStax / Hash Dash / Satori Rush (AppImage when wrapped, else `game.json {url}` to a locally-hosted build). **Confirm gameIds.**
- [ ] **Step 3:** Bootstrap art: start from `axenstax/screenshot.png`, `pallasite/desktop/build/icon.png`, game screenshots; AI-generate hero backdrops + logos where missing; graceful fallback already handles gaps. **Acceptance:** every tile shows a logo + hero; boards render. **Commit (config only - `games/` is gitignored).**

### Task 18: Crash-recovery kiosk service ([Linux])

**Files:** `systemd/gamestr-arcade.service`.

- [ ] **Step 1:** Write a user systemd unit: `Restart=always`, `RestartSec=2`, `ExecStart=/path/gamestr-arcade-*.AppImage`, env `ARCADE_KIOSK=1`; disable screen blanking/sleep on the laptop (ops note in the unit comments).
- [ ] **Step 2: [Linux]** Install + start; kill the process → confirm it relaunches to the grid within seconds (never a black screen). **Commit.**

### Task 19: Full booth smoke test ([Linux])

- [ ] **Step 1:** End-to-end on the laptop: boot → attract → browse with keyboard + gamepad → launch native (Pallasite) → return → launch web tile → return → observe a live board update after a real play → pull network → confirm games still launch + boards show cache/empty. Record any issues as follow-up tasks.
- [ ] **Step 2:** Build the final AppImage (`npm run dist`), copy to the booth laptop, install the service. **Commit any fixes.**

---

## Self-Review

**1. Spec coverage**
- §1 generic launcher / booth-as-instance → Tasks 4, 17. §2 generic+world-class goals → injected deps (6,7), `LeaderboardProvider` (4,8), frontend-design (Phase 2). §3 Electron approach → Phase 0. §4 components → Tasks 4–16 (one module each). §5 discovery model → Task 6 (folder + loose AppImage + game.json) & Task 7 (`.DirIcon` + sibling + placeholder). §6 gamestr provider → Task 8 + Task 14. §7 UX/input → Tasks 10–13. §8 lifecycle/robustness → Tasks 15, 16, 18. §9 assets → Task 17. §10 build/dev → Phase 0 + Task 19. §11 testing → Tasks 5–8 (unit) + Linux integration/smoke (7,15,19). §12 milestones → Phases map M1=Phase 0+1+ Tasks 10/11/15, M2=12/13/14(crt), M3=14, M4=16/17. §13 open questions → Logistics + Task 17 notes. **No gaps.**

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" in code steps; the only deferred items are the four **spec open questions**, surfaced explicitly as decisions (relay list, gameIds, AxeNStax wrap, art) - these are inputs to confirm, not unwritten code. UI tasks use visual acceptance criteria by design (animation isn't unit-testable), not vague "add tests".

**3. Type consistency:** `Game`, `LeaderboardEntry`, `LeaderboardProvider`, `ArcadeConfig` defined once in Task 4 and used unchanged in 5/6/7/8/14. `scanGames(dir, resolveLogo)` signature matches its IPC wiring (Task 9). `resolveIcon(game, cacheDir, deps)` matches its test and the real-deps wiring. `createGamestrProvider(relays, topN).subscribe(gameId, onUpdate)` matches the `LeaderboardProvider` interface and Task 14 usage. `parseScoreEvent`/`collapseToBest` names match between test and impl. Consistent.

---

## Execution notes (cut-order under deadline)

The conference is **11–13 June** (tomorrow). Floor = **M1**: Phase 0 + Tasks 4,6,7,9,10,11,15 (+ Task 3 AppImage on Linux). Then layer M2 (12,13,14-CRT), M3 (14-board), M4 (16,17). If time runs short, cut in reverse: M4 web → M3 board polish → M2 attract. Phases 0–1 and the Phase-2 UI files are largely independent → dispatch parallel subagents after Task 4 lands.
