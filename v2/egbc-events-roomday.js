/* ===================================================================
   EGBC rooms, on the day and after (EVENTS-BOOKINGS-BRIEF: "On the day",
   "Caterer view", "Reports"; F-260)
   ===================================================================
   ARRIVALS - the hirer, the member who booked, or the office marks a
   booking "arrived" (bookings.arrived { at, by, name }). A hire or a
   member's booking not marked arrived a set time after it starts (the
   site's arrivalGraceMins, 30 unless set; 0 = off) is FLAGGED: red on the
   office's Today tab, and the server emails the site's bookings address
   once (functions/rooms-day.js). Never cancelled: a paid hire stays.

   ROOM USE - per room, per month: hours open (the site's opening hours,
   08:00-22:00 unless set; closed days left out), hours booked (setting up
   and clearing away included; by kind), hours of the church's own Sunday
   and weekday services (the rota), and the use as a share of the open
   hours; and week by week. Counted in quarter-hours, so two bookings on
   top of each other are not counted twice.

   CATERING - cateringOrders/{bookingKey}: what the kitchen needs and
   nothing about who booked (made by the server from each confirmed
   booking with refreshments). The caterers (the "Catering" team) and the
   office see them by day and mark each prepared, then served.

     EGBCRoomDay.arrival(b, { today, nowMin, grace }) -> 'arrived'|'late'|'due'|'later'|'missed'|'none'
     EGBCRoomDay.useReport({ month, rooms, bookings, closures, openFrom, openTo, base }) -> { rooms, weeks, ... }
     EGBCRoomDay.drawToday / drawUse / drawCatering (el, ctx)
   =================================================================== */
(function (global) {
  'use strict';
  var FLAG_KINDS = ['hire', 'member'];
  var KIND_WORDS = { hire: 'hires', member: 'members', office: 'the office', event: 'events' };
  var OPEN_FROM = 8 * 60, OPEN_TO = 22 * 60, GRACE = 30;
  var CATERING_TEAM = 'Catering';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hhmm(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function hours(q) { var h = q / 4; return (Math.round(h * 4) / 4).toString(); }
  function grace(site) { var g = site && site.arrivalGraceMins; return g === 0 ? 0 : (+g > 0 ? +g : GRACE); }
  function openHours(site) { var f = site && +site.openFrom, t = site && +site.openTo; return (f >= 0 && t > f && t <= 1440) ? [f, t] : [OPEN_FROM, OPEN_TO]; }

  /* ---------------- arrivals ---------------- */
  function arrival(b, o) {
    if (!b || b.status !== 'confirmed') return 'none';
    if (b.arrived) return 'arrived';
    if (b.day > o.today) return 'later';
    if (b.day < o.today) return 'missed';
    if (FLAG_KINDS.indexOf(b.kind) < 0 || !o.grace) return 'due';
    return o.nowMin >= b.startMin + o.grace ? 'late' : 'due';
  }
  function atWords(a) {
    var t = a && a.at && (a.at.toDate ? a.at.toDate() : new Date(a.at));
    return t && !isNaN(t) ? hhmm(t.getHours() * 60 + t.getMinutes()) : '';
  }
  function markArrived(db, key, by, name) {
    return db.collection('bookings').doc(key).update({ arrived: { at: firebase.firestore.FieldValue.serverTimestamp(), by: by, name: String(name || '').slice(0, 120) } });
  }
  /* ctx: { list, rooms, site, db, myName, today, nowMin, reload, toast } */
  function drawToday(el, ctx) {
    var g = grace(ctx.site), roomName = function (id) { var r = (ctx.rooms || []).filter(function (x) { return x.id === id; })[0]; return r ? r.name : ''; };
    var those = (ctx.list || []).filter(function (b) { return b.day === ctx.today && b.status === 'confirmed'; }).sort(function (a, b) { return a.startMin - b.startMin; });
    var late = those.filter(function (b) { return arrival(b, { today: ctx.today, nowMin: ctx.nowMin, grace: g }) === 'late'; });
    el.innerHTML = '<div class="card" id="arrivals"><h3 style="margin:0 0 4px">Arrivals today</h3><p class="hint" style="margin:0 0 10px">' +
      (g ? 'A hire or a member’s booking not marked arrived ' + g + ' minutes after it starts is flagged here, and the bookings address is emailed once. Nothing is cancelled.' : 'Flagging is off for this site (Places).') + '</p>' +
      (late.length ? '<p class="st no" id="lateCount" style="margin:0 0 10px"><b>' + late.length + ' not arrived yet</b></p>' : '') +
      (those.length ? those.map(function (b) {
        var st = arrival(b, { today: ctx.today, nowMin: ctx.nowMin, grace: g }), q = b.requester || {};
        var chip = st === 'arrived' ? '<span class="pill ok" data-arr="arrived">Arrived ' + esc(atWords(b.arrived)) + (b.arrived.by && b.arrived.by !== 'office' ? ' (' + (b.arrived.by === 'hirer' ? 'the hirer said so' : 'they said so') + ')' : '') + '</span>'
          : st === 'late' ? '<span class="pill no" data-arr="late">Not arrived: due ' + hhmm(b.startMin) + (b.arrivalFlaggedAt ? ', office emailed' : '') + '</span>'
          : '<span class="pill wait" data-arr="due">Due ' + hhmm(b.startMin) + '</span>';
        return '<div class="bk" data-arrive="' + esc(b.key) + '" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line,#e2e8f0)">' +
          '<div style="flex:1;min-width:200px"><b>' + hhmm(b.startMin) + '–' + hhmm(b.endMin) + ' ' + esc(b.title || 'Booking') + '</b><br><span class="hint">' + esc(roomName(b.roomId)) + ' · ' + esc(q.name || b.memberName || '') + (q.phone ? ', ' + esc(q.phone) : '') + ' · ' + esc(KIND_WORDS[b.kind] || b.kind) + '</span></div>' +
          chip + (st === 'arrived' ? '<button class="btn sec" data-unarrive="' + esc(b.key) + '">Not arrived after all</button>' : '<button class="btn" data-markarrive="' + esc(b.key) + '">Mark arrived</button>') + '</div>';
      }).join('') : '<p class="hint">Nothing booked today.</p>') + '</div>';
    el.querySelectorAll('[data-markarrive]').forEach(function (btn) {
      btn.onclick = function () { btn.disabled = true; markArrived(ctx.db, btn.getAttribute('data-markarrive'), 'office', ctx.myName).then(ctx.reload, function (e) { btn.disabled = false; ctx.toast('Could not mark it: ' + (e.message || e)); }); };
    });
    el.querySelectorAll('[data-unarrive]').forEach(function (btn) {
      btn.onclick = function () { btn.disabled = true; ctx.db.collection('bookings').doc(btn.getAttribute('data-unarrive')).update({ arrived: firebase.firestore.FieldValue.delete() }).then(ctx.reload, function (e) { btn.disabled = false; ctx.toast('Could not change it: ' + (e.message || e)); }); };
    });
  }

  /* ---------------- room use ---------------- */
  function monthDays(month) {
    var p = month.split('-').map(Number), n = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(), out = [];
    for (var d = 1; d <= n; d++) out.push(month + '-' + String(d).padStart(2, '0'));
    return out;
  }
  function mondayOf(day) {
    var p = day.split('-').map(Number), t = new Date(Date.UTC(p[0], p[1] - 1, p[2])), w = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - w);
    return t.toISOString().slice(0, 10);
  }
  function closedOn(closures, roomId, day) {
    return (closures || []).some(function (c) { return c.status === 'on' && (c.roomId === roomId || (c.partIds || []).indexOf(roomId) >= 0) && (c.days || []).indexOf(day) >= 0; });
  }
  /* o: { month 'YYYY-MM', rooms, bookings, closures, openFrom, openTo, base(room, day) -> [96] (the rota), today? } */
  function useReport(o) {
    var from = Math.floor((o.openFrom == null ? OPEN_FROM : o.openFrom) / 15), to = Math.ceil((o.openTo == null ? OPEN_TO : o.openTo) / 15);
    var days = monthDays(o.month), weeks = {}, rows = [];
    (o.rooms || []).forEach(function (r) {
      var row = { id: r.id, name: r.name, open: 0, booked: 0, rota: 0, closed: 0, byKind: { hire: 0, member: 0, office: 0, event: 0 } };
      days.forEach(function (day) {
        var wk = mondayOf(day); weeks[wk] = weeks[wk] || {}; weeks[wk][r.id] = weeks[wk][r.id] || 0;
        if (closedOn(o.closures, r.id, day)) { row.closed++; return; }
        row.open += to - from;
        var taken = [];
        (o.bookings || []).forEach(function (b) {
          if (b.roomId !== r.id || b.day !== day || b.status !== 'confirmed') return;
          var a = b.slotFrom != null ? b.slotFrom : Math.floor((b.startMin - (b.setupMins || 0)) / 15), z = b.slotTo != null ? b.slotTo : Math.ceil((b.endMin + (b.packdownMins || 0)) / 15);
          for (var i = Math.max(a, from); i < Math.min(z, to); i++) if (!taken[i]) { taken[i] = b.kind || 'member'; }
        });
        var rota = o.base ? o.base(r, day) : [];
        for (var i = from; i < to; i++) {
          if (taken[i]) { row.booked++; row.byKind[taken[i]] = (row.byKind[taken[i]] || 0) + 1; weeks[wk][r.id]++; }
          else if (rota[i]) row.rota++;
        }
      });
      row.pct = row.open ? Math.round(row.booked / row.open * 1000) / 10 : 0;
      row.pctWithRota = row.open ? Math.round((row.booked + row.rota) / row.open * 1000) / 10 : 0;
      rows.push(row);
    });
    var tot = rows.reduce(function (a, r) { a.open += r.open; a.booked += r.booked; a.rota += r.rota; return a; }, { open: 0, booked: 0, rota: 0 });
    tot.pct = tot.open ? Math.round(tot.booked / tot.open * 1000) / 10 : 0;
    return { month: o.month, rows: rows, total: tot, weeks: Object.keys(weeks).sort().map(function (w) { return { from: w, rooms: weeks[w] }; }), openFrom: from * 15, openTo: to * 15 };
  }
  function csvOf(rep) {
    var q = function (s) { s = String(s == null ? '' : s); if (/^[=+\-@]/.test(s)) s = "'" + s; /* a spreadsheet must not run a name as a formula */ return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = [['Room', 'Hours open', 'Hours booked', 'Hires', 'Members', 'Office', 'Events', 'Church services (rota)', 'Closed days', 'Booked % of open', 'In use % (with services)'].join(',')];
    rep.rows.forEach(function (r) { lines.push([q(r.name), hours(r.open), hours(r.booked), hours(r.byKind.hire), hours(r.byKind.member), hours(r.byKind.office), hours(r.byKind.event), hours(r.rota), r.closed, r.pct, r.pctWithRota].join(',')); });
    return lines.join('\n') + '\n';
  }
  /* ctx: { rooms, list, site, db, base, closuresAll() -> Promise } */
  function drawUse(el, ctx) {
    var month = ctx.month || new Date().toISOString().slice(0, 7), oh = openHours(ctx.site);
    el.innerHTML = '<div class="card" id="roomUse"><p class="hint">Loading…</p></div>';
    Promise.resolve(ctx.closuresAll ? ctx.closuresAll() : []).then(function (closures) {
      var rep = useReport({ month: month, rooms: ctx.rooms, bookings: ctx.list, closures: closures, openFrom: oh[0], openTo: oh[1], base: ctx.base });
      var box = el.querySelector('#roomUse');
      box.innerHTML = '<div class="row" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><div class="f"><label class="l" for="u-month">Month</label><input class="inp" type="month" id="u-month" value="' + esc(month) + '"></div>' +
        '<p class="hint" style="margin:0;flex:1">Open ' + hhmm(oh[0]) + '–' + hhmm(oh[1]) + ' each day (Places sets the hours); closed days left out. Booked hours include setting up and clearing away.</p>' +
        '<button class="btn sec" id="u-csv">Download (CSV)</button></div>' +
        '<div style="overflow-x:auto"><table class="use" id="useTable" style="width:100%;border-collapse:collapse;margin-top:10px"><thead><tr><th style="text-align:left">Room</th><th>Hours open</th><th>Booked</th><th>Hires</th><th>Members</th><th>Office</th><th>Events</th><th>Church services</th><th>Closed days</th><th>Booked</th><th>In use, with services</th></tr></thead><tbody>' +
        rep.rows.map(function (r) {
          return '<tr data-useroom="' + esc(r.id) + '"><th style="text-align:left">' + esc(r.name) + '</th><td>' + hours(r.open) + '</td><td>' + hours(r.booked) + '</td><td>' + hours(r.byKind.hire) + '</td><td>' + hours(r.byKind.member) + '</td><td>' + hours(r.byKind.office) + '</td><td>' + hours(r.byKind.event) + '</td><td>' + hours(r.rota) + '</td><td>' + r.closed + '</td>' +
            '<td><b data-pct>' + r.pct + '%</b><div style="height:6px;background:#e2e8f0;border-radius:4px;margin-top:4px"><i style="display:block;height:100%;width:' + Math.min(100, r.pct) + '%;background:#5c8a8b;border-radius:4px"></i></div></td><td>' + r.pctWithRota + '%</td></tr>';
        }).join('') + '<tr data-usetotal><th style="text-align:left">All rooms</th><td>' + hours(rep.total.open) + '</td><td>' + hours(rep.total.booked) + '</td><td colspan="4"></td><td>' + hours(rep.total.rota) + '</td><td></td><td><b>' + rep.total.pct + '%</b></td><td></td></tr></tbody></table></div>' +
        '<h4 style="margin:16px 0 6px">Week by week (hours booked)</h4><div style="overflow-x:auto"><table id="useWeeks" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Week from</th>' + rep.rows.map(function (r) { return '<th>' + esc(r.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rep.weeks.map(function (w) { return '<tr><th style="text-align:left">' + esc(w.from) + '</th>' + rep.rows.map(function (r) { return '<td>' + hours(w.rooms[r.id] || 0) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      box.querySelectorAll('td,th').forEach(function (c) { c.style.padding = '6px 8px'; c.style.borderTop = '1px solid #e2e8f0'; if (c.tagName === 'TD') c.style.textAlign = 'right'; });
      box.querySelector('#u-month').onchange = function () { if (this.value) { ctx.month = this.value; drawUse(el, ctx); } };
      box.querySelector('#u-csv').onclick = function () {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csvOf(rep)], { type: 'text/csv' })); a.download = 'room-use-' + month + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      };
    });
  }

  /* ---------------- catering ---------------- */
  var DIET = { vegetarian: 'vegetarian', vegan: 'vegan', glutenFree: 'gluten-free', dairyFree: 'dairy-free' };
  function dietWords(d) { return Object.keys(d || {}).filter(function (k) { return +d[k] > 0; }).map(function (k) { return d[k] + ' ' + (DIET[k] || k); }).join(', '); }
  var STATE = { 'new': ['To prepare', 'wait'], prepared: ['Prepared', 'ok'], served: ['Served', 'ok'] };
  /* ctx: { orders, db, me: { uid, name }, fmtDate(day), from, days, reload, toast, title } */
  function drawCatering(el, ctx) {
    var byDay = {};
    (ctx.orders || []).forEach(function (o) { (byDay[o.day] = byDay[o.day] || []).push(o); });
    var days = Object.keys(byDay).sort();
    el.innerHTML = '<div class="noprint" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px"><p class="hint" style="margin:0;flex:1">What the kitchen needs, by day: numbers, times and dietary needs. Mark each prepared, then served.</p><button class="btn sec" id="c-print">Print the kitchen sheet</button></div>' +
      '<div id="print">' + (days.length ? days.map(function (d) {
        var list = byDay[d].sort(function (a, b) { return String(a.servingAt || hhmm(a.startMin)).localeCompare(String(b.servingAt || hhmm(b.startMin))); });
        return '<section class="card" data-cday="' + esc(d) + '"><h3 style="margin:0 0 8px">' + esc(ctx.fmtDate ? ctx.fmtDate(d) : d) + '</h3>' + list.map(function (o) {
          var st = STATE[o.state || 'new'] || STATE['new'];
          return '<div class="corder" data-corder="' + esc(o.id) + '" style="padding:10px 0;border-top:1px solid #e2e8f0;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start">' +
            '<div style="flex:1;min-width:220px"><b style="font-size:17px">' + esc(o.servingAt || hhmm(o.startMin)) + '</b> · ' + esc(o.roomName || '') + ' · ' + esc(o.people || '?') + ' people' +
            '<div>' + (o.items || []).map(function (i) { return '<b>' + esc(i.qty) + ' ×</b> ' + esc(i.name); }).join(', ') + '</div>' +
            (dietWords(o.dietary) ? '<div>Dietary: <b data-diet>' + esc(dietWords(o.dietary)) + '</b></div>' : '') + (o.notes ? '<div class="hint">' + esc(o.notes) + '</div>' : '') +
            '<div class="hint">' + esc(o.title || '') + '</div></div>' +
            '<div class="noprint" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="pill ' + st[1] + '" data-cstate="' + esc(o.state || 'new') + '">' + st[0] + (o.stateByName && o.state !== 'new' ? ' · ' + esc(o.stateByName) : '') + '</span>' +
            (o.state !== 'prepared' && o.state !== 'served' ? '<button class="btn" data-cset="prepared">Prepared</button>' : '') +
            (o.state !== 'served' ? '<button class="btn" data-cset="served">Served</button>' : '<button class="btn sec" data-cset="new">Undo</button>') + '</div></div>';
        }).join('') + '</section>';
      }).join('') : '<div class="card hint">No catering ordered in the next ' + (ctx.days || 14) + ' days.</div>') + '</div>';
    el.querySelectorAll('[data-cset]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest('[data-corder]').getAttribute('data-corder'); btn.disabled = true;
        ctx.db.collection('cateringOrders').doc(id).update({ state: btn.getAttribute('data-cset'), stateBy: ctx.me.uid, stateByName: String(ctx.me.name || '').slice(0, 120), stateAt: firebase.firestore.FieldValue.serverTimestamp() })
          .then(ctx.reload, function (e) { btn.disabled = false; ctx.toast('Could not mark it: ' + (e.message || e)); });
      };
    });
    var p = el.querySelector('#c-print'); if (p) p.onclick = function () { window.print(); };
  }

  var api = { arrival: arrival, markArrived: markArrived, drawToday: drawToday, grace: grace, openHours: openHours, useReport: useReport, csvOf: csvOf, drawUse: drawUse,
              drawCatering: drawCatering, dietWords: dietWords, monthDays: monthDays, mondayOf: mondayOf, CATERING_TEAM: CATERING_TEAM, FLAG_KINDS: FLAG_KINDS, OPEN_FROM: OPEN_FROM, OPEN_TO: OPEN_TO, GRACE: GRACE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCRoomDay = api;
})(typeof window !== 'undefined' ? window : this);
