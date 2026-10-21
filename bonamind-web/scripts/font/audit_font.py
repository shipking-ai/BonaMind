#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sanity-audit AuraSans-Regular.ttf using RAW glyf data (fontTools 4.63's
getGlyphSet().draw() applies lsb - xMin offsets, so raw table access is used)."""

import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

FONT = sys.argv[1] if len(sys.argv) > 1 else "public/fonts/AuraSans-Regular.ttf"

f = TTFont(FONT)
cmap = f.getBestCmap()
hmtx = f["hmtx"]
glyf = f["glyf"]

issues = []
for ch, gname in cmap.items():
    g = glyf[gname]
    adv, lsb = hmtx[gname]
    if g.numberOfContours == 0:
        if ch not in (0x20, 0xAD):
            issues.append((hex(ch), "EMPTY"))
        continue
    if ch != 0xAD:
        if g.xMin > 20 and chr(ch) not in "j'\"`'":
            issues.append((hex(ch), "xMin>20", g.xMin))
        if g.yMin < -260 or g.yMax > 950:
            issues.append((hex(ch), "y-extent", (g.yMin, g.yMax)))
        if adv <= 0:
            issues.append((hex(ch), "adv<=0", adv))

print("cmap glyphs:", len(cmap))
advs = [a for a, _ in hmtx.metrics.values()]
print("advance range:", min(advs), "-", max(advs))
comps = [
    (hex(ch), gname, g.getComponentNames())
    for ch, gname in sorted(cmap.items())
    if (g := glyf[gname]).numberOfContours == -1
]
print("composites:", comps if comps else "none")
for i in issues[:40]:
    print("ISSUE:", i)
print("issues:", len(issues))
