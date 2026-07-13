# Gamestr web platform

## Product boundary

The web platform is the public arcade, discovery surface and verified-score
network. Electron remains a hardened cabinet host for local mirrors, native
games, controller routing and a booth-owned payment wallet. Both products read
the same Manifest v2 files and score parsers, so the catalogue cannot silently
fork into incompatible web and cabinet versions.

## First public slice

- responsive searchable catalogue with Featured, Trending, New and genre views;
- deep-linked game pages and verified global boards;
- broad, bounded Nostr relay subscription for kinds 30762 and 5555;
- local Schnorr verification before any score is displayed;
- NIP-07 public-key connection with no nsec, password or custodial account;
- sandboxed in-page play with a clear direct-origin fallback;
- developer guide generated around the same Manifest v2 contract;
- browser-side Manifest v2 validation and NIP-07-signed NIP-89 submissions;
- device-local favourites and followed-player verified activity;
- self-contained, seven-day signed game invitations with no messaging inbox;
- signed challenge links with bounded windows and live verified-score standings;
- direct player rewards through the visitor's own WebLN wallet;
- offline-capable PWA shell and locally hosted editorial art;
- strict script CSP, no analytics SDK and no first-party player database.

## Trust boundaries

```text
game publisher origin ──sandboxed iframe/direct link──> player browser
                                                      │
Nostr relays ──untrusted events──> bounded parser ──> signature check ──> board
                                                      │
NIP-07 extension ──public key only────────────────────> local identity label

Manifest v2 files ──build-time validation──> catalogue.json ──> web + cabinet
developer manifest ──same schema──> NIP-07 approval ──> signed NIP-89 receipt
```

Developer submission events use replaceable kind `31990` records with a stable
`d` tag (`gamestr-game:<gameId>`), the score event kind in `k`, and the game
origin in `web`. The signed event is a portable submission receipt, not an
automatic trust grant: the curated catalogue remains reviewed and build-time
validated. The page never accepts an `nsec`.

Favourites and follows are deliberately local browser preferences, bounded to
250 entries each. They are not uploaded to Gamestr or presented as a global
social graph. Structured invitations use the application-local ephemeral kind `23033`
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

Player rewards are resolved from the recipient's signed kind-0 `lud16`
Lightning address. After an explicit click, the browser resolves LNURL-pay,
enforces a 1–100,000 sat user-selected bound, checks the returned BOLT11 amount
exactly, and only then calls the visitor's injected WebLN provider. Gamestr
does not proxy the request, handle a preimage, retain a wallet connection, or
expose the cabinet Phoenixd/NWC authority. This first reward slice is a direct
Lightning payment rather than a public NIP-57 zap receipt.

The public web app never receives the cabinet NWC URI. A cross-origin game owns
its own wallet UX. The Electron cabinet may broker narrowly bounded payments,
but that authority stays in its main process and the hardened NWC gateway.

## Replacement roadmap

The first slice intentionally prioritises the jobs visible on gamestr.io today:
discovery, editorial filters, live scores, game pages, identity and developer
onboarding. Remaining replacement work should land in this order:

1. optional signed NIP-57 zap receipts and NWC providers selected by the user;
2. optional Nostr-synchronised preference lists with local-first fallback;
3. domain cutover, redirects and long-term compatibility for old score URLs.

Free-text direct messaging is not part of the arcade core. If social
coordination is added, it should use existing Nostr clients or explicit,
structured game invitations instead of creating another private-message silo.

## Deployment

`npm run build:web` emits a self-contained static release in `dist-web/`.
`scripts/deploy-web.sh` validates it, uploads it into a commit-addressed release
directory on the Hetzner host, and atomically swaps `/opt/gamestr-web/current`.
The tracked Caddy site in `deploy/web/gamestr-web.Caddyfile` supplies SPA fallback,
TLS, immutable asset caching, mutable shell caching and enforced security
headers. The sslip.io hostname is a temporary preview; the final domain is a DNS
and Caddy-site change, not an application rebuild.

`deploy/web/gamestr-web.production.Caddyfile` is the final apex site and sends
`www` plus the temporary preview hostname to the canonical origin while
preserving every path. `scripts/cutover-web-domain.sh` refuses to install it
until both apex and `www` resolve to `95.217.39.110`, then validates Caddy,
reloads it, and proves the HTTPS application shell. The current authoritative
PortFast zone still points the apex to `185.18.221.186`; changing those DNS
records is the only external cutover action remaining.
