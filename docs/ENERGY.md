# Energy

Measured with `tools/energy.sh` (Plash + WebKit processes, `ps` %CPU of one core)
on a 2560×1440 display, and A/B-tested in a WKWebView harness at the same size.

| Change | Avg CPU (one core) |
| --- | --- |
| Baseline (60 fps cap, vignette above the drawing, masked dashed reveals) | 31.6 % |
| 30 fps default + vignette moved under the drawing | 19.8 % |
| Dashed/dotted reveals without SVG masks | 17.6 % |
| Field in its own static SVG layer | ~14 % |
| Frame cap sleeps on a timer (no wakeups on skipped 120 Hz frames) | 13.9 % (in Plash) |
| Motion: Still (finished diagrams, crossfaded) | ~4 % |

For comparison, the earlier aquarium wallpaper measured 14.5 % in the same test.
Holds already cost ~0 %: the animator sleeps until the next scheduled change.

What the cost is: repainting the (transparent, full-screen) play layer at the frame
rate while lines draw. It scales with frames drawn, not with pace. Defenses add ~2 %.
Themes are free.

Rules that keep it low (don't regress these):
- Nothing semi-transparent may sit ABOVE the animating SVG (it forces a full
  recomposite every frame). The vignette lives under it.
- No SVG masks/filters on anything that animates.
- Static artwork (field) lives in its own layer (`#field-layer`).
- The frame cap sleeps with one timer; it never spins on requestAnimationFrame.

User controls: Settings → Motion (Full 30 fps · Calm 20 fps · Still). Plash's own
"deactivate on battery" pauses it entirely on battery.
