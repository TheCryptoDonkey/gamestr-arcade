# Conference cabinet acceptance

`npm run conference:status` is the source-side evidence gate for a player-facing cabinet.  It remains red until every controller title has exact physical-booth evidence; desk tests and a successful package build do not clear that gate.  A green result still does not replace proving the packaged artifact, installed games and live service on the final booth.

## Controller contract

Every gamepad title declares one web adapter:

- `native`: the game reads Chromium's Gamepad API; the arcade adds no gameplay keys or pointer input.
- `keyboard`: D-pad/stick and A/X travel through Electron's trusted keyboard input pipeline.
- `pointer`: the left stick and A travel through Electron's trusted pointer pipeline.
- `hybrid`: both trusted bridges are active.  This preserves the historic cabinet behaviour while each title is certified.

The arcade normalises both controller layouts observed around the Prague failure: Chromium `standard` mapping and the Linux non-standard HAT layout on axes 6/7.  A hardware certification must exercise both profiles, not merely assert support from unit tests.

## Physical run for each title

Use the final booth computer, packaged build, display, USB/Bluetooth stack and Xbox controllers.

1. Boot with the controller already attached.  Navigate the carousel with D-pad and stick, launch with A, then return with Guide or the View + Menu chord.  Confirm Start/Menu still reaches the game's own pause or title screen.
2. Start the title from its actual opening menu.  Exercise every direction and action shown in `controlHints`; confirm one press produces one action and a held direction repeats without sticking.
3. Return to the arcade, relaunch, and confirm no key, cursor or payment/session authority leaked from the previous run.
4. Disconnect and reconnect the controller at the carousel and once inside the title.  Repeat over the booth's wired and wireless paths until the journal has shown both `map=standard` and `map=none`/Linux HAT profiles.
5. Record the exact controller/connection, date and immutable game evidence (local build commit, deployed commit, or remote ETag/Last-Modified) in the manifest.

Use this manifest shape only after that run succeeds:

```json
"controller": {
  "adapter": "hybrid",
  "certification": {
    "level": "hardware",
    "testedAt": "2026-09-01",
    "hardware": [
      "Xbox Wireless Controller - USB",
      "Xbox Wireless Controller - Bluetooth"
    ],
    "profiles": ["standard", "linux-hat"],
    "gameRevision": "deployed commit or HTTP ETag",
    "notes": "Boot, menu, play, exit, reconnect and relaunch passed"
  }
}
```

## Cabinet-wide checks

- Payment Lab is absent in normal kiosk mode.  Set `ARCADE_OPERATOR_TOOLS=1` only for an operator diagnostics session.
- Word5 opens directly at `https://otherstuff.ai/word5/`; no blocked cross-origin redirect is part of launch.
- Run once with conference networking disabled.  Confirm the shell remains recoverable and nominate at least one `network: optional` title as the outage fallback.
- Run `npm run validate`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run conference:status` on the exact checkout used to package the booth.
