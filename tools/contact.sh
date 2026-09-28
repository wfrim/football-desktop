#!/bin/sh
# Contact sheets for visual QA: 4 plays per image (2x2), finished-diagram time.
#   tools/contact.sh <outdir> <t> <play-id>...
out=$1; t=$2; shift 2
here=$(cd "$(dirname "$0")" && pwd)
"$here/shoot.sh" "$out" "$t" "$@" >/dev/null
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
n=0; sheet=0; imgs=""
flush() {
  [ -z "$imgs" ] && return
  printf '<body style="margin:0;background:#000;display:grid;grid-template-columns:1fr 1fr;gap:4px">%s</body>' "$imgs" > "$out/sheet$sheet.html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1604,1004 --screenshot="$out/sheet$sheet.png" "file://$out/sheet$sheet.html" 2>/dev/null
  echo "$out/sheet$sheet.png"; sheet=$((sheet+1)); imgs=""
}
for id in "$@"; do
  imgs="$imgs<img src=\"$id.png\" style=\"width:800px;height:500px\">"
  n=$((n+1)); [ $((n % 4)) -eq 0 ] && flush
done
flush
