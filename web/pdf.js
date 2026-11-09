/*
 * pdf.js - wrap the worksheet picture in a one-page PDF, the same way the script does
 * (img.save(..., resolution=width / 8.27)): the page is A4 wide (8.27 in) and as tall as the
 * picture needs. The picture is stored losslessly (raw RGB, deflate-compressed by the browser's
 * CompressionStream). Older browsers without CompressionStream get a high-quality JPEG instead.
 */
(function (global) {
  "use strict";

  function bytes(s) {
    return new TextEncoder().encode(s);
  }

  function concat(chunks) {
    var len = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(len), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  // zlib-format deflate, which is exactly what PDF's /FlateDecode expects
  function deflate(data) {
    var cs = new CompressionStream("deflate");
    var stream = new Blob([data]).stream().pipeThrough(cs);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function imageData(canvas) {
    if (typeof CompressionStream === "function") {
      var px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      var rgb = new Uint8Array(canvas.width * canvas.height * 3);
      for (var i = 0, j = 0; i < px.length; i += 4) {
        rgb[j++] = px[i];
        rgb[j++] = px[i + 1];
        rgb[j++] = px[i + 2];
      }
      return deflate(rgb).then(function (z) { return { data: z, filter: "/FlateDecode" }; });
    }
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        blob.arrayBuffer().then(function (b) {
          resolve({ data: new Uint8Array(b), filter: "/DCTDecode" });
        });
      }, "image/jpeg", 0.95);
    });
  }

  function num(x) {
    return (Math.round(x * 100) / 100).toString();
  }

  // Returns a Promise of a PDF Blob.
  function canvasToPdf(canvas) {
    var w = canvas.width, h = canvas.height;
    var pw = 8.27 * 72; // page width in points: A4 width
    var ph = h * pw / w;
    return imageData(canvas).then(function (img) {
      var content = "q " + num(pw) + " 0 0 " + num(ph) + " 0 0 cm /Im0 Do Q\n";
      var objs = [
        bytes("<< /Type /Catalog /Pages 2 0 R >>"),
        bytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
        bytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + num(pw) + " " + num(ph) + "] " +
          "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"),
        concat([
          bytes("<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h +
            " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter " + img.filter +
            " /Length " + img.data.length + " >>\nstream\n"),
          img.data,
          bytes("\nendstream"),
        ]),
        bytes("<< /Length " + content.length + " >>\nstream\n" + content + "endstream"),
      ];

      var chunks = [bytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
      var offset = chunks[0].length;
      var xref = [];
      objs.forEach(function (body, i) {
        xref.push(offset);
        var piece = concat([bytes(i + 1 + " 0 obj\n"), body, bytes("\nendobj\n")]);
        chunks.push(piece);
        offset += piece.length;
      });
      var table = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" +
        xref.map(function (o) { return ("000000000" + o).slice(-10) + " 00000 n \n"; }).join("") +
        "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + offset + "\n%%EOF\n";
      chunks.push(bytes(table));
      return new Blob([concat(chunks)], { type: "application/pdf" });
    });
  }

  global.canvasToPdf = canvasToPdf;
})(window);
