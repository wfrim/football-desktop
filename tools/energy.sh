#!/bin/sh
# Energy check: sample CPU / memory of Plash and WebKit processes while the
# wallpaper runs. Usage: tools/energy.sh [seconds=180] [interval=3]
# Note: WebKit process names are shared with Safari/other apps; close those
# for a clean reading. Prints average / peak CPU and memory growth.
secs=${1:-180}; every=${2:-3}; n=$((secs / every))
i=0; : > /tmp/fd-energy.$$
while [ $i -lt $n ]; do
  ps -axo %cpu=,rss=,comm= | awk '/Plash|com.apple.WebKit/ { c += $1; m += $2 } END { printf "%.1f %d\n", c, m/1024 }' >> /tmp/fd-energy.$$
  sleep $every; i=$((i + 1))
done
awk '{ c += $1; if ($1 > pc) pc = $1; if (NR == 1) m0 = $2; m1 = $2; if ($2 > pm) pm = $2 }
  END { printf "samples %d · CPU avg %.1f%% · peak %.1f%% · memory %d MB → %d MB (peak %d MB)\n", NR, c / NR, pc, m0, m1, pm }' /tmp/fd-energy.$$
rm -f /tmp/fd-energy.$$
