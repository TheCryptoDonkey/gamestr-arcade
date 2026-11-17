#!/usr/bin/env bash
# macOS: use installed SDK/runtime; own and remove every emulator and server.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
platform="${1:?Choose android or ios}"
evidence="${2:?Pass a fresh evidence directory}"
case "$platform" in android|ios) ;; *) echo 'Choose android or ios' >&2; exit 1;; esac
mkdir -p "$evidence"
evidence="$(cd "$evidence" && pwd)"
scratch="$(mktemp -d /tmp/gamestr-mobile.XXXXXX)"
server_pid='' emulator_pid='' serial='' avd_name='' tools=''
sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
cleanup() {
  if test -n "$serial" && test "$("$sdk/platform-tools/adb" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r')" = "$avd_name"; then
    "$sdk/platform-tools/adb" -s "$serial" emu kill >/dev/null 2>&1 || true
  elif test -n "$emulator_pid"; then kill "$emulator_pid" 2>/dev/null || true; fi
  if test -n "$emulator_pid"; then wait "$emulator_pid" || true; fi
  if test -n "$avd_name"; then "$tools/bin/avdmanager" delete avd -n "$avd_name" || true; fi
  if test -n "$tools"; then rm -rf "$tools"; fi
  if test -n "$server_pid"; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" || true; fi
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$root"
if curl --fail --silent http://127.0.0.1:4174/ >/dev/null; then
  echo 'Port 4174 is already in use; stop that server before running this check.' >&2
  exit 1
fi
GAMESTR_WEB_ORIGIN=http://127.0.0.1:4174 node node_modules/vite/bin/vite.js --config vite.web.config.ts --host 127.0.0.1 --port 4174 --strictPort >"$evidence/vite.log" 2>&1 &
server_pid=$!
for attempt in {1..40}; do
  if curl --fail --silent http://127.0.0.1:4174/ >/dev/null; then break; fi
  kill -0 "$server_pid"
  sleep 1
done
curl --fail --silent http://127.0.0.1:4174/ >/dev/null
if test "$platform" = ios; then
  bash scripts/check-ios-safari.sh "$evidence"
else
  # The Homebrew tools symlink otherwise makes avdmanager inspect Homebrew's
  # empty SDK instead of the selected SDK. This tiny local shim fixes its root.
  tools="$sdk/cmdline-tools/gamestr-$$"
  mkdir "$tools"
  mkdir "$tools/bin"
  cp "$sdk/cmdline-tools/latest/bin/avdmanager" "$tools/bin/"
  ln -s "$sdk/cmdline-tools/latest/lib" "$tools/lib"
  gh release download v0.9.1 --repo forgesworn/cambium --pattern cambium-0.9.1.apk --dir "$scratch"
  node --input-type=module - "$scratch/cambium-0.9.1.apk" <<'JS'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
if (createHash('sha256').update(readFileSync(process.argv[2])).digest('hex') !== 'b9f11de0969098a8a640dc425ea29760d8c9147082c8c7b9f4d21d004b8b3693') throw Error('Published Cambium APK digest changed')
JS
  avd_name="GamestrPairing$$"
  "$tools/bin/avdmanager" create avd --name "$avd_name" --package 'system-images;android-35;google_apis;arm64-v8a' --device pixel_6 <<<'no'
  # Fixed port is intentional: refuse an existing device rather than touching it.
  if "$sdk/platform-tools/adb" devices | rg -q '^emulator-5554[[:space:]]'; then
    echo 'emulator-5554 is already in use; stop it before running this check.' >&2; exit 1
  fi
  serial=emulator-5554
  "$sdk/emulator/emulator" -avd "$avd_name" -port 5554 -no-window -no-audio -no-snapshot -no-boot-anim -memory 2048 -cores 2 -gpu host >"$evidence/android-emulator.log" 2>&1 &
  emulator_pid=$!
  for attempt in {1..120}; do
    if test "$("$sdk/platform-tools/adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1; then break; fi
    kill -0 "$emulator_pid"
    sleep 2
  done
  test "$("$sdk/platform-tools/adb" -s "$serial" shell getprop sys.boot_completed | tr -d '\r')" = 1
  for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    "$sdk/platform-tools/adb" -s "$serial" shell settings put global "$setting" 0
  done
  "$sdk/platform-tools/adb" -s "$serial" install "$scratch/cambium-0.9.1.apk"
  "$sdk/platform-tools/adb" -s "$serial" reverse tcp:4174 tcp:4174
  ANDROID_HOME="$sdk" node scripts/check-android-signer.mjs "$serial" "$evidence"
fi
