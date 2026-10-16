/* ===================================================================
   EGBC — full-screen video turns the phone sideways (Martin, 15 Oct 2026)
   ===================================================================

   Full-screen YouTube in the app stayed upright. The manifests now allow
   any orientation (952713a3); this makes it automatic where the phone lets
   a page decide:

   - A VIDEO GOES FULL SCREEN (a YouTube iframe, or a <video>): ask for
     landscape. Leaving full screen: let go again.
   - THE REST OF THE INSTALLED APP STAYS UPRIGHT: in the installed app
     (display-mode standalone or fullscreen) ask for portrait. Where the
     phone says no, it is left to the phone's own auto-rotate.

   Every request is a try: screen.orientation.lock() is Android Chrome's,
   and it only works in an installed app or in full screen. An iPhone has
   no lock at all - its own video player turns sideways by itself when the
   phone is turned - so there this does nothing, quietly.

   It listens on the document, so it covers every player on the page
   without touching the code that draws them (the app's Listen & Watch,
   Watch & Listen, Team Videos, the hub). Load it on any page with video.

   Tests stub screen.orientation (headless Chrome has no lock):
   tests/check-orientation.mjs.
   =================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc || global.EGBCOrientation) return;

  function orient() { return global.screen && global.screen.orientation; }
  function installed() {
    try {
      return !!(global.matchMedia && (global.matchMedia('(display-mode: standalone)').matches
        || global.matchMedia('(display-mode: fullscreen)').matches)) || global.navigator.standalone === true;
    } catch (e) { return false; }
  }
  /* A promise that never rejects: the phone saying no is normal. */
  function lock(kind) {
    var o = orient();
    if (!o || typeof o.lock !== 'function') return Promise.resolve(false);
    try { return Promise.resolve(o.lock(kind)).then(function () { return true; }, function () { return false; }); }
    catch (e) { return Promise.resolve(false); }
  }
  function unlock() {
    var o = orient();
    try { if (o && typeof o.unlock === 'function') o.unlock(); } catch (e) { /* not supported */ }
  }
  function fsEl() { return doc.fullscreenElement || doc.webkitFullscreenElement || null; }
  function isVideo(el) {
    if (!el) return false;
    var tag = String(el.tagName || '').toUpperCase();
    if (tag === 'VIDEO') return true;
    /* A YouTube player (youtube.com or youtube-nocookie.com), or any element
       that holds one - some players put their wrapper into full screen. */
    if (tag === 'IFRAME') return /youtube(-nocookie)?\.com|player\.vimeo\.com/.test(String(el.src || ''));
    return !!(el.querySelector && el.querySelector('video, iframe[src*="youtube"]'));
  }

  var landscape = false;
  function onChange() {
    var el = fsEl();
    if (isVideo(el)) { landscape = true; lock('landscape'); return; }
    if (landscape) {
      landscape = false;
      unlock();
      /* Back to upright in the installed app, as it was before. */
      if (installed()) lock('portrait');
    }
  }
  doc.addEventListener('fullscreenchange', onChange);
  doc.addEventListener('webkitfullscreenchange', onChange);

  /* The installed app, outside full screen: upright where allowed. */
  if (installed()) lock('portrait');

  global.EGBCOrientation = { lock: lock, unlock: unlock, installed: installed, isVideo: isVideo, onChange: onChange };
})(typeof window !== 'undefined' ? window : this);
