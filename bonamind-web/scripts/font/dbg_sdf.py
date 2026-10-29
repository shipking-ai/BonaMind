#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dump an ASCII heatmap of the SDF for a glyph to visually inspect it."""

import sys

import importlib.util

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

ch = sys.argv[1] if len(sys.argv) > 1 else "A"
cell = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
g, adv = bf.GLYPHS[ch]
x0, y0, x1, y1 = g.x0, g.y0, g.x1, g.y1
print(f"{ch!r} shapes={[type(s).__name__ for s in g.inc]} adv={adv} bbox=({x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f})")

rows = []
y = y1
while y >= y0:
    line = []
    x = x0
    while x <= x1:
        d = g.sdf(x, y)
        if d < -2:
            line.append("#")
        elif d < 0:
            line.append("+")
        elif d < 3:
            line.append(".")
        else:
            line.append(" ")
        x += cell
    rows.append("".join(line))
    y -= cell
print("\n".join(rows))
