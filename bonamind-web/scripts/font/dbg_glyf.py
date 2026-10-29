#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inspect glyf table directly (not via draw) before and after save."""

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

gl = font["glyf"]["uni0061"]
print("A. pre-save xMin/xMax:", gl.xMin, gl.xMax)
print("   pre-save first coords:", list(gl.coordinates[:6]))
print("   pre-save flags[:8]:", list(gl.flags[:8]))

out = tempfile.mkdtemp(prefix="aura_one_")
p = os.path.join(out, "one.ttf")
font.save(p)

from fontTools.ttLib import TTFont

f = TTFont(p, lazy=False)
gl2 = f["glyf"]["uni0061"]
print("B. post-load xMin/xMax:", gl2.xMin, gl2.xMax)
print("   post-load first coords:", list(gl2.coordinates[:6]))
print("   post-load flags[:8]:", list(gl2.flags[:8]))
