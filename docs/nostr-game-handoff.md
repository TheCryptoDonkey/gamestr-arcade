# Gamestr Nostr game handoff

The 600 Billion Arcade carries an authenticated Nostr identity into its games without copying keys or cross-origin storage.

## Launch

When a signed-in player opens a game, the arcade adds a `gamestr-auth` value to the URL fragment. The fragment contains:

- the player's signed Signet kind 21236 login proof
- the target game ID and origin
- a random one-use bridge channel
- a bounded kind 0 profile snapshot for immediate display

The proof must be signed for `https://arcade.600.wtf` with the app tag `600 Billion Arcade`, must be no more than 30 days old, and must pass normal Nostr event verification. Fragments are not included in HTTP requests or referrer headers.

## Game verification

Each game verifies the event signature, source origin, app tag, age, target origin, and game ID. It then requires a one-use channel response from the exact arcade window that launched it before accepting the identity. A copied fragment cannot be used as a standalone login link. Invalid handoffs are discarded and the game's normal login flow remains available.

The handoff alone is identity-only. It never contains an nsec, bunker URI, NIP-46 client secret, or Signet local-storage record.

## Signing bridge

The game transfers a `MessagePort` to the opener. The arcade validates the exact child window, game origin, one-use channel, event size, and resulting signature. The child then drops `window.opener` and keeps only the scoped port. When the arcade session has an active signer, the same port can forward bounded signing requests.

Games use the bridge signer through the same `signEvent` interface they already use for Signet. If the arcade session is identity-only, or the arcade tab is closed, signing features stay unavailable and each game falls back according to its existing policy.

## Consumer requirements

A future game should:

1. Declare its HTTPS origin and `nostrSign` capability in the Gamestr manifest.
2. Consume and remove the fragment before its normal session restore.
3. Verify the signed proof against the production arcade origin and app name.
4. Require a live bridge port before accepting the identity, and expose signing only when the arcade session says it can sign.
5. Keep its existing interactive Signet login as the fallback.
