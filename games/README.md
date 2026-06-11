# games/ — booth tile catalogue

Each subfolder is one game tile. The scanner (`src/main/scanner.ts`) discovers
tiles at startup; no code changes are needed to add or remove a tile.

## Folder convention

```
games/
  <slug>/
    game.json     ← required: tile metadata
    logo.png      ← optional: square logo, ≤1024 px, transparent preferred
    hero.png      ← optional: wide hero image, ≤1920 px wide
    hero.mp4      ← optional: looping video hero (takes priority over hero.png if both present)
    README.md     ← optional: operator notes
```

Files tracked by git: `game.json`, `logo.png`, `hero.png`, `hero.mp4`, `README.md`.
AppImages and other binaries are git-ignored — place them on the booth machine directly
or point at them via the `exec` field in `game.json`.

## game.json fields

| Field     | Type   | Description |
|-----------|--------|-------------|
| `name`    | string | Display name |
| `tagline` | string | One-line description shown on the hero |
| `gameId`  | string | Leaderboard key (kind-30762 `game` tag value) |
| `order`   | number | Sort order in the carousel (lower = earlier) |
| `accent`  | string | CSS hex colour used for glow, CRT tint, etc. |
| `exec`    | string | Path to an AppImage (absolute, or relative to the tile folder). Superseded by a loose `*.AppImage` in the folder if one is present. |
| `url`     | string | URL to load in kiosk web-frame mode (used when no AppImage / `exec`). |

## Mode tiles (future — AxeNStax example)

Once AxeNStax exposes a `?scenario=<name>` deep-link, individual scenarios can be
added as separate web tiles:

```json
// games/axenstax-sprint/game.json
{ "name": "AxeNStax: Sprint", "url": "http://localhost:8094?scenario=sprint", ... }
```

No code changes required — the scanner picks them up automatically.
