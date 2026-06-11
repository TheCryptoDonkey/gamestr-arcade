#!/usr/bin/env bash
#
# One-command booth deploy: build → package AppImage → ship → verify →
# install/enable service (→ optionally restart + health check).
# Idempotent and safe to re-run; aborts on any checksum mismatch.
#
#   npm run deploy                              # build, package, ship, verify
#   npm run deploy -- --restart                # …and restart the service on the booth
#   npm run deploy -- --ship-only              # skip build+package, ship the existing AppImage
#   npm run deploy -- --no-build               # skip npm build, still repackage + ship
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

while [ $# -gt 0 ]; do
  case "$1" in
    --restart)   RESTART=1 ;;
    --no-build)  DO_BUILD=0 ;;
    --ship-only) DO_BUILD=0; DO_PACKAGE=0 ;;
    --booth)     BOOTH="$2"; shift ;;
    -h|--help)
      sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "deploy: unknown arg '$1' (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# Allow --booth user@host:dir to carry a remote directory.
case "$BOOTH" in
  *:*) DEST="${BOOTH#*:}"; BOOTH="${BOOTH%%:*}" ;;
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

# Find the newest AppImage in release/.
APP="$(ls -t "$REPO_DIR"/release/*.AppImage 2>/dev/null | head -1 || true)"
if [ -z "$APP" ]; then
  echo "deploy: no AppImage in $REPO_DIR/release/ — run without --ship-only first." >&2
  exit 1
fi
BASENAME="gamestr-arcade.AppImage"  # stable remote name — ExecStart never changes
LOCAL_SHA="$(shasum -a 256 "$APP" | awk '{print $1}')"
SIZE="$(du -h "$APP" | awk '{print $1}')"
step "Artifact: $(basename "$APP") ($SIZE)  sha256=${LOCAL_SHA:0:12}…"

# Derive the home-relative path.  If DEST is '.' we map it to the login home;
# otherwise honour whatever --booth passed.
if [ "$DEST" = "." ]; then
  REMOTE_PATH="~/$BASENAME"
  TMP_PATH="~/.$BASENAME.part"
else
  REMOTE_PATH="$DEST/$BASENAME"
  TMP_PATH="$DEST/.$BASENAME.part"
fi

# Upload to a temp name first: if the old AppImage is still running its file is
# busy (ETXTBSY) and a direct overwrite fails.  A rename over the target swaps
# it atomically — the running process keeps its old inode until it exits.
step "Transferring to $BOOTH:$REMOTE_PATH …"
scp -o BatchMode=yes "$APP" "$BOOTH:$TMP_PATH"

step "Installing + verifying on booth…"
REMOTE_SHA="$("${SSH[@]}" "$BOOTH" "chmod +x $TMP_PATH && mv -f $TMP_PATH $REMOTE_PATH && sha256sum $REMOTE_PATH" | awk '{print $1}')"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "✗ CHECKSUM MISMATCH — transfer corrupt" >&2
  echo "  local:  $LOCAL_SHA" >&2
  echo "  remote: $REMOTE_SHA" >&2
  exit 1
fi
echo "✓ checksum verified on booth"

# Install the systemd user service.
step "Installing systemd user service…"
"${SSH[@]}" "$BOOTH" 'mkdir -p ~/.config/systemd/user'
scp -o BatchMode=yes "$REPO_DIR/systemd/gamestr-arcade.service" \
  "$BOOTH:.config/systemd/user/gamestr-arcade.service"
"${SSH[@]}" "$BOOTH" '
  systemctl --user daemon-reload
  loginctl enable-linger "$(whoami)"
  systemctl --user enable gamestr-arcade
  echo "  ✓ service enabled"
'

if [ "$RESTART" = 1 ]; then
  step "Restarting service on booth…"
  "${SSH[@]}" "$BOOTH" 'systemctl --user restart gamestr-arcade' || {
    # Fallback: if the user manager is not reachable (e.g. no DBUS_SESSION_BUS_ADDRESS
    # over bare SSH), try launching directly.  This should be rare once linger is on.
    echo "  systemctl restart failed — trying DISPLAY=:0 direct launch fallback…"
    "${SSH[@]}" "$BOOTH" \
      "DISPLAY=:0 XAUTHORITY=\$HOME/.Xauthority setsid $REMOTE_PATH >/tmp/gamestr-arcade.log 2>&1 </dev/null & echo '  launched (log: /tmp/gamestr-arcade.log)'" || true
  }

  step "Health check (systemd service active)…"
  # The launcher has no HTTP health endpoint — poll systemctl is-active instead.
  # An Electron kiosk app on a cold 4K display can take ~10-12 s to start.
  "${SSH[@]}" "$BOOTH" '
    for i in $(seq 1 12); do
      status=$(systemctl --user is-active gamestr-arcade 2>/dev/null || echo "unknown")
      if [ "$status" = "active" ]; then
        echo "  ✓ gamestr-arcade is active"; exit 0
      fi
      echo "  ($i/12) $status — waiting 2 s…"
      sleep 2
    done
    echo "  ✗ still not active after ~24 s — check: systemctl --user status gamestr-arcade"
    exit 1
  ' || echo "  (health check reported a problem — inspect the booth)"
fi

printf '\n✓ Deployed %s → %s:%s\n' "$(basename "$APP")" "$BOOTH" "$REMOTE_PATH"
[ "$RESTART" = 1 ] || printf '  Start on the booth: systemctl --user start gamestr-arcade\n'
