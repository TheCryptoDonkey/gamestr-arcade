# Privacy notice

> **DRAFT for legal review, 25 September 2026.** Drafted from the code on
> `main` (c782894) for the owner to check, complete and sign. It has not been
> reviewed by a lawyer and it is not legal advice. HTML comments name the
> code behind each statement; remove them when the page is built.

## 1. Who we are

gamestr-arcade is run by `[Operator]`. For UK data protection law we are the
controller of the personal data described here. Contact us about anything in
this notice at `[contact address]`.

`[DECISION: the entity that is the controller, and whether it pays the ICO
data protection fee.]`

## 2. The short version

- You can view every leaderboard, on the kiosk cabinet or on the web, without
  an account.
- We never receive your private key. Signing a score, a challenge or a zap
  happens in your own Nostr signer or wallet.
- Leaderboards, challenges and invitations you create through a game are
  public Nostr events, copied by relays run by other people. We cannot
  delete those copies.
- We do not sell your data, we do not show adverts, and this app does not
  send you email.
- We hold no money. Lightning zaps go directly from your wallet to the
  recipient's own address.
- The app makes no age claim and has no age check (see section 9).

## 3. Things we never collect

- **Your private key.** No route in this repository accepts a private key or
  an `nsec`. Signing scores, challenges and invitations happens in your own
  Nostr signer.
  <!-- No Nostr key-entry UI found in src/; signing is delegated to currentNostrSigner()/connectIdentity() in src/web/main.ts and src/renderer/src/nostr-access -->
- **Your wallet connection or credentials.** Lightning zaps go through your
  own WebLN-capable wallet extension; the app states, and the code confirms,
  that it never sees the credentials and does not route the payment through
  any wallet it holds.
  <!-- src/web/main.ts rewardDialog copy and rewardLightningAddress -->
- **Card or bank details.** This app takes no card payments; no card
  processor exists in the codebase.

## 4. What we collect and why

### 4.1 Scores and player identity

**What.** A numeric score, the game it belongs to, and, where the game
supplies them, an optional self-chosen player label (up to 80 characters) and
an optional NIP-05 address, all read from a Nostr score event (kind `30762`,
or the legacy kind `5555`) that the game signed with the player's key and
published to Nostr relays.
<!-- src/renderer/src/leaderboard/gamestr-reduce.ts parseScoreEvent, parseSignedPlayerName, parseSignedNip05 -->

**Why.** To show a verified leaderboard. Every event's ID and Schnorr
signature are checked before it is shown; events flagged `cheated` or that
fail validation are dropped.

**Also.** Where a player has a Nostr profile (kind 0), we prefer its name,
picture and NIP-05 over the self-chosen label. We open a short-lived,
read-only connection to the configured relays to fetch that profile; it is
not stored by this app beyond the running session's in-memory cache.
<!-- src/renderer/src/leaderboard/profiles.ts resolveProfiles, profile-cache.ts -->

**Pictures.** A profile picture, where a player has one, loads straight from
the address in their Nostr profile, so whoever hosts that picture can see the
IP address of anyone viewing the leaderboard it appears on.

### 4.2 Challenges and invitations

**What.** If you create a challenge or an invitation link in the web edition,
it is a Nostr event you sign yourself: a challenge name (up to 60
characters), a duration, and the game it applies to; or an invitation naming
a game.
<!-- src/web/main.ts createChallengeDialog, shareInvitation; src/web/game-challenge.ts -->

**Why.** So you can share a link that others can open to see the same
challenge or join the same game. We do not store these; they exist as the
signed event itself, and as the link you choose to share.

### 4.3 Payments

We never hold money.

| Record | What it holds | Why |
| --- | --- | --- |
| A Lightning zap to a leaderboard player | Nothing kept by this app. Your wallet requests an invoice directly from the player's own Lightning service and pays it | Wallet-to-wallet payment, no app custody <!-- src/web/lightning-reward.ts; rewardDialog copy --> |
| A public Nostr zap receipt (optional) | If you tick the box, a signed public zap event naming your signing identity, published to relays | Only if you choose to make the zap public <!-- src/web/main.ts publicZap checkbox --> |
| The "tip the arcade" donation | A single fixed operator Lightning address configured in `arcade.config.json`. No record of who tips or how much is kept by this app | Keeps the games free <!-- arcade.config.json donation --> |

When you zap a player or tip the arcade, your wallet's Lightning service
contacts the recipient's Lightning service directly to request an invoice.
This app is not in that path and does not see or record the payment.

### 4.4 Relay connections

**What.** To read and show leaderboards and profiles, this app opens
WebSocket connections to the relays configured for it, which include a relay
the operator also runs and several independent public relays. Relay
operators can see the IP address of whoever connects to them, and can see
which score and profile events are requested, in the ordinary way any Nostr
client works.
<!-- arcade.config.json leaderboard.relays; src/renderer/src/leaderboard/relay-store.ts; src/renderer/src/ui/relay-panel.ts lets an operator add or remove relays -->

**Why.** To show the leaderboard at all. This app does not run its own relay
and does not choose what a relay operator logs.

### 4.5 Operator and kiosk configuration

**What.** The kiosk cabinet's operator can add, enable, disable or remove
relays through a hidden relay panel. This is a local, per-installation
setting, not account data about a visitor.
<!-- src/renderer/src/ui/relay-panel.ts -->

## 5. How long we keep information

This app keeps no server-side account records, no database and no
server-side logs of visitors: it is a client (the Electron kiosk cabinet, or
a static web build) that reads already-public Nostr events from relays at
view time and does not persist them beyond the running session's in-memory
cache and the browser's own local storage of your relay list and settings.
<!-- No server component found beyond src/main/local-server.ts, which serves locally installed game files to the kiosk and holds no visitor data -->

Scores, challenges and invitations you or a game publish to Nostr relays are
held by those relays, run by other people, under their own retention rules.
We cannot delete those copies.

`[LEGAL REVIEW: confirm this is accurate for both web editions as deployed,
and for the analytics or hosting layer in front of `arcade.600.wtf`, if any
is added outside this repository.]`

## 6. Our lawful bases

`[LEGAL REVIEW: proposed bases.]`

| Purpose | Basis |
| --- | --- |
| Showing a verified leaderboard | Legitimate interests (running the service you are using) |
| Resolving a player's Nostr profile for display | Legitimate interests |
| Relay connections needed to read and show scores | Legitimate interests |

## 7. Who else receives data

- **Nostr relays**, including a relay the operator also runs and several
  independent public relays. Score events, profiles, challenges and
  invitations you or a game publish are public and can be copied by any
  relay, anywhere in the world.
- **Lightning services.** When you zap a player or tip the arcade, your
  wallet, and for player zaps the player's own Lightning service, are
  contacted directly. This app is not in that path.
- **NIP-05 domains.** Where a score event or profile carries a NIP-05
  address, resolving it means asking that address's own domain.

We do not use an email service, an analytics company or an error-tracking
company in this repository. `[LEGAL REVIEW: confirm nothing is added at the
hosting layer for `arcade.600.wtf` outside this repository.]`

## 8. Your rights

Because this app holds no server-side account records about you, most of what
you might ask us to change lives on Nostr relays we do not run, or in your
own browser or wallet. You can:

- ask us what, if anything, we hold about you at `[contact address]`;
- clear your own relay list and settings from your own browser or device at
  any time;
- ask the Nostr relays you or a game published to directly about their own
  retention and deletion.

You can complain to the Information Commissioner's Office (ico.org.uk). We
would like the chance to put things right first.

## 9. Children

This app makes no age claim and no age check exists in the code (checked
`README.md`, `SETUP.md` and `src/`). Leaderboards are visible to anyone who
opens the kiosk or either public web edition, so under-18s can and do access
it. `[DECISION: whether the owner wants to state a minimum age.]` See
`docs/legal/online-safety-position-draft.md` section 3.

## 10. Automated decisions

We make no decisions about you by automated means that have legal or
similarly significant effects.

## 11. Changes

If we change this notice, we will say so alongside the app.

---

## Open points in this notice

1. The controller entity, contact address, and the ICO fee (decision).
2. Whether a minimum age is stated.
3. Confirm nothing outside this repository (hosting, analytics, a reverse
   proxy in front of `arcade.600.wtf`) collects data this notice does not
   cover.
