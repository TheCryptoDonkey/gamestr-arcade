# Isolated Phoenixd + NWC gateway

This deployment gives one arcade booth a dedicated Phoenixd wallet and a narrowly scoped NIP-47 authority. It does not share the routing, demo, or any other production wallet.

The gateway accepts one pinned NWC client key and only `get_info` and `pay_invoice`. Before calling Phoenixd it verifies the Nostr signature, destination, caller, timestamp, encrypted payload size, BOLT-11 amount, per-payment cap, rolling rate limit, persistent UTC-day budget, and invoice idempotency. Pending or ambiguous attempts keep their reservation across restarts.

No port is published. Phoenixd is reachable only on the Compose network; NWC traffic travels over the configured public `wss` relay. Secrets belong in the server-side `.env` file (`0600`) and in the booth's local `arcade.config.json`, never in Git or an AppImage.

Operational defaults are intentionally conservative:

- 100 sats per payment
- 5,000 sats reserved per UTC day
- 5 distinct attempts per minute
- dedicated wallet starts unfunded

After first start, construct the booth-only URI from the gateway public key, relay URL, and client secret:

```text
nostr+walletconnect://<bridge-pubkey>?relay=<url-encoded-wss-relay>&secret=<client-secret>
```

Place it under `webln.nwc` in the booth-local configuration. Keep the app's `maxSats`, `sessionBudgetSats`, and `maxPaymentsPerMinute` at or below the gateway limits.

The live smoke test sends a signed `get_info` request from the pinned client and a second request from a fresh attacker key. Success requires the first response and requires silence for the attacker:

```sh
docker compose run --rm --no-deps gateway node smoke.mjs
```

Do not fund the wallet until the smoke test passes and the generated NWC URI has been installed on the intended physical booth.

## Health and backups

Both containers have live health checks. The gateway is healthy only when its
relay connection is established and Phoenixd answers an authenticated balance
request.

`backup.sh` encrypts `seed.dat` and `phoenix.conf` to an age public recipient;
the decryption identity must remain off-server. Install the supplied systemd
unit and timer only after `backup-recipient.txt` contains that public recipient.
The job retains 14 daily encrypted archives and SHA-256 sidecars.
