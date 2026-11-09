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

  // Font stack with Hebrew on every platform: Arial has Hebrew on Windows and macOS,
  // Arial Hebrew covers iOS, Noto Sans Hebrew / Roboto + system fallback cover Android and Linux.
  var FONT_STACK = 'Arial, "Arial Hebrew", "Noto Sans Hebrew", "Noto Sans", Roboto, "DejaVu Sans", "Segoe UI", sans-serif';

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
        if (stack.length === 1) throw new Error("Extra ']' near character " + (i + 1));
        flush();
        stack.pop();
      } else {
        buf.push(ch);
      }
    }
    flush();
    if (stack.length !== 1) throw new Error("Missing ']': a '[' is never closed");

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

  function clueText(node) {
    // child slot: the number plus a short blank to write the answer into
    return collapse(node.parts.map(function (p) {
      return typeof p === "string" ? p : " (" + p.num + ")______ ";
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

  // ---------------------------------------------------------------- image output

  var measureCtx = null;
  function getMeasureCtx() {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    return measureCtx;
  }

  function fontSpec(size, bold) {
    return (bold ? "bold " : "") + size + "px " + FONT_STACK;
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
    var font = fontSpec(fsize, false);
    var bold = fontSpec(fsize, true);
    var small = fontSpec(Math.trunc(fsize * 0.7), false);

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
      var cells = row.map(function (n) { return [n.num, wrap(clueText(n), font, textW)]; });
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
      draw: function (d, offsetY) {
        draw(d, offsetY || 0);
      },
    };

    function draw(d, oy) {
      setDir(d, rtl);
      d.textBaseline = "alphabetic";
      var grey = "rgb(130,130,130)";

      // y is the top of the text (the ascender line), like Pillow's default anchor
      function put(xLeft, xRight, y, text, f, fill) {
        d.font = f;
        d.fillStyle = fill || "black";
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
            hline(x, x + cellw, ly, "black");
          });
          y += h + (bi < blocks.length - 1 ? gap : 0);
        });
        if (li < layout.length - 1) y += rowGap;
      });
    }
  }

  // ---------------------------------------------------------------- page ratio

  // width:height of the picture, based on an A4 portrait page (210 x 297 mm)
  var PRESETS = {
    full: [210, 297],
    "3/4": [210, 297 * 0.75],
    "1/2": [210, 297 * 0.5],
  };

  var RATIO_ERROR = "Ratio should be full, 3/4, 1/2, or width:height like 3:4 (portrait means height bigger)";

  function parseRatio(s) {
    s = s.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(PRESETS, s)) return PRESETS[s];
    var m = /^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/.exec(s);
    if (!m || parseFloat(m[1]) <= 0 || parseFloat(m[2]) <= 0) throw new Error(RATIO_ERROR);
    return [parseFloat(m[1]), parseFloat(m[2])];
  }

  // Shrink the text until everything fits the page ratio; short puzzles keep blank space below.
  // Returns the layout to draw, the canvas height, and a message (or null).
  function fitToRatio(rows, original, rtl, width, cols, fsize, targetH, showOriginal, minFont) {
    if (minFont == null) minFont = 14;
    var f = fsize;
    for (;;) {
      var img = makeImage(rows, original, rtl, { width: width, cols: cols, fsize: f, showOriginal: showOriginal });
      if (img.height <= targetH) {
        return {
          img: img,
          height: targetH,
          shrunk: f < fsize,
          message: f < fsize ? "Text shrunk from " + fsize + " to " + f + " to fit the page ratio." : null,
          warning: false,
        };
      }
      if (f <= minFont) {
        return {
          img: img,
          height: img.height,
          shrunk: f < fsize,
          message: "Warning: too long for this ratio even at the smallest text size, so the picture is taller than asked.",
          warning: true,
        };
      }
      f -= 1;
    }
  }

  // ---------------------------------------------------------------- main

  // Everything main() does up to saving files. Throws Error with the script's messages.
  function build(text, o) {
    var root;
    try {
      root = parse(text);
    } catch (e) {
      throw new Error("Couldn't read the puzzle: " + e.message);
    }
    if (!root.children().length) throw new Error("No [brackets] found in the input.");

    var dir = o.direction || "auto";
    var rtl = dir === "rtl" || (dir === "auto" && HEBREW.test(text));
    var original = collapse(text);
    var rows = layer(root);
    var r = parseRatio(o.ratio || "full");
    var width = o.width || 1800;
    var targetH = pyRound(width * r[1] / r[0]);
    var fit = fitToRatio(rows, original, rtl, width, o.cols || 3, o.fontSize || 34, targetH, o.showOriginal !== false);
    fit.rtl = rtl;
    fit.rows = rows;
    return fit;
  }

  // Paint a build() result onto a canvas: white page, content at the top.
  function render(canvas, fit) {
    canvas.width = fit.img.width;
    canvas.height = fit.height;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    fit.img.draw(ctx, 0);
  }

  global.Worksheet = {
    HEBREW: HEBREW,
    LABELS: LABELS,
    FONT_STACK: FONT_STACK,
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
