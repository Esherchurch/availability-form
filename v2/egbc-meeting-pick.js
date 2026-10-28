/* ===================================================================
   EGBC — pick a meeting for an email (comms window, 20 Oct 2026)
   ===================================================================

   Martin, 20 Oct: "an 'Add a meeting' block in the e-news and one-off
   email builder. Pick a meeting from the hub's Meetings list; it fills
   the name, date and time and a Join button (the hub meeting page link,
   knock-and-admit)."

   THE SAME LIST AS MEETINGS: rota events from today on, not archived,
   with a video room (egbc-core-meetings.js videoRoomFor - the room the
   planner picked, or the default for the meeting's type). Picking one
   hands back EGBCMailBlocks.meetingFrom(...): its name, day and time,
   and the hub's meeting page as the link (meeting.html?room=..&event=..)
   - knock and the host lets you in. Never a host link. Copying the room's
   own link from Meetings still works as before; this changes nothing there.

   HOW TO USE IT (needs EGBCAuth, EGBCMailBlocks, EGBCCoreMeetings):

     EGBCMeetingPick.open({ base: hubBase, onPick: function (block) {...},
                            note: 'words under the list' });
     EGBCMeetingPick.upcoming()  -> Promise of [{ ev, room, label }]
   =================================================================== */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function londonToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); }
  function roomFor(ev) {
    var M = global.EGBCCoreMeetings;
    return M && M.videoRoomFor ? M.videoRoomFor(ev) : String(ev.videoRoom || '');
  }
  function labelFor(room) {
    var M = global.EGBCCoreMeetings;
    return M && M.videoRoomLabel ? M.videoRoomLabel(room) : room;
  }
  function membersRoom(room) {
    /* Each room's own setting (EGBCAuth.membersRoom), never a list here. */
    return !!(global.EGBCAuth && EGBCAuth.membersRoom && EGBCAuth.membersRoom(room));
  }

  /* Only the meetings this person is invited to (main's H-17, 27 Oct: the
     hub's one rule, EGBCAuth.invitedTo, after loadPerms - a master admin and
     the meetingsAll permission see all). */
  function upcoming() {
    var today = londonToday();
    return Promise.resolve(EGBCAuth.loadPerms()).catch(function () {}).then(function () {
      return EGBCAuth.db.collection('events').where('date', '>=', today).get();
    }).then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function (ev) { return ev.archived !== true && roomFor(ev) && EGBCAuth.invitedTo(ev); })
        .sort(function (a, b) { return (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')); })
        .map(function (ev) { var r = roomFor(ev); return { ev: ev, room: r, label: labelFor(r), members: membersRoom(r) }; });
    });
  }

  function open(opts) {
    opts = opts || {};
    var back = document.createElement('div');
    back.className = 'egbc-meetpick';
    back.style.cssText = 'position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;';
    back.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Add a meeting" style="background:#fff;width:100%;max-width:560px;max-height:86vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px;box-sizing:border-box;font:400 14px/1.45 Inter,system-ui,sans-serif;color:#111827">' +
      '<div style="display:flex;align-items:center;gap:8px;margin:0 0 10px"><b style="flex:1;font-size:17px">Add a meeting</b>' +
      '<button type="button" data-close aria-label="Close" style="min-width:44px;min-height:44px;border:1px solid #d1d5db;border-radius:10px;background:#fff;font-size:18px;cursor:pointer">×</button></div>' +
      '<p style="margin:0 0 10px;color:#6b7280">From the hub’s Meetings list. Join opens the hub’s meeting page: people type their name and knock, and the host lets them in.</p>' +
      '<div data-list><p style="color:#6b7280">Finding the meetings…</p></div>' +
      (opts.note ? '<p style="margin:10px 0 0;color:#6b7280">' + esc(opts.note) + '</p>' : '') + '</div>';
    document.body.appendChild(back);
    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back || (e.target.closest && e.target.closest('[data-close]'))) close(); });
    var list = back.querySelector('[data-list]');
    upcoming().then(function (rows) {
      if (!rows.length) { list.innerHTML = '<p style="color:#6b7280">No meetings coming up. In the Rota Planner, pick a video room on a meeting to add it to Meetings.</p>'; return; }
      list.innerHTML = rows.map(function (r, k) {
        var b = global.EGBCMailBlocks.meetingFrom(r.ev, r.room, opts.base || '');
        return '<button type="button" data-k="' + k + '" style="display:flex;width:100%;text-align:left;gap:10px;align-items:center;min-height:56px;padding:10px 12px;margin:0 0 8px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;cursor:pointer;font:inherit;color:inherit">' +
          '<span style="flex:1"><b style="color:#3d6263">' + esc(b.title) + '</b><br><span style="color:#6b7280">' + esc(EGBCMailBlocks.meetingWhen(b)) + ' · ' + esc(r.label) + '</span></span>' +
          (r.members ? '<span style="font-size:12px;font-weight:600;background:#fdf3e1;color:#8a5f1e;border-radius:6px;padding:3px 7px;white-space:nowrap">Church members only</span>' : '') + '</button>';
      }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('[data-k]'), function (btn) {
        btn.onclick = function () {
          var r = rows[+btn.getAttribute('data-k')];
          close();
          if (opts.onPick) opts.onPick(EGBCMailBlocks.meetingFrom(r.ev, r.room, opts.base || ''), r);
        };
      });
    }, function (e) { list.innerHTML = '<p style="color:#b42318">Could not load the meetings: ' + esc(e && e.message || e) + '</p>'; });
    return back;
  }

  global.EGBCMeetingPick = { open: open, upcoming: upcoming };
})(typeof window !== 'undefined' ? window : this);
