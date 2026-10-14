# Gamestr web platform

## Product boundary

The web platform is a public arcade and discovery surface for Gamestr.io's
signed score network. Electron remains a hardened cabinet host for local
mirrors, native games, controller routing and a booth-owned payment wallet.
Both products read the same Manifest v2 files and Gamestr.io score parsers, so
the catalogue cannot silently fork into incompatible web and cabinet versions.

## First public slice

- responsive searchable catalogue with Featured, Trending, New and genre views;
- deep-linked game pages and verified global boards;
- broad, bounded Nostr relay subscription for kinds 30762 and 5555;
- local Schnorr verification before any score is displayed;
- Signet Access login with local/cross-device Signet, NIP-07, NIP-46 bunker,
  NostrConnect and Cambium/Amber Android choices, with no nsec, password or custodial account;
- sandboxed in-page play with a clear direct-origin fallback;
- developer guide generated around the same Manifest v2 contract;
- browser-side Manifest v2 validation and Signet-backed NIP-89 submissions;
- device-local favourites and followed-player verified activity;
- self-contained, seven-day signed game invitations with no messaging inbox;
- signed challenge links with bounded windows and live verified-score standings;
- direct player rewards through invoice QR, wallet links and optional WebLN;
- offline-capable PWA shell and locally hosted editorial art;
- strict script CSP, no analytics SDK and no first-party player database.

## Trust boundaries

```text
game publisher origin ──sandboxed iframe/direct link──> player browser
                                                      │
Nostr relays ──untrusted events──> bounded parser ──> signature check ──> board
                                                      │
Signet Access ──verified pubkey + optional signer─────> local identity label

Manifest v2 files ──build-time validation──> catalogue.json ──> web + cabinet
developer manifest ──same schema──> signer approval ──> signed NIP-89 receipt
```

Developer submission events use replaceable kind `31990` records with a stable
`d` tag (`gamestr-game:<gameId>`), the score event kind in `k`, and the game
origin in `web`. The signed event is a portable submission receipt, not an
automatic trust grant: the curated catalogue remains reviewed and build-time
validated. The page never accepts an `nsec`.

Favourites and follows are deliberately local browser preferences, bounded to
250 entries each. They are isolated by selected account, with separate guest preferences. An
explicit opt-in can merge and publish favourites and follows in a dedicated
kind-30078 arcade preference record. That public record does not modify a
NIP-02 contact list or establish a global social graph. Structured invitations use the application-local ephemeral kind `23033`
with `game`, reviewed origin `r`, and `expiration` tags. The complete signed
event travels inside the shared URL and is never published to relays; the receiver verifies its Schnorr
signature, seven-day maximum lifetime, and exact catalogue ID/origin match
before offering play. There is no free-text body, recipient database, relay
inbox, or private-message claim.

Challenges use a second application-local ephemeral envelope, kind `23034`,
and likewise never touch a relay as challenge-definition records. A creator
signs a name, reviewed game ID/origin, exact start, and end capped at seven
days. The challenge page verifies that definition, then derives standings from
the same signature-checked score stream by accepting only score timestamps
inside the signed window. There is no registration table, tournament backend,
or alternate score trust path.

Visible player identity is resolved from signed data in this order: the
player's latest kind-0 name, the player name signed by the game in the score
event, kind-0 or score-event NIP-05, then a shortened npub. Scores remain
attributed and linked to Gamestr.io in both the web app and cabinet.

Player zaps are resolved from the recipient's signed kind-0 `lud16` Lightning
address or `lud06` LNURL. After an explicit click, the browser resolves
LNURL-pay, enforces a 1–100,000 sat user-selected bound, checks the returned
BOLT11 amount exactly, and offers a locally generated QR, invoice copy and Lightning wallet link.
When available, WebLN opens the visitor's own wallet with the same invoice. This arcade does not proxy the request, handle a preimage, retain a
wallet connection, or expose the cabinet Phoenixd/NWC authority. Direct
LNURL-pay remains the privacy-first default. If the recipient supports NIP-57,
the sender may opt in to a public receipt; the UI explicitly warns that this
reveals the sender's signing identity, obtains a signature from the selected live signer on kind
`9734`, and sends that request only to the LNURL callback rather than publishing
it itself. Without either receive field, the UI tells the player how to enable
zaps in their Nostr profile.

The Connect Nostr control offers an arcade method picker, then delegates
My Signet, NIP-07 and NIP-46 to `signet-login` 0.17.3. Android uses an
uncompressed NIP-55 request accepted by Cambium and compatible with Amber.
The OS chooses the installed handler; the signed return is verified by the SDK. The allowed methods deliberately exclude
the SDK's in-memory nsec fallback. Identity-only Signet/Cambium/Amber sessions can read
personalised views; invitations, challenges, submissions and public zap
receipts require a live NIP-07 or NIP-46-capable signer.

The public web app never receives the cabinet NWC URI. A cross-origin game owns
its own wallet UX. The Electron cabinet may broker narrowly bounded payments,
but that authority stays in its main process and the hardened NWC gateway.

## Clone roadmap

This independent clone intentionally prioritises the jobs visible on gamestr.io today:
discovery, editorial filters, live scores, game pages, identity and developer
onboarding. It does not control, replace, redirect, or claim the upstream
`gamestr.io` domain. Remaining work should land in this order:

1. optional NWC providers selected and permissioned by the user;
2. optional Nostr-synchronised preference lists with local-first fallback;
3. an optional dedicated clone domain owned by this project.

Free-text direct messaging is not part of the arcade core. If social
coordination is added, it should use existing Nostr clients or explicit,
structured game invitations instead of creating another private-message silo.

## Deployment

`npm run build:web` emits a self-contained static release in `dist-web/`.
`scripts/deploy-web.sh` validates it, uploads it into a commit-addressed release
directory on the Hetzner host, and atomically swaps `/opt/gamestr-web/current`.
The tracked Caddy site in `deploy/web/gamestr-web.Caddyfile` supplies SPA fallback,
TLS, immutable asset caching, mutable shell caching and enforced security
headers. The clone is currently hosted at
`https://gamestr.62-238-98-53.sslip.io/`, which is also its canonical origin.
`GAMESTR_WEB_ORIGIN` may set a future project-owned domain at build time; no
deployment code modifies or depends on the upstream `gamestr.io` DNS zone.

### 600 Billion edition

The 600 Billion arcade is a build-time edition of this web app, not a fork. It
uses the same manifest, score verification, invitation, challenge and security
code while emitting a separate static release in `dist-web-600/`. Its catalogue
is a strict allow-list, so only Pallasite, Neon Sentinel, Hang On, Fren and Take Me To Your Ledger are
published in `catalogue.json` or prerendered as game routes.

```sh
npm run dev:web:600
npm run build:web:600
npm run validate:web:600
```

`npm run deploy:web:600` deploys that build to
`/opt/gamestr-web-600/current`; the tracked Caddy configuration serves it as
`arcade.600.wtf`. On 12 October 2026 the owner changed its DNS to a CNAME
pointing to `play.forgesworn.dev`, which resolves to `62.238.98.53`.
Caddy routes the original requested hostname, so Joystick and the 600 arcade
remain separate sites. If the target hostname moves servers, the CNAME follows
it. Normal DNS/HTTPS from a separate DigitalOcean host verifies the published
`c4b7929` release, strict headers and all twelve checked files per edition;
see [public cutover evidence](evidence/gamestr-public-dns-cutover-c4b7929.json).
Some resolver caches initially retained the retired address; those failures are
recorded separately from successful public checks. The edition definition lives in
`web.editions.json`, where its allow-list can be expanded without splitting the
codebase.

### Game definition review

The [600 game definition review](https://arcade.600.wtf/definitions/600/), linked
from the 600 edition footer, shows selected artwork, descriptions, current
keyboard actions and portrait/landscape phone layouts for all four titles.
Each card offers an inspector and a downloadable portable `game.json` draft.
The source files live in [examples/game-definitions/600](../examples/game-definitions/600/README.md).

CI validates the four complete definitions, checks sixteen phone/tablet layout
combinations, verifies that published downloads match the source bytes, and
exercises the page under a strict script CSP. The review uses separate external
scripts and styles, so it adds no preview code to the catalogue's initial bundle.

Hang On, Fren retains its live layout. The other three profiles remain proposed
until their publisher games implement phone handoff. Review publication does not
add phone compatibility to the live catalogue. Extra keyboard actions are
readable hints; complete custom-action remapping remains protocol work.

Legacy route compatibility is handled in the clone client: existing
`/player/<pubkey>` and `/score/<event>` links remain canonical, the older
four-segment score route resolves its final event ID, and `/game/naddr…` links
decode their NIP-19 identifier. Known renamed games map explicitly; unavailable
legacy games receive an honest retired-game page instead of launching an
unrelated title or silently dropping visitors on the homepage.
