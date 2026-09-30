#!/bin/sh
# Geometry QA for every play, headless (needs the dev server on :8765):
#   tools/check.sh                      (diagram)
#   tools/check.sh "style=game&call=comp"
# Builds each scene once and prints relationship + collision warnings,
# plus the DOM node count after each teardown (must be a single number).
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1600,1000 --virtual-time-budget=10000 --dump-dom "http://localhost:8765/index.html?check=1&${1:-style=diagram}" 2>/dev/null \
  | tr '\n' '\r' | grep -o 'data-check="[^"]*"' | tr '\r' '\n' | sed 's/^data-check="//; s/"$//; s/&amp;/\&/g; s/&gt;/>/g; s/&lt;/</g'
