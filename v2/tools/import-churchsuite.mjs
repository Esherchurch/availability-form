/* ===================================================================
   Fill the hub from ChurchSuite (Martin, 14 Oct 2026). Events window.
   ===================================================================

   Reads the church's ChurchSuite files (kept privately, never in the
   repo) and makes, in this order: the building, its rooms (a room made of
   parts is set up as such: F-174), the places that are not rooms, the
   pictures into the picture library (F-176), the events (each date its
   own, joined as a series, pointing to their library picture; an event
   in a room takes the room), the room bookings, the small groups with
   their meeting dates, and the maintenance jobs. Sunday services are NOT
   made: they go on the rota, which the hub keeps; they are listed for
   the main window.

   WHAT IT MAKES IS WORKED OUT IN tools/churchsuite-plan.mjs, which holds
   nothing about one church: everything comes from the files and the
   options below. Everything it makes is ordinary hub data, changed
   afterwards on the ordinary pages.

   SAFE BY DEFAULT.
     - With no --write it only prints what it would make (the dry run).
     - Against the real database it writes nothing without --live.
     - Every record's id comes from ChurchSuite's own, and a record that is
       already there is left alone: running it twice makes nothing twice.
     - NEVER PEOPLE: no sign-ups, members, contacts or details are read or
       made. A place that is somebody's home is shown only as "Off site".

   HOW IT IS RUN (from the v2 folder):
     node tools/import-churchsuite.mjs --from "<folder>" [options]           the dry run
     node tools/import-churchsuite.mjs --from "<folder>" [options] --write   (on the emulator: FIRESTORE_EMULATOR_HOST set)
     gcloud auth application-default login                                    (once, the church account)
     node tools/import-churchsuite.mjs --from "<folder>" [options] --live --write

   The folder holds rooms.md, cs-embed.json and cs-nonpublic.md.
   Options (the church's own choices; repeat any of them):
     --rota-category "Sundays"        a ChurchSuite category of services: to the rota, not events
     --as-booking "Name"              make room bookings of it (any category with "hire" already is)
     --as-maintenance "Name"          make a maintenance job of it
     --place "Name=Room"              the room for a booking ChurchSuite gave no place for
     --capacity "Name=30"             sign-ups on, with this many places (ChurchSuite gave no limit)
     --today YYYY-MM-DD, --until YYYY-MM-DD    the window (default: today to the end of the year)
     --project ID, --bucket NAME      (default egbc-worship-planner, <project>.firebasestorage.app)
   =================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { plan, words, IMPORTER } from './churchsuite-plan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? '' : String(argv[i + 1] || ''); };
const opts = (n) => argv.map((a, i) => (a === n ? String(argv[i + 1] || '') : null)).filter((x) => x !== null && x !== '');

const FROM = opt('--from'), WRITE = flag('--write'), LIVE = flag('--live');
const PROJECT = opt('--project') || 'egbc-worship-planner';
const BUCKET = opt('--bucket') || (PROJECT + '.firebasestorage.app');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!FROM) { console.error('Say where the ChurchSuite files are: --from "<folder>"'); process.exit(2); }
const read = (f) => { const p = path.join(FROM, f); if (!fs.existsSync(p)) { console.error('Missing: ' + p); process.exit(2); } return fs.readFileSync(p, 'utf8'); };

/* The hub's team names, read from egbc-auth.js (the main window's), not copied. */
const AUTH = fs.readFileSync(path.join(V2, 'egbc-auth.js'), 'utf8');
const TEAMS = [], UNDER18 = [];
(/var TEAMS = \{([\s\S]*?)\n  \};/.exec(AUTH) || ['', ''])[1].replace(/'([^']+)':\s*\{([^}]*)\}/g, (m, k, v) => { TEAMS.push(k); if (/under18:\s*true/.test(v)) UNDER18.push(k); return m; });

const place = {};
opts('--place').forEach((p) => { const i = p.indexOf('='); if (i > 0) place[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
const capacity = {};
opts('--capacity').forEach((p) => { const i = p.lastIndexOf('='); if (i > 0) capacity[p.slice(0, i).trim()] = parseInt(p.slice(i + 1), 10) || 0; });
const NOW = new Date().toISOString();
const P = plan({ roomsMd: read('rooms.md'), embed: JSON.parse(read('cs-embed.json')), nonPublicMd: read('cs-nonpublic.md') }, {
  today: opt('--today') || NOW.slice(0, 10), until: opt('--until') || '', nowIso: NOW, teams: TEAMS, under18: UNDER18,
  rotaCategories: opts('--rota-category'), asBooking: opts('--as-booking'), asMaintenance: opts('--as-maintenance'), place, capacity
});
console.log(words(P));
if (!WRITE) { console.log('\nThis was the dry run: nothing has been written. Add --write to make it.'); process.exit(0); }

/* THE DOOR, before anything connects. */
if (!EMULATOR && !LIVE) { console.error('\nRefusing: this would write the REAL database, and --live was not given.'); process.exit(2); }
if (EMULATOR && LIVE) { console.error('\nRefusing: --live was given but FIRESTORE_EMULATOR_HOST is set (' + EMULATOR + '). Pick one.'); process.exit(2); }
if (!P.site) { console.error('\nNo site in rooms.md: nothing to make.'); process.exit(2); }

const requireFn = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, applicationDefault } = requireFn('firebase-admin/app');
const { getFirestore, Timestamp } = requireFn('firebase-admin/firestore');
const { getStorage } = requireFn('firebase-admin/storage');
initializeApp(EMULATOR ? { projectId: PROJECT, storageBucket: BUCKET } : { projectId: PROJECT, credential: applicationDefault(), storageBucket: BUCKET });
const db = getFirestore();
console.log('\nWRITING to ' + (EMULATOR ? 'the emulator (' + EMULATOR + ')' : 'the REAL database (' + PROJECT + ')') + '...');

const tally = {};
const count = (what, made) => { tally[what] = tally[what] || { made: 0, already: 0 }; tally[what][made ? 'made' : 'already']++; };
async function make(col, id, data, what) {
  try { await db.collection(col).doc(id).create(data); count(what || col, true); return true; }
  catch (e) { if (e.code === 6 || /already exists/i.test(String(e.message))) { count(what || col, false); return false; } throw e; }
}
/* An id the plan chose, swapped for one already in the hub (the same name). */
const swap = {};
const swapAll = (x) => (typeof x === 'string' ? (swap[x] || x) : Array.isArray(x) ? x.map(swapAll) : x && typeof x === 'object' && !(x instanceof Timestamp) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, swapAll(v)])) : x);

/* 1. The building, first. */
const sameSite = (await db.collection('sites').where('name', '==', P.site.data.name).get()).docs[0];
if (sameSite && sameSite.id !== P.site.id) { swap[P.site.id] = sameSite.id; count('site', false); }
else await make('sites', P.site.id, P.site.data, 'site');
const siteId = swap[P.site.id] || P.site.id;

/* 2. Rooms (one already there by name, at this site, is kept as it is). */
const roomsHere = (await db.collection('rooms').where('siteId', '==', siteId).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
for (const r of P.rooms) { const had = roomsHere.find((x) => String(x.name).toLowerCase() === r.name.toLowerCase()); if (had && had.id !== r.id) swap[r.id] = had.id; }
for (const r of P.rooms) { if (swap[r.id]) { count('room', false); continue; } await make('rooms', r.id, swapAll(r.data), 'room'); }
const ROOMS = {};
(await db.collection('rooms').where('siteId', '==', siteId).get()).docs.forEach((d) => { ROOMS[d.id] = { id: d.id, ...d.data() }; });

/* 3. Places that are not rooms. */
for (const v of P.venues) await make('venues', v.id, v.data, 'place (not a room)');

/* 4. Pictures into the library: fetched once from ChurchSuite, stored under library/. */
const PICS = {};
for (const p of P.pictures) {
  const have = await db.collection('pictureLibrary').doc(p.id).get();
  if (have.exists) { PICS[p.id] = have.data().url; count('picture', false); continue; }
  const res = await fetch(p.sourceUrl);
  if (!res.ok) { console.log('   ! could not fetch the picture for ' + p.name + ' (' + res.status + '); its events get none'); continue; }
  const type = res.headers.get('content-type') || 'image/jpeg', buf = Buffer.from(await res.arrayBuffer());
  const file = 'library/' + p.id + '/churchsuite.' + (/png/.test(type) ? 'png' : 'jpg'), token = crypto.randomUUID();
  await getStorage().bucket().file(file).save(buf, { contentType: type, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const url = (host ? 'http://' + host : 'https://firebasestorage.googleapis.com') + '/v0/b/' + BUCKET + '/o/' + encodeURIComponent(file) + '?alt=media&token=' + token;
  if (await make('pictureLibrary', p.id, { name: p.name.slice(0, 80), tags: p.tags.slice(0, 12), url, path: file, width: 0, height: 0,
    createdAt: NOW, createdBy: IMPORTER, updatedAt: NOW, updatedBy: IMPORTER }, 'picture')) PICS[p.id] = url;
}

/* 5. Events, and the sign-up counter for those with sign-ups. */
for (const e of P.events) {
  const d = swapAll(e.data);
  if (e.picture) { d.image = PICS[e.picture] || ''; d.imageLibId = PICS[e.picture] ? e.picture : ''; }
  if (await make('calEvents', e.id, d, 'event') && d.signupOn) await make('capacity', e.id, { calEventId: e.id, taken: 0, capacity: d.capacity }, 'sign-up counter');
}

/* 6. Bookings: the events' rooms, and the room hires. Each takes its time
   on the room's day (each part's, for a room made of parts), in the same
   write, only when the booking is new; anything already there is booked
   over with a note, never moved. */
const pad = (n) => (n < 10 ? '0' : '') + n;
/* 28 random characters, as EGBCEvents.key makes them: 'bk_' + 28 is a page's own booking key. */
const bookingKey = () => { const A = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.randomBytes(28); let s = ''; for (let i = 0; i < 28; i++) s += A[b[i] % 36]; return s; };
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const isoDow = (day) => { const g = new Date(day + 'T12:00:00Z').getUTCDay(); return g === 0 ? 7 : g; };
for (const b of P.eventBookings.concat(P.bookings)) {
  const roomId = swap[b.roomId] || b.roomId, room = ROOMS[roomId];
  if (!room) { console.log('   ! no room ' + roomId + ' for ' + b.name); continue; }
  const startMin = toMin(b.start), endMin = Math.min(1440, toMin(b.end) + (b.end === '23:59' ? 1 : 0));
  const from = Math.floor(startMin / 15), to = Math.ceil(endMin / 15);
  const foot = (room.parts && room.parts.length ? room.parts : [roomId]).map((id) => ROOMS[id] || { id, siteId });
  /* A RANDOM KEY, like every booking's: its id is the private key that lets
     anyone holding it read the booking, so it must not be worked out from
     its name, date or room. The readable import key goes in importKeys,
     which only admins may read, and is how a second run knows it. */
  const ref = db.collection('bookings').doc('bk_' + bookingKey()), seen = db.collection('importKeys').doc(b.importKey);
  await db.runTransaction(async (tx) => {
    const have = await tx.get(seen);
    if (have.exists) { count(b.kind === 'event' ? 'event booking' : 'room booking', false); return; }
    const days = await Promise.all(foot.map((f) => tx.get(db.collection('roomDays').doc(f.id + '_' + b.day))));
    let over = false;
    const sl = days.map((s, i) => {
      const w = ((foot[i].rotaWeek || {})[String(isoDow(b.day))]) || [];
      const x = s.exists ? s.data().slots.slice() : (w.length === 96 ? w.slice() : new Array(96).fill(0));
      for (let k = from; k < to; k++) { if (x[k]) over = true; x[k] = (x[k] || 0) + 1; }
      return x;
    });
    const d = { kind: b.kind, status: 'confirmed', siteId, roomId, groupId: '', day: b.day, startMin, endMin: Math.min(endMin, 1439),
      startLocal: b.day + 'T' + b.start, endLocal: b.day + 'T' + b.end, setupMins: 0, packdownMins: 0, slotFrom: from, slotTo: to,
      title: b.name.slice(0, 120), people: 1, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false, items: [], dietary: {}, notes: '' },
      resources: [], notes: '', requester: { name: b.hirer || '', email: '', phone: '', org: '' }, memberUid: '', memberName: '', createdAt: NOW };
    if (b.calEventId) d.calEventId = b.calEventId;
    if (over) Object.assign(d, { override: true, decisionNote: 'Imported from ChurchSuite: it overlaps something already booked.', decidedBy: IMPORTER, decidedByName: 'ChurchSuite import', decidedAt: NOW });
    tx.create(ref, d);
    tx.create(seen, { collection: 'bookings', bookingId: ref.id, source: 'churchsuite', at: NOW });
    foot.forEach((f, i) => tx.set(db.collection('roomDays').doc(f.id + '_' + b.day), { slots: sl[i], lastBooking: '', roomId: f.id, day: b.day, siteId }));
    if (over) console.log('   ! ' + b.name + ' on ' + b.day + ' overlaps something already booked in ' + room.name + ': booked over it, with a note');
    count(b.kind === 'event' ? 'event booking' : 'room booking', true);
  });
}

/* 7. Small groups, their private part (never on the public card), and their dates. */
for (const g of P.groups) {
  if (await make('smallGroups', g.id, Object.assign(swapAll(g.data), { createdAt: NOW, updatedAt: NOW, updatedBy: IMPORTER }), 'small group'))
    await make('smallGroupPrivate', g.id, Object.assign({}, g.private, { updatedAt: NOW, updatedBy: IMPORTER }), 'small group (private part)');
}
for (const m of P.meetings) await make('smallGroupMeetings', m.id, Object.assign({}, m.data, { updatedAt: NOW, updatedBy: IMPORTER }), 'small group date');

/* 8. Maintenance jobs. */
for (const j of P.jobs) await make('maintJobs', j.id, Object.assign(swapAll(j.data), { reportedAt: Timestamp.now() }), 'maintenance job');

console.log('\nDONE.');
Object.keys(tally).forEach((k) => console.log('   ' + k + ': ' + tally[k].made + ' made' + (tally[k].already ? ', ' + tally[k].already + ' already there' : '')));
console.log('Never imported: sign-ups, members, contacts or anyone\'s details.');
process.exit(0);
