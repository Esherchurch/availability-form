/* ===================================================================
   EGBC — the video meetings list, on a phone
   ===================================================================

   APP-DESIGN-BRIEF §7b, Core Team ▸ Meetings: "join video calls and see
   upcoming online meetings."

   MOVED, NOT COPIED, the same way the service planner was
   (egbc-core-planner.js). This is CoreTeamApp.html's renderMeetings and
   the room table it reads, lifted out unchanged so the installed Core
   Team app and the phone app list the same meetings from the same place.

   WHAT CHANGED IN THE MOVE, and nothing else did:
     - the events come from the host. CoreTeamApp has a live listener
       feeding cachedEvents; the phone app has no such listener, so when
       no list is handed in this reads `events` once for itself.
     - toast comes from the host, as the planner's does.

   THE ROOMS ARE "KNOCK TO JOIN" LINKS AND NOTHING ELSE. There is no host
   token here and there must never be one: anybody with a host token
   walks straight in as the host. A person types their name, knocks, and
   whoever is hosting lets them in. The comment was in CoreTeamApp and it
   travels with the code.

   VIDEO_ROOMS and the default-by-type table are also what the rota
   planner reads when somebody picks a video room on a meeting, so they
   are exported rather than kept private. Since 21 Oct 2026 both are the
   church's own (churchSettings/video, through egbc-video.js): every
   church's rooms are made in Church HQ's Daily account, and no page keeps
   a copy of the list or of egbc.daily.co.

   HOW TO USE IT:

     EGBCCoreMeetings.mount({ into: el, events: [...], toast: fn });

   =================================================================== */

(function (global) {
  'use strict';

  var V = function () { return global.EGBCVideo || null; };
  /* [key, label] pairs, as the rota planner has always read them. */
  var roomPairs = function () { return V() ? V().rooms().map(function (r) { return [r.key, r.label]; }) : []; };
  // ev.videoRoom: room name, '' = no call, undefined = use the default for the event type
  var videoRoomFor = function (ev) { return V() ? V().roomFor(ev) : (ev.videoRoom || ''); };
  /* The room's own address: the invite for somebody with no hub login. */
  var videoLinkFor = function (ev) { var r = videoRoomFor(ev); return r && V() ? V().url(r) : ''; };
  var videoRoomLabel = function (room) { return V() ? V().label(room) : room; };

  var H = {
    toast: function (m) { try { console.log('[meetings] ' + m); } catch (e) {} },
    events: null
  };
  function db() { return global.EGBCAuth && EGBCAuth.db; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* renderMeetings, from CoreTeamApp. The one change inside it is esc():
     an event's type and description are typed by a person, and this
     builds HTML out of them. CoreTeamApp interpolated them raw - nothing
     has ever come of it, because only Core Team can type there, but the
     escaping contract (F-130) says the helpers escape and this is now a
     shared helper. */
  function render(container, events) {
    if (!container) return;
    var today = new Date().toISOString().split('T')[0];
    var upcoming = (events || [])
      .filter(function (ev) { return !ev.archived && ev.date >= today && videoRoomFor(ev); })
      .sort(function (a, b) {
        return (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''));
      });
    var btn = 'display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:8px;'
      + 'font-family:var(--font,Inter,system-ui,sans-serif);font-weight:500;font-size:13px;cursor:pointer;'
      + 'text-decoration:none;white-space:nowrap;';
    /* Join opens the EGBC meeting page (signed in, name filled in); Copy
       link stays the plain Daily link, for a guest with no account. */
    var meetingPage = function (room, evId) {
      return 'meeting.html?room=' + encodeURIComponent(room)
        + (evId ? '&event=' + encodeURIComponent(evId) : '');
    };
    var joinBtn = function (link) {
      return '<a href="' + esc(link) + '" target="_blank" rel="noopener" style="' + btn
        + 'background:#15803d;color:white;border:1px solid #15803d;">Join</a>';
    };
    var copyBtn = function (link) {
      return '<button onclick="copyMeetingLink(\'' + esc(link) + '\')" style="' + btn
        + 'background:var(--white,#fff);color:#111827;border:1px solid #d1d5db;">Copy link</button>';
    };
    var card = 'background:var(--white,#fff);border:1px solid var(--border,#e5e7eb);border-radius:14px;'
      + 'padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
    var heading = function (t) {
      return '<div style="font-size:12px;font-weight:600;color:var(--muted,#6b7280);margin:14px 2px 8px;">'
        + esc(t) + '</div>';
    };

    var html = heading('Upcoming online meetings');
    if (!upcoming.length) {
      html += '<div style="' + card + 'font-size:12px;font-weight:600;color:var(--teal,#3d6263);opacity:0.7;">'
        + 'None yet. In the Rota Planner, pick a video room on a meeting to add it here.</div>';
    }
    upcoming.forEach(function (ev) {
      var link = videoLinkFor(ev);
      var d = new Date(ev.date + 'T00:00:00').toLocaleDateString('en-GB',
        { weekday: 'short', day: 'numeric', month: 'short' });
      html += '<div style="' + card + '"><div style="flex:1;min-width:160px;">'
        + '<div style="font-size:13px;font-weight:600;color:var(--teal,#3d6263);">'
        + esc(ev.type) + (ev.description ? ' · ' + esc(ev.description) : '') + '</div>'
        + '<div style="font-size:13px;font-weight:600;color:var(--teal,#3d6263);opacity:0.6;">'
        + esc(d) + (ev.startTime ? ' · ' + esc(ev.startTime) + (ev.endTime ? '–' + esc(ev.endTime) : '') : '')
        + ' · ' + esc(videoRoomLabel(videoRoomFor(ev))) + '</div>'
        + '</div>' + joinBtn(meetingPage(videoRoomFor(ev), ev.id)) + copyBtn(link) + '</div>';
    });

    html += heading('All meeting rooms');
    roomPairs().forEach(function (pair) {
      var room = pair[0], label = pair[1];
      var link = V() ? V().url(room) : '';
      html += '<div style="' + card + '"><div style="flex:1;min-width:160px;">'
        + '<div style="font-size:13px;font-weight:600;color:var(--teal,#3d6263);">' + esc(label) + '</div>'
        + '<div style="font-size:13px;font-weight:600;color:var(--teal,#3d6263);opacity:0.6;word-break:break-all;">'
        + esc(link) + '</div>'
        + '</div>' + joinBtn(meetingPage(room)) + copyBtn(link) + '</div>';
    });

    html += '<div style="font-size:13px;font-weight:600;color:var(--teal,#3d6263);opacity:0.6;'
      + 'margin:12px 2px;line-height:1.5;">Rooms are private: people type their name and knock, '
      + 'then the host lets them in. Hosts use their own private host link.</div>';
    container.innerHTML = html;
  }

  /* The events, when the host has none of its own. One read, cached for
     the page: the list changes when somebody edits the rota, and a tab
     that re-reads every time it is opened is a read per tap. */
  var CACHE = null;
  function loadEvents() {
    if (CACHE) return Promise.resolve(CACHE);
    if (!db()) return Promise.resolve([]);
    return db().collection('events').get().then(function (snap) {
      CACHE = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      return CACHE;
    }, function () { return []; });
  }

  /* The church's rooms (egbc-video.js), fetched by this file when the page
     did not load it, so no page has to remember to. */
  var videoReady = null;
  function rooms() {
    if (videoReady) return videoReady;
    videoReady = new Promise(function (ok) {
      if (global.EGBCVideo) return ok();
      var here = document.currentScript && document.currentScript.src;
      var me = document.querySelector('script[src*="egbc-core-meetings.js"]');
      var base = (here || (me && me.src) || '').replace(/[^/]*$/, '');
      var t = document.createElement('script');
      t.src = base + 'egbc-video.js?v=202610210900';
      t.onload = ok; t.onerror = ok;
      document.head.appendChild(t);
    }).then(function () { return global.EGBCVideo ? global.EGBCVideo.load() : []; });
    return videoReady;
  }

  function mount(opts) {
    opts = opts || {};
    var into = opts.into;
    if (!into) return null;
    if (opts.toast) H.toast = opts.toast;
    if (opts.events) {
      render(into, opts.events);
      rooms().then(function () { render(into, opts.events); });
      return into;
    }
    into.innerHTML = '<div style="padding:14px;font-size:13px;color:var(--muted,#6b7280)">'
      + 'Finding the meetings…</div>';
    Promise.all([loadEvents(), rooms()]).then(function (r) { render(into, r[0]); });
    return into;
  }

  /* MEET ONLY WHEN IT IS NEEDED (Martin, 14 Oct 2026: "we dont need the
     meet now at all unless it is in the diary for that day"). The video
     meetings in the diary TODAY that are this person's - the hub's rule
     (hub-app.js meetingForMe and loadMeetings), kept in step: a master
     admin sees all; anyone else, a meeting for one of their teams (the rota
     calls Youth Worship "Youth") or one they have a role on; and never a
     room they may not join (a members' meeting is not an Attender's).
     Today is the local day, not UTC's. Menu > Meetings and Core Team >
     Meetings still list every room on every day. */
  function localDay(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isForMe(ev) {
    var A = global.EGBCAuth;
    if (!A) return false;
    var room = videoRoomFor(ev);
    if (!room || ev.archived) return false;
    if (A.mayJoinRoom && !A.mayJoinRoom(room)) return false;
    if (A.isMaster && A.isMaster()) return true;
    var mine = (A.effectiveTeams ? A.effectiveTeams() : []) || [];
    if ((ev.teams || []).some(function (t) { return mine.indexOf(t === 'Youth' ? 'Youth Worship' : t) !== -1; })) return true;
    var p = A.profile ? A.profile() : null, mid = p && p.memberId;
    return !!mid && Object.keys(ev.assignments || {}).some(function (k) {
      var raw = ev.assignments[k];
      return (Array.isArray(raw) ? raw : [raw]).some(function (x) { return x && x.id === mid; });
    });
  }
  function todayForMe(now) {
    if (!db()) return Promise.resolve([]);
    var day = localDay(now);
    return db().collection('events').where('date', '==', day).get().then(function (snap) {
      return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(isForMe)
        .sort(function (a, b) { return (a.startTime || '').localeCompare(b.startTime || ''); })
        .map(function (ev) {
          return { id: ev.id, title: ev.type + (ev.description ? ' \u00b7 ' + ev.description : ''),
            startTime: ev.startTime || '', endTime: ev.endTime || '',
            room: videoRoomFor(ev), roomLabel: videoRoomLabel(videoRoomFor(ev)),
            link: 'meeting.html?room=' + encodeURIComponent(videoRoomFor(ev)) + '&event=' + encodeURIComponent(ev.id) };
        });
    }, function () { return []; });
  }

  /* On window because the Copy link buttons this builds are inline
     handlers, exactly as they were in CoreTeamApp. */
  global.copyMeetingLink = async function (link) {
    try { await navigator.clipboard.writeText(link); H.toast('Link copied'); }
    catch (e) { prompt('Copy this link:', link); }
  };

  global.EGBCCoreMeetings = {
    mount: mount,
    /* The rooms, loaded (for the Core Team rota's room picker). */
    rooms: rooms,
    render: render,
    /* Read when asked, so they are the church's rooms once loaded. */
    get VIDEO_ROOMS() { return roomPairs(); },
    get VIDEO_DEFAULT_BY_TYPE() { return V() ? V().byType() : {}; },
    videoRoomFor: videoRoomFor,
    videoLinkFor: videoLinkFor,
    videoRoomLabel: videoRoomLabel,
    localDay: localDay,
    isForMe: isForMe,
    todayForMe: todayForMe
  };
})(window);
