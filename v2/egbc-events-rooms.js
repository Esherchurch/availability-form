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

  /* Floor area in square metres, to one decimal place, or 0 if not known.
     An area AS GIVEN (dims.area: an L-shaped room, a room with a bay, an
     architect's figure; Martin, 19 Oct; F-236) wins over length x width. */
  function area(room) {
    var d = (room && room.dims) || {};
    if (num(d.area)) return Math.round(num(d.area) * 10) / 10;
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

  /* THE ROOM AT A GLANCE, where a room is chosen to book (the reviewing
     window, 19 Oct; brief §6.18): its main photo, how many it holds set out
     the way asked, its floor area, its facilities, and the kit in it or
     movable to it - the same facts as room.html, at 375px. */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kitFor(room, kit) {
    kit = kit || [];
    return {
      here: kit.filter(function (k) { return k.active !== false && k.homeRoomId === room.id; }),
      movable: kit.filter(function (k) { return k.active !== false && k.movable && k.homeRoomId !== room.id && (!k.siteId || !room.siteId || k.siteId === room.siteId); })
    };
  }
  /* On a phone the photo is the card's full width, at its own shape (the
     reviewing window, 20 Oct); beside the words on a wider screen. */
  var CARD_CSS = '.rcard{display:grid;grid-template-columns:1fr;gap:10px;align-items:start;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin:0 0 12px}' +
    '.rcard img{width:100%;height:auto;border-radius:8px;display:block;background:#e5e7eb}.rcard .noph{width:100%;height:56px;border-radius:8px;background:#e5e7eb}' +
    '@media (min-width:700px){.rcard{grid-template-columns:200px 1fr}.rcard .noph{height:120px}}' +
    '.rcard b{color:#111827}.rcard .rf{font-size:13px;color:#4b5563;margin:2px 0}.rcard .chips{display:flex;flex-wrap:wrap;gap:4px 10px;margin:4px 0 0}' +
    '.rcard .chip{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:#374151}.rcard .chip i,.rcard .chip svg{width:14px;height:14px}' +
    '.rcard a{color:#3d6263;font-size:13px;font-weight:600}';
  function card(room, o) {
    o = o || {};
    if (!room) return '';
    if (typeof document !== 'undefined' && !document.getElementById('rcard-css')) {
      var st = document.createElement('style'); st.id = 'rcard-css'; st.textContent = CARD_CSS; document.head.appendChild(st);
    }
    var ph = mainPhoto(room), lay = o.layout && LAYOUTS.filter(function (x) { return x.id === o.layout; })[0], n = holds(room, o.layout), a = area(room), k = kitFor(room, o.kit);
    var facs = FACILITIES.filter(function (x) { return has(room, x.id); });
    var kitWords = function (list) { return list.map(function (x) { return esc(x.name) + (x.unlimited ? '' : ' (' + (+x.quantity || 0) + ')'); }).join(', '); };
    return '<div class="rcard" data-roomcard="' + esc(room.id) + '">' +
      (ph ? '<img src="' + esc(ph.url) + '" alt="' + esc(room.name) + '" loading="lazy"' + (ph.width && ph.height ? ' width="' + (+ph.width) + '" height="' + (+ph.height) + '" style="aspect-ratio:' + (+ph.width) + '/' + (+ph.height) + '"' : '') + '>' : '<div class="noph" aria-hidden="true"></div>') +
      '<div><b>' + esc(room.name) + '</b>' +
      '<div class="rf" data-holds="' + n + '">' + (n ? (lay ? 'Holds ' + n + ' set out ' + lay.label.toLowerCase() : 'Holds up to ' + n) : (lay ? 'Not set out ' + lay.label.toLowerCase() + ' here' : '')) +
        (a ? (n || lay ? ' · ' : '') + a + ' m²' : '') + '</div>' +
      (facs.length ? '<div class="chips">' + facs.map(function (x) { var c = (room.facilities || {})[x.id];
        return '<span class="chip" data-fac="' + x.id + '"><i data-lucide="' + x.icon + '"></i>' + esc(x.label) + (x.count ? ' ' + c : '') + '</span>'; }).join('') + '</div>' : '') +
      (k.here.length ? '<div class="rf" data-kithere>In the room: ' + kitWords(k.here) + '</div>' : '') +
      (k.movable.length ? '<div class="rf" data-kitmove>Can be brought in: ' + kitWords(k.movable) + '</div>' : '') +
      /* Members get the full room page, for hire or not (the reviewing
         window, 20 Oct: the hire-only page was a dead end for every room). */
      '<a data-more href="room.html?id=' + encodeURIComponent(room.id) + (o.member ? '&member=1' : '') + '" target="_blank" rel="noopener">More about this room</a></div></div>';
  }

  var api = { card: card, kitFor: kitFor, LAYOUTS: LAYOUTS, FACILITIES: FACILITIES, FLOORS: FLOORS, area: area, has: has, holds: holds,
              fit: fit, hireable: hireable, mainPhoto: mainPhoto, shrink: shrink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCRooms = api;

})(typeof window !== 'undefined' ? window : this);
