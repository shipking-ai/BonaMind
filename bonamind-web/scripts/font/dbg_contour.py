#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Debug contour extraction: run pipeline on a glyph, measure bboxes, count contours."""

import sys

import importlib.util

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

for ch in sys.argv[1:] or ["a", "A", "p"]:
    g, adv = bf.GLYPHS[ch]
    contours = bf.glyph_contours(g)
    print(f"--- {ch!r}: {len(contours)} contours")
    for c in contours:
        xs = [p[0] for p in c]
        ys = [p[1] for p in c]
        print(f"   {len(c)} pts  bbox=({min(xs):.1f},{min(ys):.1f},{max(xs):.1f},{max(ys):.1f})")
