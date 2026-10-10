# Reliability delivery evidence

Work in progress on 10 October 2026. This file separates implemented changes,
automated results, hosted artifacts and actual user/device acceptance.

## Local implementation and checks

- `npm run check`: passed 64 test files / 646 tests, typechecking, manifest and
  configuration validation, desktop build and both production web builds.
- Initial script for the 600 edition: 140.89 kB, within the 150 kB build gate.
- Eight browser journeys passed: both editions at 320, 390, 768,
  1024 and 1440 pixels plus CSS zoom; actual SDK NIP-07 login/refresh/account
  change/logout; draft retention and focus; Android method labels.
- A real browser child-port signed a score, then remained revoked through logout
  and re-login to the same key.
- Unit regressions cover selected keys/templates, late login/restore,
  synchronous port revocation, in-flight signing, game scope/concurrency,
  Android callback denial/tampering/expiry/replay, score impersonation,
  personal records, cache revalidation, exact event lookup, account isolation,
  preference-sync consent and invoice validation/fallback.
- Installed `signet-login`: 0.17.3. Rendezvous uses SDK defaults separately from
  score relays. Private-key paste remains excluded.
- `npm audit --audit-level=high`: passed, no high/critical findings. Eight
  moderate findings remain in the Electron packaging dependency chain.
- Ledger consumer checkout: unit suite passed 28 files / 260 tests and production
  build passed. Its full release gate stopped at `tests/startup.mjs:153`, waiting for the
  simulated scoring-chunk failure to produce a recoverable menu state.
  That failure needs diagnosis before consumer release. Consumer deployment remains pending.

These results precede the final review commit. Recheck relevant gates after any
further source changes and attach hosted CI/artifact evidence before release.

## Hosting and DNS

Deployment now targets SSH alias `stall`, the new Hetzner server at
`62.238.98.53`. Both static release directories and Caddy routes already exist
there. The standard public origin is
`https://gamestr.62-238-98-53.sslip.io/`; HTTPS and the configured CSP, HSTS,
frame protection and MIME protection headers were checked on the existing
July build. The reliability changes have not yet been deployed.

DigitalOcean is authoritative for `600.wtf`:
`ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`.
The `arcade.600.wtf` A record still resolves to retired server `95.217.39.110`.
The server route alone does not complete migration. No DigitalOcean API token
or configured CLI was found in the current task environment.

In DigitalOcean's domain settings for `600.wtf`, change the existing `arcade`
A record to `62.238.98.53`. Preserve unrelated records. Then verify public DNS,
certificate issuance, both editions' exact release revisions and a deep link.
The deploy script requires a clean committed checkout and writes `release.json`
with the full commit and edition; static assets are uploaded before the current
release symlink changes.

## Remaining acceptance

- Physical My Signet local and cross-device pairing, refresh, sleep and retry.
- Actual Android browser → Cambium and Amber → browser return, plus iPhone
  controls. NIP-55 currently supplies identity; signing actions require a live
  My Signet, NIP-07 or NIP-46 connection.
- Hosted CI, Linux AppImage packaging and Linux runtime smoke.
- Ledger consumer release/deployment and same-player launch into all four games.
- Public DNS cutover and live exact-revision verification of both editions.
- Real mobile Lightning wallet payment with a separately authorised recipient
  and amount. Invoice display and wallet responses do not prove settlement.
- Expanded browser acceptance for reward/dialog cancellation, account-scoped
  preferences and callback rendering. CSS zoom checks do not prove real browser
  zoom or physical assistive-technology acceptance.

No goal is marked complete solely from unit tests or an implementation.
