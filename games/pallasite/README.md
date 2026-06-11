# Pallasite tile

Native AppImage tile for Pallasite (cosmic Asteroids, kind-30762 leaderboard).

## Exec path

The `exec` field in `game.json` is a path relative to the `games/pallasite/` folder
that works when the booth is checked out alongside the Pallasite repo:

```
../../../pallasite/desktop/out/Pallasite-0.1.0-x86_64.AppImage
```

On the Linux booth machine, set `exec` to wherever the Pallasite AppImage actually
lives, e.g.:

```json
{ "exec": "/home/gamestr/games/Pallasite-0.1.0-x86_64.AppImage" }
```

The scanner resolves relative paths against the `games/pallasite/` folder, so both
absolute and repo-relative forms work. A loose `*.AppImage` placed directly in this
folder takes precedence over the `exec` field.
