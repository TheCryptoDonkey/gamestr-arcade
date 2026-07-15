# examples/games/

Tracked examples showing the games folder convention. The real `games/` directory
at the repo root is gitignored (it holds booth-specific AppImages and art assets).

## Folder layout

```
games/
  <slug>/
    game.json          # required for web games; optional metadata for AppImage games
    MyGame.AppImage    # present → native AppImage game
    logo.png           # tile logo (optional; auto-extracted from AppImage on Linux if absent)
    hero.png           # hero image for the detail panel (optional)
    hero.mp4           # hero video - preferred over hero.png when both are present (optional)
    music.ogg          # attract-mode background music (optional)
    voice.ogg          # attract-mode voice line (optional)
```

A loose `*.AppImage` at the **top level** of the games folder is also picked up
(the slug is derived from the filename).

## Examples in this directory

- `example-web/` - a web game tile. The arcade loads the URL in an overlay.
  `gameId` must match the `game` tag that the game publishes on kind-30762 events
  so the leaderboard board shows that game's scores.

For the full field reference and deployment instructions, see `SETUP.md` at the
repo root.
