# Reviewed score attribution

A signature proves which key signed an event. It does not prove fair play or a
Lightning payment. A player-signed score must attribute itself to that player.
A different `p` tag is accepted only when the signing key is explicitly reviewed
for that game in the curated manifest. These rules apply to kinds 30762 and 5555
in the web app and cabinet. Developer submissions cannot grant themselves trust;
adding a manifest to the public catalogue requires review.

The following public contracts were checked on 10 October 2026. No private key
or payment credential was read. Authorities are scoped to their game ID.

| Game ID | Signing public key | Public evidence |
| --- | --- | --- |
| pallasite | `fa9291d038fd1d3e4439364f289f2e53a64a1d32776ee52c000da53ebc718cdc` | [Game-key endpoint](https://pallasite.app/api/game-pubkey), [NIP-05](https://pallasite.app/.well-known/nostr.json?name=pallasite); faucet solo-score source authenticates the player via NIP-98 before signing the attributed score |
| neonsentinel | `370148bb752fee753c8dd436752e801f02913dbc7ac6330828d13d5540c4ca21` | [Claim health](https://neonsentinel.com/api/claim/health), matching the expected game key and authenticated claim contract |
| hangonfren | `51312d91ac6fc6e35005c23656b0effa159c89e4b21e56e054d5af52adc7c272` | [Claim health](https://hang-on-fren.playechoseven.com/api/claim/health), matching the source game key and authenticated claim contract |
| takemetoyourledger | `6f0baf0c26e68afa787ff8c6e34e41f0395fb53fde4152e2c7bcb5f4674080c2` | [Claim health](https://ledger.playechoseven.com/api/claim/health); claim source uses the NIP-98 authenticated player as the score recipient |

Historical events from other keys that assign a score to someone else are
excluded. An old key must be independently reviewed and explicitly added before
its attributed history can appear. Retained and directly fetched events use the
same policy; cached signatures are verified again after reload.

Boards and challenges contain observed verified events, not a proof of complete
relay history. Recent activity is bounded; personal records are retained
separately while subscribed. The public-event cache is limited to 256 events
and 512 KiB, prioritising retained records. This does not establish complete
all-time rankings. Signed `sats` tags are reported amounts, not settlement proof.
