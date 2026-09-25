# Report handling

> **DRAFT for legal review, 25 September 2026.** Drafted from the code on
> `main` (c782894) for the owner to check, complete and sign. It has not been
> reviewed by a lawyer and it is not legal advice. This is a work list and an
> honest capability inventory, not a finished moderation system: it lists
> gaps rather than building them.

## Report contact

`abuse@forgesworn.dev`

## 1. What can actually be reported

| Surface | Who posts it | Who can see it | Report control today | Gap |
| --- | --- | --- | --- | --- |
| A score's self-chosen player label (up to 80 characters) or NIP-05 | The player, via the game they play, signed with their Nostr key | Anyone viewing that game's leaderboard | **None in the app.** No report button exists in `src/renderer/src/ui/leaderboard-panel.ts` or `src/web/main.ts` | Add a report link or button next to a leaderboard row, feeding the contact address below |
| A challenge name (up to 60 characters) | Any web-edition visitor with a Nostr signer | Anyone who opens the shared challenge link | **None** | As above |
| A Nostr profile's name/picture, shown on the leaderboard | Any Nostr key, fetched live from relays | Anyone viewing a board where that key has a score | **None** | Nothing here can be removed; see section 2 |
| A listed game itself (its own content, safety or fairness) | The game's own developer, outside this repository | Anyone who launches it | **None** | Out of scope for this app; report to the game's own developer, or to the operator to delist it from the catalogue |

## 2. What removal is actually possible, and what is not

Be honest about the limits of a Nostr-based system: nothing published to a
relay can be reached network-wide by this app or its operator.

**Actually possible:**

- **Hide from our own display.** We can stop showing a specific score event,
  player label, challenge or invitation on the leaderboard views this app
  renders, by filtering it client-side (for example by event ID or by
  pubkey) before it is drawn. This does not delete the event anywhere.
- **Remove from a relay the operator also runs**, if that relay is ours to
  administer and supports deletion (NIP-09) or has its own moderation
  policy. This only affects that one relay's copy.
- **Delist a game** from the arcade's own catalogue (`games/<slug>/`), which
  stops it being offered through this app. It does not affect the game
  itself, wherever it is hosted, or its own leaderboard elsewhere.
- **Remove a relay** from the app's default or operator-configured relay
  list, so this app stops reading from it. Other relays, and other Nostr
  clients, are unaffected.
  <!-- src/renderer/src/ui/relay-panel.ts lets an operator remove a relay -->

**Not possible, and not claimed:**

- **Network-wide removal.** A score event, player label or challenge
  published to Nostr relays we do not run cannot be deleted by us. Other
  relays, and any other Nostr client reading them, are outside our control.
- **Preventing republication.** A player can sign and publish a new event
  with the same content at any time, from any relay.
- **Verifying real-world identity.** Signature verification proves an event
  was signed by a given key; it does not prove who controls that key.

## 3. Where reports should go today

There is no in-app report route. Until one is built (section 4), reports
should go to `abuse@forgesworn.dev`, and the operator should act using the
tools in section 2.

## 4. Build notes, if a report control is added

1. A small "report" affordance next to a leaderboard row (player label,
   score) and next to a rendered challenge, sending the event ID, pubkey and
   game ID to the contact address or to a lightweight local log the operator
   can check at the booth.
2. A client-side hide list (by event ID or pubkey), checked before a board
   renders, so a hidden entry disappears from this app's own views
   immediately without needing a relay-side change.
3. Keep the "hide, we do not run the network" framing throughout: do not
   build or imply a takedown that reaches other relays or other clients.

## 5. Out of scope

- **`pallasite-faucet`** is a separate repository providing a sats faucet.
  It was not investigated as part of this work. Nothing in this repository
  references a faucet or embeds that project (checked: grepping this
  repository for "faucet" found no matches; the only match for "pallasite"
  is the `games/pallasite` game tile, not the faucet). Reports about the
  faucet should go to whoever operates that separate service.
- **A listed game's own content or behaviour.** Each game is its own
  product; see `README.md`'s trust boundary diagram. This app can delist a
  game (section 2) but does not moderate what happens inside it.
