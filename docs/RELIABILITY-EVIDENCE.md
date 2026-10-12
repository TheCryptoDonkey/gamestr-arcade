# Reliability delivery evidence

Work in progress on 12 October 2026. This file separates implemented changes,
automated results, hosted artifacts and actual user/device acceptance.

Current arcade web revision is `c4b7929`, with exact hosted CI, served asset
hashes and real desktop signer checks recorded below. Ledger client is now `ebcd6a5`; the earlier baseline was `e3937ca`. Candidate `a1d3290` failed after 46 checks on a WebKit supply
stream cancellation. Candidate `f6e810a` failed after 38 release checks on
WebKit arrival music cancellations, before supply or pickup-media qualification.
Ledger candidate `bc18049` passed the arrival, supply and pickup-media release checks,
then failed the Chromium harvest report: image download and clipboard content
passed, but its transient confirmation label had reset before the fixture read it.
The fixture now records the real label mutation before its timed reset. Candidate
`e6e2066` passed 56 release checks, including both harvest profiles, then failed
the Chromium animal-audio fixture: synchronous snapshots preceded deferred
voice-engine loading. Candidate `052b2c4` observes each species’ actual sources
after a real click and requires running audio contexts. Chromium and WebKit
pass locally; delayed-engine old/new and missing-engine negative cases verify
the correction without changing the original voice-count assertions. See
[fixture evidence](evidence/ledger-animal-audio-052b2c4.json). Its full
[98-check gate](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38174397091)
passed 90 checks, including both animal-voice and seven-biome profiles, then failed
the WebKit landscape upgrade target measurement during its opening scale animation.
Candidate `4ecadcb` waits for the finite reveal before measuring; original
geometry/model/layout assertions are byte-identical. Normal Chromium/WebKit
pass; a controlled reveal reproduces the old 57.9px failure and passes at 60px
after waiting, while a 50px negative still fails. See
[fixture qualification](evidence/ledger-draft-reveal-4ecadcb.json). The new
[full gate](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38177444455)
failed after 59 checks at the WebKit Valley loading-indicator snapshot.
Candidate `ebcd6a5` observes the required indicator while the real GLB remains held;
original assertions and production code are unchanged. Normal WebKit and a
controlled 1.2-second timer pass; forced-hidden loading still fails. Local
Chromium remains unqualified at earlier startup/resource waits. See
[fixture evidence](evidence/ledger-loading-observation-ebcd6a5.json). The
[new full gate](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38181311659)
passes all 98 original checks. The checked client `ebcd6a5` is now published on Hetzner, with 228 local/server files and 36 critical served files matching its CI manifest; original API `ed73ebc`, authority and history are preserved. One public `.well-known/nostr.json` file omitted by the archive was recovered from the exact checked Git revision and matched against the CI hash. Provenance, atomic entry swap, unchanged-asset hardlinks and rollback entry are recorded in [deployment proof](evidence/ledger-live-ebcd6a5.json). Actual earned recovery and the current four-game matrix remain pending.
See the [current fixture qualification](evidence/ledger-harvest-feedback-e6e2066.json).
Its local WebKit harvest profile passes; local Chromium remains unqualified at
an earlier game-over startup wait. Published Ledger client is now `ebcd6a5`; prior `e3937ca` evidence remains historical.

All fourteen original later WebKit release checks pass locally on `052b2c4`,
covering the seven-biome bed through altitude/placards. See
[local subset evidence](evidence/ledger-later-webkit-052b2c4.json). The original
98-check dispatcher is unchanged. Local Chromium stops at opening-resource or
earlier startup waits and remains unqualified; no production or assertion
change follows from those observations. The complete hosted gate is still required.

Pallasite restoration and receipt controls are published as `9813d13`, with
full hosted checks and fourteen critical served files verified. A normally
finished 22,840-point run survives parent closure, reload and eleven minutes
unchanged. Original-account reconnect produces a valid NIP-98 signature, but
the old API rejects it with `stale_run` and retains the receipt. The API expects
milliseconds while the client supplies Unix seconds, and also rejects delayed
runs. See [failure evidence](evidence/pallasite-earned-recovery-rejection-9813d13.json).
The API correction `3173d18` accepts both formats, preserves original dates and
durably reuses the exact signed event. All 131 local tests, types, Linux build
and [hosted qualification](evidence/pallasite-faucet-recovery-3173d18-ci.json) pass.
The checked API binary is now [published](evidence/pallasite-faucet-live-3173d18.json):
twelve existing tables remain unchanged through the additive migration; original
authority, relays and configuration remain intact. The old binary and a private
consistent database backup are retained. Current Pallasite actual recovery passes for a normally earned 20,820-point run:
parent closure, reload, a real eleven-minute delay, explicit same-account
reconnect, unchanged receipt signing, HTTP 200 and seven of seven relay
acknowledgements, receipt clearing and independent public-event verification.
The event preserves the original run dates, and fresh pages in both arcade
editions display the exact score/player with reviewed authority. See
[earned recovery](evidence/pallasite-earned-recovery-9813d13.json) and
[both displays](evidence/pallasite-earned-recovery-ui-9813d13.json). This uses
browser automation and forced 600 DNS; current four-game and physical
acceptance remain open.

API PR #1 is merged as `52eab4c`. Its [automatic deployment](evidence/pallasite-faucet-live-52eab4c.json)
passes all API tests and health readiness. The live binary is byte-identical
to the actual-recovery binary; its original accepted payload and exact event
remain stored unchanged after deployment. Staging uses /opt to avoid the
deployment user's tmpfs quota. Atomic replacement, identical-byte reuse and
missing-candidate rejection pass in an isolated Hetzner fixture.

Neon Sentinel now publicly serves `0435e93`: the recovery PR #1 merged,
followed by graphics PR #2. Current hosted CI `38177726376` passes types,
units, durable API acceptance, account-bound browser recovery and actual SDK
keyboard checks. Recovery source files and server source are unchanged.
[Current served-code proof](evidence/neon-live-0435e93.json) validates all sixteen
checked local code files, eleven served files byte-for-byte and two legal pages
after reversing only verified [Cloudflare email protection](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/)
markup/script; the restored bytes exactly match CI. Claim health and the original
authority remain intact. Graphics binary hashes and current actual earned-score
recovery are outside this proof. Older `046a822` actual journeys remain historical;
current four-game qualification must use `0435e93`. Current actual earned recovery now passes on that revision: a normally earned 7,214-point run survives arcade closure and reload, retains its original receipt through 663,636 ms, reconnects the original My Signet account and submits one fresh URL/method/body-bound NIP-98 claim. HTTP 200 with six of seven relay acknowledgements clears the receipt; the independently verified authority event retains the original run bounds in its content. Fresh pages in both editions show the exact score/player and reviewed authority. See [earned recovery](evidence/neon-earned-recovery-0435e93.json) and [both fresh displays](evidence/neon-earned-recovery-ui-0435e93.json). Earlier local reconnect and initial fixture errors remain retained; no physical or four-game shared-account qualification follows from this separate-account journey. An expiry fixture detected
this release change and stopped at its old asset guard; that incomplete attempt
is not a current Neon pass. No publisher release was rolled back.

Fresh GET-only checks display the previously earned Neon and Hang On Fren
scores correctly on current arcade `c4b7929` in both editions. These four
[display checks](evidence/gamestr-c4b7929-retained-neon-hof-score-ui.json) use
separate earlier accounts and do not establish current four-game gameplay.
Actual Meta-click from current 600 `c4b7929`, signed in with a disposable
My Signet identity, opens current Hang On Fren `e4ec515`, Neon `046a822`
and Pallasite `9813d13` independently. Each has no handoff fragment or opener,
no copied arcade identity, and leaves the original arcade account intact;
its main script matches the published hash. See [independent entry](evidence/gamestr-c4b7929-independent-entry.json).
This does not qualify completion of independent login, physical input,
proof expiry or the new Ledger client.

Earlier releases and failed gates below remain historical evidence. Public 600
DNS, physical provider checks and the unpaid 100-sat test remain open.

## Earlier live My Signet result: 4aa7661

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
assuming the approval button must remain visible. Current live qualification remains pending;
see [UI observation](evidence/hangonfren-reconnect-ui-observation-e4ec515.json).


The subsequent UI-state check times out at initial real relay approval, before
normal gameplay or a delayed receipt exists. This leaves current HOF delayed
provider recovery unqualified; no live HOF test remains running. Its cause is
unestablished and the API is not exercised by this attempt. See
[initial approval timeout](evidence/hangonfren-initial-approval-timeout-e4ec515.json).


## Ledger supply-drop fixture and current full gate

Run `38122913408` at `e8fee80` is now terminal failure. Both full-gate arrivals
and the early Linux WebKit arrival check pass. The gate reaches supply-drop
interception: Chromium passes; WebKit reports a cancelled music request while
all reported gameplay assertions pass. No checked client artifact is produced.

The supply-drop fixture still returned whole, chunked HTTP 200 responses to
byte-range probes. Candidate `f94a0e8` corrects that fixture with bounded HTTP
206, Content-Length and HEAD handling. Private Mac WebKit and Chromium pass
with external HTTP/WebSocket writes blocked. Original assertions and limits
remain unchanged, and these local checks do not establish Linux's cause.
New run `38124922090` checks both affected WebKit fixtures before the unchanged
full gate. Public Ledger stays at `e3937ca` pending full qualification. See
[supply transport proof](evidence/ledger-supply-range-e8fee80.json).


## Real My Signet approval readiness

The earlier driver unlocked a late PIN prompt but then only waited for arcade
identity; it did not observe whether approval was needed after unlocking.
A revised bounded driver observes PIN, approval and connected states throughout
initial authentication and explicit reconnect. It permits a second approval
only after a PIN transition, verifies the signed origin/account proof, and
requires the visible account menu to say SIGNER CONNECTED. A real desktop
My Signet check now passes initial authentication and explicit same-account
reconnect at arcade `4aa7661`. It performs no gameplay, claim or payment.
The earlier failures remain recorded and their full causes remain unknown.
See [approval-readiness proof](evidence/signet-approval-readiness-4aa7661.json).

A fresh Hang On Fren delayed earned-score journey now uses this qualified
approval driver. Its result remains pending; this auth-only success does not
qualify game submission or physical-device behaviour.


Ledger `38124922090` / `f94a0e8` is terminal failure in the early WebKit
arrival check: the original five-second opening-ready condition times out.
Neither supply-drop nor the full gate is exercised. Source `c2ae613` adds
bounded readiness samples, start duration, current visibility and request
diagnostics before rethrowing the unchanged timeout. It changes no product
code, assertion or deadline. New hosted run `38125161236` is queued; no candidate
client is published.

The fresh HOF `e4ec515` actual journey has passed initial My Signet sign-in and
explicit same-account reconnect, then normally earned 4,732 points after parent
closure. The original receipt remains saved with zero claim HTTP attempts while
the eleven-minute delay elapses. Submission, subsequent reconnect and display
qualification remain pending; this is progress evidence, not a completed gate.


## Hang On Fren actual delayed recovery qualifies

The fresh current `e4ec515` journey is complete: 4,732 points earned through
normal play after parent closure, first receipt retained with zero claim HTTP
attempts, and byte-for-byte preservation through a 662,518-ms delay. Explicit
original-account My Signet reconnect and selected retry produce one canonical
NIP-98 claim, HTTP 200 and six of seven relay acknowledgements. Positive
publication clears the exact receipt; an independent relay read verifies
reviewed authority, player and score. Both fresh edition displays pass.
The 600 browser origin is forced to Hetzner; physical and DNS acceptance remain
open. No game state or receipt is seeded and no payment is performed.
The earlier failed attempts remain recorded without retrospective cause claims.
See [earned proof](evidence/hangonfren-earned-delayed-recovery-e4ec515.json)
and [display proof](evidence/hangonfren-earned-delayed-recovery-ui-e4ec515.json).

## Ledger current instrumented result

Run `38125547605` / `f57b7a5` is terminal failure after 268 unit passes.
The early desktop WebKit opening-ready condition times out with no request
failures and successful media playback (readyState 4, no media error).
Bounded UI samples observe opacity 0, then 0.86988 after about one second,
then hidden/0 nearly four seconds later; synchronous start takes 111 ms.
This identifies sparse observation as an additional concern, but does not
prove presentation of the full-opacity state or explain earlier cancellation.
No full gate or checked artifact is produced. No Ledger run remains live;
publication stays `e3937ca`. See
[instrumented proof](evidence/ledger-media-hosted-f57b7a5.json).


## Ledger polling and lossless streaming correction

A controlled private WebKit animation demonstrates RAF polling missing the
required >0.95 opacity while 50-ms polling observes it within the same
five-second deadline. The actual opening fixture now uses that cadence
without changing its conditions or deadline. Its first corrected run
reproduces music cancellation: WebKit abandons a large body, fetches end
metadata/replacement ranges, then reaches readyState 4 and resolves playback.

The track's M4A metadata was after its audio payload. Candidate `1f41ed8`
moves metadata to the front with a lossless fast-start remux. Encoded packet
and decoded PCM hashes remain identical and the file size is unchanged.
Private corrected Chromium/WebKit arrivals and WebKit supply-drop pass with
external writes blocked; their music requests finish without cancellation.
Original UI, network and timing assertions remain intact. Earlier failures
remain recorded and this does not establish every hosted timeout's cause.

New full run `38126484713` is queued at `1f41ed8`; no candidate is published.
Public Ledger remains `e3937ca`, and the API is unchanged. See
[polling and streaming proof](evidence/ledger-arrival-polling-and-faststart-258c262.json).


Ledger `38126484713` / `1f41ed8` is now terminal failure after 268 unit
passes. The early desktop opening check records no request failures and a
completed music response, but observes only one opacity-zero sample despite
50-ms polling. The card is hidden by the diagnostic snapshot and no media
play resolution is captured. The cause remains unestablished; compare the
fixture's direct start with real PLAY's preload/render warm-up. No full
gate or checked artifact is produced, no Ledger gate remains live, and public
source stays `e3937ca`. See
[hosted result](evidence/ledger-arrival-hosted-1f41ed8.json).


## Ledger reveal lifecycle and API baseline

The HUD starts reading/expiry timers before the reveal frame and leaves queued
callbacks alive after cancellation/replacement. Three focused regressions fail
on the original source. `edc8427` starts the unchanged card durations in the
reveal frame, cancels/invalidates obsolete callbacks and queues badges until
the arrival yields the screen. Four focused regressions, all 272 units and
type checks/build pass. Private Chromium/WebKit arrivals and actual WebKit
PLAY/LATER/loader journeys pass at both viewports with external writes blocked.
See [lifecycle proof](evidence/ledger-arrival-paint-ecc8899.json).

Hosted `38127430741` is terminal failure at the original direct-start desktop
opening condition. It records successful music playback, no request failures
and one opacity-zero sample before timeout; the cause is unestablished. The
complete gate is not exercised. New `ceb581a` adds an actual PLAY comparison
mode before the unchanged direct fixture and full gate. Exact local comparison
passes; hosted `38128029617` is queued. Publication stays `e3937ca`. See
[hosted failure](evidence/ledger-arrival-hosted-edc8427.json) and
[actual-route check](evidence/ledger-arrival-play-mode-edc8427.json).

The private compiled API probe separately reproduces zero-acknowledgement
replays without republication (including restart), accepted changed details
under the same ID, and a regenerated event after 31-minute cache pruning.
This is cache retention, not a demonstrated ten-minute run-age rejection:
the API receives no absolute finish timestamp. It uses only disposable keys,
loopback HTTP and fake WebSockets, with external HTTP blocked. No live API
is changed. Durable exact-event recovery and semantic conflict checks must
preserve the existing daily-best protection. See
[backend baseline](evidence/ledger-claim-gap-private-edc8427.json).


Hosted Ledger real-route comparison `38128029617` / `ceb581a` is now terminal
failure after all 272 units pass. Actual PLAY/LATER/loader reaches opacity 1
and every reported opening/HUD/accessibility threshold in both viewports.
A desktop music cancellation before teardown fails the original network
assertion. The native media trace records pauses/restarts and resolved playback;
that evidence does not turn the failed gate into a pass. Direct/full gates are
not exercised and no checked artifact is produced. No Ledger gate remains
running, publication stays `e3937ca` and backend retry gaps remain open. See
[hosted real-route evidence](evidence/ledger-arrival-real-play-hosted-ceb581a.json).


## Ledger durable score recovery candidate

`a6bcd26` corrects the privately reproduced API retry gaps: fsynced full signed
events before publication, permanent player/run identity, semantic conflicts,
serialized publication and strict daily-best timestamp ordering. A failed history
write holds acceptance until repaired history is validated at restart. Original
legacy IDs and valid midnight crossings remain readable; missing unconfirmed
legacy events and corrupt histories fail explicitly. The exact service passes
twelve private recovery/durability groups on Node 22.19.0, with disposable keys,
fake WebSockets and blocked external HTTP. Its manifest contains exactly the
executable and source map.

The client also discarded a receipt on any HTTP 200, including zero relay
acknowledgements. Two regressions fail on that source. It now retains unpublished
or malformed successes and distinguishes superseded daily scores. All 275 units,
type checks/builds and Chromium/WebKit visible zero-ack/retry fixtures pass.
The separate identity fixture times out during startup before claiming; its
cause remains unestablished and that journey remains unqualified.

Hosted `38129812716` at `3230b22` passes 275 units, both type checks and eleven
service-recovery groups, then fails the artifact guard on copied public assets.
The full player gate is skipped. Server builds now exclude those assets; new
complete run `38130450803` at `a6bcd26` is dispatched, with results pending.
No live Ledger client/API changes or new actual provider acceptance. Seven-day
private API retry preserves an already accepted event's original board day;
client receipts still expire at midnight UTC. The full nine-goal scope remains
open. See [candidate recovery evidence](evidence/ledger-claim-recovery-a6bcd26.json).


`38130450803` is now terminal. The service job passes 275 units, both type
checks and twelve recovery/durability groups, and produces the checked two-file
artifact. Downloaded hashes match the exact local Node 22 build. The client
job passes 275 units and both opening snapshots, then fails the original phone
tour-reveal HUD-opacity threshold: 0.055888 against less than 0.05. No request
failures are recorded. The full player gate is not exercised and no client
artifact is produced; previous music failures remain recorded.

The checked Ledger API `a6bcd26` is now published on Hetzner. A private,
network-blocked preflight on its actual Node 22.23.2 loads all four original
score and badge records without the game secret or a live change. Intentional
API restart preserves environment, authority, relay configuration and both
history prefixes. Both files match the hosted manifest and public health
passes with all four records/badges loaded. Private 0600 history backups remain
for inspection; rollback restores binaries only and preserves newer claims.
The frontend remains `e3937ca`; no actual new-client provider recovery or
physical acceptance is claimed. Original nine-goal criteria remain open.
See [API delivery evidence](evidence/ledger-claim-api-deployed-a6bcd26.json).

## 11 October: current arcade web delivery

Revision `a45717181699e5dbcaaf98431a82d16301d27ba0` is deployed to both
Hetzner web editions. Ledger remains in the catalogue at the owner's request;
Beamward is separate. Android signer timeouts now give Cambium/Amber retry
instructions, and connection messages apply to the selected provider.

The required push gate passes 660 units, type checks and desktop/both web
builds. One complete local Chrome run passes all 50 browser journeys, including
both editions' callback validation, account revocation, launch handoff and
wallet cancellation/amount checks. Earlier callback startup timing failure is
historical; the current complete run passed unchanged assertions and timeouts.
Hosted [CI 38132482332](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38132482332)
on functional commit `6c3edc6` passes source/build, browser, audit and packaged
Linux runtime gates. Runtime and build sources match `a457171`; their difference
is the owner's catalogue-scope documentation. The exact deployed `a457171` also passes hosted
[CI 38132920714](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38132920714),
including all browser and Linux package runtime checks. This qualifies that
checked run, while physical cabinet input and delivery remain separate.

The [standard proof](evidence/gamestr-web-a457171.json) and
[600 proof](evidence/gamestr-600-live-a457171.json) verify release metadata,
eleven exact file hashes per edition, TLS, CSP, HSTS, MIME protection and frame
protection. Checks include the catalogue and both Ledger/Pallasite deep links.
The 600 proof uses forced resolution to `62.238.98.53`; public DNS still points
to `95.217.39.110`. Both previous `4aa7661` release directories remain available.
No payment was sent and no physical signer or cabinet acceptance is implied.

## 11 October: SDK failure status correction deployed

Release `e96baa931f30284578c6f0465b45588ff0804722` is activated on both
Hetzner web routes. The installed SDK's fifteen-second NIP-46 request timeout
could bypass the arcade's forty-five-second timeout handling and leave signing
labelled connected. The arcade now recognises SDK signing timeout, closed
connection, failed handshake and auth-only errors, revokes signing access and
provides reconnect guidance while preserving the selected account and pairing.
User denial leaves the connection usable; a late failed request cannot disable
its replacement session. Five failure variants, denial and session replacement
are covered by seven new regressions. Four initial failure variants failed on
unchanged source before the fix; the final identity/handoff suite passes 22
checks. The complete source/build gate passes 667 units and both web builds.

[CI 38133934854](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38133934854)
passes all source/build, fifty browser journeys, audit, packaging and Linux
runtime stages for this revision. The [standard proof](evidence/gamestr-web-e96baa9.json)
and [600 proof](evidence/gamestr-600-live-e96baa9.json) match eleven exact files
per edition, release metadata, TLS and security headers, including the retained
Ledger catalogue entry and Ledger/Pallasite deep links. The 600 proof uses
forced Hetzner resolution; public DNS is still pending. Earlier release proofs
remain historical and rollback release directories are retained.

The Android callback outcomes and destination criteria are checked as source
and automated evidence. Actual Cambium/Amber/iPhone round trips remain open in
the separate physical criterion. No physical signer or payment result is inferred
from SDK error simulations, hosted browser checks or static asset matching.

## 11 October: owner reports the wallet test was unpaid

Asked to check the earlier 100-sat Wallet of Satoshi test to
`profusemeat89@walletofsatoshi.com`, without sending another payment, the owner
answered: "It wasn't paid". This is the owner's physical-wallet status report,
not a server-verified receipt. The test has no successful settlement evidence
and Goal 9 remains open. No second invoice or payment was attempted.

## Owner included Ledger saved-score reliability: 11 October 2026

The owner explicitly answered “Include Ledger’s saved-score reliability fix.”
Ledger remains in the catalogue; Beamward remains separate. This authorises the
specific saved-score correction and supersedes the previous current-scope
exclusion of Ledger development. Held HUD/music/developer changes remain
preserved on the original Ledger branch.

Draft [Ledger PR #89](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/89)
starts at published client `e3937ca` in the isolated `ledger-saved-score-recovery`
worktree. Commit `1300c8804a41e8d6f9fd88d60ba24965bb1c27e7` removes midnight
expiry and silent twelve-receipt eviction, retains the original payload/account/
finish time, verifies NIP-98 account/payload signatures, requires positive relay
acknowledgements or an explicit higher best, and retains rejected receipts for
manual retry. Automatic recovery skips rejected receipts. Malformed browser
storage is preserved rather than silently overwritten. The API extension
places a previously unaccepted delayed run on its original day, preserving
existing accepted legacy events and the published durable journal.

The three focused regressions fail against the published scoring module
(payload mutation, midnight deletion, fifteen-receipt retention). The corrected
source passes 23 focused tests; the earlier full candidate passed 276 units,
client/server types and thirteen private compiled-service recovery groups.
Those service groups include first submission after seven days, original day/
time, restart, conflicting timestamp and invalid future timestamp. No live
service or owner keys were used by those fixtures.

Local browser checks did not qualify: the old direct-start fixture timed out
before its report; the PLAY fixture then timed out waiting for network idle,
and the private-traffic fixture timed out on PLAY. No layout assertion or time
limit was relaxed. The score fixture now enters via PLAY with loopback-only
HTTP and closed external WebSockets. The original 98-step full player gate
from the published client remains unchanged. Hosted run
[38135981494](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38135981494)
is checking the exact commit. No saved-score client or timestamp extension has
been deployed; production still serves Ledger client `e3937ca` and API `a6bcd26`.

## Downloaded Linux artifact provenance: e96baa9

The current functional arcade release's Linux artifact was downloaded from
completed successful run `38133934854`, artifact `11699809630`. Its SHA-256
is `45c8bef63f45421e87cfdd33661df24f5ce830a904fc694521e4ca47537ccf77`,
matching both `SHA256SUMS` and the packaged runtime report. The artifact uses
integration commit `c55aa49848c8e2780af9766ea1de89dcc1e04fa6`; git tree
comparison proves it is identical to source head `e96baa9`. Its SBOM records
Electron `44.7.0`. No new runtime test was performed locally.

The original report proves launch/return, keyboard navigation, trusted game
keyboard input, verified guest signing, a fresh guest on relaunch, isolated
cookies/storage, unavailable wallet without configuration and no Node/shell
bridge. The ready-panel regression verifies explicit GUEST NOSTR SIGNING
wording. This qualifies cabinet guest isolation, while physical controllers
remain explicitly pending. See [downloaded artifact verification](evidence/linux-artifact-e96baa9.json).

## Ledger owner removal and personal-selection correction: 56840dc

[PR #89](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/89) now
includes a saved-score dialog with original day/status, selected-owner
confirmation/cancel, retained other runs/accounts and cancellation of late
extension identity responses. Personal selection cannot fall back to guest
after missing/rejected/invalid/timed-out NIP-07 identity; a cached guest cannot
receive an unavailable personal run. Reconnect messages are surfaced. Three
old-fallback regressions fail; thirty corrected focused tests and production
build pass. The dialog's heading and Back remain visible on a landscape phone,
controls meet 44px and horizontal overflow is zero in both engines.

Local full-game controls passed before the layout adjustment; later checks
failed during media boot twelve seconds after NEXT TIME, with no script error.
These negative results remain recorded. The independent receipt source with
production styles passes wrong-account rejection, removal/cancel, late
response cancellation, other-run preservation and phone layout in both engines.
This does not replace full-game startup or the original player release gate.

Original run `38135981494` for `1300c88` is terminal failure: 276 units/types,
thirteen service groups and both score-browser profiles passed; the full gate
failed an existing developer-panel Backquote-collapse check (11/12 passed).
The demo capture handler swallowed the developer toggle. The scoped source
now lets the opted-in panel own that key, while held HUD/music changes remain
preserved separately. No threshold or timeout was relaxed.

Previous exact revision `56840dc33dd8b8b2175ce88309b5997b1e90d83e` passed hosted
283 units, client/server types, thirteen private compiled-service groups and
both isolated and full-game saved-score browser engines in
[run 38138295851](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38138295851).
The checked API hash is
`fa68f637eebe1581d3c03e0e910397febe2e9ec0942c5428bf18e31e8acc37b3`.
That original complete player gate ended in failure: WebKit first-flight voice
warm-up timed out waiting thirty seconds for gameplay. The developer toggle
check now passes. Startup and audio criteria remain unchanged.

Final compatibility revision `ed73ebcece1c40033064432e8f1fd4700275b799` preserves
the stored owner before a restored run can be queued under a cached guest key.
Legacy retries may omit the optional timestamp without replacing the stored
event or day; explicitly changed timestamps still conflict. Finish time is
captured at the game-over event before animation, HTTP submissions abort after
fifteen seconds and NIP-07 approval expires after thirty. Logout/provider
replacement invalidates late approvals. All 287 local units, both type checks,
thirteen private compiled API groups and production build pass. The WebKit
audio profile passes locally with six background decodes, maximum concurrency
six and no script errors; it does not clear the hosted failure.
[Exact revision qualification](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38139937880)
is running. No new client or timestamp API extension has been deployed; live
remains client `e3937ca` / API `a6bcd26`.

## Ledger checked API deployment: ed73ebc

Hosted service job 114471539883 in run 38139937880 passes for exact revision
`ed73ebcece1c40033064432e8f1fd4700275b799`. The downloaded artifact matches
both manifest hashes. A private, network-blocked preflight on Hetzner Node
22.23.2 loads all four claims, daily bests and badges from copied current
history without an owner signing key; original history hashes remain exact.

The service is deployed from that checked artifact. Public health and both
deployed binary hashes pass; authority, relays and environment are unchanged.
All original history prefixes remain intact, private backups are 0600 and
rollback restores only binaries. See [deployment evidence](evidence/ledger-api-ed73ebc.json).
The first attempt stopped before mutation because the SSH user could not read
the service environment; the existing non-interactive sudo route completed
deployment. The frontend remains published `e3937ca`; the full client release
gate and real candidate score recovery remain required.

## Current real signer sleep check stops at authentication

A fresh disposable My Signet fixture on published standard arcade `e96baa9`
uses the configured `relay.trotters.cc` rendezvous, with no SDK/relay override.
The approval UI remains on disabled “Signing…” after approval, and the arcade
has no authenticated identity at the fixture's sixty-second deadline. No
sleep/reconnect step, game claim or payment is performed. This does not prove
a root cause or supersede earlier successful signing; it is a current negative
authentication result and cannot qualify sleeping-signer recovery. The
disposable browser is closed. See [fixture outcome](evidence/gamestr-e96-signer-sleep-incomplete.json).

Separately, all 35 previously checked `e3937ca` frontend assets still match
public responses after API `ed73ebc` deployment. The prepared client deployment
procedure passes a private fixture for pre-mutation filename-conflict rejection,
exact candidate files, retained old-tab assets and original-index rollback.
It has not been executed on production; run `38139937880` remains in its full
client release gate.

## Real sleeping-signer recovery qualified on standard e96baa9

A disposable account on published My Signet authenticates to deployed standard
arcade `e96baa9` without a relay or SDK override. After normal page navigation
and live-signer restoration, the fixture obtains a cryptographically verified
kind-31990 event; public submission is blocked. Closing all My Signet tabs
produces SIGNER UNAVAILABLE after 15,501 ms, keeps the exact selected public
key and pairing URI/client credential, and produces no new signed event.
Explicit reconnect approves the same account, obtains a different verified
event and logout removes the selected credentials. No game claim or payment
is made. See [actual sleep/reconnect result](evidence/gamestr-e96-signer-sleep-reconnect.json).

The earlier negative fixtures remain recorded. Fixture corrections use the
single SDK-opened approval tab, wait for a live signer after navigation, respect
the PIN overlay and distinguish an old publication retry from a fresh signed
event. This qualifies the current standard desktop journey, not phone QR,
physical signers or every game. Installed SDK 0.17.3 and its npm publication
are confirmed; its version/integrity match the lockfile.

Ledger full run `38139937880` is terminal failure at WebKit cinematic arrival: a
cancelled music request and below-threshold reveal/restored opacity snapshots.
The profile bypassed PLAY media permissions and sampled animated state after
its readiness check. A correction exercises real PLAY/NEXT TIME and captures
qualifying frames atomically, preserving every final assertion and threshold.
The corrected WebKit desktop/phone profile passes locally; full committed
qualification remains required before client publication. Ledger API `ed73ebc`
remains live, and client `e3937ca` remains published.

The Ledger arrival-fixture correction is committed as `b6ee8dd` and passes
local Chromium and WebKit desktop/phone profiles with no failed requests.
The final assertion block is verified byte-for-byte identical to `ed73ebc`;
no production HUD or music implementation changed.
[Complete exact-revision run 38141857525](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38141857525)
is running. No client publication is claimed.

## Login QR display correction

A remote My Signet fixture stopped before approval because the published
standard edition's 360px canvas did not decode to its displayed approval link.
A controlled comparison encodes the exact same 373-character URL: integer
cells with a four-cell quiet zone decode both in raw pixels and the displayed
360px screenshot; the SDK's one-cell border does not. At 320px the nested QR
panel padding additionally compresses the image to 192px.

The scoped Gamestr adapter regenerates only the displayed QR from the SDK's
existing link/URI. It preserves the exact payload and H correction for My
Signet, L correction for NIP-46, uses integer pixel cells and a four-cell quiet
zone, reclaims QR-panel padding and fits whole cells on resize. The observer
and queued resize frame are removed when login settles. Generation is checked
after lazy loading before any login modal opens. No signer, challenge or
authentication protocol changes.

Four new browser journeys decode actual screenshot PNGs back to the exact SDK
payload at 1280px, 390px and 320px in both editions, for My Signet and NIP-46.
They check bounds, cancellation recovery and no script errors. All 54 local
browser journeys, 667 units, types/config/manifests, desktop and both web builds
pass. See [local QR correction evidence](evidence/login-qr-local-correction.json).
This corrects software-decoded display output; a physical camera and actual
remote signer approval remain separate gates. Published web remains `e96baa9`
until the committed candidate completes hosted checks and deployment.


## Published QR correction and actual remote My Signet approval

Functional revision `8bcc49b` passes exact hosted run
[38143388796](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38143388796),
including 54 browser journeys and packaged Linux smoke. The CI merge tree
matches the candidate tree; all eight script/style hashes per edition match
its downloaded artifact. The AppImage hash matches both manifest and runtime
report. Physical controller acceptance remains pending. See
[CI/package proof](evidence/gamestr-8bcc49b-ci.json).

Both editions are deployed on Hetzner and each matches twelve served files
with TLS/security headers: [standard](evidence/gamestr-web-8bcc49b.json) and
[600](evidence/gamestr-600-live-8bcc49b.json). Standard is publicly reachable;
600 is verified with forced resolution and public DNS remains on the retired
server. This supersedes the publication-pending statement above.

The published standard QR decodes to the exact SDK approval link. A disposable
account on real My Signet in an independent browser context approves it and
produces verified initial and restored signatures. Closing all signer tabs
reports unavailable after 15,424 ms, retaining the selected account and pairing.
Explicit remote QR reconnect restores the same account and logout clears
credentials. Public event submission is blocked; no game score or payment is
sent. See [actual remote result](evidence/gamestr-8bcc49b-remote-qr-live.json).
This qualifies the remote protocol in browser contexts, not a physical camera,
phone, Cambium/Amber or independent NIP-07/NIP-46 application acceptance.


## Ledger byte-range fixture qualification

Run `38141857525` for `b6ee8dd` is terminal failure on a cancelled WebKit
music request. All arrival/reveal/restored-HUD assertions passed in that run;
the fixture returned HTTP 200 with the whole track for media byte-range
requests. The public production origin returns HTTP 206 and exact requested
bytes. Candidate `0d06073` corrects only the fixture server's range responses.
Five explicit HTTP cases and Chromium/WebKit desktop/phone arrival profiles
pass locally with no failed requests. Final assertions, thresholds and
failed-request checks remain byte-for-byte unchanged. No production audio
or HUD change is included.

[Full exact qualification 38144669741](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38144669741)
is running. Ledger client remains `e3937ca`, compatible API remains `ed73ebc`;
no client publication or actual candidate score recovery is claimed. See
[retained failure and correction](evidence/ledger-arrival-range-0d06073.json).


## Actual generic NIP-46 QR journey

On public standard `8bcc49b`, the generic NIP-46 QR decodes to the exact
`nostrconnect://` payload and published My Signet approves it in a separate
browser context using its supported web entry point. Its relay and application
origin match the SDK request. Real authentication, signing after page navigation,
sleep detection after closing all signer tabs (15,435 ms), retained pairing and
account, same-account NIP-46 reconnect, a fresh verified signature and logout
all pass. Public event submission is blocked; no game claim or payment is made.
See [actual NIP-46 proof](evidence/gamestr-8bcc49b-nip46-qr-live.json).

The first fixture stopped before pairing because it expected application origin
in a metadata JSON field; the installed SDK carries it in the top-level `url`
parameter. Correcting that fixture check requires no application change. This
is actual generic NIP-46 protocol acceptance with My Signet, not qualification
of another signer application or a physical camera/phone. Donkeyfarm remains
unavailable in the current paired-device listing.


## Published NIP-07 refresh correction and real extension acceptance

A real nos2x extension on published `8bcc49b` authenticated successfully but
refresh left only a recognised identity: the SDK restored before document-end
extension injection. Candidate `c4b7929` gives saved NIP-07 sessions up to three
seconds for injection before SDK restoration. The SDK still verifies the saved
account; a generation change cancels the wait before invoking the provider.
Delayed injection, no provider and logout during the wait have focused
regressions. All 670 units/source checks and 54 browser journeys pass.

[Hosted run 38145800995](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38145800995)
and the Linux runtime smoke pass. Downloaded AppImage hash matches the manifest
and runtime report; candidate and CI merge trees match, as do all eight
script/style hashes per web edition. Both editions are deployed with twelve
served files, TLS and security headers verified. See [CI/package](evidence/gamestr-c4b7929-ci.json),
[standard](evidence/gamestr-web-c4b7929.json) and [600](evidence/gamestr-600-live-c4b7929.json).
Public 600 DNS and physical controller acceptance remain pending.

The extension is built from unmodified
[nos2x source](https://github.com/fiatjaf/nos2x) revision `014493f`, version 2.5.2,
with recorded compatible dependencies. A temporary Chromium profile generates
its own disposable key using the extension UI; no owner profile/key is read.
Actual local candidate and public standard login, refresh, Studio signing,
account change and logout pass. Nos2x caches its previous public key after the
key changes: its new valid signature is observed, verified and rejected by
Gamestr before publication. The selected original account remains recognised
and the UI reports SIGNER UNAVAILABLE. Explicit extension requests verify that
the replacement public key differs. See [local candidate](evidence/gamestr-c4b7929-local-nos2x-nip07.json)
and [public real-extension proof](evidence/gamestr-c4b7929-real-nos2x-nip07.json).
All public event writes are blocked; no score or payment is sent. The temporary
profile and its fixture keys are removed on completion. This does not qualify
a store-distributed extension binary or a physical device.

## Ledger audio-mixer fixture and current complete gate

Run `38144669741` is terminal failure at WebKit audio mixer on an opening
member-voice fetch during reload. The direct-start fixture passes locally, so
the hosted failure is retained. Correction `9b1f654` enters through real PLAY
and its voice-loading path before inspecting pause and reloading. Local
Chromium and WebKit profiles pass; every assertion and page-error check is
unchanged. No production audio/HUD change is included. See
[fixture evidence](evidence/ledger-audio-mix-real-play-9b1f654.json).

[Complete exact run 38145996437](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38145996437)
is running against `9b1f654`. Client publication remains held at `e3937ca`;
compatible API `ed73ebc` remains live. The earlier range fixture and this audio
fixture do not by themselves clear the complete release gate or actual
earned-score recovery requirement.


## Reproduced Ledger first-flight consent race

Run `38145996437` is terminal failure at the WebKit audio warm-up profile's
30-second gameplay deadline. The fixture checked for NEXT TIME after a fixed
100 ms; PLAY loads that dialog asynchronously. A controlled 750 ms delay of
its real module reproduces the failure locally: the game remains idle with
consent visible and the loading overlay hidden.

Correction `2e01f06` waits for the consent dialog, clicks NEXT TIME and requires
real gameplay instead of attract mode. The gameplay deadline remains 30 seconds;
all audio count, gap, concurrency and error assertions are unchanged. Corrected
WebKit and Chromium profiles pass with the controlled delay. The first delayed
Chromium attempt failed on PLAY canvas interception; a diagnostic rerun passed
without another code change. No production code changed. See
[reproduction and correction](evidence/ledger-warm-consent-race-2e01f06.json).

[Complete exact run 38147639272](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38147639272)
completed with failure after 46 successful game checks. Both audio warm-up
profiles passed; the later WebKit supply check failed only a cancelled music
request. Ledger client remains `e3937ca` and compatible API `ed73ebc` remains
live. The prepared real earned-score journey refuses to run unless its selected
client manifest has a successful full release run; it will verify original
receipt retention after reload and eleven minutes, same-account independent
login, positive publication, original NIP-98 payload and both fresh arcade
score displays. It has not been executed or qualified yet.

### Actual QR cancellation and immediate retry on c4b7929

The deployed SDK closes active My Signet remote-login (kind 1059) and generic
NIP-46 pairing (kind 24133) connections when Cancel is selected. Both web editions
pass a real relay check followed by an immediate retry in the same browser
context: the original connection remains closed, the new attempt opens a fresh
login connection, and cancelling the retry closes it too. Login is ready for
another attempt. All eight cancellation observations complete within 231 ms.
The 600 check uses forced resolution to Hetzner; it does not qualify public DNS.
No identity is approved, no score is submitted, and public event writes are
blocked. See [the exact proof](evidence/gamestr-c4b7929-login-cancellation-retry.json).

The first fixture incorrectly included unrelated profile-feed connections
created after its initial snapshot. Its retained diagnostic identifies those
kind-0 profile requests and the closed login socket. The qualified fixture
identifies login connections by their actual subscription kinds and waits for
an active login subscription before cancellation. Its five-second closure
assertion is unchanged. This does not substitute for physical phone/provider
acceptance or prove every session-switching path.

### Shared fixture byte ranges and supply entry: 6aa3e11

Exact run `38147639272` is terminal failure, not an observation timeout. It passed
46 game checks before WebKit supply interception reported a cancelled music
request. All reported supply visuals and mechanics passed. The unchanged local
WebKit profile also passes; this is not claimed as a deterministic local failure.

The production audio origin returns HTTP 206 with exactly two bytes for a
`bytes=0-1` probe. Sixty-five fixture servers had instead ignored that request
and returned the full file. `6aa3e11` gives those identical handlers one shared
single-byte-range responder while preserving their MIME tables and error
collectors. Sixteen actual HTTP cases cover full/partial/suffix/clamped responses,
HEAD, empty files and invalid requests. All 67 helper/importing files pass syntax
checks. The supply fixture now enters through PLAY, consent and real gameplay
before preparing its controlled mechanics. Both browser profiles pass. Its final
mechanics assertions and request-failure collector are unchanged; no production
source, API, HUD or music asset changes are included.

The full CI job now allows 75 minutes to finish all 98 checks: its previous run
spent about 38 minutes reaching check 47. Individual test deadlines, performance
limits, assertions and the required gate list are unchanged. New exact run
[38150978824](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38150978824)
is terminal failure: the Chromium pickup voice check sampled a music-bus gain of
`0.385851`, above the unchanged `0.35` upper limit. Its reported decoding,
requests, models and recovery passed. The candidate client and actual earned
recovery remain unqualified. See [the scoped correction proof](evidence/ledger-shared-range-supply-6aa3e11.json).

### Exact pairing across browser refresh on current c4b7929

New live My Signet remote QR and generic NIP-46 QR checks use the current
standard public edition, a disposable identity and separate signer/browser
contexts. They compare the paired-client public key, bunker URI and client
credential exactly before navigation, after navigation and after an explicit
browser reload. Credentials stay in ephemeral memory and are not recorded in
these evidence files. A new real signature verifies after reload.

Closing every signer tab then produces SIGNER UNAVAILABLE after 15,431 ms for
remote QR and 15,409 ms for generic NIP-46. The identity and pairing remain
unchanged; explicit same-account reconnect produces another verified signature,
and logout clears the pairing. Public submissions are blocked, no game is
played and no payment is made. Both journeys terminate successfully and close
their temporary browsers.

These results prove Goal 3's paired-client refresh and closed-signer recovery
criterion on the exercised paths. They do not qualify physical camera/phone
use, another NIP-46 application or every session-switching path. The original
combined acceptance criteria remain open. See [current remote QR](evidence/gamestr-c4b7929-remote-qr-refresh-live.json)
and [current generic NIP-46](evidence/gamestr-c4b7929-nip46-qr-refresh-live.json).

### Current local My Signet refresh qualification

The actual “My Signet on this device” route now also passes on `c4b7929`, using
the SDK-opened approval tab and a disposable published My Signet identity. Exact
pairing credentials remain unchanged through navigation and explicit browser
refresh. Real signatures verify before refresh, after refresh and after closing
all signer tabs then reconnecting the original account. The unavailable state
appears after 15,438 ms; pairing remains intact during that failure and logout
clears it. Public submissions are blocked and no gameplay or payment occurs.

This replaces reliance on the earlier `e96baa9` local-flow proof for current
desktop acceptance; the earlier evidence remains historical. Physical phone,
camera and independent signer-application checks remain pending. See
[the current local proof](evidence/gamestr-c4b7929-local-signet-refresh-live.json).

### Actual selected-account switch and session connection cleanup

Current public `c4b7929` passes an explicit logout followed by login to a second
disposable published My Signet identity. The first account also completes the
real refresh/sleep/reconnect journey before this switch. Instrumentation records
native socket references and identifies login subscriptions by kinds 1059 and
24133; it never closes them on behalf of the app. All seven first-session login
connections are closed after logout and before the second login. They remain
closed while the second account connects. Unrelated profile-feed sockets are
excluded.

The second account has a distinct public key and a valid signed authentication
proof. Its active paired transport is observed before logout; every login
connection then closes and its pairing credentials clear. Closure assertions
retain the five-second limit. Public submissions are blocked, no game score is
submitted and no payment is made. Both disposable contexts close at completion.
The fixture's initial duplicate variable declaration failed syntax preflight
before browser launch; corrected scoping passes the actual journey.

Combined with the current eight QR cancellation/retry observations and source
regressions that close late login/restore results after logout or account
replacement, this qualifies Goal 3's session resource cleanup criterion. The
configured login methods continue to exclude private-key paste. Physical phone
and independent provider acceptance remain open. See
[the exact account-switch proof](evidence/gamestr-c4b7929-signet-account-switch.json)
and [QR cancellation/retry](evidence/gamestr-c4b7929-login-cancellation-retry.json).

### Current Pallasite release displaced the arcade recovery branch

A fresh public check on 11 October 2026 identifies Pallasite `ee6a4aa`,
the current main release with the council and Ultra graphics updates. The
earlier `14e969f` client is historical: its entry assets now return 404.
Current main lacks the saved-score outbox and retains the personal-to-guest
retry path. The earlier successful recovery evidence does not qualify this
new client.

Isolated branch `fix/arcade-recovery-current-main` restores the six arcade
commits on top of current main, preserving the newer graphics and bumping the
worker version from v233 to v234. Signing-queue checks, seven saved-score
cases, the existing simulation harnesses, Signet bundle check, build and seven
production-build arcade handoff journeys pass locally. Hosted CI, publication
and current real earned-score acceptance remain pending. Owner-controlled
receipt removal remains a separate open criterion.

### Pickup observation correction: a1d3290

The failed `6aa3e11` pickup observation began after a renderer/Playwright round
trip. A controlled 3.6-second late read on the original fixture misses the
brief duck and fails at `0.999428`. Candidate `a1d3290` starts observation
before triggering pickup and awaits that existing observation. Both normal
Chromium and WebKit profiles pass near `0.28`; the same delayed Chromium read
also passes at `0.28`. An initial corrected attempt timed out at PLAY before
reaching pickup; the subsequent isolated run passed.

The five-second voice-start deadline, 2.5-second duck observation, final
assertions, production audio and saved-score source are unchanged. This is
local evidence of the sampling race, not proof that the full hosted gate
passes. See [observer correction proof](evidence/ledger-pickup-observer-a1d3290.json).

Pallasite restoration [PR #13](https://github.com/TheCryptoDonkey/pallasite/pull/13)
is under hosted qualification in exact run
[38156218862](https://github.com/TheCryptoDonkey/pallasite/actions/runs/38156218862)
for `9c09fa7c01dbcd8bbd01acffedbee017038b25ad`.

Ledger exact candidate `a1d32905eee8d309926bd0c2aec4e4490aebcfc3` is now
in full hosted release run
[38156400254](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38156400254).
No client publication or live earned recovery is claimed.

### Pallasite recovery restored on current main: ee91c65

Restoration PR #13 is merged. Exact branch CI `38156218862` and merged
deployment `38156527375` pass. Both source trees are
`97aedc570c3a00a23631e3a0d188e50456a3e226`. A local build with the merged
revision metadata matches all 14 served entry/version/worker/SDK/JavaScript/CSS
files. Public version is `ee91c65`. The current council and Ultra graphics
remain in the source tree. See [publication proof](evidence/pallasite-live-ee91c65.json).
This proves restored publication, not a new actual earned-score recovery.

Fresh read-only checks also match all four critical scripts/styles each for
Neon `046a822` and Hang On Fren `e4ec515`, including public revision metadata.
External event writes and HTTP mutations were blocked, with no gameplay,
score or payment. See [current consumer asset proof](evidence/gamestr-current-neon-hof-assets.json).

### Pallasite owner-controlled receipt review: d6ee911

[Pallasite PR #14](https://github.com/TheCryptoDonkey/pallasite/pull/14) adds
individual original-date/status rows, selected owner removal with confirmation,
malformed-storage preservation and a fifteen-second HTTP abort deadline with
cleanup. Rejection persists with the original receipt. Removal cannot discard
an active submission or another account's run; failed removal writes retain
the receipt. Only a 64-character hex event id and a positive integer relay
acknowledgement with a consistent total can clear a published receipt.

Thirteen local recovery/HTTP groups pass, including the actual fifteen-second
timeout followed by a successful retry. A focused production-build 320px
browser journey passes keyboard cancellation/confirmation and preservation of
other runs/accounts across relaunch. Two full local browser runs failed earlier
in existing booth/start checks before reaching removal. Diagnostics record
these failures; the original deadlines and graphics remain unchanged. The
focused pass does not qualify the full browser gate.

Exact hosted run
[38158290331](https://github.com/TheCryptoDonkey/pallasite/actions/runs/38158290331)
is running for `d6ee911113669af62aae1a98c060531aebbc2e0c`. Published restoration
`ee91c65` remains unchanged. The new controls require a full hosted pass,
publication verification and current earned-score acceptance. See
[scoped receipt-control evidence](evidence/pallasite-receipt-controls-d6ee911.json).

### Receipt controls published on current main: 9813d13

Pallasite PR #14 is merged as `9813d131985ae97d70cf7c2420c8089dd2cf82a4`.
Branch run `38158290331` passes all thirteen recovery/HTTP groups and all eight
production-build browser journeys, including the new keyboard removal case.
The earlier local full-browser failures remain recorded. Merged CI
`38158625121` and deployment `38158625243` also pass. The branch and merged
source trees are identical (`f3ee94aacc3240e9607420bac1d8a0593e38c12e`).

All fourteen served entry/version/worker/SDK/scripts/styles match a local build
of that exact tree with the merged revision metadata. Public version is
`9813d13`; the worker cache is v235. The current graphics and council update
remain intact. See [publication proof](evidence/pallasite-live-9813d13.json).
This qualifies publication and automated receipt controls; current real earned
recovery, the four-game shared-account matrix and physical acceptance remain
open. Ledger's exact full release gate `38156400254` remains in progress; its
published client is unchanged.

### Supply playback verification: f6e810a

Exact candidate `a1d3290` run `38156400254` is terminal failure after 46
release checks. WebKit supply interception reports one cancelled music request;
all reported supply mechanics and visuals pass. This run stopped before the
pickup-media check, so it does not qualify the earlier observer correction.

A controlled 64KiB/30ms music stream reproduces the old fixture failure locally
while both native tracks decode and resume. Candidate `f6e810a` records music
stream cancellations and requires advancing gameplay playback, unmuted volume
above 0.4, ready media, zero element errors and running audio contexts. Normal
Chromium/WebKit and the controlled slow WebKit stream pass. Original supply
visual/mechanics assertions and gameplay entry deadlines are unchanged.

The negative control returns HTTP 404 for the gameplay bed. The old fixture
incorrectly passes with media error 4 and zero playback progress; the corrected
fixture fails its explicit twelve-second playback check. Thus the correction
detects missing music while accepting recovered streaming cancellations. No
production code, API, HUD or music assets change. See
[playback and negative-control evidence](evidence/ledger-supply-playback-f6e810a.json).

Full exact revision `f6e810ad62c43f87045bbbfbf19e5f2b204f5ba2` failed run
[38161445947](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38161445947)
after 38 release checks. The WebKit arrival fixture reports correct arrival/HUD
behaviour but two cancelled gameplay music requests per viewport. This gate
stopped before supply and pickup-media qualification. The earlier local
playback and negative controls remain scoped evidence, not a completed release.
All 98 original release checks remain required before client deployment and
actual earned recovery. No new invoice or payment was attempted.


### Arrival playback qualification: bc18049

Full f6e810a run 38161445947 stopped after 38 release checks on WebKit
arrival music cancellations, before supply and pickup-media qualification.
A controlled range-stream fixture reproduces the original failure while the
music element has no error, readyState 4, positive playback time and volume
0.45. The corrected fixture passes both desktop and phone cases, including
actual playback progress of 0.525 and 0.508 seconds across the observation.
Its current normal WebKit desktop and phone cases also pass. A missing-track
404 fails the twelve-second playback check with media error 4 and zero time.

Candidate `bc18049f490964fe19b78f38c34404433c191229` preserves every original
arrival/HUD assertion and deadline. It records streaming cancellations and
requires healthy, advancing, unmuted gameplay music, no element errors and
running audio contexts. It adds diagnostic state and cleanup on startup
failure. No production source, API or music asset changes are included.
Local Chromium attempts stop at the original thirty-second startup wait,
before arrival/media checks; diagnostics show a loaded daily contract and no
request or page errors. Experimental Promise and timer-poll readiness changes
also time out and are not retained. Local Chromium playback is unqualified.
See [scoped playback evidence](evidence/ledger-arrival-playback-bc18049.json).

[Full gate 38165987187](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/actions/runs/38165987187)
is running for that exact candidate. All 98 original checks must pass before
publishing the client. Published client remains e3937ca and API ed73ebc.

### Current earned-score acceptance attempts

A three-game disposable remote My Signet fixture first times out during
initial approval. A diagnostic attempt connects and reaches Hang On Fren's
natural gameover, then times out waiting for its NIP-98 signature. The arcade
reports signer unavailable. This does not qualify current same-account
publication; explicit original-account reconnect and receipt retry remain
required.

A current Pallasite 9813d13 run earns 22,683 points with its arcade parent
closed and retains the score under the selected account. The first fixture
then waits for the saved-score controls behind the normal TAP TO START gate
after reload and times out. This is incomplete acceptance, not proof of a
storage failure. The revised fixture performs that normal user gesture before
checking the recovery controls. It is running with a new disposable account;
no score state or receipt is injected. Eleven-minute retention, reconnect,
positive publication and both fresh arcade displays remain unqualified.
No payment or new invoice is attempted.


### Acceptance continuation: natural finishes and device reachability

The corrected Pallasite reload fixture subsequently stops with phase
`deathreplay`, no receipt and no score HTTP attempt. A further attempt with a
normal Enter replay-skip action remains alive in `playing` at the observation
limit, displaying 21,445 points; it also has no finished receipt or score HTTP
attempt. These are incomplete player journeys, not proof of lost saved scores.
The current fixture fires and moves for twenty seconds using ordinary keys,
then observes a natural finish for up to ten minutes, reporting the actual
phase and displayed score. It retains the normal reload start gesture,
original receipt checks, eleven-minute real delay and original-account retry.
No game state, receipt, score or clock is injected.

The prepared current four-game acceptance script now captures and verifies the
NIP-98 request body hash and player signature. If normal publication cannot
complete, it reads the game's actual earned receipt, checks ownership, explicitly
reconnects the original arcade account, relaunches the publisher and retries
through its normal controls. It checks the original run/score and positive
publication before accepting recovery. This script is syntax checked but has
not run; Ledger's complete exact release gate remains a prerequisite.

Donkeyfarm briefly appears connected on the development device list. A default
app query succeeds but lists only developer-installed apps; it does not establish
Wallet of Satoshi or signer availability. Two bounded full app-inventory queries
fail with an invalidated control channel and an unreachable peer. No wallet is
opened, invoice created or payment sent. Physical acceptance remains open; the
owner's earlier report that the authorised hundred-sat attempt was unpaid is
unchanged.


### Current Pallasite receipt survives real reload

A fourth current 9813d13 run naturally earns 19,955 points. Its original receipt
survives reload unchanged, with no score HTTP request. The normal start gesture
returns to the shared booth picker, which deliberately has no restored personal
session. Waiting there for account-owned saved-score controls is an incorrect
fixture expectation, not evidence that storage lost the receipt. The corrected
journey checks the retained receipt at that picker, then explicitly returns to
the arcade, reconnects the original account and relaunches before reviewing or
retrying its score. It does not silently restore a previous booth user's signer.

The fifth current run earns 22,840 points with its arcade parent closed. The
receipt retains its original account, run ID, score and start/finish timestamps
through a real reload. No game state, score, receipt or clock is injected. It subsequently completed
the actual eleven-minute delay, reconnected its original account and was rejected
by the old API as `stale_run`, while retaining its original receipt. See the
[incomplete receipt-stage proof](evidence/pallasite-earned-recovery-progress-9813d13.json).
Reconnect, positive publication, receipt clearing and both fresh arcade displays
remain unqualified. All original Goal 6 criteria remain in scope.


### Actual current Pallasite delayed recovery passes

Current Pallasite actual recovery passes for a normally earned 20,820-point run:
parent closure, reload, a real eleven-minute delay, explicit same-account
reconnect, unchanged receipt signing, HTTP 200 and seven of seven relay
acknowledgements, receipt clearing and independent public-event verification.
The event preserves the original run dates, and fresh pages in both arcade
editions display the exact score/player with reviewed authority. See
[earned recovery](evidence/pallasite-earned-recovery-9813d13.json) and
[both displays](evidence/pallasite-earned-recovery-ui-9813d13.json). This uses
browser automation and forced 600 DNS; current four-game and physical
acceptance remain open.

Current expired-launch checks pass for Hang On Fren `e4ec515`, Neon `0435e93` and Pallasite `9813d13`: real 65-second delays reject the stale bridge without copying the arcade account, consume the fragment, remove the opener and preserve the parent account. Fresh ordinary launches then succeed. Each case uses a separate disposable My Signet account. Pallasite passes after explicit same-account signer reconnect. Earlier navigation without a live signer and two initial approval readiness timeouts remain recorded; the successful diagnostic retry does not establish their cause. Ledger awaits its checked client. No physical or independent-login acceptance follows from these checks. See [current expiry evidence](evidence/gamestr-c4b7929-pending-expiry-current.json).

Current modifier-click isolation is qualified for Neon `0435e93` by a fresh disposable My Signet fixture: no fragment, opener or copied account; the arcade keeps its selected account. Earlier Hang On Fren `e4ec515` and Pallasite `9813d13` modifier cases retain their unchanged runtime artifacts, and all three served main modules were freshly reverified. The combined proof records separate fixture accounts and original case provenance. Ledger remains pending; no independent login completion, gameplay or physical acceptance is inferred. See [current modifier evidence](evidence/gamestr-c4b7929-independent-entry-current.json).

## Current four-game launch fallback qualification

Ledger `ebcd6a5` now completes the current four-publisher modifier-click and expired-launch checks. A real 65,034 ms delayed navigation rejects the expired bridge, consumes its fragment, removes its opener and copies no arcade account; the original arcade account and connected signer remain available. A fresh normal launch accepts the bridge. Meta-click opens independently with no account copy. The exact served module matches the checked artifact. Public writes were blocked.

See [Ledger case](evidence/ledger-launch-fallbacks-ebcd6a5.json), [four current modifier cases](evidence/gamestr-c4b7929-independent-entry-current.json) and [four current expiry cases](evidence/gamestr-c4b7929-pending-expiry-current.json). Cases use separate owned fixtures; independent login completion, the shared-account gameplay journey and physical device acceptance remain separate gates.

## Ledger delayed reconnect observation

The first current `ebcd6a5` attempt normally earned 200 points, closed its parent, reloaded and retained its exact owned receipt for eleven minutes across UTC midnight. It then timed out before sending any HTTP claim. This is **not** a qualified publication or midnight-recovery result. The published title enters its attract demo after 30 seconds; a controlled 35-second idle probe reproduced the hidden login button, and ordinary Escape restored both remote Signet choice and approval-link controls. The fixture now wakes the actual demo before title login; production code and clocks are unchanged. See [unqualified attempt and control diagnosis](evidence/ledger-earned-recovery-reconnect-unqualified-ebcd6a5.json). A fresh earned-run retry remains required.

The first current four-game shared-account fixture stopped during Ledger score reconnect because its QR assertion required exactly one arcade-context page even though the publisher game was already open. The decoded QR and exact approval origin/relay checks passed; this is not a four-game qualification. The fixture now permits exactly the existing arcade and current game pages and still rejects an additional local signer tab. The fresh retry remains pending.

## Current Ledger earned recovery and fresh displays

Ledger `ebcd6a5` now passes actual earned-run recovery: 100 points under a fresh disposable owned My Signet account, arcade parent closed before playing, ordinary gameplay and score banking, unchanged receipt after reload and 664,140 ms of real elapsed time. Ordinary Escape exits the actual idle attract demo before independent original-account remote Signet login. A fresh verified NIP-98 header binds the actual claim URL, POST method and exact body hash; HTTP 200 confirms publication with six of seven relay acknowledgements. Only then does the receipt clear. The canonical authority-signed event preserves original finish second `1791763870` and original UTC day `20261012`. The successful retry does not qualify midnight rollover; the earlier crossing-midnight attempt never sent a claim and remains recorded as unqualified.

Fresh GET-only score pages in both current `c4b7929` editions show the exact 100 points, selected player and REVIEWED GAME AUTHORITY attribution. The 600 page uses forced Hetzner resolution; public DNS remains pending. See [earned recovery](evidence/ledger-earned-recovery-ebcd6a5.json) and [both displays](evidence/ledger-earned-recovery-ui-ebcd6a5.json). All four games now have separate owned-account delayed-recovery evidence. This does not replace the pending current four-game shared-account matrix or physical/device/provider checks.

The diagnostic shared-account run passed Ledger and then received a valid same-account Hang On Fren HTTP 200 with six relay acknowledgements. Its fixture stopped because an indirect parent-window bridge trace was empty; the captured HTTP NIP-98 signature itself uses the selected account. The fresh matrix requires valid signatures on every actual HTTP request, exact URL/method/body binding, fresh authentication, immutable recovered receipts, positive publication and canonical reviewed authority. Observed parent traces remain diagnostic; a missing trace is no longer falsely labelled a wrong account. The previous attempt is not claimed as a completed matrix.

Ledger saved-score [PR #89](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/89) is merged as `bc3728322adf831e1aa1994fecc1345d372329c3` after the actual earned recovery and both displays passed. Its Git source tree exactly equals checked/published `ebcd6a5`; the main branch had no intervening changes. No main-triggered workflow or unchecked redeployment was introduced. The published client remains the exact checked `ebcd6a5` artifact, and held PR #88 remains separate. See [source-tree equivalence](evidence/ledger-pr89-merged-source.json).

## Earlier four-game shared-account qualification (`e4ec515` client)

The complete current matrix now passes with one disposable owned My Signet account (`b0d8c7afe83a664b2784977deedf637b15471733cb41691dfb489f76c18e4621`) and arcade `c4b7929`. All scores are normally earned through ordinary controls; game or score state is not injected.

| Game | Checked served client | Points | Positive relay acknowledgements | Earned receipt retry |
| --- | --- | --- | --- | --- |
| Ledger | `ebcd6a5` | 100 | 5 / 7 | Original owned run after same-account reconnect and normal relaunch |
| Hang On Fren | `e4ec515` | 4,292 | 5 / 7 | Original owned run after same-account reconnect and normal relaunch |
| Neon Sentinel | `0435e93` | 10,677 | 5 / 7 | Original owned run after same-account reconnect and the actual Saved scores / Retry selected run controls |
| Pallasite | `9813d13` | 17,780 | 7 / 7 | Not needed; direct publication succeeds |

Every actual submitted HTTP signature is verified against the selected public key, actual URL, POST method, body SHA-256 and fresh authentication time. Recovered receipts retain original run IDs, scores and clock bounds; Hang On Fren applies the same bounded live server-clock offset to both bounds and preserves duration. HTTP success and positive publication are required before canonical authority events qualify. All four main modules match the checked current publisher proofs. Fresh GET-only pages show all four exact event IDs, scores, the same player and REVIEWED GAME AUTHORITY in both editions (eight pages). The 600 browser uses forced Hetzner resolution; this does not qualify public DNS.

Earlier matrix fixture failures remain recorded: an existing game tab was incorrectly counted as an extra QR signer tab; indirect parent-window observations could disappear across navigation despite actual valid same-account HTTP signatures; and a generic Retry score selector did not match Neon's actual Saved scores controls. The successful run uses exact expected existing tabs, validates actual submitted signatures and uses each consumer's real controls. It does not qualify physical devices, controllers, independent signer applications or payment. See [full current matrix](evidence/gamestr-current-four-game-shared-account.json) and [all eight displays](evidence/gamestr-current-four-game-shared-account-ui.json).

## Main-branch packaged input qualification

Arcade [PR #11](https://github.com/TheCryptoDonkey/gamestr-arcade/pull/11) is merged as `b8079cd`; its source tree equals final checked head `04d91fd`. The [final PR CI](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38188892336) passes the full gate, 54 browser journeys, audit, packaging and runtime smoke. All changes since published `c4b7929` are documentation only.

The subsequent [main CI](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38189135191) passes source/build, all browser checks, audit and AppImage packaging, then fails the first game's trusted ArrowUp wait. Debugger injection produces no observed game/native event; the diagnostic OS XTEST probe delivers a trusted ArrowUp to the same focused game. This does not establish a new product keyboard defect or physical controller qualification; the intermittent debugger-input path remains unqualified. See [preserved failure and OS diagnostic](evidence/gamestr-main-packaged-input-failure-b8079cd.json).

A scoped fixture correction uses OS XTEST for Linux game ArrowUp and held Escape return, guarded by the exact isolated process/window ownership and private local display. It preserves all original trusted-key, signature, isolation and return/focus assertions and additionally requires a native game key event. The Mac path keeps debugger input and cannot send OS keys. Eleven targeted guard tests pass. A controlled Linux negative removes only the dummy game's key handler and requires the real packaged gate to fail at the original ArrowUp assertion despite native delivery. The complete hosted positive and negative are pending; application code, public web deployment, payment and physical acceptance are unchanged.

The [complete hosted gate for `02e5fba`](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38190071350) now passes: 675 units, types/config/manifests and builds, all 54 browser journeys, audit, AppImage packaging, the normal OS-input runtime journey and the controlled missing-handler negative. The normal report records trusted game input, verified guest signature, fresh guest/cookie/storage isolation, both returns and shell focus. The negative fails at the original trusted ArrowUp assertion while native game input is observed. No original normal assertion or watchdog was relaxed. See [qualified normal and negative reports](evidence/gamestr-packaged-input-qualified-02e5fba.json), including the exact smoke-reported AppImage SHA and archive metadata; this proof does not claim an archive download or physical controller qualification.

PR #12 is merged as `fb8273e`, with the same source tree as `0848add`, whose full hosted gate also passed. However, [the subsequent main CI](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38191213888) fails the original shell-root focus assertion after the second game returns. The OS-input journey delivers the first game's trusted native ArrowUp and closes both games, but the shell's active element remains `.cta` after the second return, despite a recorded `host.focus()` call. The controlled negative step was not reached in this run. The precise cause and correction remain open; the two passing PR runs do not clear this intermittent failure. See [preserved return-focus diagnostics](evidence/gamestr-main-packaged-return-focus-failure-fb8273e.json). This does not change the published web revision or Ledger's separately qualified saved-score recovery.

The downloaded `0848add` CI AppImage matches its checksum manifest and smoke hash. In an isolated Hetzner Xvfb display it reproduces the same stale `.cta` focus after the first return. A scoped correction explicitly focuses the shell's native contents before the renderer receives `game:returned`; its compiled main process differs by exactly one executable line. Two diagnostic runs with the correction pass all unchanged journeys. A withdrawal control also passes once, confirming that a passing run alone does not establish elimination of the intermittent fault. The diagnostic corrected runs use the extracted runtime and a repacked application archive, so they do not qualify a newly built AppImage. Source checks pass 675 units, types and the desktop build; full hosted packaging remains required. See [baseline, corrected runs and passing withdrawal control](evidence/gamestr-native-shell-focus-diagnostic.json).

Draft [PR #13](https://github.com/TheCryptoDonkey/gamestr-arcade/pull/13) contains this scoped correction. Its exact-head hosted run `38193062104` for `3153fbe` passes the earlier source/build/browser gates, then fails the original first-game trusted ArrowUp assertion before any return. Native delivery is observed, but the fixture DOM handler does not record that first key; the later diagnostic OS probe does reach it. This run cannot qualify the package or prove the return-focus correction. See [preserved first-key failure](evidence/gamestr-3153fbe-packaged-input-failure.json). No original assertion was relaxed and the PR remains unmerged.

## Independent current publisher approval-link login

Fresh actual modifier-click entries for Hang On Fren `e4ec515` and Pallasite `9813d13` carry no launch fragment, opener or copied arcade account. Their own Nostr login controls open remote My Signet approval links. A separate signer context completes each approval, and each game persists a fresh verified kind-21236 proof for its own exact origin and the disposable account selected in the original arcade. The arcade retains that account. Current served main modules match their checked deployments. See [independent approval-link proof](evidence/gamestr-current-independent-approval-link-fallbacks.json). These are link-route login checks, not gameplay, QR-camera or physical acceptance.

Pallasite's rendered QR decodes to its exact approval link during this run. Hang On Fren's rendered QR does not decode with jsQR; a separate anonymous observation also fails after the QR settles, and OpenCV detects its corners but cannot decode that screenshot. A controlled rendering of the unchanged approval payload using whole-pixel cells and a four-cell quiet zone does decode exactly. The control changes only the isolated test canvas; it does not qualify a production correction. Hang On Fren QR usability remains open, separately from its successful approval-link login.

The next scoped packaged fixture correction waits for the actual visible fixture heading and two animation frames after the complete focused document, bounded to three seconds. Native focus metadata alone is not evidence that the renderer has presented its first frame. No key handler, account, storage or input event is injected by this wait. The extracted-runtime normal journey passes, and removing only the fixture key handler still fails the original trusted ArrowUp assertion despite native delivery. The original input assertions and watchdog remain unchanged. See [normal readiness and controlled missing-handler diagnostic](evidence/gamestr-painted-input-diagnostic.json). A newly built full hosted package remains required; the diagnostic does not establish a physical input result or clear the earlier failures.

The [exact full hosted gate for `e113e45`](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38194129842) now passes: 675 units, types/config/manifests and builds, all 54 browser journeys, audit, AppImage packaging, both runtime launch/return journeys and the missing-handler negative. The downloaded AppImage matches its checksum manifest and CI smoke SHA `6095e8028a9dbe5a8bb9f19075cb3f4b4b82774783e3c859edc941ab8dc6a3b0`. That exact unmodified AppImage additionally passes the unchanged normal journey and controlled missing-handler negative in an isolated Hetzner Xvfb display. See [downloaded artifact and native Linux qualification](evidence/gamestr-e113e45-packaged-qualified.json). This qualifies the exact checked package and fixture, while preserving the earlier failures; physical controller and installed-cabinet acceptance remain pending. Production services and public web deployment were unchanged.


## Merged packaged fix and current QR client qualification

Arcade [PR #13](https://github.com/TheCryptoDonkey/gamestr-arcade/pull/13) is merged as `e57376b`; its source tree matches checked documentation head `8a2f921`. The [complete merged-main gate](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38195400164) passes 675 units, all 54 browser journeys, audit, packaging, normal native input/return and the controlled missing-handler negative. See [merge record](evidence/gamestr-pr13-merged-source.json) and [exact downloaded package qualification](evidence/gamestr-e113e45-packaged-qualified.json). Physical controller and installed-cabinet acceptance remain open; public web stays at `c4b7929`.

Hang On Fren client `d6ea31b` corrects the independent SDK QR canvas using whole-pixel cells and a four-cell quiet zone. It preserves the original approval payload, provider login and challenge. Failure to load the optional encoder leaves the SDK approval link available. Original 219 units, types, client/API builds and private seven-day/restart recovery gates pass, as do all six narrow/wide My Signet and generic Nostr Connect QR cases and the encoder-failure control. The push artifact from [run 38194848370](https://github.com/TheCryptoDonkey/hang-on-fren-public/actions/runs/38194848370) is published; all 151 public file hashes and all seven public browser cases pass. Only static client files changed; the running recovery API and authority are unchanged. See [public hashes and health](evidence/hangonfren-live-d6ea31b.json) and [public QR checks](evidence/hangonfren-public-qr-d6ea31b.json). This qualifies exact browser pixel decoding, not physical phone-camera scanning or an independent signer application. Consumer PR #2 remains a draft pending its documented physical and Actions deployment handover gates.

A fresh actual My Signet account (`644aba0a316f385bfbe141ef7a9235f4ea37b5484e06ce33cc4a69fc16f5aefb`) now passes the complete four-game journey against that current QR client:

| Game | Checked served client | Normally earned points | Positive relay acknowledgements |
| --- | --- | --- | --- |
| Ledger | `ebcd6a5` | 100 | 6 / 7 |
| Hang On Fren | `d6ea31b` | 4,331 | 6 / 7 |
| Neon Sentinel | `0435e93` | 10,490 | 6 / 7 |
| Pallasite | `9813d13` | 20,820 | 7 / 7 |

Each actual HTTP NIP-98 signature binds the selected account, exact URL, POST method, body SHA-256 and fresh authentication time. Recovered receipts retain original run bounds and ownership; Hang On Fren's bounded coherent server-clock correction preserves duration. All four canonical game-authority events publish successfully. Eight fresh GET-only scoreboard pages display those exact event IDs, scores and account with REVIEWED GAME AUTHORITY attribution. See [complete current matrix](evidence/gamestr-d6ea31b-four-game-shared-account.json) and [all eight displays](evidence/gamestr-d6ea31b-four-game-shared-account-ui.json).

The preceding fresh matrix stopped because its response assertion ran before the asynchronous observer finished parsing Neon's successful HTTP 200 response. That partial attempt does not qualify the matrix. The corrected fixture awaits its response-parsing promises while preserving all signature, account, receipt and publication assertions. Gameplay, score, clocks and authentication state were not injected. The completed fresh run closes its owned browser. The 600 edition still uses forced Hetzner resolution; public DNS, physical devices/controllers and the unpaid 100-sat wallet test remain separate open gates.


The current QR client also passes fresh modifier-entry independent My Signet approval-link login: no opener, fragment or copied arcade account, exact QR payload decoding, a fresh valid origin-bound proof, and the parent account preserved. A separate real 65,014-ms expired-launch fixture rejects the stale bridge and consumes its fragment without copying identity; a subsequent ordinary launch succeeds with the original signer still connected. Both fixtures verify the current served module and close their browsers. See [independent login](evidence/gamestr-d6ea31b-independent-approval-link-fallback.json) and [expiry with positive control](evidence/gamestr-d6ea31b-pending-expiry.json). Physical provider and camera qualification remain open.

The subsequent documentation PR's [full hosted run 38197811665](https://github.com/TheCryptoDonkey/gamestr-arcade/actions/runs/38197811665) passes source/browser/build/audit/package stages but fails the second game return-focus assertion. Native shell contents are focused, and the renderer's immediate `host.focus()` is observed, followed by Chromium restoring `.cta` focus. This reopens packaged return reliability despite the earlier green exact-package runs. Preserve [failure diagnostics](evidence/gamestr-fd0966a-packaged-return-focus-failure.json). The candidate renderer correction reconciles the carousel at the next paint, cancels on player keyboard/pointer input, and respects another focused control or newly opened panel/game. Focus ownership regressions cover the actual delayed-restoration order and user-interaction cancellation. Full candidate packaged qualification remains required; no runtime assertion or fixture is weakened.
