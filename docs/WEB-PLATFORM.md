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

The public web app never receives the cabinet NWC URI. A cross-origin game owns
its own wallet UX. The Electron cabinet may broker narrowly bounded payments,
but that authority stays in its main process and the hardened NWC gateway.

## Replacement roadmap

The first slice intentionally prioritises the jobs visible on gamestr.io today:
discovery, editorial filters, live scores, game pages, identity and developer
onboarding. Remaining replacement work should land in this order:

1. tournaments, follows, favourites and structured game invitations;
2. web-native rewards through user-owned WebLN/NWC, never the booth wallet;
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
