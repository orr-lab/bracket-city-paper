/*
 * worksheet.js - browser port of bracket_layers.py (parse, layer, clue_text, make_image,
 * fit_to_ratio, parse_ratio). bracket_layers.py is the source of truth; keep the two in step.
 * Everything runs locally in the browser, nothing is sent anywhere.
 */
(function (global) {
  "use strict";

  var HEBREW = /[֐-׿]/;

  // Worksheet labels. Hebrew is written as escapes, with the transliteration beside it.
  var LABELS = {
    false: {
      row: "ROW",
      solve_first: "solve first",
      final_sentence: "final sentence",
      final: "final",
      original: "ORIGINAL PUZZLE",
      carry: "copy each answer into its numbered blank in the row below",
    },
    true: {
      row: "שורה", // shura
      solve_first: "מתחילים כאן", // matchilim kan
      final_sentence: "המשפט הסופי", // hamishpat hasofi
      final: "סופי", // sofi
      original: "הפאזל המקורי", // hapazel hamekori
      // ha'ateku kol tshuva la-reik im oto mispar bashura shemitachat
      carry: "העתיקו כל תשובה " +
        "לריק עם אותו מספר " +
        "בשורה שמתחת",
    },
  };

  // ---------------------------------------------------------------- fonts

  // Gisha and Arial come from the visitor's own installed fonts and are never shipped with the
  // page. Heebo (SIL OFL, in fonts/) is bundled as the fallback: it has both Hebrew and Latin.
  var FALLBACK_FONT = "Heebo";

  // Messages are returned as { code, params }; i18n.js turns them into Hebrew or English.
  // The English wording there is the script's own.
  function msg(code, params) {
    return { code: code, params: params || {} };
  }

  function PuzzleError(code, params) {
    var e = new Error(code);
    e.code = code;
    e.params = params || {};
    return e;
  }

  function cssFamily(name) {
    return '"' + name.replace(/["\\]/g, "") + '"';
  }

  // The stack used for drawing: the chosen font, then Heebo for any letters it lacks.
  function fontStack(name) {
    return (name && name !== FALLBACK_FONT ? cssFamily(name) + ", " : "") + cssFamily(FALLBACK_FONT) + ", sans-serif";
  }

  // Is this font installed? document.fonts.check() says yes for any system font name, so compare
  // text widths instead: if "Name", <generic> measures the same as <generic> for every generic
  // family, the browser fell back each time and the font isn't there.
  var SAMPLE_LATIN = "mmmmmmmmmmlli WwQ@ 0123456789";
  var SAMPLE_HEBREW = "\u05e9\u05dc\u05d5\u05dd \u05e2\u05d5\u05dc\u05dd \u05d0\u05d1\u05d2\u05d3\u05d4\u05d5\u05d6\u05d7\u05d8";
  var HEBREW_LETTERS = SAMPLE_HEBREW.replace(/ /g, ""); // no spaces: the font's own space would count
  var fontCache = {};

  function hasFont(name, sample) {
    var key = name + "\u0000" + sample;
    if (key in fontCache) return fontCache[key];
    var ctx = getMeasureCtx();
    ctx.direction = "ltr";
    var found = ["monospace", "serif", "sans-serif"].some(function (generic) {
      ctx.font = "72px " + generic;
      var base = ctx.measureText(sample).width;
      ctx.font = "72px " + cssFamily(name) + ", " + generic;
      return ctx.measureText(sample).width !== base;
    });
    return (fontCache[key] = found);
  }

  // Does an installed font have Hebrew letters? Compare against Heebo rather than the generic
  // families: for letters the first font lacks, some browsers (Chrome on macOS) pick a system
  // fallback that depends on that first font, so generic-family widths would differ anyway.
  function hasHebrew(name) {
    var key = name + "\u0000hebrew";
    if (key in fontCache) return fontCache[key];
    var heebo = "72px " + cssFamily(FALLBACK_FONT);
    if (!(global.document && document.fonts && document.fonts.check(heebo, HEBREW_LETTERS))) {
      return hasFont(name, HEBREW_LETTERS); // Heebo not loaded (yet): rough answer, not cached
    }
    var ctx = getMeasureCtx();
    ctx.direction = "ltr";
    ctx.font = heebo;
    var base = ctx.measureText(HEBREW_LETTERS).width;
    ctx.font = "72px " + cssFamily(name) + ", " + cssFamily(FALLBACK_FONT);
    return (fontCache[key] = ctx.measureText(HEBREW_LETTERS).width !== base);
  }

  // Forget what was measured, e.g. once the built-in font has loaded.
  function resetFontChecks() {
    fontCache = {};
  }

  // Pick the font like the script's choose_fonts(): the asked-for font, else Gisha for Hebrew /
  // Arial for English. Unlike the script, a missing font isn't an error here: the page falls back
  // to Heebo and says so in a note.
  function chooseFont(asked, rtl) {
    asked = (asked || "").trim();
    var notes = [];
    var name = null;
    if (asked === FALLBACK_FONT) {
      name = FALLBACK_FONT;
    } else {
      var names = asked ? [asked] : (rtl ? ["Gisha", "Arial"] : ["Arial"]);
      name = names.filter(function (n) { return hasFont(n, SAMPLE_LATIN) || hasFont(n, SAMPLE_HEBREW); })[0] || null;
      if (!name) {
        notes.push(msg("font_missing", { names: names, fallback: FALLBACK_FONT }));
        name = FALLBACK_FONT;
      } else if (name !== names[0]) {
        notes.push(msg("font_substituted", { asked: names[0], used: name }));
      }
      if (rtl && name !== FALLBACK_FONT && !hasHebrew(name)) {
        notes.push(msg("font_no_hebrew", { name: name, fallback: FALLBACK_FONT }));
      }
    }
    return { name: name, family: fontStack(name), notes: notes };
  }

  // Python's str.split() / " ".join(): collapse all whitespace.
  function collapse(s) {
    return s.split(/\s+/).filter(Boolean).join(" ");
  }

  // Python's round(): halves go to the even neighbour.
  function pyRound(x) {
    var f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  // ---------------------------------------------------------------- parsing

  function Node() {
    this.parts = []; // strings and child Nodes, in reading order
    this.height = 0; // 0 = no brackets inside it
    this.num = null; // clue number, assigned later
  }
  Node.prototype.children = function () {
    return this.parts.filter(function (p) { return p instanceof Node; });
  };

  function parse(text) {
    text = collapse(text); // collapse newlines and extra spaces
    var root = new Node();
    var stack = [root];
    var buf = [];

    function flush() {
      if (buf.length) {
        stack[stack.length - 1].parts.push(buf.join(""));
        buf.length = 0;
      }
    }

    // Brackets are matched on the typed (logical) order, so this works for Hebrew as is.
    // Iterate by code point, like Python does, so positions in messages match.
    var chars = Array.from(text);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (ch === "[") {
        flush();
        var n = new Node();
        stack[stack.length - 1].parts.push(n);
        stack.push(n);
      } else if (ch === "]") {
        if (stack.length === 1) throw PuzzleError("extra_bracket", { pos: i + 1 });
        flush();
        stack.pop();
      } else {
        buf.push(ch);
      }
    }
    flush();
    if (stack.length !== 1) throw PuzzleError("missing_bracket");

    // If the whole puzzle is wrapped in one big bracket, unwrap it.
    var real = root.parts.filter(function (p) { return !(typeof p === "string" && !p.trim()); });
    if (real.length === 1 && real[0] instanceof Node) root = real[0];
    return root;
  }

  function layer(root) {
    // Compute heights, group nodes into rows (deepest first), assign numbers.
    var order = []; // preorder, for stable ordering within a row

    function walk(n) {
      order.push(n);
      var kids = n.children();
      kids.forEach(walk);
      n.height = kids.length ? 1 + Math.max.apply(null, kids.map(function (c) { return c.height; })) : 0;
    }

    walk(root);
    var rows = [];
    for (var h = 0; h <= root.height; h++) {
      rows.push(order.filter(function (n) { return n.height === h; }));
    }
    var k = 1;
    rows.forEach(function (row) {
      row.forEach(function (n) { n.num = k++; });
    });
    return rows;
  }

  function clueText(node, spaced) {
    // child slot: the number plus a short blank to write the answer into. By default no
    // spaces are added, so text typed right against a bracket stays attached:
    // [rat]s -> (3)______s. With spaced (--spaced-blanks): (3)______ s
    return collapse(node.parts.map(function (p) {
      if (typeof p === "string") return p;
      var slot = "(" + p.num + ")______";
      return spaced ? " " + slot + " " : slot;
    }).join(""));
  }

  function rowTitle(i, total, rtl) {
    var L = LABELS[rtl];
    var base = L.row + " " + (i + 1);
    if (total === 1) return base + " (" + L.final + ")";
    if (i === 0) return base + " (" + L.solve_first + ")";
    if (i === total - 1) return base + " (" + L.final_sentence + ")";
    return base;
  }

  // ---------------------------------------------------------------- text output

  var RLM = "\u200f"; // right-to-left mark, makes each pasted line start as RTL

  // The --text version: tab-separated, to paste into Publisher / Word / Docs.
  function makeText(rows, original, rtl, blankLen, spaced) {
    var mark = rtl ? RLM : "";
    var blank = new Array((blankLen || 22) + 1).join("_");
    var lines = [mark + LABELS[rtl].original, mark + original, ""];
    rows.forEach(function (row, i) {
      lines.push(mark + rowTitle(i, rows.length, rtl));
      row.forEach(function (n) { lines.push(mark + n.num + ".\t" + clueText(n, spaced) + "\t" + blank); });
      lines.push("");
    });
    return lines.join("\n").replace(/\s+$/, "") + "\n";
  }

  // ---------------------------------------------------------------- image output

  var measureCtx = null;
  function getMeasureCtx() {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    return measureCtx;
  }

  function fontSpec(size, bold, family) {
    return (bold ? "bold " : "") + size + "px " + family;
  }

  // Right-to-left text goes inside RLE ... PDF, so the browser's own bidi algorithm lays it out
  // with a right-to-left base direction (brackets mirrored, English runs kept in order),
  // even in a browser that ignores ctx.direction.
  function bidi(text, rtl) {
    return rtl ? "‫" + text + "‬" : text;
  }

  function setDir(ctx, rtl) {
    ctx.direction = rtl ? "rtl" : "ltr";
    if (ctx.canvas && ctx.canvas.setAttribute) ctx.canvas.setAttribute("dir", rtl ? "rtl" : "ltr");
  }

  // Layout pass: works out every position and the total height, without drawing.
  // Mirrors make_image(); draw() below paints the result.
  function makeImage(rows, original, rtl, opts) {
    var width = opts.width, cols = opts.cols, fsize = opts.fsize, showOriginal = opts.showOriginal;
    var spaced = !!opts.spaced;
    var family = opts.family || fontStack(null);
    var font = fontSpec(fsize, false, family);
    var bold = fontSpec(fsize, true, family);
    var small = fontSpec(Math.trunc(fsize * 0.7), false, family);

    var ctx = getMeasureCtx();
    setDir(ctx, rtl);
    var cache = {};

    function tw(text, f) {
      var key = f + "\u0000" + text;
      if (!(key in cache)) {
        ctx.font = f;
        cache[key] = ctx.measureText(bidi(text, rtl)).width;
      }
      return cache[key];
    }

    function wrap(text, f, maxw) {
      var words = text.split(/\s+/).filter(Boolean), lines = [], cur = "";
      words.forEach(function (w) {
        var t = (cur + " " + w).trim();
        if (tw(t, f) <= maxw || !cur) {
          cur = t;
        } else {
          lines.push(cur);
          cur = w;
        }
      });
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    }

    var margin = Math.trunc(width * 0.05);
    var usable = width - 2 * margin;
    var gap = Math.trunc(fsize * 0.5);
    var lh = Math.trunc(fsize * 1.3);
    var maxNum = 0;
    rows.forEach(function (row) { row.forEach(function (n) { maxNum = Math.max(maxNum, n.num); }); });
    var numw = Math.trunc(tw(maxNum + ".", bold)) + Math.trunc(fsize * 0.7);
    var ansH = Math.trunc(fsize * 1.9);

    // original puzzle at the top, plain text
    var origLines = showOriginal ? wrap(original, font, usable) : [];
    var origH = origLines.length * lh;
    var sepGap = showOriginal ? Math.trunc(fsize * 1.4) : 0;
    var rowGap = Math.trunc(fsize * 1.1);
    var labelH = Math.trunc(fsize * 1.1);

    var layout = [];
    var totalH = margin + origH + sepGap;
    rows.forEach(function (row, i) {
      var perLine = Math.min(cols, row.length);
      var cellw = Math.floor((usable - gap * (perLine - 1)) / perLine);
      var textW = cellw - numw;
      var cells = row.map(function (n) { return [n.num, wrap(clueText(n, spaced), font, textW)]; });
      var blocks = [];
      for (var s = 0; s < cells.length; s += perLine) {
        var grp = cells.slice(s, s + perLine);
        var h = Math.max.apply(null, grp.map(function (c) { return c[1].length; })) * lh + ansH;
        blocks.push([grp, h]);
      }
      var rowH = labelH + blocks.reduce(function (a, b) { return a + b[1]; }, 0) + gap * (blocks.length - 1);
      layout.push([i, perLine, cellw, blocks, rowH]);
      totalH += rowH + (i < rows.length - 1 ? rowGap : 0);
    });
    totalH += margin;

    return {
      width: width,
      height: totalH,
      fsize: fsize,
      draw: function (d, offsetY, ink) {
        draw(d, offsetY || 0, ink || {});
      },
    };

    function draw(d, oy, ink) {
      setDir(d, rtl);
      d.textBaseline = "alphabetic";
      var black = ink.text || "black";
      var grey = ink.grey || "rgb(130,130,130)";

      // y is the top of the text (the ascender line), like Pillow's default anchor
      function put(xLeft, xRight, y, text, f, fill) {
        d.font = f;
        d.fillStyle = fill || black;
        var m = d.measureText(bidi(text, rtl));
        var asc = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : parseFloat(f.replace("bold ", "")) * 0.905;
        if (rtl) {
          d.textAlign = "right"; // draw text ending at the right edge
          d.fillText(bidi(text, rtl), xRight, oy + y + asc);
        } else {
          d.textAlign = "left"; // draw text starting at the left edge
          d.fillText(text, xLeft, oy + y + asc);
        }
      }

      // a 2px line, same pixels as Pillow's line(width=2)
      function hline(x0, x1, y, fill) {
        d.fillStyle = fill;
        d.fillRect(x0, oy + y, x1 - x0 + 1, 2);
      }

      // original puzzle, then one thin rule
      var y = margin;
      origLines.forEach(function (ln, li) { put(margin, width - margin, y + li * lh, ln, font); });
      y += origH + Math.floor(sepGap / 2);
      if (showOriginal) hline(margin, width - margin, y, grey);
      y += Math.floor(sepGap / 2);

      // rows: small grey label, then each clue with a single write-in line under it
      layout.forEach(function (L, li) {
        var i = L[0], perLine = L[1], cellw = L[2], blocks = L[3];
        put(margin, width - margin, y, rowTitle(i, rows.length, rtl), small, grey);
        y += labelH;
        blocks.forEach(function (B, bi) {
          var grp = B[0], h = B[1];
          grp.forEach(function (cell, ci) {
            var num = cell[0], lines = cell[1];
            var slot = rtl ? perLine - 1 - ci : ci;
            var x = margin + slot * (cellw + gap);
            put(x, x + cellw, y, num + ".", bold);
            var tLeft = rtl ? x : x + numw;
            var tRight = rtl ? x + cellw - numw : x + cellw;
            lines.forEach(function (ln, k) { put(tLeft, tRight, y + k * lh, ln, font); });
            var ly = y + h - Math.trunc(fsize * 0.2);
            hline(x, x + cellw, ly, black);
          });
          y += h + (bi < blocks.length - 1 ? gap : 0);
        });
        if (li < layout.length - 1) y += rowGap;
      });
    }
  }

  // ---------------------------------------------------------------- page ratio

  // Presets are a share of an A4 page (210 x 297 mm), cut by height: the full page, the top
  // three-quarters, or the top half. The orientation decides whether that page is portrait
  // (210 wide, 297 tall) or landscape (297 wide, 210 tall).
  var PRESETS = { full: 1.0, "3/4": 0.75, "1/2": 0.5 };
  var PAGES = { portrait: [210, 297], landscape: [297, 210] };

  // Return [width, height] for the picture. A custom width:height is used exactly as typed.
  function parseRatio(s, orientation) {
    s = s.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(PRESETS, s)) {
      var page = PAGES[orientation || "portrait"];
      return [page[0], page[1] * PRESETS[s]];
    }
    var m = /^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/.exec(s);
    if (!m || parseFloat(m[1]) <= 0 || parseFloat(m[2]) <= 0) throw PuzzleError("bad_ratio");
    return [parseFloat(m[1]), parseFloat(m[2])];
  }

  // Shrink the text until everything fits the page ratio; short puzzles keep blank space below.
  // Returns the layout to draw, the canvas height, and a message (or null).
  function fitToRatio(rows, original, rtl, width, cols, fsize, targetH, showOriginal, family, spaced, minFont) {
    if (minFont == null) minFont = 14;
    var f = fsize;
    for (;;) {
      var img = makeImage(rows, original, rtl, {
        width: width, cols: cols, fsize: f, showOriginal: showOriginal, family: family, spaced: spaced,
      });
      if (img.height <= targetH) {
        return {
          img: img,
          height: targetH,
          shrunk: f < fsize,
          message: f < fsize ? msg("shrunk", { from: fsize, to: f }) : null,
          warning: false,
        };
      }
      if (f <= minFont) {
        return {
          img: img,
          height: img.height,
          shrunk: f < fsize,
          message: msg("too_long"),
          warning: true,
        };
      }
      f -= 1;
    }
  }

  // ---------------------------------------------------------------- main

  // Everything main() does up to saving files. Throws an Error with .code / .params.
  function build(text, o) {
    var root = parse(text); // extra_bracket / missing_bracket: "Couldn't read the puzzle: ..."
    if (!root.children().length) throw PuzzleError("no_brackets");

    var dir = o.direction || "auto";
    var rtl = dir === "rtl" || (dir === "auto" && HEBREW.test(text));
    var font = chooseFont(o.font, rtl);
    var original = collapse(text);
    var rows = layer(root);
    var r = parseRatio(o.ratio || "full", o.orientation);
    var width = o.width || 1800;
    var targetH = pyRound(width * r[1] / r[0]);
    var fit = fitToRatio(rows, original, rtl, width, o.cols || 3, o.fontSize || 34, targetH,
      o.showOriginal !== false, font.family, !!o.spacedBlanks);
    fit.rtl = rtl;
    fit.rows = rows;
    fit.original = original;
    fit.font = font;
    fit.spaced = !!o.spacedBlanks;
    return fit;
  }

  function hexRgb(hex, def) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    var n = parseInt(m ? m[1] : def, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  // Paint a build() result onto a canvas, content at the top. colors: { text, bg, transparent }
  // as "#rrggbb"; the default is black on a white page. The script's grey (130 on white) is
  // the text color at 49% over the background, so it follows whatever colors are picked.
  function render(canvas, fit, colors) {
    colors = colors || {};
    var text = hexRgb(colors.text, "000000"), bg = hexRgb(colors.bg, "ffffff");
    var a = 0.49, grey;
    if (colors.transparent) {
      grey = "rgba(" + text.join(",") + "," + a + ")";
    } else {
      grey = "rgb(" + text.map(function (c, i) { return Math.round(c * a + bg[i] * (1 - a)); }).join(",") + ")";
    }
    canvas.width = fit.img.width;
    canvas.height = fit.height;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!colors.transparent) {
      ctx.fillStyle = "rgb(" + bg.join(",") + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    fit.img.draw(ctx, 0, { text: "rgb(" + text.join(",") + ")", grey: grey });
  }

  global.Worksheet = {
    HEBREW: HEBREW,
    LABELS: LABELS,
    FALLBACK_FONT: FALLBACK_FONT,
    chooseFont: chooseFont,
    hasFont: hasFont,
    hasHebrew: hasHebrew,
    resetFontChecks: resetFontChecks,
    makeText: makeText,
    parse: parse,
    layer: layer,
    clueText: clueText,
    rowTitle: rowTitle,
    makeImage: makeImage,
    parseRatio: parseRatio,
    fitToRatio: fitToRatio,
    build: build,
    render: render,
  };
})(window);
