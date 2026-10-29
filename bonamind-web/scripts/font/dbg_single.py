#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FontBuilder minimal single-glyph font -> save -> load -> check bbox."""

import importlib.util
import os
import tempfile

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

g, adv = bf.GLYPHS["a"]
contours = bf.glyph_contours(g)
ttg = bf.contours_to_pen(contours)

fb = bf.FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder([".notdef", "uni0061"])
fb.setupCharacterMap({0x61: "uni0061"})
fb.setupGlyf({".notdef": bf.empty_glyph(), "uni0061": ttg})
fb.setupHorizontalMetrics({".notdef": (500, 0), "uni0061": (560, 0)})
fb.setupHorizontalHeader(ascent=800, descent=-200, lineGap=200)
fb.setupNameTable({"familyName": "T", "styleName": "R", "uniqueFontIdentifier": "T", "fullName": "T", "psName": "T-Regular", "version": "1"})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=200, usWinAscent=1000, usWinDescent=200, usWeightClass=400, usWidthClass=5, fsSelection=0x40, sxHeight=520, sCapHeight=700)
fb.setupPost()
font = fb.font

out = tempfile.mkdtemp(prefix="aura_one_")
p = os.path.join(out, "one.ttf")
font.save(p)

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

f = TTFont(p)
bp = BoundsPen(None)
f.getGlyphSet()["uni0061"].draw(bp)
print("single-glyph saved ttf bbox:", bp.bounds)
