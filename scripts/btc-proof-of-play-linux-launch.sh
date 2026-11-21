#!/bin/sh
set -eu

player=$(basename -- "$1")
cd "$(dirname -- "$0")/runtime/$(dirname -- "$1")"

# The packaged Linux Unity player uses the OpenGL core profile.
if [ -f UnityPlayer.so ]; then
  exec "./$player" -force-glcore
fi
exec "./$player"
