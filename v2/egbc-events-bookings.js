/* ===================================================================
   EGBC — room bookings, the shared part (events window, Chunk 4 R2)
   ===================================================================

   rooms.html (members, in the hub), book.html (the public), and
   bookings-admin.html (the office) share these answers.

   THE ONE IDEA: A ROOM'S DAY IS 96 QUARTER-HOURS.
   roomDays/<room>_<YYYY-MM-DD>.slots is a list of 96 numbers, one per
   quarter-hour from midnight. 0 is free; 1 or more is taken. A day that has
   never been booked does not exist yet and counts as the room's standing
   weekly pattern - its rota services (rooms.rotaWeek) - so Sunday worship
   is taken before anybody books anything.

   A confirmed booking marks its quarter-hours, INCLUDING its setup and
   pack-down time, in the same write as the booking itself. The rules check
   that every one of them was free - so nobody, member or public, can book
   over a confirmed booking, a rota service or a buffer, whatever the page
   does. Two people booking the same time at the same moment: the second is
   refused, because the day changed under them.

   A booking that waits for approval is checked as free when it is made,
   and takes the time only when the office approves it. The office can book
   over something with a reason (the count goes to 2); nobody else can.

   Times are local (Europe/London) wall-clock minutes from midnight. A
   booking, with its buffers, stays within one day.
   =================================================================== */

(function (global) {
  'use strict';

  var SLOT = 15, N = 96;
  var DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function zeros() { var a = []; for (var i = 0; i < N; i++) a.push(0); return a; }
  function db() { return EGBCAuth.db; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---- times ---- */
  function toMin(hhmm) { var p = String(hhmm || '').split(':'); return p.length === 2 ? (+p[0]) * 60 + (+p[1]) : NaN; }
  function hhmm(min) { var h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  /* ISO weekday, as the rules work it out: 1 Monday ... 7 Sunday. */
  function dow(day) { var d = new Date(day + 'T12:00'); return ((d.getDay() + 6) % 7) + 1; }
  function addDays(day, n) {
    var d = new Date(day + 'T12:00'); d.setDate(d.getDate() + n);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /* Today on the clock of the computer in front of you (local, not UTC). */
  function today() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  /* The quarter-hours a booking takes: its own time plus setup before and
     pack-down after, rounded outwards. Null if it would run past midnight
     either way. The rules check exactly this arithmetic. */
  function slots(startMin, endMin, setup, pack) {
    var a = startMin - (setup || 0), b = endMin + (pack || 0);
    if (a < 0 || b > N * SLOT || !(endMin > startMin)) return null;
    return { from: Math.floor(a / SLOT), to: Math.ceil(b / SLOT) };
  }

  /* ---- rota services as a standing weekly pattern ----
     site.rotaBusy: [{ type, roomIds, days: [1..7], from: 'HH:MM', to: 'HH:MM' }]
     -> for one room: { '1': [96], ..., '7': [96] }, the quarter-hours its
     services take on each weekday. */
  function rotaWeek(rotaBusy, roomId) {
    var w = {};
    for (var d = 1; d <= 7; d++) w[String(d)] = zeros();
    (rotaBusy || []).forEach(function (r) {
      if ((r.roomIds || []).indexOf(roomId) < 0) return;
      var s = slots(toMin(r.from), toMin(r.to), 0, 0);
      if (!s) return;
      (r.days || []).forEach(function (day) {
        for (var i = s.from; i < s.to; i++) w[String(day)][i] = 1;
      });
    });
    return w;
  }

  function base(room, day) {
    var w = (room && room.rotaWeek) || {};
    var b = w[String(dow(day))];
    return b && b.length === N ? b.slice() : zeros();
  }

  /* What is on a room's day, read as anyone may: the day if it exists,
     the standing pattern if not. { roomId: [96] } */
  function loadDays(rooms, day) {
    return Promise.all(rooms.map(function (r) {
      return db().collection('roomDays').doc(r.id + '_' + day).get()
        .then(function (s) { return s.exists ? s.data().slots : base(r, day); })
        .catch(function () { return base(r, day); });
    })).then(function (l) { var out = {}; rooms.forEach(function (r, i) { out[r.id] = l[i]; }); return out; });
  }

  function free(daySlots, s) {
    for (var i = s.from; i < s.to; i++) if (daySlots[i]) return false;
    return true;
  }

  /* What took a quarter-hour, in words a member may see: their own
     booking, a church service, or just "booked". */
  function serviceAt(site, roomId, day, slot) {
    var hit = (site && site.rotaBusy || []).filter(function (r) {
      var s = slots(toMin(r.from), toMin(r.to), 0, 0);
      return s && (r.roomIds || []).indexOf(roomId) >= 0 && (r.days || []).indexOf(dow(day)) >= 0 && slot >= s.from && slot < s.to;
    })[0];
    return hit ? hit.type : '';
  }

  /* ---- members: confirmed straight away, or waiting? ----
     A room says 'instant', 'approval' or 'site' (the default: whatever its
     site says). A site says 'instant' (the default) or 'approval'. The
     public always wait, whatever either says. */
  function memberMode(room, site) {
    var m = (room && room.memberBookings) || 'site';
    if (m === 'instant' || m === 'approval') return m;
    return (site && site.memberBookings) === 'approval' ? 'approval' : 'instant';
  }

  /* ---- making a booking ----
     o: { kind: 'member'|'hire'|'office', room, site, day, start, end, setup,
          pack, title, people, layout, av, refreshments, resources, notes,
          requester: { name, email, phone, org }, groupId }
     One booking per room; several rooms in one request are several
     bookings in one batch, each checked by the rules on its own. */
  function prepare(o) {
    var s = slots(toMin(o.start), toMin(o.end), +o.setup || 0, +o.pack || 0);
    if (!s) throw new Error('A booking, with its setting up and clearing away, has to fit within one day.');
    var u = (EGBCAuth.user && EGBCAuth.user()) || {}, p = (EGBCAuth.profile && EGBCAuth.profile()) || {};
    var status = o.kind === 'hire' ? 'requested'
      : o.kind === 'member' ? (memberMode(o.room, o.site) === 'instant' ? 'confirmed' : 'requested')
      : 'confirmed';
    var d = {
      kind: o.kind === 'office' ? 'office' : o.kind, status: status, siteId: o.room.siteId, roomId: o.room.id, groupId: o.groupId || '',
      day: o.day, startMin: toMin(o.start), endMin: toMin(o.end), startLocal: o.day + 'T' + o.start, endLocal: o.day + 'T' + o.end,
      setupMins: +o.setup || 0, packdownMins: +o.pack || 0, slotFrom: s.from, slotTo: s.to,
      title: String(o.title || '').slice(0, 120), people: Math.max(1, parseInt(o.people, 10) || 1), layout: o.layout || '',
      av: o.av || { needed: false, what: '' }, refreshments: o.refreshments || { needed: false, items: [], dietary: {}, notes: '' },
      resources: o.resources || [], notes: String(o.notes || '').slice(0, 2000),
      requester: o.requester || { name: p.name || '', email: (p.email || u.email || ''), phone: '', org: '' },
      memberUid: o.kind === 'hire' ? '' : (u.uid || ''), memberName: o.kind === 'hire' ? '' : (p.name || ''),
      createdAt: new Date().toISOString()
    };
    return d;
  }

  /* Write the bookings, and for each confirmed one mark its quarter-hours
     on the room's day in the same batch. `days` is what loadDays read. */
  function write(list, days) {
    var batch = db().batch(), out = [];
    list.forEach(function (x) {
      var key = 'bk_' + EGBCEvents.key(28);
      batch.set(db().collection('bookings').doc(key), x.booking);
      if (x.booking.status === 'confirmed') {
        var sl = days[x.booking.roomId].slice();
        for (var i = x.booking.slotFrom; i < x.booking.slotTo; i++) sl[i] = 1;
        batch.set(db().collection('roomDays').doc(x.booking.roomId + '_' + x.booking.day),
          { slots: sl, lastBooking: key, roomId: x.booking.roomId, day: x.booking.day, siteId: x.booking.siteId });
      }
      out.push(Object.assign({ key: key }, x.booking));
    });
    return batch.commit().then(function () { return out; });
  }

  /* ---- the office: approve, decline, cancel, move ----
     The office may take time that is not free, but only with a reason;
     the page asks for one. Counts go up and down, so cancelling one of two
     overlapping bookings frees nothing the other still holds. */
  function mark(day, room, from, to, by) {
    var ref = db().collection('roomDays').doc(room.id + '_' + day);
    return db().runTransaction(function (tx) {
      return tx.get(ref).then(function (s) {
        var sl = s.exists ? s.data().slots.slice() : base(room, day);
        for (var i = from; i < to; i++) sl[i] = Math.max(0, (sl[i] || 0) + by);
        tx.set(ref, { slots: sl, lastBooking: '', roomId: room.id, day: day, siteId: room.siteId });
      });
    });
  }

  /* The office's decisions. Each is one transaction: the room's day and
     the booking change together or not at all. o.override with o.note
     lets the office take time that is not free; nobody else can. */
  function dayRef(roomId, day) { return db().collection('roomDays').doc(roomId + '_' + day); }
  function who() { var p = (EGBCAuth.profile && EGBCAuth.profile()) || {}, u = (EGBCAuth.user && EGBCAuth.user()) || {}; return { uid: u.uid || '', name: p.name || '' }; }
  function dayDoc(room, day, sl) { return { slots: sl, lastBooking: '', roomId: room.id, day: day, siteId: room.siteId }; }
  function Clash(msg) { var e = new Error(msg || 'That time is not free.'); e.clash = true; return e; }

  function approve(b, room, o) {
    o = o || {};
    var bref = db().collection('bookings').doc(b.key), ref = dayRef(room.id, b.day), w = who(), over = false;
    return db().runTransaction(function (tx) {
      return tx.get(ref).then(function (s) {
        var sl = s.exists ? s.data().slots.slice() : base(room, b.day);
        over = !free(sl, { from: b.slotFrom, to: b.slotTo });
        if (over && !o.override) throw Clash('That time is no longer free.');
        for (var i = b.slotFrom; i < b.slotTo; i++) sl[i] = (sl[i] || 0) + 1;
        tx.set(ref, dayDoc(room, b.day, sl));
        tx.update(bref, { status: 'confirmed', decidedBy: w.uid, decidedByName: w.name, decidedAt: new Date().toISOString(),
                          decisionNote: String(o.note || '').slice(0, 500), override: over });
      });
    }).then(function () { return Object.assign({}, b, { status: 'confirmed', override: over }); });
  }

  function decline(b, note) {
    var w = who();
    return db().collection('bookings').doc(b.key).update({ status: 'declined', decidedBy: w.uid, decidedByName: w.name,
      decidedAt: new Date().toISOString(), decisionNote: String(note || '').slice(0, 500) })
      .then(function () { return Object.assign({}, b, { status: 'declined' }); });
  }

  /* A cancelled booking gives its time back - one count, so anything else
     still holding those quarter-hours keeps them. */
  function cancel(b, room, note) {
    var bref = db().collection('bookings').doc(b.key), ref = dayRef(room.id, b.day), w = who();
    return db().runTransaction(function (tx) {
      return tx.get(ref).then(function (s) {
        if (b.status === 'confirmed') {
          var sl = s.exists ? s.data().slots.slice() : base(room, b.day);
          for (var i = b.slotFrom; i < b.slotTo; i++) sl[i] = Math.max(0, (sl[i] || 0) - 1);
          tx.set(ref, dayDoc(room, b.day, sl));
        }
        tx.update(bref, { status: 'cancelled', cancelledAt: new Date().toISOString(), decidedBy: w.uid, decidedByName: w.name,
                          decisionNote: String(note || '').slice(0, 500) });
      });
    }).then(function () { return Object.assign({}, b, { status: 'cancelled' }); });
  }

  /* Move to another time, day or room (at the same site). A confirmed
     booking gives back its old time and takes the new; a waiting one is
     only checked. */
  function move(b, from, to, n, o) {
    o = o || {};
    var s2 = slots(toMin(n.start), toMin(n.end), b.setupMins || 0, b.packdownMins || 0);
    if (!s2) return Promise.reject(new Error('With its setting up and clearing away, it has to fit within one day.'));
    var bref = db().collection('bookings').doc(b.key), oldRef = dayRef(from.id, b.day), newRef = dayRef(to.id, n.day);
    var same = from.id === to.id && b.day === n.day, over = false, w = who();
    return db().runTransaction(function (tx) {
      return Promise.all([tx.get(oldRef), same ? null : tx.get(newRef)]).then(function (r) {
        var oldSl = r[0].exists ? r[0].data().slots.slice() : base(from, b.day), i;
        var newSl = same ? oldSl : (r[1].exists ? r[1].data().slots.slice() : base(to, n.day));
        if (b.status === 'confirmed') for (i = b.slotFrom; i < b.slotTo; i++) oldSl[i] = Math.max(0, (oldSl[i] || 0) - 1);
        over = !free(newSl, s2);
        if (over && !o.override) throw Clash('The new time is not free.');
        if (b.status === 'confirmed') {
          for (i = s2.from; i < s2.to; i++) newSl[i] = (newSl[i] || 0) + 1;
          tx.set(oldRef, dayDoc(from, b.day, oldSl));
          if (!same) tx.set(newRef, dayDoc(to, n.day, newSl));
        }
        tx.update(bref, { roomId: to.id, siteId: to.siteId, day: n.day, startMin: toMin(n.start), endMin: toMin(n.end),
          startLocal: n.day + 'T' + n.start, endLocal: n.day + 'T' + n.end, slotFrom: s2.from, slotTo: s2.to,
          movedAt: new Date().toISOString(), decidedBy: w.uid, decidedByName: w.name,
          decisionNote: String(o.note || '').slice(0, 500), override: over });
      });
    }).then(function () {
      return Object.assign({}, b, { roomId: to.id, siteId: to.siteId, day: n.day, startMin: toMin(n.start), endMin: toMin(n.end),
        startLocal: n.day + 'T' + n.start, endLocal: n.day + 'T' + n.end, slotFrom: s2.from, slotTo: s2.to, override: over });
    });
  }

  /* Kit is a warning, not a rule: the rules cannot add up quantities
     across bookings. others: the site's confirmed bookings that day. */
  function kitClash(b, others, kit) {
    var out = [];
    (b.resources || []).forEach(function (r) {
      var k = (kit || []).filter(function (x) { return x.id === r.id; })[0];
      if (!k || k.unlimited) return;
      var used = (others || []).filter(function (o) {
        return o.key !== b.key && o.status === 'confirmed' && o.day === b.day && o.slotFrom < b.slotTo && b.slotFrom < o.slotTo;
      }).reduce(function (n, o) {
        return n + (o.resources || []).filter(function (x) { return x.id === r.id; }).reduce(function (m, x) { return m + (+x.qty || 1); }, 0);
      }, 0);
      var have = +k.quantity || +k.qty || 1;
      if (used + (+r.qty || 1) > have) out.push((r.name || k.name) + ': ' + used + ' of ' + have + ' already booked then');
    });
    return out;
  }

  /* Catering needs notice, in working days (Monday to Friday). */
  function workingDays(fromDay, toDay) {
    var n = 0, d = fromDay;
    while (d < toDay) { d = addDays(d, 1); if (dow(d) <= 5) n++; }
    return n;
  }
  function lateItems(items, menus, day) {
    var wd = workingDays(today(), day);
    return (items || []).filter(function (it) {
      var m = (menus || []).filter(function (x) { return x.id === it.id; })[0];
      return m && (m.noticeDays || 0) > wd;
    }).map(function (it) { return it.name; });
  }

  /* ---- emails ----
     Through egbc-email.js, by way of EGBCChurch (the church's name and
     reply address from the setting). Confirmed bookings carry the
     calendar file. */
  /* ---- drawing a day ----
     One bar per room or day: a cell per quarter-hour from 07:00 to 23:00.
     Free is white, taken is grey, a service is gold, your own is teal, the
     time being asked for is outlined. Free cells carry data-slot so a page
     can let people click a time. */
  var BAR_CSS =
    '.bk-row{display:flex;align-items:center;gap:8px;margin:4px 0}.bk-lab{width:120px;flex:none;font-size:13px;color:var(--ink,#111827);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.bk-bar{flex:1;min-width:0;display:flex;height:28px;border:1px solid var(--line,#e5e7eb);border-radius:6px;overflow:hidden;background:#fff}' +
    '.bk-c{flex:1;min-width:0;border-left:1px solid #f1f3f4}.bk-c.h{border-left-color:#d7dcdc}.bk-c[data-slot]{cursor:pointer}.bk-c[data-slot]:hover{background:#eef5f4}' +
    '.bk-c.t{background:#cfd4d8}.bk-c.s{background:#e9d6ad}.bk-c.m{background:#3d6263}.bk-c.p{box-shadow:inset 0 0 0 2px #b07d2e}' +
    '.bk-ax{display:flex;margin-left:128px;font-size:11px;color:var(--muted,#6b7280)}.bk-ax span{flex:1;min-width:0}' +
    '.bk-key{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted,#6b7280);margin-top:8px}.bk-key i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:4px;border:1px solid #d1d5db}' +
    '@media (max-width:520px){.bk-lab{width:72px}.bk-ax{margin-left:80px}}';
  var FROM = 28, TO = 92;
  function css() {
    if (typeof document === 'undefined' || document.getElementById('bk-css')) return;
    var st = document.createElement('style'); st.id = 'bk-css'; st.textContent = BAR_CSS; document.head.appendChild(st);
  }
  /* o: { label, mine: {slot: true}, service: fn(slot) -> name, pick: {from, to}, click: true, attrs } */
  function bar(sl, o) {
    css(); o = o || {};
    var cells = '';
    for (var i = FROM; i < TO; i++) {
      var svc = sl[i] && o.service ? o.service(i) : '', mine = o.mine && o.mine[i];
      var cls = 'bk-c' + (i % 4 === 0 ? ' h' : '') + (mine ? ' m' : sl[i] ? (svc ? ' s' : ' t') : '') +
        (o.pick && i >= o.pick.from && i < o.pick.to ? ' p' : '');
      var tip = hhmm(i * SLOT) + ' ' + (mine ? 'your booking' : sl[i] ? (svc || 'booked') : 'free');
      cells += '<span class="' + cls + '" title="' + esc(tip) + '"' + (!sl[i] && o.click ? ' data-slot="' + i + '"' : '') + '></span>';
    }
    return '<div class="bk-row"' + (o.attrs || '') + '>' + (o.label != null ? '<span class="bk-lab" title="' + esc(o.label) + '">' + esc(o.label) + '</span>' : '') +
      '<div class="bk-bar">' + cells + '</div></div>';
  }
  function axis() {
    css();
    var s = '';
    for (var h = FROM / 4; h < TO / 4; h += 2) s += '<span>' + (h < 10 ? '0' : '') + h + ':00</span>';
    return '<div class="bk-ax">' + s + '</div>';
  }
  function key(mine) {
    return '<div class="bk-key"><span><i style="background:#fff"></i>Free</span><span><i style="background:#cfd4d8"></i>Booked</span>' +
      '<span><i style="background:#e9d6ad"></i>Service</span>' + (mine ? '<span><i style="background:#3d6263"></i>Yours</span>' : '') + '</div>';
  }

  /* The office hears about every request that waits for it. */
  function tellOffice(b, roomName) {
    var to = (typeof EGBCChurch !== 'undefined' && EGBCChurch.email()) || '';
    if (!to) return Promise.resolve({ ok: false, error: 'no enquiry email set' });
    var r = b.requester || {};
    var body = '<p>' + esc(roomName) + ', ' + esc(when(b)) + (b.title ? ': <strong>' + esc(b.title) + '</strong>' : '') + '.</p>' +
      '<p>From ' + esc(r.name || b.memberName || '') + (r.org ? ' (' + esc(r.org) + ')' : '') + (b.kind === 'hire' ? ', a hirer' : ', a member') + '.</p>' +
      '<p>Open <strong>Room bookings</strong> in the hub to approve or decline it.</p>';
    return EGBCChurch.send({ to: [to], subject: 'Booking request: ' + roomName + ', ' + when(b), html: EGBCChurch.wrap('A booking is waiting for you', body) });
  }
  function ref(b) { return String(b.key || '').slice(3, 11).toUpperCase(); }

  function when(b) { return EGBCEvents.fmtDate(b.day + 'T12:00') + ', ' + hhmm(b.startMin) + ' to ' + hhmm(b.endMin); }
  function ics(b, roomName) {
    return EGBCICS.build({ uid: 'egbc-booking-' + b.key + '@' + location.hostname, title: (b.title || 'Room booking') + ' (' + roomName + ')',
      description: b.notes || '', location: roomName, start: b.startLocal, end: b.endLocal, allDay: false, status: b.status === 'cancelled' ? 'cancelled' : 'confirmed' });
  }
  function email(b, roomName, what, note) {
    var to = (b.requester && b.requester.email) || '';
    if (!to) return Promise.resolve({ ok: false, error: 'no address' });
    var head = { confirmed: 'Your room is booked', waiting: 'Your booking is waiting for approval', approved: 'Your booking is confirmed',
                 declined: 'Your booking could not go ahead', cancelled: 'Your booking has been cancelled', moved: 'Your booking has moved' }[what];
    var body = '<p>' + esc(roomName) + ', ' + esc(when(b)) + (b.title ? ': <strong>' + esc(b.title) + '</strong>' : '') + '.</p>' +
      (b.setupMins || b.packdownMins ? '<p style="color:#6b7280;font-size:13px">Including ' + (b.setupMins || 0) + ' minutes to set up and ' + (b.packdownMins || 0) + ' to clear away.</p>' : '') +
      (what === 'waiting' ? '<p>Someone at the church will look at it and let you know. Nothing is confirmed until then.</p>' : '') +
      (what === 'declined' && note ? '<p>' + esc(note) + '</p>' : '') +
      (what === 'confirmed' || what === 'approved' || what === 'moved' ? '<p style="color:#6b7280;font-size:13px">The calendar file attached adds it to your diary.</p>' : '') +
      (what === 'moved' && note ? '<p>' + esc(note) + '</p>' : '') + (what === 'cancelled' && note ? '<p>' + esc(note) + '</p>' : '') +
      '<p style="color:#6b7280;font-size:13px">Reference ' + esc(ref(b)) + '</p>';
    var mail = { to: [to], subject: head + ': ' + roomName + ', ' + when(b), html: EGBCChurch.wrap(head, body) };
    if (what === 'confirmed' || what === 'approved' || what === 'moved') {
      mail.attachments = [{ filename: 'booking.ics', content: EGBCICS.base64(ics(b, roomName)), type: 'text/calendar' }];
    }
    return EGBCChurch.send(mail);
  }

  var api = { SLOT: SLOT, N: N, DAYS: DAYS, zeros: zeros, toMin: toMin, hhmm: hhmm, dow: dow, addDays: addDays, today: today,
              slots: slots, rotaWeek: rotaWeek, base: base, loadDays: loadDays, free: free, serviceAt: serviceAt,
              memberMode: memberMode, prepare: prepare, write: write, mark: mark, email: email, when: when,
              approve: approve, decline: decline, cancel: cancel, move: move, kitClash: kitClash,
              workingDays: workingDays, lateItems: lateItems, tellOffice: tellOffice, ref: ref,
              bar: bar, axis: axis, key: key, FROM: FROM, TO: TO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCBookings = api;

})(typeof window !== 'undefined' ? window : this);
