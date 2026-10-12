# Remaining live acceptance

This checklist supports the nine [reliability goals](RELIABILITY-GOALS.md).
It does not replace their acceptance criteria or the
[cabinet acceptance gate](conference-acceptance.md). Record the exact release,
device, browser, provider, date, steps and observed result for each check.

Current public standard edition:
https://gamestr.62-238-98-53.sslip.io/.
The canonical 600 edition is https://arcade.600.wtf/.
Pallasite client `9813d13` / API `52eab4c`, Hang On Fren client `d6ea31b` (QR correction, recovery API unchanged) and
Neon Sentinel API recovery have published evidence. Neon’s current graphics
client is now `0435e93`; its current CI recovery/SDK and served-code checks pass,
and actual 7,214-point earned recovery after reload and eleven minutes now passes, including both fresh arcade displays. Ledger's requested
saved-score correction is published as `ebcd6a5` after all 98 original release checks, 228 local/server hashes and 36 critical served hashes passed; actual 100-point earned recovery after reload and 664,140 ms, original-account reconnect, positive publication and both fresh displays now pass. Use the current revisions from the evidence log when
performing these checks.

## Public 600 DNS

The owner changed `arcade.600.wtf` to a CNAME pointing to
`play.forgesworn.dev` on 12 October 2026. All three DigitalOcean authoritative
nameservers publish that alias; Cloudflare and Google resolve the chain to
`62.238.98.53`. Both editions serve functional `c4b7929` over normal verified
HTTPS from a separate DigitalOcean host, with strict headers and 24 matched
checked files. Joystick remains available at `play.forgesworn.dev`.
See [public cutover](evidence/gamestr-public-dns-cutover-c4b7929.json).

The first normal local browser request still used a cached retired address and
failed before loading the app. Cache propagation is distinct from authoritative
DNS and the external successful publication check. A fresh external browser passes actual My Signet login and all four publisher launches after explicit same-account signer reconnect, with checked module hashes, consumed fragments and detached openers. All eight public score pages pass too. See [login/launch](evidence/gamestr-public-dns-cutover-login-launch.json) and [public displays](evidence/gamestr-public-dns-cutover-score-ui.json). The local macOS system resolver still retains the old address despite fresh DNS queries; physical phone/signer checks below remain required.

## Physical phone and signer checks

1. On an iPhone, open each edition in Safari. Check visible login/account/logout
   controls, navigation, dialogs and QR sizing in portrait and landscape.
2. Use a disposable My Signet identity. Exercise local login and remote QR login
   with an actual second device and camera. Check navigation, browser refresh,
   signer sleep, explicit same-account reconnect and logout. Observe the account
   and signer status separately.
3. On Android, perform a complete browser-to-Cambium return, then a separate
   Amber return. Record which app Android selected. Check the intended destination
   and account, denial/back navigation and recovery from a timeout. If the arcade
   recognises an identity without a live signer, use its explicit reconnect
   controls before a signing action.
4. Exercise NIP-46 with an independent signer application. The existing generic
   QR test uses My Signet and qualifies protocol compatibility, not another app.
5. Keep an existing game open while logging out and changing accounts. Check
   that the old game cannot obtain another signature and that the new account's
   actions show its own identity.
6. Check that an interrupted update preserves a typed draft, focus and personal
   preferences. Check an older score link and the player's retained best score.

Donkeyfarm is the identified iPhone 13 Pro Max. A read-only installed-app
query now confirms Wallet of Satoshi (`com.livingroomofsatoshi.wallet`).
The earlier disconnected listing did not prevent this later query. No existing
Safari/device UI-control tool was found; physical login, camera and wallet
journeys remain unqualified. App availability alone does not qualify those steps.
See [device availability](evidence/gamestr-donkeyfarm-wallet-availability.json).

## Current games and cabinet

Ledger's complete gate, checked deployment and actual 100-point earned recovery
after parent closure, reload and 664,140 ms now pass, including original-account
reconnect, positive publication and both fresh score displays. Fresh NIP-98 binds
the actual POST URL/body; the event keeps its original finish second and UTC-day
address. See [actual Ledger evidence](evidence/ledger-earned-recovery-ebcd6a5.json).
The current four-game shared-account journey also passes on those exact
published revisions: Ledger 100, Hang On Fren 4,292, Neon 10,677 and Pallasite
17,780 points. Actual same-account HTTP signatures, immutable recovered receipts,
positive acknowledgements, canonical game authority and eight fresh score pages
are verified. See [current matrix](evidence/gamestr-current-four-game-shared-account.json).
The earlier matrix used forced Hetzner resolution for 600. Fresh public DNS checks now pass for all eight score pages; see [public displays](evidence/gamestr-public-dns-cutover-score-ui.json).

Perform the physical controller and installed-package checks in
[conference-acceptance.md](conference-acceptance.md), including wired/wireless
and both observed controller mappings. Browser input and AppImage smoke results
remain separate from these physical results.

## Wallet of Satoshi payment

The owner reports that the earlier authorised 100-sat attempt was unpaid.
Keep that result as unpaid; invoice creation, a wallet link, a QR display and
wallet launch are separate observations. Do not automatically create another
invoice or send another payment as part of status checking.

On the connected phone, verify the actual reward dialog's copy/QR/wallet route
and inspect the earlier transaction's status in Wallet of Satoshi. Actual paid
acceptance remains open until an authorised payment is visibly confirmed.
Check optional public zap consent separately from wallet payment. Record WebLN
acceptance separately, rather than inferring it from the phone wallet result.
