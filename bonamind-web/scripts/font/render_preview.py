#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render Aura Sans to PNG specimen sheets for visual inspection.

Usage: py -3 render_preview.py [out_png]
"""

import math
import os
import sys

import freetype
from PIL import Image, ImageDraw

FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "fonts", "AuraSans-Regular.ttf")

ALL_CHARS = (
    "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z\n"
    "a b c d e f g h i j k l m n o p q r s t u v w x y z\n"
    "0 1 2 3 4 5 6 7 8 9\n"
    "! ? . , : ; ' \" ( ) [ ] { } / \\ | - _ @ # $ % & * + = < > ^ ~ `\n"
    "\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00ba\u00bb\u00bc\u00bd\u00be\u00bf\n"
    "\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d0\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00de\u00df\n"
    "\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f0\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00fe\u00ff\n"
    "\u0152\u0153\u0160\u0161\u017d\u017e\u015e\u015f\u20ac\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u2039\u203a\u2122"
)

PANG1 = "The quick brown fox jumps over the lazy dog"
PANG2 = "Waltz, bad nymph, for quick jigs vex."
PANG3 = "\u00c0 propos d'une \u00e9tude, il \u00e9coute: \u00e0\u00e9\u00e8\u00ea\u00e7\u00f9\u00fb\u00ee\u00f4\u00ff"
PANG4 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789"
KERN1 = "AV AW AY AT VA WA YA To Ta Ty Yo Te Tu To Lt L. F. P. Tr"


def load_face():
    face = freetype.Face(FONT)
    return face


def render_char(face, ch, size=200):
    face.set_pixel_sizes(0, size)
    face.load_char(ch, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
    bmp = face.glyph.bitmap
    w, h = bmp.width, bmp.rows
    img = Image.new("L", (w, h), 0)
    if bmp.buffer and w and h:
        img.putdata(list(bmp.buffer))
    left = face.glyph.bitmap_left
    top = face.glyph.bitmap_top
    return img, left, top, face.glyph.advance.x >> 6


def paste_glyph(img, color, x, y, glyph_img):
    mask = Image.eval(glyph_img, lambda v: 255 - v)
    img.paste(color, (x, y), mask)


def render_sheet(face, out_png, cell=150, pad=60):
    rows = ALL_CHARS.split("\n")
    ncols = max(26, max(len(r) for r in rows))
    nrows = len(rows)
    W = ncols * cell + pad * 2
    H = nrows * cell + pad * 2
    img = Image.new("RGB", (W, H), (245, 245, 245))
    dr = ImageDraw.Draw(img)

    asc = face.ascender * cell // 64
    face.set_pixel_sizes(0, cell)
    for r, line in enumerate(rows):
        base_y = pad + r * cell + cell - int(face.height * cell // 64 * 0.15)
        dr.line([(0, base_y), (W, base_y)], fill=(215, 215, 215))
        x = pad
        for ch in line:
            if ch == " ":
                x += cell // 2
                continue
            img_g, left, top, adv = render_char(face, ch, cell)
            paste_glyph(img, (20, 20, 20), x + left, base_y - top, img_g)
            x += adv + cell // 6
    img.save(out_png)
    return out_png


def render_text_rows(face, out_png):
    face.set_pixel_sizes(0, 90)
    asc = face.ascender * 90 // 64
    H = asc * 8
    W = 2400
    img = Image.new("RGB", (W, H), (250, 250, 250))
    dr = ImageDraw.Draw(img)
    y = 60
    for txt in (PANG1, PANG2, PANG3, PANG4, KERN1):
        face.set_pixel_sizes(0, 90)
        x = 40
        for ch in txt:
            if ch == " ":
                x += face.glyph.advance.x * 0
                face.load_char(" ", 0)
                x += face.glyph.advance.x >> 6
                continue
            img_g, left, top, adv = render_char(face, ch, 90)
            paste_glyph(img, (20, 20, 20), x + left, y - top, img_g)
            x += adv
        dr.line([(40, y + 30), (W - 40, y + 30)], fill=(200, 200, 200))
        y += asc + 40
    img.save(out_png)
    return out_png


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    out1 = os.path.join(out_dir, "preview-grid.png")
    out2 = os.path.join(out_dir, "preview-text.png")
    face = load_face()
    render_sheet(face, out1)
    render_text_rows(face, out2)
    print(out1)
    print(out2)


if __name__ == "__main__":
    main()
