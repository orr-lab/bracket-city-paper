/* app.js - wires the form to Worksheet.build() and the downloads. */
(function () {
  "use strict";

  // The made-up examples from examples/inputs/
  var EXAMPLES = {
    en: "[The [[Opposite of day] sky] was [[[Frozen water] cube] [Not hot]] and a [Dog's sound] echoed from the [[Opposite of sun] [Natural satellite]]]",
    he: "[הכלב [נובח] ב[[ההפך מיום] ה[ירח]] " +
      "בשעה [[מים קפואים] [לא חם]]]",
  };
  var FILE_PREFIX = "bracket_city_layers"; // same names as the script's default output

  var $ = function (id) { return document.getElementById(id); };
  var puzzle = $("puzzle"), ratio = $("ratio"), custom = $("custom-ratio"), cols = $("cols"),
    fontSize = $("font-size"), direction = $("direction"), showOriginal = $("show-original"),
    status = $("status"), canvas = $("sheet"), dlPng = $("dl-png"), dlPdf = $("dl-pdf");

  var ok = false;
  var pending = false;

  function setStatus(msg, kind) {
    status.textContent = msg || "";
    status.className = kind || "";
  }

  function intIn(el, def, min, max) {
    var v = parseInt(el.value, 10);
    if (!isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
  }

  function update() {
    pending = false;
    var isCustom = ratio.value === "custom";
    document.querySelectorAll(".custom-only").forEach(function (el) { el.hidden = !isCustom; });

    var text = puzzle.value;
    ok = false;
    if (!text.trim()) {
      setStatus("Paste or type a puzzle to see the worksheet.", "info");
    } else {
      try {
        var fit = Worksheet.build(text, {
          ratio: isCustom ? custom.value : ratio.value,
          cols: intIn(cols, 3, 1, 12),
          fontSize: intIn(fontSize, 34, 8, 120),
          direction: direction.value,
          showOriginal: showOriginal.checked,
        });
        Worksheet.render(canvas, fit);
        ok = true;
        setStatus(fit.message || (fit.rtl ? "Hebrew found: right-to-left layout." : ""),
          fit.warning ? "warn" : "info");
      } catch (e) {
        setStatus(e.message, "error");
      }
    }
    canvas.style.opacity = ok ? "" : "0.35";
    dlPng.disabled = dlPdf.disabled = !ok;
  }

  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(update);
    }
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

  [puzzle, ratio, custom, cols, fontSize, direction, showOriginal].forEach(function (el) {
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
    if (!ok) return;
    canvas.toBlob(function (blob) { save(blob, FILE_PREFIX + ".png"); }, "image/png");
  });

  dlPdf.addEventListener("click", function () {
    if (!ok) return;
    dlPdf.disabled = true;
    canvasToPdf(canvas).then(function (blob) {
      save(blob, FILE_PREFIX + ".pdf");
    }, function (e) {
      setStatus("Couldn't make the PDF: " + e.message, "error");
    }).then(function () { dlPdf.disabled = !ok; });
  });

  update();
})();
