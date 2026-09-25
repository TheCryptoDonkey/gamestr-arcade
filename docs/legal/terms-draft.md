# Terms of use

> **DRAFT for legal review, 25 September 2026.** Drafted from the code on
> `main` (c782894) for the owner to check, complete and sign. It has not been
> reviewed by a lawyer and it is not legal advice.

## 1. About these terms

These terms cover using gamestr-arcade: the Electron kiosk cabinet, and its
public web editions (including the build served at `arcade.600.wtf`). By
using the app you agree to these terms. `[Operator]` runs the service.

## 2. Who can use the service

This app makes no age claim and has no age check anywhere in the code
(checked `README.md`, `SETUP.md` and the source under `src/`). It is
**not** stated to be adults-only, and nothing here invents that requirement.
`[DECISION: whether the owner wants to state a minimum age. Until decided,
this document does not claim one.]`

## 3. Your identity

Where a game asks you to sign a score, a challenge or an invitation, it uses
your own Nostr key through your own signer. This app never asks for or
receives your private key. A score you sign is attributed to your public key
for as long as it is published on the relays that carry it.

## 4. Leaderboard integrity

You must not:

- forge, replay or tamper with a score event, or attempt to make a cheated
  score pass verification;
- impersonate another identifiable person through the optional player label
  or NIP-05 address on a score event;
- use an abusive, threatening or harassing player label.

Score events are verified by their Nostr event ID and Schnorr signature
before they are shown, and any event carrying a `cheated` tag is dropped.
Verification proves the event was signed by the key shown; it does not prove
the underlying gameplay was fair, and this app has no way to inspect a
game's own anti-cheat.
<!-- src/renderer/src/leaderboard/gamestr-reduce.ts isScoreEvent, hasTagValue(e.tags, 'cheated', 'true') -->

## 5. What is not allowed

You must not use the service to:

- publish, through any score, challenge or invitation you sign, content that
  is illegal, that impersonates someone else, or that harasses or abuses
  another person;
- attempt to interfere with the leaderboard's verification, relays, or
  another user's ability to use the service;
- attempt to defraud another user, including through the Lightning zap
  feature (section 7).

## 6. Games listed in the arcade

Each game listed is its own product, built and operated by its own
developer, whether run natively (an AppImage) or as an embedded web game.
gamestr-arcade verifies and displays the score events a game publishes; it
does not review a listed game's own content, behaviour or fairness beyond
that signature and schema check.
<!-- README.md trust boundaries diagram: "The manifest declares what a web game would like to use; it does not grant that access. The Electron main process is authoritative." -->

## 7. Payments are direct and are not gifts we handle

Any Lightning payment made through this app, whether zapping a leaderboard
player or tipping the arcade, goes directly from your own wallet to the
recipient's own Lightning address. This app and its operator never hold,
route or have custody of that payment; the code confirms the wallet contacts
the recipient's Lightning service directly. Payments of this kind are not
refundable through us, because we are never a party to the payment.
<!-- src/web/main.ts rewardDialog copy "This arcade never sees wallet credentials or routes this through the cabinet wallet."; src/web/lightning-reward.ts -->

A related sats faucet exists in a separate project (`pallasite-faucet`) and
is not part of this app; these terms do not cover it.

## 8. Relays

Leaderboards are read from Nostr relays configured for this app, including a
relay the operator also runs and several independent public relays. The
operator of the kiosk cabinet can add, remove or disable relays. We do not
control what an independent relay does with events it carries, and we
cannot guarantee any relay's availability.

## 9. Reporting content

See `docs/legal/report-handling.md` for how to report a leaderboard entry,
player label or challenge, and what we can and cannot actually do about it.
Contact `abuse@forgesworn.dev`.

## 10. Removing content and suspending access

We can decide not to display a score, player label or challenge on our own
leaderboard views, and we can remove a relay we run's copy of an event we
control. We cannot remove a copy of an event held by a relay we do not run;
see `docs/legal/report-handling.md`.

## 11. Our responsibility to you

The service is provided as is. We do not guarantee that any listed game, any
relay, or any Lightning service will be available or error-free. Nothing in
these terms limits liability that cannot lawfully be limited, including for
death or personal injury caused by our negligence, or for fraud.

## 12. Privacy

Our privacy notice, `docs/legal/privacy-notice-draft.md`, explains what we
collect and why.

## 13. Law

These terms are governed by the law of England and Wales. `[LEGAL REVIEW:
confirm jurisdiction and any consumer-law wording needed.]`

## 14. Contact

`[contact address]`. For abuse reports, `abuse@forgesworn.dev`.

---

## Open points in these terms

1. Whether a minimum age is stated (decision; none exists in the code today).
2. The controller entity and contact address.
3. Jurisdiction and consumer-law wording (legal review).
