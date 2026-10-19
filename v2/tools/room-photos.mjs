/* ===================================================================
   EGBC — Martin's rooms: photos, sizes and floor plans (F-236)
   ===================================================================

   Each picture is made smaller exactly as Places makes it smaller - the
   page's own EGBCRooms.shrink() (egbc-events-rooms.js), run in Chrome: long
   edge at most 1600 pixels, a JPEG at 0.85 - and stored where Places stores
   it, rooms/<room id>/photo-<time>-<n>.jpg, with a download link. The
   room's `photos` list gains it; the first photo is the main one.

   The photos are public content (the room pages show them to anyone), so
   they may go live now, with Martin's OK.

   THE SIZES (Martin, 19 Oct; measured from the 2013 plan's 1:50 scale bar,
   checked against the architect's 9.99 m Sanctuary width, about +/-0.1 m):
   each room's dims.length and dims.width; for the L-shaped and part rooms,
   and the Sanctuary's architect-marked 132 m2, dims.area is the area given
   (the pages show it rather than length x width). Ceiling heights are left
   empty; the fire-safety maximum is left empty (the fire risk assessment
   gives it). The Sanctuary's theatre layout: 170.

   THE FLOOR PLANS (--plans) are members and office only by default (the
   room's floorPlanWho setting), so they are stored at roomPlans/<room id>/,
   which the storage rules guard - never under the public rooms/ - with NO
   download link kept on the room (the pages ask Storage, which checks).
   Until switch-over the live database and Storage are open, so --plans
   REFUSES to upload unless churchSettings/launch.rulesLocked is true.

     node tools/room-photos.mjs                      dry run on the events emulator
     node tools/room-photos.mjs --write              write on the emulator
     node tools/room-photos.mjs --live               DRY RUN against the live hub (reads only)
     node tools/room-photos.mjs --live --write       for Martin, with his OK
     --sizes           also the sizes and the theatre layout
     --plans           also the floor plans (only once the rules are locked)
     --hire            also the church's picture, the "Hire our rooms" header
     --from=<folder>   where the pictures are (default: Martin's OneDrive
                       Documents\New hub\rooms - never the repo; plans in plans/)

   Running it twice adds nothing twice: each photo remembers its file name
   (`source`), and a room that already has that source is left alone.
   =================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live'), WRITE = process.argv.includes('--write');
const FROM = (process.argv.find(a => a.startsWith('--from=')) || '').slice(7) || 'C:/Users/marti/OneDrive/Documents/New hub/rooms';
const PROJECT = 'egbc-worship-planner';
const BUCKET = 'egbc-worship-planner.firebasestorage.app';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* Martin's mapping (19 Oct): the hub's room name -> its photos, in order (the first is the main one). */
export const PHOTOS = {
  'Sanctuary': ['sanctuary-inside.jpg', 'outside-rear-hall.jpg'],
  'Creche Room': ['lounge-sofas.jpg'],
  'Upper Room - Side': ['upstairs-folding-doors.jpg'],
  'Upper Room': ['upstairs-folding-doors.jpg']
};

/* The sizes, metres (and m2 where given). */
export const SIZES = {
  'Sanctuary':          { length: 12.6, width: 10.0, area: 132, note: 'Plus a 2.4 m dais at the front. Area as marked by the architect.', layouts: { theatre: 170 } },
  'Upper Room':         { length: 11.4, width: 7.2, area: 62, note: 'L-shaped.' },
  'Upper Room - Front': { length: 6.5, width: 7.2, area: 43, note: 'Less the lift corner.' },
  'Upper Room - Side':  { length: 5.0, width: 3.8 },
  'Creche Room':        { length: 5.5, width: 3.7 },
  'Youth Room (rear)':  { length: 5.0, width: 4.1, area: 21, note: 'Plus a small bay.' },
  'Kitchen':            { length: 3.7, width: 2.9 }
};
/* Each room's own plan (sizes marked, scale bar). */
export const PLANS = {
  'Sanctuary': 'sanctuary.png', 'Upper Room': 'upper-room.png', 'Upper Room - Front': 'upper-room-front.png', 'Upper Room - Side': 'upper-room-side.png',
  'Creche Room': 'creche-room.png', 'Youth Room (rear)': 'youth-room-rear.png', 'Kitchen': 'kitchen.png'
};
const SIZES_ON = process.argv.includes('--sizes'), PLANS_ON = process.argv.includes('--plans'), HIRE_ON = process.argv.includes('--hire');
/* The church's own picture, the "Hire our rooms" header (Martin, 19 Oct): public. */
export const HIRE_PHOTO = 'outside-front.jpg';

if (!LIVE) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8182';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9198';
}
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');

/* Room names match whatever the dash: the live names use an en dash ("Upper Room – Front"). */
const norm = (v) => String(v || '').trim().toLowerCase().replace(/[‐-―-]/g, '-').replace(/\s+/g, ' ');
const same = (a, b) => norm(a) === norm(b);

/* Shrink with the page's own code, in Chrome. */
export async function shrinkAll(files) {
  const puppeteer = (await import('puppeteer-core')).default;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  try {
    const pg = await b.newPage();
    await pg.setContent('<!doctype html><html><body></body></html>');
    await pg.addScriptTag({ content: fs.readFileSync(path.join(V2, 'egbc-events-rooms.js'), 'utf8') });
    const out = {};
    for (const f of files) {
      const b64 = fs.readFileSync(f).toString('base64'), type = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
      out[f] = await pg.evaluate(async (b64, type, name) => {
        const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const img = await window.EGBCRooms.shrink(new File([u], name, { type }), 1600);
        const buf = new Uint8Array(await img.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
        return { b64: btoa(s), width: img.width, height: img.height };
      }, b64, type, path.basename(f));
    }
    return out;
  } finally { await b.close(); }
}

export async function run(o) {
  const { db, bucket, from, write, log = console.log } = o;
  const rooms = (await db.collection('rooms').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const plan = [], missingRooms = [], missingFiles = [];
  for (const [name, files] of Object.entries(PHOTOS)) {
    const r = rooms.filter(x => same(x.name, name));
    if (r.length !== 1) { missingRooms.push(name + (r.length ? ' (' + r.length + ' rooms have that name)' : ' (no room has that name)')); continue; }
    const have = new Set((r[0].photos || []).map(p => p.source).filter(Boolean));
    for (const f of files) {
      const full = path.join(from, f);
      if (!fs.existsSync(full)) { missingFiles.push(f); continue; }
      plan.push({ room: r[0], name, file: f, full, already: have.has(f) });
    }
  }
  missingRooms.forEach(m => log('  NO ROOM: ' + m));
  missingFiles.forEach(m => log('  NO FILE: ' + m));
  const todo = plan.filter(p => !p.already);
  const small = todo.length ? await shrinkAll([...new Set(todo.map(p => p.full))]) : {};
  for (const p of plan) {
    const s = small[p.full];
    log('  ' + (p.already ? 'already there   ' : write ? 'ADDING          ' : 'would add       ') + p.name.padEnd(18) + ' <- ' + p.file +
      (s ? '  (' + s.width + ' x ' + s.height + ', ' + Math.round(s.b64.length * 0.75 / 1024) + ' KB)' : ''));
  }
  /* The sizes. */
  const sizes = [];
  if (o.sizes) for (const [name, z] of Object.entries(SIZES)) {
    const r = rooms.filter(x => same(x.name, name));
    if (r.length !== 1) { log('  NO ROOM: ' + name); continue; }
    const d = Object.assign({}, r[0].dims || {}, { length: z.length, width: z.width });
    if (z.area) d.area = z.area; else delete d.area;
    const ch = { dims: d };
    if (z.note) ch.sizeNote = z.note;
    if (z.layouts) ch.layouts = Object.assign({}, r[0].layouts || {}, z.layouts);
    const done = JSON.stringify(r[0].dims || {}) === JSON.stringify(d) && (!z.layouts || JSON.stringify(r[0].layouts || {}) === JSON.stringify(ch.layouts));
    log('  ' + (done ?'size already    ' : write ? 'SIZE            ' : 'would size      ') + name.padEnd(18) + ' ' + z.length + ' x ' + z.width + ' m' + (z.area ? ', ' + z.area + ' m2 (as given)' : '') + (z.layouts ? ', theatre ' + z.layouts.theatre : ''));
    if (!done) sizes.push({ id: r[0].id, ch });
  }
  /* The floor plans: only once the rules are locked. */
  const plans = [];
  if (o.plans) {
    const l = await db.collection('churchSettings').doc('launch').get();
    if (!(l.exists && l.data().rulesLocked === true)) log('  FLOOR PLANS HELD: the rules are not locked yet (churchSettings/launch.rulesLocked), so no plan is uploaded. Run --plans after switch-over.');
    else for (const [name, f] of Object.entries(PLANS)) {
      const r = rooms.filter(x => same(x.name, name));
      const full = path.join(from, 'plans', f);
      if (r.length !== 1) { log('  NO ROOM: ' + name); continue; }
      if (!fs.existsSync(full)) { log('  NO FILE: plans/' + f); continue; }
      const already = r[0].floorPlan && r[0].floorPlan.source === f;
      log('  ' + (already ? 'plan already    ' : write ? 'PLAN            ' : 'would plan      ') + name.padEnd(18) + ' <- plans/' + f + ' (members and office)');
      if (!already) plans.push({ room: r[0], full, file: f });
    }
  }
  /* The hire page's header picture: churchSettings/hire.photoUrl (its own
     document, so saving Church settings never wipes it). */
  let hire = null;
  if (o.hire) {
    const full = path.join(from, HIRE_PHOTO), h = await db.collection('churchSettings').doc('hire').get();
    if (!fs.existsSync(full)) log('  NO FILE: ' + HIRE_PHOTO);
    else if (h.exists && h.data().source === HIRE_PHOTO) log('  hire picture already there');
    else { log('  ' + (write ? 'HIRE PICTURE    ' : 'would add       ') + '"Hire our rooms" header <- ' + HIRE_PHOTO); hire = full; }
  }
  if (!write) return { plan, added: 0, missingRooms, missingFiles, sizes: sizes.length, plans: plans.length, hire: hire ? 1 : 0 };
  if (hire) {
    const s = (await shrinkAll([hire]))[hire], token = crypto.randomUUID(), where = 'rooms/_church/hire-' + Date.now() + '.jpg';
    await bucket.file(where).save(Buffer.from(s.b64, 'base64'), { contentType: 'image/jpeg', metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? 'http://' + process.env.FIREBASE_STORAGE_EMULATOR_HOST : 'https://firebasestorage.googleapis.com';
    await db.collection('churchSettings').doc('hire').set({ photoUrl: host + '/v0/b/' + bucket.name + '/o/' + encodeURIComponent(where) + '?alt=media&token=' + token, photoPath: where, source: HIRE_PHOTO, width: s.width, height: s.height });
  }
  for (const z of sizes) await db.collection('rooms').doc(z.id).update(z.ch);
  if (plans.length) {
    const sp = await shrinkAll(plans.map(p => p.full));
    for (const p of plans) {
      const s = sp[p.full], where = 'roomPlans/' + p.room.id + '/plan-' + Date.now() + '.jpg';
      await bucket.file(where).save(Buffer.from(s.b64, 'base64'), { contentType: 'image/jpeg' });
      await db.collection('rooms').doc(p.room.id).update({ floorPlan: { path: where, width: s.width, height: s.height, source: p.file }, floorPlanWho: p.room.floorPlanWho || 'members' });
    }
  }
  let added = 0;
  const byRoom = {};
  for (const p of todo) (byRoom[p.room.id] = byRoom[p.room.id] || []).push(p);
  for (const [roomId, ps] of Object.entries(byRoom)) {
    const photos = (rooms.find(r => r.id === roomId).photos || []).slice();
    for (const p of ps) {
      const s = small[p.full], token = crypto.randomUUID();
      const where = 'rooms/' + roomId + '/photo-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.jpg';
      await bucket.file(where).save(Buffer.from(s.b64, 'base64'), { contentType: 'image/jpeg', metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
      const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? 'http://' + process.env.FIREBASE_STORAGE_EMULATOR_HOST : 'https://firebasestorage.googleapis.com';
      photos.push({ url: host + '/v0/b/' + bucket.name + '/o/' + encodeURIComponent(where) + '?alt=media&token=' + token, path: where, width: s.width, height: s.height, source: p.file });
      added++;
    }
    await db.collection('rooms').doc(roomId).update({ photos });
  }
  return { plan, added, missingRooms, missingFiles, sizes: sizes.length, plans: plans.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: LIVE ? BUCKET : PROJECT + '.appspot.com' });
  console.log((LIVE ? 'LIVE hub' : 'events emulator') + ' - ' + (WRITE ? 'WRITING' : 'dry run, nothing written') + ' - pictures from ' + FROM);
  const r = await run({ db: getFirestore(), bucket: getStorage().bucket(), from: FROM, write: WRITE, sizes: SIZES_ON, plans: PLANS_ON, hire: HIRE_ON });
  console.log(WRITE ? r.added + ' photo(s) added, ' + r.sizes + ' room(s) sized, ' + r.plans + ' plan(s) put up.' : 'Dry run: nothing written. Add --write to do it.');
  process.exit(0);
}
