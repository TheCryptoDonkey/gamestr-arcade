#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
evidence="${1:?Pass a fresh evidence directory}"
mkdir -p "$evidence"
evidence="$(cd "$evidence" && pwd)"
scratch="$(mktemp -d /tmp/gamestr-safari.XXXXXX)"
simulator_id=''
cleanup() {
  if test -n "$simulator_id"; then
    xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
    xcrun simctl delete "$simulator_id"
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$root"
curl --fail --silent http://127.0.0.1:4174/ >/dev/null
node --input-type=module - "$root" "$scratch" <<'JS'
import { writeFileSync } from 'node:fs'
const [root, scratch] = process.argv.slice(2)
const base = { GENERATE_INFOPLIST_FILE: 'YES', CODE_SIGNING_ALLOWED: 'NO', SWIFT_VERSION: '5.0', TARGETED_DEVICE_FAMILY: '1', IPHONEOS_DEPLOYMENT_TARGET: '17.0', CURRENT_PROJECT_VERSION: '1', MARKETING_VERSION: '1.0' }
writeFileSync(`${scratch}/project.yml`, JSON.stringify({
  name: 'GamestrSafari', targets: {
    GamestrSafari: { type: 'application', platform: 'iOS', sources: [`${root}/test/ios-safari/Host.swift`], settings: { base: { ...base, PRODUCT_BUNDLE_IDENTIFIER: 'dev.forgesworn.gamestr.safari', INFOPLIST_KEY_UILaunchScreen_Generation: 'YES', INFOPLIST_KEY_UIApplicationSceneManifest_Generation: 'YES' } } },
    SafariTests: { type: 'bundle.ui-testing', platform: 'iOS', sources: [`${root}/test/ios-safari/SafariTests.swift`], dependencies: [{ target: 'GamestrSafari' }], settings: { base: { ...base, PRODUCT_BUNDLE_IDENTIFIER: 'dev.forgesworn.gamestr.safari.tests' } } },
  }, schemes: { GamestrSafari: { build: { targets: { GamestrSafari: 'all' } }, test: { targets: ['SafariTests'] } } },
}, null, 2))
JS
xcodegen generate --spec "$scratch/project.yml" --project "$scratch"
runtime="$(xcrun simctl list runtimes -j | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const r=JSON.parse(s).runtimes.filter(r=>r.isAvailable&&r.identifier.includes("iOS")).at(-1);if(!r)throw Error("No iOS runtime installed");console.log(r.identifier)')"
simulator_id="$(xcrun simctl create "Gamestr Safari rehearsal $$" com.apple.CoreSimulator.SimDeviceType.iPhone-16 "$runtime")"
xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b >"$evidence/ios-boot.log" 2>&1
status=0
xcodebuild -quiet -project "$scratch/GamestrSafari.xcodeproj" -scheme GamestrSafari \
  -destination "platform=iOS Simulator,id=$simulator_id" -derivedDataPath "$scratch/build" \
  -parallel-testing-enabled NO -resultBundlePath "$evidence/ios-safari.xcresult" CODE_SIGNING_ALLOWED=NO test || status=$?
xcrun xcresulttool get test-results summary --path "$evidence/ios-safari.xcresult" --format json >"$evidence/ios-safari.json"
exit "$status"
