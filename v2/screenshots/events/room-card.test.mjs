/* ROOMS AT A GLANCE WHERE ONE IS BOOKED; THE AREA AS GIVEN; THE ROOM TOOL (F-236).
   Events window. Invented people, rooms and pictures only, events emulators
   only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/room-card.test.mjs"

   What it proves, at 375px:
     1. A MEMBER BOOKING (rooms.html, as the app's Book a room opens it):
        where the room is chosen, its main photo, how many it holds set out
        the way asked (and it changes with the layout), its floor area, its
        facilities, the kit in it and the kit that can be brought in; a
        second room chosen shows its own; nothing scrolls sideways
     2. THE PUBLIC HIRE FORM (book.html, signed out): the same card, without
        the kit (the rules keep the kit to church members)
     3. THE AREA AS GIVEN: Places keeps it (and the size note) when a room
        is saved; the room page and the card show it rather than L x W
     4. THE ROOM TOOL on the emulator: photos (shrunk as Places does, the
        first the main one), sizes, the hire header; run twice, nothing
        twice; floor plans HELD until the rules are locked, then put up at
        the private path with no public link
     5. "Hire our rooms" shows the church's picture */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { run as roomTool, PHOTOS, PLANS, HIRE_PHOTO } from '../../tools/room-photos.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-room-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: 'egbc-worship-planner.firebasestorage.app' });   // the pages' own bucket
const db = getFirestore(), bucket = getStorage().bucket();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

/* ---------- the test church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  mia:    { name: 'Mia Member (invented)', mid: 'm_mia', teams: ['Welcome'] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.room@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
for (const name of ['Core Team', 'Welcome']) await db.collection('teams').doc(name).set({ name, label: name, rota: true, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await db.collection('sites').doc('site_t').set({ name: 'Test church (invented)', active: true, order: 1 });
await db.collection('bookingSettings').doc('site_t').set({ bookingsAdmins: [], memberBookings: true });
const PHOTO = URLB + 'screenshots/events/watch-375.png';
/* The names Martin's tool looks for, so the same rooms serve both halves. */
await db.collection('rooms').doc('room_sanc').set({ name: 'Sanctuary', siteId: 'site_t', active: true, kind: 'room', order: 1, capacity: 170, bookableByHirers: true, memberBookings: 'site',
  layouts: { theatre: 170, cabaret: 80 }, facilities: { projector: true, pa: true, loop: true, chairs: 120 }, photos: [{ url: PHOTO, path: '', width: 375, height: 600 }] });
await db.collection('rooms').doc('room_creche').set({ name: 'Creche Room', siteId: 'site_t', active: true, kind: 'room', order: 2, capacity: 14, bookableByHirers: true, memberBookings: 'site',
  dims: { length: 5.5, width: 3.7 }, facilities: { babychange: true } });
for (const [id, name] of [['room_upper', 'Upper Room'], ['room_side', 'Upper Room \u2013 Side'], ['room_front', 'Upper Room \u2013 Front'], ['room_youth', 'Youth Room (rear)'], ['room_kit', 'Kitchen']])
  await db.collection('rooms').doc(id).set({ name, siteId: 'site_t', active: true, kind: 'room', order: 5 });
await db.collection('bookableResources').doc('k_chairs').set({ name: 'Stacking chairs', quantity: 120, unlimited: false, homeRoomId: 'room_sanc', movable: false, siteId: 'site_t', active: true });
await db.collection('bookableResources').doc('k_proj').set({ name: 'Portable projector', quantity: 1, unlimited: false, homeRoomId: 'room_upper', movable: true, siteId: 'site_t', active: true });
await db.collection('bookableResources').doc('k_urn').set({ name: 'Tea urn', quantity: 1, unlimited: false, homeRoomId: 'room_kit', movable: false, siteId: 'site_t', active: true });

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, (who || 'out') + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who || 'signed-out');
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push((who || 'out') + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (who) { await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email); await sleep(500); }
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const setVal = (pg, sel, v) => pg.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const sideways = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const room = async (id) => (await db.collection('rooms').doc(id).get()).data();

try {
  /* ---------- 1. a member booking ---------- */
  const mia = await as('mia');
  await mia.goto(URLB + 'rooms.html', { waitUntil: 'networkidle2' });
  await until(() => mia.evaluate(() => typeof window.EGBCBookForm !== 'undefined' && !!document.querySelector('#back, [data-book], .btn')));
  /* The sheet the page opens: Book a room, with the Sanctuary chosen. */
  await mia.evaluate(() => {
    const el = document.createElement('div'); el.id = 'tf'; document.body.appendChild(el);
  });
  const opened = await mia.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => /^\s*Book a room\s*$/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
  await until(() => mia.$('#f .bf-room'));
  await mia.$eval('#f .bf-room[value="room_sanc"]', e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(() => mia.$('[data-roomcard="room_sanc"]'));
  const c1 = await text(mia, '[data-roomcard="room_sanc"]');
  ok('1. ROOMS.HTML (the app\u2019s Book a room): THE CHOSEN ROOM\u2019S CARD - its main photo', opened && (await mia.$eval('[data-roomcard="room_sanc"] img', e => e.src)) === PHOTO, c1);
  const fit = await mia.$eval('[data-roomcard="room_sanc"] img', e => { const c = e.parentElement.getBoundingClientRect(), i = e.getBoundingClientRect(), cs = getComputedStyle(e.parentElement);
    return { full: Math.abs(i.width - (c.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth))) < 2, lazy: e.getAttribute('loading') === 'lazy', w: i.width, h: i.height }; });
  ok('   ON A PHONE THE PHOTO IS THE CARD’S FULL WIDTH, at its own shape (375 x 600 kept), and loads lazily', fit.full && fit.lazy && Math.abs(fit.h / fit.w - 600 / 375) < 0.02, JSON.stringify(fit));
  ok('   how many it holds ("Holds up to 170")', /Holds up to 170/.test(c1), c1);
  ok('   its facilities, with icons', (await mia.$$eval('[data-roomcard="room_sanc"] [data-fac] svg, [data-roomcard="room_sanc"] [data-fac] i', es => es.length)) === 4 && (await mia.$$eval('[data-roomcard="room_sanc"] [data-fac]', es => es.map(e => e.getAttribute('data-fac')).join())) === 'projector,pa,loop,chairs' && /Chairs 120/.test(c1), c1);
  ok('   the kit in it, and the kit that can be brought in (not the urn, which stays in the kitchen)', /In the room: Stacking chairs \(120\)/.test(c1) && /Can be brought in: Portable projector \(1\)/.test(c1) && !/Tea urn/.test(c1), c1);
  await setVal(mia, '#bf-layout', 'cabaret');
  await until(async () => /Holds 80 set out cabaret/.test(await text(mia, '[data-roomcard="room_sanc"]')));
  ok('   SET OUT CABARET: "Holds 80 set out cabaret"', /Holds 80 set out cabaret/.test(await text(mia, '[data-roomcard="room_sanc"]')));
  await mia.$eval('#f .bf-room[value="room_creche"]', e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(() => mia.$('[data-roomcard="room_creche"]'));
  const c2 = await text(mia, '[data-roomcard="room_creche"]');
  ok('   A SECOND ROOM chosen shows its own card (no photo yet: a grey square; 20.4 m\u00b2 from 5.5 x 3.7)', /Creche Room/.test(c2) && /20\.4 m\u00b2/.test(c2) && /Baby-change/.test(c2) && !!(await mia.$('[data-roomcard="room_creche"] .noph')), c2);
  ok('   at 375px nothing scrolls sideways', (await sideways(mia)) <= 0, await sideways(mia));
  await mia.screenshot({ path: path.join(HERE, 'room-card-member-375.png') });
  await mia.browser().close();

  /* ---------- 2. the public hire form ---------- */
  const out = await as('');
  await out.goto(URLB + 'book.html?room=room_sanc', { waitUntil: 'networkidle2' });
  await until(() => out.$('[data-roomcard="room_sanc"]'));
  const c3 = await text(out, '[data-roomcard="room_sanc"]');
  ok('2. BOOK.HTML, signed out: the same card - photo, holds, facilities', /Holds up to 170/.test(c3) && !!(await out.$('[data-roomcard="room_sanc"] img')) && /Projector and screen/.test(c3), c3);
  ok('   but NO KIT (church members only, by the rules)', !/Stacking chairs|Portable projector/.test(c3), c3);
  ok('   the photo full width there too', await out.$eval('[data-roomcard="room_sanc"] img', e => { const c = e.parentElement.getBoundingClientRect(), cs = getComputedStyle(e.parentElement);
    return Math.abs(e.getBoundingClientRect().width - (c.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth))) < 2 && e.getAttribute('loading') === 'lazy'; }));
  ok('   at 375px nothing scrolls sideways', (await sideways(out)) <= 0);
  await out.screenshot({ path: path.join(HERE, 'room-card-hire-375.png') });

  /* ---------- 4. the room tool on the emulator (invented pictures) ---------- */
  const from = path.join(TMP, 'pics'); fs.mkdirSync(path.join(from, 'plans'), { recursive: true });
  const mk = async (file, w, h, colour) => {
    const b64 = await out.evaluate((w, h, c, png) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9).split(',')[1]; }, w, h, colour, /\.png$/.test(file));
    fs.writeFileSync(path.join(from, file), Buffer.from(b64, 'base64'));
  };
  for (const f of new Set([].concat(...Object.values(PHOTOS)))) await mk(f, 3200, 2400, '#3d6263');
  await mk(HIRE_PHOTO, 2400, 1600, '#b07d2e');
  for (const f of Object.values(PLANS)) await mk('plans/' + f, 2000, 1400, '#6b7280');
  await out.browser().close();
  const quiet = () => {};
  const t1 = await roomTool({ db, bucket, from, write: true, sizes: true, plans: true, hire: true, log: quiet });
  const sanc = await room('room_sanc'), side = await room('room_side');
  ok('4. THE ROOM TOOL: photos added after the one there (Sanctuary: 1 + 2), each shrunk to 1600 on its long edge', t1.added === 5 && sanc.photos.length === 3 && sanc.photos.slice(1).every(p => Math.max(p.width, p.height) === 1600) && sanc.photos[1].source === 'sanctuary-inside.jpg' && sanc.photos[2].source === 'outside-rear-hall.jpg', J(sanc.photos.map(p => [p.source, p.width, p.height])));
  ok('   the en-dash names matched ("Upper Room \u2013 Side")', (side.photos || []).length === 1 && side.photos[0].source === 'upstairs-folding-doors.jpg');
  ok('   SIZES: the Sanctuary 12.6 x 10 m, 132 m\u00b2 as given, theatre 170; the L-shaped Upper Room 62 m\u00b2 as given; the Kitchen from L x W', sanc.dims.length === 12.6 && sanc.dims.width === 10 && sanc.dims.area === 132 && sanc.layouts.theatre === 170 && sanc.layouts.cabaret === 80 && (await room('room_upper')).dims.area === 62 && !('area' in (await room('room_kit')).dims) && !sanc.fireMax && !sanc.dims.height, J(sanc.dims));
  ok('   FLOOR PLANS HELD while the rules are not locked', t1.plans === 0 && !sanc.floorPlan);
  const hire = (await db.collection('churchSettings').doc('hire').get()).data();
  ok('   THE HIRE HEADER: the church\u2019s picture, in its own setting', hire && hire.source === HIRE_PHOTO && /^http/.test(hire.photoUrl));
  const t2 = await roomTool({ db, bucket, from, write: true, sizes: true, plans: true, hire: true, log: quiet });
  ok('   RUN TWICE: nothing twice', t2.added === 0 && t2.sizes === 0 && (await room('room_sanc')).photos.length === 3, J(t2));
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
  const t3 = await roomTool({ db, bucket, from, write: true, plans: true, log: quiet });
  const plan = (await room('room_sanc')).floorPlan;
  ok('   ONCE THE RULES ARE LOCKED the plans go up: at roomPlans/ (not the public rooms/), members and office, NO public link kept', t3.plans === 7 && plan && /^roomPlans\/room_sanc\//.test(plan.path) && !plan.url && (await room('room_sanc')).floorPlanWho === 'members', J(plan));

  /* ---------- 6. the members' room page (the reviewing window, 20 Oct) ---------- */
  /* No room is for hire on the live hub yet: here only the Sanctuary and
     the Creche Room are, so the other seven must still open for a member. */
  for (const id of ['room_upper', 'room_side', 'room_front', 'room_youth', 'room_kit']) await db.collection('rooms').doc(id).update({ bookableByHirers: false });
  const mem = await as('mia');
  await mem.goto(URLB + 'rooms.html', { waitUntil: 'networkidle2' });
  await mem.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => /^\s*Book a room\s*$/i.test(x.textContent)); if (b) b.click(); });
  await until(() => mem.$('#f .bf-room'));
  await mem.$$eval('#f .bf-room', es => es.forEach(e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }));
  await until(async () => (await mem.$$('[data-roomcard]')).length === 7);
  const links = await mem.$$eval('[data-roomcard] [data-more]', es => es.map(e => e.getAttribute('href')));
  ok('6. EVERY ROOM’S "MORE ABOUT THIS ROOM" on the members’ booking goes to the MEMBERS’ page', links.length === 7 && links.every(h => /^room\.html\?id=room_[a-z]+&member=1$/.test(h)), JSON.stringify(links));
  let openedAll = 0; const bad = [];
  for (const h of links) {
    await mem.goto(URLB + h, { waitUntil: 'networkidle2' });
    const t = await until(async () => { const x = await text(mem); return /could not be found|How many it holds/.test(x) ? x : ''; });
    if (t && !/could not be found/.test(t) && /How many it holds/.test(t)) openedAll++; else bad.push(h);
  }
  ok('   AS A MEMBER, EVERY ONE OPENS - for hire or not (photos, size, layouts, facilities)', openedAll === 7, bad.join(', '));
  await mem.goto(URLB + 'room.html?id=room_upper&member=1', { waitUntil: 'networkidle2' });
  await until(async () => /How many it holds/.test(await text(mem)));
  ok('   it shows the kit (the projector that lives there, and what can be brought in)', /In the room: Portable projector \(1\)/.test(await text(mem, '#kit')), await text(mem, '#kit'));
  ok('   and offers "Book a room" (the members’ booking), not the hirers’ form', (await mem.$eval('#ask', e => e.getAttribute('href'))) === 'rooms.html');
  await mem.screenshot({ path: path.join(HERE, 'room-member-page-375.png') });
  /* The floor plan, as its setting allows (put up by the tool above: 'members'). */
  await mem.goto(URLB + 'room.html?id=room_sanc&member=1', { waitUntil: 'networkidle2' });
  await until(() => mem.$('#plan img'));
  ok('   THE FLOOR PLAN ("members and office", the default): a member sees it', !!(await mem.$('#plan img')));
  await mem.browser().close();
  const anon = await as('');
  await anon.goto(URLB + 'room.html?id=room_upper', { waitUntil: 'networkidle2' });
  await until(async () => /could not be found|How many it holds/.test(await text(anon)));
  ok('   SIGNED OUT, a room not for hire is still refused on the public page', /could not be found, or is not for hire/.test(await text(anon)));
  await anon.goto(URLB + 'room.html?id=room_upper&member=1', { waitUntil: 'networkidle2' });
  await sleep(2500);
  ok('   and the members’ address does not show it to someone signed out', !/How many it holds/.test(await text(anon)));
  await anon.goto(URLB + 'room.html?id=room_sanc', { waitUntil: 'networkidle2' });
  await until(async () => /How many it holds/.test(await text(anon)));
  ok('   the public page of a room for hire shows no members-only floor plan', !(await anon.$('#plan')));
  const pRaw = await anon.evaluate((p) => EGBCAuth.storage().ref(p).getDownloadURL().then(() => 'read', e => e.code), (await room('room_sanc')).floorPlan.path);
  ok('   and Storage refuses it to someone signed out', /unauthorized|permission/.test(pRaw), pRaw);
  await anon.browser().close();
  await db.collection('rooms').doc('room_sanc').update({ floorPlanWho: 'office' });
  const mem2 = await as('mia');
  await mem2.goto(URLB + 'room.html?id=room_sanc&member=1', { waitUntil: 'networkidle2' });
  await until(async () => /How many it holds/.test(await text(mem2)));
  await sleep(1000);
  ok('   "OFFICE ONLY": a member no longer sees it', !(await mem2.$('#plan')));
  const mRaw = await mem2.evaluate((p) => EGBCAuth.storage().ref(p).getDownloadURL().then(() => 'read', e => e.code), (await room('room_sanc')).floorPlan.path);
  ok('   and Storage itself refuses it to her (two guards: the page, and the rules)', /unauthorized|permission/.test(mRaw), mRaw);
  await mem2.browser().close();
  const off = await as('martin');
  await off.goto(URLB + 'room.html?id=room_sanc&member=1', { waitUntil: 'networkidle2' });
  await until(() => off.$('#plan img'));
  ok('   the office (a master admin) does', !!(await off.$('#plan img')));
  await off.browser().close();
  await db.collection('rooms').doc('room_sanc').update({ floorPlanWho: 'public' });
  const pub = await as('');
  await pub.goto(URLB + 'room.html?id=room_sanc', { waitUntil: 'networkidle2' });
  await until(() => pub.$('#plan img'));
  ok('   "PUBLIC": the public page shows it, signed out', !!(await pub.$('#plan img')));
  await pub.browser().close();
  await db.collection('rooms').doc('room_sanc').update({ floorPlanWho: 'members' });

  /* ---------- 3. the area as given, kept by Places ---------- */
  const mar = await as('martin');
  await mar.goto(URLB + 'places-admin.html', { waitUntil: 'networkidle2' });
  await mar.waitForSelector('.tab[data-tab="rooms"]'); await tap(mar, '.tab[data-tab="rooms"]');
  await mar.waitForSelector('[data-prof="room_upper"]'); await tap(mar, '[data-prof="room_upper"]');
  await until(() => mar.$('#p-areag'));
  ok('3. PLACES shows the area as given (62)', (await mar.$eval('#p-areag', e => e.value)) === '62' && /Floor area 62 m\u00b2/.test(await text(mar, '#p-area')) && (await mar.$eval('#p-sizenote', e => e.value)) === 'L-shaped.');
  await tap(mar, '#p-save');
  await until(async () => (await room('room_upper')).sizeNote !== undefined && !(await mar.$('#p-save')));
  const up = await room('room_upper');
  ok('   SAVING THE ROOM KEEPS IT: dims.area 62 and the size note', up.dims.area === 62 && up.sizeNote === 'L-shaped.' && up.dims.length === 11.4, J(up.dims));
  await tap(mar, '[data-prof="room_upper"]'); await until(() => mar.$('#p-areag'));
  await setVal(mar, '#p-sizenote', 'L-shaped room (invented change)');
  await tap(mar, '#p-save');
  await until(async () => (await room('room_upper')).sizeNote === 'L-shaped room (invented change)');
  ok('   a CHANGED size note is saved', (await room('room_upper')).sizeNote === 'L-shaped room (invented change)' && (await room('room_upper')).dims.area === 62);
  await tap(mar, '[data-prof="room_upper"]'); await until(() => mar.$('#p-areag'));
  await setVal(mar, '#p-areag', '');
  await tap(mar, '#p-save');
  await until(async () => !('area' in ((await room('room_upper')).dims || {})));
  ok('   emptied, the area is worked out from length x width again (82.1)', !('area' in (await room('room_upper')).dims));
  await mar.goto(URLB + 'room.html?id=room_sanc', { waitUntil: 'networkidle2' });
  await until(async () => /Floor area/.test(await text(mar)));
  const rp = await text(mar);
  ok('   THE ROOM PAGE: 132 m\u00b2 as given, and the size note', /Floor area 132 m\u00b2/.test(rp) && /12\.6 m by 10 m \(Plus a 2\.4 m dais at the front\. Area as marked by the architect\.\)/.test(rp), rp.slice(0, 400));

  /* ---------- 5. the hire page ---------- */
  await mar.goto(URLB + 'hire.html', { waitUntil: 'networkidle2' });
  await until(() => mar.$('#hirePhoto'));
  ok('5. "HIRE OUR ROOMS" shows the church\u2019s picture at the top', (await mar.$eval('#hirePhoto', e => e.src).catch(() => '')) === hire.photoUrl && (await sideways(mar)) <= 0);
  await mar.screenshot({ path: path.join(HERE, 'hire-header-375.png') });
  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
