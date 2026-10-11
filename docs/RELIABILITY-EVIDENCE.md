# Reliability delivery evidence

Work in progress on 11 October 2026. This file separates implemented changes,
automated results, hosted artifacts and actual user/device acceptance.

## Latest live My Signet result

Both arcade web editions now serve functional revision `4aa7661` on Hetzner.
Stored bunker identities appear while their remote signer reconnects in the
background, so an unavailable signer does not hide account reconnection.
All 652 unit tests and 50 browser journeys pass locally. Hosted CI passes the complete
gate on an unchanged rerun; intermittent native input remains open. Root/game
HTML, all seven JS/CSS assets, release metadata and security headers match both
builds. See [standard deployment](evidence/gamestr-web-4aa7661.json),
[600 forced-origin deployment](evidence/gamestr-600-live-4aa7661.json) and
[CI qualification](evidence/gamestr-4aa7661-ci.json).

Native revision `8c3ed43` passed hosted run `38093120288`, including the
original trusted-keyboard gameplay/return assertions. The downloaded AppImage
matches both its SHA256SUMS and runtime report; the tested merge tree matches
the source tree. See [current package proof](evidence/gamestr-native-8c3ed43-ci.json).
The ReadyPanel stale focus request is repaired and regression-tested. These
results do not explain every historical intermittent input failure or establish
physical-controller acceptance or delivery of a consumer package update.

All four supported games now have real My Signet, normal-gameplay and attributed
public-score proofs. The latest Pallasite run earned 16,563 points: canonical
same-account signing, confirmed publication, an independent game-authority
signature check and the fresh arcade event page all pass. See
[run](evidence/gamestr-pallasite-live-run-4aa7661.json),
[public event](evidence/gamestr-pallasite-real-score-4aa7661.json) and
[display](evidence/gamestr-pallasite-real-score-ui-4aa7661.json).
The public standard edition also displayed that exact score and player without
forced DNS; see [standard display proof](evidence/gamestr-pallasite-standard-score-ui-4aa7661.json).
The [public score page](https://gamestr.62-238-98-53.sslip.io/score/256785414a41d8659c61ea97de885e6855c22d3864dab0cd28bca634a3b548e3)
is accessible while the 600 DNS cutover remains pending.
Those first four runs used separate disposable accounts. The single-account
matrix now passes as described below. Physical acceptance, co-op timing,
native input, DNS cutover and payment confirmation remain open.

A subsequent longer-session run earned 16,490 points after a normal 190-second
pause. The first score signing attempt timed out; the game retained the earned
public receipt under the selected account. RECONNECT IN ARCADE exposed the
account control, explicit My Signet approval restored that same account, and
RETRY SCORE in the new game tab published the original score. The NIP-98
signature matches the original player, HTTP 200 confirms publication to all
seven relays, and independent relay verification and fresh displays in both
editions match the saved receipt. See [recovery run](evidence/gamestr-pallasite-pause-recovery-live-run.json),
[public event](evidence/gamestr-pallasite-pause-recovery-real-score.json),
[600 display](evidence/gamestr-pallasite-pause-recovery-real-score-ui.json) and
[public standard display](evidence/gamestr-pallasite-pause-recovery-standard-score-ui.json).
This verifies live saved-score recovery in browser automation. It does not
establish the precise cause of signer expiry or physical-phone behaviour.

The single-account four-game matrix also passes on the deployed Hetzner 600
edition using one fresh disposable My Signet identity. Normal gameplay earned
Ledger 100, Hang On Fren 4,331, Neon Sentinel 7,401 and Pallasite 19,295.
Explicit My Signet approval preceded each game; canonical NIP-98 signatures
and independently verified public score events all bind to that same player.
Fresh pages in both editions display all four exact events, scores and player
links with REVIEWED GAME AUTHORITY. See [shared-account runs](evidence/gamestr-shared-account-matrix.json)
and [eight display checks](evidence/gamestr-shared-account-matrix-ui.json).
Pallasite's HTTP 200 and seven-relay confirmation were captured; the other
three runs rely on their verified public events rather than an uncaptured HTTP
response. Entry assets match the known Ledger and Pallasite deployments.
Hang On Fren reports public build `20260722211910`; Neon Sentinel reports
`20260722205954`. Their exact entry asset hashes are recorded, while their Git
revisions remain unknown. The matrix uses forced 600 DNS resolution and browser
automation, so public DNS and physical acceptance remain separate gates.

The browser suite now has 50 passing journeys. Two new private-fixture checks
verify that blocked popups preserve the account and show useful next steps,
and that the platform's modifier-click opens a game without an identity proof
or opener. A local HTTP publisher fixture handles native first-tab navigation
without relying on browser request interception. The earlier modifier fixture
failed to intercept that native navigation; it was not evidence of a product
login failure. An initial live-matrix verifier also used a multi-letter relay
filter; the corrected verifier uses the indexed player tag and validates the
game tag after receipt, as defined by [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md).
The initial Ledger score was independently retrieved; the completed four-game
matrix uses a fresh single account and the corrected read-only verifier.

Published-consumer fallback checks use disposable canonical signing fixtures,
with all non-GET HTTP requests and public relay sockets blocked. Ledger, Hang
On Fren, Neon Sentinel and Pallasite expose independent Nostr login controls
after reload and after a 31-day-old handoff proof. The first three show guest
status; Pallasite reaches its sign-in chooser through Player 1 and Start Solo
on the restored booth route. The original account is not reactivated. Consumed proof
fragments are removed. These are visible-control checks, not completed provider
logins or physical acceptance. See [Ledger fallbacks](evidence/gamestr-published-ledger-fallbacks.json)
and [older-game fallbacks](evidence/gamestr-published-older-game-fallbacks.json),
plus [Pallasite fallbacks](evidence/gamestr-published-pallasite-fallbacks.json).

Pallasite also retains an unchanged, account-bound public receipt when the
parent arcade closes: retry times out after about 30 seconds, returns to the
waiting state without a score HTTP attempt, and RECONNECT IN ARCADE returns
to `/game/pallasite` without an authentication fragment. This particular
receipt was seeded in the private fixture, rather than earned in gameplay;
the separate real earned-score recovery above remains the publication proof.
See [closed-parent fixture](evidence/gamestr-published-pallasite-closure.json).
Full per-game closure coverage remains open.

Tracing the older published Hang On Fren consumer exposed a personal-score
fallback to a guest key after signer failure. That historical deployment has this
behaviour. The replacement in [Hang On Fren PR 2](https://github.com/TheCryptoDonkey/hang-on-fren-public/pull/2)
pins the run identity, rejects account/template substitution and revoked
sessions, retains public receipts and offers explicit same-account retry.
All 206 local tests, client/server builds and a private browser recovery flow
pass, including closed parent, reload, wrong account, selected saved runs and
390-pixel controls. Its browser claim response is simulated, with all external
writes blocked. Client revision `2c6716f` is now published on the new Hetzner box; the
HTML, metadata, entry JS/CSS and both SDK bundles match the tested artifact.
See [public deployment](evidence/hangonfren-live-2c6716f.json). The Actions SSH
key was rejected before upload, so publication used the established `stall`
SSH access and an atomic client-release switch. An actual earned-score retry
remains required. The relevant source is `hang-on-fren-public`; the similarly named
`hang-on-fren` checkout is an older release copy.

The previous `0948199` deployment and
[CI 38073823914](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38073823914)
verified the original held-restoration launch guard and its earlier builds.
Those rollout proofs are historical.

Earlier standard web revision `63c66b5` was deployed on Hetzner and passed hosted
[CI 38072565641](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38072565641),
all 646 unit tests and all 44 browser journeys. Root HTML, the Pallasite route,
all seven JS/CSS assets and security headers match the production build;
see [asset proof](evidence/gamestr-web-63c66b5.json).

The published `mysignet.app` completed real relay approval using an isolated,
new disposable identity with its Bunker switch enabled. The deployed arcade
verified its kind-21236 proof, received and verified a real kind-31990 signature,
refreshed and signed again with the same account, then cleared public identity
and pairing credentials on logout. No SDK override or fake signer was used.
Test submissions were blocked before reaching public relays; only the fixture's
authentication traffic was sent. See [live signer proof](evidence/gamestr-live-mysignet-63c66b5.json).
Physical phone, QR, suspension and reconnect journeys remain pending. The
authorised 100-sat Wallet of Satoshi payment remains unconfirmed.

## Current co-op forge check

The original Pallasite `pnpm test:coop-campaign --forge` passes on unchanged
functional source `14e969f`. Both clients agree on 812 simulation frames and
exercise active core pulses; peak stalls are 50 and 36 against the existing
90-frame limit. The broker reports no frame drops and sub-millisecond p95/p99
delivery. See [current co-op check](evidence/pallasite-coop-current-original.json).
Three prior diagnostic runs also passed. Their temporary recorder was removed
before the original-command run; no product or fixture threshold was changed.
Earlier 96, 188 and baseline 102-frame failures remain timing-variation evidence.
This current pass does not establish a product repair, worst-case performance,
physical co-op acceptance or a cause for those earlier failures.

## Coordinated deployment after Ledger gate

Ledger client `e3937ca` passed all 98 release checks and is now deployed at
`ledger.playechoseven.com`. The root HTML and all 34 JavaScript/CSS assets
match the verified production build. The existing claim service remains
healthy, configured to sign and publish with the reviewed game key; see
[Ledger live proof](evidence/ledger-live-e3937ca.json). Deployment kept the
previous index and existing hashed assets for rollback and active sessions.

The initial 600 revision `63c66b5` was activated on Hetzner. Valid TLS requests resolving
`arcade.600.wtf` directly to `62.238.98.53` verify its metadata, root and
Pallasite route HTML and all seven JavaScript/CSS assets against the build;
see [600 origin proof](evidence/gamestr-600-live-63c66b5.json). Public DNS still
returns `95.217.39.110`. Public cutover and real same-player runs through all
four games remain pending; asset verification does not establish gameplay.

## Real Ledger flight and score

At the forced Hetzner 600 origin, arcade `0948199` and Ledger `e3937ca`
completed a normal flight using the published My Signet Bunker and one
new disposable account. Ordinary keyboard beam input harvested one animal;
the game's pause menu and confirmation banked the flight at 100 points.
No game state, score or event was injected. Ledger displayed the same
selected player, removed the launch fragment/opener, and used the live
parent signing port to obtain a canonically verified NIP-98 signature.
See [flight proof](evidence/gamestr-ledger-live-handoff-0948199.json).

A separate read-only real-relay subscription received event
`564172d9bdb0bc8eab0238ba3a75ab246e535718121b2118fc904eff404af8c6`.
Its verified game-authority signature, player `p` tag and score of 100 match
the flight. The deployed arcade's exact-event page independently loaded it
from its configured relays and displayed 100, that player's link and
REVIEWED GAME AUTHORITY; see [public event](evidence/gamestr-ledger-real-score-0948199.json)
and [rendered score proof](evidence/gamestr-ledger-real-score-ui-0948199.json).
The HTTP claim response was not captured, so this record relies on the
verified public event rather than inventing a response status. The flight
is browser automation, not physical-phone or cabinet proof.

## Real Hang On, Fren and Neon Sentinel runs

Both published games completed normal keyboard-controlled runs from the forced
Hetzner 600 origin with actual My Signet Bunker approval and signing. Hang On,
Fren earned 4,214 points; Neon Sentinel earned 9,781. Each claim returned HTTP
200 and published an event. Independent relay reads verified each reviewed
game-authority signature, the selected player tag and the score. Fresh read-only
arcade pages displayed the exact events, matching player links and REVIEWED GAME
AUTHORITY. No game state, score or event was injected. Evidence records the
published game asset filename and SHA-256 rather than assuming a local checkout
matches the deployed game.

- Hang On, Fren: [run](evidence/gamestr-hang-on-fren-live-run-0948199.json),
  [public event](evidence/gamestr-hang-on-fren-real-score-0948199.json),
  [rendered score](evidence/gamestr-hang-on-fren-real-score-ui-0948199.json).
- Neon Sentinel: [run](evidence/gamestr-neon-sentinel-live-run-0948199.json),
  [public event](evidence/gamestr-neon-sentinel-real-score-0948199.json),
  [rendered score](evidence/gamestr-neon-sentinel-real-score-ui-0948199.json).

These are separate disposable accounts, each preserved through its own run.
They do not prove one account across all four games or physical acceptance.
Pallasite was still pending at this stage; its later publication proof is
recorded below. The shared-account matrix, phone lifecycle checks and DNS cutover
remain pending.

The documentation revision `cc1f2f3` passed
[CI 38074323905](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38074323905)
on an unchanged rerun. Its first attempt timed out waiting for a trusted
ArrowUp event in the packaged Linux game; the preceding build passed the same
check. The rerun is passing evidence, not a demonstrated fix for the intermittent
input failure. Physical cabinet input remains a separate acceptance gate.
The subsequent evidence revision `30b206d` failed
[CI 38075434819](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38075434819)
at the second game's Escape return, after trusted ArrowUp and first return
passed. The harness now records the failing stage, each view's focus/visibility
and received fixture keys before preserving the original failure. This adds
diagnostics; it does not claim the native input problem is fixed.

An earlier Pallasite `?p1=1` booth probe loaded and the arcade sent a port
connection acknowledgement, but the consumer did not expose the selected live
signer within the inspection deadline. That probe did not verify a completed run.
No guest login, state injection or payout action was used to bypass this gate.
The iPhone inspection confirms Wallet of Satoshi 3.4.10 (build 370) is installed
on Donkeyfarm; the authorised 100-sat payment remains unconfirmed.

## Pallasite worker and booth correction

Actual My Signet inspection showed the game accept the live session before
losing it on a first-install service-worker reload. Pallasite
[PR #6](https://github.com/TheCryptoDonkey/pallasite/pull/6) preserves the first
document, defers updates while an arcade port is active, and carries that
account into the first booth setup once. A subsequent visitor's setup closes
the old signing port and clears the session; player two and ordinary walk-up
visitors still choose their own identities. The vendored SDK matches the
published Signet Login 0.17.3 bundle.

All six production-build regressions pass using native service workers and
signed disposable local peers, including the actual root-launch route. The
seven simulation harnesses, quality governor, Chromium presentation checks,
five viewport menu checks and eight existing booth checks pass. Hosted
[CI 38077777050](https://github.com/TheCryptoDonkey/pallasite/actions/runs/38077777050)
passed `cedd45c`. That initial worker/booth deployment on Hetzner matched the
build for root HTML, version metadata, worker, SDK and eight JS/CSS assets.
Its public claim service reported the reviewed authority. See
[initial live proof](evidence/pallasite-live-cedd45c.json).

A follow-up found that the global signing queue reused the signer that started
the runner for other accounts’ queued requests. Revision `90d9b64` binds each
request to its own signer. The new regression fails on the previous code with
account B’s request signed by account A; the fix passes canonical-signature
checks for overlapping accounts, a rejection followed by another account, and
queue re-entry. Hosted
[CI 38079543360](https://github.com/TheCryptoDonkey/pallasite/actions/runs/38079543360)
passes these three checks, all seven simulation harnesses, SDK drift, build and
the six worker/identity checks. `90d9b64` is now deployed: all 12 entry/runtime
files match the clean build and the reviewed game authority is unchanged. See
[current live proof](evidence/pallasite-live-90d9b64.json).

Revision `b5c9994` then removes the personal-score guest substitution. Runs
capture their account at start, and finished score receipts are saved before
signing. Only a matching session and signer can retry; failures and unconfirmed
publication remain pending, while confirmed publication clears that receipt.
Public receipts survive relaunch; blocked storage is explained as lasting only
for the current visit. RETRY SCORE and RECONNECT TO RETRY appear outside active
gameplay. Seven recovery/client checks and the seventh production-browser case
verify failure, relaunch, canonical same-account retry and isolation from another
account’s receipt. Hosted
[CI 38080587968](https://github.com/TheCryptoDonkey/pallasite/actions/runs/38080587968)
passes those checks, the three queue checks, seven simulation harnesses, SDK
bundle drift and build. All 12 deployed files match the clean `b5c9994` build;
the reviewed game authority is unchanged. See
[current recovery deployment](evidence/pallasite-live-b5c9994.json).

The actual published My Signet run on that deployment earned 15,315 points
through normal keyboard gameplay. Score signing failed before an `/api/score`
response, but the game retained the original account, kept that run in its
outbox and displayed recovery. There was no guest score submission. The
observation does not identify the signing failure's cause or establish a
published score; the signing bridge's first successful NIP-98 result was not
verified as the score request. See
[live pending-score proof](evidence/gamestr-pallasite-live-score-pending-b5c9994.json).

Revision `14e969f` adds RECONNECT IN ARCADE for saved scores from arcade
sessions, including after the original port closes. It returns to the Pallasite
launch page so the player can reconnect through the existing account flow and
launch again. It does not automatically extend My Signet's serving window.
Recovery controls participate in menu navigation. The private browser case
passes Enter activation, same-account retry after that arcade hop, a 44px touch
target and no horizontal overflow at 320px. Hosted
[CI 38083048196](https://github.com/TheCryptoDonkey/pallasite/actions/runs/38083048196)
passes all checks. All 12 deployed entry/runtime files match the clean build,
and the reviewed game authority is unchanged. See
[reconnection deployment](evidence/pallasite-live-14e969f.json).

The subsequent actual My Signet run earned 13,403 points through normal play.
Its signing timeout left the original account's public receipt saved in the
game outbox. RECONNECT IN ARCADE navigated to the correct launch page, but the
arcade's restored identity control did not appear within 60 seconds, preventing
the test from reaching its reconnect action. No score response was received.
The receipt was observed on the game origin before navigation; reading the
arcade's separate storage afterwards cannot establish loss of that receipt.
The arcade currently awaits remote SDK restoration before showing the account;
an unavailable signer must not indefinitely block access to reconnection.
See [live reconnection gate](evidence/gamestr-pallasite-reconnect-pending-14e969f.json).

Arcade restoration now obtains the SDK's auth-only identity for stored bunker
sessions before starting remote reconnection in the background. The recognised
account and RECONNECT SIGNER remain available while the remote signer is asleep.
Signing stays disabled until the SDK reconnects the matching session and signer.
Logout or explicit reconnection invalidates the pending result; late or
different-account results are closed. Pairing credentials remain in their
existing SDK storage. No signer serving lease is extended automatically.
Four added unit regressions cover unavailable signing, same-account enforcement,
background upgrade, logout and account mismatch. Real-SDK private browser
fixtures exercise unavailable bunker recovery in both editions. All 650 unit
tests, 48 browser journeys and the complete build/validation check pass locally.
The correction is now deployed in functional revision `4aa7661` on both Hetzner editions. Normal Pallasite publication and live same-account recovery after a failed score are now verified; see the latest results above.

Hosted [CI 38083846920](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38083846920)
on `db2688b` passes the full source/build gate, 48 browser journeys, dependency
audit and AppImage packaging, but fails the packaged second-game return check.
The captured diagnostic shows the game already closed and the shell document
focused; its active element is a button instead of the required carousel host.
That narrows this failure to post-return focus, rather than a game that failed
to receive Escape. The next diagnostic records element id/class/inert state,
launch-panel visibility and recent passive focus/key events. Assertions are retained.
A proposed deferred launch-panel focus regression also passed on the unchanged
baseline, so that timer change was not retained as a demonstrated repair.

The initial expanded diagnostic on `a67a3c9` registered an extra `onReturn`
observer. That API replaces the existing IPC listener, so it displaced the
product's return handler. Its subsequent hosted failure is instrumentation
failure, not fresh evidence of the original input defect. The observer has
been removed; diagnostics now listen only to passive DOM focus and keyboard
events. The failed relaunch with that observer cannot justify a product fix.

The smoke launcher now exposes a second loopback inspector only in its isolated
test process. The harness reads native window and WebContents focus before
gameplay keys and on failure, without replacing product listeners or changing
focus. The local macOS journey passes with these snapshots and retains all
keyboard, return, signature and isolation assertions. Its native window and
contents reported unfocused while trusted CDP input still arrived, so native
focus alone does not explain every result. See
[local probe evidence](evidence/gamestr-native-focus-probe-local.json).

Hosted [CI 38086645044](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38086645044)
also passes the complete gate at `0ba5a24`, including the packaged Linux
journeys with these diagnostics. On that run, the native window and active
game WebContents were focused before both observed keypresses. The shell
WebContents were unfocused while each game was active. See
[Linux probe evidence](evidence/gamestr-native-focus-probe-linux.json).
This qualifies the diagnostic on Linux; intermittent input remains unresolved.


A fresh real My Signet run on arcade `4aa7661` and Pallasite `14e969f` earned
16,563 points through normal keyboard gameplay. The selected account produced
a canonical NIP-98 score signature; `/api/score` returned HTTP 200 with the exact
score event id and confirmed publication to all seven relays. An independent
subscription verified that public event's reviewed game-authority signature and
matching player, and a fresh arcade event page displayed the same 16,563 points
and player with REVIEWED GAME AUTHORITY attribution. No game/score state was
injected. The run completed without a retry, so it does not qualify live recovery
of a failed saved run. See [live run](evidence/gamestr-pallasite-live-run-4aa7661.json),
[public score](evidence/gamestr-pallasite-real-score-4aa7661.json) and
[display proof](evidence/gamestr-pallasite-real-score-ui-4aa7661.json).
All four games now have individual real-gameplay/public-score proofs; those runs
used separate disposable accounts. The same-account four-game matrix remains open.


Earlier co-op forge timing checks failed: 96 frames during parallel checks,
188 on the isolated candidate, and 102 on the unchanged `bfab5e2` baseline,
against the retained 90-frame limit. Simulations agreed. This does not establish
a cause or a fix. The personal-score fallback correction is deployed and its
isolated same-account recovery checks pass. Normal gameplay publication now
passes; live saved-score retry remains a separate acceptance gate.
The published My Signet run retained the selected live port through worker
activation and started normal gameplay. A score endpoint response was observed,
but the selected-account canonical score signature was not verified. The test
now handles the existing automation-specific omission of the tip screen; this
is not proof of the physical tip-screen journey. WebKit,
physical devices and the single-account four-game matrix remain unverified.

Arcade's diagnostic harness revision `adf475d` passed the complete hosted
[CI 38075818685](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38075818685).
The subsequent documentation revision `780f37b` also passed
[CI 38078292737](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38078292737).
Those passes do not resolve the intermittent native input failures recorded above.

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
  scrolling and logout. Genuine 200%/400% Chromium zoom now passes in both
  production editions: CSS zoom stays at 1, a 1280px window becomes 640/320 CSS
  pixels, pixel ratio becomes 2/4, horizontal overflow remains zero and login,
  the fixture account and logout remain operable. This uses the actual browser
  `chrome.tabs.setZoom` API in an isolated temporary extension and profile;
  see [zoom proof](evidence/gamestr-native-browser-zoom.json). Hosted CI passed all 44 browser checks and the packaged Linux journeys on
  both `f4fa70f` and `326dbd9`; see [current run](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38069730569).
  This is desktop Chromium evidence, not a phone check.
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
- Installed `signet-login`: 0.17.3. Authentication now explicitly uses
  `wss://relay.trotters.cc` independently of score relays. The SDK default
  `wss://nos.lol` failed to connect during a live published My Signet test;
  a browser-only override to Trotters completed real relay approval and a
  canonically verified kind-21236 proof for a disposable identity. That fresh
  identity had signing disabled and correctly appeared as identity-only.
  This establishes relay approval, not ongoing signing or physical-phone proof.
  The deployed repeat without the override now passes real Bunker signing,
  refresh and logout, as recorded above.
  Private-key paste remains excluded.
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
  263,168-byte ceiling. Ledger commit `e3937ca` moves the animal voice engine
  into its existing deferred audio module and warms it during opening loading.
  The compressed cold core now measures 262,061 bytes with the same ceiling;
  all 261 unit tests, startup checks and complete Chromium/WebKit voice and
  media profiles pass. The full release gate passed all 98 checks in 1,723.2 seconds on that
  revision. The verified client is now deployed, as recorded above.
  Draft [Ledger PR #88](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/88)
  contains the deployed consumer; same-player game acceptance remains pending.

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

Both current arcade editions are activated on the new Hetzner host `stall`
(`62.238.98.53`) at functional revision `4aa7661`. Standard web is public at
`https://gamestr.62-238-98-53.sslip.io/`; the 600 edition is verified with valid
TLS by resolving `arcade.600.wtf` directly to the new host. Metadata, root/game
HTML, all seven JS/CSS assets and security headers match their builds; see
[standard proof](evidence/gamestr-web-4aa7661.json) and
[600 proof](evidence/gamestr-600-live-4aa7661.json). Public 600 DNS cutover is
still pending. Older rollout proofs are historical, including
[46e40d5](evidence/gamestr-web-46e40d5.json),
[3f30f86](evidence/gamestr-web-3f30f86.json) and
[326dbd9](evidence/gamestr-web-326dbd9.json).

Hosted [CI 38084519014](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38084519014)
on `4aa7661` passes the complete source/build gate, all 650 unit tests and 48
browser journeys, audit, packaging and the Linux runtime journey on unchanged
attempt 2. Attempt 1 failed on trusted ArrowUp: neither the shell nor game DOM
recorded that key despite both reporting document focus. This passing rerun
qualifies that run; it does not establish a repair for intermittent native input.
The hosted pull-request merge tree matches the deployed branch tree exactly;
see [CI qualification](evidence/gamestr-4aa7661-ci.json).
A passive local macOS journey also failed its second Escape return, while
another unchanged run passed. A read-only native inspector probe showed a
visible but unfocused native window alongside DOM reports of focus. This is
macOS evidence and does not establish the cause of the Linux failures.

The earlier real provider check displayed an exact 100-sat Wallet of Satoshi
invoice, QR and matching wallet link at 390px without page errors. Only its
signed recipient profile was a disposable fixture; provider requests were real.
It did not invoke a wallet or send payment; see
[invoice evidence](evidence/gamestr-live-reward-46e40d5.json).
The subsequent authorised physical 100-sat payment remains unconfirmed.

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
- Complete per-game reload, expiry and arcade-closure qualification; the
  deployed Ledger consumer and same-player four-game score matrix pass above.
- Public DNS cutover and live exact-revision verification of both editions.
- Real mobile Lightning wallet payment with a separately authorised recipient
  and amount. Invoice display and wallet responses do not prove settlement.
  The user authorised 100 sats to `profusemeat89@walletofsatoshi.com`; the
  address's public LNURL metadata accepts that amount. Settlement is unconfirmed.
  Arcade's actual invoice function returned and validated a 100,000-msat invoice
  with a 24-hour expiry. Wallet of Satoshi is installed on the paired iPhone 13
  Pro Max, Donkeyfarm; device tools launched it with that invoice. Its screen,
  confirmation and settlement cannot be observed through those tools. Awaiting
  the user's physical result; wallet launch alone does not prove payment.
- Real browser zoom and physical assistive-technology acceptance; CSS zoom checks alone do not prove these.

No goal is marked complete solely from unit tests or an implementation.

## ReadyPanel pending focus repair

Hosted run `38092267756` failed the first trusted ArrowUp while its native
game remained focused. Its new focus-call trace records the ReadyPanel Start
button receiving a focus request after confirmation closed the panel. See
[failing call trace](evidence/gamestr-native-focus-calls-87a67c7-failure.json).
This establishes the stale call, rather than proving the cause of every input
failure.

The candidate cancels queued focus on close and replacement, checks that the
panel is still open and connected before focusing, and preserves the original
external focus and inerted siblings when replacing a panel opening. Two new
regressions fail on unchanged source and pass after the repair. All 50 browser
checks and the original local native journey pass; see
[local native qualification](evidence/gamestr-native-cancel-stale-focus-local.json).
Hosted Linux qualification passes at `8c3ed43`; physical-controller acceptance
and consumer package release remain open.

## Live Hang On Fren earned-score recovery

The published `2c6716f` client now passes the actual closed-parent failure path.
A disposable My Signet account earned 4,331 points through normal keyboard
play after the arcade closed. Initial signing timed out without any score HTTP
attempt or guest fallback, preserving one public receipt under its original
player. RECONNECT IN ARCADE and explicit approval with that same account
restored signing. RETRY SCORE returned HTTP 200, published to six of seven
relays and cleared the confirmed receipt. Independent authority signature,
original player and score verification pass, as do fresh displays on both
editions. See [earned run](evidence/hangonfren-earned-recovery-2c6716f.json)
and [display proof](evidence/hangonfren-earned-recovery-ui-2c6716f.json).

This used actual published My Signet, with no injected game/score state or
seeded receipt. The 600 origin was mapped to Hetzner in Chromium; the standard
display used public DNS. Physical phones, Lightning settlement and Ledger/Neon
closed-parent recovery remain separate gates.

## Latest native gate and Ledger retry correction

Documentation revision `758e14c` failed hosted run `38094256541` at the first
trusted ArrowUp. Source, both web browser suites, audit and packaging passed.
The failure trace records the game as natively focused but no key receipt in
either page; it contains no stale ReadyPanel Start focus call. The stale-call
repair holds, while another input symptom remains unresolved. Preserve the
successful `8c3ed43` run as historical qualification, alongside
[this newer failure](evidence/gamestr-native-758e14c-failure.json).

Ledger's published `e3937ca` client passes a private closed-parent fixture with
an earned 100-point run: signing timeout retains the original receipt, and menu
return/logout exposes independent login without a guest score submission.
This is canonical fixture signing with external writes blocked, not My Signet
or relay publication. Consumer candidate `23c817c` separately prevents a
finished run being retried under a switched extension account and verifies the
returned NIP-98 player/template. All 268 unit tests and the private browser
regression pass. Six of seven new security regressions fail on unchanged source.
Its complete player-promise release gate initially failed an animal-audio probe.
That unchanged probe also fails against the previously published client: it
starts the game directly and skips the real opening preload. Test revision
`d19869f` uses the actual Play/opening/pause journey and retains every original
voice assertion; targeted Chromium and WebKit probes pass. The complete gate at `d19869f` then failed the developer-panel Space-key
assertion. An unchanged targeted rerun passes all 12 developer checks. Test
revision `a99f5f8` adds passive key/focus/game-state failure evidence and starts
another full gate, retaining the original assertion and failure. Deployment
remains pending.
See [Ledger PR 88](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/88).

## Native view attachment diagnostics

The test-only loopback inspector now records each native window's attached
child web-contents ID, visibility and bounds, plus loading state and type. This
will distinguish a nominally focused contents from a visible, attached game
view during a failing Linux input attempt. It only reads native state and
retains every original input/return assertion. The original local Mac journey
passes with both game views attached and visible; see
[local attachment proof](evidence/gamestr-native-attached-view-local.json).
This is additional diagnosis, not an input repair or Linux qualification.

## Attached-view failure and independent input diagnosis

Hosted run `38094979678` at `3935247` failed the second Escape return with its
game attached, visible, fully loaded and natively focused. Neither page recorded
the missing key. This excludes an attachment delay for that run; see
[attached-view failure](evidence/gamestr-native-attached-3935247-failure.json).

A passive native input observer records bounded metadata without preventing
input, changing focus or replacing product listeners. Local calibration shows
that successful CDP keys can reach the page without `before-input-event`
records, so an empty native trace does not establish lost OS input. The original
Mac journey still passes; see [calibration](evidence/gamestr-native-system-input-local.json).

After an original Linux input assertion fails, a separate XTEST diagnostic may
send the same key to the private Xvfb display. It first checks the focused native
window and owning process against the isolated Electron fixture. It activates
no window, accepts only Up/Escape, and preserves the original failed assertion
regardless of its result. Six ownership/platform/key guards pass. The next
Linux gate will report whether this independent keyboard path works; neither
Linux input repair nor physical controller acceptance is claimed.

Hang On Fren's functional correction `53113df` also fixes duplicate personal score approvals
and claims while an automatic submission is pending. All 212 unit tests and
a private normal-play browser check pass, with bounded clock/claim/body timeouts
and retained receipts. Client revision `328540a` passed hosted run `38095785090`
and is now deployed on Hetzner. All six public entry/runtime files match that
checked artifact, including the private browser-tested JavaScript. The existing
API process and configuration were preserved; see
[public proof](evidence/hangonfren-live-328540a.json). The earlier real My Signet
recovery remains historical evidence for `2c6716f`, rather than a new physical
or real-signing qualification of this release.

Hosted run `38095743819` at `3bae6bf` failed the first Escape return. Its
system-keyboard diagnostic initially covered ArrowUp and the second Escape,
so no independent key was attempted in this run. The diagnostic now covers
both Escape return stages, preserving the original assertions and ownership
checks. See [first-return failure](evidence/gamestr-native-3bae6bf-failure.json).

## Escape delivery and shell focus are separate failures

Hosted run `38096250026` at `62dd945` failed after the second game had
already closed. Its shell received the Escape release, but focus moved to the
carousel CTA about two milliseconds after the return handler requested focus
on `#app`. No stale Start focus call occurred. This run establishes a shell
focus restoration failure, not lost Escape delivery; see
[return-focus failure](evidence/gamestr-native-62dd945-failure.json).
The earlier `3bae6bf` first-return trace likewise records a closed game.

The diagnostic now separates game closure from shell focus and records the
active element before and after the key release. It keeps both original
assertions and does not send another Escape after a game has closed.
The original local Mac journey passes with these snapshots and `#app` focused
before and after each release; see
[local boundary probe](evidence/gamestr-native-return-boundary-local.json).
Physical controller qualification and the broader intermittent input issue
remain open.

## Independent Linux keyboard result and Neon ownership failure

Run `38097262500` at `ecb229d` failed the original debugger-injected second
Escape closure assertion. A separately sent X11 XTEST Escape, after checking
the isolated window and process, closed that game. The original gate stays
failed. Its first-return snapshots also show the CTA focused before the key
release, excluding that release as the cause of the initial focus change.
See [independent input result](evidence/gamestr-native-ecb229d-system-input.json).
This narrows debugger delivery versus application input; it does not prove
a general product repair or physical controller acceptance.

A private published Neon Sentinel journey earned 6,326 points normally after
the parent closed. On signing timeout, the published client attempted two
NIP-98 claims under another guest key and changed player mode to guest. Both
requests were blocked; no score was published. See
[published guest substitution](evidence/neon-published-guest-substitution.json).
Its public entry hash still matches `index-CejSwacQ.js`. The matching source
is in `neon-sentinel-public`, rather than the older similarly named checkout.
The `5dcf1b4` candidate removes guest fallback, guards original-account/template
ownership, and adds account-bound persisted receipts with selectable retry and
original-account reconnect. Its 101 unit tests, builds and hosted private recovery
check pass (run `38099407492`). The browser check covers delayed SDK startup,
validated callbacks, reload, wrong-account reconnect and selective clearing. A
separate normal-play check earns 7,974 points, persists the original receipt after
closed-parent timeout and makes no claim request. These private checks block
external writes; exact-client deployment and actual My Signet acceptance remain
pending.
The historical successful four-game matrix does not qualify this failure path.


## Ledger hosted gate after localhost transport failure

The `a99f5f8` full local gate passed all 12 original developer controls and later
profiles through parachute interception. It stopped before loading the council
profile with localhost `ERR_INVALID_HTTP_RESPONSE`. The unchanged targeted
council profile passes. The failed full run remains recorded; isolated hosted
[run 38099081554](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38099081554)
failed the original WebKit first-flight playing wait at the same source
revision; the Chromium warm profile passed. A local original WebKit check with
delayed audio also passes, leaving the hosted cause unproven. Diagnostic-only
revision `95a01de` records opening/game/audio state if that original wait fails,
without changing any assertion or threshold. Full hosted
[run 38101630063](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38101630063)
is in progress. Ledger's new finished-score correction is not yet deployed.


## Neon archived release, stale SDK and modal correction

Neon's personal recovery client `5dcf1b4` passed hosted CI and exact archive
checksum verification. The private recovery fixture and normal 7,624-point
closed-parent run pass against that exact archive. Hetzner activation checked
all 106 static files and 99 preserved API files; process 480607 remained running.
Public HTML, version and service worker match, but the fixed SDK URL returns
the previous release's hash despite correct origin bytes. This is a partial
rollout, not complete public qualification. See
[partial proof](evidence/neon-live-5dcf1b4-partial.json).

Follow-up `59f6452` uses a versioned SDK filename and checks both copies against
locked Signet Login 0.17.3. Its real SDK picker also reproduces Enter opening
the underlying support prompt and the accelerated idle demo starting behind
the dialog. Keyboard and idle modal guards fix both; native Escape cancels
login and retains the original receipt. All 101 units, type checks, builds and
both private browser checks pass locally. See
[modal proof](evidence/neon-sdk-modal-regressions.json). The identity/receipts
are private fixtures, and external writes/relay sockets are blocked.

The `59f6452` follow-up passes hosted run `38104841854` and both browser
checks against its exact archived code and full file manifest. It is now
active on Hetzner; all 107 static files and 99 preserved API files match.
Public HTML, version, service worker, versioned SDK and entry JS/CSS pass
exact-byte verification, with API process 480607 unchanged. See
[live proof](evidence/neon-live-59f6452.json),
[checked recovery](evidence/neon-recovery-checked-59f6452.json) and
[checked modal](evidence/neon-modal-checked-59f6452.json).

Actual My Signet attempts stop before any game or claim: one initial signer
readiness failure, one homepage navigation timeout, and then an approval
timeout. A separate read-only browser transport probe from mysignet.app opens
Trotters and Ditto, while nos.lol times out at 15 seconds. It creates no
identity and sends no auth message. This does not establish the approval
failure cause; see [transport probe](evidence/neon-signet-browser-transport.json).
Current real provider reconnect/publication, physical signers and payment
settlement remain unqualified.


## Ledger atomic arrival observation

Run `38101630063` passes the previously failing WebKit voice warm-up and stops
later at cinematic arrivals. Desktop opening opacity is 0.888588 after a
separate wait observed >0.95; both reports also include a cancelled music
request without event timing. Source `918ffb3` captures opening readiness and
all opening fields in one callback, preserving the original 5-second wait
and every threshold. It retains cancelled requests as failures and records
whether they occur during teardown. Chromium and WebKit pass locally. Full
[run 38108876547](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38108876547)
failed at WebKit first-flight voice warm-up; Ledger's new score correction is
still not published. Failure diagnostics show an idle game with the contribution
prompt visible. A private 700-ms delay of its lazy-loaded module reproduces the
same failure: the test's 100-ms conditional check skips the later prompt.

## Neon delayed recovery policy gap

Read-only inspection of `/opt/neonsentinel/current/server/index.js` on the new
Hetzner box confirms `STALE_RUN_MS = 10 * 60 * 1e3` and `stale_run` rejection.
Source validation rejects age before checking the accepted-claim cache and
prunes that cache after thirty minutes. Neither preserving a receipt nor
reconnecting its original signer proves publication after the ten-minute
window. No API code, configuration, process or receipt timestamps were changed.
Goal 6 now requires delayed recovery with durable idempotency and explicit
handling of permanently rejected receipts. The published client remains
qualified for the checked recent-run fixtures only.

## Neon delayed acceptance candidate

Neon source `723b087` now accepts old runs with fresh canonical NIP-98 and
retains account/run deduplication across restarts. It durably writes the signed
event before external publication and retries the same event after an
unconfirmed write, without changing original run timestamps. Accepted payload
changes return 409. Corrupt history fails closed; legacy unconfirmed rows
without their signed event are rejected explicitly. Private compiled-API
checks pass seven-day-old recovery, process restart, exact event identity,
concurrent duplicates, altered-run and future-clock rejection, expired NIP-98
refusal and corrupt/legacy history handling. All 101 units and typechecks pass.
No live API process or configuration changed. Hosted
[run 38118195811](https://github.com/TheCryptoDonkey/neon-sentinel-public/actions/runs/38118195811)
is pending; deployment, live recovery and owner-controlled receipt removal
remain open. The workflow archives a checked API and source/hash manifest.
Ledger [run 38117971629](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38117971629)
is confirmed in progress at `f792c8c`.

## Neon checked client and delayed-recovery API deployed

Hosted run 38118761030 succeeds at `046a822`: 101 units, typechecks,
compiled-API delayed/restart/idempotency gate, private account-bound recovery
and actual SDK keyboard/modal checks. Both client and API are deployed from
archived checked artifacts. All 107 static files and both API files match
before activation. Public browser GET checks match six startup/runtime files
and boot without page errors at 390 × 844.

The API restarts from PID 480607 to 1140368. Its environment metadata and
game authority remain unchanged; the actual process state path is checked.
Both existing confirmed score records remain in the original journal and
are loaded by the new API, with a private pre-cutover backup. No history is
rewritten or restored. The durable on-disk key remains compatible with the
previous API; old code/client releases remain available for rollback.

The previous ten-minute submission mismatch is repaired in the deployed
code. Seven-day-old recovery and same-event republication are private
compiled-API evidence, not actual My Signet publication. Explicit receipt
removal and focused-control protection pass the private browser gate.
Current real provider recovery, physical signers and payment settlement
remain unqualified. See [public verification](evidence/neon-live-046a822.json),
[API activation](evidence/neon-api-live-046a822.json),
[checked recovery](evidence/neon-recovery-checked-046a822.json) and
[checked SDK modal](evidence/neon-modal-checked-046a822.json).

## Published Neon earned My Signet recovery passes

A fresh disposable My Signet account signs into arcade `4aa7661` through the
Hetzner-forced 600 origin and launches published Neon `046a822`. The publisher
entry hash matches the previously verified public/checked artifact. The arcade
parent closes before normal gameplay; no game or score state is injected and
no receipt is seeded. The run earns 8,745 points. Its failed bridge signing
retains an original-account receipt and makes no claim request.

Explicit same-account My Signet reconnect succeeds, reload preserves the exact
receipt, and a second explicit reconnect enables selected-run retry. Exactly
one canonical original-account NIP-98 claim returns HTTP 200 with publication
to five of seven relays. The original run ID, points and finish timestamp remain
unchanged. An independent relay read verifies the game-authority event, player
attribution and score; the confirmed receipt clears. Fresh score-detail pages
in both editions show 8,745, the same player and reviewed game authority.

This establishes current desktop provider recovery; it does not establish
physical devices, public 600 DNS cutover, payment settlement or actual delayed
publication beyond ten minutes. Earlier provider timeouts remain recorded,
without an established cause for the subsequent successful attempt. See
[earned recovery](evidence/neon-earned-recovery-046a822.json) and
[fresh display checks](evidence/neon-earned-recovery-ui-046a822.json).


## Current published My Signet recovery

Published client `328540a` now passes an actual My Signet earned-score recovery.
A fresh disposable account earned 4,331 points through normal keyboard play after
the arcade parent closed. Signing failure retained its personal receipt without
a score HTTP attempt. The explicit RECONNECT IN ARCADE control, same-account
approval and RETRY SCORE produced one canonical NIP-98 signature and HTTP 200
with five of seven relay acknowledgements. Positive publication cleared the
receipt. Independent event verification and fresh displays in both editions pass.
No game state or receipt was seeded. See
[earned recovery](evidence/hangonfren-earned-recovery-328540a.json) and
[display checks](evidence/hangonfren-earned-recovery-ui-328540a.json).
The 600 browser origin was mapped to Hetzner; this does not prove its DNS cutover.
Physical phones, wallet settlement and a real retry after ten minutes remain open.

The separately running API still rejects finished runs older than ten minutes.
Its unconfirmed replay returns the cached zero acknowledgements without
republishing, and lower scores intentionally do not replace a higher score for
the same player/tour/level. These are separate recovery gaps: a backend correction
must preserve that per-level leaderboard protection while making retry durable.
The current client-only deployment has not changed that API policy.


A private compiled-API check reproduces these gaps with disposable keys and all
external network traffic blocked. A seven-day-old run receives `422 stale_run`.
An unconfirmed fresh claim, followed by process restart and a relay fixture now
accepting events, still returns zero acknowledgements without another score
publication. A coherent 500ms shift to both run timestamps creates another
deduplication key and receives `below_best`. The client recalculates server
clock offset for each retry, so the replacement policy must account for that
transport correction while preserving the original accepted run and event.
See [private API baseline](evidence/hangonfren-claim-gap-baseline-110262e.json).


## Hang On Fren delayed-recovery candidate

Source `e4ec515` corrects the private baseline failures. It accepts saved runs
with fresh NIP-98, identifies retries by account/run, preserves the first
accepted timestamps across coherent server-clock correction, durably records
the full signed event before publication, and republishes that same event after
restart. Changed run details conflict. Serial acceptance and later timestamps
for improvements protect per-level addressable best scores; superseded pending
runs cannot overwrite a newer best, and stone-tour addresses remain separate.

All 219 local units, type checks and client/server builds pass. Its private
compiled-API fixture verifies seven-day recovery, restart/same-event reuse,
clock correction, fresh-auth rejection, concurrent deduplication, ordering,
superseded-run protection, legacy confirmed records, missing legacy events and
corrupt history. The client adds explicit owner-confirmed removal of only the
selected retry copy, first-receipt immutability and preservation of malformed
storage. Session changes and in-flight claims prevent removal. CI now archives
the checked API and recovery proof alongside the checked client.

This is a source candidate, not yet a published correction. The currently
published `328540a` real My Signet recovery remains qualified separately;
actual long-delay provider and physical qualification remain open. See
[consumer PR 2](https://github.com/TheCryptoDonkey/hang-on-fren-public/pull/2)
and its scoped evidence.


## Checked Hang On Fren correction published

Hosted branch run `38121444118` passes at `e4ec515`, as does the separate
pull-request check. The exact checked client passes a private browser journey
covering parent closure, reload, wrong-account protection, selected-run retry,
44px controls at 390px, cancelled and confirmed removal, preservation of other
accounts, and readable below-best, run-conflict and missing-legacy-event messages.
Simulated claim responses and seeded public receipts remain explicitly private
fixtures. Its entry JavaScript matches the now-public file byte for byte.

The checked client and API are published on the new Hetzner box: all 149 static
files and both API files match the checked artifacts. A read-only preflight loads
the existing claim history with relay publication disabled. The intentional API
restart preserves configuration metadata, game authority and all five original
history rows; its private rollback backup remains available. API health and all
six public startup/runtime files pass. No DNS configuration was changed.

This supersedes the ten-minute expiry and cached-unconfirmed-replay gap described
above. Actual long-delay My Signet journeys are now running against this release
and Neon `046a822`; their outcome is still unqualified. The earlier real HOF
`328540a` journey remains historical evidence. Physical signers, controllers and
Lightning settlement remain open. See
[public client verification](evidence/hangonfren-live-e4ec515.json),
[API activation](evidence/hangonfren-api-live-e4ec515.json),
[private checked client](evidence/hangonfren-recovery-checked-e4ec515.json) and
[checked private API recovery](evidence/hangonfren-api-recovery-checked-e4ec515.json).


## Real delayed Neon recovery qualified

An actual My Signet journey on published `046a822` now holds a normally earned
5,566-point run beyond eleven minutes (662,617ms at the retry sequence). The
arcade parent closes before play. Explicit original-account reconnect and reload
preserve the receipt; after the delay, another explicit same-account approval
and selected retry make exactly one canonical NIP-98 claim. The request retains
the original finished timestamp exactly, returns HTTP 200 with six of seven
relay acknowledgements, and clears the receipt only after positive publication.

Independent verification confirms the game authority, player and score. Fresh
relay-backed displays in both editions show the same event. No game state or
receipt was seeded. The 600 browser uses forced Hetzner DNS; standard public DNS
is used normally. This proves the actual delayed desktop provider journey,
separate from private seven-day/restart API tests and physical qualification.
See [earned delayed recovery](evidence/neon-earned-delayed-recovery-046a822.json)
and [fresh display checks](evidence/neon-earned-delayed-recovery-ui-046a822.json).


## Current HOF delayed provider check

The published `e4ec515` client retains a normally earned 4,331-point personal
receipt after parent closure and through the eleven-minute delay. Explicit
original-account My Signet reconnect then times out before the game is reopened
for retry. The approval page remains at Login Request, with no outgoing auth
messages in its captured traffic; the arcade shows RECONNECTING. A read-only
API history check confirms no accepted row for this disposable account. This
neither qualifies delayed live publication nor demonstrates an API age rejection.
The private seven-day/restart API gate remains qualified separately. The cause
of the provider reconnect timeout is not established. See
[bounded live failure evidence](evidence/hangonfren-earned-delayed-recovery-failure-e4ec515.json).


## Ledger original gate and arrival fixture

Hosted `38120087817` at `f6b160a` passes all 13 developer-panel checks, then
fails WebKit cinematic arrivals on a cancelled music request before teardown.
The fixture replied to `Range: bytes=0-1` with chunked HTTP 200; the published
origin correctly replies HTTP 206/two bytes. Source `e8fee80` corrects the
fixture's Range, Content-Length and HEAD responses without changing original
UI, network, timing or accessibility assertions. Private corrected WebKit and
Chromium profiles pass. The original Mac WebKit fixture also passes, so the
Linux cancellation's cause is not established. An initial concurrent Chromium
card-hidden timeout is retained and its cause remains unestablished.

New hosted run `38122913408` passes 268 units and the early Linux WebKit arrival
check. The complete original release gate remains in progress; no candidate
client is published and Ledger stays at `e3937ca`. See
[fixture evidence](evidence/ledger-arrival-range-f6b160a.json) and
[consumer PR 88](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/88).


A follow-up check stops before gameplay while its captured My Signet UI shows
Signed in and the arcade shows SIGNER CONNECTED. That observation does not prove
the failure's cause, but requires checking the driver's readiness assumptions.
The next bounded driver observes connected, approval and PIN states instead of
assuming the approval button must remain visible. Its outcome remains pending;
see [UI observation](evidence/hangonfren-reconnect-ui-observation-e4ec515.json).
