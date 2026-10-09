/* ===================================================================
   EGBC — the events window's helpers for the app's Home (FINDINGS-app
   A-050 A4: "give me myFamilyThisSunday(), myEvents() and myGroupsNext()
   returning plain data, not HTML, and I will draw them")
   ===================================================================

   Home is the main window's; the data and the rules are the events
   window's. Each helper returns a Promise of plain objects. Nothing here
   draws anything.

   Built so far: myEvents(). myFamilyThisSunday() and myGroupsNext() come
   with the parents' Sunday (F-121) and the groups' next meeting.

   Needs (loaded before it): egbc-auth.js, egbc-events.js.
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

  global.EGBCEventsHome = { myEvents: myEvents };
})(typeof window !== 'undefined' ? window : this);
