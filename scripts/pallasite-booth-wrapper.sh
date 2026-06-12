#!/bin/sh
# Pallasite launch wrapper — bitfest-1 booth (Ubuntu 25.10 / GNOME-Wayland).
#
# Why this exists: this booth has no libfuse2 (the type-2 AppImage can't FUSE-mount)
# and AppArmor restricts unprivileged user namespaces (the Chromium sandbox fails) —
# the same constraints the arcade itself works around. The arcade's pallasite
# game.json sets exec="Pallasite.AppImage", so THIS script is installed at that path
# (~/gamestr-games/pallasite/Pallasite.AppImage) and the real binary sits beside it
# as "Pallasite-bin.AppImage". Both are *.AppImage, so the deploy's
# `rsync --exclude='*.AppImage'` never transfers, overwrites, or deletes them — the
# native setup survives redeploys with no game.json change.
#
#   1. Extract the real AppImage (no FUSE needed) once; re-extract only when the
#      binary changes (gated by a marker, since extracted files keep build mtimes).
#   2. Launch with a PRISTINE environment (env -i). The arcade is itself an
#      AppRun-wrapped Electron app, so spawning us leaks its LD_LIBRARY_PATH
#      (~/arcade-app/usr/lib), APPDIR, GSETTINGS_SCHEMA_DIR, PATH, etc. into our
#      env. Pallasite's Electron would then load the arcade's mismatched libs and
#      its GPU process dies ("GPU process isn't usable. Goodbye."). env -i drops
#      all of that and we re-export only what Pallasite needs; its own AppRun then
#      rebuilds LD_LIBRARY_PATH/PATH/XDG_DATA_DIRS from APPDIR cleanly.
#   3. AppRun runs with --no-sandbox; APPDIR is set explicitly because this AppRun's
#      auto-detect breaks when arg 1 is a flag.
#
# DISPLAY / WAYLAND_DISPLAY / XAUTHORITY / XDG_RUNTIME_DIR come in from the arcade
# (it runs in the GNOME session via systemd); we forward them through env -i.
set -e
here="$(dirname "$(readlink -f "$0")")"
bin="$here/Pallasite-bin.AppImage"
app="$here/.pallasite-app"
marker="$here/.pallasite-extracted"
if [ "$bin" -nt "$marker" ]; then
  rm -rf "$here/squashfs-root" "$app"
  ( cd "$here" && "$bin" --appimage-extract >/dev/null )
  mv "$here/squashfs-root" "$app"
  touch "$marker"
fi

uid="$(id -u)"
# Fall back to the live Xwayland cookie if the arcade didn't pass XAUTHORITY.
: "${XAUTHORITY:=$(ls -t "/run/user/$uid"/.mutter-Xwaylandauth.* 2>/dev/null | head -1)}"

# Redirect Pallasite's own stdout/stderr to a file. The arcade spawns us with
# piped stdio it never drains; a heavy Electron logger fills the 64 KB pipe and
# then blocks/stalls. Writing to a file removes that dependency AND gives a
# readable log when launched via the arcade (whose pipe we otherwise can't see).
exec env -i \
  HOME="$HOME" \
  USER="${USER:-$(id -un)}" \
  LANG="${LANG:-C.UTF-8}" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$uid}" \
  DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$uid/bus}" \
  DISPLAY="${DISPLAY:-:0}" \
  WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}" \
  XAUTHORITY="$XAUTHORITY" \
  APPDIR="$app" \
  "$app/AppRun" --no-sandbox "$@" >/tmp/pallasite-run.log 2>&1
