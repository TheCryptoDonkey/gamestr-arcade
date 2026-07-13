#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${GAMESTR_WEB_DOMAIN:-gamestr.io}"
EXPECTED_IP="${GAMESTR_WEB_IP:-95.217.39.110}"
TARGET="${GAMESTR_WEB_TARGET:-routing-vps}"
CONFIG="deploy/web/gamestr-web.production.Caddyfile"
REMOTE_CONFIG="/etc/caddy/conf.d/gamestr-web.Caddyfile"

resolve_ipv4() { dig +short A "$1" | sort -u; }

APEX_IPS="$(resolve_ipv4 "$DOMAIN")"
WWW_IPS="$(resolve_ipv4 "www.$DOMAIN")"
printf 'Expected: %s\n%s: %s\nwww.%s: %s\n' "$EXPECTED_IP" "$DOMAIN" "${APEX_IPS:-unresolved}" "$DOMAIN" "${WWW_IPS:-unresolved}"

if ! grep -qx "$EXPECTED_IP" <<<"$APEX_IPS" || ! grep -qx "$EXPECTED_IP" <<<"$WWW_IPS"; then
	printf 'Cutover refused: both apex and www must resolve to %s before Caddy requests production certificates.\n' "$EXPECTED_IP" >&2
	exit 2
fi

if [[ "${1:-}" != "--apply" ]]; then
	printf 'DNS is ready. Re-run with --apply to install and reload the production Caddy site.\n'
	exit 0
fi

scp "$CONFIG" "$TARGET:/tmp/gamestr-web.production.Caddyfile"
ssh "$TARGET" "sudo caddy validate --config /tmp/gamestr-web.production.Caddyfile --adapter caddyfile && sudo install -m 0644 /tmp/gamestr-web.production.Caddyfile '$REMOTE_CONFIG' && sudo systemctl reload caddy"

for attempt in {1..12}; do
	if curl -fsS --max-time 10 "https://$DOMAIN/" | grep -q 'id="app"'; then
		printf 'Production cutover verified: https://%s/\n' "$DOMAIN"
		exit 0
	fi
	sleep 5
done

printf 'Caddy reloaded but HTTPS verification did not pass within 60 seconds. Inspect Caddy certificate logs.\n' >&2
exit 1
