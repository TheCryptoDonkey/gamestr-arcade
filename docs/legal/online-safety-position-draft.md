# Online Safety Act position

> **DRAFT for legal review, 25 September 2026.** Drafted from the code on
> `main` (c782894) for the owner to check, complete and sign. It is not legal
> advice and has not been reviewed by a lawyer. HTML comments name the code
> behind each statement.

## Why this is a short position paper, not a full risk assessment

The v4v-style full illegal content risk assessment (Ofcom's four-step format,
scored across all priority content kinds) is built for a service with chat,
direct messaging, file uploads and open comments. gamestr-arcade has none of
those. Investigation of this repository found:

- No chat and no direct or private messaging of any kind.
- No comments on content.
- No file upload endpoint reachable by a user (see section 2).
- The only user-published content reaching a public leaderboard is a numeric
  score plus a short, optional, self-chosen player label, not open-ended
  free text posted into a shared space that other users read as a feed.

Given that, a shorter position paper is proportionate: it records why the Act
is engaged at all, what a stranger can actually see or publish, and a brief
view of which priority content kinds are realistically in play. If the app
later grows chat, comments, uploads or messaging, this should be replaced with
the fuller Ofcom-style risk assessment.

## 1. Does the Online Safety Act apply?

**User-to-user service.** Game leaderboards are populated by Nostr score
events (kind `30762`, and a legacy kind `5555`) that a game signs with a
player's key and publishes to Nostr relays. gamestr-arcade itself does not
run the games (each is its own web or native title); it subscribes to those
relays, verifies each event's ID and Schnorr signature, and renders the
resulting board to anyone using the app. Content one user (a player, via the
game they are playing) causes to be published is then encountered by other
users (anyone viewing that board) via the app. That is enough to make this a
user-to-user service under section 3 of the Online Safety Act 2023, even
though the arcade is a consumer/renderer of the events rather than their
point of publication.
<!-- src/renderer/src/leaderboard/gamestr-reduce.ts isScoreEvent, parseScoreEvent; README.md "Session-wide, bounded Nostr score feeds with event ID and signature verification" -->

**UK links.** The app is distributed for a UK-run booth/conference circuit and
served publicly from `arcade.600.wtf`; the operator is in the UK.
`[INPUT: confirm current UK user numbers, if any are tracked.]`

**Size.** Very small. This is a single-purpose arcade front-end, not a social
network; nowhere near Ofcom's 7 million UK user threshold for a "large"
service.

**Not a pornography service.** The app publishes no content itself and the
games it lists are arcade titles (shooters, runners, puzzle games); Part 5 of
the Act does not apply.

**Timing.** The web editions (`gamestr.io`-style build and
`arcade.600.wtf`) are public today, with no sign-in required to view a
leaderboard, so on our reading this is in scope now.
<!-- web.editions.json defaultOrigin entries; src/web/main.ts renders scores/home without requiring a signed-in session -->

## 2. What a stranger can actually see and publish

| Action | Who | Where in the code |
| --- | --- | --- |
| View a game's leaderboard (Today / All-Time, top N) | Anyone, on the kiosk cabinet or either public web edition, no account needed | `arcade.config.json` `leaderboard.topN`; `src/renderer/src/leaderboard/relay-store.ts`; `src/web/main.ts` scoresPage |
| Have a score with a self-chosen label appear on a public leaderboard | The player, via the game they are playing, which signs and publishes the score event with their Nostr key | `src/renderer/src/leaderboard/gamestr-reduce.ts` `parseSignedPlayerName` (`playerName` or `player` tag, trimmed, max 80 characters, control characters rejected), `parseSignedNip05` |
| Create a signed, shareable "challenge" naming an open window for a game (challenge name, max 60 characters) | Any visitor to the web edition with a Nostr signer | `src/web/main.ts` `createChallengeDialog`; `src/web/game-challenge.ts` |
| Create a signed, shareable game invitation link | Any visitor with a Nostr signer | `src/web/main.ts` `shareInvitation` |
| Send sats directly to a leaderboard player's own Lightning address, from the visitor's own wallet | Any visitor with a WebLN wallet, once a player's profile publishes a `lud16`/`lud06` address | `src/web/main.ts` `rewardDialog`, `rewardLightningAddress`; wallet-to-wallet, non-custodial, see section 4 |
| Upload a file, image, avatar or attachment through this app | **Nobody.** No such route exists in this repository | grep for `upload`/`multipart` across `src/` found only `src/main/local-server.ts`, which serves the operator's own locally installed game files to the kiosk, not a user-facing upload |
| Chat, comment, or send a private message | **Nobody.** No such feature exists | not found anywhere in `src/` |

Everything a stranger can read is rendered as plain text (`textContent`, not
`innerHTML`) in the renderer and web leaderboard panels, so a chosen player
label cannot inject markup or scripts into the page.
<!-- src/renderer/src/ui/leaderboard-panel.ts:368,376 nameEl.textContent, nip05.textContent -->

**Display names come from a Nostr profile (kind 0) first.** The leaderboard
resolves a friendly name from a live kind-0 profile lookup across the
configured relays where one exists, and only falls back to the self-chosen,
unverified `playerName`/`player` tag on the score event itself, then to a
shortened npub and a generated identicon.
<!-- src/renderer/src/leaderboard/profiles.ts:163-164 friendly = profile?.name ?? entry?.name ?? entry?.signedName ?? nip05 -->

**Impersonation and harassment risk from the fallback label.** Because the
fallback player label is free text chosen by whoever signs the score event
(up to 80 characters, only control characters excluded), a player without a
kind-0 profile could choose an abusive or impersonating label. This is the
one meaningful free-text surface in the app. It is narrow: no reply, no
mention, no thread, and every event is attributable to a Nostr public key
that signed it, which is a material difference from anonymous chat.

## 3. Children's access

There is no age check anywhere in this repository (checked `README.md`,
`SETUP.md` and the source under `src/`; no mention of a minimum age, an
adults-only claim, or any age-gating code was found). Leaderboards on both
public web editions are visible to anyone who loads the page, and the
Electron kiosk cabinet runs at public venues (conferences, booths). Under-18s
can certainly access the service; nothing in the code prevents or even asks
about it.

Because there is no chat, no messaging and no file upload, the child-safety
exposure surface is narrow compared with a social app: the realistic risks
are (a) an abusive or impersonating player label reaching a child viewing a
public leaderboard, and (b) a child being able to trigger the Lightning zap
flow if they have or can access a WebLN wallet (see section 4). `[DECISION:
whether the owner wants to state a minimum age or an adults-only position;
the code currently makes neither claim, so this document does not invent
one.]`

A full children's risk assessment in the Ofcom Part B style is likely
disproportionate for a leaderboard-only surface, but the owner should confirm
that judgement in legal review before relying on it.

## 4. Money and payments

- `arcade.config.json` sets a single fixed operator Lightning address for a
  "tip the arcade" prompt shown after a minimum play session. This is a
  direct donation to the operator, not a user-to-user transfer.
  <!-- arcade.config.json donation.address, donation.message, donation.minSessionSeconds -->
- The 600-edition web build additionally lets any visitor zap sats directly
  from their own WebLN wallet to a leaderboard player's own `lud16`/`lud06`
  Lightning address, pulled from that player's public Nostr profile. The app
  states, and the code confirms, that it never sees wallet credentials and
  never routes the payment through any wallet the app or cabinet holds; the
  visitor's wallet contacts the recipient's Lightning service directly.
  Optionally the sender can also publish a public Nostr zap receipt.
  <!-- src/web/main.ts rewardDialog copy "This arcade never sees wallet credentials or routes this through the cabinet wallet."; src/web/lightning-reward.ts -->
- `game.json` entries can also declare a `tips` Lightning address for a game
  developer (for example `games/pallasite/game.json`), used the same way.
- No card payments, no custodial wallet, and no in-app currency were found
  anywhere in this repository.
- A related sats faucet exists in a separate repository
  (`pallasite-faucet`), which was not investigated as part of this work and
  is out of scope here. Nothing in this repository's source references a
  faucet or embeds that project; grepping for "faucet" across the codebase
  found no hits, and the one hit for "pallasite" is the `games/pallasite`
  game tile itself, not the faucet.

## 5. Relays

The default leaderboard relay list in `arcade.config.json` includes a relay
the operator also runs, alongside several independent public Nostr relays.
Score events read from any of these relays are treated as untrusted until
their event ID, Schnorr signature and tag schema pass validation in the
client; an invalid or cheated-flagged event is discarded before it reaches
the board.
<!-- arcade.config.json leaderboard.relays; src/renderer/src/leaderboard/gamestr-reduce.ts isScoreEvent, hasTagValue(e.tags, 'cheated', 'true') -->

## 6. Priority content kinds: brief view

Given the narrow surface (no chat, no DMs, no uploads, no comments, one
signed and attributable free-text label field), most Ofcom priority illegal
content kinds are **negligible** for this app: no realistic route exists for
CSAM, grooming, terrorism material, extreme pornography, weapons, drugs, or
self-harm content to reach another user through the app itself.

The kinds worth naming are:

| Kind | Level | Why |
| --- | --- | --- |
| Harassment / impersonation | Low | The self-chosen player label (section 2) could carry an abusive or impersonating name. Narrow (no reply, no thread) and always tied to the signing key |
| Fraud | Low | Sats move wallet-to-wallet with no app custody; the main plausible harm is a fan zapping an impostor's key, which is limited by the display-name-from-kind-0 preference in section 2 |
| Hate | Negligible/Low | Same free-text surface as harassment, same narrow scope |

## 7. What removal is actually possible

See `docs/legal/report-handling.md` for the honest capability list: action is
only possible on the operator's own relay and on the app's own display of a
board, never network-wide across Nostr.

## Decisions for the owner

1. Whether to name a minimum age or adults-only position (none exists in the
   code today).
2. Who is the named person responsible for online safety and complaints.
3. Whether the owner agrees this shorter position paper is proportionate, or
   wants the fuller Ofcom-style risk assessment instead.
4. Confirm current UK user numbers, if tracked.
