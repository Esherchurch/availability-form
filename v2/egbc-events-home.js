/* ===================================================================
   EGBC — the events window's helpers for the app's Home (FINDINGS-app
   A-050 A4: "give me myFamilyThisSunday(), myEvents() and myGroupsNext()
   returning plain data, not HTML, and I will draw them")
   ===================================================================

   Home is the main window's; the data and the rules are the events
   window's. Each helper returns a Promise of plain objects. Nothing here
   draws anything.

   Built: myEvents() and myGroupsNext() for Home; officeQueue() and
   officeToday() for Running things (the Bookings tab draws the queue;
   Today, the main window's, draws the counts); myFamilyThisSunday() for
   the parents' Sunday (F-121).

   Needs (loaded before it): egbc-auth.js, egbc-events.js,
   egbc-events-groups.js (myGroupsNext), egbc-events-kids.js and
   egbc-events-qr.js (myFamilyThisSunday), and for the office the rules alone.
   =================================================================== */

(function (global) {
  'use strict';

  var E = global.EGBCEvents;
  function db() { return EGBCAuth.db; }
  function uid() { return (EGBCAuth.user && EGBCAuth.user() || {}).uid || ''; }
  /* Pages live beside this file, wherever the shell itself is. */
  var BASE = (function () {
    var s = global.document && global.document.currentScript;
    return s && s.src ? s.src.replace(/[^/]*$/, '') : '';
  })();

  /* The person's own sign-ups to events still to come, soonest first:
       [{ id, title, start, end, allDay, where, places, waiting,
          manageUrl, eventUrl }]
     Read through the one list rule there is for it (signups where
     memberUid is them), so nobody else's ever comes back. Cancelled ones
     and events gone by are left out. */
  function myEvents() {
    if (!uid()) return Promise.resolve([]);
    return db().collection('signups').where('memberUid', '==', uid()).get().then(function (s) {
      var mine = s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); })
        .filter(function (x) { return x.status === 'confirmed' || x.status === 'waiting'; });
      var ids = []; mine.forEach(function (x) { if (ids.indexOf(x.calEventId) < 0) ids.push(x.calEventId); });
      return Promise.all([Promise.all(ids.map(function (id) {
        return db().collection('calEvents').doc(id).get().then(function (d) { return d.exists ? Object.assign({ id: d.id }, d.data()) : null; }, function () { return null; });
      })), E.lookups().catch(function () { return { sites: {}, rooms: {}, venues: {} }; })]).then(function (r) {
        var evs = {}; r[0].forEach(function (e) { if (e) evs[e.id] = e; });
        var now = Date.now() - 6 * 3600 * 1000;
        return mine.map(function (x) {
          var ev = evs[x.calEventId];
          if (!ev || ev.status === 'cancelled') return null;
          var start = ev.startLocal || ev.startUtc;
          if (new Date(start).getTime() < now) return null;
          return { id: ev.id, title: ev.title || '', start: start, end: ev.endLocal || ev.endUtc || '', allDay: !!ev.allDay, when: E.fmtWhen(ev),
                   where: E.locationText(ev, r[1]), places: x.places || 1, waiting: x.status === 'waiting',
                   manageUrl: BASE + 'my-signup.html?key=' + encodeURIComponent(x.key), eventUrl: BASE + 'signup.html?event=' + encodeURIComponent(ev.id) };
        }).filter(Boolean).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      });
    });
  }

  function me() { return (EGBCAuth.profile && EGBCAuth.profile()) || {}; }
  function all(s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  function today() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  /* The next meeting of each small group the person is in or leads,
     soonest first:
       [{ id, name, date, time, where, cancelled, note, lead, url }]
     The date is the next meeting the leader has set (smallGroupMeetings),
     or else the next one on the group's own day; a meeting the leader has
     called off is skipped, and "cancelled" says one was. Only what a member
     may read: the rules decide. */
  function myGroupsNext() {
    var mid = me().memberId, G = global.EGBCGroups;
    if (!mid || !G) return Promise.resolve([]);
    var t = today();
    return Promise.all([
      db().collection('smallGroupMembers').where('personKind', '==', 'addressBook').where('personId', '==', mid).get().catch(function () { return { docs: [] }; }),
      db().collection('smallGroups').where('leaderIds', 'array-contains', mid).get().catch(function () { return { docs: [] }; })
    ]).then(function (r) {
      var ids = {}, lead = {};
      r[0].docs.forEach(function (d) { ids[d.data().groupId] = 1; });
      r[1].docs.forEach(function (d) { ids[d.id] = 1; lead[d.id] = 1; });
      return Promise.all(Object.keys(ids).map(function (id) {
        return Promise.all([
          db().collection('smallGroups').doc(id).get().then(function (s) { return s.exists ? Object.assign({ id: s.id }, s.data()) : null; }, function () { return null; }),
          db().collection('smallGroupMeetings').where('groupId', '==', id).get().then(all, function () { return []; })
        ]).then(function (x) {
          var g = x[0]; if (!g || g.active === false) return null;
          var meets = x[1].filter(function (m) { return m.date >= t; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
          var set = {}; meets.forEach(function (m) { set[m.date] = m; });
          /* The group's own day, skipping one called off; unless the
             leader has set a date sooner. */
          var day = G.nextDate(g, t), off = false, guard = 0;
          while (day && set[day] && set[day].cancelled && guard++ < 8) {
            off = true;
            day = G.nextDate(g, new Date(new Date(day + 'T12:00:00Z').getTime() + 864e5).toISOString());
          }
          var sooner = meets.filter(function (m) { return !m.cancelled; })[0];
          if (sooner && (!day || sooner.date < day)) day = sooner.date;
          if (!day) return null;
          var m = set[day] || {};
          return { id: g.id, name: g.name || '', date: day, time: m.time || g.time || '', where: G.wherePublic(g), cancelled: off, note: m.notes || '',
                   lead: !!lead[g.id], url: BASE + 'groups.html' };
        });
      }));
    }).then(function (l) { return l.filter(Boolean).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); });
  }

  /* ---- Running things: what is waiting for the office ----
     For the sites this person is the office of (admins: every site; a
     site's bookings admins: theirs):
       { sites, requests, cancelAsks, closures, jobsToDo, url }
     requests: bookings asking, still to come, soonest first - each with
       its room, and onPhone: whether the phone can decide it (free, one
       date) or it needs Room bookings (a price to confirm, or a series)
     cancelAsks: hirers asking to cancel
     closures: rooms closed with people booked then, not yet warned
     jobsToDo: maintenance jobs to do (everyone may see these) */
  function officeQueue() {
    var p = me(), admin = !!(EGBCAuth.isAdmin && EGBCAuth.isAdmin());
    var t = today();
    return Promise.all([db().collection('sites').get(), db().collection('rooms').get(),
                        db().collection('bookingSettings').get().catch(function () { return { docs: [] }; }),
                        db().collection('bookingTypes').get().catch(function () { return { docs: [] }; }),
                        db().collection('maintJobs').where('status', '==', 'todo').get().catch(function () { return { docs: [] }; })]).then(function (r) {
      var sites = all(r[0]).filter(function (s) { return s.active !== false; }), rooms = {}, types = {};
      all(r[1]).forEach(function (x) { rooms[x.id] = x; });
      all(r[3]).forEach(function (x) { types[x.id] = x; });
      var mine = admin ? sites.map(function (s) { return s.id; })
                       : all(r[2]).filter(function (b) { return (b.bookingsAdmins || []).indexOf(p.memberId) >= 0; }).map(function (b) { return b.id; });
      var jobs = r[4].docs.length;
      return Promise.all(mine.map(function (sid) {
        return Promise.all([
          db().collection('bookings').where('siteId', '==', sid).get().then(function (s) { return s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); }); }, function () { return []; }),
          db().collection('roomClosures').where('siteId', '==', sid).get().then(all, function () { return []; })]);
      })).then(function (per) {
        var books = [], closes = [];
        per.forEach(function (x) { books = books.concat(x[0]); closes = closes.concat(x[1]); });
        var requests = books.filter(function (b) { return b.status === 'requested' && b.day >= t && !(b.cancelRequest && b.cancelRequest.status === 'asked'); })
          .sort(function (a, b) { return (a.day + a.startMin / 10000) < (b.day + b.startMin / 10000) ? -1 : 1; })
          .map(function (b) {
            var ty = b.bookingType ? types[b.bookingType] : null, priced = !!(ty && ty.charged) || b.kind === 'hire';
            return Object.assign({}, b, { room: rooms[b.roomId] || { id: b.roomId, name: 'A room', siteId: b.siteId },
              onPhone: !b.series && !priced, why: b.series ? 'a series of dates' : priced ? 'a price to confirm' : '' });
          });
        var cancelAsks = books.filter(function (b) { return b.cancelRequest && b.cancelRequest.status === 'asked' && (b.status === 'requested' || b.status === 'confirmed'); });
        var closures = closes.filter(function (c) { return c.status === 'on' && c.to >= t && !c.warnedAt; }).map(function (c) {
          var hit = books.filter(function (b) { return b.roomId === c.roomId && c.days.indexOf(b.day) >= 0 && (b.status === 'requested' || b.status === 'confirmed') && b.kind !== 'event'; });
          return Object.assign({}, c, { booked: hit.length });
        }).filter(function (c) { return c.booked > 0; });
        return { sites: mine, requests: requests, cancelAsks: cancelAsks, closures: closures, jobsToDo: jobs, url: BASE + 'bookings-admin.html' };
      });
    });
  }
  /* The counts, for Running things' Today (the main window draws them). */
  function officeToday() {
    return officeQueue().then(function (q) {
      return { roomRequests: q.requests.length, cancelAsks: q.cancelAsks.length, closuresToWarn: q.closures.length, jobsToDo: q.jobsToDo, url: q.url };
    });
  }

  /* ---- "This Sunday, for parents" (F-121; Martin, A-K1) ----
     The signed-in parent's own family or families, found by the email they
     signed in with - the one on the registration form, or the second
     parent's (N-6) - and only once that email is VERIFIED (the rules say
     the same):
       [{ familyId, siteId, parentName, familyCode, qrText, qrSvg,
          children: [{ id, name, group, state: 'due'|'in'|'out', inAt, outAt }],
          collectionCode, inCount, day }]
     BEFORE ARRIVING: show qrText (or qrSvg, ready drawn) at the door. The
     desk scans it, ticks who is here, and the labels print with the
     morning's collection code - or show on the leader's screen if there is
     no printer (A-K1). ONCE IN: collectionCode is that code, shown on the
     phone. Children who have left the register are not shown. */
  function myFamilyThisSunday() {
    var u = (EGBCAuth.user && EGBCAuth.user()) || {}, K = global.EGBCKids, QR = global.EGBCEventsQR;
    var email = String(u.email || '').toLowerCase();
    if (!email || !u.emailVerified || !K) return Promise.resolve([]);
    var day = today();
    var fams = db().collection('kidsFamilies');
    return Promise.all([fams.where('email', '==', email).get().catch(function () { return { docs: [] }; }),
                        fams.where('email2', '==', email).get().catch(function () { return { docs: [] }; })]).then(function (r) {
      var seen = {}, list = [];
      r[0].docs.concat(r[1].docs).forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; list.push(Object.assign({ id: d.id }, d.data())); } });
      return Promise.all(list.map(function (f) {
        return Promise.all([
          db().collection('kidsChildren').where('familyId', '==', f.id).get().then(all, function () { return []; }),
          db().collection('checkins').where('kind', '==', 'child').where('familyId', '==', f.id).where('day', '==', day).get().then(all, function () { return []; })
        ]).then(function (x) {
          var kids = x[0].filter(function (c) { return c.status !== 'left'; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
          var gids = {}; kids.forEach(function (c) { if (c.groupId) gids[c.groupId] = 1; });
          return Promise.all(Object.keys(gids).map(function (g) {
            return db().collection('kidsGroups').doc(g).get().then(function (s) { return [g, s.exists ? s.data().name || '' : '']; }, function () { return [g, '']; });
          })).then(function (names) {
            var gname = {}; names.forEach(function (n) { gname[n[0]] = n[1]; });
            var cks = x[1], inNow = cks.filter(function (c) { return c.state === 'in'; });
            var children = kids.map(function (c) {
              var ck = cks.filter(function (k) { return k.signupKey === c.id || k.childId === c.id || (k.name === c.name && k.groupId === c.groupId); })[0];
              return { id: c.id, name: c.name, group: gname[c.groupId] || '', state: ck ? (ck.state === 'in' ? 'in' : 'out') : 'due', inAt: ck ? ck.inAt || '' : '', outAt: ck ? ck.outAt || '' : '' };
            });
            var code = f.familyCode || '';
            return { familyId: f.id, siteId: f.siteId || '', parentName: f.parentName || '', familyCode: code,
                     qrText: code ? K.familyQR(code) : '', qrSvg: code && QR ? QR.svg(K.familyQR(code), 180) : '',
                     children: children, collectionCode: inNow.length ? inNow[0].pickupCode || '' : '', inCount: inNow.length, day: day };
          });
        });
      }));
    });
  }

  global.EGBCEventsHome = { myEvents: myEvents, myGroupsNext: myGroupsNext, myFamilyThisSunday: myFamilyThisSunday, officeQueue: officeQueue, officeToday: officeToday };
})(typeof window !== 'undefined' ? window : this);
