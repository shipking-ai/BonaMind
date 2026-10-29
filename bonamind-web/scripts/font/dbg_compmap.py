#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ASCII component map of a rendered char to locate outline breaks."""

import sys

import freetype
from PIL import Image

FONT = "public/fonts/AuraSans-Regular.ttf"
ch = sys.argv[1] if len(sys.argv) > 1 else "3"
SIZE = 160
CANVAS = 220
STEP = 5

face = freetype.Face(FONT)
face.set_pixel_sizes(0, SIZE)
face.load_char(ord(ch), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
bmp = face.glyph.bitmap
w, h = bmp.width, bmp.rows
img = Image.new("L", (CANVAS, CANVAS), 255)
data = Image.frombytes("L", (w, h), bytes(bmp.buffer))
cx = CANVAS // 2 + face.glyph.bitmap_left
cy = CANVAS // 2 - face.glyph.bitmap_top + SIZE // 2
mask = Image.eval(data, lambda v: 255 - v)
img.paste(data, (cx, cy), mask)
px = img.load()

lab = [[0] * CANVAS for _ in range(CANVAS)]
n = 0
sizes = []
for y in range(CANVAS):
    for x in range(CANVAS):
        if px[x, y] < 128 and not lab[y][x]:
            n += 1
            cnt = 0
            st = [(x, y)]
            lab[y][x] = n
            while st:
                cx2, cy2 = st.pop()
                cnt += 1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx2 + dx, cy2 + dy
                    if 0 <= nx < CANVAS and 0 <= ny < CANVAS and px[nx, ny] < 128 and not lab[ny][nx]:
                        lab[ny][nx] = n
                        st.append((nx, ny))
            sizes.append(cnt)

print("components:", n, "sizes:", sizes)
chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$"
for y in range(0, CANVAS, STEP):
    row = ""
    for x in range(0, CANVAS, STEP):
        c = lab[y][x]
        row += chars[c - 1] if c else " "
    print(row.rstrip())
