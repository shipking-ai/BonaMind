#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dump contours of chosen glyphs + hmtx advances."""

import sys

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

FONT = "public/fonts/AuraSans-Regular.ttf"
f = TTFont(FONT)
hmtx = f["hmtx"]
gs = f.getGlyphSet()

chars = sys.argv[1:] or ["p", "q", "g", "b", "d", "o", "a", "A", "V", "&", "g", "j"]
for ch in chars:
    gname = f.getBestCmap()[ord(ch)]
    adv = hmtx[gname][0]
    rp = RecordingPen()
    gs[gname].draw(rp)
    print(f"--- {ch!r} gname={gname} adv={adv}")
    for op, args in rp.value:
        print("   ", op, [tuple(round(a, 1) for a in p) if isinstance(p, tuple) else p for p in args])
