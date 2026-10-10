#!/usr/bin/env bash
set -euo pipefail

APPIMAGE="$(readlink -f "${1:?Pass the packaged Linux AppImage}")"
REPORT="${2:-}"
SMOKE_DIR="$(mktemp -d "${GAMESTR_SMOKE_TMP_DIR:-/tmp}/gamestr-smoke.XXXXXX")"
SMOKE_PID=""
cleanup() {
  if [[ -n "$SMOKE_PID" ]]; then
    kill -TERM -- "-$SMOKE_PID" 2>/dev/null || true
    wait "$SMOKE_PID" 2>/dev/null || true
  fi
  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT
mkdir -p "$SMOKE_DIR/games/pallasite"
cp games/pallasite/game.json "$SMOKE_DIR/games/pallasite/game.json"
node --input-type=module - "$SMOKE_DIR" <<'JS'
import { writeFileSync } from 'node:fs'
const root = process.argv[2]
writeFileSync(`${root}/arcade.config.json`, JSON.stringify({
  gamesDir: `${root}/games`, kiosk: false, attractTimeoutMs: 20000,
  theme: { title: 'Packaged runtime check', accent: '#7cf3ff', crt: false },
  leaderboard: { provider: 'mock', relays: [], topN: 5 },
}))
JS
chmod +x "$APPIMAGE"
# Test-only sandbox override: the CI runner has no browser sandbox namespace.
# This launches the packaged renderer with a public fixture and no signer/wallet.
setsid env APPIMAGE_EXTRACT_AND_RUN=1 ARCADE_CONFIG="$SMOKE_DIR/arcade.config.json" ARCADE_READY_FILE="$SMOKE_DIR/ready.json" ARCADE_KIOSK=0 \
  xvfb-run -a "$APPIMAGE" --no-sandbox --disable-gpu --user-data-dir="$SMOKE_DIR/user-data" > "$SMOKE_DIR/runtime.log" 2>&1 &
SMOKE_PID=$!
for _attempt in {1..60}; do
  if [[ -s "$SMOKE_DIR/ready.json" ]]; then break; fi
  if ! kill -0 "$SMOKE_PID" 2>/dev/null; then break; fi
  sleep 0.5
done
if [[ ! -s "$SMOKE_DIR/ready.json" ]]; then
  cat "$SMOKE_DIR/runtime.log" >&2
  printf 'Packaged renderer did not become ready.\n' >&2
  exit 1
fi
node --input-type=module - "$SMOKE_DIR/ready.json" "$APPIMAGE" "$REPORT" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const [readyPath, artifact, reportPath] = process.argv.slice(2)
const ready = JSON.parse(readFileSync(readyPath, 'utf8'))
const expected = JSON.parse(readFileSync('package.json', 'utf8')).version
if (ready.version !== expected || !Number.isSafeInteger(ready.pid)) throw new Error('Packaged runtime version or readiness mismatch')
const report = { ...ready, artifact, sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'), platform: process.platform, arch: process.arch, rendererReady: true }
const encoded = `${JSON.stringify(report, null, 2)}\n`
if (reportPath) writeFileSync(reportPath, encoded)
process.stdout.write(encoded)
JS
