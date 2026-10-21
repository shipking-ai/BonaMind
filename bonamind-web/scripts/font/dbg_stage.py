#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Instrument: trace 'a' through contours -> TTGlyphPen -> glyf -> save -> load."""

import importlib.util
import os
import tempfile

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

g, adv = bf.GLYPHS["a"]
contours = bf.glyph_contours(g)
xs = [p[0] for c in contours for p in c]
ys = [p[1] for c in contours for p in c]
print("1. contours bbox:", round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1), "pts:", len(xs))

ttg = bf.contours_to_pen(contours)
print("2. TTGlyph:", ttg)
from fontTools.pens.boundsPen import BoundsPen
bp = BoundsPen(None)
from fontTools.ttLib.tables._g_l_y_f import Glyph
ttg.draw(bp, Glyph())
print("3. pen.glyph() draw bbox:", bp.bounds)

out = tempfile.mkdtemp(prefix="aura_font_")
font = bf.FontBuilder(1000, isTTF=True).font
glyphs = {"uni0061": ttg}
font.setGlyphOrder(["uni0061"])
font["glyf"] = __import__("fontTools.ttLib").ttLib.newTable("glyf")
font["glyf"].glyphs = glyphs
font["glyf"].glyphOrder = ["uni0061"]
font["glyf"].recalcBBoxes()
print("4. after glyf recalc:", [(n, ttg.xMin, ttg.yMin, ttg.xMax, ttg.yMax) for n, ttg in glyphs.items()])
