# gamestr-arcade - Booth Setup

Concise runbook for deploying the arcade kiosk to a booth Linux laptop.

---

## 1. Build the AppImage (Linux only)

The AppImage must be built on an **x86_64 Linux machine** (e.g. the booth laptop running Ubuntu). macOS builds are not supported by electron-builder for this target.

```bash
npm ci
npm run dist
```

Output: `release/gamestr-arcade-0.1.0-x86_64.AppImage`

The exact name comes from `electron-builder.yml`:
```
artifactName: gamestr-arcade-${version}-${arch}.AppImage
```

The resulting AppImage is self-contained - copy it anywhere on the booth laptop.

---

## 2. Games folder layout

The scanner looks for games in `ARCADE_GAMES_DIR` (default: `games/` next to the AppImage in production). Create one sub-folder per game:

```
games/
  <slug>/
    game.json          # required for web games; optional metadata for AppImage games
    MyGame.AppImage    # present → native game
    logo.webp          # optional: tile logo (PNG/JPEG/SVG also supported)
    hero.webp          # optional: hero image (PNG/JPEG also supported)
    hero.mp4           # optional: hero video (WebM also supported; preferred over images)
```

A loose `*.AppImage` file at the **top level** of the games folder is also picked up (slug = filename without extension).

### `game.json` fields

Manifest v2 adds a player-facing launch contract while keeping every v1 manifest
working. The canonical JSON Schema is
[`schemas/game-manifest-v2.schema.json`](schemas/game-manifest-v2.schema.json).

```jsonc
{
  "manifestVersion": 2,
  "url":     "https://example.com/game",   // required for web games; absent for AppImage games
  "exec":    "MyGame.AppImage",            // optional native build; URL is the fallback if absent
  "name":    "My Game",                    // display name (default: prettified slug)
  "tagline": "A short one-liner",          // shown under the name on the tile
  "gameId":  "my-game",                    // kind-30762 game tag the leaderboard filters on
                                           // (default: the folder slug - set explicitly if the
                                           //  game publishes a different tag)
  "accent":  "#ff6a00",                    // tile accent colour (CSS hex)
  "order":   1,                            // sort order in the grid (default: 999)
  "inputModes": ["gamepad", "keyboard"],
  "controlHints": ["D-PAD = MOVE", "Ⓐ = ACTION"],
  "tips": "you@walletofsatoshi.com",         // author Lightning address - the post-game
                                           // zap ask tips YOU instead of the booth
  "developer": "Your Studio",              // named on the zap card when tips is set
  "players": { "min": 1, "max": 1 },
  "sessionMinutes": 5,
  "network": "required",                  // required | optional | offline
  "capabilities": {                        // requests, never automatic grants
    "nostrSign": true,
    "walletPay": false,
    "persistentStorage": true,
    "externalNavigation": false
  },
  "allowedOrigins": ["https://example.com"]
}
```

The selector shows these facts in a controller-accessible **Ready to Play** panel.
If both `exec` and `url` are declared, an installed AppImage wins; when the binary
is missing, the scanner falls back to the web build. An exec-only missing binary
stays visible as **Not Ready** so the operator gets a useful diagnosis.

`gameId` is the value the leaderboard reads from the `game` tag of kind-30762 events. If a game publishes its scores under a specific tag, set `gameId` to match - otherwise boards will be empty for that tile.

### Logo resolution order

1. `logo.png`, `logo.webp`, `logo.jpg`, `logo.jpeg` or `logo.svg` sibling
2. Explicit `logoUrl`, then a safe icon discovered from the declared HTTPS game page
3. Bundled placeholder icon

The scanner deliberately does not execute an AppImage to extract `.DirIcon`.
Ship `logo.png` beside every native title instead.

Hero reels use `hero.mp4` or `hero.webm` (muted, looping, and preferred over
WebP/PNG/JPEG sibling art). The static image remains the lightweight fallback.

---

## 3. `arcade.config.json`

Shipped alongside the AppImage (in `resources/`) via `extraResources`. Edit the copy next to the AppImage - no rebuild needed.

```jsonc
{
  "theme": {
    "title":  "gamestr arcade",   // window / header title
    "accent": "#7cf3ff",          // global accent colour (CSS hex)
    "crt":    true                // CRT scanline overlay on/off
  },
  "attractTimeoutMs": 20000,      // idle ms before attract mode starts (20 s)
  "leaderboard": {
    "provider": "gamestr",        // "gamestr" = kind-30762 via Nostr | "none" = hide boards
    "relays":   ["wss://relay.trotters.cc", "wss://nos.lol"],
    "topN":     5                 // how many scores to show per board
  },
  "webln": {                       // optional booth wallet; keep this file private
    "nwc": "nostr+walletconnect://…",
    "maxSats": 100,                // ceiling for one invoice
    "sessionBudgetSats": 500,      // cumulative reservation per game launch
    "maxPaymentsPerMinute": 5
  },
  "donation": {                    // optional post-game "zap the arcade" ask
    "address": "you@coinos.io",    // RECEIVE-side Lightning address (or LNURL) - shown as a QR
    "message": "ZAP THE ARCADE - IT KEEPS THE GAMES FREE",  // headline under the title (optional)
    "minSessionSeconds": 45,       // only ask after a session at least this long
    "showSeconds": 30              // auto-dismiss after this long (any button also dismisses)
  }
}
```

The donation card appears when a player returns from a game that lasted at
least `minSessionSeconds` - one big `lightning:` QR any wallet can scan. It is
a receive-only address (safe to display), never touches the `webln` spend
credentials, and is omitted entirely when the block is absent.

For a self-hosted least-authority wallet, use the isolated Phoenixd deployment in
[`deploy/phoenixd`](deploy/phoenixd/README.md). Never commit the generated NWC URI:
it grants payment authority and belongs only in the booth-local configuration.

When configured, wallet credentials stay in the Electron main process. A web
game receives `sendPayment` only when its manifest explicitly requests
`capabilities.walletPay`; invoices are amount-checked, rate-limited, deduplicated
and charged against a launch-scoped budget. Amount-less invoices, keysend and
invoice creation are not exposed. Protect a credential-bearing config with
`chmod 600 arcade.config.json`.

The renderer reload path re-reads the config. Theme, leaderboard and wallet
policy changes therefore apply after **F5**. `gamesDir` and `kiosk` define
process-level startup state and require an app/service restart; explicit
`ARCADE_GAMES_DIR` and `ARCADE_KIOSK` environment values take precedence.

---

## 4. Leaderboards

Boards populate in real time when games publish **kind-30762** events to a relay that the arcade also subscribes to. The default relay is `wss://relay.trotters.cc`.

- After a player finishes a game, their score appears on the board within seconds.
- If the machine is offline, boards show empty (or cached scores from the same session).
- **Offline-first option:** run a local Nostr relay (e.g. `nostr-rs-relay` on `ws://localhost:7777`) and add it to `arcade.config.json` → `leaderboard.relays`. Games should also point to the same relay. This removes the dependency on internet connectivity during play.

---

## 5. Running the arcade

### Windowed test (any OS, development)

```bash
ARCADE_KIOSK=0 npm run dev
```

This runs in a normal window. The kiosk flag is off so you can use OS controls normally.

### Full kiosk run (Linux, production)

```bash
ARCADE_KIOSK=1 ARCADE_GAMES_DIR=/path/to/games /path/to/gamestr-arcade-0.1.0-x86_64.AppImage
```

### Install the systemd service (Linux booth)

```bash
# If you'll ever START/restart the service over SSH (not from the booth's own
# graphical login), enable lingering first - otherwise systemd-logind reaps the
# user manager the moment your SSH session closes and the app dies with it:
loginctl enable-linger "$(whoami)"

cp systemd/gamestr-arcade.service ~/.config/systemd/user/gamestr-arcade.service
systemctl --user daemon-reload
systemctl --user enable --now gamestr-arcade
```

The service uses `Restart=always` with `RestartSec=2` - a one-off crash returns to the game grid within 2 seconds - **capped** by a `StartLimitBurst=4` / `StartLimitIntervalSec=120` guard so a persistently-failing launch can't crash-loop forever (it trips to `failed` after 4 starts in 2 min instead of hammering the machine).

### Ubuntu 24.04+ Chromium sandbox

Ubuntu restricts unprivileged user namespaces by default. Keep Electron's
Chromium sandbox enabled by installing the narrow AppArmor grant shipped here:

```bash
sudo install -m 0644 systemd/apparmor-gamestr-arcade /etc/apparmor.d/gamestr-arcade
sudo apparmor_parser -r /etc/apparmor.d/gamestr-arcade
```

Then run the Wayland override without `--no-sandbox` (the tracked
`systemd/booth-wayland.conf` already does this). The profile grants `userns` only
to the launcher paths; it does not disable AppArmor system-wide.

**If the unit is stuck `failed`:** check `systemctl --user status gamestr-arcade`. Once the cause is fixed, clear the limit with `systemctl --user reset-failed gamestr-arcade`. If it core-dumps on *every* launch (SIGTRAP/SIGBUS, often after a burst of earlier crashes), the **GPU driver is wedged** - do a **clean reboot** to reset it. Don't paper over it by forcing software rendering globally; that pins the cabinet to a slideshow.

See `systemd/gamestr-arcade.service` for the path placeholders you must update, and for the screen-blanking / DPMS commands to run once in the booth session.

### Disable screen blanking / screensaver

On plain X11:
```bash
xset s off -dpms
xset s noblank
```

On GNOME:
```bash
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-timeout 0
```

---

## 6. Admin and demo keys

| Key       | Action |
|-----------|--------|
| `Ctrl+Q`  | Quit the arcade (admin exit - kiosk mode hides the window chrome) |
| `F5`      | Reload the renderer - rescans the active games folder and reloads non-startup config |
| `c`       | Toggle the CRT scanline overlay on/off |
| `m`       | Toggle audio mute on/off |

While a **web game** is running, `Escape` (or the gamepad Back button) returns to the game grid.

---

## 7. Adding a game at the booth

1. Drop a new folder into the `games/` directory (path set in `ARCADE_GAMES_DIR`).
2. Press **F5** to reload - the new tile appears immediately.

No restart required.

---

## 8. Example game structure

See `examples/games/` for a tracked example showing the folder convention.
