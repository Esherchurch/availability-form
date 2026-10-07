/* ===================================================================
   EGBC — one way to send an email
   ===================================================================

   Seven files held the same hard-coded function URL when this was
   written. This is the one place it lives from now on; nothing new
   should paste it again.

     EGBCEmail.send({ to, subject, html, replyTo, attachments })
       -> { ok: true }  |  { ok: false, error: '...' }

   `to` is an array of addresses. `attachments` is what the function
   already expects: [{ filename, content: <base64>, type }].

   TWO THINGS THIS DOES THAT A RAW fetch() DID NOT:

   1. ON LOCALHOST IT SENDS NOTHING. Development runs against the
      emulator with made-up people, but the email function is the real
      one in the cloud - there is no emulator for it. A test that drives
      a sign-up form would have put real post in the air. Here it goes
      into EGBCEmail.outbox() instead, which is also what the tests read
      to prove the right message was composed.

   2. It records what was sent. Pass `log: { calEventId: '...' }` and a
      line goes into commsLog, so an event's page can show what went out
      and to how many people. Only an admin may write that collection, so
      a guest's own confirmation simply does not log - the rules decide,
      not the page.
   =================================================================== */

(function (global) {
  'use strict';

  var FUNCTION_URL = 'https://sendemail-irkwdhx3xq-uc.a.run.app';

  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  /* Shared with egbc-nosend.js, which stops the pages that still call the
     service directly. One outbox, so a test reads one list whichever
     route the page took. */
  window.__egbcOutbox = window.__egbcOutbox || [];
  var outbox = window.__egbcOutbox;

  function logSend(opts, result) {
    var l = opts.log;
    if (!l || !l.calEventId) return Promise.resolve();
    try {
      if (typeof EGBCAuth === 'undefined' || !EGBCAuth.profile || !EGBCAuth.profile()) return Promise.resolve();
      var db = EGBCAuth.db;
      return db.collection('commsLog').add({
        calEventId: l.calEventId,
        kind: l.kind || 'email',
        subject: opts.subject || '',
        to: (opts.to || []).length,
        failed: result.ok ? 0 : (opts.to || []).length,
        error: result.ok ? '' : String(result.error || '').slice(0, 300),
        stubbed: !!result.stubbed,
        by: (EGBCAuth.profile() || {}).name || '',
        at: new Date().toISOString()
      }).catch(function () { /* the rules may say no; that is their job */ });
    } catch (e) { return Promise.resolve(); }
  }

  var EGBCEmail = {

    url: FUNCTION_URL,
    isLocal: LOCAL,

    /* Everything composed during this page's life, newest last. */
    outbox: function () { return outbox.slice(); },
    clearOutbox: function () { outbox.length = 0; },

    send: function (opts) {
      opts = opts || {};
      var to = (opts.to || []).filter(Boolean);
      if (!to.length) return Promise.resolve({ ok: false, error: 'No address to send to' });

      var payload = {
        to: to,
        subject: opts.subject || '',
        html: opts.html || '',
        replyTo: opts.replyTo || 'office@esherchurch.org'
      };
      if (opts.attachments && opts.attachments.length) payload.attachments = opts.attachments;

      if (LOCAL) {
        var stub = { ok: true, stubbed: true, at: new Date().toISOString(), payload: payload };
        outbox.push(stub);
        console.info('[EGBCEmail] localhost: not sent. ' + payload.subject + ' -> ' + to.join(', '));
        return logSend(opts, stub).then(function () { return stub; });
      }

      return fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); })
        .then(function (res) {
          var out = res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || 'Send failed' };
          return logSend(opts, out).then(function () { return out; });
        })
        .catch(function (e) {
          var out = { ok: false, error: e.message || String(e) };
          return logSend(opts, out).then(function () { return out; });
        });
    },

    /* The same shell round every message, so one change of wording does
       not have to be made in four pages. */
    wrap: function (title, bodyHtml, footer) {
      return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f7f7">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f7;padding:24px 12px">' +
        '<tr><td align="center">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e7eb;border-radius:14px">' +
        '<tr><td style="padding:24px 24px 0">' +
        '<div style="font:600 18px/1.3 Inter,Segoe UI,Arial,sans-serif;color:#111827">' + title + '</div>' +
        '</td></tr>' +
        '<tr><td style="padding:16px 24px 24px;font:400 14px/1.6 Inter,Segoe UI,Arial,sans-serif;color:#374151">' +
        bodyHtml +
        '</td></tr>' +
        '<tr><td style="padding:0 24px 24px;font:400 12px/1.6 Inter,Segoe UI,Arial,sans-serif;color:#6b7280;' +
        'border-top:1px solid #e5e7eb;padding-top:16px">' +
        (footer || 'Esher Green Baptist Church') +
        '</td></tr></table></td></tr></table></body></html>';
    }
  };

  global.EGBCEmail = EGBCEmail;

})(window);
