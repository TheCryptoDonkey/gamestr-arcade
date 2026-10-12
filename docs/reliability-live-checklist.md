# Remaining live acceptance

This checklist supports the nine [reliability goals](RELIABILITY-GOALS.md).
It does not replace their acceptance criteria or the
[cabinet acceptance gate](conference-acceptance.md). Record the exact release,
device, browser, provider, date, steps and observed result for each check.

Current public standard edition:
https://gamestr.62-238-98-53.sslip.io/.
The canonical 600 edition is https://arcade.600.wtf/.
Pallasite client `9813d13` / API `52eab4c`, Hang On Fren `e4ec515` and
Neon Sentinel API recovery have published evidence. Neon’s current graphics
client is now `0435e93`; its current CI recovery/SDK and served-code checks pass,
and actual 7,214-point earned recovery after reload and eleven minutes now passes, including both fresh arcade displays. Ledger's requested
saved-score correction is published as `ebcd6a5` after all 98 original release checks, 228 local/server hashes and 36 critical served hashes passed; actual 100-point earned recovery after reload and 664,140 ms, original-account reconnect, positive publication and both fresh displays now pass. Use the current revisions from the evidence log when
performing these checks.

## Public 600 DNS

DNS for `600.wtf` uses DigitalOcean's nameservers. The managing account is
unknown. The required cutover is the `arcade` A record:

| Record | Current value | Intended Hetzner value |
| --- | --- | --- |
| `arcade.600.wtf` A | `95.217.39.110` | `62.238.98.53` |

After the account owner changes that record, check public DNS, normal HTTPS,
`/release.json`, login and publisher launch from a fresh browser on an external
network. The intended functional arcade revision is currently `c4b7929`.
Forced DNS resolution used in automated checks does not qualify this cutover.

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
Repeat the current four-game shared-account journey using the exact
published revisions. Independently check same-account HTTP signatures, unchanged
recovered receipts, positive acknowledgements and reviewed game authority.

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
