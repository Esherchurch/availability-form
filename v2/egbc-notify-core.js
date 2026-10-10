/* ===================================================================
   EGBC — phone notifications: what each one says, and who gets what
   (events window; NEXT-BRIEF §23; FINDINGS-notify N-2, N-4; F-144)
   ===================================================================

   ONE FILE, TWO USERS, as with the sermons feed: the Notifications page
   uses it for the switches and the words, and the main window's sending
   function (codebase "hub", N-4) uses it to decide, for each person,
   whether a message goes to their phones, to their email instead, or
   nowhere. A plain function of its arguments: no Firestore, no network.

   THE MESSAGES AT LAUNCH (Martin, §23), each one a person can turn off:
     callParent  a leader calls me to collect my child - THE CODE AND THE
                 GROUP ONLY, never the child's name (N-2)
     rota        the day before I serve
     booking     my room booking is confirmed, approved or declined
     maintJob    a new maintenance job (the Maintenance team)
     urgent      an urgent notice from the office
     checks      my DBS check or training is running out (§24)

   EMAIL IS THE FALLBACK: someone with no phone set up gets the message by
   email instead - except where the page already emails them (a booking),
   so nobody gets the same news twice.

   QUIET HOURS (21:30 to 07:30 unless the person changes them): messages
   still arrive, silently - except calling a parent and an urgent notice,
   which are never quiet. Nothing is held back or lost overnight.

   Works in the browser (window.EGBCNotifyCore) and in Node
   (module.exports), the same file.
   =================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EGBCNotifyCore = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var TYPES = {
    callParent: { label: 'A leader calls me to collect my child', help: 'On a Sunday, or at a club. Only the group and your collection code are shown.', on: true, loud: true, email: true },
    rota:       { label: 'The day before I serve', help: 'What you are doing, and when to arrive.', on: true, loud: false, email: true },
    booking:    { label: 'My room bookings', help: 'Confirmed, approved or declined. You are emailed about these anyway.', on: true, loud: false, email: false },
    maintJob:   { label: 'A new maintenance job', help: 'For the Maintenance team.', on: true, loud: false, email: true },
    urgent:     { label: 'Urgent notices from the office', help: 'Rare: a service moved, the building closed.', on: true, loud: true, email: true },
    checks:     { label: 'My DBS check or training is running out', help: 'For anyone who helps with under-18s.', on: true, loud: false, email: true },
    test:       { label: 'A test message', help: '', on: true, loud: true, email: false, hidden: true }
  };
  var QUIET = { from: '21:30', to: '07:30' };

  /* A person's switches, with the defaults filled in. */
  function prefsOf(saved) {
    saved = saved || {};
    var types = {};
    Object.keys(TYPES).forEach(function (k) { types[k] = saved.types && typeof saved.types[k] === 'boolean' ? saved.types[k] : TYPES[k].on; });
    return { types: types, quietFrom: hhmmOk(saved.quietFrom) ? saved.quietFrom : QUIET.from, quietTo: hhmmOk(saved.quietTo) ? saved.quietTo : QUIET.to };
  }
  function hhmmOk(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')); }
  function mins(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }

  /* Minutes past midnight in the UK, whatever the server's clock says. */
  function londonMinutes(now) {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now || new Date());
    var h = 0, m = 0;
    parts.forEach(function (p) { if (p.type === 'hour') h = +p.value % 24; if (p.type === 'minute') m = +p.value; });
    return h * 60 + m;
  }
  /* Within the quiet hours? The window may run past midnight. */
  function quiet(prefs, now) {
    var p = prefsOf(prefs), t = londonMinutes(now), a = mins(p.quietFrom), b = mins(p.quietTo);
    if (a === b) return false;
    return a < b ? (t >= a && t < b) : (t >= a || t < b);
  }

  /* ---------------- what each message says ---------------- */

  function cut(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* Each builder takes ONLY what may be shown on a locked phone. */
  var SAYS = {
    /* N-2: the code and the group. The builder is never given a name. */
    callParent: function (d) { return { title: 'Please come to ' + cut(d.group || 'your child\'s group', 40), body: 'Collection code ' + cut(d.code, 12), url: d.url || 'app.html' }; },
    rota: function (d) {
      return { title: 'You are serving tomorrow', body: cut([(d.roles || []).join(', '), d.arrive ? 'arrive ' + d.arrive : '', d.place].filter(Boolean).join(' · '), 160),
               url: d.url || 'app.html' };
    },
    booking: function (d) {
      var t = { confirmed: 'Your room is booked', approved: 'Your booking is confirmed', declined: 'Your booking could not go ahead', cancelled: 'Your booking has been cancelled', moved: 'Your booking has moved' }[d.status] || 'Your booking';
      return { title: t, body: cut([d.room, d.when].filter(Boolean).join(', '), 160), url: d.url || 'rooms.html' };
    },
    maintJob: function (d) { return { title: 'New maintenance job', body: cut((d.where ? d.where + ': ' : '') + (d.what || ''), 160), url: d.url || 'maintenance.html' }; },
    urgent: function (d) { return { title: 'Urgent: ' + cut(d.title, 60), body: cut(d.text, 180), url: d.url || 'app.html' }; },
    checks: function (d) {
      var what = d.what === 'dbs' ? 'DBS check' : 'safeguarding training';
      return { title: 'Your ' + what + (d.state === 'out' ? ' has run out' : ' runs out soon'), body: (d.state === 'out' ? 'It ran out on ' : 'It runs out on ') + d.ends + '. The safeguarding lead can renew it.',
               url: d.url || 'safeguarding.html' };
    },
    test: function () { return { title: 'Notifications are on', body: 'This is a test from the church hub.', url: 'notifications.html' }; }
  };
  function message(type, data) {
    var b = SAYS[type]; if (!b) throw new Error('Unknown notification type: ' + type);
    var m = b(data || {});
    m.type = type; m.tag = type + (data && data.tag ? ':' + data.tag : '');
    return m;
  }

  /* ---------------- who gets what ---------------- */

  /* o: { uids, type, prefs: { uid: saved prefs }, tokens: { uid: [token] },
          emails: { uid: address }, now: Date }
     -> { push: [{ uid, tokens, silent }], email: [{ uid, email }],
          skipped: [{ uid, why }] } */
  function plan(o) {
    var T = TYPES[o.type]; if (!T) throw new Error('Unknown notification type: ' + o.type);
    var out = { push: [], email: [], skipped: [] }, seen = {};
    (o.uids || []).forEach(function (uid) {
      if (!uid || seen[uid]) return; seen[uid] = 1;
      var saved = (o.prefs || {})[uid], p = prefsOf(saved);
      if (!p.types[o.type]) { out.skipped.push({ uid: uid, why: 'turned off' }); return; }
      var toks = ((o.tokens || {})[uid] || []).filter(Boolean);
      if (toks.length) { out.push.push({ uid: uid, tokens: toks, silent: !T.loud && quiet(saved, o.now) }); return; }
      var em = (o.emails || {})[uid];
      if (T.email && em) { out.email.push({ uid: uid, email: em }); return; }
      out.skipped.push({ uid: uid, why: T.email ? 'no phone and no email' : 'no phone (emailed by the page already)' });
    });
    return out;
  }

  return { TYPES: TYPES, QUIET: QUIET, prefsOf: prefsOf, quiet: quiet, londonMinutes: londonMinutes, message: message, plan: plan };
});
