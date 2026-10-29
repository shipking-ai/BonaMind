"""Aura Script: rebrand Great Vibes (OFL) as Aura Script. Keeps outlines + GSUB/GPOS joins intact."""
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import compress

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\wegot\AppData\Local\Temp\opencode\GreatVibes-Regular.ttf"
OUT_STEM = sys.argv[2] if len(sys.argv) > 2 else "public/fonts/AuraScript-Regular"
TTF_OUT = OUT_STEM + ".ttf"
WOFF2_OUT = OUT_STEM + ".woff2"

f = TTFont(SRC)

for name_id, value in {
    1: "Aura Script",
    2: "Regular",
    3: "AuraScript-Regular",
    4: "Aura Script Regular",
    6: "AuraScript-Regular",
    16: "Aura Script",
    17: "Regular",
}.items():
    for rec in f["name"].names:
        if rec.nameID == name_id and rec.platformID in (1, 3):
            rec.string = value.encode("utf-16-be" if rec.platformID == 3 else "latin-1")

f["head"].fontRevision = 1.0
f["head"].macStyle = 0
f["OS/2"].usWeightClass = 400

f.save(TTF_OUT)
compress(TTF_OUT, WOFF2_OUT)
print(f"wrote {TTF_OUT} / {WOFF2_OUT}")
print("family:", f["name"].getDebugName(1), "| copyright:", f["name"].getDebugName(0))
