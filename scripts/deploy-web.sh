#!/usr/bin/env bash
set -euo pipefail

TARGET="${GAMESTR_WEB_TARGET:-hetzner}"
EDITION="${GAMESTR_WEB_EDITION:-gamestr}"
DEFAULT_ROOT="/opt/gamestr-web"
DEFAULT_OUTPUT="dist-web"
if [[ "$EDITION" != "gamestr" ]]; then
  DEFAULT_ROOT="/opt/gamestr-web-$EDITION"
  DEFAULT_OUTPUT="dist-web-$EDITION"
fi
ROOT="${GAMESTR_WEB_ROOT:-$DEFAULT_ROOT}"
OUTPUT="${GAMESTR_WEB_OUT_DIR:-$DEFAULT_OUTPUT}"
REVISION="$(git rev-parse --short=12 HEAD)"
RELEASE="$ROOT/releases/$REVISION"

npm run build:web
npm run validate:web

ssh "$TARGET" "install -d -m 0755 '$RELEASE' '$ROOT/releases'"
rsync -az --delete "$OUTPUT/" "$TARGET:$RELEASE/"
ssh "$TARGET" "ln -sfn '$RELEASE' '$ROOT/current.next' && mv -Tf '$ROOT/current.next' '$ROOT/current'"

printf 'Deployed %s web revision %s to %s:%s/current\n' "$EDITION" "$REVISION" "$TARGET" "$ROOT"
