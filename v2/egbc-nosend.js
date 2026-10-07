/* ===================================================================
   EGBC — nothing leaves the machine while you are testing
   ===================================================================

   On localhost, a request to the email service is answered here instead
   of going out. It lands in the same outbox `EGBCEmail.outbox()` reads,
   and the caller gets back `{ ok: true, stubbed: true }`, which is what
   it would have got from a successful send.

   WHY THIS EXISTS. `egbc-email.js` already sends nothing on localhost,
   but nine places still hold the service's address and call it with a
   plain `fetch` - CoreTeamApp twice, Planner three times, EmailBuilder2,
   SundayServicePlanner, youthapp2, youthserviceplanner and hub-app.js.
   A check that drives one of those pages reaches the LIVE service. That
   nearly happened: a measurement pressed "Send all rotas" and only the
   rota's own sign-off failsafe stopped it. The next person to press it
   on a signed-off term would have emailed the whole church from a test.

   Moving those pages onto `egbc-email.js` properly is Step T. Until then
   this is the floor, and it does not care whether a page has been moved.

   ON THE LIVE SITE THIS DOES NOTHING. The whole thing is inside a check
   for localhost, so on github.io `fetch` is left exactly as it was.

   Load it FIRST, before any page script:

     <script src="egbc-nosend.js"></script>

   Modular pages get it through `egbc-db.js`, which imports it for the
   side effect.
   =================================================================== */

(function () {
  'use strict';

  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  if (!LOCAL) return;
  if (window.__egbcNoSend) return;       /* once per page, whoever loads it */

  /* Both addresses of the same service, and Resend itself in case a page
     ever talks to it directly. Matched on the URL as a string, so a
     relative path or a Request object both work. */
  var BLOCKED = [
    'sendemail-irkwdhx3xq-uc.a.run.app',
    'cloudfunctions.net/sendemail',
    'api.resend.com'
  ];

  /* One outbox, shared with egbc-email.js, so a test reads the same list
     whichever route the page took. */
  window.__egbcOutbox = window.__egbcOutbox || [];

  function urlOf(input) {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input.url === 'string') return input.url;   /* Request */
      return String(input);
    } catch (e) { return ''; }
  }

  function isBlocked(url) {
    var u = String(url || '').toLowerCase();
    for (var i = 0; i < BLOCKED.length; i++) if (u.indexOf(BLOCKED[i]) !== -1) return true;
    return false;
  }

  function record(url, body) {
    var payload = null;
    try { payload = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { payload = body; }
    var entry = { ok: true, stubbed: true, blocked: true, at: new Date().toISOString(), url: url, payload: payload };
    window.__egbcOutbox.push(entry);
    var to = (payload && payload.to) || [];
    console.info('[EGBC] localhost: a send was stopped here. ' +
      ((payload && payload.subject) || '(no subject)') + ' -> ' +
      (Array.isArray(to) ? to.length : 1) + ' recipient(s)');
    return entry;
  }

  /* ---- fetch ---- */
  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = urlOf(input);
    if (isBlocked(url)) {
      var body = (init && init.body) || (input && input.body) || null;
      var entry = record(url, body);
      return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 'stubbed-' + entry.at, stubbed: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }));
    }
    return realFetch.apply(this, arguments);
  };

  /* ---- XMLHttpRequest ----
     No page uses it for sending today. It is wrapped anyway, because the
     point of this file is that there is no route out, not that there is
     no route out through the one function somebody checked. */
  var RealXHR = window.XMLHttpRequest;
  if (RealXHR) {
    var open = RealXHR.prototype.open;
    var sendM = RealXHR.prototype.send;
    RealXHR.prototype.open = function (method, url) {
      this.__egbcUrl = url;
      return open.apply(this, arguments);
    };
    RealXHR.prototype.send = function (body) {
      if (isBlocked(this.__egbcUrl)) {
        var entry = record(this.__egbcUrl, body);
        var self = this;
        setTimeout(function () {
          Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(self, 'status', { value: 200, configurable: true });
          Object.defineProperty(self, 'responseText', {
            value: JSON.stringify({ ok: true, id: 'stubbed-' + entry.at, stubbed: true }), configurable: true });
          if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
          if (typeof self.onload === 'function') self.onload();
        }, 0);
        return;
      }
      return sendM.apply(this, arguments);
    };
  }

  window.__egbcNoSend = {
    blocked: BLOCKED.slice(),
    outbox: function () { return window.__egbcOutbox.slice(); },
    clear: function () { window.__egbcOutbox.length = 0; }
  };

  console.info('[EGBC] localhost: no email can leave this machine (egbc-nosend.js)');
})();
