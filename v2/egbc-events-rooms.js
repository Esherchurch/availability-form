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
     movable to it - the same facts as room.html, at 375px. Also, further
     down, the same facts for two or three rooms side by side (compare). */
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

  /* STEP-FREE ACCESS (Martin, 20 Oct; F-240): room.access
       'stepfree'  Step-free
       'lift'      Step-free, by the lift
       'no'        Not step-free
       ''          Not checked yet - what a room nobody has set shows; NEVER "No"
     The old tick (accessible: true) still reads as step-free. */
  var ACCESS = [['', 'Not checked yet'], ['stepfree', 'Step-free'], ['lift', 'Step-free, by the lift'], ['no', 'Not step-free']];
  function access(room) {
    var a = room && room.access;
    if (a === 'stepfree' || a === 'lift' || a === 'no') return a;
    return room && room.accessible === true ? 'stepfree' : '';
  }
  function accessWords(room) { var k = access(room); return ACCESS.filter(function (x) { return x[0] === k; })[0][1]; }

  /* WHERE TO FIND IT: the room's floor (room.level). */
  var LEVELS = [['', 'Not said'], ['ground', 'Ground floor'], ['first', 'First floor'], ['second', 'Second floor'], ['lower', 'Lower ground floor'], ['outside', 'Outside']];
  function levelWords(room) { var k = (room && room.level) || ''; return (LEVELS.filter(function (x) { return x[0] === k; })[0] || LEVELS[0])[1]; }
  /* WHO SEES THE FLOOR PLAN (room.floorPlanWho; the storage rules say the same). */
  var PLAN_WHO = [['public', 'Anyone (public)'], ['members', 'Members and the office'], ['office', 'The office only']];

  /* "FILL IN YOUR ROOMS" (the reviewing window, 19 Oct): what a room still
     needs before members and hirers can see it properly. */
  function missing(room) {
    var out = [], r = room || {};
    if (!(r.photos || []).length) out.push(['photo', 'a main photo']);
    if (!area(r) && !((r.dims || {}).length && (r.dims || {}).width)) out.push(['size', 'its size']);
    if (!holds(r)) out.push(['holds', 'how many it holds']);
    if (!FACILITIES.some(function (x) { return has(r, x.id); })) out.push(['facilities', 'its facilities']);
    if (!String(r.description || '').trim()) out.push(['description', 'a description']);
    if (!access(r)) out.push(['access', 'step-free access (not checked yet)']);
    if (!r.level) out.push(['level', 'which floor it is on']);
    if (!r.fireMax) out.push(['fireMax', 'the fire-safety maximum (from the fire risk assessment)']);
    if (!r.floorPlan) out.push(['plan', 'a floor plan']);
    return out;
  }

  /* ROOMS SIDE BY SIDE (F-260): up to three rooms in one table - how many
     each holds every way it is set out (never past its fire-safety maximum),
     the maximum itself, floor area, floor, step-free access, natural light
     and every facility. Built from the same facts as the room card and
     room.html; a fact nobody has filled in says "Not said", never "No".
     o: { sites: {id: name}, member: true } */
  var COMPARE_MAX = 3;
  var CMP_CSS = '.rcmp{width:100%;border-collapse:collapse;font-size:13.5px}.rcmp th,.rcmp td{border-bottom:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top}' +
    '.rcmp thead th{color:#111827;font-weight:700}.rcmp tbody th{color:#6b7280;font-weight:500;white-space:nowrap}.rcmp img{width:100%;max-width:180px;height:auto;border-radius:6px;display:block}' +
    '.rcmp .best{font-weight:700;color:#15803d}.rcmp .no{color:#9ca3af}.rcmpw{overflow-x:auto}';
  function compare(rooms, o) {
    o = o || {};
    rooms = (rooms || []).filter(Boolean).slice(0, COMPARE_MAX);
    if (!rooms.length) return '';
    if (typeof document !== 'undefined' && !document.getElementById('rcmp-css')) {
      var st = document.createElement('style'); st.id = 'rcmp-css'; st.textContent = CMP_CSS; document.head.appendChild(st);
    }
    var row = function (key, label, cells) { return '<tr data-crow="' + key + '"><th scope="row">' + esc(label) + '</th>' + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; };
    /* a number row: the biggest is marked, a 0 reads as "-" */
    var nums = function (key, label, vals, unit) {
      var top = Math.max.apply(null, vals);
      return row(key, label, vals.map(function (v) { return v ? '<span' + (v === top && rooms.length > 1 && vals.filter(function (x) { return x === top; }).length < vals.length ? ' class="best"' : '') + ' data-n="' + v + '">' + v + (unit || '') + '</span>' : '<span class="no" data-n="0">-</span>'; }));
    };
    var said = function (w) { return w === 'Not said' || w === 'Not checked yet' ? '<span class="no">' + w + '</span>' : esc(w); };
    var out = '<div class="rcmpw"><table class="rcmp" id="cmpTable"><thead><tr><th></th>' + rooms.map(function (r) { return '<th scope="col" data-croom="' + esc(r.id) + '">' + esc(r.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    out += row('photo', 'Photo', rooms.map(function (r) { var p = mainPhoto(r); return p ? '<img src="' + esc(p.url) + '" alt="' + esc(r.name) + '" loading="lazy">' : '<span class="no">No photo yet</span>'; }));
    if (o.sites) out += row('site', 'Where', rooms.map(function (r) { return esc(o.sites[r.siteId] || ''); }));
    LAYOUTS.forEach(function (x) {
      if (rooms.some(function (r) { return num((r.layouts || {})[x.id]); })) out += nums('lay-' + x.id, x.label, rooms.map(function (r) { return holds(r, x.id); }));
    });
    out += nums('holds', 'Holds at most', rooms.map(function (r) { return holds(r); }));
    out += nums('fire', 'Fire-safety maximum', rooms.map(function (r) { return num(r.fireMax); }));
    out += nums('area', 'Floor area', rooms.map(function (r) { return area(r); }), ' m²');
    out += row('level', 'Floor', rooms.map(function (r) { return said(levelWords(r)); }));
    out += row('access', 'Step-free', rooms.map(function (r) { return said(accessWords(r)); }));
    out += row('light', 'Natural light', rooms.map(function (r) { return r.naturalLight ? 'Yes' : '<span class="no">Not said</span>'; }));
    FACILITIES.forEach(function (x) {
      if (!rooms.some(function (r) { return has(r, x.id); })) return;
      out += row('fac-' + x.id, x.label, rooms.map(function (r) { var v = (r.facilities || {})[x.id]; return has(r, x.id) ? (x.count ? String(num(v)) : 'Yes') : '<span class="no">-</span>'; }));
    });
    out += row('more', '', rooms.map(function (r) { return '<a href="room.html?id=' + encodeURIComponent(r.id) + (o.member ? '&member=1' : '') + '" target="_blank" rel="noopener">More about this room</a>'; }));
    return out + '</tbody></table></div>';
  }

  /* The picker for it: three "Room" boxes; the table redraws as they change. */
  function drawCompare(el, rooms, o) {
    o = o || {};
    var pick = (o.pick || []).slice(0, COMPARE_MAX);
    function draw() {
      var chosen = pick.map(function (id) { return rooms.filter(function (r) { return r.id === id; })[0]; }).filter(Boolean);
      el.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px">' + [0, 1, 2].map(function (i) {
        return '<label style="flex:1 1 150px;font-size:13px;color:#6b7280">Room ' + (i + 1) + '<br><select data-cmppick="' + i + '" style="width:100%;min-height:40px">' +
          '<option value="">' + (i < 2 ? 'Choose a room' : '(optional)') + '</option>' + rooms.map(function (r) {
            return '<option value="' + esc(r.id) + '"' + (pick[i] === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select></label>';
      }).join('') + '</div>' +
        (chosen.length ? compare(chosen, o) : '<p style="color:#6b7280;font-size:13.5px" id="cmpEmpty">Choose two or three rooms to see them side by side.</p>');
      [].forEach.call(el.querySelectorAll('[data-cmppick]'), function (s) {
        s.onchange = function () { pick[+s.dataset.cmppick] = s.value; pick = pick.slice(0, COMPARE_MAX); draw(); };
      });
    }
    draw();
  }

  var api = { compare: compare, drawCompare: drawCompare, COMPARE_MAX: COMPARE_MAX, LEVELS: LEVELS, levelWords: levelWords, PLAN_WHO: PLAN_WHO, missing: missing, ACCESS: ACCESS, access: access, accessWords: accessWords, card: card, kitFor: kitFor, LAYOUTS: LAYOUTS, FACILITIES: FACILITIES, FLOORS: FLOORS, area: area, has: has, holds: holds,
              fit: fit, hireable: hireable, mainPhoto: mainPhoto, shrink: shrink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCRooms = api;

})(typeof window !== 'undefined' ? window : this);
