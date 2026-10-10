/* ===================================================================
   EGBC — phone notifications: the service worker's part
   (events window; NEXT-BRIEF §23; FINDINGS-notify N-3, N-5; F-144)
   ===================================================================

   Loaded by sw.js with one line the main window adds (N-5):
     importScripts('egbc-notify-sw.js');
   so there is still ONE service worker on the v2 scope (the brief).

   It does two things and nothing else:
   - a message arrives: show it. The sending function sends "data only"
     messages ({ title, body, url, tag, silent }), so this file decides
     how they look, the same on Android and iPhone. An iPhone requires that
     every message is shown, and this always shows one.
   - it is tapped: open the hub at the page the message names (on the v2
     scope only), reusing a window that is already open.
   No Firebase here, no network, no data kept.
   =================================================================== */

(function () {
  'use strict';

  function payloadOf(event) {
    var d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
    /* FCM puts a data-only message under "data"; a plain push has it at the top. */
    return d.data || d.notification || d;
  }

  self.addEventListener('push', function (event) {
    var m = payloadOf(event);
    var title = String(m.title || 'EGBC Hub').slice(0, 80);
    var urgent = /^(callParent|urgent)/.test(String(m.tag || ''));
    event.waitUntil(self.registration.showNotification(title, {
      body: String(m.body || '').slice(0, 240),
      tag: String(m.tag || 'egbc'),
      /* A second call to collect the same child should buzz again. */
      renotify: urgent,
      requireInteraction: urgent,
      silent: m.silent === true || m.silent === 'true',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: String(m.url || 'app.html') }
    }));
  });

  self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var scope = self.registration.scope;
    var url;
    try { url = new URL((event.notification.data && event.notification.data.url) || 'app.html', scope).href; } catch (e) { url = scope; }
    /* Only ever somewhere in the hub. */
    if (url.indexOf(scope) !== 0) url = scope + 'app.html';
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(scope) === 0 && 'focus' in c) {
          return c.focus().then(function (w) { return w && w.navigate ? w.navigate(url) : w; });
        }
      }
      return self.clients.openWindow(url);
    }));
  });
})();
