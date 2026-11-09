/* app.js - wires the form to Worksheet.build() and the downloads. */
(function () {
  "use strict";

  // The made-up examples from examples/inputs/
  var EXAMPLES = {
    en: "[The [[Opposite of day] sky] was [[[Frozen water] cube] [Not hot]] and a [Dog's sound] echoed from the [[Opposite of sun] [Natural satellite]]]",
    he: "[הכלב [נובח] ב[[ההפך מיום] ה[ירח]] " +
      "בשעה [[מים קפואים] [לא חם]]]",
  };
  var DEFAULT_PREFIX = "bracket_city"; // the script's default --out

  var $ = function (id) { return document.getElementById(id); };
  var puzzle = $("puzzle"), custom = $("custom-ratio"), font = $("font"), customFont = $("custom-font"), cols = $("cols"), fontSize = $("font-size"),
    width = $("width"), direction = $("direction"), showOriginal = $("show-original"),
    fontNote = $("font-note"), status = $("status"), fileName = $("file-name"), canvas = $("sheet"),
    dlPng = $("dl-png"), dlPdf = $("dl-pdf"), dlTxt = $("dl-txt"), langBtn = $("lang"),
    empty = $("empty"), sheetSize = $("sheet-size");
  var radios = document.querySelectorAll('input[name="ratio"], input[name="orientation"]');
  var t = I18n.t;

  function checked(name) {
    return document.querySelector('input[name="' + name + '"]:checked').value;
  }

  var current = null; // the last good build() result
  var pending = false;

  function setStatus(msg, kind) {
    status.textContent = msg || "";
    status.className = kind || "";
    status.hidden = !msg;
  }

  // a { code, params } message from worksheet.js, in the page's language
  function say(m) {
    return m ? t(m.code, m.params) : "";
  }

  function setNote(notes) {
    var text = (notes || []).map(say).join(" ");
    fontNote.textContent = text;
    fontNote.hidden = !text;
  }

  function intIn(el, def, min, max) {
    var v = parseInt(el.value, 10);
    if (!isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
  }

  function showIf(cls, on) {
    document.querySelectorAll("." + cls).forEach(function (el) { el.hidden = !on; });
  }

  function update() {
    pending = false;
    var ratio = checked("ratio");
    var isCustom = ratio === "custom";
    showIf("custom-only", isCustom);
    showIf("preset-only", !isCustom); // orientation only applies to the presets, like the script
    showIf("font-only", font.value === "other");

    var text = puzzle.value;
    current = null;
    if (!text.trim()) {
      setStatus(null);
      setNote(null);
    } else {
      try {
        var fit = Worksheet.build(text, {
          ratio: isCustom ? custom.value : ratio,
          orientation: checked("orientation"),
          font: font.value === "other" ? customFont.value : font.value,
          cols: intIn(cols, 3, 1, 12),
          fontSize: intIn(fontSize, 34, 8, 120),
          width: intIn(width, 1800, 300, 3000),
          direction: direction.value,
          showOriginal: showOriginal.checked,
        });
        Worksheet.render(canvas, fit);
        current = fit;
        setNote(fit.font.notes);
        setStatus(fit.message ? say(fit.message) : null, fit.warning ? "warn" : "info");
      } catch (e) {
        if (!e.code) throw e;
        setNote(null);
        setStatus(say(e), "error");
      }
    }
    // empty box: show the placeholder; a typo mid-edit: keep the last picture, dimmed
    var drawn = current || (text.trim() && canvas.dataset.drawn);
    if (current) canvas.dataset.drawn = "1";
    empty.hidden = !!drawn;
    canvas.hidden = !drawn;
    canvas.classList.toggle("stale", !current);
    sheetSize.textContent = current ? t("sheet_size", { w: canvas.width, h: canvas.height }) : "";
    dlPng.disabled = dlPdf.disabled = dlTxt.disabled = !current;
  }

  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(update);
    }
  }

  // PREFIX_layers.ext, like the script's --out PREFIX
  function outName(ext) {
    var prefix = fileName.value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_") || DEFAULT_PREFIX;
    return prefix + "_layers." + ext;
  }

  function save(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  [puzzle, custom, font, customFont, cols, fontSize, width, direction, showOriginal].concat(Array.from(radios))
    .forEach(function (el) {
      el.addEventListener("input", schedule);
      el.addEventListener("change", schedule);
    });

  document.querySelectorAll("[data-example]").forEach(function (b) {
    b.addEventListener("click", function () {
      puzzle.value = EXAMPLES[b.getAttribute("data-example")];
      schedule();
    });
  });

  dlPng.addEventListener("click", function () {
    if (!current) return;
    canvas.toBlob(function (blob) { save(blob, outName("png")); }, "image/png");
  });

  dlPdf.addEventListener("click", function () {
    if (!current) return;
    dlPdf.disabled = true;
    canvasToPdf(canvas).then(function (blob) {
      save(blob, outName("pdf"));
    }, function (e) {
      setStatus(t("pdf_failed", { error: e.message }), "error");
    }).then(function () { dlPdf.disabled = !current; });
  });

  dlTxt.addEventListener("click", function () {
    if (!current) return;
    var txt = Worksheet.makeText(current.rows, current.original, current.rtl);
    save(new Blob([txt], { type: "text/plain;charset=utf-8" }), outName("txt"));
  });

  // Hebrew by default; ?lang=en or the language button switches, and the browser remembers it.
  function setLang(lang, remember) {
    I18n.apply(lang);
    if (remember) {
      try { localStorage.setItem("lang", I18n.lang); } catch (e) { /* storage blocked: fine */ }
    }
    schedule();
  }

  langBtn.addEventListener("click", function () {
    setLang(I18n.lang === "he" ? "en" : "he", true);
  });

  var startLang = null;
  try { startLang = new URLSearchParams(location.search).get("lang"); } catch (e) { /* old browser */ }
  if (!startLang) {
    try { startLang = localStorage.getItem("lang"); } catch (e) { /* storage blocked */ }
  }
  I18n.apply(startLang || "he");

  // A canvas only draws with a web font once it has loaded, so load the built-in Heebo
  // (both weights, Hebrew and Latin parts) and redraw when it's ready.
  update();
  if (document.fonts && document.fonts.load) {
    var sample = "aא";
    Promise.all([
      document.fonts.load("400 34px " + Worksheet.FALLBACK_FONT, sample),
      document.fonts.load("700 34px " + Worksheet.FALLBACK_FONT, sample),
    ]).then(function () {
      Worksheet.resetFontChecks();
      schedule();
    }, schedule);
  }
})();
