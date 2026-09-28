#!/bin/sh
# Render plays to PNG with headless Chrome (needs the dev server on :8765).
#   tools/shoot.sh <outdir> <t> <play-id>...     e.g. tools/shoot.sh /tmp/shots 7 mesh dagger
# Console warnings from each page are printed.
out=$1; t=$2; shift 2
mkdir -p "$out"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for id in "$@"; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1600,1000 \
    --virtual-time-budget=3000 --enable-logging=stderr --v=0 \
    --screenshot="$out/$id.png" "http://localhost:8765/index.html?play=$id&t=$t" 2>&1 \
    | grep -E "CONSOLE|console" | sed 's/^.*CONSOLE([0-9]*)\] *//' | cut -c1-300
done
