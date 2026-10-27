/* ===================================================================
   EGBC — the church's video meeting rooms, for every page that names one
   (main window, 21 Oct 2026; design-mocks/mailings/PLAN.md section 1)
   ===================================================================

   ONE LIST, THE CHURCH'S OWN (churchSettings/video), in place of the copies
   of "https://egbc.daily.co/" and its seven rooms that meeting.html, the
   Rota Planner, the Core Team app, the hub and the calendar feed each kept.
   Every church's rooms live in Church HQ's one Daily account, named
   <churchId>-<room>, made by the server (functions/video.js) the first time
   a page asks - nobody presses anything.

     EGBCVideo.load()          -> Promise of the rooms (made if missing)
     EGBCVideo.rooms()         -> [{ key, label, url, members }] once loaded
     EGBCVideo.label(key)      -> the room's name, or the key
     EGBCVideo.url(key)        -> its Daily address (an invite for guests)
     EGBCVideo.roomFor(ev)     -> the event's room key, or ''
     EGBCVideo.link(key, ev?)  -> the hub's meeting page for it - what the
                                  hub links to, so the host gets their key
     EGBCVideo.onReady(fn)     -> fn() once the rooms are known (redraw)
     EGBCVideo.has(key)        -> a room of the church's, standing or a
                                  meeting's own
     EGBCVideo.inUse(key, events, now?) -> the meeting in that room right
                                  now, or null
     EGBCVideo.until(ev)       -> when it ends, "HH:MM"

   ROOMS IN USE (27 Oct 2026; Martin: "a link for a particular time should
   somehow say it is in use. If we have a small group link we could have 5
   groups at the same time."). A meeting booked into a room another meeting
   has at that time gets a room of its own (functions/meeting-rooms.js):
   kept on the list with meeting: <event id>, and never listed as a
   standing room - rooms() is the standing rooms only.

   Needs egbc-auth.js (EGBCAuth.db, EGBCAuth.call).
   =================================================================== */

(function (global) {
  'use strict';
  var state = { rooms: [], byType: {}, ready: false };
  var waiting = [];
  var loading = null;

  function settle(v) {
    state.rooms = (v && v.rooms) || [];
    state.byType = (v && v.byType) || {};
    state.ready = true;
    var w = waiting.slice(); waiting = [];
    w.forEach(function (fn) { try { fn(); } catch (e) { console.warn('EGBCVideo:', e); } });
    return state.rooms;
  }

  function load() {
    if (loading) return loading;
    var A = global.EGBCAuth;
    if (!A || !A.db) return Promise.resolve([]);
    loading = A.db.collection('churchSettings').doc('video').get().then(function (s) {
      var v = s.exists ? s.data() : null;
      /* Every room made, and with today's fields (hostTeams, 21 Oct 2026);
         otherwise the server fills them in, once. */
      /* And roomsByKey (22 Oct 2026), which the rules read for Present. */
      var complete = v && Array.isArray(v.rooms) && v.rooms.length && v.roomsByKey && v.rooms.every(function (r) {
        return r.url && Array.isArray(r.teams) && Array.isArray(r.hostTeams) && v.roomsByKey[r.key];
      });
      if (complete) return settle(v);
      /* Missing, or a room not yet made: the server makes them. */
      if (!A.call) return settle(v);
      return A.call('videoRoomsEnsure', {}).then(function (r) { return settle(r); }, function () { return settle(v); });
    }, function () { return settle(null); });
    return loading;
  }

  /* London's day and time now ("YYYY-MM-DD", "HH:MM"): the rota's times are
     London wall-clock. */
  function londonNow(now) {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now || new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { day: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
  }
  /* A meeting's end; an hour after it starts when it has none. */
  function endOf(ev) {
    var s = ev.startTime || '00:00';
    if (ev.endTime && ev.endTime > s) return ev.endTime;
    var h = Math.min(23, Number(s.slice(0, 2)) + 1);
    return (h < 10 ? '0' : '') + h + s.slice(2);
  }

  function find(key) {
    for (var i = 0; i < state.rooms.length; i++) if (state.rooms[i].key === key) return state.rooms[i];
    return null;
  }

  global.EGBCVideo = {
    load: load,
    rooms: function () { return state.rooms.filter(function (r) { return !r.meeting; }); },
    has: function (key) { return !!find(key); },
    inUse: function (key, events, now) {
      if (!key) return null;
      var t = londonNow(now);
      var self = this;
      return (events || []).filter(function (ev) {
        return ev && !ev.archived && ev.date === t.day && self.roomFor(ev) === key
          && (ev.startTime || '00:00') <= t.time && t.time < endOf(ev);
      }).sort(function (a, b) { return String(a.startTime || '').localeCompare(String(b.startTime || '')); })[0] || null;
    },
    until: function (ev) { return endOf(ev); },
    ready: function () { return state.ready; },
    label: function (key) { var r = find(key); return r ? r.label : String(key || ''); },
    url: function (key) { var r = find(key); return r ? (r.url || '') : ''; },
    members: function (key) { var r = find(key); return !!(r && r.members); },
    teams: function (key) { var r = find(key); return (r && r.teams) || []; },
    hostTeams: function (key) { var r = find(key); return (r && r.hostTeams) || []; },
    /* videoRoom absent: this kind of meeting's usual room; '' means "no
       call", which is not the same thing. */
    roomFor: function (ev) {
      if (!ev) return '';
      return ev.videoRoom !== undefined ? ev.videoRoom : (state.byType[ev.type] || '');
    },
    link: function (key, ev) {
      if (!key) return '';
      return 'meeting.html?room=' + encodeURIComponent(key) + (ev && ev.id ? '&event=' + encodeURIComponent(ev.id) : '');
    },
    byType: function () { return Object.assign({}, state.byType); },
    onReady: function (fn) { if (state.ready) fn(); else waiting.push(fn); }
  };
})(window);
