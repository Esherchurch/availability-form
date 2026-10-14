/* ===================================================================
   EGBC — "Speak": say it instead of typing it (events window; NEXT-BRIEF
   §24 item 11; F-166)
   ===================================================================

   For people who find typing hard. A big button beside a box: press
   Speak, talk, press Stop; the words go into the box, where they can be
   read and changed before anything is sent.

     EGBCSpeak.attach(button, textarea, { status: element })
       -> true if this phone can listen, false if not (the button is then
          hidden and the status says where the keyboard's own microphone is)

   IT USES THE PHONE'S OWN SPEECH RECOGNITION (the browser's
   SpeechRecognition): free, nothing to install. Chrome and Android send the
   sound to Google to turn into words; Safari on an iPhone does it on the
   phone where it can. NOTHING IS RECORDED OR KEPT by the hub: only the words
   that land in the box, and only if the person then sends them.

   Where a phone cannot listen (an iPhone app on the Home Screen often
   cannot), the keyboard's own microphone still works, and many people do
   not know it is there - so the page says so rather than showing a button
   that does nothing.
   =================================================================== */

(function (global) {
  'use strict';

  function Recog() { return global.SpeechRecognition || global.webkitSpeechRecognition || null; }
  function can() { return !!Recog(); }
  var KEYBOARD = 'To speak instead of typing, tap the box, then the microphone on your phone\'s keyboard.';

  function attach(btn, box, o) {
    o = o || {};
    var say = function (m) { if (o.status) o.status.textContent = m; };
    var R = Recog();
    if (!R) { btn.style.display = 'none'; say(KEYBOARD); return false; }
    var rec = null, on = false, before = '';
    function label() {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.innerHTML = on ? '■ Stop' : '🎤 Speak';
    }
    function stop() { on = false; label(); if (rec) { try { rec.stop(); } catch (e) {} } }
    btn.addEventListener('click', function () {
      if (on) { stop(); say('Stopped. Read it through, and change anything that came out wrong.'); return; }
      rec = new R();
      rec.lang = o.lang || 'en-GB';
      rec.continuous = true;
      rec.interimResults = true;
      before = box.value ? box.value.replace(/\s*$/, ' ') : '';
      var done = '';
      rec.onresult = function (ev) {
        var now = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) done += t; else now += t;
        }
        box.value = (before + done + now).replace(/\s+/g, ' ').replace(/^\s/, '');
        box.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.onerror = function (ev) {
        var e = ev && ev.error;
        say(e === 'not-allowed' || e === 'service-not-allowed' ? 'The microphone is not allowed for this page. ' + KEYBOARD
          : e === 'no-speech' ? 'Nothing heard. Press Speak and try again.' : 'Speaking stopped. ' + KEYBOARD);
        on = false; label();
      };
      rec.onend = function () { if (on) { on = false; label(); } };
      try { rec.start(); on = true; label(); say('Listening… speak now, then press Stop.'); }
      catch (e) { on = false; label(); say(KEYBOARD); }
    });
    label();
    say('');
    return true;
  }

  global.EGBCSpeak = { attach: attach, can: can, KEYBOARD: KEYBOARD };
})(window);
