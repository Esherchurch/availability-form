/* ===================================================================
   EGBC — a video player with a full screen that always closes
   (F-215; the same behaviour as the app's Listen & Watch, the events
   window's egbc-app-listen.js)
   ===================================================================

   Martin, 15 Oct 2026: full-screen YouTube stayed upright, and inside it
   there was no way back. So, as the app does:
     - YouTube's own full-screen button is taken away (fs=0);
     - "Full screen" here fills the screen with the same player and a big
       close button that is always on top;
     - Back (the phone's gesture), Esc and the close button all close it;
     - on Android the screen turns sideways (screen.orientation.lock);
       where it cannot (an iPhone), the picture is turned instead, so the
       video fills the screen either way.

   Used by the hub's Watch card and Watch & Listen (watch.html):
     EGBCFullVideo.html(embedUrl, title)   the player's markup
   Everything else is handled here, once, for any number of players.
   =================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc || global.EGBCFullVideo) return;

  var CSS = '.fv-box{position:relative;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden}' +
    '.fv-in{position:absolute;top:0;left:0;width:100%;height:100%}.fv-in iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}' +
    '.fv-x{display:none}' +
    '.fv-box.big{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;aspect-ratio:auto;border-radius:0;z-index:2147483000}' +
    '.fv-box.big .fv-x{display:flex;align-items:center;justify-content:center;position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:2;' +
      'width:52px;height:52px;border-radius:50%;border:2px solid rgba(255,255,255,.75);background:rgba(0,0,0,.65);color:#fff;font:inherit;cursor:pointer}' +
    '.fv-box.rot .fv-in{top:50%;left:50%;transform:translate(-50%,-50%) rotate(90deg)}' +
    '.fv-bar{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}' +
    '.fv-big{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#111827;font:500 14px Inter,system-ui,sans-serif;cursor:pointer}';
  (function () { var s = doc.createElement('style'); s.id = 'egbc-fullvideo-css'; s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s); })();

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function noYouTubeFs(url) { url = String(url || ''); return /[?&]fs=/.test(url) ? url : url + (url.indexOf('?') === -1 ? '?' : '&') + 'fs=0'; }

  function html(embedUrl, title) {
    return '<div class="fv-box" data-fv-box><div class="fv-in">' +
      '<iframe src="' + esc(noYouTubeFs(embedUrl)) + '" title="' + esc(title || 'Video') + '" ' +
      'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>' +
      '<button type="button" class="fv-x" data-fv="small" aria-label="Close full screen">' +
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>' +
      '<div class="fv-bar"><button type="button" class="fv-big" data-fv="big">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>' +
      'Full screen</button></div>';
  }

  var BIG = null, REAL = false;
  function fsEl() { return doc.fullscreenElement || doc.webkitFullscreenElement || null; }
  function fit() {
    if (!BIG) return;
    var inn = BIG.querySelector('.fv-in'); if (!inn) return;
    var turn = global.innerHeight > global.innerWidth;
    BIG.classList.toggle('rot', turn);
    inn.style.width = turn ? BIG.clientHeight + 'px' : '';
    inn.style.height = turn ? BIG.clientWidth + 'px' : '';
  }
  function bigOn(box) {
    if (!box || BIG) return;
    BIG = box; REAL = false; box.classList.add('big'); fit();
    /* Back closes full screen, not the page. */
    try { global.history.pushState({ fvBig: 1 }, ''); } catch (e) {}
    var rf = box.requestFullscreen || box.webkitRequestFullscreen;
    if (!rf) return;
    try {
      var p = rf.call(box);
      var then = function () {
        REAL = !!fsEl(); fit();
        try { var o = global.screen && global.screen.orientation; if (o && o.lock) o.lock('landscape').then(fit, fit); } catch (e) {}
      };
      if (p && p.then) p.then(then, fit); else setTimeout(then, 0);
    } catch (e) {}
  }
  function bigOff(fromBack) {
    if (!BIG) return;
    var box = BIG; BIG = null; REAL = false;
    box.classList.remove('big', 'rot');
    var inn = box.querySelector('.fv-in'); if (inn) { inn.style.width = ''; inn.style.height = ''; }
    try { var o = global.screen && global.screen.orientation; if (o && o.unlock) o.unlock(); } catch (e) {}
    if (fsEl()) { try { var x = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen(); if (x && x.catch) x.catch(function () {}); } catch (e) {} }
    if (!fromBack) { try { if (global.history.state && global.history.state.fvBig) global.history.back(); } catch (e) {} }
  }

  doc.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-fv]');
    if (!b) return;
    e.preventDefault();
    if (b.getAttribute('data-fv') === 'small') { bigOff(false); return; }
    /* The player this button belongs to: the box just before its bar. */
    var bar = b.closest('.fv-bar'), box = bar && bar.previousElementSibling;
    if (box && box.hasAttribute('data-fv-box')) bigOn(box);
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && BIG) bigOff(false); });
  global.addEventListener('popstate', function () { if (BIG) bigOff(true); });
  var fsc = function () { if (BIG && REAL && !fsEl()) bigOff(false); else fit(); };
  doc.addEventListener('fullscreenchange', fsc); doc.addEventListener('webkitfullscreenchange', fsc);
  global.addEventListener('resize', fit);

  global.EGBCFullVideo = { html: html, bigOn: bigOn, bigOff: bigOff, isBig: function () { return !!BIG; } };
})(typeof window !== 'undefined' ? window : this);
