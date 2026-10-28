/* ===================================================================
   THE INSTALLED APP'S NAME, FROM THE CHURCH
   ===================================================================
   The manifest-*.json files name each app without a church ("Hub",
   "Rota Planner"), because the same files serve every church. This puts
   the church's short name in front ("EGBC Hub"), from churchSettings/
   details.shortName, by handing the browser a copy of the page's manifest
   with the name filled in. With no short name set, the plain name stands.

   A page with egbc-church.js loads this after it and needs nothing else.
   A page without it (the availability form) calls
   EGBCManifest.name(shortName) itself once it has read the details.
   =================================================================== */
(function (global) {
  'use strict';
  if (global.EGBCManifest) return;
  var done = false;

  /* Every address in the copy made absolute: a copy has no address of its
     own for the browser to resolve "app.html" or the icons against. */
  function absolute(m, base) {
    ['start_url', 'scope', 'id'].forEach(function (k) { if (m[k]) m[k] = new URL(m[k], base).href; });
    (m.icons || []).forEach(function (i) { i.src = new URL(i.src, base).href; });
    return m;
  }

  /**
   * Names the page's installed app after the church.
   * @param {string} short the church's short name ('' leaves the plain name)
   */
  function name(short) {
    short = String(short || '').trim();
    var link = document.querySelector('link[rel="manifest"]');
    if (done || !short || !link) return;
    done = true;
    var base = new URL(link.getAttribute('href'), location.href).href;
    fetch(base).then(function (r) { return r.json(); }).then(function (m) {
      m = absolute(m, base);
      /* The short name too only where it is the app's whole name ("Hub");
         the others ("Rota Planner v2") were never named after the church. */
      if (m.short_name === m.name) m.short_name = short + ' ' + m.short_name;
      m.name = short + ' ' + m.name;
      var blob = new Blob([JSON.stringify(m)], { type: 'application/manifest+json' });
      link.setAttribute('href', URL.createObjectURL(blob));
      /* An iPhone's home-screen name, where the page marks it data-church. */
      var t = document.querySelector('meta[name="apple-mobile-web-app-title"][data-church]');
      if (t && t.getAttribute('content').indexOf(short) !== 0) t.setAttribute('content', short + ' ' + t.getAttribute('content'));
    }).catch(function () { done = false; /* the plain name stands */ });
  }

  /* On a page with egbc-church.js: its short name, the one every page uses. */
  function start() {
    var C = global.EGBCChurch;
    if (C && C.load) C.load().then(function () { name(C.shortName()); }, function () {});
  }

  global.EGBCManifest = { name: name };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
