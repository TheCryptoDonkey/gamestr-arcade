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

Files tracked by git: `game.json` and `README.md`. Generated/downloaded art and
AppImages are git-ignored — place them on the booth machine directly
or point at them via the `exec` field in `game.json`.

## game.json fields

Use manifest v2 for new games. Its machine-readable contract is
[`../schemas/game-manifest-v2.schema.json`](../schemas/game-manifest-v2.schema.json).
Important fields include:

| Field | Description |
|-------|-------------|
| `manifestVersion` | Set to `2` for the readiness and capability contract |
| `name`, `tagline`, `description`, `developer`, `genres` | Player-facing metadata |
| `gameId` | Leaderboard key (kind-30762 `game` tag value) |
| `exec`, `url` | Native launch plus optional playable web fallback |
| `inputModes`, `controlHints`, `players`, `sessionMinutes` | Pre-launch play instructions |
| `network` | `required`, `optional`, or `offline` readiness status |
| `capabilities` | Requested Nostr, wallet, storage and navigation access; not a grant |
| `allowedOrigins` | Explicit web-session navigation allowlist |
| `order`, `accent` | Catalogue ordering and cabinet theming |

## Mode tiles (future — AxeNStax example)

Once AxeNStax exposes a `?scenario=<name>` deep-link, individual scenarios can be
added as separate web tiles:

```json
// games/axenstax-sprint/game.json
{ "name": "AxeNStax: Sprint", "url": "http://localhost:8094?scenario=sprint", ... }
```

No code changes required — the scanner picks them up automatically.
