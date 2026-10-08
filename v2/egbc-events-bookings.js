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

  /* ---- repeating bookings (R3) ----
     rule: 'week', 'fortnight' or 'month' (the same weekday in the same
     week of the month: the second Tuesday). The first date is always in.
     At most MAX dates. A month with no fifth Tuesday is skipped. */
  var MAX = 52;
  var RULES = { week: 'Every week', fortnight: 'Every two weeks', month: 'Every month, on the same weekday' };
  function nthOfMonth(day) { return Math.ceil(+day.slice(8, 10) / 7); }
  function repeatDays(day, rule, until) {
    if (!rule || !RULES[rule] || !until || until < day) return [day];
    var out = [day];
    if (rule === 'week' || rule === 'fortnight') {
      var step = rule === 'week' ? 7 : 14, d = addDays(day, step);
      while (d <= until && out.length < MAX) { out.push(d); d = addDays(d, step); }
      return out;
    }
    var n = nthOfMonth(day), w = dow(day), y = +day.slice(0, 4), m = +day.slice(5, 7);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    for (var k = 1; k < 120 && out.length < MAX; k++) {
      var mm = m + k, yy = y + Math.floor((mm - 1) / 12); mm = ((mm - 1) % 12) + 1;
      var first = yy + '-' + p(mm) + '-01', off = (w - dow(first) + 7) % 7, dd = 1 + off + (n - 1) * 7;
      var cand = yy + '-' + p(mm) + '-' + p(dd);
      if (dd > 28 && addDays(yy + '-' + p(mm) + '-28', dd - 28).slice(5, 7) !== p(mm)) continue;
      if (cand > until) break;
      out.push(cand);
    }
    return out;
  }
  function seriesWords(rule, n) { return (RULES[rule] || '') + (n ? ', ' + n + ' date' + (n === 1 ? '' : 's') : ''); }

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
      /* A hire and an event's booking belong to nobody's "Your bookings". */
      memberUid: o.kind === 'hire' || o.kind === 'event' ? '' : (u.uid || ''), memberName: o.kind === 'hire' || o.kind === 'event' ? '' : (p.name || ''),
      createdAt: new Date().toISOString()
    };
    /* A repeating booking: one booking per date, all carrying the same
       series id, which date of how many it is, and the rule. */
    if (o.series) d.series = { id: o.series.id, rule: o.series.rule, n: o.series.n, of: o.series.of };
    if (o.calEventId) d.calEventId = o.calEventId;
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
        var sl = (days[x.booking.roomId + '_' + x.booking.day] || days[x.booking.roomId]).slice();
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

  /* ---- members cancel their own (R3) ----
     A waiting booking just changes to cancelled. A confirmed one gives its
     quarter-hours back in the same transaction; the rules let a member do
     that only for their own booking, only taking 1 back to 0, and only if
     nothing else holds those quarter-hours too (the office booking over it
     with a reason). Then the page says to ask the office. */
  function canSelfCancel(b, daySlots) {
    if (b.status === 'requested') return true;
    if (b.status !== 'confirmed') return false;
    for (var i = b.slotFrom; i < b.slotTo; i++) if (daySlots[i] !== 1) return false;
    return true;
  }
  function cancelOwn(b) {
    var u = (EGBCAuth.user && EGBCAuth.user()) || {}, bref = db().collection('bookings').doc(b.key), ref = dayRef(b.roomId, b.day);
    var patch = { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: u.uid || '' };
    if (b.status === 'requested') return bref.update(patch).then(function () { return Object.assign({}, b, patch); });
    return db().runTransaction(function (tx) {
      return tx.get(ref).then(function (s) {
        var v = s.exists ? s.data() : null;
        if (!v || !canSelfCancel(b, v.slots)) { var e = new Error('This booking overlaps one the office made, so the office needs to cancel it.'); e.shared = true; throw e; }
        var sl = v.slots.slice();
        for (var i = b.slotFrom; i < b.slotTo; i++) sl[i] = 0;
        tx.set(ref, { slots: sl, lastBooking: v.lastBooking || '', roomId: v.roomId, day: v.day, siteId: v.siteId, lastCancel: b.key });
        tx.update(bref, patch);
      });
    }).then(function () { return Object.assign({}, b, patch); });
  }

  /* ---- the office books (events, F-072a) ----
     One transaction: the room's day counts up by one over the booking's
     quarter-hours, and the booking is written. Over something already there
     only with o.override and a reason (o.note), which is kept on the
     booking; the rules insist on both. */
  function officeBook(d, room, o) {
    o = o || {};
    var key = 'bk_' + EGBCEvents.key(28), bref = db().collection('bookings').doc(key), ref = dayRef(room.id, d.day), over = false, w = who(), out;
    return db().runTransaction(function (tx) {
      return tx.get(ref).then(function (s) {
        var sl = s.exists ? s.data().slots.slice() : base(room, d.day);
        over = !free(sl, { from: d.slotFrom, to: d.slotTo });
        if (over && !(o.override && o.note)) throw Clash(room.name + ' is not free then.');
        for (var i = d.slotFrom; i < d.slotTo; i++) sl[i] = (sl[i] || 0) + 1;
        tx.set(ref, dayDoc(room, d.day, sl));
        out = Object.assign({}, d, over ? { override: true, decisionNote: String(o.note).slice(0, 500), decidedBy: w.uid, decidedByName: w.name, decidedAt: new Date().toISOString() } : {});
        tx.set(bref, out);
      });
    }).then(function () { return Object.assign({ key: key }, out); });
  }

  /* An event in rooms, as bookings: one per room per day. An event over
     several days takes each day from its start, or to its end; an all-day
     event takes the whole day. Setting up comes before the first day,
     clearing away after the last. At most 14 days. */
  function eventPieces(ev) {
    var loc = ev.location || {};
    if (loc.kind !== 'room' || !(loc.roomIds || []).length || !ev.startLocal || ev.status === 'cancelled') return [];
    var d0 = ev.startLocal.slice(0, 10), d1 = (ev.endLocal || ev.startLocal).slice(0, 10);
    if (d1 < d0) d1 = d0;
    var days = [], d = d0;
    while (d <= d1 && days.length < 14) { days.push(d); d = addDays(d, 1); }
    var t0 = ev.allDay ? '00:00' : ev.startLocal.slice(11, 16), t1 = ev.allDay || !ev.endLocal ? '' : ev.endLocal.slice(11, 16);
    var out = [];
    days.forEach(function (day, i) {
      var first = i === 0, last = i === days.length - 1;
      var start = first ? t0 : '00:00';
      var end = last ? (t1 || (ev.allDay ? '24:00' : hhmm(Math.min(toMin(t0) + 60, 1440)))) : '24:00';
      var setup = first ? (+loc.setupMins || 0) : 0, pack = last ? (+loc.packMins || 0) : 0;
      if (toMin(start) - setup < 0) setup = toMin(start);
      if (toMin(end) + pack > 1440) pack = 1440 - toMin(end);
      loc.roomIds.forEach(function (roomId) { out.push({ roomId: roomId, day: day, start: start, end: end, setup: setup, pack: pack }); });
    });
    return out;
  }

  function eventBookings(calEventId) {
    return db().collection('bookings').where('calEventId', '==', calEventId).get().then(function (s) {
      return s.docs.map(function (x) { return Object.assign({ key: x.id }, x.data()); })
        .filter(function (b) { return b.status === 'confirmed' || b.status === 'requested'; });
    });
  }

  /* What stands in the way of an event's rooms, piece by piece: the
     services and bookings already there, leaving out the event's own
     bookings (it is moving out of those). [{ piece, what: [words] }] */
  function eventClashes(calEventId, pieces, roomsById, site) {
    return (calEventId ? eventBookings(calEventId) : Promise.resolve([])).then(function (own) {
      return Promise.all(pieces.map(function (p) {
        var room = roomsById[p.roomId], s = slots(toMin(p.start), toMin(p.end), p.setup, p.pack);
        if (!room || !s) return null;
        return loadDays([room], p.day).then(function (days) {
          var sl = days[room.id].slice();
          own.forEach(function (b) { if (b.status === 'confirmed' && b.roomId === p.roomId && b.day === p.day) for (var i = b.slotFrom; i < b.slotTo; i++) sl[i] = Math.max(0, sl[i] - 1); });
          if (free(sl, s)) return null;
          var what = [];
          for (var i = s.from; i < s.to; i++) { var sv = sl[i] ? serviceAt(site, room.id, p.day, i) : ''; if (sv && what.indexOf(sv) < 0) what.push(sv); }
          return db().collection('bookings').where('roomId', '==', room.id).where('day', '==', p.day).get().then(function (q) {
            q.docs.forEach(function (x) {
              var b = x.data();
              if (b.status !== 'confirmed' || b.calEventId === calEventId || b.slotTo <= s.from || b.slotFrom >= s.to) return;
              what.push((b.title || 'A booking') + ' (' + hhmm(b.startMin) + '–' + hhmm(b.endMin) + ')');
            });
            return { piece: p, room: room, what: what.length ? what : ['something already booked'] };
          });
        });
      })).then(function (l) { return l.filter(Boolean); });
    });
  }

  /* Make the event's bookings match the event. A room it keeps is moved to
     the new time; a room it no longer uses is given back; a new one is
     booked. o: { override, note } to book over something. */
  function syncEvent(ev, roomsById, o) {
    o = o || {};
    var want = eventPieces(ev), p = (EGBCAuth.profile && EGBCAuth.profile()) || {}, u = (EGBCAuth.user && EGBCAuth.user()) || {};
    return eventBookings(ev.id).then(function (have) {
      var used = {}, jobs = [];
      want.forEach(function (w) {
        var room = roomsById[w.roomId];
        var b = have.filter(function (x) { return !used[x.key] && x.roomId === w.roomId && x.day === w.day; })[0] ||
                have.filter(function (x) { return !used[x.key] && x.roomId === w.roomId; })[0];
        if (b) {
          used[b.key] = true;
          var s = slots(toMin(w.start), toMin(w.end), w.setup, w.pack);
          if (b.day === w.day && b.startMin === toMin(w.start) && b.endMin === toMin(w.end) && b.slotFrom === s.from && b.slotTo === s.to && b.title === ev.title) return;
          jobs.push(function () {
            var after = b.title === ev.title ? Promise.resolve() : db().collection('bookings').doc(b.key).update({ title: String(ev.title || '').slice(0, 120) });
            return after.then(function () {
              if (b.day === w.day && b.startMin === toMin(w.start) && b.endMin === toMin(w.end) && b.slotFrom === s.from && b.slotTo === s.to) return;
              return db().collection('bookings').doc(b.key).update({ setupMins: w.setup, packdownMins: w.pack }).then(function () {
                return move(Object.assign({}, b, { setupMins: w.setup, packdownMins: w.pack }), room, room, { day: w.day, start: w.start, end: w.end }, o);
              });
            });
          });
          return;
        }
        jobs.push(function () {
          var d = prepare({ kind: 'event', room: room, day: w.day, start: w.start, end: w.end, setup: w.setup, pack: w.pack, title: ev.title,
            people: Math.max(1, +ev.capacity || 1), notes: '', calEventId: ev.id,
            requester: { name: ev.organiserName || p.name || '', email: p.email || u.email || '', phone: '', org: '' } });
          return officeBook(d, room, o);
        });
      });
      have.forEach(function (b) {
        if (used[b.key]) return;
        jobs.push(function () { return cancel(b, roomsById[b.roomId] || { id: b.roomId, siteId: b.siteId }, 'The event no longer uses this room.'); });
      });
      return jobs.reduce(function (pr, j) { return pr.then(j); }, Promise.resolve());
    });
  }

  /* An event cancelled or deleted gives its rooms back. */
  function freeEvent(calEventId, roomsById, note) {
    return eventBookings(calEventId).then(function (have) {
      return have.reduce(function (pr, b) {
        return pr.then(function () { return cancel(b, roomsById[b.roomId] || { id: b.roomId, siteId: b.siteId }, note || 'The event was cancelled.'); });
      }, Promise.resolve());
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
  function axis(bare) {
    css();
    var s = '';
    for (var h = FROM / 4; h < TO / 4; h += 2) s += '<span>' + (h < 10 ? '0' : '') + h + ':00</span>';
    return '<div class="bk-ax"' + (bare ? ' style="margin-left:0"' : '') + '>' + s + '</div>';
  }
  function key(mine) {
    return '<div class="bk-key"><span><i style="background:#fff"></i>Free</span><span><i style="background:#cfd4d8"></i>Booked</span>' +
      '<span><i style="background:#e9d6ad"></i>Service</span>' + (mine ? '<span><i style="background:#3d6263"></i>Yours</span>' : '') + '</div>';
  }

  /* The office hears about every request that waits for it. */
  /* The office hears about every request that waits for it, and about a
     member cancelling. It goes to the site's own bookings address (Places,
     Bookings tab), or the church's enquiry email if the site has none.
     what: 'request' (the default) or 'cancelled'. list: one booking, or
     every date of a series. */
  function tellOffice(list, roomName, site, what) {
    list = [].concat(list);
    var b = list[0], to = (site && site.bookingsEmail) || (typeof EGBCChurch !== 'undefined' && EGBCChurch.email()) || '';
    if (!to) return Promise.resolve({ ok: false, error: 'no address to tell' });
    var r = b.requester || {}, cancel = what === 'cancelled';
    var body = '<p>' + esc(roomName) + ', ' + (list.length > 1 ? esc(seriesWords(b.series && b.series.rule, list.length)) + ':</p>' + dateList(list) + '<p>'
                 : esc(when(b))) + (b.title ? ': <strong>' + esc(b.title) + '</strong>' : '') + '.</p>' +
      '<p>' + (cancel ? 'Cancelled by ' : 'From ') + esc(r.name || b.memberName || '') + (r.org ? ' (' + esc(r.org) + ')' : '') + (b.kind === 'hire' ? ', a hirer' : ', a member') + '.</p>' +
      (cancel ? '<p>The time has been given back.</p>' : '<p>Open <strong>Room bookings</strong> in the hub to approve or decline it.</p>');
    return EGBCChurch.send({ to: [to], subject: (cancel ? 'Booking cancelled: ' : 'Booking request: ') + roomName + ', ' + (list.length > 1 ? list.length + ' dates from ' : '') + when(b),
      html: EGBCChurch.wrap(cancel ? 'A member cancelled a booking' : 'A booking is waiting for you', body) });
  }
  function dateList(list) {
    return '<ul style="margin:6px 0 12px;padding-left:20px">' + list.map(function (x) { return '<li>' + esc(when(x)) + '</li>'; }).join('') + '</ul>';
  }
  function ref(b) { return String(b.key || '').slice(3, 11).toUpperCase(); }

  function when(b) { return EGBCEvents.fmtDate(b.day + 'T12:00') + ', ' + hhmm(b.startMin) + ' to ' + hhmm(b.endMin); }
  function icsOpts(b, roomName) {
    return { uid: 'room-booking-' + b.key, title: (b.title || 'Room booking') + ' (' + roomName + ')',
      description: b.notes || '', location: roomName, start: b.startLocal, end: b.endLocal, allDay: false, status: b.status === 'cancelled' ? 'cancelled' : 'confirmed' };
  }
  function ics(b, roomName) {
    return EGBCICS.build({ uid: 'room-booking-' + b.key, title: (b.title || 'Room booking') + ' (' + roomName + ')',
      description: b.notes || '', location: roomName, start: b.startLocal, end: b.endLocal, allDay: false, status: b.status === 'cancelled' ? 'cancelled' : 'confirmed' });
  }
  /* One email for a whole series: the dates listed, and one calendar file
     holding all of them. A single booking goes to email() below. */
  function emailMany(list, roomName, what, note, extra) {
    list = [].concat(list);
    if (list.length === 1) return email(list[0], roomName, what, note, extra);
    var b = list[0], to = (b.requester && b.requester.email) || '';
    if (!to) return Promise.resolve({ ok: false, error: 'no address' });
    var head = { confirmed: 'Your repeating booking is confirmed', waiting: 'Your repeating booking is waiting for approval', approved: 'Your repeating booking is confirmed',
                 declined: 'Your repeating booking could not go ahead', cancelled: 'Your bookings have been cancelled' }[what] || 'Your bookings';
    var body = '<p>' + esc(roomName) + (b.title ? ': <strong>' + esc(b.title) + '</strong>' : '') + ', ' + esc(seriesWords(b.series && b.series.rule, list.length)) + ':</p>' + dateList(list) +
      (what === 'waiting' ? '<p>Someone at the church will look at it and let you know. Nothing is confirmed until then.</p>' : '') +
      ((what === 'declined' || what === 'cancelled') && note ? '<p>' + esc(note) + '</p>' : '') +
      (what === 'confirmed' || what === 'approved' ? '<p style="color:#6b7280;font-size:13px">The calendar file attached adds every date to your diary.</p>' : '') +
      (extra || '') +
      '<p style="color:#6b7280;font-size:13px">References ' + list.map(function (x) { return esc(ref(x)); }).join(', ') + '</p>';
    var mail = { to: [to], subject: head + ': ' + roomName + ', ' + list.length + ' dates from ' + when(b), html: EGBCChurch.wrap(head, body) };
    if (what === 'confirmed' || what === 'approved') {
      var cal = EGBCICS.buildMany(list.map(function (x) { return icsOpts(x, roomName); }), (b.title || 'Room booking') + ' (' + roomName + ')');
      mail.attachments = [{ filename: 'booking.ics', content: EGBCICS.base64(cal), type: 'text/calendar' }];
    }
    return EGBCChurch.send(mail);
  }

  function email(b, roomName, what, note, extra) {
    var to = (b.requester && b.requester.email) || '';
    if (!to) return Promise.resolve({ ok: false, error: 'no address' });
    var head = { confirmed: 'Your room is booked', waiting: 'Your booking is waiting for approval', approved: 'Your booking is confirmed',
                 declined: 'Your booking could not go ahead', cancelled: 'Your booking has been cancelled', moved: 'Your booking has moved',
                 kept: 'We have kept your booking' }[what];
    var body = '<p>' + esc(roomName) + ', ' + esc(when(b)) + (b.title ? ': <strong>' + esc(b.title) + '</strong>' : '') + '.</p>' +
      (b.setupMins || b.packdownMins ? '<p style="color:#6b7280;font-size:13px">Including ' + (b.setupMins || 0) + ' minutes to set up and ' + (b.packdownMins || 0) + ' to clear away.</p>' : '') +
      (what === 'waiting' ? '<p>Someone at the church will look at it and let you know. Nothing is confirmed until then.</p>' : '') +
      (what === 'declined' && note ? '<p>' + esc(note) + '</p>' : '') +
      (what === 'confirmed' || what === 'approved' || what === 'moved' ? '<p style="color:#6b7280;font-size:13px">The calendar file attached adds it to your diary.</p>' : '') +
      (what === 'moved' && note ? '<p>' + esc(note) + '</p>' : '') + (what === 'cancelled' && note ? '<p>' + esc(note) + '</p>' : '') +
      (what === 'kept' ? '<p>You asked to cancel. ' + (note ? esc(note) : '') + '</p>' : '') +
      (extra || '') +
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
              bar: bar, axis: axis, key: key, FROM: FROM, TO: TO,
              MAX: MAX, RULES: RULES, repeatDays: repeatDays, seriesWords: seriesWords, canSelfCancel: canSelfCancel, cancelOwn: cancelOwn,
              emailMany: emailMany, dateList: dateList,
              officeBook: officeBook, eventPieces: eventPieces, eventBookings: eventBookings, eventClashes: eventClashes, syncEvent: syncEvent, freeEvent: freeEvent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCBookings = api;

})(typeof window !== 'undefined' ? window : this);
