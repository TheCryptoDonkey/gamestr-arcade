# Gamestr arcade reliability goals

Players should be able to sign in on a phone or desktop, use the identity they
chose, carry it into supported games, and trust that logout ends the arcade's
access to their signer. Scores and personal bests must have clear attribution,
and live updates must preserve the work and controls a player is using.

These goals follow the review on 10 October 2026 at commit
`c7828949ae4da048cc8a37c99439e9b5e4dddc85`. All 615 existing tests and the desktop
and both web build gates passed. Additional browser and disposable-key checks
reproduced the login, signer, draft and score problems below. Passing the
existing suite therefore does not close these goals.

## Current product scope: 11 October 2026

The owner confirmed that Beamward supersedes Ledger, then asked to keep
Ledger in the arcade catalogue for now. The owner explicitly included Ledger's
saved-score reliability fix in this delivery. That correction is being prepared
from the published client baseline in an isolated worktree; previously held
HUD and media changes remain preserved separately. No Beamward replacement is
part of this release. Previous Ledger evidence does not qualify Beamward.

The checked arcade catalogue still contains `games/takemetoyourledger/game.json`
and has no Beamward entry. Beamward's current `docs/ORIGIN.md` permits controlled
neutral engine extraction, while `scripts/check-boundary.mjs` excludes Nostr,
Lightning and external URLs from its production surface. Do not copy Ledger's
signing capability, score authority, handoff contract or hosted URL into a
Beamward entry. Keep the existing Ledger entry and its reviewed capability declarations.
Beamward remains separate until an actual arcade distribution contract exists.
All nine goals remain in scope.

## Delivery order

Implementation is in progress. P1 fixes and the dependent P2 changes are
being checked together before release. The final release must include the relevant live acceptance evidence.

| Goal | Priority | Outcome | Scope |
| --- | --- | --- | --- |
| 1 | P1 | Logout revokes signing and actions use the selected identity | Arcade |
| 2 | P1 | Mobile sign-in and Cambium/Amber return work | Arcade |
| 3 | P1 | My Signet connects and reconnects predictably | Arcade and Signet compatibility |
| 4 | P1 | Scores cannot impersonate another player | Shared score parser and game authority declarations |
| 5 | P1 | Dependency and release gates are healthy | Arcade build and packaged runtime |
| 6 | P2 | Supported games receive the chosen identity consistently | Arcade and game consumers |
| 7 | P2 | Records and old score links remain useful | Shared feed and web routes |
| 8 | P2 | Live updates preserve user work and personal preferences | Web UI |
| 9 | P2 | Mobile players can reward a player without an extension | Web wallet flow |

## 1 Revoke signing on logout and enforce the selected identity

`currentNostrSigner()` falls back to the injected extension after logout.
An established game port can consequently receive another signature. Changing
the extension account can also leave the header showing one identity while an
invitation is signed by another.

Acceptance criteria:

- [x] Every signed action uses an explicitly selected session and the expected
  public key. An extension's presence alone does not restore permission after
  logout.
- [x] Logout revokes pending game launches and connected signing ports before
  asynchronous signer cleanup finishes. Previously issued ports stay revoked
  after signing back in, including with the same public key.
- [x] Account changes are detected before signing where the provider permits
  it. Returned signatures must match both the selected public key and requested
  event. A mismatch produces a clear reconnect message.
- [x] Late login or restore results cannot reactivate a logged-out or replaced
  session. In-flight operations cannot deliver success through a revoked port.
- [x] Browser regressions cover logout, account switching, pending restore,
  re-login and an open game requesting a signature after logout.

Start in [nostr-access.ts](../src/web/nostr-access.ts),
[game-auth-handoff.ts](../src/web/game-auth-handoff.ts) and the signed action
handlers in [main.ts](../src/web/main.ts).

## 2 Make mobile sign-in accessible and consume Cambium and Amber callbacks

The anonymous header login button is hidden below 1101px in both editions.
Android NIP-55 signers return a signed event, but application boot does not consume it.

Acceptance criteria:

- [x] Sign-in, account and logout controls remain visible and operable at
  320px, 390px, 768px, 1024px and desktop widths in both editions. They do not
  overlap navigation or disappear at browser zoom.
- [x] Boot processes incoming SDK callbacks before normal session restoration,
  even when no stored public key exists. It validates the callback and removes
  consumed authentication parameters from the URL.
- [x] Successful return, denial, invalid proof, expiry, replay and backing out
  leave the page in a useful state with no stuck loading control.
- [x] Returning from the signer preserves the intended arcade destination.
- [ ] Automated callback and viewport regressions pass, followed by an actual
  Android browser to Cambium and Amber round trips and an iPhone login-control check.

Current Android request lifecycle: backing out clears the pending proof and
returns the connection control to its idle state. A request with no signer
response expires after sixty seconds with an actionable Cambium/Amber retry
message. Lifecycle regressions cover cancellation, timeout and proof cleanup;
these automated checks do not prove a physical app round trip.

Start in [style.css](../src/web/style.css),
[nostr-access.ts](../src/web/nostr-access.ts) and application boot.

## 3 Make My Signet login and reconnection reliable

The review found `signet-login` locked to 0.14.2 and a wrapper that explicitly
prefers Damus. Identity-only sessions lose the My Signet choices when an action
requires signing. The account UI does not expose connection readiness.

Acceptance criteria:

- [x] Upgrade to a compatible published SDK release after checking its auth,
  bunker signing, paired-client restoration and cross-device fixes. Record the
  installed version and compatibility results.
- [x] Configure a tested login rendezvous relay independently of score relay
  preferences. Verify that wrapper overrides do not defeat SDK fixes.
- [x] A recognised identity can reconnect through local or remote My Signet
  without silently selecting another account or forcing an unrelated method.
- [x] The UI distinguishes identity connected, signer connected, reconnecting
  and unavailable. A sleeping signer or failed relay has a bounded wait and a
  retry action; transient failures preserve usable pairing credentials.
- [x] Refresh reuses the paired client identity. Closing or suspending the
  signer produces an accurate state and a recoverable next action.
- [x] Cancellation, switching sessions and retries close superseded resources.
  The app continues to exclude private-key paste.
- [ ] Complete real local My Signet, phone QR, NIP-07 extension and NIP-46
  signer journeys, including refresh, sleep, reconnect and logout.

SDK 0.17.3 uses the independent `relay.trotters.cc` rendezvous. Source
regressions cover auth-only restoration, failed relay, user denial and late
errors from superseded sessions. Current `c4b7929` passes 670 units, 54 browser
journeys, hosted CI and packaged Linux smoke, and is served by both Hetzner
editions. The public 600 DNS cutover remains pending.

Actual current local My Signet, remote QR and generic NIP-46 QR journeys using
published My Signet pass authentication, signing after navigation, an explicit browser
refresh, sleeping-signer detection, same-account reconnect and logout. Both
navigation and refresh retain the exact paired client credentials. A fresh
signature verifies after refresh. Closing every signer tab produces an accurate
unavailable state in 15,438 ms, 15,431 ms and 15,409 ms respectively, preserves
identity and pairing, and offers a successful same-account reconnect. No public submission
or payment is made. See the [local My Signet proof](evidence/gamestr-c4b7929-local-signet-refresh-live.json),
[remote QR proof](evidence/gamestr-c4b7929-remote-qr-refresh-live.json)
and [generic NIP-46 proof](evidence/gamestr-c4b7929-nip46-qr-refresh-live.json).

Actual cancellation and immediate retry also pass for both QR methods in both
editions: all eight active login connections close within 231 ms, and original
connections remain closed after retry. Current real nos2x NIP-07 login, refresh,
signing, changed-account signature rejection and logout pass. The earlier local
My Signet desktop journey on `e96baa9` remains recorded as historical evidence in the delivery evidence.
The combined physical camera/phone and independent signer-application acceptance criteria stay open. The generic NIP-46 check uses
My Signet and does not qualify another signer application. An actual explicit-logout
switch between two disposable My Signet accounts also proves the first session's
seven observed login connections close before the second login and stay closed;
the second session's connections and credentials clear on logout. Together with
actual cancellation/retry and late-result generation regressions, this qualifies
session cleanup while continuing to exclude private-key paste. See the
[account-switch proof](evidence/gamestr-c4b7929-signet-account-switch.json).

Start in [nostr-access.ts](../src/web/nostr-access.ts),
[account-identity.ts](../src/web/account-identity.ts) and the package lockfile.
Use the [SDK changelog](https://github.com/forgesworn/signet-login/blob/main/CHANGELOG.md)
when selecting the implementation version.

## 4 Enforce score attribution

A valid event signed by one key can currently claim another player through its
`p` tag. Signature verification alone does not establish the claimed player's
ownership of that score or prove honest gameplay.

Acceptance criteria:

- [x] Define attribution for each supported score schema: player-signed scores
  belong to the signer; delegated scores require an explicitly trusted game
  authority and a valid player attribution contract.
- [x] Unauthorised `p` overrides cannot enter a trusted player board, personal
  best or challenge standing.
- [x] Preserve provenance so the UI can explain player signatures and trusted
  game-issued scores. Unknown historical authorities are labelled or excluded
  explicitly rather than silently promoted to trusted records.
- [x] Decide and document compatibility for existing game-issued scores before
  rollout; declarations must not trust every signer publishing a game tag.
- [x] Regressions cover attacker-signed victim claims, legitimate player
  signatures, allowed game authorities, malformed tags and both score kinds.
- [x] Public wording distinguishes signature and attribution checks from
  anti-cheat or proof of payment. A signed `sats` tag alone is not settlement.

Start in [gamestr-reduce.ts](../src/renderer/src/leaderboard/gamestr-reduce.ts),
the feed and the manifest contract used by both web and cabinet.

## 5 Restore dependency and release health

The review's full npm audit reported 21 findings: 10 moderate, nine high and
two critical. The critical findings concern test tooling; Electron has separate
high-severity advisories. The production-only audit reported zero, but excludes
Electron because it is declared as a development dependency.

Acceptance criteria:

- [x] Refresh affected direct and transitive dependencies with a reviewed
  lockfile. Upgrade Electron and affected test tooling deliberately, without
  using a forced audit fix as a substitute for compatibility checks.
- [x] `npm run check` and `npm audit --audit-level=high` pass. Record both full
  and production audit results and the version of the packaged Electron runtime.
- [ ] Package and smoke-test the Linux AppImage. Check launch, return,
  controller navigation, isolated game sessions and bounded wallet behaviour.
- [ ] Verify both deployed web editions serve the intended release, usable TLS
  and security headers. Investigate the review's failed TLS connections before
  asserting a production outage or a successful live release.
- [x] Keep CI, deployment, packaged-runtime and physical cabinet acceptance as
  separate evidence. Preserve the existing
  [conference acceptance gate](conference-acceptance.md).

## 6 Carry identity into supported games consistently

The launch handoff is restricted to the 600 Billion edition. The historical
four-game set included Ledger and had deployed consumers. The owner has
retained Ledger in the current catalogue; Beamward remains outside this delivery.
Current acceptance must record the latest arcade and consumer revisions.
Earlier Pallasite `14e969f` earned-score and reconnect results are historical.
The newer public main release `ee6a4aa` displaced the arcade recovery branch,
removing its saved-score outbox and restoring personal-to-guest retry. The six
arcade commits are restored on current graphics, and owner-controlled receipt
review/removal is merged in PR #14. Current Pallasite `9813d13` is published:
thirteen recovery/HTTP groups, all eight full hosted browser journeys and the
merged deployment pass; all fourteen critical served files match. Earlier local
full-browser failures remain recorded. Original-account actual earned recovery
on this current client remains pending.

Hang On Fren and Neon Sentinel have actual earned-score recovery evidence
under the original account, including parent closure, reload and an eleven-minute
delay. Published private fixtures cover the independent login controls and
expired proofs without external writes; they do not prove a physical provider
login. Ledger's client remains `e3937ca`, with API `ed73ebc` published; its
candidate client requires a successful complete release gate before deployment
and actual earned-score acceptance. Physical checks remain open.

Hang On Fren client/API `e4ec515` are now published from checked branch run
`38121444118`. All 219 units, type checks, builds and private seven-day/restart
API checks pass. Its checked browser fixture covers parent closure, reload,
account isolation, selected retry/removal and readable permanent rejection.
All 149 static files and two API files match; public startup and API health pass.
The restart preserves authority, configuration and five existing history rows.
See [consumer PR 2](https://github.com/TheCryptoDonkey/hang-on-fren-public/pull/2),
[client verification](evidence/hangonfren-live-e4ec515.json) and
[API activation](evidence/hangonfren-api-live-e4ec515.json).

The earlier published `328540a` actual My Signet journey earned 4,331 points after
parent closure and published through explicit same-account reconnect/retry with
five of seven relay acknowledgements. This remains historical evidence for that
client; see [earned recovery](evidence/hangonfren-earned-recovery-328540a.json) and
[display checks](evidence/hangonfren-earned-recovery-ui-328540a.json). Current Neon `046a822` actual delayed recovery passes after an earned 5,566-point
run is held beyond eleven minutes, with preserved timestamps, one canonical
claim, six of seven relay acknowledgements and both fresh displays. HOF
`e4ec515` now also passes actual delayed recovery: a normally earned 4,732-point
run retains its original receipt through 662,518 ms, reconnects with its original
My Signet account, submits one canonical claim and receives six of seven relay
acknowledgements. Both fresh edition displays show the correct attribution.
Earlier failed attempts remain recorded; all physical acceptance remains open.

Acceptance criteria:

- [x] Declare which games support identity and signing handoff. Only games
  with the relevant reviewed capability receive a signing bridge.
- [x] Resolve the current catalogue scope: keep Ledger for now, as instructed
  by the owner. Preserve Ledger score attribution and the reviewed handoff
  contract; do not claim Beamward supports Ledger login.
  Consumer changes require that repository's instructions and verification.
- [x] Support the standard edition through an explicit consumer origin/app
  contract, or show clearly that its games require separate login. Do not claim
  universal account continuity while it is edition-specific.
- [ ] Verify normal launch, modifier-click, popup denial, proof expiry, game
  reload and arcade closure. Unsupported paths use a clear independent login
  fallback rather than a copied but unusable proof.
- [x] Game requests have bounded size and concurrency and an explicit signing
  scope. Logout and account replacement obey Goal 1.
- [ ] On the deployed 600 edition, verify each current supported game
  against its reviewed login and scoring capabilities. The historical four-game
  matrix passed on earlier revisions. Requalify Ledger and the other retained
  games against their current releases. Record both arcade and game revisions.
- [x] Keep cabinet guest identity explicit; personal login must not retain one
  booth visitor's signing authority for the next visitor.
- [ ] Recover saved personal runs after a later reload, including beyond the
  API's current ten-minute submission window. Preserve original run timestamps,
  account ownership and durable idempotency; do not make old runs appear fresh.
  Surface permanent rejection clearly and provide an explicit owner-controlled
  way to remove an unrecoverable receipt without silently evicting other runs.

Neon's former API rejected runs older than ten minutes. Published `046a822`
removes that limit while requiring fresh NIP-98 and durably retaining original
account/run acceptance. The checked API passes a seven-day-old private run,
restart and same-event retry, concurrent deduplication and changed-run rejection.
The client adds explicit confirmed removal of selected retry copies. Deployment
preserves the game authority and two existing records, with a history backup.
Current desktop My Signet reconnect/publication passes for an earned run;
physical signers remain unqualified. See
[API deployment](evidence/neon-api-live-046a822.json) and
[public client verification](evidence/neon-live-046a822.json).

Historical Ledger work: the original private baseline reproduced lost retry
publication and unstable deduplication. API `a6bcd26` was subsequently deployed
with durable recovery, passing 275 units, twelve private recovery groups and an
existing-history preflight. Its newer client was not deployed because the phone
HUD gate failed; midnight receipt expiry also remains unresolved. These are
legacy observations, not active Beamward requirements. Preserve the
[baseline](evidence/ledger-claim-gap-private-edc8427.json) and
[deployment evidence](evidence/ledger-claim-api-deployed-a6bcd26.json).

Update [the handoff contract](nostr-game-handoff.md) and
[platform documentation](WEB-PLATFORM.md) alongside the implementation.

## 7 Preserve records and resolve old score links

The feed evicts old events when its per-game cap is reached, including personal
records. Score pages depend on that recent feed instead of fetching the
requested event directly.

Acceptance criteria:

- [x] Separate bounded recent activity from retained best scores. Older bests
  survive unrelated activity and respect ascending and descending scoring.
- [x] Fetch a requested score by event ID, validate it and its attribution, and
  resolve it without relying on the latest broad relay query.
- [x] Distinguish syncing, unavailable, invalid, cached and live results. A
  missing event does not leave an indefinite "Syncing event" page.
- [x] State the history coverage of all-time boards honestly. Discovering
  complete history must not create an unbounded browser event store.
- [x] Challenge standings cover their signed time window or disclose incomplete
  history instead of labelling a recent subset as authoritative final results.
- [x] Regressions exercise cap eviction, old links, empty relays, cache use,
  both score directions and challenge windows outside the recent feed.

## 8 Preserve user work and isolate personal preferences

Signing in rebuilds the developer editor and loses its draft. Profile and score
updates also rebuild controls. Favourites and follows share one device-local
storage record across accounts.

Acceptance criteria:

- [x] Login, profile and score updates preserve developer drafts, validation
  state and visible publish progress. Persist drafts locally and recover them
  after refresh where storage is available.
- [x] Updates preserve focus, search text, filter selections and open dialogs.
  Dialogs trap focus, support Escape and restore focus on close.
- [x] Favourites and follows are scoped to the selected account, with a separate
  guest store and an explicit migration choice for existing device preferences.
- [x] Local storage failure does not crash the page or falsely claim a saved
  preference. Local-only follow behaviour remains clearly described.
- [x] Add optional, consented Nostr preference sync with local fallback and
  tested merge behaviour. Importing or publishing a follow list must not replace
  an existing Nostr contact list accidentally.
- [x] Browser regressions cover a draft across login, focus during live events,
  dialog keyboard use, account switching and preference isolation.

## 9 Make mobile rewards usable without an extension

The current reward flow requires an injected WebLN provider. A My Signet login
does not itself provide a Lightning wallet.

Acceptance criteria:

- [x] Offer an exact-amount invoice with QR, copy and wallet-link options when
  WebLN is absent. Keep WebLN available where supported.
- [x] Separate optional public zap signing from wallet payment. Describe the
  identity disclosure before creating a public zap request.
- [x] Preserve recipient and amount validation. A malformed or wrong-amount
  invoice never reaches a wallet action.
- [x] Distinguish invoice created, wallet opened, payment pending and confirmed.
  Displaying a QR or opening a wallet does not count as payment confirmation.
- [x] Cancellation and uncertain outcomes do not trigger an automatic duplicate
  payment. The public app does not reuse the cabinet's wallet authority.
- [ ] Test WebLN and an actual mobile wallet route. A payment test uses a
  separately authorised recipient and amount and records the confirmation method.

The owner checked the earlier authorised 100-sat Wallet of Satoshi attempt on
11 October and reports that it was not paid. Wallet launch and invoice creation
remain evidence of preparation only; Goal 9's real-payment acceptance is open.
No second payment or invoice was attempted in response to this report.

Start in [lightning-reward.ts](../src/web/lightning-reward.ts) and the reward dialog.

## Acceptance evidence

Checked criteria identify requirements proven by source and automated evidence;
they do not mark an entire goal complete or clear its independent live gates.
Keep the following record for each goal as work lands. Leave an evidence stage
pending when it has not been exercised; a merged implementation is not proof of
device or deployed behaviour.

Arcade changes are in [PR #11](https://github.com/TheCryptoDonkey/gamestr-arcade/pull/11);
Historical Ledger work is in [PR #88](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/88).
Both web editions now serve functional revision `c4b7929` on the new Hetzner
box. All 670 local units, type checks, desktop and both web builds pass.
Exact hosted CI passes all 54 browser journeys and the packaged Linux runtime
gate. Each served edition matches twelve checked files, with TLS and security
headers; each edition's eight script/style files also match the checked CI
artifact. Standard is public; 600 uses forced Hetzner resolution and public DNS
is pending. See [standard proof](evidence/gamestr-web-c4b7929.json),
[600 proof](evidence/gamestr-600-live-c4b7929.json),
[checked package](evidence/gamestr-c4b7929-ci.json) and
[actual NIP-07 extension](evidence/gamestr-c4b7929-real-nos2x-nip07.json).
Earlier `8bcc49b` My Signet and generic NIP-46 live proofs remain qualified for
the unchanged remote restoration/signing paths. The new correction is specific
to delayed NIP-07 extension injection. Physical/provider acceptance stays open.
The earlier native ReadyPanel repair `8c3ed43` passes the full hosted gate,
including 652 unit tests, 50 browser journeys and the original Linux AppImage
journeys. Its downloaded package matches the manifest and runtime hash; see
[package proof](evidence/gamestr-native-8c3ed43-ci.json). This qualifies that
package and the stale focus-call repair; other historical intermittent input
symptoms, physical acceptance and the 600 DNS cutover remain open. See
[delivery evidence](RELIABILITY-EVIDENCE.md) for exact stages.

| Goal | Implementation and PR | Automated checks | Deployed or packaged revision | Live acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Selected-session verification, synchronous port revocation and generation guards; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Physical checks pending | In progress |
| 2 | Responsive controls, validated SDK callback and generic Cambium/Amber NIP-55 request; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Physical checks pending | In progress |
| 3 | SDK 0.17.3, independent rendezvous, bounded signing and reconnect status; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Current c4b7929 local My Signet, remote QR and generic NIP-46 QR approval/signing/explicit refresh/sleep/reconnect/logout pass, with exact paired-client retention across navigation and refresh. Current live QR cancellation/retry pass in both editions; Real nos2x NIP-07 login/refresh/signing, changed-account signature rejection and logout pass on current standard c4b7929; physical and remaining provider checks pending | In progress |
| 4 | Per-game score authorities and attribution provenance; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Physical checks pending | In progress |
| 5 | Dependency upgrades and high-severity audit gate; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Physical checks pending | In progress |
| 6 | Reviewed game handoff in PR #11; owner retains Ledger; saved-score fix in PR #89; held PR #88 preserved; Beamward separate | Arcade: 670 units and 54 browser journeys pass. Ledger: 287 units/types and thirteen private durable recovery groups; saved-score profiles pass in both engines. Latest `a1d3290` full run `38156400254` failed after 46 checks on a WebKit supply music cancellation; it stopped before pickup-media qualification. Candidate `f6e810a` adds verified music playback and retains original supply mechanics; both engines and the controlled slow stream pass, while a missing-track negative fails. Full run `38161445947` failed on arrival cancellations. Candidate `bc18049` passed audio checks but failed a transient harvest confirmation read. Candidate `e6e2066` records that real confirmation and awaits full run `38170291018`. Prior failed gates remain recorded. Hang On Fren: 219 units and API recovery; Neon: 101 units and real SDK modal/recovery checks | Standard/600 web `c4b7929` on Hetzner; public 600 DNS pending. Ledger client `e3937ca` / API `ed73ebc`; Pallasite `9813d13` (recovery and owner controls on current graphics); Hang On Fren `e4ec515`; Neon `046a822` | Earlier four-game shared-account matrix is historical. Earlier Pallasite earned recovery is historical; current 22,840-point receipt survives reload and eleven minutes but the old API rejects it as stale. API correction `3173d18` passes 131 tests/types/build and hosted qualification; the checked API is published with twelve existing tables, authority, relays and configuration preserved. Actual recovery remains pending. Neon and Hang On Fren actual earned recovery pass; Neon/HOF delayed recovery and both fresh displays pass. Ledger candidate actual recovery and current four-game qualification remain pending. Physical checks pending | In progress |
| 7 | Independent personal records, verified cache and exact-ID lookup; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Physical checks pending | In progress |
| 8 | Persistent draft/focus, isolated preferences, explicit guest import and opt-in sync; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Physical checks pending | In progress |
| 9 | Invoice QR/copy/link, optional WebLN and explicit public zap consent; PR #11 | 670 local unit tests and 54 hosted browser journeys passed | Standard web `c4b7929`; 600 `c4b7929` on Hetzner; DNS pending | Physical checks pending | In progress |

For live runs, record the browser/device, signer or wallet, date, exact revisions,
steps exercised and result. Cover both editions; local and cross-device My
Signet; NIP-07; Cambium and Amber on Android; NIP-46; and every current supported 600 game. The old four-game Ledger matrix is historical. Use disposable
identities for automated checks and redact credentials from evidence.

Implement Goals 1 to 3 with browser journey coverage first. Goal 4 and dependency
maintenance can proceed as separate changes. Complete Goals 6 to 9 once the
session and attribution contracts they depend on are stable.

Current verification and remaining gates are recorded in [RELIABILITY-EVIDENCE.md](RELIABILITY-EVIDENCE.md).
