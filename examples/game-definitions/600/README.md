# 600 Arcade definition review

These four portable `game.json` drafts carry the selected Arcade artwork, names,
descriptions, supported inputs, existing scoring and capability declarations,
keyboard direction/fire overrides, readable action hints, and game-specific
phone controller profiles for portrait and landscape. Omitting fixed screen
coordinates lets Joystick place broad primary actions and nearby secondary
targets beside the hands, including on tablets. Explicit custom layouts remain
available to games that need them.

The review is published at `/definitions/600/` in both web builds and linked from
the 600 edition footer. `tools/game-definition-preview.ts` validates the files
against the canonical manifest schema and Joystick profile rules, then checks
four phone/tablet dimensions for every layout. CI runs these checks without
fetching a publisher site or depending on a sibling checkout.

Hang On, Fren retains its existing action set and uses the adaptive Joystick
default. Its publisher definition and catalogue copy agree. Pallasite, Neon Sentinel and
Take Me To Your Ledger contain proposed layouts matched to their current native
gamepad actions. Their publisher sites still need the phone handoff integration.
The drafts are separate from `games/`: preview publication does not change the
live catalogue's compatibility declarations.

The current `controls` object defines direction/fire keyboard overrides. Other
keyboard actions are described in `controlHints`; a complete action-binding and
remapping contract remains protocol work. Touch is the default; Joystick's
existing Tilt option requires explicit player action. The preview only animates
controls locally and does not request pairing, signing, payment or motion access.

Run `npm run validate:definitions` to check the drafts. The downloadable files
are emitted unchanged under `/definitions/600/drafts/<slug>/game.json`.
