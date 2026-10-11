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
- [ ] A recognised identity can reconnect through local or remote My Signet
  without silently selecting another account or forcing an unrelated method.
- [ ] The UI distinguishes identity connected, signer connected, reconnecting
  and unavailable. A sleeping signer or failed relay has a bounded wait and a
  retry action; transient failures preserve usable pairing credentials.
- [ ] Refresh reuses the paired client identity. Closing or suspending the
  signer produces an accurate state and a recoverable next action.
- [ ] Cancellation, switching sessions and retries close superseded resources.
  The app continues to exclude private-key paste.
- [ ] Complete real local My Signet, phone QR, NIP-07 extension and NIP-46
  signer journeys, including refresh, sleep, reconnect and logout.

Signer status audit: SDK 0.17.3 can report `nip46-sign_event-timeout` after
fifteen seconds, before the arcade's forty-five-second deadline. The arcade now
recognises that error, SDK closed-signer/handshake failures and auth-only
fallback, revokes signing ports and shows an actionable reconnect error while
retaining the identity and pairing credentials. User denial keeps the signer
connected. Regression checks also cover same-account reconnect and a late
failure from a superseded session. Release `e96baa9` passes the complete source/build, fifty-browser-journey
and packaged Linux CI gate and is deployed to both Hetzner web editions.
A current actual My Signet fixture on the standard deployed edition verifies
authentication, signing after page navigation, all signer tabs closed, unavailable
status after 15,501 ms, unchanged selected identity/pairing, same-account
reconnect, a fresh verified signature and logout cleanup. Public submission
was blocked and no payment was sent. SDK 0.17.3 is confirmed published in npm.
This does not complete remote/physical signer acceptance. A subsequent remote
QR check found that the published canvas did not decode. The Gamestr display
adapter now preserves the SDK payload/correction while providing whole-pixel
cells, a complete quiet zone and narrow-screen fitting. Both My Signet and
NIP-46 screenshot payloads decode at desktop, 390px and 320px in both editions;
54 browser checks and all 667 local units/source builds pass. Exact hosted CI
and packaged Linux smoke pass. Both web editions now serve `8bcc49b`. Actual
remote My Signet approval using the decoded QR in separate browser contexts
passes authentication, signing, sleep detection in 15,424 ms, pairing
preservation, same-account reconnect and logout. Public submission is blocked.
This does not qualify a physical camera, phone or other external signers.

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
four-game set included Ledger and had deployed consumers; that set no longer
proves Beamward acceptance. The owner has retained Ledger in the current
catalogue for now. Pallasite has a deployed correction for worker reload
and booth-account selection. Failed personal scores now remain with their
original account for retry. Normal gameplay and an attributed public score now
pass in each game with real My Signet. Live same-account retry also passes
after a real signing timeout in Pallasite and after closing the arcade parent
in Hang On Fren. The single-account four-game matrix
also passes with explicit My Signet approval before each game. Published-game
private fixtures verify independent login controls after reload and expired
proofs in all four consumers, plus account-bound receipt retention and an arcade
return after Pallasite's parent closes. These fixtures block external writes;
they do not complete an independent provider login. Ledger also passes a private closed-parent fixture with external writes blocked. A Neon Sentinel closed-parent fixture exposed automatic guest substitution in
the older client. Published `046a822` removes that substitution, preserves
original-account receipts, and adds explicit reconnect/retry/removal controls.
The checked client/API pass hosted recent and seven-day delayed private recovery
gates; current desktop My Signet recovery now passes for an earned 8,745-point run,
with explicit original-account reconnect, preserved reload receipt, positive
publication to five of seven relays and both fresh edition displays.
Physical checks remain open.

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
  matrix passed, but includes superseded Ledger and does not prove Beamward
  acceptance. Record both arcade and game revisions.
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
Both web editions now serve functional revision `8bcc49b` on the new Hetzner
box. All 667 local units, type checks, desktop and both web builds pass.
Exact hosted CI passes all 54 browser journeys and the packaged Linux runtime
gate. Each served edition matches twelve checked files, with TLS and security
headers; each edition's eight script/style files also match the checked CI
artifact. Standard is public; 600 uses forced Hetzner resolution and public DNS
is pending. See [standard proof](evidence/gamestr-web-8bcc49b.json),
[600 proof](evidence/gamestr-600-live-8bcc49b.json),
[checked package](evidence/gamestr-8bcc49b-ci.json) and
[actual remote approval](evidence/gamestr-8bcc49b-remote-qr-live.json).
Earlier `e96baa9` deployment and desktop-signing evidence remains historical.
The newer native ReadyPanel repair `8c3ed43` passes the full hosted gate,
including 652 unit tests, 50 browser journeys and the original Linux AppImage
journeys. Its downloaded package matches the manifest and runtime hash; see
[package proof](evidence/gamestr-native-8c3ed43-ci.json). This qualifies that
package and the stale focus-call repair; other historical intermittent input
symptoms, physical acceptance and the 600 DNS cutover remain open. See
[delivery evidence](RELIABILITY-EVIDENCE.md) for exact stages.

| Goal | Implementation and PR | Automated checks | Deployed or packaged revision | Live acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Selected-session verification, synchronous port revocation and generation guards; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Physical checks pending | In progress |
| 2 | Responsive controls, validated SDK callback and generic Cambium/Amber NIP-55 request; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Physical checks pending | In progress |
| 3 | SDK 0.17.3, independent rendezvous, bounded signing and reconnect status; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Current standard desktop My Signet approval, page-navigation restoration, real signing, 15.5-second sleeping-signer detection, pairing preservation, same-account reconnect and logout pass; Actual remote QR approval/signing/sleep/reconnect/logout pass in separate browser contexts; physical checks pending | In progress |
| 4 | Per-game score authorities and attribution provenance; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Physical checks pending | In progress |
| 5 | Dependency upgrades and high-severity audit gate; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Physical checks pending | In progress |
| 6 | Reviewed handoff capability; PR #11; owner retains Ledger catalogue entry; Beamward remains separate; Ledger PR #88 preserves held work; saved-score fix explicitly authorised in PR #89 | 667 local unit tests and 54 hosted browser journeys passed; Hang On Fren published correction passes 219 units, private API recovery and checked browser; published Ledger passed 98 release checks; Ledger corrected transport remains unqualified; Ledger 272 units and local real PLAY pass; edc direct hosted opening still fails; ceb hosted real-route UI thresholds pass but music cancellation fails gate; Ledger API a6bcd26 published from checked artifact; 275 units/twelve recovery groups and existing-history preflight pass; latest client gate fails phone tour HUD opacity; scoped receipt/day fix 0d06073 is in draft PR #89, including explicit owner removal and NIP-07 personal-account safeguards; 283 hosted units/types and thirteen private groups pass; both isolated controls and full-game saved-score engines pass; original 1300c88 full gate failed developer Backquote, corrected in 56840dc; hosted run 38138295851 failed WebKit audio startup after passing both score-recovery engines; ed73ebc adds restored-owner and legacy-client compatibility, event-time capture and bounded requests; 287 local units/types and thirteen private groups pass; exact full client qualification 38139937880 failed WebKit arrival/media fixture; corrected real-PLAY and atomic-animation fixture passes locally in Chromium/WebKit with unchanged assertions; b6ee8dd full qualification 38141857525 failed only on a cancelled WebKit music request after all arrival/HUD thresholds passed; production-equivalent byte-range fixture correction 0d06073 passes both engines locally and five HTTP range cases; complete exact qualification 38144669741 is running; checked API ed73ebc is deployed with production-history preflight and hash/health verification; actual candidate recovery remains; Neon 101 units, recovery and real SDK modal CI pass; current desktop My Signet earned recovery passes | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; Ledger client `e3937ca` / API `ed73ebc`; Pallasite `14e969f`; Hang On Fren `e4ec515` client/API; Neon `046a822` verified public client/API/SDK; DNS pending | Historical four-game My Signet matrix and saved-score retry pass at forced origin; Neon earned recovery and historical Hang On Fren recovery pass; Neon real delayed recovery passes; HOF actual eleven-minute delayed recovery and both fresh displays pass; physical checks pending | In progress |
| 7 | Independent personal records, verified cache and exact-ID lookup; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Physical checks pending | In progress |
| 8 | Persistent draft/focus, isolated preferences, explicit guest import and opt-in sync; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Physical checks pending | In progress |
| 9 | Invoice QR/copy/link, optional WebLN and explicit public zap consent; PR #11 | 667 local unit tests and 54 hosted browser journeys passed | Standard web `8bcc49b`; 600 `8bcc49b` on Hetzner; DNS pending | Physical checks pending | In progress |

For live runs, record the browser/device, signer or wallet, date, exact revisions,
steps exercised and result. Cover both editions; local and cross-device My
Signet; NIP-07; Cambium and Amber on Android; NIP-46; and every current supported 600 game. The old four-game Ledger matrix is historical. Use disposable
identities for automated checks and redact credentials from evidence.

Implement Goals 1 to 3 with browser journey coverage first. Goal 4 and dependency
maintenance can proceed as separate changes. Complete Goals 6 to 9 once the
session and attribution contracts they depend on are stable.

Current verification and remaining gates are recorded in [RELIABILITY-EVIDENCE.md](RELIABILITY-EVIDENCE.md).
