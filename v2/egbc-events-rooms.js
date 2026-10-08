/* ===================================================================
   EGBC — room profiles, the shared part (events window, Chunk 4 R1)
   ===================================================================

   places-admin.html edits a room's profile; hire.html and room.html show
   it to anyone. They share one list of layouts and facilities, one way
   of working out floor area, and one answer to "does this room fit what
   I need?".

   Rooms are referred to by id everywhere, never by name (Chunk 1), and
   a room's profile lives on its own document, so a rename changes
   nothing here.

   FIRE-SAFETY MAXIMUM. A room's fireMax is the most people it may ever
   hold, whatever the layout. fit() never offers a room for more, and the
   booking request (R2) will refuse more.
   =================================================================== */

(function (global) {
  'use strict';

  var LAYOUTS = [
    { id: 'theatre', label: 'Theatre', hint: 'rows of chairs facing the front' },
    { id: 'cabaret', label: 'Cabaret', hint: 'round tables, one side open' },
    { id: 'classroom', label: 'Classroom', hint: 'tables in rows' },
    { id: 'boardroom', label: 'Boardroom', hint: 'one long table' },
    { id: 'banquet', label: 'Banquet', hint: 'round tables, all seats' },
    { id: 'standing', label: 'Standing', hint: 'no chairs' }
  ];

  /* count: true when the number matters (how many tables, how many chairs). */
  var FACILITIES = [
    { id: 'projector', label: 'Projector and screen', icon: 'projector' },
    { id: 'pa', label: 'PA and microphones', icon: 'mic' },
    { id: 'loop', label: 'Hearing loop', icon: 'ear' },
    { id: 'piano', label: 'Piano', icon: 'piano' },
    { id: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
    { id: 'stage', label: 'Stage', icon: 'presentation' },
    { id: 'kitchen', label: 'Kitchen access', icon: 'cooking-pot' },
    { id: 'tables', label: 'Tables', icon: 'table-2', count: true },
    { id: 'chairs', label: 'Chairs', icon: 'armchair', count: true },
    { id: 'whiteboard', label: 'Whiteboard', icon: 'square-pen' },
    { id: 'parking', label: 'Parking', icon: 'car' },
    { id: 'babychange', label: 'Baby-change', icon: 'baby' },
    { id: 'accessibleToilet', label: 'Accessible toilet', icon: 'accessibility' }
  ];

  var FLOORS = [['', 'Not said'], ['carpet', 'Carpet'], ['wood', 'Wooden'], ['vinyl', 'Vinyl'], ['tiled', 'Tiled'], ['stone', 'Stone'], ['other', 'Other']];

  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }

  /* Floor area in square metres, to one decimal place, or 0 if not known. */
  function area(room) {
    var d = (room && room.dims) || {};
    var a = num(d.length) * num(d.width);
    return a ? Math.round(a * 10) / 10 : 0;
  }

  function has(room, fid) {
    var v = ((room && room.facilities) || {})[fid];
    return v === true || num(v) > 0;
  }

  /* How many a room holds in a layout. With no layout asked for, the most
     it holds in any layout, or its plain capacity from Chunk 1. Never more
     than its fire-safety maximum. */
  function holds(room, layout) {
    var l = (room && room.layouts) || {}, n;
    if (layout) n = num(l[layout]);
    else n = Math.max(num(room.capacity), LAYOUTS.reduce(function (m, x) { return Math.max(m, num(l[x.id])); }, 0));
    var fire = num(room.fireMax);
    return fire ? Math.min(n, fire) : n;
  }

  /* need: { people, layout, facilities: [ids] }. Returns { ok, why: [] },
     where why lists what is missing, in words, for the page to show. */
  function fit(room, need) {
    need = need || {};
    var why = [], people = num(need.people);
    if (need.layout && !num(((room.layouts) || {})[need.layout])) {
      why.push('not set out ' + (LAYOUTS.filter(function (x) { return x.id === need.layout; })[0] || {}).label.toLowerCase());
    } else if (people && holds(room, need.layout) < people) {
      why.push('holds ' + holds(room, need.layout) + (need.layout ? ' that way' : ''));
    }
    (need.facilities || []).forEach(function (fid) {
      if (!has(room, fid)) why.push('no ' + (FACILITIES.filter(function (x) { return x.id === fid; })[0] || { label: fid }).label.toLowerCase());
    });
    return { ok: !why.length, why: why };
  }

  /* The rooms an outside hirer may ask for: in use, at a site, for hire. */
  function hireable(rooms) {
    return (rooms || []).filter(function (r) { return r.active !== false && r.kind !== 'online' && r.bookableByHirers; });
  }

  function mainPhoto(room) { return ((room && room.photos) || [])[0] || null; }

  /* A picture, made no bigger than `edge` pixels on its longest side and
     saved as a JPEG, so the public pages stay fast (§6.18). A picture the
     browser cannot read (an iPhone HEIC on most computers) is refused with
     a reason, rather than stored at full size. */
  function shrink(file, edge, quality) {
    edge = edge || 1600;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, edge / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve({ blob: b, width: c.width, height: c.height }) : reject(new Error('The picture could not be made smaller.')); },
          'image/jpeg', quality || 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(file.name + ' could not be opened here. Save it as a JPEG or PNG first.')); };
      img.src = url;
    });
  }

  var api = { LAYOUTS: LAYOUTS, FACILITIES: FACILITIES, FLOORS: FLOORS, area: area, has: has, holds: holds,
              fit: fit, hireable: hireable, mainPhoto: mainPhoto, shrink: shrink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCRooms = api;

})(typeof window !== 'undefined' ? window : this);
