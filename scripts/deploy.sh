#!/usr/bin/env bash
#
# One-command booth deploy: build → package an exact AppImage → ship →
# verify → install/enable service (→ optionally restart + readiness check).
# Idempotent and safe to re-run; aborts on checksum or readiness failure and
# keeps the previously installed AppImage available for rollback.
#
#   npm run deploy                              # build, package, ship, verify, sync games
#   npm run deploy -- --restart                # …and restart the service on the booth
#   npm run deploy -- --ship-only --artifact release/gamestr-arcade-0.1.1-x86_64.AppImage
#                                               # skip build+package; exact artifact is required
#   npm run deploy -- --artifact PATH --sha256 HEX
#                                               # pin an exact artifact and expected digest
#   npm run deploy -- --no-build               # skip npm build, still repackage + ship
#   npm run deploy -- --no-games               # skip rsyncing the games/ folder
#   npm run deploy -- --no-enable              # install but don't autostart on login (manual-launch booth)
#   npm run deploy -- --booth user@host[:dir]  # override booth target
#
# Booth defaults to the axenstax kiosk; override with --booth or BOOTH=.
# Passwordless SSH (key already installed) is assumed.

set -euo pipefail

BOOTH="${BOOTH:-axenstax@192.168.191.32}"
DEST="${DEST:-.}"          # remote dir (relative to login home, or absolute)
RESTART=0
DO_BUILD=1
DO_PACKAGE=1
DO_GAMES=1
DO_ENABLE=1
ARTIFACT=""
EXPECTED_SHA=""

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "deploy: $1 requires a value" >&2
    exit 2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --restart)   RESTART=1 ;;
    --no-build)  DO_BUILD=0 ;;
    --ship-only) DO_BUILD=0; DO_PACKAGE=0 ;;
    --no-games)  DO_GAMES=0 ;;
    --no-enable) DO_ENABLE=0 ;;
    --artifact)  require_value "$@"; ARTIFACT="$2"; shift ;;
    --sha256)    require_value "$@"; EXPECTED_SHA="$2"; shift ;;
    --booth)     require_value "$@"; BOOTH="$2"; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "deploy: unknown arg '$1' (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# Allow --booth user@host:dir to carry a remote directory.
case "$BOOTH" in
  *:*) DEST="${BOOTH#*:}"; BOOTH="${BOOTH%%:*}" ;;
esac

# These values are interpolated into scp/remote shell arguments below. Keep the
# supported target syntax intentionally narrow rather than accepting shell data.
case "$BOOTH" in
  ''|*[!A-Za-z0-9._@-]*) echo "deploy: unsafe booth target: $BOOTH" >&2; exit 2 ;;
esac
case "$DEST" in
  ''|*[!A-Za-z0-9._/~+-]*) echo "deploy: unsafe remote directory: $DEST" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10)

step() { printf '\n▶ %s\n' "$1"; }

if [ "$DO_BUILD" = 1 ]; then
  step "Building (npm run build)…"
  ( cd "$REPO_DIR" && npm run build )
fi

if [ "$DO_PACKAGE" = 1 ]; then
  step "Packaging x64 AppImage…"
  ( cd "$REPO_DIR" && npx electron-builder --linux AppImage --x64 )
fi

# A ship-only release must name its input. Picking the newest file by mtime can
# silently deploy a stale local build. A freshly packaged release has one exact,
# deterministic filename derived from package.json and electron-builder.yml.
if [ -z "$ARTIFACT" ]; then
  if [ "$DO_PACKAGE" = 0 ]; then
    echo "deploy: --ship-only requires --artifact PATH" >&2
    exit 2
  fi
  VERSION="$(cd "$REPO_DIR" && node -p "require('./package.json').version")"
  ARTIFACT="release/gamestr-arcade-${VERSION}-x86_64.AppImage"
fi

case "$ARTIFACT" in
  /*) APP="$ARTIFACT" ;;
  *)  APP="$REPO_DIR/$ARTIFACT" ;;
esac

if [ ! -f "$APP" ]; then
  echo "deploy: exact AppImage not found: $APP" >&2
  exit 1
fi
case "$APP" in
  *.AppImage) ;;
  *) echo "deploy: artifact must be an .AppImage: $APP" >&2; exit 2 ;;
esac

if [ -n "$EXPECTED_SHA" ]; then
  EXPECTED_SHA="$(printf '%s' "$EXPECTED_SHA" | tr '[:upper:]' '[:lower:]')"
  case "$EXPECTED_SHA" in
    *[!0-9a-f]*|'') echo "deploy: --sha256 must be 64 hexadecimal characters" >&2; exit 2 ;;
  esac
  if [ "${#EXPECTED_SHA}" -ne 64 ]; then
    echo "deploy: --sha256 must be 64 hexadecimal characters" >&2
    exit 2
  fi
fi
BASENAME="gamestr-arcade.AppImage"  # stable remote name - ExecStart never changes
LOCAL_SHA="$(shasum -a 256 "$APP" | awk '{print $1}')"
if [ -n "$EXPECTED_SHA" ] && [ "$LOCAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "deploy: local artifact checksum does not match --sha256" >&2
  echo "  expected: $EXPECTED_SHA" >&2
  echo "  actual:   $LOCAL_SHA" >&2
  exit 1
fi
SIZE="$(du -h "$APP" | awk '{print $1}')"
step "Artifact: $(basename "$APP") ($SIZE)  sha256=${LOCAL_SHA:0:12}…"

# Derive the home-relative path.  If DEST is '.' we map it to the login home;
# otherwise honour whatever --booth passed.
if [ "$DEST" = "." ]; then
  REMOTE_PATH="~/$BASENAME"
  TMP_PATH="~/.$BASENAME.part"
  PREVIOUS_PATH="~/$BASENAME.previous"
else
  REMOTE_PATH="$DEST/$BASENAME"
  TMP_PATH="$DEST/.$BASENAME.part"
  PREVIOUS_PATH="$DEST/$BASENAME.previous"
fi

# Upload to a temp name first: if the old AppImage is still running its file is
# busy (ETXTBSY) and a direct overwrite fails.  A rename over the target swaps
# it atomically - the running process keeps its old inode until it exits.
step "Transferring to $BOOTH:$REMOTE_PATH …"
scp -o BatchMode=yes "$APP" "$BOOTH:$TMP_PATH"

step "Verifying transfer on booth…"
REMOTE_SHA="$("${SSH[@]}" "$BOOTH" "chmod +x $TMP_PATH && sha256sum $TMP_PATH" | awk '{print $1}')"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "✗ CHECKSUM MISMATCH - transfer corrupt" >&2
  echo "  local:  $LOCAL_SHA" >&2
  echo "  remote: $REMOTE_SHA" >&2
  exit 1
fi

step "Installing atomically (retaining $PREVIOUS_PATH)…"
"${SSH[@]}" "$BOOTH" "
  set -eu
  if [ -f $REMOTE_PATH ]; then
    cp -pf $REMOTE_PATH $PREVIOUS_PATH
  fi
  mv -f $TMP_PATH $REMOTE_PATH
  chmod +x $REMOTE_PATH
  test \"\$(sha256sum $REMOTE_PATH | awk '{print \$1}')\" = '$LOCAL_SHA'
"
echo "✓ checksum verified and artifact installed on booth"

# Install the systemd user service.
step "Installing systemd user service…"
"${SSH[@]}" "$BOOTH" 'mkdir -p ~/.config/systemd/user'
scp -o BatchMode=yes "$REPO_DIR/systemd/gamestr-arcade.service" \
  "$BOOTH:.config/systemd/user/gamestr-arcade.service"
if [ "$DO_ENABLE" = 1 ]; then
  "${SSH[@]}" "$BOOTH" '
    systemctl --user daemon-reload
    loginctl enable-linger "$(whoami)"
    systemctl --user enable gamestr-arcade
    echo "  ✓ service enabled (autostarts on login)"
  '
else
  # Manual-launch booth: install + reload, but leave it DISABLED so it never
  # autostarts on login. Actively disable in case a prior deploy enabled it.
  # Linger stays on so the unit is still startable/restartable over SSH.
  "${SSH[@]}" "$BOOTH" '
    systemctl --user daemon-reload
    loginctl enable-linger "$(whoami)"
    systemctl --user disable gamestr-arcade 2>/dev/null || true
    echo "  ✓ service installed (manual launch - autostart disabled)"
  '
fi

if [ "$DO_GAMES" = 1 ]; then
  step "Syncing games → $BOOTH:~/gamestr-games/ …"
  # --exclude '*.AppImage': native game binaries are shipped out-of-band (too big
  # to commit - they're gitignored) and dropped into ~/gamestr-games/<slug>/ on the
  # booth separately. Without this exclude, --delete nukes them on every deploy and
  # the affected tiles silently fall back to their game.json web url (wrong mode +
  # the arcade's gamepad→key translation then exposes in-game cheats). rsync also
  # protects excluded paths from --delete, so booth-side AppImages survive.
  rsync -az --delete --exclude='*.AppImage' -e "ssh -o BatchMode=yes" "$REPO_DIR/games/" "$BOOTH:gamestr-games/"
fi

if [ "$RESTART" = 1 ]; then
  step "Restarting service on booth…"
  if ! "${SSH[@]}" "$BOOTH" 'systemctl --user reset-failed gamestr-arcade 2>/dev/null || true; systemctl --user restart gamestr-arcade'; then
    RESTART_FAILED=1
  else
    RESTART_FAILED=0
  fi

  if [ "$RESTART_FAILED" = 0 ]; then
    step "Readiness check (stable process + renderer ready marker)…"
    # The renderer writes a PID-bound marker only after config, catalogue and the
    # cabinet UI have initialised. Requiring the same PID to remain active after
    # a stability window catches crash/restart loops that a single is-active poll
    # would incorrectly call healthy.
    if ! "${SSH[@]}" "$BOOTH" '
      set -eu
      ready_file="/run/user/$(id -u)/gamestr-arcade.ready"
      service_pid=""
      renderer_pid=""
      for i in $(seq 1 18); do
        status=$(systemctl --user is-active gamestr-arcade 2>/dev/null || true)
        candidate=$(systemctl --user show gamestr-arcade --property=MainPID --value 2>/dev/null || true)
        ready_pid=$(sed -n "s/.*\"pid\":\([0-9][0-9]*\).*/\1/p" "$ready_file" 2>/dev/null || true)
        if [ "$status" = "active" ] && [ "${candidate:-0}" -gt 0 ] 2>/dev/null \
          && [ "${ready_pid:-0}" -gt 0 ] 2>/dev/null && kill -0 "$ready_pid" 2>/dev/null \
          && grep -q "gamestr-arcade.service" "/proc/$ready_pid/cgroup" 2>/dev/null; then
          service_pid="$candidate"
          renderer_pid="$ready_pid"
          break
        fi
        echo "  ($i/18) ${status:-unknown}; waiting for renderer readiness…"
        sleep 2
      done
      if [ -z "$service_pid" ] || [ -z "$renderer_pid" ]; then
        echo "  ✗ renderer did not become ready after ~36 s" >&2
        journalctl --user-unit gamestr-arcade -n 40 --no-pager >&2 || true
        exit 1
      fi
      sleep 6
      stable_status=$(systemctl --user is-active gamestr-arcade 2>/dev/null || true)
      stable_service_pid=$(systemctl --user show gamestr-arcade --property=MainPID --value 2>/dev/null || true)
      stable_ready_pid=$(sed -n "s/.*\"pid\":\([0-9][0-9]*\).*/\1/p" "$ready_file" 2>/dev/null || true)
      if [ "$stable_status" != "active" ] || [ "$stable_service_pid" != "$service_pid" ] \
        || [ "$stable_ready_pid" != "$renderer_pid" ] || ! kill -0 "$renderer_pid" 2>/dev/null \
        || ! grep -q "gamestr-arcade.service" "/proc/$renderer_pid/cgroup" 2>/dev/null; then
        echo "  ✗ process did not remain stable after renderer readiness" >&2
        journalctl --user-unit gamestr-arcade -n 40 --no-pager >&2 || true
        exit 1
      fi
      echo "  ✓ renderer $renderer_pid ready; service process $service_pid remained stable"
    '; then
      RESTART_FAILED=1
    fi
  fi

  if [ "$RESTART_FAILED" = 1 ]; then
    echo "deploy: new artifact failed restart/readiness; attempting AppImage rollback" >&2
    if "${SSH[@]}" "$BOOTH" "
      set -eu
      test -f $PREVIOUS_PATH
      cp -pf $PREVIOUS_PATH $REMOTE_PATH
      rm -f /run/user/\$(id -u)/gamestr-arcade.ready
      systemctl --user reset-failed gamestr-arcade 2>/dev/null || true
      systemctl --user restart gamestr-arcade
    "; then
      echo "  ✓ previous AppImage restored and restart requested" >&2
    else
      echo "  ✗ automatic rollback failed or no previous AppImage exists" >&2
    fi
    exit 1
  fi
fi

if [ "$RESTART" = 1 ]; then
  printf '\n✓ Deployed and readiness-checked %s → %s:%s\n' "$(basename "$APP")" "$BOOTH" "$REMOTE_PATH"
else
  printf '\n✓ Installed %s → %s:%s (service not restarted; runtime unverified)\n' "$(basename "$APP")" "$BOOTH" "$REMOTE_PATH"
  printf '  Start on the booth: systemctl --user start gamestr-arcade\n'
fi
