"""Rename an OFL font to 'Aura Sans' (variable font aware) and emit ttf + woff2."""
import sys
from fontTools.ttLib import TTFont
from fontTools.woff2 import compress

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\wegot\AppData\Local\Temp\opencode\Sora-wght.ttf"
TTF_OUT = "public/fonts/AuraSans-Regular.ttf"
WOFF2_OUT = "public/fonts/AuraSans-Regular.woff2"

FAMILY = "Aura Sans"
SUBFAMILY = "Regular"
PS_NAME = "AuraSans-Regular"

f = TTFont(SRC)

name = f["name"]
new_names = {
    1: FAMILY,
    2: SUBFAMILY,
    3: "AuraSans-Regular",
    4: FAMILY + " " + SUBFAMILY,
    6: PS_NAME,
    16: FAMILY,
    17: SUBFAMILY,
}
for name_id, value in new_names.items():
    for rec in name.names:
        if rec.nameID == name_id and rec.platformID in (1, 3):
            if rec.platformID == 3:
                rec.string = value.encode("utf-16-be")
            else:
                rec.string = value.encode("latin-1")

f["head"].fontRevision = 1.0
f["head"].macStyle = f["head"].macStyle & ~1
f["OS/2"].usWeightClass = 400

f.save(TTF_OUT)
compress(TTF_OUT, WOFF2_OUT, recalcBBoxes=True)
print(f"wrote {TTF_OUT} and {WOFF2_OUT}")
print("axes:", [(a.axisTag, a.minValue, a.maxValue) for a in f["fvar"].axes] if "fvar" in f else "none")
print("copyright:", name.getDebugName(0))
