# AxeNStax tile

Web tile for AxeNStax (voxel proof-of-work mining game, PWA).

## Starting the game server

AxeNStax is served by the SvelteKit dev/preview server. Start it before opening
the booth:

```bash
cd axenstax/tools/sites/game
./start.sh        # starts on http://localhost:8094
```

The booth loads `http://localhost:8094` in a kiosk-mode browser frame.

## Leaderboard

AxeNStax does not yet publish kind-30762 Nostr events, so the leaderboard panel
shows an empty state until it does. No action required — the empty state is handled
gracefully by the arcade UI.

## Mode tiles (future)

Once AxeNStax exposes a `?scenario=<name>` URL parameter, individual scenario tiles
can be added as additional web tiles (each with their own `game.json` pointing at
the scenario URL). See `games/README.md` for the folder convention.
