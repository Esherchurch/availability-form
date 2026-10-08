/* Chunk 4, R1 — room profiles, the public pages, search by need.
   Events window. Invented rooms and people only, events emulators only,
   network guard. The "photos" are drawn in the browser: coloured blocks.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/r1-rooms.test.mjs"

   What it proves:
     1. an admin builds a room's profile on the Places page: two large photos
        are stored no bigger than 1600 pixels, one is made main, a floor plan,
        size (the floor area is worked out), layouts, a fire-safety maximum,
        facilities, description, house rules
     2. the menu takes an item; a piece of kit can be marked as movable
     3. anyone, signed out, sees only the rooms for hire, each with its main
        photo; "40 people, cabaret, projector" leaves one room, and the page
        says why the others do not fit; the fire-safety maximum wins over a
        bigger layout
     4. the room's own page shows the photos, the floor plan, what it holds
        and its facilities; a room not for hire is not shown */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner', BUCKET = PROJECT + '.firebasestorage.app';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098 || cfg.emulators.storage.port !== 9198) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-r1-'));

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 300))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const ADMIN = { email: 'places.admin@example.invalid', name: 'Places Admin' };
ADMIN.uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN.email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
const ROOM = (name, extra) => ({ siteId: 'site_t', name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: false,
  bookableByMembers: true, bookableByHirers: true, description: '', photoUrl: '', ...(extra || {}) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'addressBook', 'm_admin'), { name: ADMIN.name, email: ADMIN.email, markers: ['Core Team'], adminFor: [], masterAdmin: true });
  await setDoc(doc(db, 'users', ADMIN.uid), { memberId: 'm_admin', linkedBy: 'admin', name: ADMIN.name, email: ADMIN.email, teams: ['Core Team'], adminFor: [], masterAdmin: true, status: 'active' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 1 }));
  await setDoc(doc(db, 'rooms', 'room_lounge'), ROOM('Test Lounge', { order: 2, capacity: 25, layouts: { cabaret: 20 }, facilities: { wifi: true } }));
  await setDoc(doc(db, 'rooms', 'room_office'), ROOM('Test Office', { order: 3, bookableByHirers: false }));
  await setDoc(doc(db, 'rooms', 'room_online'), ROOM('Test Online', { order: 4, kind: 'online', siteId: '' }));
  await setDoc(doc(db, 'rooms', 'room_old'), ROOM('Test Old Hut', { order: 5, active: false }));
  await setDoc(doc(db, 'bookableResources', 'kit_urn'), { name: 'Test Urn', quantity: 2, unlimited: false, homeRoomId: 'room_hall', active: true, order: 1 });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.data()));

const errors = [];
async function browser(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); return b;
}
async function page(b, label, width) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const check = (p, sel, on) => p.$eval(sel, (e, on) => { if (e.checked !== on) e.click(); }, on);
const text = (p) => p.$eval('body', e => e.innerText);

try {
  const aB = await browser('admin'); const A = await page(aB, 'admin');
  await A.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await A.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await A.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await A.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), ADMIN.email);

  /* Three invented pictures: two big photos and a plan. */
  const pics = [];
  for (const [n, w, h, colour] of [['hall-a.png', 3000, 2000, '#3d6263'], ['hall-b.png', 2400, 3200, '#b07d2e'], ['plan.png', 1800, 1200, '#6b7280']]) {
    const b64 = await A.evaluate((w, h, c) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
      x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return cv.toDataURL('image/png').split(',')[1]; }, w, h, colour);
    const p = path.join(TMP, n); fs.writeFileSync(p, Buffer.from(b64, 'base64')); pics.push(p);
  }

  /* ---------- 1. the profile ---------- */
  await A.goto(URLB + 'places-admin.html', { waitUntil: 'networkidle2' });
  await A.waitForSelector('.tab[data-tab="rooms"]');
  await tap(A, '.tab[data-tab="rooms"]');
  await A.waitForSelector('[data-prof="room_hall"]');
  ok('each room at a site has a Profile button; the online room does not', !!(await A.$('[data-prof="room_hall"]')) && !(await A.$('[data-prof="room_online"]')));
  await tap(A, '[data-prof="room_hall"]');
  await A.waitForSelector('#p-add');
  await (await A.$('#p-add')).uploadFile(pics[0], pics[1]);
  const photos = await until(async () => { const r = await get('rooms', 'room_hall'); return (r.photos || []).length === 2 ? r.photos : null; }, 30000);
  ok('two photos are stored straight away', photos && photos.length === 2);
  ok('each made no bigger than 1600 pixels on its longest side', photos && photos.every(p => Math.max(p.width, p.height) === 1600), JSON.stringify(photos && photos.map(p => [p.width, p.height])));
  ok('under the room\'s own folder, as JPEGs', photos && photos.every(p => p.path.indexOf('rooms/room_hall/') === 0 && /\.jpg$/.test(p.path)));
  await A.waitForSelector('[data-pmain="1"]');
  await tap(A, '[data-pmain="1"]');
  await until(async () => (await get('rooms', 'room_hall')).photos[0].path === photos[1].path);
  ok('the second is made the main photo', (await get('rooms', 'room_hall')).photos[0].path === photos[1].path);
  await A.waitForSelector('#p-plan');
  await (await A.$('#p-plan')).uploadFile(pics[2]);
  await until(async () => !!(await get('rooms', 'room_hall')).floorPlan, 20000);
  await A.waitForSelector('#p-len');
  await val(A, '#p-len', '12'); await val(A, '#p-wid', '8'); await val(A, '#p-hgt', '4.5');
  ok('the floor area is worked out as it is typed', /Floor area 96 m²/.test(await A.$eval('#p-area', e => e.textContent)));
  await A.select('#p-floor', 'wood');
  await val(A, '#p-toilets', 'Across the corridor');
  await check(A, '#p-light', true);
  await val(A, '#p-lay-theatre', '100'); await val(A, '#p-lay-cabaret', '48');
  await val(A, '#p-fire', '90');
  await check(A, '#p-fac-projector', true); await check(A, '#p-fac-loop', true);
  await val(A, '#p-fac-chairs', '80');
  await val(A, '#p-desc', 'Invented: a bright hall with a wooden floor.');
  await val(A, '#p-rules', 'Invented: no confetti, please.');
  await check(A, '#p-cater', true);
  await A.setViewport({ width: 390, height: 900 });
  await A.screenshot({ path: path.join(HERE, 'r1-profile-375.png'), fullPage: true });
  await A.setViewport({ width: 1100, height: 900 });
  await tap(A, '#p-save');
  const hall = await until(async () => { const r = await get('rooms', 'room_hall'); return r.fireMax === 90 ? r : null; });
  ok('the profile is saved: size, floor, layouts, fire maximum, facilities, words',
    hall && hall.dims.length === 12 && hall.dims.width === 8 && hall.dims.height === 4.5 && hall.floor === 'wood' && hall.naturalLight === true &&
    hall.layouts.theatre === 100 && hall.layouts.cabaret === 48 && hall.facilities.projector === true && hall.facilities.loop === true &&
    hall.facilities.chairs === 80 && /bright hall/.test(hall.description) && /confetti/.test(hall.houseRules) && hall.externalCaterers === true, JSON.stringify(hall));
  ok('the name and everything from Chunk 1 is untouched', hall.name === 'Test Hall' && hall.bookableByHirers === true && hall.siteId === 'site_t' && hall.active === true);
  ok('the files are in storage', (await (await fetch(`http://127.0.0.1:9198/v0/b/${BUCKET}/o?prefix=${encodeURIComponent('rooms/room_hall/')}`, { headers: { Authorization: 'Bearer owner' } })).json()).items.length === 3);

  /* ---------- 2. menu and kit ---------- */
  await tap(A, '.tab[data-tab="catering"]');
  await A.waitForSelector('#m-add');
  await val(A, '#m-name', 'Test tea and coffee'); await val(A, '#m-desc', 'With biscuits');
  await val(A, '#m-price', '1.50'); await val(A, '#m-min', '10'); await val(A, '#m-notice', '5');
  await tap(A, '#m-add');
  const menu = await until(() => readDb(db => getDocs(collection(db, 'menus')).then(s => s.docs.map(d => d.data())[0])));
  ok('the menu takes an item: per person, a price, a minimum, notice', menu && menu.unit === 'head' && menu.price === 1.5 && menu.minimum === 10 && menu.noticeDays === 5 && menu.active === true);
  await until(() => A.$eval('#menu-list', e => /£1\.50 a person/.test(e.innerText)));
  ok('and lists it', /£1\.50 a person · at least 10 · 5 working days/.test(await A.$eval('#menu-list', e => e.innerText)));
  await tap(A, '.tab[data-tab="kit"]');
  await A.waitForSelector('[data-mov="kit_urn"]');
  await tap(A, '[data-mov="kit_urn"]');
  ok('a piece of kit can be marked as movable for a booking', await until(async () => (await get('bookableResources', 'kit_urn')).movable === true));

  /* ---------- 3. the public page, signed out ---------- */
  const gB = await browser('public'); const G = await page(gB, 'public', 390);
  await G.goto(URLB + 'hire.html', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#count');
  const shown = await G.$$eval('[data-room]', as => as.map(a => a.getAttribute('data-room')));
  ok('signed out, only the rooms for hire are shown', JSON.stringify(shown) === '["room_hall","room_lounge"]', JSON.stringify(shown));
  const bg = await G.$eval('[data-room="room_hall"] .pic', e => e.style.backgroundImage);
  /* The main photo is the one made main above, photo two - not merely any photo of the hall. */
  ok('each with its main photo', bg.indexOf(photos[1].path.split('/').pop()) > 0 && bg.indexOf(photos[0].path.split('/').pop()) < 0, bg.slice(0, 160));
  ok('and its size and what it holds', /96 m²/.test(await G.$eval('[data-room="room_hall"]', e => e.innerText)) && /90 theatre · 48 cabaret/.test(await G.$eval('[data-room="room_hall"]', e => e.innerText)));
  await G.screenshot({ path: path.join(HERE, 'r1-hire-375.png'), fullPage: true });
  await val(G, '#q-people', '40');
  await G.select('#q-layout', 'cabaret');
  await G.$eval('.q-fac[value="projector"]', e => e.click());
  await until(async () => (await G.$$eval('[data-room]', as => as.length)) === 1);
  ok('"40 people, cabaret, projector": one room fits', JSON.stringify(await G.$$eval('[data-room]', as => as.map(a => a.getAttribute('data-room')))) === '["room_hall"]');
  ok('and the page says why the other does not', /Test Lounge: holds 20 that way, no projector and screen/.test(await text(G)));
  await val(G, '#q-people', '95');
  await G.select('#q-layout', 'theatre');
  await until(async () => (await G.$$eval('[data-room]', as => as.length)) === 0);
  ok('95 people in theatre rows: no room, because the fire-safety maximum is 90', /Test Hall: holds 90 that way/.test(await text(G)));

  /* ---------- 4. the room's own page ---------- */
  await G.goto(URLB + 'room.html?r=room_hall', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#mainPic');
  ok('the room page shows the main photo first, with the other to choose', (await G.$eval('#mainPic', e => e.src)).indexOf(photos[1].path.split('/').pop()) > 0 && (await G.$$('.thumbs button')).length === 2);
  const roomText = await text(G);
  ok('its size, floor and light', /96 m²/.test(roomText) && /12 m by 8 m/.test(roomText) && /4\.5 m/.test(roomText) && /Wooden/.test(roomText) && /Across the corridor/.test(roomText));
  ok('what it holds, capped by the fire-safety maximum', /Theatre[\s\S]*90/.test(roomText) && /Cabaret[\s\S]*48/.test(roomText) && (await G.$eval('#fireMax', e => e.textContent)) === '90');
  ok('its facilities, chairs counted, and that caterers may be brought', /Projector and screen/.test(roomText) && /Hearing loop/.test(roomText) && /Chairs: 80/.test(roomText) && /bring your own caterers/.test(roomText));
  ok('its floor plan, description and house rules', !!(await G.$('img[alt="Floor plan"]')) && /bright hall/.test(roomText) && /confetti/.test(roomText));
  await G.screenshot({ path: path.join(HERE, 'r1-room-375.png'), fullPage: true });
  await G.goto(URLB + 'room.html?r=room_office', { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok('a room not for hire is not shown', /not for hire/.test(await text(G)));
  await G.goto(URLB + 'room.html?r=room_old', { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok('nor one out of use', /not for hire/.test(await text(G)));
  await aB.close(); await gB.close();
} catch (e) { ok('the run finished', false, e.stack); }

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
