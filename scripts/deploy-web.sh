#!/usr/bin/env bash
set -euo pipefail

TARGET="${GAMESTR_WEB_TARGET:-routing-vps}"
ROOT="${GAMESTR_WEB_ROOT:-/opt/gamestr-web}"
REVISION="$(git rev-parse --short=12 HEAD)"
RELEASE="$ROOT/releases/$REVISION"

npm run build:web
npm run validate:web

ssh "$TARGET" "install -d -m 0755 '$RELEASE' '$ROOT/releases'"
rsync -az --delete dist-web/ "$TARGET:$RELEASE/"
ssh "$TARGET" "ln -sfn '$RELEASE' '$ROOT/current.next' && mv -Tf '$ROOT/current.next' '$ROOT/current'"

printf 'Deployed web revision %s to %s:%s/current\n' "$REVISION" "$TARGET" "$ROOT"
