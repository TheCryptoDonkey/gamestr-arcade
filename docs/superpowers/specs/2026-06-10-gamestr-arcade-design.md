# gamestr-arcade — design

**Date:** 2026-06-10
**Status:** DRAFT — for review
**Context:** BTC Prague 2026 booth (11–13 June, PVA Expo Praha). Today is 10 June — this is a **build-today** job. The arcade front-screen is booth polish on top of the games; it must degrade gracefully and never strand the booth on a black screen.

---

## 1. Purpose

A **generic, world-class arcade launcher** — an arcade-cabinet-style "attract / select" front-screen that launches a configurable line-up of games (each a native Linux **AppImage** or a **web game**) and shows a live leaderboard beside each. The launcher core is **game-agnostic**: it knows nothing about any specific game, relay, or brand — everything comes from a `games/` folder, a theme, and `arcade.config.json`. The **BTC Prague 2026 booth is the first configured instance** — "gamestr arcade": the gamestr line-up (Pallasite, AxeNStax, Hash Dash, Satori Rush, …) with a gamestr leaderboard provider on `relay.trotters.cc`. The selector itself ships as a Linux **AppImage**; the booth machine is a **Linux laptop**, navigated **keyboard-first** (gamepad optional).

The pitch to the floor: *self-sovereign identity + play-to-earn-sats, made visible* — you watch someone's npub and score land on the big screen seconds after they play.

## 2. Goals / non-goals

**Goals**
- **Generic & reusable** — no hardcoded games, relays, branding, or leaderboard backend. Everything is data: a `games/` folder, a theme, an `arcade.config.json`, and a pluggable **leaderboard provider**. Point it at any set of AppImages / web games and it works.
- **World-class craft** — motion, typography, audio, and robustness at a shippable-product bar, not a demo hack; deliberately avoids generic AI aesthetics (UI built with the `frontend-design` skill).
- A genuinely gorgeous, "official-looking" arcade selector (hero carousel, motion, sound, attract mode).
- Launch a native `.AppImage` **or** a web game, full-screen kiosk, and return cleanly to the grid on exit.
- **Auto-discover** games by dropping them into a `games/` folder; logo comes from the AppImage's embedded icon with optional art overrides.
- **Live leaderboard tiles** per game (kind 30762), updating as scores land.
- Offline-robust: never depends on conference wifi to *launch* games, and degrades leaderboards gracefully.
- Ship as a self-contained Linux AppImage; trivial to add a game on the day.

**Non-goals (post-Prague / explicitly out)**
- Publishing scores — the *games* publish kind 30762; the arcade only **reads**.
- Sign-in / accounts / payments in the launcher.
- Touchscreen, multi-cabinet sync, remote game catalogue, per-game settings UI.
- Video heroes / GPU shaders beyond a CRT overlay (polish-if-time, not core).

## 3. Approach

**Electron shell → AppImage via electron-builder, modelled on `pallasite/desktop/`.** That sibling already proves every hard part: an Electron kiosk `BrowserWindow`, `globalShortcut`, `child_process.spawn`, and a working `electron-builder.yml` Linux AppImage target. Web tech (CSS/WebGL + a small audio lib) is the fastest route to the "big high-res graphics + sound" look, and the same window trivially hosts an embedded web-game view.

**Rejected:** *Tauri* (no reference here; cross-building a Linux AppImage from macOS is fiddly — too risky for one day). *Kiosk-browser + exec helper* (a browser can't spawn native AppImages, so it needs a local socket helper that is just Electron's main process reinvented; bundling chromium is more work than Electron).

## 4. Architecture & components

Single Electron app. Clean split: the **main process** owns the OS-facing concerns (windows, child processes, filesystem scan); the **renderer** owns the UI and the Nostr leaderboard subscription (browser WebSocket, exactly as the games do today).

**Main process**
- `config.js` — load `arcade.config.json` (games dir, branding, kiosk flag, relay list, attract timeout).
- `scanner.js` — `scanGames(dir) → Game[]`; classify entries, resolve names/order.
- `icons.js` — `resolveIcon(game) → pngPath`; extract the AppImage's embedded `.DirIcon`, cache by mtime, fall back to a sibling `logo.png`, then a placeholder.
- `launch.js` — `launchNative(game)` / `launchWeb(game)` + exit handling → return-to-grid.
- window/kiosk lifecycle, IPC, `globalShortcut` admin keys.

**Renderer**
- `leaderboard/` — a generic **`LeaderboardProvider`** interface, with a **gamestr provider** as the first implementation: subscribe to kind 30762 for a game id across the configured relays, collapse to per-pubkey best, sort desc, live `onUpdate`, resolve kind-0 profiles async. **Lifted from `pallasite/src/score.ts`** (swap the gamestr provider's internals for a `forgesworn-play` import once that lib is extracted — see §6). The core UI depends only on the interface, so a non-Nostr board — or none — is a drop-in swap.
- `ui/` — hero carousel, input (keyboard + gamepad), web-game view, leaderboard panel, attract mode, audio.

**Data shapes**
```ts
type Game = {
  id: string;            // stable slug
  name: string;
  tagline?: string;
  kind: 'appimage' | 'web';
  exec?: string;         // appimage path
  url?: string;          // web url
  gameId: string;        // kind-30762 `game` tag value (leaderboard key)
  logo: string;          // resolved png path
  hero?: string;         // png|mp4 background
  accent?: string;       // theme colour
  sounds?: { music?: string; voice?: string };
  order: number;
};
type LeaderboardEntry = { pubkey: string; name?: string; picture?: string; score: number; sats?: number; at: number };

// The launcher core depends ONLY on this interface — gamestr is one implementation.
interface LeaderboardProvider {
  subscribe(gameId: string, onUpdate: (top: LeaderboardEntry[]) => void): () => void;
}
```

## 5. Game discovery model ("based on their logo")

One `games/` folder, scanned at boot (F5 rescans at the booth). Each game is a **folder** `games/<slug>/`:

```
games/pallasite/
  Pallasite-x.y.z.AppImage   # native  (OR  game.json { "url": "..." } for web)
  logo.png                   # transparent wordmark   (fallback: extracted .DirIcon)
  hero.png | hero.mp4        # full-bleed background   (fallback: blurred logo / gamestr backdrop)
  theme.json                 # { "accent": "#7cf" }    (optional)
  music.ogg / voice.ogg      # plays / calls out on highlight (optional)
  game.json                  # overrides: name, tagline, order, gameId, url
```

**Zero-config path preserved:** a loose `Foo.AppImage` dropped straight into `games/` still appears — icon auto-extracted from `.DirIcon`, default backdrop. The folder form just unlocks the full hero treatment.

**Icon extraction:** `./X.AppImage --appimage-extract .DirIcon` (or `--appimage-mount` + read), cached by mtime under a cache dir; fall back to a sibling `logo.png`, then a generated placeholder tile. Ship crisp override `logo.png`/`hero.png` for the headline games so the grid always looks sharp.

**gameId:** taken from `game.json`, else inferred from the slug (e.g. `pallasite`). This is the kind-30762 `game` tag the leaderboard filters on.

## 6. Leaderboard tiles — the gamestr provider

When a game is highlighted, the launcher renders a **live top-N board** by asking its configured `LeaderboardProvider` (§4). For the booth that provider is **gamestr / kind 30762**; the core UI is agnostic to it.

- **Source:** kind **30762** events tagged `game=<gameId>`, read from a **configurable relay list** (default `wss://relay.trotters.cc` + `nos.lol` / `relay.damus.io` / `relay.nostr.band` / …, mirroring `pallasite` `DEFAULT_RELAYS`; **local-relay-ready**). Collapse to **per-pubkey best**, sort desc. A live subscription animates new high scores in (sound + highlight). Resolve kind-0 name/picture **async** so names never block the score render; fall back to a shortened npub + a deterministic avatar.
- **Empty state:** *"Be the first — play to claim the top spot."* — designed, not broken.
- **Offline:** cache the last-known board to disk; if relays are unreachable, show the cache plus a subtle "reconnecting" indicator. Launching games never depends on this.
- **Per-game reality:** Pallasite / Forge Realms / Neon Sentinel publish 30762 → real data. AxeNStax had gamestr deferred in its own demo plan → likely empty until it publishes (the Rust `forgesworn-play` crate is "later").
- **Booth narrative:** games write to `relay.trotters.cc` (and/or a local relay); the arcade reads the same set → **booth play lights up the big screen live.**
- **Reuse / DRY:** lift the read logic from `pallasite/src/score.ts`. The canonical long-term home is **`forgesworn-play`** (the MIT kind-30762 lib, currently duplicated inside Pallasite/Neon Sentinel — see `neon-sentinel/docs/forgesworn-play-handoff.md`). The arcade being a *second reader* is a good reason to extract it, but extraction is **not** a tomorrow blocker.

## 7. UX & input

A **hero carousel**, not a flat grid: one game fills the screen (full-bleed hero art + big logo + tagline + live board), with a filmstrip of neighbours below.

- **States:** `attract → browse → launching → in-game (native: shell hidden / web: embedded view) → back-to-grid → error-toast`.
- **Move** (←/→ or stick): hero cross-fades + slides, logo pops, parallax, *whoosh* sfx.
- **Select** (Enter / A): *chunk-chime* + quick zoom/flash into the game.
- **Attract mode:** idle ~20s → auto-cycles games with music + a blinking "PRESS START"; any input wakes it.
- **CRT overlay** (toggle): subtle scanlines/vignette for instant arcade authenticity.
- **Keyboard (primary, guaranteed):** ← → move, Enter launch, Esc exit web game, **Ctrl+Q** admin-quit, **F5** rescan.
- **Gamepad (additive):** d-pad/stick move, A launch, Start back — via the renderer Gamepad API (no dependency on Pallasite's controller broker).
- **Audio:** move whoosh, select chime, back; attract-loop music; optional per-game music/voice on highlight.

## 8. Lifecycle & booth robustness

- **Native launch:** spawn the AppImage (itself kiosk), hide the shell; on child exit → show grid + refocus. Spawn failure / instant crash → toast on the grid, stay put.
- **Web launch:** load the URL into a full-screen view in the same window; persistent "Start/Esc = menu" hint; back → grid. Prefer locally-hosted / offline-cached web games (conference wifi is unreliable).
- **Crash recovery:** run the shell under systemd `Restart=always` (or a relaunch wrapper) so a crash returns to the grid, never a black screen.
- **Single-instance lock**; **admin quit** hotkey; disable laptop sleep / screensaver (ops note).

## 9. Assets — bootstrap + generate

Each game needs a logo + hero + a couple of sounds. **Bootstrap** from existing art (`axenstax/screenshot.png`, `pallasite/desktop/build/icon.png`, game screenshots) + **AI-generated** hero backdrops/logos + **royalty-free** arcade SFX (move/select/attract). Graceful fallback when art is missing; swap in better/official art later. Per-game art lives in `games/<slug>/`; global shell sfx/music/wordmark live in a shell `theme/`.

## 10. Build, packaging, dev loop

- Electron + electron-builder, **Linux AppImage** target (clone `pallasite/desktop/electron-builder.yml`).
- **Dev on the Mac** with `electron .` (UI + web-launch are testable on macOS); native-AppImage spawning is tested on the **Linux laptop**.
- **Produce the `.AppImage` on Linux** — mirror Pallasite's GitHub Actions release workflow (ubuntu runner) or just `npm run build` on the booth laptop.
- ESM only, `"type": "module"`, ES2022, British English. New **local** repo `gamestr-arcade/` — **not pushed** (gamestr is nosdav's brand; we don't publish under it without a deliberate decision).

## 11. Testing

- **TDD** `scanner` + `icons` against fixture folders (a dummy AppImage with a known `.DirIcon`; a web `game.json`).
- **Unit-test** the leaderboard collapse/sort logic against fixtures of kind-30762 events (lifted with the reader).
- **Manual smoke on the booth laptop:** launch the real Pallasite AppImage → exit → back to grid; one web game; a live board update when a score is published to the relay.
- **Offline test:** pull the network — confirm games still launch, the board shows its cache + a clean empty state, and nothing hangs.

## 12. Milestones (timeboxed)

- **M1 — core (floor):** Electron kiosk shell + folder scan + auto-icon + hero carousel (keyboard) + native launch & return + AppImage build.
- **M2 — the wow:** move/select sounds + slide transition + CRT toggle + attract mode + bootstrapped art.
- **M3 — leaderboards:** live kind-30762 tiles + empty/cached states.
- **M4 — web + AxeNStax:** web-game launch path; AxeNStax wrapped as an AppImage (separate sub-task) or run as a locally-hosted URL.

**Cut order if time runs short:** M4 web → M3 leaderboard polish → M2 attract. **M1 is the non-negotiable floor.**

## 13. Open questions / dependencies

1. **Relay/offline on the day:** `relay.trotters.cc` only (zero reconfig) vs. add a **local relay** on the laptop for full-offline live boards. Spec'd as a configurable list; confirm the booth choice.
2. **AxeNStax:** who wraps the PWA as an AppImage, and will it publish kind 30762 (so its board has data)? Until then: locally-hosted URL + designed empty board.
3. **v1 line-up + gameIds:** exact games for day one and their `game` tag values (`pallasite` is known; confirm the others).
4. **Art:** AI-generated logos acceptable, or use official logos where they exist?
