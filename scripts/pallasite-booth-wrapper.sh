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
#   2. Run AppRun with --no-sandbox. APPDIR is set explicitly because this AppRun's
#      auto-detect breaks when arg 1 is a flag.
#
# DISPLAY / WAYLAND_DISPLAY / XAUTHORITY / XDG_RUNTIME_DIR are inherited from the
# arcade process that spawns this (it runs in the GNOME session via systemd).
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
export APPDIR="$app"
exec "$app/AppRun" --no-sandbox "$@"
