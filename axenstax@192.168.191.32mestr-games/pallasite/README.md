# Pallasite tile

Web tile for Pallasite (cosmic Asteroids, kind-30762 leaderboard).

## Launch

`game.json` is a **web tile** — it points at the hosted build so it plays in dev
on any platform and on the booth:

```json
{ "url": "https://pallasite.app/" }
```

The scanner classifies any folder whose `game.json` has a `url` (and no loose
`*.AppImage` / `exec`) as `kind: 'web'`. The carousel launches it in an embedded
web view; the leaderboard reads kind-30762 scores tagged `pallasite`.

## Offline mirror (later)

When an offline mirror is added under `games/pallasite/site/index.html`, the
launcher serves it from the local static server and badges the tile **LOCAL** —
no internet needed at the booth. (Not wired yet.)

## Art

- `logo.png` — the cyan crystal wordmark/icon, shown prominently on the left of
  the hero carousel.
- No `hero.png`: Pallasite uses the carousel's accent-driven neon backdrop
  (cyan `#7cf3ff`) so the clean logo reads crisply on the left, rather than the
  og-image with baked-in "SHOOT ROCKS" text.
