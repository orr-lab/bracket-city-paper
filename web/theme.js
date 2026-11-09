/* theme.js - light/dark switch. Loaded in <head> so a saved choice applies before the page paints.
 * No saved choice = follow the system. Switching back to the system's own scheme forgets the choice. */
(function () {
  "use strict";

  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function system() { return media && media.matches ? "dark" : "light"; }
  function current() { return root.getAttribute("data-theme") || system(); }

  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) { /* storage blocked */ }

  function sync(btn) { btn.setAttribute("aria-pressed", current() === "dark" ? "true" : "false"); }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme");
    if (!btn) return;
    sync(btn);
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      var store = null;
      if (next === system()) root.removeAttribute("data-theme");
      else { root.setAttribute("data-theme", next); store = next; }
      try {
        if (store) localStorage.setItem("theme", store);
        else localStorage.removeItem("theme");
      } catch (e) { /* storage blocked: fine */ }
      sync(btn);
    });
    if (media && media.addEventListener) media.addEventListener("change", function () { sync(btn); });
  });
})();
