#!/bin/sh
# Pallasite launch wrapper — bitfest-1 booth (Ubuntu 25.10 / GNOME-Wayland).
#
# The arcade now launches native games via systemd-run (a clean session/cgroup),
# so this wrapper only handles the bitfest-specific bits:
#   - No libfuse2 on 25.10 -> the type-2 AppImage can't FUSE-mount, so extract it
#     (no FUSE) once and run the extracted AppRun.
#   - Pass --no-sandbox through (AppArmor restricts unprivileged user namespaces);
#     game.json `args` also carries it, which is what reaches .32's raw AppImage.
#
# It runs AS the systemd unit the arcade creates, so Pallasite ends up as that
# unit's main process — manager-spawned and clean. The real binary lives OUTSIDE
# the games folder (~/pallasite-bin.AppImage) so the scanner sees only THIS wrapper
# as the game's single *.AppImage.
set -e

bin="$HOME/pallasite-bin.AppImage"
app="$HOME/.pallasite-app"
marker="$HOME/.pallasite-extracted"
if [ "$bin" -nt "$marker" ]; then
  rm -rf "$HOME/squashfs-root" "$app"
  ( cd "$HOME" && "$bin" --appimage-extract >/dev/null && mv squashfs-root "$app" )
  touch "$marker"
fi

export APPDIR="$app"
exec "$app/AppRun" --no-sandbox "$@" >/tmp/pallasite-run.log 2>&1
