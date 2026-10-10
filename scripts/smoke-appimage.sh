#!/usr/bin/env bash
set -euo pipefail

APPIMAGE="$(readlink -f "${1:?Pass the packaged Linux AppImage}")"
REPORT="${2:-}"
SMOKE_DIR="$(mktemp -d "${GAMESTR_SMOKE_TMP_DIR:-/tmp}/gamestr-smoke.XXXXXX")"
SMOKE_PID=""
FIXTURE_PID=""
cleanup() {
  if [[ -n "$FIXTURE_PID" ]]; then
    kill -TERM "$FIXTURE_PID" 2>/dev/null || true
    wait "$FIXTURE_PID" 2>/dev/null || true
  fi
  if [[ -n "$SMOKE_PID" ]]; then
    kill -TERM -- "-$SMOKE_PID" 2>/dev/null || true
    for _attempt in {1..20}; do
      if ! kill -0 "$SMOKE_PID" 2>/dev/null; then break; fi
      sleep 0.25
    done
    # Only this launch's dedicated setsid process group can be terminated here.
    kill -KILL -- "-$SMOKE_PID" 2>/dev/null || true
    wait "$SMOKE_PID" 2>/dev/null || true
  fi
  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT
node scripts/appimage-journeys.mjs "$SMOKE_DIR" > "$SMOKE_DIR/journeys.log" 2>&1 &
FIXTURE_PID=$!
for _attempt in {1..40}; do
  if [[ -s "$SMOKE_DIR/fixture-ready" ]]; then break; fi
  if ! kill -0 "$FIXTURE_PID" 2>/dev/null; then break; fi
  sleep 0.25
done
if [[ ! -s "$SMOKE_DIR/fixture-ready" ]]; then cat "$SMOKE_DIR/journeys.log" >&2; exit 1; fi
DEBUG_PORT="$(cat "$SMOKE_DIR/debug-port")"
chmod +x "$APPIMAGE"
# Test-only sandbox override: the CI runner has no browser sandbox namespace.
# This launches the packaged renderer with a public fixture and no signer/wallet.
setsid env APPIMAGE_EXTRACT_AND_RUN=1 ARCADE_CONFIG="$SMOKE_DIR/arcade.config.json" ARCADE_READY_FILE="$SMOKE_DIR/ready.json" ARCADE_KIOSK=0 \
  xvfb-run -a "$APPIMAGE" --no-sandbox --disable-gpu --remote-debugging-port="$DEBUG_PORT" --remote-debugging-address=127.0.0.1 --user-data-dir="$SMOKE_DIR/user-data" > "$SMOKE_DIR/runtime.log" 2>&1 &
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
if ! wait "$FIXTURE_PID"; then
  FIXTURE_PID=""
  cat "$SMOKE_DIR/journeys.log" "$SMOKE_DIR/runtime.log" >&2
  exit 1
fi
FIXTURE_PID=""
node --input-type=module - "$SMOKE_DIR/ready.json" "$APPIMAGE" "$REPORT" "$SMOKE_DIR/journeys.json" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const [readyPath, artifact, reportPath, journeysPath] = process.argv.slice(2)
const ready = JSON.parse(readFileSync(readyPath, 'utf8'))
const expected = JSON.parse(readFileSync('package.json', 'utf8')).version
if (ready.version !== expected || !Number.isSafeInteger(ready.pid)) throw new Error('Packaged runtime version or readiness mismatch')
const report = { ...ready, artifact, sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'), platform: process.platform, arch: process.arch, rendererReady: true, journeys: JSON.parse(readFileSync(journeysPath, 'utf8')) }
const encoded = `${JSON.stringify(report, null, 2)}\n`
if (reportPath) writeFileSync(reportPath, encoded)
process.stdout.write(encoded)
JS
