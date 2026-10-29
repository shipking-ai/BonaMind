#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Debug: compare script-side geometry vs TTF geometry for a char."""

import sys

sys.path.insert(0, "scripts/font")
import importlib.util

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

for ch in ["a", "p", "A"]:
    g, adv = bf.GLYPHS[ch]
    print(f"{ch!r}: script bbox=({g.x0:.1f},{g.y0:.1f},{g.x1:.1f},{g.y1:.1f}) adv={adv}")
    print("   shapes:", [type(s).__name__ for s in g.inc])

from fontTools.ttLib import TTFont

f = TTFont("public/fonts/AuraSans-Regular.ttf")
gs = f.getGlyphSet()
for ch in ["a", "p", "A"]:
    gname = f.getBestCmap()[ord(ch)]
    from fontTools.pens.boundsPen import BoundsPen

    bp = BoundsPen(None)
    gs[gname].draw(bp)
    print(f"{ch!r}: ttf bbox={bp.bounds}")
