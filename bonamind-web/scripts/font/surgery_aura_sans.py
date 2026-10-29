"""Aura Sans: rename Sora (OFL) + custom outline surgery, emits static ttf/woff2 per weight.

Usage: py -3 scripts/font/surgery_aura_sans.py <src-ttf> <wght> <out-stem> [shear-deg]
e.g.   py -3 scripts/font/surgery_aura_sans.py Sora-wght.ttf 400 public/fonts/AuraSans-Regular
       py -3 scripts/font/surgery_aura_sans.py Sora-wght.ttf 400 public/fonts/AuraSans-Italic 9
"""
import sys
from math import tan, radians
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import compress
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
from fontTools.varLib.instancer import instantiateVariableFont

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\wegot\AppData\Local\Temp\opencode\Sora-wght.ttf"
WEIGHT = int(sys.argv[2]) if len(sys.argv) > 2 else 400
OUT_STEM = sys.argv[3] if len(sys.argv) > 3 else "public/fonts/AuraSans-Regular"
ANGLE = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0  # shear degrees, >0 leans right
TTF_OUT = OUT_STEM + ".ttf"
WOFF2_OUT = OUT_STEM + ".woff2"

CUT = 44  # base slant dx for terminal cuts
DY = {"Vertical": 0}

# glyph -> {contour_index: {point_index: (dx, dy)}}  (offsets applied to each point)
EDITS = {
    "E": {1: {2: (-CUT, 0)}, 2: {2: (-CUT, 0)}, 3: {2: (-CUT, 0)}},
    "F": {1: {2: (-CUT, 0)}, 2: {2: (-CUT, 0)}},
    "T": {1: {1: (CUT, 0), 2: (-CUT, 0)}},
    "L": {1: {2: (-CUT, 0)}},
    "t": {1: {3: (-CUT, 0)}},
    "M": {0: {3: (0, 137), 4: (0, 137), 11: (0, 137), 12: (0, 137)}},
    "V": {0: {3: (0, 46), 6: (0, 46)}},
}

PIVOT_GLYPH = "A"       # glyph whose apex becomes a pointed peak
PIVOT_INDEX = 2         # insert position (peak between the two current points)
PIVOT_DY = 18           # peak height above the midpoint of the neighbouring points

s = WEIGHT / 400.0

if WEIGHT == 400:
    f = TTFont(SRC)
else:
    f = instantiateVariableFont(TTFont(SRC), {"wght": WEIGHT}, inplace=False)

glyf = f["glyf"]

for table in ("fvar", "gvar", "HVAR", "STAT", "avar", "cvar", "VORG"):
    if table in f:
        del f[table]

for glyph_name, contours in EDITS.items():
    g = glyf[glyph_name]
    coords = g.coordinates
    for ci, pts in contours.items():
        start = 0 if ci == 0 else g.endPtsOfContours[ci - 1] + 1
        for pi, (dx, dy) in pts.items():
            j = start + pi
            coords[j] = (coords[j][0] + dx * s, coords[j][1] + dy * s)

gA = glyf[PIVOT_GLYPH]
c = gA.coordinates
px = int((c[1][0] + c[2][0]) / 2)
py = int((c[1][1] + c[2][1]) / 2) + PIVOT_DY
new = GlyphCoordinates()
new.extend(c[:PIVOT_INDEX])
new.append((px, py))
new.extend(c[PIVOT_INDEX:])
gA.coordinates = new
gA.endPtsOfContours = [e + 1 for e in gA.endPtsOfContours]
gA.flags = gA.flags[:PIVOT_INDEX] + bytes([1]) + gA.flags[PIVOT_INDEX:]

if ANGLE:
    slope = tan(radians(ANGLE))
    for gn in glyf.keys():
        g = glyf[gn]
        if g.numberOfContours > 0:
            g.coordinates = GlyphCoordinates((x + y * slope, y) for x, y in g.coordinates)

italic = bool(ANGLE)
we = "Bold Italic" if WEIGHT >= 700 and italic else "Italic" if italic else "Bold" if WEIGHT >= 700 else "Regular"
pswe = "BoldItalic" if WEIGHT >= 700 and italic else "Italic" if italic else "Bold" if WEIGHT >= 700 else "Regular"
for name_id, value in {
    1: "Aura Sans",
    2: we,
    3: f"AuraSans-{pswe}",
    4: f"Aura Sans {we}",
    6: f"AuraSans-{pswe}",
    16: "Aura Sans",
    17: we,
}.items():
    for rec in f["name"].names:
        if rec.nameID == name_id and rec.platformID in (1, 3):
            rec.string = value.encode("utf-16-be" if rec.platformID == 3 else "latin-1")

f["head"].fontRevision = 1.0
f["head"].macStyle = (0x02 if italic else 0) | (0x01 if WEIGHT >= 700 else 0)
f["OS/2"].usWeightClass = WEIGHT
fs = f["OS/2"].fsSelection
f["OS/2"].fsSelection = (fs & ~0x60) | (0x01 if italic else 0) | (0x20 if WEIGHT >= 700 else 0)
f["post"].italicAngle = -ANGLE if italic else 0.0
f["post"].underlinePosition = -75
f["post"].underlineThickness = 50

order = f.getGlyphOrder()
xmin = ymin = 10**9
xmax = ymax = -10**9
max_points = 0
max_contours = 0
metrics = {}
for gn in order:
    g = glyf[gn]
    if g.numberOfContours == 0:
        continue
    b = g.recalcBounds(glyf)
    if b:
        gxmin, gymin, gxmax, gymax = b
        xmin, ymin = min(xmin, gxmin), min(ymin, gymin)
        xmax, ymax = max(xmax, gxmax), max(ymax, gymax)
        lsb = gxmin
        adv = f["hmtx"][gn][0]
        metrics[gn] = (adv, lsb)
        max_points = max(max_points, len(g.coordinates))
        max_contours = max(max_contours, g.numberOfContours)

f["hmtx"].metrics = {gn: metrics.get(gn, f["hmtx"][gn]) for gn in order}
head = f["head"]
head.xMin, head.yMin, head.xMax, head.yMax = xmin, ymin, xmax, ymax
mp = f["maxp"]
mp.maxPoints, mp.maxContours = max_points, max_contours
mp.maxCompositePoints = mp.maxCompositeContours = 0
mp.maxComponentElements = 0
if "loca" in f:
    f["loca"].recompile = True

f.save(TTF_OUT)
compress(TTF_OUT, WOFF2_OUT)
print(f"wrote {TTF_OUT} / {WOFF2_OUT} | {we}")