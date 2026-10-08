/* ===================================================================
   EGBC — reading a QR code with the phone's camera (events window)
   ===================================================================

   The same way checkin.html reads a ticket (E1): Chrome on Android reads
   QR codes itself (BarcodeDetector); everywhere else, including iPhones,
   jsQR reads the frames. Kept here for the Sunday check-in desk; E1's page
   keeps its own copy so it does not change (NEXT-BRIEF §15).

     EGBCScan.start(videoEl, onText)  -> Promise (camera running)
     EGBCScan.stop()

   onText is called with each code read, at most once every 4 seconds for
   the same code.
   =================================================================== */

(function (global) {
  'use strict';

  var detector = null, jsqrLoading = null, stream = null, running = false, last = { text: '', at: 0 };
  var canvas = null;

  function loadJsQR() {
    if (global.jsQR) return Promise.resolve();
    if (jsqrLoading) return jsqrLoading;
    jsqrLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = res; s.onerror = function () { jsqrLoading = null; rej(new Error('The code reader could not load.')); };
      document.head.appendChild(s);
    });
    return jsqrLoading;
  }

  function start(video, onText) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('This browser cannot use the camera here.'));
    var ready = ('BarcodeDetector' in global)
      ? global.BarcodeDetector.getSupportedFormats().then(function (f) {
          if (f.indexOf('qr_code') >= 0) detector = new global.BarcodeDetector({ formats: ['qr_code'] });
          else return loadJsQR();
        }).catch(loadJsQR)
      : loadJsQR();
    return ready.then(function () {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    }).then(function (s) {
      stream = s; running = true;
      video.srcObject = s;
      return video.play();
    }).then(function () { loop(video, onText); });
  }

  function stop() {
    running = false;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
  }

  function loop(video, onText) {
    if (!running) return;
    if (video.readyState < 2) { setTimeout(function () { loop(video, onText); }, 200); return; }
    var read;
    if (detector) {
      read = detector.detect(video).then(function (codes) { return codes.length ? codes[0].rawValue : null; });
    } else {
      canvas = canvas || document.createElement('canvas');
      var w = video.videoWidth, h = video.videoHeight, scale = Math.min(1, 800 / Math.max(w, h));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var r = global.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      read = Promise.resolve(r ? r.data : null);
    }
    read.then(function (text) {
      var t = Date.now();
      if (text && !(text === last.text && t - last.at < 4000)) { last = { text: text, at: t }; onText(text); }
      setTimeout(function () { loop(video, onText); }, 250);
    }).catch(function () { setTimeout(function () { loop(video, onText); }, 400); });
  }

  global.EGBCScan = { start: start, stop: stop };
})(window);
