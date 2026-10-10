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
- [ ] Successful return, denial, invalid proof, expiry, replay and backing out
  leave the page in a useful state with no stuck loading control.
- [ ] Returning from the signer preserves the intended arcade destination.
- [ ] Automated callback and viewport regressions pass, followed by an actual
  Android browser to Cambium and Amber round trips and an iPhone login-control check.

Start in [style.css](../src/web/style.css),
[nostr-access.ts](../src/web/nostr-access.ts) and application boot.

## 3 Make My Signet login and reconnection reliable

The review found `signet-login` locked to 0.14.2 and a wrapper that explicitly
prefers Damus. Identity-only sessions lose the My Signet choices when an action
requires signing. The account UI does not expose connection readiness.

Acceptance criteria:

- [ ] Upgrade to a compatible published SDK release after checking its auth,
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

The launch handoff is restricted to the 600 Billion edition. All four games now
have deployed consumers. Pallasite has a deployed correction for worker reload
and booth-account selection. Failed personal scores now remain with their
original account for retry. Normal gameplay and an attributed public score now
pass in each game with real My Signet; the shared-account matrix and live saved-score
retry remain open.

Acceptance criteria:

- [x] Declare which games support identity and signing handoff. Only games
  with the relevant reviewed capability receive a signing bridge.
- [x] Implement and deploy the missing Ledger consumer in its own repository.
  Consumer changes require that repository's instructions and verification.
- [x] Support the standard edition through an explicit consumer origin/app
  contract, or show clearly that its games require separate login. Do not claim
  universal account continuity while it is edition-specific.
- [ ] Verify normal launch, modifier-click, popup denial, proof expiry, game
  reload and arcade closure. Unsupported paths use a clear independent login
  fallback rather than a copied but unusable proof.
- [x] Game requests have bounded size and concurrency and an explicit signing
  scope. Logout and account replacement obey Goal 1.
- [ ] On the deployed 600 edition, the same player completes a run and sees a
  correctly attributed score in all four games without an unexpected account
  switch. Record both arcade and game revisions.
- [ ] Keep cabinet guest identity explicit; personal login must not retain one
  booth visitor's signing authority for the next visitor.

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

Start in [lightning-reward.ts](../src/web/lightning-reward.ts) and the reward dialog.

## Acceptance evidence

Checked criteria identify requirements proven by source and automated evidence;
they do not mark an entire goal complete or clear its independent live gates.
Keep the following record for each goal as work lands. Leave an evidence stage
pending when it has not been exercised; a merged implementation is not proof of
device or deployed behaviour.

Arcade changes are in [PR #11](https://github.com/TheCryptoDonkey/gamestr-arcade/pull/11);
Ledger's consumer is in [PR #88](https://github.com/TheCryptoDonkey/take-me-to-your-ledger/pull/88).
The current functional revision `4aa7661` passes the complete hosted gate on
an unchanged rerun, including 650 unit tests, 48 browser journeys, packaging and
the Linux game journey. Intermittent native input remains unqualified. Both web
editions are activated on the new Hetzner box at that revision. The 600 cutover and physical acceptance remain open; see
[delivery evidence](RELIABILITY-EVIDENCE.md) for exact stages and remaining gates.

| Goal | Implementation and PR | Automated checks | Deployed or packaged revision | Live acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Selected-session verification, synchronous port revocation and generation guards; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Physical checks pending | In progress |
| 2 | Responsive controls, validated SDK callback and generic Cambium/Amber NIP-55 request; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Physical checks pending | In progress |
| 3 | SDK 0.17.3, independent rendezvous, bounded signing and reconnect status; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Live desktop My Signet approval, signing, refresh and logout pass; physical checks pending | In progress |
| 4 | Per-game score authorities and attribution provenance; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Physical checks pending | In progress |
| 5 | Dependency upgrades and high-severity audit gate; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Physical checks pending | In progress |
| 6 | Reviewed manifest capability and deployed Ledger consumer; PR #11 and PR #88 | 650 unit tests and 48 browser journeys passed; Ledger 98-check release gate and Pallasite seven browser, three queue and seven recovery checks pass | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; Ledger `e3937ca`; Pallasite `14e969f`; DNS pending | All four games have real My Signet runs and attributed public scores at forced origin; shared-account, live saved-score retry and physical checks pending | In progress |
| 7 | Independent personal records, verified cache and exact-ID lookup; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Physical checks pending | In progress |
| 8 | Persistent draft/focus, isolated preferences, explicit guest import and opt-in sync; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Physical checks pending | In progress |
| 9 | Invoice QR/copy/link, optional WebLN and explicit public zap consent; PR #11 | 650 unit tests and 48 browser journeys passed | Standard web `4aa7661`; 600 `4aa7661` on Hetzner; DNS pending | Physical checks pending | In progress |

For live runs, record the browser/device, signer or wallet, date, exact revisions,
steps exercised and result. Cover both editions; local and cross-device My
Signet; NIP-07; Cambium and Amber on Android; NIP-46; and all four 600 games. Use disposable
identities for automated checks and redact credentials from evidence.

Implement Goals 1 to 3 with browser journey coverage first. Goal 4 and dependency
maintenance can proceed as separate changes. Complete Goals 6 to 9 once the
session and attribution contracts they depend on are stable.

Current verification and remaining gates are recorded in [RELIABILITY-EVIDENCE.md](RELIABILITY-EVIDENCE.md).
