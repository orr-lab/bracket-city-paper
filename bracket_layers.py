#!/usr/bin/env python3
"""
bracket_layers.py - turn a Bracket City puzzle into a paper-friendly layered worksheet.
Works for English (left-to-right) and Hebrew (right-to-left) puzzles.

Usage:
    python3 bracket_layers.py puzzle.txt            # read from a file
    python3 bracket_layers.py                       # then paste the puzzle, finish with Ctrl-D (Ctrl-Z + Enter on Windows)
    python3 bracket_layers.py puzzle.txt --out my_puzzle --cols 3 --width 1800
    python3 bracket_layers.py puzzle.txt --direction rtl     # force direction (default: auto-detect)
    python3 bracket_layers.py puzzle.txt --ratio 1/2         # half page; also: full (default), 3/4, or 3:4
                                                             # text shrinks to fit, short puzzles leave blank space below

Outputs (next to the input, or use --out PREFIX):
    PREFIX_layers.png   the layered worksheet as a minimal, lines-only picture
    PREFIX_layers.pdf   same picture as a PDF
    PREFIX_layers.txt   only with --text: tab-separated text to paste into Publisher / Word / Docs

How the worksheet works:
    The original, unformatted puzzle sits at the top.
    Row 1 holds the innermost clues: solve those first.
    Every clue with brackets inside it shows a numbered blank, like (3)______, where an earlier
    answer goes. Each row only depends on rows above it, and the last row is the full sentence.
    If the puzzle contains Hebrew, everything is mirrored: labels in Hebrew, boxes fill from the
    right, numbers and text are right-aligned.

Requires: Pillow (pip install pillow). For Hebrew images also: pip install python-bidi
"""
import argparse
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont, features

try:  # python-bidi: fallback for right-to-left drawing when Pillow has no raqm/fribidi
    from bidi import get_display as _get_display
except ImportError:
    try:
        from bidi.algorithm import get_display as _get_display
    except ImportError:
        _get_display = None

# Best case: Pillow itself shapes right-to-left text (raqm + fribidi). Otherwise we reorder
# the text with python-bidi and draw it left to right.
USE_RAQM = bool(features.check("raqm") and features.check("fribidi"))
MIRROR = str.maketrans("()[]{}<>", ")(][}{><")


def _bidi_mirrors():
    """Does this python-bidi version already swap ( and ) in right-to-left text?"""
    return _get_display("(א)", base_dir="R") == "(א)"


def _kw(rtl):
    return {"direction": "rtl"} if (rtl and USE_RAQM) else {}

HEBREW = re.compile("[\u0590-\u05FF]")
RLM = "\u200f"  # right-to-left mark, makes each pasted line start as RTL

# Worksheet labels. Hebrew is written as escapes, with the transliteration beside it.
LABELS = {
    False: {
        "row": "ROW",
        "solve_first": "solve first",
        "final_sentence": "final sentence",
        "final": "final",
        "original": "ORIGINAL PUZZLE",
        "carry": "copy each answer into its numbered blank in the row below",
    },
    True: {
        "row": "\u05e9\u05d5\u05e8\u05d4",  # shura
        "solve_first": "\u05de\u05ea\u05d7\u05d9\u05dc\u05d9\u05dd \u05db\u05d0\u05df",  # matchilim kan
        "final_sentence": "\u05d4\u05de\u05e9\u05e4\u05d8 \u05d4\u05e1\u05d5\u05e4\u05d9",  # hamishpat hasofi
        "final": "\u05e1\u05d5\u05e4\u05d9",  # sofi
        "original": "\u05d4\u05e4\u05d0\u05d6\u05dc \u05d4\u05de\u05e7\u05d5\u05e8\u05d9",  # hapazel hamekori
        # ha'ateku kol tshuva la-reik im oto mispar bashura shemitachat
        "carry": ("\u05d4\u05e2\u05ea\u05d9\u05e7\u05d5 \u05db\u05dc \u05ea\u05e9\u05d5\u05d1\u05d4 "
                  "\u05dc\u05e8\u05d9\u05e7 \u05e2\u05dd \u05d0\u05d5\u05ea\u05d5 \u05de\u05e1\u05e4\u05e8 "
                  "\u05d1\u05e9\u05d5\u05e8\u05d4 \u05e9\u05de\u05ea\u05d7\u05ea"),
    },
}


# ---------------------------------------------------------------- parsing

class Node:
    def __init__(self):
        self.parts = []      # strings and child Nodes, in reading order
        self.height = 0      # 0 = no brackets inside it
        self.num = None      # clue number, assigned later

    @property
    def children(self):
        return [p for p in self.parts if isinstance(p, Node)]


def parse(text):
    text = " ".join(text.split())  # collapse newlines and extra spaces
    root = Node()
    stack = [root]
    buf = []

    def flush():
        if buf:
            stack[-1].parts.append("".join(buf))
            buf.clear()

    # Brackets are matched on the typed (logical) order, so this works for Hebrew as is.
    for i, ch in enumerate(text):
        if ch == "[":
            flush()
            n = Node()
            stack[-1].parts.append(n)
            stack.append(n)
        elif ch == "]":
            if len(stack) == 1:
                raise ValueError(f"Extra ']' near character {i + 1}")
            flush()
            stack.pop()
        else:
            buf.append(ch)
    flush()
    if len(stack) != 1:
        raise ValueError("Missing ']': a '[' is never closed")

    # If the whole puzzle is wrapped in one big bracket, unwrap it.
    real = [p for p in root.parts if not (isinstance(p, str) and not p.strip())]
    if len(real) == 1 and isinstance(real[0], Node):
        root = real[0]
    return root


def layer(root):
    """Compute heights, group nodes into rows (deepest first), assign numbers."""
    order = []  # preorder, for stable ordering within a row

    def walk(n):
        order.append(n)
        for c in n.children:
            walk(c)
        n.height = 1 + max(c.height for c in n.children) if n.children else 0

    walk(root)
    rows = [[n for n in order if n.height == h] for h in range(root.height + 1)]
    k = 1
    for row in rows:
        for n in row:
            n.num = k
            k += 1
    return rows


def clue_text(node):
    out = []
    for p in node.parts:
        # child slot: the number plus a short blank to write the answer into
        out.append(p if isinstance(p, str) else f" ({p.num})______ ")
    return " ".join("".join(out).split())


# ---------------------------------------------------------------- text output

def row_title(i, total, rtl):
    L = LABELS[rtl]
    base = f"{L['row']} {i + 1}"
    if total == 1:
        return f"{base} ({L['final']})"
    if i == 0:
        return f"{base} ({L['solve_first']})"
    if i == total - 1:
        return f"{base} ({L['final_sentence']})"
    return base


def make_text(rows, original, rtl, blank_len=22):
    mark = RLM if rtl else ""
    blank = "_" * blank_len
    lines = [mark + LABELS[rtl]["original"], mark + original, ""]
    for i, row in enumerate(rows):
        lines.append(mark + row_title(i, len(rows), rtl))
        for n in row:
            lines.append(f"{mark}{n.num}.\t{clue_text(n)}\t{blank}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


# ---------------------------------------------------------------- image output

REG = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]
BOLD = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(paths, size):
    for p in paths:
        if os.path.exists(p):
            try:
                engine = ImageFont.Layout.RAQM if USE_RAQM else ImageFont.Layout.BASIC
                return ImageFont.truetype(p, size, layout_engine=engine)
            except OSError:
                pass
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def visual(text, rtl):
    """Reorder text into the left-to-right order it should be drawn in."""
    if not rtl or USE_RAQM:
        return text
    s = _get_display(text, base_dir="R")
    # Fallback only: swap brackets ourselves if this python-bidi version doesn't.
    # (Brackets inside English words in a Hebrew line may come out flipped.)
    return s if _bidi_mirrors() else s.translate(MIRROR)


def make_image(rows, original, rtl, width=1800, cols=3, fsize=34, show_original=True):
    L = LABELS[rtl]
    font = load_font(REG, fsize)
    bold = load_font(BOLD, fsize)
    small = load_font(REG, int(fsize * 0.7))
    head = load_font(BOLD, int(fsize * 0.85))

    scratch = ImageDraw.Draw(Image.new("RGB", (10, 10)))

    def tw(text, f):
        return scratch.textlength(visual(text, rtl), font=f, **_kw(rtl))

    def wrap(text, f, maxw):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if tw(t, f) <= maxw or not cur:
                cur = t
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines or [""]

    margin = int(width * 0.05)
    usable = width - 2 * margin
    pad = int(fsize * 0.5)
    gap = int(fsize * 0.5)
    lh = int(fsize * 1.3)
    max_num = max(n.num for row in rows for n in row)
    numw = int(tw(f"{max_num}.", bold)) + int(fsize * 0.7)
    ans_h = int(fsize * 1.9)
    head_h = int(fsize * 1.6)
    arrow_h = int(fsize * 2.2)

    # original puzzle at the top, plain text
    orig_lines = wrap(original, font, usable) if show_original else []
    orig_h = len(orig_lines) * lh
    sep_gap = int(fsize * 1.4) if show_original else 0
    row_gap = int(fsize * 1.1)
    label_h = int(fsize * 1.1)
    grey = (130, 130, 130)

    layout = []
    total_h = margin + orig_h + sep_gap
    for i, row in enumerate(rows):
        per_line = min(cols, len(row))
        cellw = (usable - gap * (per_line - 1)) // per_line
        text_w = cellw - numw
        cells = [(n.num, wrap(clue_text(n), font, text_w)) for n in row]
        blocks = []
        for s in range(0, len(cells), per_line):
            grp = cells[s:s + per_line]
            h = max(len(c[1]) for c in grp) * lh + ans_h
            blocks.append((grp, h))
        row_h = label_h + sum(b[1] for b in blocks) + gap * (len(blocks) - 1)
        layout.append((i, per_line, cellw, blocks, row_h))
        total_h += row_h + (row_gap if i < len(rows) - 1 else 0)
    total_h += margin

    img = Image.new("RGB", (width, total_h), "white")
    d = ImageDraw.Draw(img)

    def put(x_left, x_right, y, text, f, fill="black"):
        """Draw text starting at the left edge (LTR) or ending at the right edge (RTL)."""
        s = visual(text, rtl)
        if rtl:
            w = d.textlength(s, font=f, **_kw(rtl))
            d.text((x_right - w, y), s, font=f, fill=fill, **_kw(rtl))
        else:
            d.text((x_left, y), s, font=f, fill=fill)

    # original puzzle, then one thin rule
    y = margin
    for li, ln in enumerate(orig_lines):
        put(margin, width - margin, y + li * lh, ln, font)
    y += orig_h + sep_gap // 2
    if show_original:
        d.line([margin, y, width - margin, y], fill=grey, width=2)
    y += sep_gap // 2

    # rows: small grey label, then each clue with a single write-in line under it
    for i, per_line, cellw, blocks, row_h in layout:
        put(margin, width - margin, y, row_title(i, len(rows), rtl), small, grey)
        y += label_h
        for bi, (grp, h) in enumerate(blocks):
            for ci, (num, lines) in enumerate(grp):
                slot = (per_line - 1 - ci) if rtl else ci
                x = margin + slot * (cellw + gap)
                put(x, x + cellw, y, f"{num}.", bold)
                if rtl:
                    t_left, t_right = x, x + cellw - numw
                else:
                    t_left, t_right = x + numw, x + cellw
                for li, ln in enumerate(lines):
                    put(t_left, t_right, y + li * lh, ln, font)
                ly = y + h - int(fsize * 0.2)
                d.line([x, ly, x + cellw, ly], fill="black", width=2)
            y += h + (gap if bi < len(blocks) - 1 else 0)
        if i < len(layout) - 1:
            y += row_gap
    return img


# ---------------------------------------------------------------- page ratio

# width:height of the picture, based on an A4 portrait page (210 x 297 mm)
PRESETS = {
    "full": (210, 297),
    "3/4": (210, 297 * 0.75),
    "1/2": (210, 297 * 0.5),
}


def parse_ratio(s):
    s = s.strip().lower()
    if s in PRESETS:
        return PRESETS[s]
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)", s)
    if not m or float(m.group(1)) <= 0 or float(m.group(2)) <= 0:
        sys.exit("--ratio should be full, 3/4, 1/2, or width:height like 3:4 (portrait means height bigger)")
    return float(m.group(1)), float(m.group(2))


def fit_to_ratio(rows, original, rtl, width, cols, fsize, target_h, min_font=14, show_original=True):
    """Shrink the text until everything fits the page ratio; short puzzles keep blank space below."""
    f = fsize
    while True:
        img = make_image(rows, original, rtl, width=width, cols=cols, fsize=f, show_original=show_original)
        if img.height <= target_h:
            canvas = Image.new("RGB", (width, target_h), "white")
            canvas.paste(img, (0, 0))
            if f < fsize:
                print(f"Text shrunk from {fsize} to {f} to fit the page ratio.", file=sys.stderr)
            return canvas
        if f <= min_font:
            print("Warning: too long for this ratio even at the smallest text size, "
                  "so the picture is taller than asked.", file=sys.stderr)
            return img
        f -= 1


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Bracket City -> layered paper worksheet (English or Hebrew)")
    ap.add_argument("input", nargs="?", help="text file with the puzzle (default: read stdin)")
    ap.add_argument("--out", help="output prefix (default: input name, or 'bracket_city')")
    ap.add_argument("--cols", type=int, default=3, help="max clues side by side per row (default 3)")
    ap.add_argument("--width", type=int, default=1800, help="image width in pixels (default 1800)")
    ap.add_argument("--font-size", type=int, default=34, help="text size in pixels (default 34)")
    ap.add_argument("--direction", choices=["auto", "rtl", "ltr"], default="auto",
                    help="layout direction (default: rtl if the puzzle contains Hebrew)")
    ap.add_argument("--ratio", default="full",
                    help="page shape: full (A4 portrait, default), 3/4 (three-quarter page), 1/2 (half page), "
                         "or custom width:height like 3:4")
    ap.add_argument("--no-original", action="store_true",
                    help="leave the original puzzle out of the picture (default: shown at the top)")
    ap.add_argument("--text", action="store_true", help="also write the tab-separated text version")
    ap.add_argument("--no-raqm", action="store_true", help=argparse.SUPPRESS)  # for testing the fallback
    args = ap.parse_args()
    if args.no_raqm:
        global USE_RAQM
        USE_RAQM = False

    if args.input:
        with open(args.input, encoding="utf-8") as f:
            text = f.read()
        prefix = args.out or os.path.splitext(args.input)[0]
    else:
        if sys.stdin.isatty():
            print("Paste the puzzle, then press Ctrl-D (Ctrl-Z then Enter on Windows):", file=sys.stderr)
        text = sys.stdin.read()
        prefix = args.out or "bracket_city"

    try:
        root = parse(text)
    except ValueError as e:
        sys.exit(f"Couldn't read the puzzle: {e}")
    if not root.children:
        sys.exit("No [brackets] found in the input.")

    rtl = (args.direction == "rtl") or (args.direction == "auto" and bool(HEBREW.search(text)))
    if rtl and not USE_RAQM and _get_display is None:
        sys.exit("Hebrew needs the python-bidi package for the image. Install it with:  pip install python-bidi")

    original = " ".join(text.split())
    rows = layer(root)
    rw, rh = parse_ratio(args.ratio)
    target_h = round(args.width * rh / rw)
    img = fit_to_ratio(rows, original, rtl, args.width, args.cols, args.font_size, target_h,
                       show_original=not args.no_original)

    img.save(prefix + "_layers.png")
    img.save(prefix + "_layers.pdf", resolution=args.width / 8.27)  # ~A4 width
    saved = ".png, .pdf"
    if args.text:  # optional editable version, only if you want to paste text somewhere
        with open(prefix + "_layers.txt", "w", encoding="utf-8") as f:
            f.write(make_text(rows, original, rtl))
        saved += ", .txt"
    print(f"Saved {prefix}_layers{saved}", file=sys.stderr)


if __name__ == "__main__":
    main()
