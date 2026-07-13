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
```

The public web app never receives the cabinet NWC URI. A cross-origin game owns
its own wallet UX. The Electron cabinet may broker narrowly bounded payments,
but that authority stays in its main process and the hardened NWC gateway.

## Replacement roadmap

The first slice intentionally prioritises the jobs visible on gamestr.io today:
discovery, editorial filters, live scores, game pages, identity and developer
onboarding. Remaining replacement work should land in this order:

1. player profiles and canonical score-event detail routes;
2. signed catalogue submissions and developer self-service validation;
3. tournaments, follows and opt-in activity notifications;
4. web-native rewards through user-owned WebLN/NWC, never the booth wallet;
5. domain cutover, redirects and long-term compatibility for old score URLs.

Free-text direct messaging is not part of the arcade core. If social
coordination is added, it should use existing Nostr clients or explicit,
structured game invitations instead of creating another private-message silo.

## Deployment

`npm run build:web` emits a self-contained static release in `dist-web/`.
`scripts/deploy-web.sh` validates it, uploads it into a commit-addressed release
directory on the Hetzner host, and atomically swaps `/opt/gamestr-web/current`.
The tracked Caddy site in `deploy/web/gamestr-web.caddy` supplies SPA fallback,
TLS, immutable asset caching, mutable shell caching and enforced security
headers. The sslip.io hostname is a temporary preview; the final domain is a DNS
and Caddy-site change, not an application rebuild.
