/* F-072a — an event in a room books that room (Martin, after R3).
   Events window. Invented rooms and people only, events emulators only,
   network guard, no email leaves the machine.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/r3-event-rooms.test.mjs"

   What it proves, on events-admin.html:
     1. saving an event in a room books the room, with its setting up and
        clearing away, under the same rules as any booking
     2. moving the event moves the booking (the same booking, not a new one)
     3. a room that is taken: the page says what is there, nothing is saved,
        and it offers a room that is free; choosing it saves the event there
     4. a room taken by a service: an admin books over it, with a reason
     5. cancelling the event gives the room back
     6. a repeating event books every date; deleting the series gives them back */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-r3-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

/* Dates: Wednesdays from at least a fortnight away (W[0] to W[5]), and the
   Thursday after the first (T[0] to T[6]). */
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const base = new Date(); base.setHours(12, 0, 0, 0); base.setDate(base.getDate() + 14);
while (base.getDay() !== 3) base.setDate(base.getDate() + 1);
const plus = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return ymd(d); };
const W = [0, 7, 14, 21, 28, 35].map(plus), T = [1, 8, 15, 22, 29, 36, 43].map(plus);

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

const P = {
  karen: { email: 'karen.admin@example.invalid', name: 'Karen Admin', mid: 'm_karen', admin: true },
  samy:  { email: 'samy.member@example.invalid', name: 'Samy Member', mid: 'm_samy' },
  lena:  { email: 'lena.office@example.invalid', name: 'Lena Office', mid: 'm_lena' }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const ROOM = (name, extra) => ({ siteId: 'site_t', name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
  bookableByMembers: true, bookableByHirers: false, description: '', photoUrl: '', ...(extra || {}) });
const Z = () => Array(96).fill(0);
const take = (from, to, n, sl) => { const a = sl || Z(); for (let i = from; i < to; i++) a[i] = n == null ? 1 : n; return a; };
const SUN = plus(4);
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.admin ? ['Core Team'] : ['Worship'], adminFor: [], masterAdmin: !!x.admin });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.admin ? ['Core Team'] : ['Worship'],
      adminFor: [], masterAdmin: !!x.admin, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  /* Sunday worship takes the hall 09:30-12:30 every Sunday (38 to 49). */
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1,
    rotaBusy: [{ type: 'Sunday morning worship', roomIds: ['room_hall'], days: [7], from: '09:30', to: '12:30' }] });
  const week = { '1': Z(), '2': Z(), '3': Z(), '4': Z(), '5': Z(), '6': Z(), '7': take(38, 50) };
  await setDoc(doc(db, 'rooms', 'room_band'), ROOM('Test Band Room', { order: 1, fireMax: 60 }));
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 2, fireMax: 120, rotaWeek: week }));
  await setDoc(doc(db, 'rooms', 'room_vestry'), ROOM('Test Vestry', { order: 3, fireMax: 60 }));
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
  /* Samy's band practice, 18:00-19:00 on the first Wednesday. */
  await setDoc(doc(db, 'bookings', 'bk_samy_band_00000000000000000'), { kind: 'member', status: 'confirmed', siteId: 'site_t', roomId: 'room_band', groupId: '', day: W[0],
    startMin: 1080, endMin: 1140, startLocal: W[0] + 'T18:00', endLocal: W[0] + 'T19:00', setupMins: 0, packdownMins: 0, slotFrom: 72, slotTo: 76,
    title: 'Test band practice', people: 5, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '',
    requester: { name: P.samy.name, email: P.samy.email, phone: '', org: '' }, memberUid: P.samy.uid, memberName: P.samy.name, createdAt: 'x' });
  await setDoc(doc(db, 'roomDays', 'room_band_' + W[0]), { slots: take(72, 76), lastBooking: 'bk_samy_band_00000000000000000', roomId: 'room_band', day: W[0], siteId: 'site_t' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const bookings = (w) => readDb(db => getDocs(query(collection(db, 'bookings'), where(w[0], '==', w[1]))).then(s => s.docs.map(d => ({ key: d.id, ...d.data() }))));
const range = (sl, a, b) => sl.slice(a, b);

const errors = [], PAGES = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); return b;
}
async function pageOf(b, label, width) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  PAGES.push([label, p]);
  return p;
}
async function as(who, width) {
  const b = await launch(who), p = await pageOf(b, who, width);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p; return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const check = (p, sel, on) => p.$eval(sel, (e, on) => { if (e.checked !== on) e.click(); }, on);
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const ics = (m) => { const a = (m && m.attachments || []).find(x => x.filename === 'booking.ics'); return a ? Buffer.from(a.content, 'base64').toString('utf8') : ''; };
const events = (m) => (ics(m).match(/BEGIN:VEVENT/g) || []).length;
async function pick(p, room, day, slot) {
  await p.waitForSelector(`.bk-row[data-room="${room}"][data-day="${day}"] [data-slot="${slot}"]`, { timeout: 15000 });
  await tap(p, `.bk-row[data-room="${room}"][data-day="${day}"] [data-slot="${slot}"]`);
  await p.waitForSelector('#bf-title');
}
const settled = (p) => until(() => p.evaluate(() => !!document.querySelector('[data-made]') || document.getElementById('toast').style.display === 'block'), 15000);
const goReady = (p, label) => until(() => p.$eval('#f-go', (e, l) => !e.disabled && (!l || e.textContent === l), label), 15000);
const toastText = (p) => until(() => p.evaluate(() => { const t = document.getElementById('toast'); return t.style.display === 'block' ? t.textContent : ''; }), 15000);

try {
  const kB = await as('karen', 1100); const K = kB.page;
  const evByTitle = (t) => readDb(db => getDocs(query(collection(db, 'calEvents'), where('title', '==', t))).then(q => q.docs.map(d => ({ id: d.id, ...d.data() }))));
  const forEvent = (id) => bookings(['calEventId', id]);
  /* Fill in a new event and press Save. */
  async function newEvent(o) {
    await go(K, 'events-admin.html', '#newEv');
    await tap(K, '#newEv');
    await K.waitForSelector('#f_title');
    await val(K, '#f_title', o.title);
    await val(K, '#f_start', o.start); await val(K, '#f_end', o.end);
    if (o.every) { await K.select('#f_repeat', String(o.every)); await val(K, '#f_until', o.until); }
    await K.waitForSelector('#f_rooms');
    await K.$eval('#f_rooms', (e, ids) => { [].forEach.call(e.options, x => { x.selected = ids.indexOf(x.value) >= 0; }); }, o.rooms);
    if (o.setup) await K.select('#f_setup', String(o.setup));
    if (o.pack) await K.select('#f_pack', String(o.pack));
    await tap(K, '#save');
  }
  const savedAs = (t) => until(async () => { const l = await evByTitle(t); return l.length ? l[0] : null; }, 20000);
  const bookedFor = (id, n) => until(async () => { const l = (await forEvent(id)).filter(b => b.status === 'confirmed'); return l.length >= (n || 1) ? l : null; }, 20000);

  /* ---------- 1. an event in the hall books the hall ---------- */
  await newEvent({ title: 'Test harvest supper', start: W[0] + 'T19:00', end: W[0] + 'T21:00', rooms: ['room_hall'], setup: 30, pack: 15 });
  const harvest = await savedAs('Test harvest supper');
  const hb = (await bookedFor(harvest.id))[0];
  ok('1. saving the supper in the hall books the hall for it', hb && hb.kind === 'event' && hb.roomId === 'room_hall' && hb.calEventId === harvest.id, JSON.stringify(hb));
  ok('   18:30 to 21:15: the supper with its setting up and clearing away', hb && hb.slotFrom === 74 && hb.slotTo === 85);
  ok('   and the hall\'s day holds exactly that', range((await get('roomDays', 'room_hall_' + W[0])).slots, 74, 85).every(x => x === 1) && (await get('roomDays', 'room_hall_' + W[0])).slots[73] === 0);
  await K.waitForSelector('#roomBooked');
  ok('   the event says where it is booked', /Booked: Test Hall/.test(await K.$eval('#roomBooked', e => e.textContent)));

  /* ---------- 2. moving the event moves the booking ---------- */
  await val(K, '#f_start', W[0] + 'T20:00'); await val(K, '#f_end', W[0] + 'T22:00');
  await tap(K, '#save');
  await until(async () => (await get('bookings', hb.key)).startMin === 1200, 20000);
  const moved = await get('bookings', hb.key), hall0 = (await get('roomDays', 'room_hall_' + W[0])).slots;
  ok('2. moved to 20:00: the same booking moves (19:30 to 22:15), no second one', moved.slotFrom === 78 && moved.slotTo === 89 && (await forEvent(harvest.id)).length === 1);
  ok('   the old time is given back, the new time held', range(hall0, 74, 78).every(x => x === 0) && range(hall0, 78, 89).every(x => x === 1));

  /* ---------- 3. the band room is taken ---------- */
  await newEvent({ title: 'Test choir night', start: W[0] + 'T18:00', end: W[0] + 'T19:30', rooms: ['room_band'] });
  await K.waitForSelector('#clashSay', { timeout: 20000 });
  const say = await K.$eval('#clashSay', e => e.innerText);
  ok('3. the band room is taken: the page says what is there', /Test Band Room is taken/.test(say) && /Test band practice \(18:00–19:00\)/.test(say), say);
  ok('   and nothing is saved yet', (await evByTitle('Test choir night')).length === 0);
  ok('   it offers the vestry, which is free then', !!(await K.$('[data-useroom="room_vestry"]')));
  await K.setViewport({ width: 375, height: 1800 });
  await K.screenshot({ path: path.join(HERE, 'r3-event-clash-375.png') });
  await K.setViewport({ width: 1100, height: 900 });
  await tap(K, '[data-useroom="room_vestry"]');
  const choir = await savedAs('Test choir night');
  const cb = await bookedFor(choir.id);
  ok('   choosing it saves the event in the vestry, and books the vestry', choir.location.roomIds.join() === 'room_vestry' && cb[0].roomId === 'room_vestry');
  ok('   Samy\'s practice is untouched', range((await get('roomDays', 'room_band_' + W[0])).slots, 72, 76).every(x => x === 1) && (await get('bookings', 'bk_samy_band_00000000000000000')).status === 'confirmed');

  /* ---------- 4. over the Sunday service, with a reason ---------- */
  await newEvent({ title: 'Test baptism lunch', start: SUN + 'T12:00', end: SUN + 'T14:00', rooms: ['room_hall'] });
  await K.waitForSelector('#f_overNote', { timeout: 20000 });
  ok('4. the hall on Sunday at 12:00: the page says the service is there', /Sunday morning worship/.test(await K.$eval('#clashSay', e => e.innerText)));
  await tap(K, '#f_overGo');
  await sleep(800);
  ok('   booking over it needs a reason', (await evByTitle('Test baptism lunch')).length === 0);
  await val(K, '#f_overNote', 'Test: the service ends early that week');
  await tap(K, '#f_overGo');
  const lunch = await savedAs('Test baptism lunch');
  const lb = (await bookedFor(lunch.id))[0];
  const sunHall = (await get('roomDays', 'room_hall_' + SUN)).slots;
  ok('   with a reason, it is booked over the service, and the reason kept', lb.override === true && /ends early/.test(lb.decisionNote));
  ok('   the service and the lunch are both counted (2), the rest of the lunch 1', sunHall[48] === 2 && sunHall[49] === 2 && sunHall[50] === 1 && sunHall[55] === 1);

  /* ---------- 5. cancelling the event gives the room back ---------- */
  await go(K, 'events-admin.html', '#newEv');
  await K.evaluate((id) => { const el = [...document.querySelectorAll('[data-id]')].find(x => x.getAttribute('data-id') === id); if (el) el.click(); }, harvest.id);
  await K.waitForSelector('#cancelEv', { timeout: 20000 });
  await tap(K, '#cancelEv');
  await until(async () => (await get('bookings', hb.key)).status === 'cancelled', 20000);
  ok('5. cancelling the supper cancels its booking and frees the hall', range((await get('roomDays', 'room_hall_' + W[0])).slots, 78, 89).every(x => x === 0));

  /* ---------- 6. a repeating event ---------- */
  await newEvent({ title: 'Test toddlers', start: W[1] + 'T10:00', end: W[1] + 'T11:30', rooms: ['room_vestry'], every: 7, until: W[3] });
  const tod = await until(async () => { const l = await evByTitle('Test toddlers'); return l.length === 3 ? l : null; }, 25000);
  const todB = tod ? await until(async () => { const all = (await Promise.all(tod.map(e => forEvent(e.id)))).flat().filter(b => b.status === 'confirmed'); return all.length === 3 ? all : null; }, 25000) : null;
  ok('6. a weekly event, three dates: the vestry is booked for each', todB && todB.map(b => b.day).sort().join() === [W[1], W[2], W[3]].join(), JSON.stringify(todB && todB.map(b => b.day)));
  await K.waitForSelector('#delSeries', { timeout: 20000 });
  await tap(K, '#delSeries');
  await until(async () => (await evByTitle('Test toddlers')).length === 0, 25000);
  const after6 = await Promise.all([W[1], W[2], W[3]].map(d => get('roomDays', 'room_vestry_' + d)));
  ok('   deleting the series gives every date back', after6.every(d => d && range(d.slots, 40, 46).every(x => x === 0)) && (await Promise.all(todB.map(b => get('bookings', b.key)))).every(b => b.status === 'cancelled'));

  await kB.close();
} catch (e) {
  ok('the run finished', false, e.stack);
  for (const [l, p] of PAGES) { try { console.log('     [' + l + '] ' + p.url() + ' :: ' + (await p.$eval('body', b => b.innerText)).replace(/\s+/g, ' ').slice(0, 600)); } catch (x) {} }
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
