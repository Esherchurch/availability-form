/* ===================================================================
   EGBC — the phone app's Running things: "Bookings" (office_bookings)
   (events window; APP-A1 §1, A-050 A2: "opens Room bookings with
   'Approve?' from your bookings data"; F-140)
   ===================================================================

   Mounted by EGBCAppEvents.mountAll(EGBCApp). What is waiting for the
   office, for the sites this person is the office of (admins: all;
   a site's bookings admins: theirs) - the rules decide what can be read:

     - room bookings asking, soonest first, each "Approve?"
       A free booking for one date is approved or declined right here,
       through the same EGBCBookings.approve/decline as Room bookings, and
       the person is emailed the same way. One with a price to confirm, or
       a series of dates, opens Room bookings: the price and the series
       belong on the full page.
     - hirers asking to cancel        -> Room bookings
     - rooms closed with people booked, not yet warned -> Room bookings
     - and a way to the full page.

   Needs (loaded before it): egbc-auth.js, egbc-events.js, egbc-church.js,
   egbc-email.js, egbc-ics.js, egbc-events-bookings.js, egbc-events-home.js,
   egbc-app-events.js.
   =================================================================== */

(function (global) {
  'use strict';

  var B = global.EGBCBookings;
  var H = null, STARTED = false, LOADED = false, FAILED = false, BUSY = false;
  var Q = null;
  var VIEW = { mode: 'list', key: '', note: '', err: '', done: '' };

  function esc(s) { return H ? H.esc(s) : String(s == null ? '' : s); }
  function redraw() { if (H) H.redraw(); }
  function req(key) { return Q ? Q.requests.filter(function (b) { return b.key === key; })[0] || null : null; }
  function when(b) { return B.when(b); }
  function whoAsked(b) { var r = b.requester || {}; return (r.name || b.memberName || 'Someone') + (r.org ? ' (' + r.org + ')' : ''); }

  function load() {
    return global.EGBCEventsHome.officeQueue().then(function (q) { Q = q; LOADED = true; FAILED = false; redraw(); })
      .catch(function () { FAILED = true; LOADED = true; redraw(); });
  }
  function start() { if (STARTED) return; STARTED = true; load(); }

  /* ---------------- drawing ---------------- */

  function act(oact, label, primary, icon) {
    return '<button class="btn' + (primary ? ' primary' : '') + '" data-oact="' + esc(oact) + '" style="min-height:48px">' + (icon && H ? H.ic(icon, 15) + ' ' : '') + label + '</button>';
  }
  function rowAct(oact, icon, title, sub, right) {
    return '<div data-oact="' + esc(oact) + '">' + H.row(icon, title, sub, right || null) + '</div>';
  }
  var STYLE = '<style>.of-list>[data-oact]+[data-oact]{border-top:1px solid var(--line)}.of-f{display:grid;gap:6px;margin-top:10px}' +
    '.of-f label{font-size:13px;font-weight:500;color:var(--ink)}.of-f input{min-height:48px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font:inherit;background:#fff;color:var(--ink);width:100%}' +
    '.of-err{color:#b0392c;font-size:13px;margin:6px 0 0}</style>';
  var FULL = 'open:bookings-admin.html';
  /* A row that opens Room bookings: the shell's own row, with its own act. */
  function link(icon, title, sub, right) { return global.EGBCApp.row(icon, title, sub, right || null, FULL, global.EGBCAppEvents.COLOURS.office); }

  function listView() {
    var out = H.head('Room bookings', Q.sites.length ? 'What is waiting for you' : '');
    if (!Q.sites.length) return out + '<div class="card" style="padding:14px" data-o="none"><p style="margin:0">Room bookings are looked after by each site\'s office. You are not on one.</p></div>';
    if (VIEW.done) out += '<div class="card" style="padding:14px" data-o="done"><p style="margin:0">' + esc(VIEW.done) + '</p></div>';
    var seen = {}, rows = [];
    Q.requests.forEach(function (b) {
      if (b.series) {
        if (seen[b.series.id]) return; seen[b.series.id] = 1;
        var n = Q.requests.filter(function (x) { return x.series && x.series.id === b.series.id; }).length;
        rows.push('<div data-o="series">' + link('repeat', (b.title || 'Booking') + ' · ' + b.room.name, B.seriesWords(b.series.rule, n) + ' from ' + when(b), '<span class="pill warn">Approve?</span>') + '</div>');
        return;
      }
      rows.push(rowAct('req:' + b.key, 'door-open', (b.title || 'Booking') + ' · ' + b.room.name, when(b) + ' · ' + whoAsked(b), '<span class="pill warn">Approve?</span>'));
    });
    out += rows.length ? '<div class="card list of-list" data-o="requests">' + rows.join('') + '</div>' : '<div class="card" style="padding:14px" data-o="requests"><p style="margin:0">Nothing is waiting.</p></div>';
    if (Q.cancelAsks.length) out += H.sec('Asking to cancel', '<div class="card list" data-o="cancels">' + Q.cancelAsks.map(function (b) {
      return link('calendar-x', (b.title || 'Booking') + ' · ' + whoAsked(b), when(b), '<span class="pill warn">Decide</span>');
    }).join('') + '</div>');
    if (Q.closures.length) out += H.sec('Rooms closed', '<div class="card list" data-o="closures">' + Q.closures.map(function (c) {
      return link('door-closed', c.roomName + ' closed ' + B.closureWords(c), c.booked + ' booked then: warn them', '<span class="pill warn">Warn</span>');
    }).join('') + '</div>');
    return out + '<div class="card list">' + link('external-link', 'Open Room bookings', 'The diary, prices, hirers and everything else') + '</div>';
  }

  function reqView() {
    var b = req(VIEW.key); if (!b) { VIEW.mode = 'list'; return listView(); }
    var r = b.requester || {};
    var facts = [when(b) + (b.setupMins || b.packdownMins ? ' (with ' + (b.setupMins || 0) + ' minutes to set up, ' + (b.packdownMins || 0) + ' to clear away)' : ''),
                 b.people + ' ' + (b.people === 1 ? 'person' : 'people'), whoAsked(b) + (r.email ? ' · ' + r.email : '') + (r.phone ? ' · ' + r.phone : '')];
    return '<div>' + act('list', 'Bookings', false, 'arrow-left') + '<p class="hello" style="margin-top:10px">' + esc(b.title || 'Booking') + '</p>' +
      '<p class="sub">' + esc(b.room.name) + '</p></div>' +
      '<div class="card" style="padding:14px" data-o="req">' + facts.map(function (f) { return '<p style="margin:0 0 4px">' + esc(f) + '</p>'; }).join('') +
      (b.notes ? '<p class="sub" style="margin:6px 0 0;white-space:pre-wrap">' + esc(b.notes) + '</p>' : '') + '</div>' +
      (b.onPhone
        ? '<div class="of-f"><label for="of-note">A note for them (needed to decline)</label><input id="of-note" maxlength="500" value="' + esc(VIEW.note) + '"></div>' +
          (VIEW.err ? '<p class="of-err" data-o="err">' + esc(VIEW.err) + '</p>' : '') +
          '<div class="actions" style="margin-top:10px">' + act('approve:' + b.key, 'Approve', true, 'check') + act('decline:' + b.key, 'Decline', false, 'x') + '</div>'
        : '<div class="card" style="padding:14px" data-o="full"><p style="margin:0 0 10px">This one has ' + esc(b.why) + ', so it is decided in Room bookings.</p>' +
          '<div class="card list">' + link('external-link', 'Open Room bookings', 'Decide it there') + '</div></div>');
  }

  function screen() {
    start();
    if (!LOADED) return STYLE + H.head('Room bookings', 'Loading…');
    if (FAILED) return STYLE + H.head('Room bookings') + '<div class="card" style="padding:14px"><p style="margin:0">Room bookings could not be loaded. Check the signal and try again.</p></div>';
    if (VIEW.mode === 'req') return STYLE + reqView();
    return STYLE + listView();
  }

  /* ---------------- actions (data-oact) ---------------- */

  function decide(key, yes) {
    if (BUSY) return;
    var b = req(key); if (!b) return;
    VIEW.err = '';
    if (!yes && !VIEW.note.trim()) { VIEW.err = 'Say why, in a few words: they will be told.'; redraw(); return; }
    BUSY = true;
    var room = b.room;
    /* A room closed that day is not approved from the phone: that is
       booking over a closure, which needs the office's reason on the page. */
    (yes ? B.closedOn([room], b.day) : Promise.resolve({})).then(function (shut) {
      if (shut[room.id]) { var e = new Error('The ' + room.name + ' is closed that day. Open Room bookings to book over it, with a reason.'); e.shown = true; throw e; }
      return yes ? B.approve(b, room, {}) : B.decline(b, VIEW.note.trim());
    }).then(function (x) {
      return B.email(x, room.name, yes ? 'approved' : 'declined', yes ? '' : VIEW.note.trim()).catch(function () { return null; });
    }).then(function () {
      BUSY = false;
      VIEW = { mode: 'list', key: '', note: '', err: '', done: (yes ? 'Approved: ' : 'Declined: ') + (b.title || 'the booking') + ', ' + when(b) + '. They have been emailed.' };
      return load();
    }).catch(function (e) {
      BUSY = false;
      VIEW.err = e.shown ? e.message : e.clash ? 'That time is no longer free. Open Room bookings to book over it, with a reason.' : 'Could not: ' + (e.message || e);
      redraw();
    });
  }
  function doAct(a) {
    if (a.indexOf('req:') === 0) { VIEW = { mode: 'req', key: a.slice(4), note: '', err: '', done: '' }; redraw(); return; }
    if (a === 'list') { VIEW.mode = 'list'; VIEW.done = ''; redraw(); return; }
    if (a.indexOf('approve:') === 0) { decide(a.slice(8), true); return; }
    if (a.indexOf('decline:') === 0) { decide(a.slice(8), false); return; }
  }

  global.EGBCAppOffice = {
    /* The shell (egbc-app.js) calls this once, through EGBCAppEvents.mountAll. */
    mount: function (App) {
      H = global.EGBCAppEvents.helpers(App, 'office');
      App.screen('office', 'bookings', screen);
      var doc = global.document;
      doc.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-oact]');
        if (b) { e.preventDefault(); doAct(b.getAttribute('data-oact')); }
      });
      doc.addEventListener('input', function (e) { if (e.target && e.target.id === 'of-note') VIEW.note = e.target.value; });
    }
  };
})(typeof window !== 'undefined' ? window : this);
