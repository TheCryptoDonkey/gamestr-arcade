# Reliability delivery evidence

Work in progress on 10 October 2026. This file separates implemented changes,
automated results, hosted artifacts and actual user/device acceptance.

## Local implementation and checks

- The next revision passed all 38 browser journeys before the My Signet
  callback follow-up. Added completed-challenge checks receive signed scores
  inside and outside an old challenge window, exclude the outside score and
  disclose that complete history has not been established in both editions.
- Developer publication checks use actual SDK NIP-07 login, hold signing and
  relay acknowledgement separately, and verify that a signed profile update
  and logout preserve the draft and visible publication state. Only fixture
  relay sockets receive the test submission. The editor now locks draft edits
  during publication and distinguishes signer approval from relay publication.
- My Signet URL callbacks incorrectly carried `signet_amber=1`, which made the
  SDK reject their signed proof as a missing Android event. Both editions
  reproduced the failure before the marker was removed. Denial returns are
  also detected without a saved account. Four targeted browser checks passed
  for signed proof, retained destination, denial, URL cleanup and replay
  rejection. These are protocol fixtures using the installed SDK; the normal
  My Signet same-device flow opens a separate tab and uses relay approval, so
  this result does not establish a live or physical signer journey.
- The complete callback follow-up suite passed all 42 journeys. One earlier
  run exhausted its total test deadline before observing a five-second replay
  error; callback checks now wait for DOM readiness and assert application
  state directly instead of waiting for unrelated page resources.
- Genuine Chromium zoom found an account-menu logout option outside the
  viewport. The menu now scrolls within a bounded viewport height. Both added
  320-by-240 browser checks pass with actual SDK login, measured menu bounds,
  scrolling and logout. The full CI suite now contains 44 checks; genuine
  200%/400% zoom re-verification is still in progress.
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
- The expanded suite now passes 32 journeys. Real signed relay profile/score
  events preserve search, genre, selected filters and keyboard focus in both
  editions. The developer draft checks now use actual SDK login and a signed
  profile update; both strengthened checks pass separately. Filter buttons now
  update their visible selection and `aria-pressed` together.
- A real browser child-port signed a score, then remained revoked through logout
  and re-login to the same key.
- Unit regressions cover selected keys/templates, late login/restore,
  synchronous port revocation, in-flight signing, game scope/concurrency,
  Android callback denial/tampering/expiry/replay, score impersonation,
  personal records, cache revalidation, exact event lookup, account isolation,
  preference-sync consent and invoice validation/fallback.
- A launched Electron game failed to receive its guest signer/return controls
  because its sandboxed preload was emitted as ESM. Preloads now emit bundled
  CommonJS. Native Electron journeys pass keyboard carousel navigation, actual
  game launch/Escape return, verified guest signing, fresh keys/storage/cookies
  on relaunch, and absent wallet/Node/shell access without a wallet grant.
  `scripts/appimage-journeys.mjs` adds those journeys to the packaged Linux CI
  check. The new packaged revision still needs its hosted runtime verification;
  this fixture does not clear physical controller or configured-wallet budgets.
- The first packaged journey CI run reached and verified the first game's
  signer, then exposed a relaunch race in the harness. It now waits for the
  reopened ready panel and returned shell focus. The complete native journey
  passes with these waits. Hosted
  [CI run 38063261933](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38063261933)
  passed on `640fbaa`: 646 unit tests, all 32 browser journeys, both production
  web builds, audit/SBOM, Linux packaging and the complete packaged game journeys.
  Physical controller and configured-wallet acceptance remain pending.
- Standard-edition home and game pages now visibly explain independent
  publisher login, including on phones; this was previously only a tooltip.
  The four affected login/viewport browser journeys pass in both editions.
- An audit found the incomplete-history disclosure was limited to challenges.
  Main score boards, game boards, personal bests and the cabinet now explain
  that relay history may be incomplete. Two additional browser journeys pass:
  an old exact-ID score resolves without the recent feed, invalid proof finishes
  with a validation error, and an empty relay query finishes with a retry action.
- Strengthening the retained-record test with a third player reproduced loss
  of an older stronger record when the record cap filled, in both ascending
  and descending games. Record eviction now removes the lowest-ranked entry
  rather than the oldest entry. All 18 catalogue/cache/lookup checks pass with
  the saturated-cap regressions; recent activity retains its separate limit.
- Hosted run `38064295383` passed all 34 browser journeys and packaged gameplay
  on `1604e42`. The record follow-up's run `38064720700` passed source/browser
  checks but failed the first trusted-keyboard assertion after guest signing.
  The fixture could use ready preload IPC before the application revealed and
  focused the game view. It now waits for the real completed/focused document
  and delivery of its single trusted keypress. The complete native journey
  passes with this wait; the next packaged Linux run remains pending.
- [Hosted run 38065117909](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38065117909)
  passed `ddd2389`, including all 34 browser journeys and complete packaged
  Linux gameplay with the real-focus wait. The stronger-record source is
  included in that passing build.
- Installed `signet-login`: 0.17.3. Rendezvous uses SDK defaults separately from
  score relays. Private-key paste remains excluded.
- `npm audit --audit-level=high`: passed, no high/critical findings. Eight
  moderate findings remain in the Electron packaging dependency chain.
- Ledger consumer checkout: unit suite passed 28 files / 261 tests and production
  build passed. The startup recovery check passes with full Chromium; the test
  now closes its first renderer before opening independent retry contexts and
  keeps the title active while measuring pre-PLAY loading. A perk touch-target
  measurement now waits for its existing scale entrance animation to finish,
  preserving the original 60px floor. An onboarding composition check now holds
  the scene at its first visible prompt while the CSS entrance settles, retaining
  its original distance/layout assertions. Both targeted profiles passed, but
  the full release gate stopped again on a cow already 6.86 units away at the
  opening prompt. The opening animal starts wandering during the five-second
  title before the player receives beam instructions. Ledger now keeps that
  first animal grazing through a first-time pilot's opening cue; this product
  fix passed the existing desktop and both phone onboarding checks with the
  animal 2.3 units away, plus all 261 unit tests and the production build.
  The complete release gate is now running on Ledger commit `a30533e`.
  That run subsequently stopped on a shack whose group origin was 0.97 units
  above ground, although its visible foundation extends below that origin.
  The grounding profile now measures the geometry base, retains the 0.9-unit
  requirement and checks that deliberately raising the geometry is detected.
  All seven lands pass that targeted check. The full gate on `7d9b82e` passed
  grounding, onboarding, extraction, harvest reports and native cargo, then
  stopped before the WebKit media assertions on a 30-second `networkidle`
  navigation timeout. An unchanged targeted rerun reproduced that timeout.
  The media probe now waits for DOM readiness and its existing game/PLAY
  conditions while preserving all rendering, decoding and playback assertions;
  both targeted browser engines pass the complete probe. Ledger commit
  `fc7f845` contains that readiness fix. Its subsequent full gate stopped at
  startup: the compressed cold core measured 263,173 bytes against the retained
  263,168-byte ceiling. The budget has not been raised. No complete Ledger
  release pass is claimed yet.
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
The standard edition has since been updated to `3f30f8691b574401161fcc28e31e55398e9479a4`.
[Hosted CI run 38063563955](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38063563955)
passed all 32 browser journeys and the complete packaged Linux game journeys.
The public release metadata, exact served entry bytes, security headers and
Pallasite deep link match the local production build; see
[current public deployment evidence](evidence/gamestr-web-3f30f86.json).
The deployed standard app also created a real exact-amount 100-sat invoice from
Wallet of Satoshi in a 390px browser: QR and matching wallet link appeared with
no page errors. Only the signed recipient profile was a disposable fixture;
provider metadata and invoice requests were real browser requests. This check
did not invoke a wallet or send payment; see
[real provider invoice evidence](evidence/gamestr-live-reward-46e40d5.json).
The current standard release is now `ddd2389c50e3c8e576ca0ea5fa7f0aecad2da7ab`.
Its release metadata, served JavaScript bytes, headers and deep link were
verified again; see [current release proof](evidence/gamestr-web-ddd2389.json).
A live 320px browser showed the publisher-login explanation without horizontal
overflow and the incomplete-history notes on game, score and personal-best
pages; only relay traffic was isolated. See
[mobile history disclosure proof](evidence/gamestr-live-history.json).
The matching 600 build is uploaded to
`/opt/gamestr-web-600/releases/ddd2389c50e3` on `stall`; its metadata identifies
the full revision and edition. Its active symlink remains the July release
until the Ledger consumer is ready. Direct HTTPS to the new server serves the
600 route, but public DNS still points at the retired server. No DigitalOcean
CLI/configuration was found on `stall` either.

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
- Hosted CI must remain green if further source changes are made; `ddd2389` passed the complete packaged Linux gameplay step.
- Ledger consumer release/deployment and same-player launch into all four games.
- Public DNS cutover and live exact-revision verification of both editions.
- Real mobile Lightning wallet payment with a separately authorised recipient
  and amount. Invoice display and wallet responses do not prove settlement.
  The user authorised 100 sats to `profusemeat89@walletofsatoshi.com`; the
  address's public LNURL metadata accepts that amount. No payment has been sent.
  Arcade's actual invoice function returned and validated a 100,000-msat invoice
  with a 24-hour expiry. Wallet of Satoshi is installed on the paired iPhone 13
  Pro Max, Donkeyfarm; device tools launched it with that invoice. Its screen,
  confirmation and settlement cannot be observed through those tools. Awaiting
  the user's physical result; wallet launch alone does not prove payment.
- Real browser zoom and physical assistive-technology acceptance; CSS zoom checks alone do not prove these.

No goal is marked complete solely from unit tests or an implementation.
