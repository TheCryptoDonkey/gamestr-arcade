# Conference phone pairing

My Signet and Cambium are the first choices. Other NIP-46 signers, including
Amber, are protocol-compatible alternatives. Guest play is available without
opening a signing connection. Bark continues to use the existing NIP-07
browser-extension path on a personal device.

The same pairing screen serves the Electron cabinet and both web editions, so
the conference computer can remain undecided. On web, choose **Connect Nostr →
Pair a phone (Signet or Cambium)**. In the cabinet, select **Player · guest**,
press P or press Y on a physical controller. The 1920 × 1080 layout keeps the
QR, choices and guest button visible together.

## Player journey

1. Choose My Signet or Cambium on the TV and scan the fresh QR. My Signet uses
   its existing Nostr Connect handler. Cambium opens `/phone-pair/` on Android.
2. On the Cambium phone page, choose **Approve with Cambium**. Cambium asks
   Heartwood to sign the login challenge and returns the signed event to the
   browser. The page also offers the standard Android signer scheme.
3. Check the account on the TV. For Cambium, compare the confirmation code on
   both screens; it is derived from the signed identity proof. Confirm locally
   with **That’s me. Let’s play**. A paired phone controller cannot operate this
   account-confirmation screen.
4. Keep the Cambium page open during play. Game actions appear there for visible
   approval in Cambium. The returned event must match the exact request and
   selected account. Declining a request does not grant any signing authority.
5. Choose **Finish / Next player** from the web account menu or cabinet player
   control. The phone can also disconnect. Access ends immediately on the TV;
   a later phone response cannot revive it. Pairing expires after two minutes,
   individual approvals after 90 seconds, and a player session after 20 minutes.

## Keys, storage and network

Identity private keys remain in the chosen signer; with Cambium they remain on
Heartwood. The TV holds only a disposable connection key in memory. Conference
login removes previous SDK restore credentials and is not restored by refresh.
It does not request identity-key export, decryption or private messaging.

The Cambium companion is a static page on each existing Arcade origin, not a
new account service. It uses encrypted NIP-46/NIP-44 messages over the existing
`wss://relay.trotters.cc` relay. The QR invitation secret is in the URL fragment.
The phone stores an expiring connection key, signed proof and pending request
in local storage so a native callback can return in another tab. A new tab
takes ownership and pauses the old one. Finish removes this record; expired
records are removed on the next visit and cannot extend the TV session.

NIP-55 returns the signed event and a one-use request token in an HTTPS query
because Cambium rejects callback fragments. The page immediately removes these
from its visible URL and uses `no-referrer`; the HTTPS server may still receive
the callback query in access logs. It contains a signed request, not an identity
private key. No extra analytics, cloud account or relay is introduced.

The cabinet restricts personal signing to game-tagged scores and authentication
for the launched game's allowed origins. Guest games retain a separate
disposable identity per launch. Native AppImages do not receive this identity
bridge. On web, only publishers implementing the existing `gamestr-auth-v1`
handoff receive ongoing Arcade signing access; ordinary publisher sites may
still need their own login. This does not transfer wallet authority.

## Local review and evidence

Prepared for version 0.2.6 on 17 November 2026, based on
`6f3d13d6d006d1f6516e5f53846fc7a4c10e0980`. Publication and deployment evidence
accompany the GitHub release. Both web editions must be deployed before using
the cabinet's Cambium QR, which opens the standard production web origin.

Review the method picker, TV QR, TV account confirmation, Android companion
login/action/finish screens, and web/cabinet Next Player controls. Reproduce with:

```sh
npm run check
npm run test:browser
node scripts/check-conference-cabinet.mjs
```

Local results: `npm run check` passed with 715 unit tests, types, desktop build,
both web builds, preload checks, CSP and JavaScript-budget validation. All 65
browser journeys passed. After the final physical-controller reader adjustment,
the four pairing journeys, affected unit tests, types, desktop build and the
Electron runtime check passed again. The final browser regression uses the
actual phone SDK's merged virtual pad alongside a physical controller: only
the physical controller can confirm the account.

The browser pairing test uses real NIP-46 encryption and signed events with a
disposable local relay and simulated native approvals. It covers both editions,
new-tab Android returns, exact account/request validation, Signet and generic
NIP-46 QR handshakes, next-player revocation, and exclusion of phone-controller
input from approval. The Electron check uses the actual main process, preload,
shell and isolated game view with a disposable profile and guest game. It checks
local pairing controls, confirmation guards, signed guest scores and a fresh
guest identity on relaunch. Its temporary profile and HTTP server are removed.

Browser screenshots are generated under `test-results/`; retained local review
images are [TV pairing](./evidence/conference-tv-pairing.jpg) and
[phone confirmation](./evidence/conference-phone-confirmation.jpg). They use
expired invitations and disposable identities, not real accounts.

Before event acceptance, use the exact deployed revision and final conference
computer, TV and network. Scan from the expected viewing distance; use actual
My Signet, Cambium/Heartwood and Amber versions; approve a real supported game
score; decline and cancel approvals; switch accounts; sleep/wake the phone;
test loss of relay connectivity; and finish before the next visitor. Confirm
that refresh returns to guest and the next visitor cannot use the old signer.
Verify physical controller approval and guest recovery on the chosen browser
or packaged Linux cabinet. Automated protocol and macOS runtime evidence does
not establish these physical-device results. See also
[conference acceptance](./conference-acceptance.md).
