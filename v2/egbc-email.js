/* ===================================================================
   EGBC — one way to send an email
   ===================================================================

   THROUGH THE HUB, NEVER CALLA (Martin, 21 Oct 2026: "v2 doesn't use
   Calla at all"). Every message goes to the hub's hubSend (EGBCAuth.
   sendEmail), which asks who may send to whom and sends through Church
   HQ's Resend. There is no send-service address in any v2 page.

     EGBCEmail.send({ to, subject, html, replyTo, attachments, source?, ref?, log? })
       -> { ok: true }  |  { ok: false, error: '...' }

   SOURCE: what kind of email this is, which decides who may send it and
   to whom (functions/hub-send.js). A page that does not say is known by
   its address: events-admin is 'event' (its ref is log.calEventId),
   bookings-admin, rooms, maintenance and the app are 'booking', forms,
   the children's register and check-in are 'form', groups-admin is
   'group', safeguarding is 'safeguarding'.

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

  var BY_PAGE = { 'events-admin': 'event', 'bookings-admin': 'booking', 'rooms': 'booking', 'maintenance': 'booking', 'app': 'booking',
    'forms-admin': 'form', 'kids-admin': 'form', 'kids-checkin': 'form', 'groups-admin': 'group', 'safeguarding': 'safeguarding' };
  function sourceHere() {
    var p = (location.pathname.split('/').pop() || '').replace(/\.html$/i, '').toLowerCase();
    return BY_PAGE[p] || '';
  }

  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);

  /* THE CHURCH'S OWN DETAILS ARE A SETTING, NOT SOMETHING THIS FILE KNOWS.
     churchSettings/details, read by egbc-church.js and edited on
     church-settings.html. This used to fall back to one church's name and
     office address, which is the wrong default for every other church that
     ever uses this. (F-067 / F-063, from the events window.)

     Nothing set yet means nothing is said. A blank footer is honest; a
     guess at whose church this is, is not. */
  function churchName() {
    try { return (window.EGBCChurch && EGBCChurch.name && EGBCChurch.name()) || ''; }
    catch (e) { return ''; }
  }
  function churchEmail() {
    try { return (window.EGBCChurch && EGBCChurch.email && EGBCChurch.email()) || ''; }
    catch (e) { return ''; }
  }
  function escText(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* Ask for the setting as soon as this file loads, so a send that happens
     later already has it. egbc-church.js starts its own load too; load()
     keeps one promise, so asking twice costs nothing. */
  try { if (window.EGBCChurch && EGBCChurch.load) EGBCChurch.load(); } catch (e) {}

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
        html: opts.html || ''
      };
      /* The reply address is a setting now, not something this file knows.
         A page that gives one is obeyed; otherwise it comes from Church
         details, and if that is empty the field is left off altogether.
         This has to work for any church, and no reply address is honest
         where somebody else's is not. (F-067, from the events window.) */
      var reply = opts.replyTo || churchEmail();
      if (reply) payload.replyTo = reply;
      if (opts.attachments && opts.attachments.length) payload.attachments = opts.attachments;

      payload.source = opts.source || sourceHere();
      var ref = opts.ref || (opts.log && opts.log.calEventId) || '';
      if (ref) payload.ref = ref;

      /* On localhost what was composed is also kept here, for the checks
         that read EGBCEmail.outbox(). The hub's emulator sends nothing
         either way; with no functions emulator running at all, the
         message counts as composed, as it always did. */
      if (LOCAL) {
        var stub = { ok: true, stubbed: true, at: new Date().toISOString(), payload: payload };
        outbox.push(stub);
        console.info('[EGBCEmail] localhost: not sent. ' + payload.subject + ' -> ' + to.join(', '));
      }
      if (!global.EGBCAuth || !global.EGBCAuth.sendEmail) {
        var none = LOCAL ? stub : { ok: false, error: 'The page cannot send email (no sign-in).' };
        return logSend(opts, none).then(function () { return none; });
      }
      return global.EGBCAuth.sendEmail(payload).then(function (res) {
        var unreachable = LOCAL && !res.ok && !res.code;
        var out = unreachable ? stub : res.ok ? { ok: true, stubbed: !!res.stubbed || LOCAL } : { ok: false, error: res.error || 'Send failed' };
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
        (footer || escText(churchName())) +
        '</td></tr></table></td></tr></table></body></html>';
    }
  };

  global.EGBCEmail = EGBCEmail;

})(window);
