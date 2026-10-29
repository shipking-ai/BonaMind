#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Per-glyph health check: render every cmap char alone, centered, then
measure ink coverage and connected components. Flags empties/splits."""

import math
import sys

import freetype
from PIL import Image

FONT = "public/fonts/AuraSans-Regular.ttf"
SIZE = 90
CANVAS = 220


def components(mask):
    h, w = len(mask), len(mask[0])
    n = 0
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            n += 1
            stack = [(x, y)]
            mask[y][x] = False
            while stack:
                cx, cy = stack.pop()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx]:
                        mask[ny][nx] = False
                        stack.append((nx, ny))
    return n


def main():
    from fontTools.ttLib import TTFont

    f = TTFont(FONT)
    cmap = f.getBestCmap()
    face = freetype.Face(FONT)
    face.set_pixel_sizes(0, SIZE)

    flags = []
    checked = 0
    for ch in sorted(cmap.keys()):
        if ch == 0x20:
            continue
        checked += 1
        face.load_char(ch, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
        bmp = face.glyph.bitmap
        w, h = bmp.width, bmp.rows
        img = Image.new("L", (CANVAS, CANVAS), 255)
        if bmp.buffer and w and h:
            data = Image.frombytes("L", (w, h), bytes(bmp.buffer))
            left = face.glyph.bitmap_left
            top = face.glyph.bitmap_top
            cx = CANVAS // 2 + left
            cy = CANVAS // 2 - top + SIZE // 2
            mask = Image.eval(data, lambda v: 255 - v)
            img.paste(data, (cx, cy), mask)
        px = img.load()
        ink = 0
        mask = [[False] * CANVAS for _ in range(CANVAS)]
        minx = miny = CANVAS
        maxx = maxy = -1
        for y in range(CANVAS):
            for x in range(CANVAS):
                if px[x, y] < 128:
                    ink += 1
                    mask[y][x] = True
                    if x < minx:
                        minx = x
                    if x > maxx:
                        maxx = x
                    if y < miny:
                        miny = y
                    if y > maxy:
                        maxy = y
        if ink == 0:
            flags.append((hex(ch), "EMPTY"))
            continue
        ncomp = components(mask)
        iw = maxx - minx + 1
        ih = maxy - miny + 1
        if ncomp > 3 or iw > CANVAS - 20 or ih > CANVAS - 20:
            flags.append((hex(ch), "comps=%d" % ncomp, "inkbox=%dx%d" % (iw, ih)))

    print("checked:", checked)
    print("flagged:", len(flags))
    for fl in flags:
        print("  ", fl)


if __name__ == "__main__":
    main()
