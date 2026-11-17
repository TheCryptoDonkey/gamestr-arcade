# Mobile pairing checks

Use OS emulators as well as the fast browser suite. A mobile user agent alone
does not exercise Android intent dispatch, native consent or browser callbacks.

| Target | Automated journey | Boundary |
| --- | --- | --- |
| Desktop Chromium, both editions | Own-product order, guest, My Signet/generic NIP-46, Cambium callbacks, five-minute expiry, signed actions and next player | Local relay and simulated signer approvals |
| Android 15 emulator, Chrome and published Cambium 0.9.1 | Actual Chrome intent opens Cambium; approve in its native screen; return to Chrome; matching TV/phone code; signed score; next-player revocation | Public relay and a disposable software bunker replace physical Heartwood |
| iPhone simulator, actual Safari | Own-product order, guest exit, Cambium's Android requirement in portrait and landscape | Does not test an installed My Signet or Amber app, camera scanning or hardware consent |

Run each OS separately on memory-constrained machines:

```sh
npm run test:browser
npm run test:mobile:android -- test-results/mobile-android
npm run test:mobile:ios -- test-results/mobile-ios
```

The mobile commands start a Vite server on loopback port 4174 and refuse an
existing server on that port. Each creates its own blank OS device, stops it
and deletes it on exit, and removes its build/download scratch. Existing
devices are preserved. Use a fresh evidence directory for each run; retain the
JSON/screenshot or XCTest result bundle needed for a review, then remove the
remaining output. These checks use no real account, imported recovery material
or physical signer.

The macOS prerequisites are Node 24, `npm ci`, Playwright Chromium, Java 17+,
the Android SDK (`ANDROID_HOME`, default `~/Library/Android/sdk`) with the API 35
Google APIs arm64 image, Xcode with an iPhone 16 simulator runtime, and
`xcodegen`. Android also needs `gh` authenticated for the published APK download.
Its SHA-256 is pinned in the runner; an altered APK fails before installation.
Android needs GitHub and `wss://relay.primal.net`; transport failure is a failed
check. Native controls use the emulator's UIAutomator accessibility snapshots;
Playwright connects to the real Chrome browser separately.

The Android result records OS, Chrome and Cambium versions, protocol operations
and completed checks. Its native approval and connected-page screenshots use
disposable identities. The iPhone XCTest bundle contains assertions and Safari
screenshots; it uses the actual Safari app, independently of Playwright WebKit.

## Compatibility regressions found by the emulator

The API 35 image's Chrome 124 leaves `new URL('nostrconnect://…').hostname`
empty. A valid invitation therefore reached the generic fresh-code error
before Cambium could approve. The phone now reads the strict NIP-46 authority
and ordinary query separately, including callback session selection and relay
peer selection. Fast browser regression tests reproduce the empty-hostname
behaviour through the complete pairing and signing journey.

The phone can also be slightly behind the TV clock. The invitation's maximum
lifetime is checked against its creation timestamp, with second rounding,
instead of rejecting a fresh five-minute deadline merely because it is more
than five minutes ahead of the phone's current clock. The original expiry and
TV deadline still apply; scanning does not extend them.

Safari upgrades loopback assets to HTTPS when the page includes
`upgrade-insecure-requests`. The Vite development server now omits that directive
for its HTTP pages. Production builds retain it, enforced by build validation.

Event acceptance still needs the selected conference TV/computer/network,
camera scanning distance and real signer/hardware consent. See
[the conference acceptance record](./conference-acceptance.md).
