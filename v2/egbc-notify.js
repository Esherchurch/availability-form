/* ===================================================================
   EGBC — phone notifications, the page side
   (events window; NEXT-BRIEF §23; FINDINGS-notify N-2, N-3; F-144)
   ===================================================================

   Turning notifications on and off on this phone, each person's own
   switches, a test message, calling a parent, and knowing when a phone
   cannot have them yet (an iPhone not added to the Home Screen).

   ANDROID AND IPHONE FROM DAY ONE (Martin, §23):
   - Android: works in Chrome and in the installed app.
   - iPhone: from iOS 16.4, and only in the app ADDED TO THE HOME SCREEN
     and opened from its icon. In Safari itself it can never work, so the
     page shows the "Add to Home Screen" guide instead of a button that
     would do nothing. iOS 16.3 or older: "update your iPhone".
   The button must be pressed by the person: no phone allows a prompt that
   comes up on its own, and the brief says never on page load.

   WHAT IS KEPT (rules: F-144):
     pushTokens/<uid>_<hash of the token>  this phone, this person. Nobody
                                            reads it back: only the sending
                                            function uses it.
     notifyPrefs/<uid>                      the switches and quiet hours
   This phone remembers which record is its own (localStorage), so it can
   refresh it and remove it.

   THE SENDING is the main window's function, codebase "hub" (N-4):
     callParent   from the leader's screen        EGBCNotify.callParent()
     notifyTest   "send me a test"                EGBCNotify.test()
   and the timed and triggered messages (rota, bookings, maintenance jobs,
   urgent notices, checks running out), which no page sends.

   Firebase Cloud Messaging needs a messagingSenderId that egbc-auth.js
   does not carry, so this file starts its own small Firebase app with the
   same project and that number (N-0). Nothing else is touched.

   Needs: firebase-app/auth/firestore compat and firebase-messaging-compat,
   egbc-auth.js, egbc-notify-core.js.
   =================================================================== */

(function (global) {
  'use strict';

  /* The public half of the Web Push key (§23: safe in client code). */
  var VAPID = 'BFrIuBbcmauGFmFx0w_E5HsNdGolDZErMT5xpxCgdoRNDe9kJeugCHi3MHjlGaqe2uAVnWD9wR_GQQl75OuGIK4';
  var SENDER = '199442060489';
  var KEY = 'egbc.notify.v1';

  function db() { return EGBCAuth.db; }
  function uid() { return (EGBCAuth.user && EGBCAuth.user() || {}).uid || ''; }
  function nav() { return global.navigator || {}; }

  /* ---------------- this phone ---------------- */

  function ua() { return String(nav().userAgent || ''); }
  function isIphone() {
    /* An iPad says "Macintosh" now; a touch screen gives it away. */
    return /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && (nav().maxTouchPoints || 0) > 1);
  }
  function iosVersion() {
    var m = ua().match(/OS (\d+)[_.](\d+)/) || ua().match(/Version\/(\d+)\.(\d+)/);
    return m ? (+m[1]) + (+m[2]) / 100 : 0;
  }
  function standalone() {
    return nav().standalone === true || !!(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
  }
  function platform() {
    if (isIphone()) return 'iphone';
    if (/Android/.test(ua())) return 'android';
    if (/Windows|Macintosh|Linux|CrOS/.test(ua())) return 'desktop';
    return 'other';
  }
  /* What this phone can do, in one word:
       ok           the button works
       iphone-add   an iPhone in Safari: add to the Home Screen first
       iphone-old   an iPhone older than iOS 16.4: update it first
       blocked      notifications were blocked for this site in settings
       unsupported  this browser cannot have them at all */
  function device() {
    var D = DRIVER;
    if (isIphone()) {
      if (iosVersion() && iosVersion() < 16.4) return { why: 'iphone-old', platform: 'iphone', version: iosVersion() };
      if (!standalone()) return { why: 'iphone-add', platform: 'iphone', version: iosVersion() };
    }
    if (!D.supported()) return { why: 'unsupported', platform: platform() };
    if (D.permission() === 'denied') return { why: 'blocked', platform: platform() };
    return { why: 'ok', platform: platform() };
  }

  /* ---------------- the real browser, swappable for tests ----------------
     A test cannot hold a phone, so the browser test swaps this for a
     pretend one (EGBCNotify._driver) and checks everything around it. */
  var messaging = null;
  function fcm() {
    if (messaging) return messaging;
    var base = firebase.app('egbc').options;
    var app = firebase.apps.filter(function (a) { return a.name === 'egbc-notify'; })[0] ||
              firebase.initializeApp(Object.assign({}, base, { messagingSenderId: SENDER }), 'egbc-notify');
    messaging = firebase.messaging(app);
    return messaging;
  }
  var DRIVER = {
    supported: function () {
      return !!(global.Notification && nav().serviceWorker && global.PushManager && global.firebase && firebase.messaging);
    },
    permission: function () { return global.Notification ? Notification.permission : 'denied'; },
    ask: function () { return Notification.requestPermission(); },
    token: function () {
      /* The one service worker on the v2 scope (sw.js, the main window's). */
      return nav().serviceWorker.register('sw.js').then(function (reg) {
        return fcm().getToken({ vapidKey: VAPID, serviceWorkerRegistration: reg });
      });
    },
    forget: function () { return fcm().deleteToken().catch(function () { return false; }); }
  };

  function hash(s) {
    var c = global.crypto && global.crypto.subtle;
    if (!c) return Promise.resolve(String(s).replace(/[^A-Za-z0-9]/g, '').slice(-32));
    return c.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
      var b = ''; new Uint8Array(buf).forEach(function (x) { b += String.fromCharCode(x); });
      return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
    });
  }
  function mine() { try { return JSON.parse(global.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function keep(o) { try { global.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  /* Is it on, on this phone, for this person? */
  function isOn() { var m = mine(); return !!(m.uid === uid() && m.id && DRIVER.permission() === 'granted'); }

  /* Turn on: ask (the person has just pressed the button), get this phone's
     address from Firebase, and keep it under the person's name. */
  function turnOn() {
    var d = device();
    if (d.why !== 'ok') return Promise.reject(Object.assign(new Error(d.why), { code: d.why }));
    return Promise.resolve(DRIVER.ask()).then(function (perm) {
      if (perm !== 'granted') throw Object.assign(new Error('not allowed'), { code: perm === 'denied' ? 'blocked' : 'dismissed' });
      return DRIVER.token();
    }).then(function (token) {
      if (!token) throw Object.assign(new Error('no token'), { code: 'no-token' });
      return hash(token).then(function (h) {
        var id = uid() + '_' + h, now = firebase.firestore.FieldValue.serverTimestamp(), ref = db().collection('pushTokens').doc(id);
        var m = mine();
        /* The same phone again: refresh it; a new one: make it. */
        var write = (m.id === id && m.uid === uid())
          ? ref.update({ lastSeen: now, token: token }).catch(function () { return ref.set({ uid: uid(), token: token, platform: platform(), createdAt: now, lastSeen: now }); })
          : ref.set({ uid: uid(), token: token, platform: platform(), createdAt: now, lastSeen: now });
        return write.then(function () { keep({ uid: uid(), id: id }); return id; });
      });
    });
  }
  /* Turn off on this phone: Firebase forgets it, and so do we. */
  function turnOff() {
    var m = mine();
    return Promise.resolve(DRIVER.forget()).then(function () {
      return m.id && m.uid === uid() ? db().collection('pushTokens').doc(m.id).delete().catch(function () {}) : null;
    }).then(function () { keep({}); });
  }
  /* Opening the app now and then keeps the phone's record fresh, so the
     sending function can tell a phone still in use from an old one. */
  function touch() {
    var m = mine();
    if (!isOn()) return Promise.resolve(false);
    return db().collection('pushTokens').doc(m.id).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).then(function () { return true; }, function () { return false; });
  }

  /* ---------------- the switches ---------------- */

  function loadPrefs() {
    return db().collection('notifyPrefs').doc(uid()).get().then(function (s) { return EGBCNotifyCore.prefsOf(s.exists ? s.data() : null); },
      function () { return EGBCNotifyCore.prefsOf(null); });
  }
  function savePrefs(p) {
    var full = EGBCNotifyCore.prefsOf(p);
    return db().collection('notifyPrefs').doc(uid()).set({ types: full.types, quietFrom: full.quietFrom, quietTo: full.quietTo,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function () { return full; });
  }

  /* ---------------- sending (the main window's functions, N-4) ---------------- */

  /* What a function said, in words, or why it could not be reached. */
  function call(name, data) {
    return EGBCAuth.call(name, data).then(function (r) { return r || {}; }, function (e) {
      var code = String((e && e.code) || '');
      if (/not-found|unavailable|internal|unimplemented/.test(code) || /Failed to fetch|NetworkError/i.test(String(e && e.message)))
        return { error: 'not-live' };
      return { error: code || 'failed', message: (e && e.message) || '' };
    });
  }
  function test() { return call('notifyTest', {}); }
  /* A leader calls a parent to collect a child who is checked in. The
     function checks the leader may, finds the family's parents' phones
     (by the email on the registration form, and the second parent's),
     sends the group and the code only, and emails anyone with no phone.
     -> { phones, emailed, none } or { error } */
  function callParent(checkinId) { return call('callParent', { checkinId: checkinId }); }
  /* The words for the answer, for whoever pressed the button. */
  function callWords(r) {
    if (!r || r.error === 'not-live') return 'Phone calls start once the sending function is live. Use Show on screen, or ring them.';
    if (r.error === 'too-soon') return 'They were called less than two minutes ago.';
    if (r.error) return 'Could not call them: ' + (r.message || r.error) + '. Use Show on screen, or ring them.';
    var bits = [];
    if (r.phones) bits.push('sent to ' + r.phones + ' phone' + (r.phones === 1 ? '' : 's'));
    if (r.emailed) bits.push('emailed ' + r.emailed);
    return bits.length ? bits.join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) + '.' : 'Their parents have no phone set up. Use Show on screen, or ring them.';
  }

  global.EGBCNotify = {
    VAPID: VAPID, device: device, platform: platform, isIphone: isIphone, iosVersion: iosVersion, standalone: standalone,
    isOn: isOn, turnOn: turnOn, turnOff: turnOff, touch: touch, loadPrefs: loadPrefs, savePrefs: savePrefs,
    test: test, callParent: callParent, callWords: callWords,
    /* For the browser test only: a pretend phone. */
    _driver: function (d) { Object.keys(d || {}).forEach(function (k) { DRIVER[k] = d[k]; }); }
  };
})(window);
