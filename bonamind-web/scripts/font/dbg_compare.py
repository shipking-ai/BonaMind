#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare pipeline contour points vs TTF contour points for a char."""

import sys

import importlib.util

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

ch = sys.argv[1] if len(sys.argv) > 1 else "a"

g, adv = bf.GLYPHS[ch]
contours = bf.glyph_contours(g)
print(f"PIPELINE ({len(contours)} contours):")
for c in contours:
    print("  ", [tuple(round(p[0], 1) for p in c[:10])])

f = TTFont("public/fonts/AuraSans-Regular.ttf")
gname = f.getBestCmap()[ord(ch)]
rp = RecordingPen()
f.getGlyphSet()[gname].draw(rp)
pts = []
for op, args in rp.value:
    if op == "moveTo":
        if pts:
            print("  contour:", [tuple(round(p[0], 1) for p in pts[:10])], "... len", len(pts))
        pts = []
    elif op == "lineTo":
        pts.append(args[0])
if pts:
    print("  contour:", [tuple(round(p[0], 1) for p in pts[:10])], "... len", len(pts))
