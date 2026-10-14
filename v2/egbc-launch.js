/* ===================================================================
   EGBC — is it switch-over yet? (churchSettings/launch)
   ===================================================================

   UNTIL SWITCH-OVER THE LIVE DATABASE IS READABLE SIGNED OUT (the
   reviewing window, 14 Oct 2026: every collection - worries, prayers,
   welcomes included - answers a signed-out list). The locked rules go on
   on switch-over day; until then anything a form saves is public.

   So the forms that hold something private do not save until
   churchSettings/launch.rulesLocked is exactly true. A master admin sets it
   on Church settings straight after the rules deploy (NEXT-BRIEF §26).
   Missing, unreadable or anything but true: NOT locked, nothing is saved.

     EGBCLaunch.check()      -> Promise of { locked, opensOn }
     EGBCLaunch.notYet(on)   -> the words a form shows instead
     EGBCLaunch.DANGER       -> "If someone is in immediate danger, call 999."

   Used by worried.html (pastoral care for me, and both kinds of concern).
   prayer.html and newhere.html are the events window's (FINDINGS-events
   F-179).
   =================================================================== */

(function (global) {
  'use strict';

  var DANGER = 'If someone is in immediate danger, call 999.';

  function db() {
    if (global.EGBCAuth && EGBCAuth.db) return EGBCAuth.db;
    if (global.firebase && firebase.firestore) {
      try { return firebase.firestore(global.EGBCAuth && EGBCAuth.app); } catch (e) { return null; }
    }
    return null;
  }

  var asked = null;
  function check() {
    if (asked) return asked;
    var d = db();
    asked = !d ? Promise.resolve({ locked: false, opensOn: '' })
      : d.collection('churchSettings').doc('launch').get().then(function (s) {
          var x = s.exists ? (s.data() || {}) : {};
          return { locked: x.rulesLocked === true, opensOn: String(x.opensOn || '').trim() };
        }, function () { return { locked: false, opensOn: '' }; });
    return asked;
  }

  function notYet(opensOn) {
    return DANGER + ' This form opens ' + (opensOn ? 'on ' + opensOn : 'when the new church hub opens')
      + '. Until then, please speak to a church leader in person.';
  }

  global.EGBCLaunch = { check: check, notYet: notYet, DANGER: DANGER };
})(window);
