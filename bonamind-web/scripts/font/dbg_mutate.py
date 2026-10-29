#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check for mutation of Glyph.x0 between direct calls and build_font."""

import importlib.util
import os
import tempfile

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

g, adv = bf.GLYPHS["a"]
print("initial a.x0 =", g.x0)
c = bf.glyph_contours(g)
print("after direct call: a.x0 =", g.x0, "bbox =", (min(p[0] for p in c), min(p[1] for p in c), max(p[0] for p in c), max(p[1] for p in c)))

out = tempfile.mkdtemp(prefix="aura_font_")
ttf, woff2 = bf.build_font(out)
print("after build_font: a.x0 =", g.x0)
print("glyph identity still same?", bf.GLYPHS["a"][0] is g)

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

f = TTFont(ttf)
gname = f.getBestCmap()[ord("a")]
bp = BoundsPen(None)
f.getGlyphSet()[gname].draw(bp)
print("built ttf a bbox =", bp.bounds)

c2 = bf.glyph_contours(bf.GLYPHS["a"][0])
print("post-build direct bbox =", (min(p[0] for p in c2), min(p[1] for p in c2), max(p[0] for p in c2), max(p[1] for p in c2)))
