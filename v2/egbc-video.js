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
      var complete = v && Array.isArray(v.rooms) && v.rooms.length && v.rooms.every(function (r) { return r.url; });
      if (complete) return settle(v);
      /* Missing, or a room not yet made: the server makes them. */
      if (!A.call) return settle(v);
      return A.call('videoRoomsEnsure', {}).then(function (r) { return settle(r); }, function () { return settle(v); });
    }, function () { return settle(null); });
    return loading;
  }

  function find(key) {
    for (var i = 0; i < state.rooms.length; i++) if (state.rooms[i].key === key) return state.rooms[i];
    return null;
  }

  global.EGBCVideo = {
    load: load,
    rooms: function () { return state.rooms.slice(); },
    ready: function () { return state.ready; },
    label: function (key) { var r = find(key); return r ? r.label : String(key || ''); },
    url: function (key) { var r = find(key); return r ? (r.url || '') : ''; },
    members: function (key) { var r = find(key); return !!(r && r.members); },
    teams: function (key) { var r = find(key); return (r && r.teams) || []; },
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
