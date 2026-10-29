#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Call build_font() in-process and check 'a' in the output TTF."""

import importlib.util
import os
import tempfile

spec = importlib.util.spec_from_file_location("bf", "scripts/font/build_aura_font.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

out = tempfile.mkdtemp(prefix="aura_font_")
ttf, woff2 = bf.build_font(out)
print("built:", os.path.basename(ttf))

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

f = TTFont(ttf)
for ch in "aApg":
    gname = f.getBestCmap()[ord(ch)]
    bp = BoundsPen(None)
    f.getGlyphSet()[gname].draw(bp)
    print(f"{ch!r} ttf bbox={bp.bounds}")
