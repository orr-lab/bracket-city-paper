/*
 * i18n.js - the page's own words in Hebrew (default) and English.
 * The English messages are the script's messages, word for word.
 * (The worksheet picture's labels follow the puzzle's language, see LABELS in worksheet.js.)
 */
(function (global) {
  "use strict";

  var STRINGS = {
    he: {
      privacy: "הכול קורה בדפדפן. הפאזל לא נשלח לשום מקום.",
      sec_page: "הדף",
      sec_font: "גופן",
      advanced: "מתקדם",
      r_full: "עמוד מלא",
      r_custom: "אחר",
      cols_hint: "לכל היותר, זה לצד זה",
      font_size_hint: "מוקטן אוטומטית אם צריך",
      empty_title: "כאן יופיע דף העבודה",
      empty_body: "מדביקים פאזל בתיבה, או מנסים דוגמה:",
      sheet_size: "{w} × {h} פיקסלים",
      page_title: "דף עבודה לפאזל סוגריים",
      title: "דף עבודה לפאזל סוגריים",
      switch_lang: "English",
      puzzle: "הפאזל",
      examples: "דוגמה:",
      example_en: "באנגלית",
      example_he: "בעברית",
      ratio: "גודל",
      custom_ratio: "רוחב:גובה",
      orientation: "כיוון הדף",
      portrait: "לאורך",
      landscape: "לרוחב",
      font: "גופן",
      font_default: "ברירת מחדל (Gisha לעברית, Arial לאנגלית)",
      font_heebo: "Heebo (מובנה באתר)",
      font_other: "גופן אחר שמותקן במחשב…",
      font_name: "שם הגופן",
      font_name_ph: "לדוגמה: David",
      cols: "רמזים בשורה",
      font_size: "גודל טקסט התחלתי",
      width: "רוחב התמונה (פיקסלים)",
      direction: "כיוון כתיבה",
      dir_auto: "אוטומטי (עברית ← מימין לשמאל)",
      dir_rtl: "מימין לשמאל",
      dir_ltr: "משמאל לימין",
      show_original: "להציג את הפאזל המקורי למעלה",
      file_name: "שם הקובץ",
      dl_png: "הורדת PNG",
      dl_pdf: "PDF",
      dl_txt: "טקסט",
      dl_txt_title: "טקסט מופרד בטאבים, להדבקה ב-Publisher,‏ Word או Docs",
      preview: "תצוגה מקדימה",
      empty: "מדביקים או מקלידים פאזל כדי לראות את דף העבודה.",
      hebrew_found: "זוהתה עברית: פריסה מימין לשמאל.",
      extra_bracket: "לא הצלחתי לקרוא את הפאזל: יש ']' מיותר ליד תו {pos}",
      missing_bracket: "לא הצלחתי לקרוא את הפאזל: חסר ']': אחד מסימני ה-'[' לא נסגר",
      no_brackets: "לא נמצאו [סוגריים] בטקסט.",
      bad_ratio: "היחס צריך להיות full,‏ 3/4,‏ 1/2, או רוחב:גובה כמו 3:4 (גובה גדול יותר = לאורך)",
      shrunk: "הטקסט הוקטן מ-{from} ל-{to} כדי להיכנס ביחס הדף.",
      too_long: "אזהרה: הפאזל ארוך מדי ליחס הזה גם בגודל הטקסט הקטן ביותר, לכן התמונה גבוהה יותר מהמבוקש.",
      font_missing: "{names} לא מותקן במכשיר הזה, לכן נעשה שימוש בגופן המובנה {fallback}. אפשר לבחור גופן אחר.",
      font_substituted: "{asked} לא מותקן במכשיר הזה, לכן נעשה שימוש ב-{used}.",
      font_no_hebrew: "בגופן {name} אין אותיות עבריות, לכן העברית מוצגת ב-{fallback}.",
      or: " או ",
      pdf_failed: "לא הצלחתי ליצור PDF: {error}",
    },
    en: {
      privacy: "Everything happens in your browser. The puzzle is never sent anywhere.",
      sec_page: "Page",
      sec_font: "Font",
      advanced: "Advanced",
      r_full: "Full page",
      r_custom: "Custom",
      cols_hint: "At most, side by side",
      font_size_hint: "Shrinks to fit if needed",
      empty_title: "Your worksheet will appear here",
      empty_body: "Paste a puzzle in the box, or try an example:",
      sheet_size: "{w} × {h} px",
      page_title: "Bracket Puzzle Worksheet",
      title: "Bracket puzzle worksheet",
      switch_lang: "עברית",
      puzzle: "Puzzle",
      examples: "Try an example:",
      example_en: "English",
      example_he: "Hebrew",
      ratio: "Size",
      custom_ratio: "Width:height",
      orientation: "Orientation",
      portrait: "Portrait",
      landscape: "Landscape",
      font: "Font",
      font_default: "Default (Gisha for Hebrew, Arial for English)",
      font_heebo: "Heebo (built in)",
      font_other: "Other installed font…",
      font_name: "Font name",
      font_name_ph: "e.g. Times New Roman",
      cols: "Clues per row",
      font_size: "Starting text size",
      width: "Picture width (px)",
      direction: "Direction",
      dir_auto: "Auto (Hebrew → right to left)",
      dir_rtl: "Right to left",
      dir_ltr: "Left to right",
      show_original: "Show the original puzzle at the top",
      file_name: "File name",
      dl_png: "Download PNG",
      dl_pdf: "PDF",
      dl_txt: "Text",
      dl_txt_title: "Tab-separated text, to paste into Publisher, Word or Docs",
      preview: "Preview",
      empty: "Paste or type a puzzle to see the worksheet.",
      hebrew_found: "Hebrew found: right-to-left layout.",
      extra_bracket: "Couldn't read the puzzle: Extra ']' near character {pos}",
      missing_bracket: "Couldn't read the puzzle: Missing ']': a '[' is never closed",
      no_brackets: "No [brackets] found in the input.",
      bad_ratio: "Ratio should be full, 3/4, 1/2, or width:height like 3:4 (height bigger means vertical)",
      shrunk: "Text shrunk from {from} to {to} to fit the page ratio.",
      too_long: "Warning: too long for this ratio even at the smallest text size, so the picture is taller than asked.",
      font_missing: "{names} isn't installed on this device, so the built-in {fallback} font is used. Pick another font to change it.",
      font_substituted: "{asked} isn't installed on this device, so {used} is used.",
      font_no_hebrew: "{name} has no Hebrew letters, so the Hebrew is drawn in {fallback}.",
      or: " or ",
      pdf_failed: "Couldn't make the PDF: {error}",
    },
  };

  var lang = "he";

  function t(key, params) {
    var s = STRINGS[lang][key];
    if (s == null) s = STRINGS.en[key] != null ? STRINGS.en[key] : key;
    return s.replace(/\{(\w+)\}/g, function (_, k) {
      var v = params && params[k];
      if (Array.isArray(v)) v = v.join(STRINGS[lang].or);
      return v == null ? "" : String(v);
    });
  }

  // Fill every element marked data-i18n (text), data-i18n-placeholder / -title / -label (attributes),
  // and flip the page direction.
  function apply(newLang) {
    lang = STRINGS[newLang] ? newLang : "he";
    var root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "he" ? "rtl" : "ltr";
    document.title = t("page_title");
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    [["placeholder", "data-i18n-placeholder"], ["title", "data-i18n-title"], ["aria-label", "data-i18n-label"]]
      .forEach(function (pair) {
        document.querySelectorAll("[" + pair[1] + "]").forEach(function (el) {
          el.setAttribute(pair[0], t(el.getAttribute(pair[1])));
        });
      });
    var btn = document.getElementById("lang"); // the switch is written in the other language
    if (btn) btn.lang = lang === "he" ? "en" : "he";
  }

  global.I18n = {
    t: t,
    apply: apply,
    get lang() { return lang; },
  };
})(window);
