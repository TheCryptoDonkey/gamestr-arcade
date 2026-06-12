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
#   2. Scrub ONLY the arcade's harmful AppRun leakage, keeping the GNOME session
#      env. The arcade is itself an AppRun-wrapped Electron app, so spawning us
#      leaks its LD_LIBRARY_PATH (~/arcade-app/usr/lib) and GSETTINGS_SCHEMA_DIR;
#      Pallasite's Electron would otherwise load the arcade's mismatched libs.
#      But it ALSO needs the session vars (XDG_SESSION_TYPE, DBUS_SESSION_BUS_ADDRESS,
#      XDG_CURRENT_DESKTOP, ...) — a blanket `env -i` strips those and Pallasite
#      quits on launch. So unset the two poisons and let its own AppRun rebuild
#      LD_LIBRARY_PATH/GSETTINGS from APPDIR.
#   3. AppRun runs with --no-sandbox; APPDIR is set explicitly because this AppRun's
#      auto-detect breaks when arg 1 is a flag.
#   4. Redirect output to a file: the arcade pipes our stdio and never drains it
#      (a heavy logger would block on a full 64 KB pipe), and this gives a readable
#      log when launched via the arcade — whose pipe we otherwise can't see.
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

unset LD_LIBRARY_PATH
unset GSETTINGS_SCHEMA_DIR
export APPDIR="$app"
exec "$app/AppRun" --no-sandbox "$@" >/tmp/pallasite-run.log 2>&1
