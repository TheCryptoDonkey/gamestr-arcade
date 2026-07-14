# The road to a legendary arcade launcher

**Written:** 2026-07-14. Grounded in a hands-on tour of the built app (Playwright-driven
Electron at 1366×768 and 1920×1080, real launch into Neon Sentinel) plus the quality
gates (typecheck clean, 18 manifests validated, 515/515 tests passing).

Gamestr Arcade is a **world-class arcade game launcher first and foremost**. The web
platform is a supporting surface; every priority below serves the cabinet.

## What "legendary" means here

A launcher is legendary when:

1. **The first ten seconds sell it.** A passer-by sees motion, art and scores and
   *has* to pick up the pad. Benchmark: LaunchBox BigBox, Steam Big Picture — then
   beat them with the one thing they don't have.
2. **Pad-to-playing is seconds, and it never dies.** Zero-friction select → launch →
   play → back. Failures degrade politely; the cabinet always recovers.
3. **The sats hook is unmissable.** Verified Nostr scores and Lightning prizes are
   *unique to this launcher*. Nobody walks away without understanding "play to win sats".
4. **Operators trust it blind.** Booth staff run a whole event without the developer.

## Where it already is (verified)

- Manifest v2 launch contract with schema validation and a player-facing Cabinet Check —
  the Ready to Play panel is genuinely better than anything in BigBox.
- Hardened trust boundaries: isolated web-game sessions, main-process authority,
  bounded NWC wallet, Schnorr-verified score events.
- Controller handling proven at a real booth (HAT-axis pads, auto-repeat, evdev exit
  watcher for native games).
- Engineering discipline: 42 test files / 515 tests, CI with SBOM + AppImage evidence,
  operator guide and `arcade` CLI.
- Cinematic full-bleed hero videos on the select screen with per-game accent theming.

## Fixed during this review

- Tagline/title drowned in bright hero videos → brighter ink + dark text shadows +
  stronger lower-left vignette.
- `NOW SELECTING` collided with the top bar on 768p-class booth laptops → short-viewport
  layout query.
- Plated logos dragged their cartridge plate across the full column → plate now hugs
  the artwork.

## Now — quick wins (days)

1. **Leaderboard never shows a dead screen.** "Today" is empty most of the day at a
   fresh booth. When Today has no rows and All Time does, fall back automatically
   (label it `ALL TIME — TODAY STARTS WITH YOU`). The toggle stays manual after first
   player interaction.
2. **Launch interstitial — SHIPPED.** Neon Sentinel took ~19 s from Start Game to
   playable with no launcher-owned feedback. The web view now loads detached while
   the shell shows a full-screen accent-themed loading card (hero art + spinner),
   revealing the game only when it has actually loaded. A 12 s escalation points at
   the Back control, a 45 s safety reveal covers pages that never settle, and Ⓑ/Esc
   bail out cleanly mid-load.
3. **Complete the art — SHIPPED.** All 17 games now carry hero art. Sourced
   authentically per game: Pallasite's official key art, live gameplay captures
   (Sat Snake, Nostrich Run), in-game boards and title cards (WORD5, Sats-Man,
   Blockstr), and the Payment Lab terminal itself. Pay-gated games (Blockstr,
   Sats-Man) use their own landing art — replace with gameplay reels if their
   developers share press kits.
4. **Attract mode v2 — SHIPPED.** Idle now enters a cinema reel: the operational
   chrome (board, CTA, filmstrip, kicker) fades away, the hero art cycles vivid and
   full-bleed with each game's title block, and a top-three scores strip (fed from
   the cached all-time board, no extra relay traffic) rides above the INSERT COIN
   pulse. Any input restores the full grid, replaying the chrome's entrance.

## Next — the experience layer (weeks)

4b. **Post-game donation ask — SHIPPED.** When a player returns from a session of
   at least `donation.minSessionSeconds` (so never after a bounce), the cabinet
   raises one accent-themed card: "ENJOYED <GAME>? ZAP THE ARCADE" with a single
   big `lightning:` QR. Any button continues; it auto-dismisses back to attract.
   Config-driven (`donation` block in arcade.config.json — receive-only address,
   never the spend credentials).

5. **Sound design pass.** Navigation blips, selection sting, launch whoosh, attract
   loop — offline Web Audio assets, respecting the `m` mute toggle. Silence is the
   biggest "unfinished" tell on a cabinet.
6. **Live score moments — SHIPPED.** When a live relay update dethrones the all-time
   #1 for the game on screen, a gold "★ NEW RECORD — <name> TAKES #1 ON <game>"
   banner sweeps in (with a chime outside silent attract). Strictly witnessed-live:
   the first update after a game switch only seeds the baseline, so relay backlog
   never reads as fireworks.
7. **Session stats — SHIPPED.** Real sessions (30 s+; bounces filtered) are recorded
   device-local per game — plays, total time, recency. The most-played game of the
   last 12 hours (minimum two plays) wears an ember HOT TONIGHT badge on the
   showcase and its tile, seeded at boot so it survives restarts. Nothing leaves
   the machine. Catalogue reordering by heat remains a possible follow-up.
8. **Claim your run.** A QR handoff so a player can attach their own npub to the run
   they just played (signed claim, no nsec at the cabinet). Turns anonymous booth runs
   into owned identity — the core gamestr promise, at the cabinet.
9. **Network resilience surfacing.** Relay-loss banner with auto-retry state, and an
   offline-degraded mode statement (boards pause, play continues). The cabinet must
   never look broken because wifi blinked.

### Reliability debt (from the code audit)

Small, unglamorous, and exactly what "never dies at a booth" is made of:

- Relay reconnect uses a fixed 3 s retry — add exponential backoff with jitter.
- `userData/icon-cache/` has no garbage collection — bound it.
- Native AppImage spawning falls back silently when systemd-run is unavailable —
  surface the degradation to the operator instead.
- Gamepad exit is Linux evdev only and no-ops silently elsewhere — log it loudly.
- Hot-reload (F5) mutates shared state with no E2E test — a launch racing a reload
  is untested territory.
- Blocked media-protocol requests are denied but not logged — add an audit trail.

## Flagship — the legendary moves (a release each)

10. **Tournament mode.** Time-boxed booth events on the cabinet: signed challenge
    window (the kind-23034 envelope already designed for the web), live standings from
    the same verified score stream, and a Lightning prize payout flow from the booth
    wallet behind an operator hold-to-confirm. This is the bitfest headline feature —
    no launcher on earth does verified-score tournaments with instant sat prizes.
11. **Multi-cabinet events.** Two cabinets, one challenge window, one standings board —
    relays already carry the scores; the cabinets just need to agree on the window.
12. **Gold-master reliability cert.** A soak harness that loops launch→play→exit across
    all 17 games for hours (the Playwright driver from this review is the seed),
    crash-recovery drills, and a documented "survives a full event day" bar. Legendary
    among operators is earned, not claimed.

## Sequencing

Quick wins 1–4 before the next public outing; they change the first impression more
than anything else per hour spent. Then 5–7 (experience layer), then 10 (tournaments)
as the flagship bet, with 8–9, 11–12 slotting around it.
