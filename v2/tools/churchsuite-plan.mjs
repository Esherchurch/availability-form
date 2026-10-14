/* ===================================================================
   The ChurchSuite import's plan: what to make, worked out from the
   church's own files, and nothing written. Events window (Martin,
   14 Oct 2026). tools/import-churchsuite.mjs prints it (the dry run)
   and writes it.

   NOTHING ABOUT ONE CHURCH IS IN HERE. Everything comes from the files:
     rooms.md        the site line ("Site: <name>, <address> <postcode>"),
                     a table of rooms (name, floor, capacity, "Was in
                     ChurchSuite" names), and notes: which ChurchSuite
                     words mean the whole site ("..." in a line saying
                     "whole site"), what is not a room ("The x is ... not a
                     room"), and the off-site places ("Off-site places (...)").
                     A room written "Big Hall (East + West together)" is
                     made of the rooms "Big Hall – East" and "Big Hall –
                     West": bookable whole or in parts (F-174).
     cs-embed.json   ChurchSuite's public calendar feed (Everyone)
     cs-nonpublic.md the members-only ones, one line each:
                     "- Name xN (when) — places — category — visibility"
   and from the options (the choices one church makes when it runs it):
     rotaCategories  ChurchSuite categories that are services (they go to
                     the rota, which the hub keeps, not to events)
     asBooking       names to make room bookings (also any category with
                     "hire" in it)
     asMaintenance   names to make maintenance jobs
     place           { "Name": "Room" } for bookings with no place given
     teams           the hub's team names, to link youth events to
     today, until    the window (upcoming only; until the end of the year)

   NEVER PEOPLE: no sign-ups, members or contacts are read or made. A
   place that is somebody's home is shown only as "Off site". Every id is
   made from ChurchSuite's own, so running it twice makes nothing twice.
   =================================================================== */

export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const IMPORTER = 'churchsuite-import';

export function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x'; }
export function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const dayOf = (s) => new Date(s + 'T12:00:00Z');
const addDays = (s, n) => { const d = dayOf(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const dowOf = (s) => dayOf(s).getUTCDay();

/* A London wall-clock time as UTC milliseconds (summer and winter). */
export function londonUtc(localIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localIso);
  if (!m) return null;
  const F = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const offset = (t) => { const p = {}; F.formatToParts(new Date(t)).forEach((x) => { p[x.type] = +x.value; }); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60000) * 60000; };
  const w = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return w - offset(w - offset(w));
}

/* ---------------------------------------------------------- rooms.md */
export function parseRooms(md) {
  const text = String(md || '').replace(/\r\n/g, '\n');
  const out = { site: null, rooms: [], wholeSite: [], notRooms: [], offsite: [], warnings: [] };
  const sm = /^Site:\s*(.+)$/m.exec(text);
  if (sm) {
    const all = sm[1].trim(), i = all.indexOf(',');
    const name = (i < 0 ? all : all.slice(0, i)).trim(), rest = i < 0 ? '' : all.slice(i + 1).trim();
    const pc = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i.exec(rest);
    out.site = { name, address: (pc ? rest.slice(0, pc.index) : rest).replace(/[,\s]+$/, '').trim(), postcode: pc ? pc[1].toUpperCase() : '' };
  } else out.warnings.push('rooms.md has no "Site:" line: no site can be made.');
  const lines = text.split('\n').filter((l) => /^\s*\|/.test(l));
  if (lines.length >= 2) {
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(lines[0]).map((h) => h.toLowerCase());
    const col = (w) => head.findIndex((h) => h.indexOf(w) >= 0);
    const cN = col('room'), cF = col('floor'), cC = col('capacity'), cW = col('churchsuite');
    lines.slice(1).filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).forEach((l, n) => {
      const c = cells(l), raw = c[cN] || '';
      if (!raw) return;
      const whole = /^(.+?)\s*\((.+?)\s+together\)\s*$/i.exec(raw);
      const cap = parseInt((c[cC] || '').replace(/[^0-9]/g, ''), 10);
      const was = (c[cW] || '').split('/').map((x) => x.trim()).filter((x) => x && !/^[—–-]+$/.test(x));
      out.rooms.push({ name: whole ? whole[1].trim() : raw, floor: c[cF] || '', capacity: isFinite(cap) ? cap : 0, was, order: n + 1,
        partWords: whole ? whole[2].split(/\s*\+\s*/).map((w) => w.trim()) : [] });
    });
  } else out.warnings.push('rooms.md has no table of rooms.');
  /* Parts: "Big Hall – East" and so on. */
  out.rooms.forEach((r) => {
    r.partNames = r.partWords.map((w) => {
      const hit = out.rooms.find((x) => x !== r && norm(x.name) === norm(r.name + w)) ||
                  out.rooms.find((x) => x !== r && norm(x.name).indexOf(norm(r.name)) === 0 && norm(x.name).indexOf(norm(w)) >= 0);
      if (!hit) out.warnings.push('"' + r.name + '" is made of "' + w + '", but no room of that name is in the table.');
      return hit ? hit.name : null;
    }).filter(Boolean);
  });
  text.split('\n').filter((l) => /^\s*-\s/.test(l)).forEach((b) => {
    if (/whole site/i.test(b)) (b.match(/"([^"]+)"/g) || []).forEach((q) => out.wholeSite.push(q.replace(/"/g, '')));
    const nr = /The ([^.]+?) is (?:included|not a room)/i.exec(b);
    if (nr && /not a room/i.test(b)) out.notRooms.push(nr[1].trim());
    const os = /off-site places\s*\(([^)]*)\)/i.exec(b);
    if (os) os[1].split(',').forEach((x) => { const t = x.replace(/"/g, '').replace(/^the\s+/i, '').trim(); if (t) out.offsite.push(t); });
  });
  return out;
}

/* ------------------------------------------------------------ when */
function time24(t, mer) {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t); if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0);
  if (mer === 'pm' && h < 12) h += 12; if (mer === 'am' && h === 12) h = 0;
  return pad(h) + ':' + pad(mi);
}
function timeRange(s) {
  const m = /(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*-\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)/i.exec(s);
  if (!m) return null;
  const endMer = m[4].toLowerCase(); let startMer = (m[2] || '').toLowerCase();
  if (!startMer) { startMer = endMer; const sh = parseInt(m[1], 10), eh = parseInt(m[3], 10); if (endMer === 'pm' && sh > eh && eh !== 12) startMer = 'am'; }
  return { start: time24(m[1], startMer), end: time24(m[3], endMer) };
}
function dateIn(dd, mon, year, today) {
  const mi = MONTHS.indexOf(String(mon).slice(0, 3).toLowerCase()); if (mi < 0) return null;
  let d = year + '-' + pad(mi + 1) + '-' + pad(+dd);
  if (today && d < addDays(today, -180)) d = (year + 1) + '-' + pad(mi + 1) + '-' + pad(+dd);
  return d;
}
/* "Wed 7-9pm, Sat 5:30-7:30pm, 14 Oct..30 Dec", "Sat 17 Oct, 31 Oct 10am-12pm",
   "Mon 26 Oct, all day", "19-26 Nov; 28 Dec..". -> [{ day, endDay?, start, end, allDay }] */
export function parseWhen(s, n, o) {
  const year = o.year, today = o.today, until = o.until, warn = o.warn || (() => {});
  const segs = String(s).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const pats = [], dates = [], spans = []; let range = null, t = null, allDay = /all day/i.test(s);
  segs.forEach((seg) => {
    const tr = timeRange(seg); if (tr) t = t || tr;
    let m;
    if ((m = /^(\d{1,2})\s+([A-Za-z]{3,})\s*\.\.\s*(?:(\d{1,2})\s+([A-Za-z]{3,}))?/.exec(seg))) {
      range = { from: dateIn(m[1], m[2], year, today), to: m[3] ? dateIn(m[3], m[4], year, today) : null }; return;
    }
    if ((m = /^(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,})/.exec(seg))) { spans.push({ from: dateIn(m[1], m[3], year, today), to: dateIn(m[2], m[3], year, today) }); return; }
    if ((m = /^(?:([A-Za-z]{3})[a-z]*\s+)?(\d{1,2})\s+([A-Za-z]{3,})/.exec(seg)) && MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) >= 0) {
      dates.push({ day: dateIn(m[2], m[3], year, today), time: tr }); return;
    }
    if ((m = /^([A-Za-z]{3})[a-z]*\b/.exec(seg)) && DOW.indexOf(m[1].toLowerCase()) >= 0) pats.push({ dow: DOW.indexOf(m[1].toLowerCase()), time: tr });
  });
  const out = [];
  dates.forEach((d) => { const tt = d.time || t; out.push({ day: d.day, start: tt ? tt.start : '00:00', end: tt ? tt.end : '23:59', allDay: !tt }); });
  spans.forEach((x) => out.push({ day: x.from, endDay: x.to, start: '00:00', end: '23:59', allDay: true }));
  if (range && !pats.length && !dates.length) {
    if (!range.to) warn('runs on with no end date given: shown until ' + until);
    out.push({ day: range.from, endDay: range.to || until, start: '00:00', end: '23:59', allDay: true });
  }
  if (range && pats.length) {
    const to = range.to || until;
    if (!range.to) warn('repeats with no end date given: made until ' + until);
    const per = pats.map((p) => { const l = []; for (let d = range.from; d <= to; d = addDays(d, 1)) if (dowOf(d) === p.dow) l.push(d); return { p, l }; });
    let total = per.reduce((a, x) => a + x.l.length, 0);
    /* "x5" across nine Tuesdays: every other one. */
    if (n && per.length === 1 && total > n && n > 1 && (per[0].l.length - 1) % (n - 1) === 0) {
      const k = (per[0].l.length - 1) / (n - 1); per[0].l = per[0].l.filter((d, i) => i % k === 0); total = per[0].l.length;
    }
    per.forEach((x) => { const tt = x.p.time || t; x.l.forEach((d) => out.push({ day: d, start: tt ? tt.start : '00:00', end: tt ? tt.end : '23:59', allDay: !tt })); });
  }
  if (allDay) out.forEach((x) => { if (!x.endDay) { x.allDay = true; x.start = '00:00'; x.end = '23:59'; } });
  out.sort((a, b) => (a.day < b.day ? -1 : 1));
  if (n && out.length !== n) warn('ChurchSuite says x' + n + ' but the dates written give ' + out.length + ': check them');
  return out;
}

/* -------------------------------------------------- cs-nonpublic.md */
export function parseNonPublic(md, o) {
  const text = String(md || '').replace(/\r\n/g, '\n');
  const yr = /read\s+\d{1,2}\s+[A-Za-z]+\s+(\d{4})/i.exec(text);
  const year = yr ? +yr[1] : +String(o.today).slice(0, 4);
  const out = [];
  text.split('\n').forEach((line) => {
    /* The first (...) is when; anything after it, split on "—". (A later
       bracket, "(Full View)", belongs to the visibility.) */
    const m = /^-\s+(.+?)\s+x(\d+)\s+\(([^)]*)\)\s*((?:—.*)?)$/.exec(line.trim());
    if (!m) return;
    const parts = m[4].split('—').map((x) => x.trim()).filter(Boolean);
    const vis = parts.length ? parts[parts.length - 1] : '', cat = parts.length >= 2 ? parts[parts.length - 2] : '', places = parts.length >= 3 ? parts[0] : '';
    const warnings = [];
    const whens = parseWhen(m[3], +m[2], { year, today: o.today, until: o.until, warn: (w) => warnings.push(w) });
    out.push({ name: m[1].trim(), count: +m[2], whenText: m[3], places: places ? places.split(',').map((x) => x.trim()).filter(Boolean) : [], category: cat,
      visibility: /members only|my churchsuite/i.test(vis) ? 'members' : 'public', whens, warnings, description: '' });
  });
  return out;
}

/* ------------------------------------------------------------ the plan */
export function plan(input, options) {
  const o = Object.assign({ rotaCategories: [], asBooking: [], asMaintenance: [], place: {}, capacity: {}, teams: [], today: new Date().toISOString().slice(0, 10) }, options || {});
  o.until = o.until || (String(o.today).slice(0, 4) + '-12-31');
  const nowIso = o.nowIso || new Date().toISOString();
  const R = parseRooms(input.roomsMd);
  const P = { site: null, rooms: [], venues: [], pictures: [], events: [], eventBookings: [], bookings: [], groups: [], meetings: [], jobs: [], rota: [], skipped: [], warnings: R.warnings.slice() };
  if (!R.site) return P;
  const siteId = 'site_cs_' + slug(R.site.name);
  P.site = { id: siteId, data: { name: R.site.name, address: R.site.address, postcode: R.site.postcode, lat: null, lng: null, active: true, order: 1, importedFrom: 'churchsuite' } };
  const COLOURS = ['#3d6263', '#7a5f4a', '#4a5f7a', '#5f7a4a', '#7a4a5f', '#6b4a7a', '#8a4a3d', '#3d6b5f', '#4f5a66'];
  const byName = {};
  R.rooms.forEach((r, i) => {
    const id = 'room_cs_' + slug(r.name);
    byName[norm(r.name)] = id;
    P.rooms.push({ id, name: r.name, was: r.was, data: { name: r.name, kind: 'room', siteId, videoRoom: '', capacity: r.capacity, colour: COLOURS[i % COLOURS.length],
      accessible: false, bookableByMembers: true, bookableByHirers: false, description: r.floor ? 'On the ' + r.floor.toLowerCase() + (/floor|outside/i.test(r.floor) ? '' : ' floor') + '.' : '',
      photoUrl: '', active: true, order: r.order, parts: [], importedFrom: 'churchsuite' }, partNames: r.partNames });
  });
  P.rooms.forEach((r) => { r.data.parts = r.partNames.map((n) => byName[norm(n)]).filter(Boolean); delete r.partNames; });
  if (P.rooms.some((r) => r.data.parts.length)) P.warnings.push('Rooms made of parts need the new booking rules live (switch-over) before members can book the whole room themselves (FINDINGS-events F-174). Office bookings work either way.');
  /* Which hub room a ChurchSuite place name is. */
  const alias = {};
  P.rooms.forEach((r) => { alias[norm(r.name)] = r.id; r.was.forEach((w) => { alias[norm(w)] = r.id; }); });
  const whole = R.wholeSite.map(norm).concat([norm(R.site.name)]);
  const notRoom = R.notRooms.map(norm);
  const online = R.offsite.filter((x) => /zoom|online|teams|video/i.test(x)).map(norm);
  const known = R.offsite.filter((x) => !/zoom|online|teams|video|home/i.test(x)).map(norm);
  const venues = {};
  function venue(name, home) {
    const shown = home ? 'Off site' : (norm(name) === 'various' ? 'Various places' : name);
    const id = 'venue_cs_' + slug(shown);
    if (!venues[id]) { venues[id] = { id, data: { name: shown, address: '', postcode: '', active: true, importedFrom: 'churchsuite' } }; P.venues.push(venues[id]); }
    return { kind: 'venue', venueId: id, venueName: shown };
  }
  function place(name) {
    const n = norm(name);
    if (!n) return { kind: 'site' };
    if (alias[n]) return { kind: 'room', roomIds: [alias[n]] };
    if (whole.indexOf(n) >= 0 || whole.indexOf(n.replace(/church$/, '') + 'church') >= 0) return { kind: 'site' };
    if (notRoom.some((x) => n.indexOf(x) >= 0)) return { kind: 'ignore' };
    if (online.some((x) => n.indexOf(x) >= 0)) return { kind: 'online' };
    if (known.some((x) => n.indexOf(x) >= 0 || x.indexOf(n) >= 0)) return venue(name, false);
    return Object.assign(venue(name, true), { home: true, original: name });
  }
  /* "Upper Front, Kitchen, upstairs": a comma can be inside one place's
     name ("Kitchen, upstairs"), so pieces are joined back when together
     they are a room's old name. */
  function joinPlaces(places) {
    const out = [];
    for (let i = 0; i < places.length; i++) {
      let hit = 0;
      for (let k = places.length; k > i + 1 && !hit; k--) if (alias[norm(places.slice(i, k).join(','))]) hit = k;
      if (hit) { out.push(places.slice(i, hit).join(', ')); i = hit - 1; } else out.push(places[i]);
    }
    return out;
  }
  function locationOf(placesIn, what) {
    const places = joinPlaces(placesIn);
    const ps = places.map(place);
    const rooms = ps.filter((p) => p.kind === 'room').reduce((a, p) => a.concat(p.roomIds), []);
    ps.filter((p) => p.home).forEach((p) => P.warnings.push(what + ': "' + p.original + '" looks like someone\'s home, so it is shown only as "Off site" (never its name).'));
    ps.filter((p) => p.kind === 'ignore').forEach((p, i) => P.warnings.push(what + ': "' + places[ps.indexOf(p)] + '" is not a room (rooms.md), so it is left out.'));
    if (rooms.length) return { kind: 'room', siteId, roomIds: rooms.filter((x, i, a) => a.indexOf(x) === i), setupMins: 0, packMins: 0 };
    const on = ps.find((p) => p.kind === 'online'); if (on) return { kind: 'online', videoRoom: '' };
    const v = ps.find((p) => p.kind === 'venue'); if (v) return { kind: 'venue', venueId: v.venueId, venueName: v.venueName };
    return { kind: 'room', siteId, roomIds: [], setupMins: 0, packMins: 0 };
  }
  const teamFor = (cat, title) => o.teams.find((t) => norm(cat) === norm(t)) || o.teams.find((t) => norm(title).indexOf(norm(t)) >= 0) || '';
  function categoryOf(cat, title, team) {
    const t = (cat + ' ' + title).toLowerCase();
    if (team) return /kid/i.test(team) ? 'kids' : (o.under18 || []).indexOf(team) >= 0 || /youth/i.test(team) ? 'youth' : 'other';
    if (/\bkids?\b|children|creche/.test(t)) return 'kids';
    if (/youth|teen/.test(t)) return 'youth';
    if (/prayer/.test(t)) return 'prayer';
    if (/worship|music|choir|carol/.test(t)) return 'music';
    if (/club|cafe|social|film|art/.test(t)) return 'social';
    return /general|community/.test(t) ? 'community' : 'other';
  }
  const kindOf = (name, cat) => {
    if (o.rotaCategories.some((c) => norm(c) === norm(cat))) return 'rota';
    if (o.asMaintenance.some((n) => norm(n) === norm(name))) return 'job';
    if (o.asBooking.some((n) => norm(n) === norm(name)) || /hire/i.test(cat)) return 'booking';
    if (/small\s*group/i.test(cat)) return 'group';
    return 'event';
  };

  /* Everything, as { name, category, visibility, description, places, image, signup, items: [{ id, day, endDay, start, end, allDay }] } */
  const all = [];
  const embed = Array.isArray(input.embed) ? input.embed : [];
  const groupsOf = {};
  embed.forEach((e) => {
    const k = e.name; if (!groupsOf[k]) groupsOf[k] = [];
    groupsOf[k].push(e);
  });
  Object.keys(groupsOf).forEach((k) => {
    const l = groupsOf[k].slice().sort((a, b) => (a.datetime_start < b.datetime_start ? -1 : 1)), e = l[0], so = e.signup_options || {};
    const imgs = l.map((x) => x.images && !Array.isArray(x.images) && x.images.lg && x.images.lg.url).filter(Boolean);
    all.push({ name: k, category: (e.category && e.category.name) || '', visibility: 'public', description: e.description || '',
      places: (e.location && e.location.name) ? [e.location.name] : [], image: imgs[0] || '', imageCount: imgs.filter((x, i, a) => a.indexOf(x) === i).length,
      signup: { on: so.signup_enabled === '1', capacity: +e.capacity || 0, selfCancel: so.signup_cancel === '1' }, source: 'embed', warnings: [],
      items: l.map((x) => {
        const s = String(x.datetime_start), en = String(x.datetime_end || x.datetime_start);
        const allDay = s.slice(11, 16) === '00:00' && (en.slice(11, 16) === '23:59' || en.slice(0, 10) > s.slice(0, 10));
        return { id: String(x.identifier || x.id), day: s.slice(0, 10), endDay: en.slice(0, 10) > s.slice(0, 10) ? en.slice(0, 10) : '', start: s.slice(11, 16), end: en.slice(11, 16), allDay };
      }) });
  });
  parseNonPublic(input.nonPublicMd, o).forEach((e) => {
    all.push({ name: e.name, category: e.category, visibility: e.visibility, description: '', places: e.places, image: '', imageCount: 0,
      signup: { on: false, capacity: 0, selfCancel: true }, source: 'members-only list', warnings: e.warnings,
      items: e.whens.map((w) => ({ id: 'np-' + slug(e.name) + '-' + w.day + '-' + (w.start || '').replace(':', ''), day: w.day, endDay: w.endDay || '', start: w.start, end: w.end, allDay: w.allDay })) });
  });

  all.forEach((x) => {
    x.items = x.items.filter((it) => (it.endDay || it.day) >= o.today);
    if (!x.items.length) { P.skipped.push(x.name + ': nothing from ' + o.today + ' on'); return; }
    x.warnings.forEach((w) => P.warnings.push(x.name + ': ' + w));
    const kind = kindOf(x.name, x.category);
    if (kind === 'rota') {
      x.items.forEach((it) => {
        const sp = /speaker\s+(.+?)\s*$/i.exec(x.name);
        P.rota.push({ day: it.day, time: it.start, title: x.name, theme: x.name.replace(/^morning worship\s*-\s*/i, '').replace(/\s*-?\s*speaker\s+.+$/i, '').trim(), speaker: sp ? sp[1] : '' });
      });
      return;
    }
    if (kind === 'job') {
      x.items.forEach((it) => P.jobs.push({ id: 'job_cs_' + slug(x.name) + '_' + it.day.replace(/-/g, ''), data: { siteId, roomId: '', where: R.site.name, what: x.name.slice(0, 200),
        details: 'From ChurchSuite: ' + it.day + (it.allDay ? ', all day' : ', ' + it.start + ' to ' + it.end) + '.', photoPath: '', status: 'todo',
        reportedBy: IMPORTER, reportedByName: 'ChurchSuite import' }, when: it.day }));
      return;
    }
    if (kind === 'booking') {
      const hirer = x.name.replace(/\s*-?\s*room hire\s*$/i, '').replace(/\s+meeting$/i, '').trim() || x.name;
      let places = x.places;
      if (!places.length && o.place[x.name]) places = [o.place[x.name]];
      const loc = locationOf(places, x.name);
      if (loc.kind !== 'room' || !loc.roomIds.length) { P.warnings.push(x.name + ': NO ROOM GIVEN, so no booking is made. Say which room with --place "' + x.name + '=Room name".'); return; }
      x.items.forEach((it) => loc.roomIds.forEach((roomId) => {
        /* NOT the booking's id: a booking's id is its private key (anyone
           holding it may read the booking), so the writer gives each a random
           one, as a real booking has, and keeps this only to know it again. */
        P.bookings.push({ importKey: ('cs_' + slug(x.name) + '_' + it.day.replace(/-/g, '') + '_' + (it.start || '').replace(':', '') + '_' + slug(roomId.replace(/^room_cs_/, ''))).slice(0, 120),
          name: x.name, hirer, roomId, day: it.day, start: it.allDay ? '00:00' : it.start, end: it.allDay ? '23:59' : it.end, kind: 'office' });
      }));
      return;
    }
    if (kind === 'group') {
      const id = 'sg_cs_' + slug(x.name), loc = locationOf(x.places, x.name), first = x.items[0];
      const gaps = x.items.slice(1).map((it, i) => (dayOf(it.day) - dayOf(x.items[i].day)) / 86400000);
      const g = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 7;
      const freq = g === 7 ? 'weekly' : g === 14 ? 'fortnightly' : g >= 28 && g <= 31 ? 'monthly' : 'other';
      const lk = loc.kind === 'online' ? 'online' : loc.kind === 'venue' && !(x.places.map(place).some((p) => p.home)) ? 'venue' : loc.kind === 'room' && loc.roomIds.length ? 'room' : 'home';
      const vis = x.visibility === 'public' ? 'public' : 'members';
      P.groups.push({ id, data: { name: x.name.replace(/\s+meeting$/i, '').slice(0, 80), type: 'Home group', description: String(x.description || '').replace(/<[^>]*>/g, '').slice(0, 2000),
        day: dowOf(first.day) === 0 ? 7 : dowOf(first.day), time: first.allDay ? '' : first.start, frequency: freq, frequencyNote: freq === 'other' ? 'See the dates' : '',
        locationKind: lk, siteId: lk === 'room' ? siteId : '', roomId: lk === 'room' ? loc.roomIds[0] : '', area: '', venueName: lk === 'venue' ? loc.venueName : '',
        audience: '', open: true, capacity: 0, visibility: vis, teams: [], canCome: vis === 'public' ? ['public', 'members'] : ['members'],
        under18: false, active: true, leaderIds: [], leaderNames: [], memberCount: 0, image: '', importedFrom: 'churchsuite' },
        private: { address: '', meetingLink: '', notes: x.places.map(place).some((p) => p.home) ? 'From ChurchSuite: it met at "' + x.places.join(', ') + '". Kept here, never on the public card.' : '' } });
      x.items.forEach((it) => P.meetings.push({ id: id + '__' + it.day, data: { groupId: id, date: it.day, time: it.allDay ? '' : it.start, cancelled: false, notes: '' } }));
      return;
    }
    /* An event (a series when it has more than one date). */
    const team = teamFor(x.category, x.name), loc = locationOf(x.places, x.name);
    const seriesId = x.items.length > 1 ? 'ser_cs_' + slug(x.name) : '';
    let pic = null;
    if (x.image) {
      pic = { id: 'pic_cs_' + slug(x.name), name: x.name, sourceUrl: x.image, tags: x.category ? [x.category] : [] };
      P.pictures.push(pic);
      if (x.imageCount > 1) P.warnings.push(x.name + ': ChurchSuite had ' + x.imageCount + ' different pictures across its dates; the first is used for every date (one library picture).');
    }
    const given = Object.keys(o.capacity).find((k) => norm(k) === norm(x.name));
    if (given) { x.signup.on = true; x.signup.capacity = +o.capacity[given] || 0; P.warnings.push(x.name + ': sign-ups ON, ' + x.signup.capacity + ' places (from --capacity).'); }
    if (x.signup.on && !x.signup.capacity) P.warnings.push(x.name + ': sign-ups were on in ChurchSuite with no limit. The hub needs a number of places, so sign-ups are left OFF: set them in the event editor, or give a limit with --capacity "' + x.name + '=30".');
    const vis = x.visibility === 'public' ? 'public' : 'members';
    x.items.forEach((it) => {
      const id = 'cev_cs_' + slug(it.id);
      const endDay = it.endDay || it.day, startLocal = it.day + 'T' + (it.allDay ? '00:00' : it.start), endLocal = endDay + 'T' + (it.allDay ? '23:59' : it.end);
      const signupOn = x.signup.on && x.signup.capacity > 0;
      P.events.push({ id, name: x.name, team, picture: pic ? pic.id : '', data: {
        title: x.name.slice(0, 140), description: x.description, category: categoryOf(x.category, x.name, team), labels: team ? [team] : [],
        visibility: vis, audience: vis === 'public' ? ['public', 'members'] : ['members'], teams: [], featured: false, status: 'confirmed',
        startLocal, startUtc: londonUtc(startLocal), endLocal, endUtc: londonUtc(endLocal), allDay: !!it.allDay, location: loc,
        organiserName: team || '', overseers: [], overseerUids: [], signupOn, capacity: signupOn ? x.signup.capacity : 0, allowSelfCancel: x.signup.selfCancel !== false,
        donationsOn: false, signupScope: 'date', image: '', imageLibId: pic ? pic.id : '', seriesId,
        createdBy: IMPORTER, createdAt: nowIso, updatedAt: nowIso, importedFrom: { churchsuite: it.id } } });
      if (loc.kind === 'room' && !it.allDay) loc.roomIds.forEach((roomId) => {
        P.eventBookings.push({ importKey: ('cs_ev_' + slug(it.id) + '_' + slug(roomId.replace(/^room_cs_/, ''))).slice(0, 120), calEventId: id, name: x.name, hirer: team || '', roomId, day: it.day, start: it.start, end: it.end, kind: 'event' });
      });
    });
  });
  return P;
}

/* One part of the plan (Martin, 14 Oct 2026). Until switch-over the live
   database can be read signed out, so the import goes in two parts:
     public   the building, rooms, the pictures and places the public
              events use, the public events, and the bookings that hold
              rooms for THOSE events - nothing anyone could not see anyway;
     private  everything else: members-only events and their rooms, the
              room hires, small groups (and their private parts), jobs.
   The building and rooms are in both (made once, whichever runs first),
   because the private part's bookings need them. The two, in either
   order, make exactly what one whole run makes. */
export function part(P, which) {
  if (!which) return P;
  const pub = (e) => e.data.visibility === 'public', mine = which === 'public' ? pub : (e) => !pub(e);
  const events = P.events.filter(mine), ids = new Set(events.map((e) => e.id));
  const pics = new Set(events.map((e) => e.picture).filter(Boolean));
  const vens = new Set(events.map((e) => e.data.location && e.data.location.venueId).filter(Boolean));
  const priv = which === 'private';
  return Object.assign({}, P, { part: which, events, eventBookings: P.eventBookings.filter((b) => ids.has(b.calEventId)),
    pictures: P.pictures.filter((p) => pics.has(p.id)), venues: P.venues.filter((v) => vens.has(v.id) || (priv && !P.events.some((e) => pub(e) && e.data.location && e.data.location.venueId === v.id))),
    bookings: priv ? P.bookings : [], groups: priv ? P.groups : [], meetings: priv ? P.meetings : [], jobs: priv ? P.jobs : [], rota: P.rota,
    warnings: P.warnings.filter((w) => events.some((e) => w.indexOf(e.name + ':') === 0) || (priv && !P.events.some((e) => w.indexOf(e.name + ':') === 0)) || /^Rooms made of parts/.test(w)) });
}

/* The dry run, in words. */
export function words(P) {
  const L = [], line = (s) => L.push(s);
  const evNames = {}; P.events.forEach((e) => { (evNames[e.name] = evNames[e.name] || []).push(e); });
  line('THE CHURCHSUITE IMPORT - what it would make (nothing has been written)' + (P.part ? ' - PART: ' + P.part.toUpperCase() : ''));
  line('');
  if (!P.site) { line('NO SITE: rooms.md needs a "Site:" line.'); return L.join('\n'); }
  line('1. THE BUILDING (made first): ' + P.site.data.name + ', ' + P.site.data.address + ' ' + P.site.data.postcode + '  [' + P.site.id + ']');
  line('');
  line('2. ROOMS (' + P.rooms.length + ')');
  P.rooms.forEach((r) => line('   ' + r.name + ' - holds ' + (r.data.capacity || 'no number given') + (r.data.parts.length ? ' - MADE OF ' + r.data.parts.map((id) => P.rooms.find((x) => x.id === id).name).join(' + ') : '') + (r.was.length ? ' - was "' + r.was.join('", "') + '"' : '')));
  line('');
  line('3. PICTURES INTO THE LIBRARY (' + P.pictures.length + ')');
  P.pictures.forEach((p) => line('   ' + p.name + ' - every date of it uses this one'));
  line('');
  line('4. EVENTS (' + P.events.length + ' dates, ' + Object.keys(evNames).length + ' events)');
  Object.keys(evNames).forEach((n) => {
    const l = evNames[n], d = l[0].data, loc = d.location;
    const where = loc.kind === 'room' ? (loc.roomIds.length ? loc.roomIds.map((id) => (P.rooms.find((r) => r.id === id) || {}).name).join(', ') : 'the whole site') : loc.kind === 'online' ? 'online' : loc.venueName;
    line('   ' + n + ' x' + l.length + ' (' + l.map((e) => e.data.startLocal.slice(5, 10).split('-').reverse().join('/') + (e.data.allDay ? '' : ' ' + e.data.startLocal.slice(11))).join(', ') + ')');
    line('      ' + (d.visibility === 'public' ? 'Everyone' : 'Members only') + ' · ' + d.category + ' · ' + where + (l[0].team ? ' · linked to ' + l[0].team : '') +
      (l[0].picture ? ' · picture from the library' : '') + (d.signupOn ? ' · sign-ups, ' + d.capacity + ' places' : '') + (d.seriesId ? ' · a series' : ''));
  });
  line('');
  line('5. ROOM BOOKINGS (' + (P.bookings.length + P.eventBookings.length) + ': never listed publicly; hirer name only, no contact details)');
  const bk = {}; P.bookings.forEach((b) => { const k = b.name + ' - ' + (P.rooms.find((r) => r.id === b.roomId) || {}).name; (bk[k] = bk[k] || []).push(b); });
  Object.keys(bk).forEach((k) => line('   ' + k + ' x' + bk[k].length + ' (hirer: "' + bk[k][0].hirer + '"; ' + bk[k].map((b) => b.day.slice(5).split('-').reverse().join('/') + ' ' + b.start + '-' + b.end).join(', ') + ')'));
  line('   and ' + P.eventBookings.length + ' for the events above, so their rooms are taken');
  line('');
  line('6. SMALL GROUPS (' + P.groups.length + ', with ' + P.meetings.length + ' meeting dates)');
  P.groups.forEach((g) => line('   ' + g.data.name + ' - ' + (g.data.visibility === 'public' ? 'Everyone' : 'Members only') + ' - ' + g.data.frequency + ' - ' +
    (g.data.locationKind === 'venue' ? g.data.venueName : g.data.locationKind) + ' - ' + P.meetings.filter((m) => m.data.groupId === g.id).length + ' dates'));
  line('');
  line('7. MAINTENANCE JOBS (' + P.jobs.length + ')');
  P.jobs.forEach((j) => line('   ' + j.data.what + ' - ' + j.when));
  line('');
  line('8. FOR THE ROTA, NOT MADE HERE (' + P.rota.length + ' services: hand to the main window)');
  P.rota.forEach((r) => line('   ' + r.day + ' ' + r.time + '  ' + (r.theme || r.title.replace(/\s*-?\s*speaker\s+.+$/i, '')) + (r.speaker ? '  - speaker ' + r.speaker : '')));
  line('');
  line('9. PLACES THAT ARE NOT ROOMS');
  P.venues.forEach((v) => line('   "' + v.data.name + '"'));
  line('');
  line('10. TO LOOK AT (' + P.warnings.length + ')');
  P.warnings.forEach((w) => line('   - ' + w));
  if (P.skipped.length) { line(''); line('Left out (all in the past):'); P.skipped.forEach((s) => line('   ' + s)); }
  line('');
  line('Never imported: sign-ups, members, contacts or anyone\'s details.');
  return L.join('\n');
}
