# gamestr-arcade — Booth Setup

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

The resulting AppImage is self-contained — copy it anywhere on the booth laptop.

---

## 2. Games folder layout

The scanner looks for games in `ARCADE_GAMES_DIR` (default: `games/` next to the AppImage in production). Create one sub-folder per game:

```
games/
  <slug>/
    game.json          # required for web games; optional metadata for AppImage games
    MyGame.AppImage    # present → native game
    logo.png           # optional: tile logo (else icon is auto-extracted from the AppImage on Linux)
    hero.png           # optional: hero image shown in the detail panel
    hero.mp4           # optional: hero video (preferred over hero.png if both present)
    music.ogg          # optional: attract-mode music track
    voice.ogg          # optional: attract-mode voice line
```

A loose `*.AppImage` file at the **top level** of the games folder is also picked up (slug = filename without extension).

### `game.json` fields

```jsonc
{
  "url":     "https://example.com/game",   // required for web games; absent for AppImage games
  "name":    "My Game",                    // display name (default: prettified slug)
  "tagline": "A short one-liner",          // shown under the name on the tile
  "gameId":  "my-game",                    // kind-30762 game tag the leaderboard filters on
                                           // (default: the folder slug — set explicitly if the
                                           //  game publishes a different tag)
  "accent":  "#ff6a00",                    // tile accent colour (CSS hex)
  "order":   1,                            // sort order in the grid (default: 999)
  "tHints":  ["arrows", "z to jump"]       // optional control hints shown in the detail panel
}
```

`gameId` is the value the leaderboard reads from the `game` tag of kind-30762 events. If a game publishes its scores under a specific tag, set `gameId` to match — otherwise boards will be empty for that tile.

### Logo resolution order

1. `logo.png` sibling in the game folder
2. `.DirIcon` extracted from the AppImage (Linux only; cached in `~/.config/gamestr-arcade/icon-cache/`)
3. Bundled placeholder icon

---

## 3. `arcade.config.json`

Shipped alongside the AppImage (in `resources/`) via `extraResources`. Edit the copy next to the AppImage — no rebuild needed.

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
  }
}
```

The file is read on every `games:list` IPC call (i.e. on every reload/rescan), so changes take effect immediately without restarting the app.

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
# graphical login), enable lingering first — otherwise systemd-logind reaps the
# user manager the moment your SSH session closes and the app dies with it:
loginctl enable-linger "$(whoami)"

cp systemd/gamestr-arcade.service ~/.config/systemd/user/gamestr-arcade.service
systemctl --user daemon-reload
systemctl --user enable --now gamestr-arcade
```

The service uses `Restart=always` with `RestartSec=2` — a one-off crash returns to the game grid within 2 seconds — **capped** by a `StartLimitBurst=4` / `StartLimitIntervalSec=120` guard so a persistently-failing launch can't crash-loop forever (it trips to `failed` after 4 starts in 2 min instead of hammering the machine).

**If the unit is stuck `failed`:** check `systemctl --user status gamestr-arcade`. Once the cause is fixed, clear the limit with `systemctl --user reset-failed gamestr-arcade`. If it core-dumps on *every* launch (SIGTRAP/SIGBUS, often after a burst of earlier crashes), the **GPU driver is wedged** — do a **clean reboot** to reset it. Don't paper over it by forcing software rendering globally; that pins the cabinet to a slideshow.

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
| `Ctrl+Q`  | Quit the arcade (admin exit — kiosk mode hides the window chrome) |
| `F5`      | Reload the renderer — rescans the games folder and reloads config |
| `c`       | Toggle the CRT scanline overlay on/off |
| `m`       | Toggle audio mute on/off |

While a **web game** is running, `Escape` (or the gamepad Back button) returns to the game grid.

---

## 7. Adding a game at the booth

1. Drop a new folder into the `games/` directory (path set in `ARCADE_GAMES_DIR`).
2. Press **F5** to reload — the new tile appears immediately.

No restart required.

---

## 8. Example game structure

See `examples/games/` for a tracked example showing the folder convention.
