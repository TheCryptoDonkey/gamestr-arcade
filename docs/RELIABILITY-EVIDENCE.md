# Reliability delivery evidence

Work in progress on 10 October 2026. This file separates implemented changes,
automated results, hosted artifacts and actual user/device acceptance.

## Local implementation and checks

- `npm run check`: passed 64 test files / 646 tests, typechecking, manifest and
  configuration validation, desktop build and both production web builds.
- Initial script for the 600 edition remains within the 150 kB build gate.
- Thirty browser journeys passed at `46e40d5`: both editions at 320, 390, 768,
  1024 and 1440 pixels plus CSS zoom; actual SDK NIP-07 login/refresh/account
  change/logout; draft retention and focus; Android method labels.
- Six additional reward checks passed in both editions: mobile QR/copy/link
  controls, keyboard recovery, one retained invoice after an uncertain WebLN
  response, cancellation during wallet approval and wrong-amount rejection.
  The invoice form is now bounded to the viewport and scrolls when it grows.
- Ten additional callback checks passed against the actual SDK in both editions:
  valid JSON/base64 returns, denial, expiry, tampering, replay, URL cleanup and
  identity-only restoration across reload.
- Pending NIP-07 restore followed by logout passed in both browser editions.
- Account preferences now offer an explicit guest import, preserve guest data
  and account isolation, keep focus across updates, and explain unavailable
  storage. The complete expanded browser suite passed all 30 journeys.
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
  build passed. The startup recovery check passes with full Chromium; the test
  now closes its first renderer before opening independent retry contexts and
  keeps the title active while measuring pre-PLAY loading. A perk touch-target
  measurement now waits for its existing scale entrance animation to finish,
  preserving the original 60px floor. The full release gate is running again.
  Draft [Ledger PR #88](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/88)
  contains the consumer; deployment remains pending.

Draft [PR #11](https://github.com/TheCryptoDonkey/gamestr-arcade/pull/11)
contains the implementation. Hosted [CI run 38057669320](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38057669320)
passed on review commit `0c76437`, including all browser checks, full audit,
CycloneDX SBOM and Linux AppImage packaging/checksums. The packaged Linux renderer also booted under Xvfb on `stall` with an isolated
public fixture and no signer/wallet. Its exact artifact commit was the GitHub PR
merge `b1cd286c8aef781429205b4e618a63abbee737f2`, with SHA-256
`38f29b8b884e2db7416887d0b9abab29d35cc6b2fbbcfa248def4e755ef178ee`.
The temporary runtime files were removed. This proves packaged startup, not
physical controller/cabinet acceptance. A follow-up clears saved login/callback state synchronously on
logout; its 11 targeted unit checks and three signing/logout browser journeys
passed. Hosted [CI run 38058055255](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38058055255)
also passed on the logout follow-up `6d68d93`. Commit `9c52a14` adds
`scripts/smoke-appimage.sh` to CI and uploads the runtime readiness/hash report;
hosted [CI run 38058669648](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38058669648)
passed on `6864d4b`, including the packaged Linux runtime check. Recheck relevant gates after any
further source changes and attach hosted CI/artifact evidence before release.

## Hosting and DNS

Deployment now targets SSH alias `stall`, the new Hetzner server at
`62.238.98.53`. Both static release directories and Caddy routes already exist
there. The standard public origin is
`https://gamestr.62-238-98-53.sslip.io/`; HTTPS and the configured CSP, HSTS,
frame protection and MIME protection headers were checked on the existing
July build. The standard edition's reliability changes are now deployed at
`46e40d5149f5030ddcc249ba731dcfc1317c2aa8`. Its public release metadata,
served JavaScript SHA-256 against the local build, protection headers, a
Pallasite deep link and the 390px login picker were verified; see
[public deployment evidence](evidence/gamestr-web-46e40d5.json).
[Hosted CI run 38060976679](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38060976679)
passed this source revision, including all 30 browser journeys and packaged
Linux startup. The 600 edition's new source revision has not yet been deployed.

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
- Hosted CI must remain green if further source changes are made; `46e40d5` passed the Linux runtime step.
- Ledger consumer release/deployment and same-player launch into all four games.
- Public DNS cutover and live exact-revision verification of both editions.
- Real mobile Lightning wallet payment with a separately authorised recipient
  and amount. Invoice display and wallet responses do not prove settlement.
- Real browser zoom and physical assistive-technology acceptance; CSS zoom checks alone do not prove these.

No goal is marked complete solely from unit tests or an implementation.
