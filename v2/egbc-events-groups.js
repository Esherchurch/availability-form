/* ===================================================================
   EGBC — small groups, the shared part (Chunk 7, events window)
   ===================================================================

   groups.html (find a group, ask to join, your groups) and
   groups-admin.html (the groups, their members and requests) share these
   answers. EVENTS-BOOKINGS-BRIEF §6.15.

   WHAT IS PUBLIC AND WHAT IS NOT
   - A group's card (smallGroups): name, what it is, when, roughly where
     (a room, a venue, "online", or for a home group only its AREA), who it
     is for, open or full, its leaders' names. Public groups are open to
     anyone; members-only groups to signed-in members.
   - A home group's ADDRESS, and an online group's meeting link, are in
     smallGroupPrivate: the group's members, its leaders and the groups
     admins only.
   - Who is in a group (smallGroupMembers): the group itself, its leaders
     and the groups admins.

   Nothing here reads or writes the database.
   =================================================================== */

(function (global) {
  'use strict';

  var DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var FREQ = { weekly: 'Every week', fortnightly: 'Every other week', monthly: 'Once a month', other: '' };
  var TYPES = ['Home group', 'Bible study', 'Prayer', 'Course', 'Young adults', 'Youth', 'Social', 'Other'];

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  /* "Tuesdays, 7.30pm, every week" */
  function when(g) {
    var bits = [];
    if (g.day >= 1 && g.day <= 7) bits.push(DAYS[g.day] + 's');
    if (g.time) {
      var h = +g.time.slice(0, 2), m = g.time.slice(3, 5);
      bits.push((h % 12 || 12) + (m !== '00' ? '.' + m : '') + (h < 12 ? 'am' : 'pm'));
    }
    var f = g.frequency === 'other' ? (g.frequencyNote || '') : (FREQ[g.frequency] || '');
    if (f) bits.push(f.toLowerCase());
    return bits.join(', ') || 'Times to be arranged';
  }

  /* Where, as anyone may see it: never a home address. look: { sites, rooms } names by id. */
  function wherePublic(g, look) {
    look = look || {};
    if (g.locationKind === 'online') return 'Online';
    if (g.locationKind === 'home') return 'In a home' + (g.area ? ' in ' + g.area : '');
    if (g.locationKind === 'venue') return g.venueName || 'Elsewhere';
    if (g.locationKind === 'room') {
      var r = (look.rooms || {})[g.roomId], s = (look.sites || {})[g.siteId];
      return [r, s].filter(Boolean).join(', ') || 'At church';
    }
    return '';
  }

  function full(g) { return g.capacity > 0 && (g.memberCount || 0) >= g.capacity; }
  /* Can someone ask to join? */
  function joinable(g) { return g.active !== false && g.open !== false && !full(g); }
  function status(g) {
    if (g.open === false) return 'Not taking new members';
    if (full(g)) return 'Full';
    return 'Open to new members';
  }

  /* The filters on "Find a group": day, area, type, and words. */
  function matches(g, f) {
    f = f || {};
    if (f.day && +f.day !== +g.day) return false;
    if (f.type && f.type !== g.type) return false;
    if (f.area && norm(g.area).indexOf(norm(f.area)) < 0 && norm(wherePublic(g, f.look)).indexOf(norm(f.area)) < 0) return false;
    if (f.q) {
      var hay = norm([g.name, g.description, g.type, g.audience, g.area, (g.leaderNames || []).join(' ')].join(' '));
      if (hay.indexOf(norm(f.q)) < 0) return false;
    }
    if (f.openOnly && !joinable(g)) return false;
    return true;
  }
  function areas(groups) {
    var seen = {};
    (groups || []).forEach(function (g) { if (g.area) seen[g.area.trim()] = 1; });
    return Object.keys(seen).sort();
  }

  /* The id of someone's place in a group: the group, and which person store. */
  function memberKey(groupId, personKind, personId) { return groupId + '__' + (personKind === 'contacts' ? 'c' : 'a') + '_' + personId; }

  /* A request to join, checked before it is sent. */
  function requestProblems(r) {
    var out = [];
    if (!String(r.name || '').trim()) out.push('your name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(r.email || '').trim())) out.push('an email address');
    return out;
  }

  global.EGBCGroups = { DAYS: DAYS, FREQ: FREQ, TYPES: TYPES, norm: norm, when: when, wherePublic: wherePublic, full: full, joinable: joinable,
    status: status, matches: matches, areas: areas, memberKey: memberKey, requestProblems: requestProblems };

})(typeof window !== 'undefined' ? window : this);
