/* ===================================================================
   EGBC — the phone app's "What's on" tab (Me and my family), with an
   event's own view and "Book a room"
   (events window; APP-DESIGN-BRIEF §3 and §6, FINDINGS-events F-122,
   F-136, the shell contract in FINDINGS-app A-050)
   ===================================================================

   THE CONTRACT (A-050), as for Listen. The shell calls, once:

     EGBCAppWhatson.mount(EGBCApp)        (EGBCAppEvents.mountAll does it)

   (now EGBCAppWhatson.mount(EGBCApp), the real shell; F-140). The shell's
   helpers escape text themselves; this file escapes only its own HTML.
   Buttons that do something carry data-wact and are handled here;
   navigation between spaces stays the shell's data-act.

   WHAT IT SHOWS is exactly what What's on shows the same person: the
   events they can come to ("Who can come", F-114), from the same query
   (EGBCEvents.listUpcoming). Members-only items stay hidden from those
   who can't come - the rules see to that, not this file.

   One screen, three views kept here (the shell redraws from scratch):
     list   - quick filters (This month, then the kinds of event in the
              list), the events, and Book a room
     event  - one event: when, where, the words; "You + 2 booked" (opens
              your booking to change or cancel) or Sign up; Add to my
              calendar
     rooms  - Book a room: each room members can book, and how it is
              today ("Free until 6pm", "Booked until 8pm, then free");
              a room closed today (Close a room) is not there at all

   Share on WhatsApp uses the main window's egbc-share.js (SHARE-NOTIFY-
   BRIEF: one shared helper, never a second), through EGBCEvents.share,
   which fetches it the first time if the app has not loaded it.

   An event's words are the editor's HTML. They are shown here as plain
   text (EGBCEvents.plainText), never as HTML and never as "<p>".

   Needs (loaded before it): egbc-auth.js, egbc-events.js, egbc-ics.js,
   egbc-events-bookings.js, egbc-events-home.js.
   =================================================================== */

(function (global) {
  'use strict';

  var E = global.EGBCEvents, B = global.EGBCBookings;
  var H = null, STARTED = false, LOADED = false, FAILED = false;
  var D = { events: [], look: { sites: {}, rooms: {}, venues: {} }, mine: {}, rooms: [], sites: {}, today: {}, closed: {}, roomsLoaded: false };
  var VIEW = { mode: 'list', filter: '', eventId: '' };
  /* Pages live beside this file, wherever the shell itself is. */
  var BASE = (function () {
    var s = global.document && global.document.currentScript;
    return s && s.src ? s.src.replace(/[^/]*$/, '') : '';
  })();

  function db() { return EGBCAuth.db; }
  function esc(s) { return H ? H.esc(s) : String(s == null ? '' : s); }
  var redrawTimer = null;
  function redraw() { clearTimeout(redrawTimer); redrawTimer = setTimeout(function () { if (H && H.redraw) H.redraw(); }, 30); }
  function all(s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  function ev(id) { return D.events.filter(function (e) { return e.id === id; })[0] || null; }
  var ICON = { service: 'church', social: 'utensils', kids: 'sparkles', youth: 'zap', prayer: 'hand-heart', music: 'music', community: 'users-round', other: 'calendar-days' };
  function catName(id) { var c = E.CATEGORIES.filter(function (x) { return x.id === id; })[0]; return id === 'kids' ? 'For families' : c ? c.name : 'Other'; }
  function monthOf(e) { return String(e.startLocal || '').slice(0, 7); }
  function thisMonth() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  /* Minutes since midnight, now. Tests set EGBCAppWhatson.clock to a fixed time. */
  function clock() { if (global.EGBCAppWhatson && global.EGBCAppWhatson.clock) return global.EGBCAppWhatson.clock(); var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  function onlyFor(e) { var v = e.visibility; return v === 'churchMembers' ? 'Church members only' : v === 'team' ? (e.teams || []).join(', ') + ' only' : ''; }

  /* ---------------- loading ---------------- */

  function start() {
    if (STARTED) return; STARTED = true;
    Promise.all([
      E.listUpcoming({ limit: 200 }),
      E.lookups().catch(function () { return { sites: {}, rooms: {}, venues: {} }; }),
      global.EGBCEventsHome ? EGBCEventsHome.myEvents().catch(function () { return []; }) : Promise.resolve([])
    ]).then(function (r) {
      D.events = r[0].filter(function (e) { return e.status !== 'pending'; });
      D.look = r[1];
      D.mine = {}; r[2].forEach(function (m) { D.mine[m.id] = m; });
      LOADED = true; redraw();
    }).catch(function () { FAILED = true; LOADED = true; redraw(); });
  }
  function loadRooms() {
    if (D.roomsLoaded) return;
    D.roomsLoaded = 'loading';
    var today = B.today();
    Promise.all([db().collection('rooms').get(), db().collection('sites').get()]).then(function (r) {
      D.rooms = all(r[0]).filter(function (x) { return x.active !== false && x.kind !== 'online' && x.bookableByMembers !== false; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      D.sites = {}; all(r[1]).forEach(function (s) { D.sites[s.id] = s; });
      return Promise.all([B.loadDays(D.rooms, today), B.closedOn(D.rooms, today)]);
    }).then(function (r) {
      D.today = r[0]; D.closed = r[1]; D.roomsLoaded = true; redraw();
    }).catch(function () { D.roomsLoaded = 'failed'; redraw(); });
  }

  /* ---------------- drawing ---------------- */

  function act(wact, label, primary, icon) {
    return '<button class="btn' + (primary ? ' primary' : '') + '" data-wact="' + esc(wact) + '" style="min-height:44px">' + (icon && H ? H.ic(icon, 15) + ' ' : '') + label + '</button>';
  }
  function rowAct(wact, icon, title, sub, right) {
    return '<div data-wact="' + esc(wact) + '">' + H.row(icon, title, sub, right || null) + '</div>';
  }
  var STYLE = '<style>.wo-list>[data-wact]+[data-wact]{border-top:1px solid var(--line)}.wo-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}' +
    '.wo-chips .btn{flex:none}.wo-chips .btn[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:#fff}.wo-words{white-space:pre-wrap;margin:0}</style>';

  function pillFor(e) {
    if (D.mine[e.id]) return '<span class="pill">' + (D.mine[e.id].waiting ? 'Waiting list' : 'Booked') + '</span>';
    if (e.visibility === 'churchMembers') return '<span class="pill warn">Members</span>';
    if (e.signupOn && e.status !== 'cancelled') return '<span class="pill n">Sign up</span>';
    if (e.status === 'cancelled') return '<span class="pill warn">Cancelled</span>';
    return '';
  }
  function shown() {
    return D.events.filter(function (e) {
      if (VIEW.filter === 'month') return monthOf(e) === thisMonth();
      if (VIEW.filter) return (e.category || 'other') === VIEW.filter;
      return true;
    });
  }

  function listView() {
    var used = {}; D.events.forEach(function (e) { used[e.category || 'other'] = 1; });
    var chips = [['month', 'This month']].concat(E.CATEGORIES.filter(function (c) { return used[c.id]; }).map(function (c) { return [c.id, catName(c.id)]; }));
    var list = shown();
    return '<div class="wo-chips" data-w="chips">' + chips.map(function (c) {
        return '<button class="btn" data-wact="filter:' + esc(c[0]) + '" aria-pressed="' + (VIEW.filter === c[0]) + '" style="min-height:44px">' + (c[0] === 'month' && H ? H.ic('calendar-days', 15) + ' ' : '') + esc(c[1]) + '</button>';
      }).join('') + '</div>' +
      (list.length ? '<div class="card list wo-list" data-w="events">' + list.map(function (e) {
        var where = E.locationText(e, D.look), only = onlyFor(e);
        return rowAct('event:' + e.id, ICON[e.category || 'other'] || 'calendar-days', e.title || 'Untitled event', [E.fmtWhen(e), where, only].filter(Boolean).join(' · '), pillFor(e));
      }).join('') + '</div>'
        : '<div class="card" style="padding:14px" data-w="none"><p style="margin:0">' + (VIEW.filter ? 'Nothing here. Try another one above.' : 'Nothing coming up yet.') + '</p></div>') +
      H.sec('Rooms', '<div class="card list wo-list">' + rowAct('rooms', 'door-open', 'Book a room', 'See what is free and book it. No need to ask the office.') + '</div>') +
      '<p class="example">Calendar: add your rota and events to your phone\'s calendar from Me.</p>';
  }

  function eventView() {
    var e = ev(VIEW.eventId);
    if (!e) { VIEW.mode = 'list'; return listView(); }
    var m = D.mine[e.id], where = E.locationText(e, D.look), only = onlyFor(e);
    var rows = [];
    if (m) rows.push(rowAct('open:' + m.manageUrl, 'users', m.waiting ? 'You are on the waiting list' : (m.places > 1 ? 'You + ' + (m.places - 1) + ' booked' : 'You are booked'), 'Change numbers or cancel'));
    else if (e.signupOn && e.status !== 'cancelled') rows.push(rowAct('open:' + BASE + 'signup.html?event=' + encodeURIComponent(e.id), 'user-plus', 'Sign up', e.price ? 'Book your place' : 'Say you are coming'));
    if (e.status !== 'cancelled') rows.push(rowAct('ics', 'calendar-plus', 'Add to my calendar', 'Google, iPhone or Outlook'));
    rows.push(rowAct('share', 'share-2', 'Share on WhatsApp', e.status === 'cancelled' ? 'Let people know' : 'Invite a friend'));
    rows.push(rowAct('open:' + BASE + 'signup.html?event=' + encodeURIComponent(e.id), 'external-link', 'The full page', 'Everything about it'));
    return '<div>' + act('list', 'What\'s on', false, 'arrow-left') + '<p class="hello" style="margin-top:10px">' + esc(e.title || 'Untitled event') + '</p>' +
      '<p class="sub">' + esc([E.fmtWhen(e), where].filter(Boolean).join(' · ')) + '</p></div>' +
      (e.status === 'cancelled' ? '<div class="card" style="padding:14px"><p style="margin:0"><b>This has been cancelled.</b></p></div>' : '') +
      (only ? '<p class="sub" style="margin:0">' + esc(only) + '</p>' : '') +
      (E.plainText(e.description) ? '<div class="card" style="padding:14px" data-w="words"><p class="wo-words">' + esc(E.plainText(e.description)) + '</p></div>' : '') +
      '<div class="card list wo-list" data-w="acts">' + rows.join('') + '</div>';
  }

  function roomsView() {
    loadRooms();
    var head = '<div>' + act('list', 'What\'s on', false, 'arrow-left') + '<p class="hello" style="margin-top:10px">Book a room</p>' +
      '<p class="sub">How each room is today. Tap one to see the week and book it.</p></div>';
    if (D.roomsLoaded !== true) return head + '<div class="card" style="padding:14px"><p class="sub" style="margin:0">' + (D.roomsLoaded === 'failed' ? 'The rooms could not be loaded.' : 'Loading the rooms…') + '</p></div>';
    var mins = clock();
    var open = D.rooms.filter(function (r) { return !D.closed[r.id]; });
    if (!open.length) return head + '<div class="card" style="padding:14px"><p style="margin:0">No room can be booked today.</p></div>';
    var multi = Object.keys(D.sites).length > 1;
    return head + '<div class="card list wo-list" data-w="rooms">' + open.map(function (r) {
      var f = B.freeWords(D.today[r.id] || B.zeros(), mins), s = D.sites[r.siteId];
      return rowAct('open:' + BASE + 'rooms.html', 'door-open', r.name + (multi && s ? ' · ' + s.name : ''), f.words,
        f.free === null ? '<span></span>' : '<span class="pill' + (f.free ? '' : ' warn') + '">' + (f.free ? 'Free' : 'Busy') + '</span>');
    }).join('') + '</div>' +
      '<p class="example">Some rooms confirm a booking straight away; others wait for the office.</p>';
  }

  function screen() {
    start();
    var head = '<div><p class="hello">What\'s on</p><p class="sub">Everything you can come to</p></div>';
    if (VIEW.mode === 'rooms') return STYLE + roomsView();
    if (!LOADED) return STYLE + head + '<div class="card" style="padding:14px"><p class="sub" style="margin:0">Loading what\'s on…</p></div>';
    if (FAILED) return STYLE + head + '<div class="card" style="padding:14px"><p style="margin:0">What\'s on could not be loaded. Check the signal and try again.</p></div>';
    if (VIEW.mode === 'event') return STYLE + eventView();
    return STYLE + head + listView();
  }

  /* ---------------- actions (data-wact) ---------------- */

  function doAct(a) {
    if (a.indexOf('filter:') === 0) { var f = a.slice(7); VIEW.filter = VIEW.filter === f ? '' : f; redraw(); return; }
    if (a.indexOf('event:') === 0) { VIEW.mode = 'event'; VIEW.eventId = a.slice(6); redraw(); return; }
    if (a === 'list') { VIEW.mode = 'list'; redraw(); return; }
    if (a === 'rooms') { VIEW.mode = 'rooms'; redraw(); return; }
    if (a.indexOf('open:') === 0) { global.location.href = a.slice(5); return; }
    if (a === 'share') {
      var se = ev(VIEW.eventId); if (!se) return;
      E.share(E.shareItem(se, E.locationText(se, D.look))).catch(function (err) {
        if (H && H.toast) H.toast(err.message || 'Sharing could not be opened.'); else global.alert(err.message || 'Sharing could not be opened.');
      });
      return;
    }
    if (a === 'ics') {
      var e = ev(VIEW.eventId); if (!e || !global.EGBCICS) return;
      EGBCICS.download('egbc-' + (e.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40), E.icsFor(e, E.locationText(e, D.look)));
    }
  }

  global.EGBCAppWhatson = {
    /* The shell (egbc-app.js) calls this once: EGBCAppWhatson.mount(EGBCApp). */
    mount: function (App) {
      H = global.EGBCAppEvents.helpers(App, 'me');
      App.screen('me', 'whatson', screen);
      global.document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-wact]');
        if (b) { e.preventDefault(); doAct(b.getAttribute('data-wact')); }
      });
    }
  };
})(typeof window !== 'undefined' ? window : this);
