/* ===================================================================
   EGBC — the e-news's public pages (comms window, 19 Oct 2026)
   ===================================================================

   enews-signup.html, enews-confirm.html and enews-unsubscribe.html. No
   sign-in on any of them: each talks only to the hub's functions
   (functions/enews.js), never to the database, so nothing here can read or
   change anybody's record except through the one token in the link.

     EGBCEnewsPublic.post(name, body) -> Promise of the function's answer
     EGBCEnewsPublic.header(el)        the church's name and logo
     EGBCEnewsPublic.esc(s)
   =================================================================== */
(function (global) {
  'use strict';
  /* The only thing here that knows where the functions live: on localhost
     the emulator (5601 is the events window's), otherwise the live project. */
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var FN = LOCAL ? 'http://localhost:' + (location.port === '5601' ? 5102 : 5101) + '/egbc-worship-planner/europe-west2/'
                 : 'https://europe-west2-egbc-worship-planner.cloudfunctions.net/';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function post(name, body) {
    return fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }); });
  }
  function header(el) {
    var draw = function () {
      var name = (global.EGBCChurch && EGBCChurch.name()) || '', logo = (global.EGBCChurch && EGBCChurch.logo()) || '';
      el.innerHTML = (logo ? '<img src="' + esc(logo) + '" alt="" class="lg">' : '<span class="lg" aria-hidden="true"></span>') +
        '<span><b>' + esc(name || 'Our church') + '</b><small>The weekly e-news</small></span>';
    };
    draw();
    if (global.EGBCChurch && EGBCChurch.load) EGBCChurch.load().then(draw, draw);
  }
  global.EGBCEnewsPublic = { post: post, header: header, esc: esc, FN: FN };
})(window);
