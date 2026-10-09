/* ===================================================================
   EGBC — the phone app's Maintenance space: "Rooms" (Close a room)
   (events window; APP-DESIGN-BRIEF §6, FINDINGS-events F-123, F-135,
   the shell contract in FINDINGS-app A-050)
   ===================================================================

   THE CONTRACT (A-050), as for Kids Church Today. The shell calls, once:

     EGBCAppMaint.register(V, { row, sec, next, ic, esc, redraw })

   which sets V.maint_rooms. EVERYTHING FROM THE DATABASE IS ESCAPED HERE.
   Buttons that do something carry data-mact and are handled here.

   Close a room (Martin, A-M2): pick the days and say why. The room
   disappears from Book a room on those days, the office is emailed, and
   the office warns anyone already booked (Room bookings). "Open it again"
   lifts it. The rules decide who may: the Maintenance team, and the
   office of the room's site (admins, its bookings admins).

   The same closing and lifting as maintenance.html, from the shared
   egbc-events-bookings.js, so the two can never disagree.

   Needs (loaded before it): egbc-auth.js, egbc-events.js, egbc-church.js,
   egbc-email.js (the office is emailed),
   egbc-events-bookings.js.
   =================================================================== */

(function (global) {
  'use strict';

  var B = global.EGBCBookings;
  var H = null, STARTED = false, LOADED = false, FAILED = false, BUSY = false;
  var D = { rooms: [], sites: [], office: [], closures: [], team: false, admin: false };
  var VIEW = { mode: 'list', roomId: '', closureId: '', from: '', to: '', why: '', err: '', done: '' };

  function db() { return EGBCAuth.db; }
  function me() { return (EGBCAuth.profile && EGBCAuth.profile()) || {}; }
  function esc(s) { return H ? H.esc(s) : String(s == null ? '' : s); }
  var redrawTimer = null;
  function redraw() { clearTimeout(redrawTimer); redrawTimer = setTimeout(function () { if (H && H.redraw) H.redraw(); }, 30); }
  function all(s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  function room(id) { return D.rooms.filter(function (r) { return r.id === id; })[0] || null; }
  function site(id) { return D.sites.filter(function (s) { return s.id === id; })[0] || {}; }
  function mayClose(r) { return D.team || D.admin || D.office.indexOf(r.siteId) >= 0; }
  function closuresOf(r) { return D.closures.filter(function (c) { return c.roomId === r.id; }); }

  function load() {
    var p = me();
    D.team = (p.teams || []).indexOf('Maintenance') >= 0;
    D.admin = !!(EGBCAuth.isAdmin && EGBCAuth.isAdmin());
    return Promise.all([db().collection('rooms').get(), db().collection('sites').get(),
                        db().collection('bookingSettings').get().catch(function () { return { docs: [] }; }),
                        db().collection('roomClosures').where('status', '==', 'on').get().catch(function () { return { docs: [] }; })]).then(function (r) {
      D.rooms = all(r[0]).filter(function (x) { return x.active !== false && x.kind !== 'online'; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      D.sites = all(r[1]).filter(function (s) { return s.active !== false; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      D.office = all(r[2]).filter(function (b) { return (b.bookingsAdmins || []).indexOf(p.memberId) >= 0; }).map(function (b) { return b.id; });
      D.closures = all(r[3]).filter(function (c) { return c.to >= B.today(); }).sort(function (a, b) { return a.from < b.from ? -1 : 1; });
      LOADED = true; FAILED = false; redraw();
    }).catch(function () { FAILED = true; LOADED = true; redraw(); });
  }
  function start() { if (STARTED) return; STARTED = true; load(); }

  /* ---------------- drawing ---------------- */

  function act(mact, label, primary, icon) {
    return '<button class="btn' + (primary ? ' primary' : '') + '" data-mact="' + esc(mact) + '" style="min-height:48px">' + (icon && H ? H.ic(icon, 15) + ' ' : '') + label + '</button>';
  }
  function rowAct(mact, icon, title, sub, right) {
    return '<div data-mact="' + esc(mact) + '">' + H.row(icon, esc(title), esc(sub), right || null, null, 'var(--maint)', 'var(--maint-tint)') + '</div>';
  }
  var STYLE = '<style>.mt-list>[data-mact]+[data-mact]{border-top:1px solid var(--line)}.mt-f{display:grid;gap:6px;margin-top:10px}' +
    '.mt-f label{font-size:13px;font-weight:500;color:var(--ink)}.mt-f input{min-height:48px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font:inherit;background:var(--surface,#fff);color:var(--ink);width:100%}' +
    '.mt-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mt-err{color:var(--danger,#b0392c);font-size:13px;margin:6px 0 0}</style>';

  function listView() {
    var rooms = D.rooms.filter(mayClose);
    var head = '<div><p class="hello">Close a room</p><p class="sub">Block a room for maintenance so nobody can book it</p></div>';
    if (!rooms.length) return head + '<div class="card" style="padding:14px" data-m="none"><p style="margin:0">Only the Maintenance team and the office close rooms.</p></div>';
    var multi = D.sites.length > 1;
    return head + (VIEW.done ? '<div class="card" style="padding:14px" data-m="done"><p style="margin:0">' + esc(VIEW.done) + '</p></div>' : '') +
      '<div class="card list mt-list" data-m="rooms">' + rooms.map(function (r) {
        var cs = closuresOf(r), s = site(r.siteId), name = r.name + (multi && s.name ? ' · ' + s.name : '');
        if (cs.length) return rowAct('closed:' + cs[0].id, 'door-closed', name, 'Closed ' + B.closureWords(cs[0]) + ' · ' + cs[0].reason + (cs.length > 1 ? ' (and ' + (cs.length - 1) + ' more)' : ''), '<span class="pill warn">Closed</span>');
        return rowAct('close:' + r.id, 'door-open', name, 'Open', '<span class="pill">Open</span>');
      }).join('') + '</div>' +
      '<p class="example">The office is told, and warns anyone already booked.</p>';
  }

  function closeView() {
    var r = room(VIEW.roomId); if (!r) { VIEW.mode = 'list'; return listView(); }
    var t = B.today();
    return '<div>' + act('list', 'Rooms', false, 'arrow-left') + '<p class="hello" style="margin-top:10px">Close the ' + esc(r.name) + '</p>' +
      '<p class="sub">Pick the days and say why. The ' + esc(r.name) + ' disappears from Book a room for those days.</p></div>' +
      '<div class="card" style="padding:14px" data-m="form"><div class="mt-f">' +
      '<div class="mt-two"><div><label for="mt-from">From</label><input type="date" id="mt-from" min="' + t + '" value="' + esc(VIEW.from || t) + '"></div>' +
      '<div><label for="mt-to">To (the last day)</label><input type="date" id="mt-to" min="' + t + '" value="' + esc(VIEW.to || VIEW.from || t) + '"></div></div>' +
      '<label for="mt-why">Why</label><input id="mt-why" maxlength="300" placeholder="e.g. Repainting" value="' + esc(VIEW.why) + '">' +
      (VIEW.err ? '<p class="mt-err" data-m="err">' + esc(VIEW.err) + '</p>' : '') + '</div>' +
      '<div class="actions" style="margin-top:12px">' + act('doclose', 'Close the ' + esc(r.name), true, 'door-closed') + act('list', 'Cancel') + '</div></div>';
  }

  function closedView() {
    var c = D.closures.filter(function (x) { return x.id === VIEW.closureId; })[0];
    if (!c) { VIEW.mode = 'list'; return listView(); }
    return '<div>' + act('list', 'Rooms', false, 'arrow-left') + '<p class="hello" style="margin-top:10px">' + esc(c.roomName) + ' is closed</p>' +
      '<p class="sub">' + esc(B.closureWords(c)) + '</p></div>' +
      '<div class="card" style="padding:14px" data-m="closure"><p style="margin:0 0 6px">' + esc(c.reason) + '</p><p class="sub" style="margin:0">Closed by ' + esc(c.byName || 'someone') + '.' +
      (c.warnedAt ? ' The office has warned the people booked.' : '') + '</p></div>' +
      '<div class="actions">' + act('lift:' + c.id, 'Open it again', true, 'door-open') + '</div>';
  }

  function screen() {
    start();
    if (!LOADED) return STYLE + '<div><p class="hello">Close a room</p></div><div class="card" style="padding:14px"><p class="sub" style="margin:0">Loading the rooms…</p></div>';
    if (FAILED) return STYLE + '<div><p class="hello">Close a room</p></div><div class="card" style="padding:14px"><p style="margin:0">The rooms could not be loaded. Check the signal and try again.</p></div>';
    if (VIEW.mode === 'close') return STYLE + closeView();
    if (VIEW.mode === 'closed') return STYLE + closedView();
    return STYLE + listView();
  }

  /* ---------------- actions (data-mact) ---------------- */

  function doClose() {
    if (BUSY) return;
    var r = room(VIEW.roomId); if (!r) return;
    VIEW.err = '';
    if (!VIEW.why.trim()) { VIEW.err = 'Say why the room is closed.'; redraw(); return; }
    if (!VIEW.from || VIEW.from < B.today()) { VIEW.err = 'The first day has gone.'; redraw(); return; }
    if (!VIEW.to || VIEW.to < VIEW.from) { VIEW.err = 'The last day is before the first.'; redraw(); return; }
    BUSY = true;
    B.closeRoom({ room: r, site: site(r.siteId), from: VIEW.from, to: VIEW.to, reason: VIEW.why }).then(function (c) {
      BUSY = false;
      VIEW = { mode: 'list', roomId: '', closureId: '', from: '', to: '', why: '', err: '', done: r.name + ' closed ' + B.closureWords(c) + '. The office has been told.' };
      return load();
    }).catch(function (e) { BUSY = false; VIEW.err = (e && e.code === 'permission-denied') ? 'You cannot close this room.' : (e.message || String(e)); redraw(); });
  }
  function doLift(id) {
    if (BUSY) return;
    var c = D.closures.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    BUSY = true;
    B.liftClosure(c, site(c.siteId)).then(function () {
      BUSY = false; VIEW = { mode: 'list', roomId: '', closureId: '', from: '', to: '', why: '', err: '', done: c.roomName + ' is open again. The office has been told.' };
      return load();
    }).catch(function (e) { BUSY = false; VIEW.done = 'Could not: ' + (e.message || e); VIEW.mode = 'list'; redraw(); });
  }
  function doAct(a) {
    if (a.indexOf('close:') === 0) { VIEW.mode = 'close'; VIEW.roomId = a.slice(6); VIEW.from = VIEW.to = B.today(); VIEW.why = VIEW.err = VIEW.done = ''; redraw(); return; }
    if (a.indexOf('closed:') === 0) { VIEW.mode = 'closed'; VIEW.closureId = a.slice(7); VIEW.done = ''; redraw(); return; }
    if (a === 'list') { VIEW.mode = 'list'; VIEW.done = ''; redraw(); return; }
    if (a === 'doclose') { doClose(); return; }
    if (a.indexOf('lift:') === 0) { doLift(a.slice(5)); return; }
  }

  global.EGBCAppMaint = {
    register: function (V, helpers) {
      H = helpers;
      V.maint_rooms = screen;
      var doc = global.document;
      doc.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-mact]');
        if (b) { e.preventDefault(); doAct(b.getAttribute('data-mact')); }
      });
      /* The form's values live here, not in the page, so a redraw keeps them. */
      doc.addEventListener('input', function (e) {
        var id = e.target && e.target.id;
        if (id === 'mt-from') { VIEW.from = e.target.value; if (!VIEW.to || VIEW.to < VIEW.from) VIEW.to = VIEW.from; var t = doc.getElementById('mt-to'); if (t && t.value < VIEW.from) t.value = VIEW.from; }
        if (id === 'mt-to') VIEW.to = e.target.value;
        if (id === 'mt-why') VIEW.why = e.target.value;
      });
    }
  };
})(typeof window !== 'undefined' ? window : this);
