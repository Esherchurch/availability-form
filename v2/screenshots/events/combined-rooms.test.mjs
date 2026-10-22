/* Rooms made of other rooms (Martin, 14 Oct 2026): a hall bookable whole
   or in halves - a general Places feature for any church. Events window.
   Invented people and rooms only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/combined-rooms.test.mjs"

   What it proves:
     1. FROM SCRATCH IN PLACES: an admin adds three rooms, marks one as made
        up of the other two, and can change capacities; the list and each
        profile say which is made of which
     2. a member books the whole: both halves are taken, and neither can be
        booked over it (the page says so, and the rules refuse a page that
        tries); a half booked makes the whole unavailable, while the other
        half stays free
     3. the office's day chart shows it: the whole busy when a half is, a
        half busy when the whole is
     4. the office approves, moves and cancels a whole-hall booking: each
        half's time is taken and given back; a member cancels their own
     5. closing the whole closes its halves; opening it opens them
     6. CHANGED LATER: the admin takes a half out of the whole, and the
        diary follows (that half's time is free again; the other is not)
     7. 375px */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-crooms-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);

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
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { email: 'martin.places@example.invalid', name: 'Martin Places (invented)', mid: 'm_martin', master: true },
  samy: { email: 'samy.member@example.invalid', name: 'Samy Member (invented)', mid: 'm_samy' }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: [], adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: [], adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Church (invented)', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_cr'), { name: 'Test Site (invented)', address: 'Invented Road', active: true, order: 1, bookingsEmail: 'bookings@example.invalid' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const slotsOf = async (roomId, day) => { const d = await get('roomDays', roomId + '_' + day); return d ? d.slots : null; };
const taken = (sl, from, to) => !!sl && sl.slice(from, to).every(x => x >= 1);
const freeAt = (sl, from, to) => !sl || sl.slice(from, to).every(x => x === 0);

/* A day a week ahead, never a Sunday (no services on the test site anyway). */
const D = (() => { const d = new Date(); d.setDate(d.getDate() + 8); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
const D2 = (() => { const d = new Date(D + 'T12:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
const S = (h) => h * 4;   /* the quarter-hour an hour starts */

const errors = [], browsers = [];
async function as(who, width = 1280) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));

/* In a page: book a room through the pages' own code (loadDays, prepare,
   write). Resolves 'booked', 'not free' (the page's own check) or the
   refusal's code. force: write even if the page says it is not free. */
const bookIn = (p, roomId, day, start, end, o) => p.evaluate(async (roomId, day, start, end, o) => {
  const B = EGBCBookings, db = EGBCAuth.db;
  const all = (await db.collection('rooms').where('siteId', '==', 'site_cr').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  B.know(all);
  const room = all.find(r => r.id === roomId);
  const days = await B.loadDays([room], day);
  const b = B.prepare({ kind: 'member', room, site: { id: 'site_cr' }, day, start, end, setup: 0, pack: 0, title: (o && o.title) || 'Test booking', people: 10 });
  if (o && o.status) b.status = o.status;
  const s = B.slots(B.toMin(start), B.toMin(end), 0, 0);
  if (!B.free(days[room.id], s) && !(o && o.force)) return 'not free';
  try { const made = await B.write([{ booking: b }], days); window.__lastKey = made[0].key; return 'booked'; }
  catch (e) { return String(e.code || e.message); }
}, roomId, day, start, end, o || {});

try {
  /* ---------- 1. Places, from scratch ---------- */
  const M = await as('martin');
  await M.goto(URLB + 'places-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#r-add');
  await until(() => M.$$eval('#r-site option', os => os.some(o => o.value === 'site_cr')));
  const addRoom = async (name, cap) => {
    await M.select('#r-site', 'site_cr');
    await val(M, '#r-name', name); await val(M, '#r-cap', String(cap));
    await M.$eval('#r-add', b => b.click());
    return until(async () => (await readDb(db => getDocs(query(collection(db, 'rooms'), where('name', '==', name))))).docs[0]?.id);
  };
  const WHOLE = await addRoom('Test hall (invented)', 40);
  const FRONT = await addRoom('Test hall, front (invented)', 25);
  const BACK = await addRoom('Test hall, back (invented)', 20);
  ok('1. FROM SCRATCH: the admin adds three ordinary rooms in Places', !!(WHOLE && FRONT && BACK));
  await until(() => M.$(`[data-prof="${WHOLE}"]`));
  await M.$eval(`[data-prof="${WHOLE}"]`, b => b.click());
  await M.waitForSelector('[data-part]');
  const offered = await M.$$eval('[data-part]', xs => xs.map(x => x.dataset.part));
  ok('   its profile offers the site\'s other rooms as parts, never itself', offered.includes(FRONT) && offered.includes(BACK) && !offered.includes(WHOLE), J(offered));
  await M.$eval(`[data-part="${FRONT}"]`, x => { x.checked = true; });
  await M.$eval(`[data-part="${BACK}"]`, x => { x.checked = true; });
  await val(M, '#p-cap', '45');
  await M.setViewport({ width: 375, height: 900 });
  await sleep(300);
  await M.screenshot({ path: path.join(HERE, 'combined-rooms-profile-375.png'), fullPage: false });
  ok('7. the profile at 375px does not scroll sideways', (await M.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await M.setViewport({ width: 1280, height: 900 });
  await M.$eval('#p-save', b => b.click());
  const w = await until(async () => { const r = await get('rooms', WHOLE); return r && (r.parts || []).length === 2 ? r : null; });
  ok('   ticking two rooms makes it "made up of" them, and its capacity is changed', w && J(w.parts.slice().sort()) === J([FRONT, BACK].sort()) && w.capacity === 45, J(w));
  const listText = await until(async () => { const t = await text(M, '#rooms-list').catch(() => text(M)); return /made up of/.test(t) ? t : null; });
  ok('   the room list says so: "made up of … + …", and each half "part of …"', /made up of Test hall, (front|back) \(invented\) \+ Test hall, (front|back) \(invented\)/.test(listText || '') && /part of Test hall \(invented\)/.test(listText || ''), (listText || '').slice(0, 300));
  await M.$eval(`[data-prof="${FRONT}"]`, b => b.click());
  await M.waitForSelector('#p-partof');
  ok('   a half\'s profile says it is part of the hall, and offers no parts of its own', /part of Test hall \(invented\)/.test(await text(M, '#p-partof')) && !(await M.$('[data-part]')));
  await val(M, '#p-cap', '26');
  await M.$eval('#p-save', b => b.click());
  ok('   a half\'s capacity can be changed too', (await until(async () => ((await get('rooms', FRONT)) || {}).capacity === 26)) === true);

  /* ---------- 2. members book ---------- */
  const Sm = await as('samy');
  await Sm.goto(URLB + 'rooms.html', { waitUntil: 'networkidle2' });
  await Sm.waitForFunction(() => window.EGBCBookings && EGBCBookings.know, { timeout: 20000 });
  ok('2. a member books the WHOLE hall, 10:00 to 11:00', (await bookIn(Sm, WHOLE, D, '10:00', '11:00', { title: 'Whole hall (invented)' })) === 'booked');
  const wholeKey = await Sm.evaluate(() => window.__lastKey);
  ok('   BOTH HALVES are taken then, and the hall keeps no day of its own',
    taken(await slotsOf(FRONT, D), S(10), S(11)) && taken(await slotsOf(BACK, D), S(10), S(11)) && (await slotsOf(WHOLE, D)) === null);
  ok('   the front half cannot be booked over it: the page says so', (await bookIn(Sm, FRONT, D, '10:30', '11:30')) === 'not free');
  ok('   and a page that tries anyway is refused by the rules', /permission/i.test(await bookIn(Sm, FRONT, D, '10:30', '11:30', { force: true })));
  ok('   a half at a free time: fine', (await bookIn(Sm, FRONT, D, '14:00', '15:00', { title: 'Front half (invented)' })) === 'booked');
  ok('   then the WHOLE is not free over it: the page says so', (await bookIn(Sm, WHOLE, D, '14:00', '15:00')) === 'not free');
  ok('   and the rules refuse a page that tries', /permission/i.test(await bookIn(Sm, WHOLE, D, '14:00', '15:00', { force: true })));
  ok('   while the OTHER half then is free', (await bookIn(Sm, BACK, D, '14:00', '15:00', { title: 'Back half (invented)' })) === 'booked');
  /* Either half counts, not just the first: the back alone at 20:00. */
  ok('   the BACK half alone booked at 20:00: the whole is not free then either', (await bookIn(Sm, BACK, D, '20:00', '21:00', { title: 'Back half late (invented)' })) === 'booked'
    && (await bookIn(Sm, WHOLE, D, '20:00', '21:00')) === 'not free');

  /* ---------- 3. the day chart ---------- */
  await M.goto(URLB + 'bookings-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('[data-tab="day"]', { timeout: 20000 });
  await M.$eval('[data-tab="day"]', b => b.click());
  await M.waitForSelector('#d-day');
  await M.$eval('#d-day', (e, d) => { e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, D);
  const cell = (name, hhmm) => M.evaluate((name, hhmm) => {
    const row = Array.from(document.querySelectorAll('#d-grid .bk-row')).find(r => (r.querySelector('.bk-lab') || {}).title === name);
    const c = row && Array.from(row.querySelectorAll('.bk-c')).find(x => x.title.indexOf(hhmm + ' ') === 0);
    return c ? (/ t| s/.test(c.className) ? 'busy' : 'free') : 'missing';
  }, name, hhmm);
  await until(async () => (await cell('Test hall (invented)', '10:00')) !== 'missing', 15000);
  ok('3. THE DAY CHART: the hall busy at 10 (itself) and at 14 (a half is)', (await cell('Test hall (invented)', '10:00')) === 'busy' && (await cell('Test hall (invented)', '14:00')) === 'busy');
  ok('   each half busy at 10 (the whole hall is)', (await cell('Test hall, front (invented)', '10:00')) === 'busy' && (await cell('Test hall, back (invented)', '10:00')) === 'busy');
  ok('   and all three free at 12', (await cell('Test hall (invented)', '12:00')) === 'free' && (await cell('Test hall, front (invented)', '12:00')) === 'free');
  await M.screenshot({ path: path.join(HERE, 'combined-rooms-daychart.png'), fullPage: false });

  /* ---------- 4. the office, and a member cancelling ---------- */
  ok('4. a member asks for the whole hall at 16:00 (it waits)', (await bookIn(Sm, WHOLE, D, '16:00', '17:00', { status: 'requested', title: 'Asked (invented)' })) === 'booked');
  const askKey = await Sm.evaluate(() => window.__lastKey);
  const office = (fn, ...a) => M.evaluate(fn, ...a);
  const approved = await office(async (key) => {
    const B = EGBCBookings, db = EGBCAuth.db;
    const b = Object.assign({ key }, (await db.collection('bookings').doc(key).get()).data());
    const room = Object.assign({ id: b.roomId }, (await db.collection('rooms').doc(b.roomId).get()).data());
    try { await B.approve(b, room, {}); return 'ok'; } catch (e) { return String(e.message || e); }
  }, askKey);
  ok('   the office approves it: both halves taken at 16:00', approved === 'ok' && taken(await slotsOf(FRONT, D), S(16), S(17)) && taken(await slotsOf(BACK, D), S(16), S(17)), approved);
  const moved = await office(async (key, to) => {
    const B = EGBCBookings, db = EGBCAuth.db;
    const b = Object.assign({ key }, (await db.collection('bookings').doc(key).get()).data());
    const from = Object.assign({ id: b.roomId }, (await db.collection('rooms').doc(b.roomId).get()).data());
    const dest = Object.assign({ id: to }, (await db.collection('rooms').doc(to).get()).data());
    try { await B.move(b, from, dest, { day: b.day, start: '18:00', end: '19:00' }, {}); return 'ok'; } catch (e) { return String(e.message || e); }
  }, askKey, FRONT);
  ok('   moved to the front half at 18:00: both halves free at 16, the front taken at 18, the back not',
    moved === 'ok' && freeAt(await slotsOf(FRONT, D), S(16), S(17)) && freeAt(await slotsOf(BACK, D), S(16), S(17)) && taken(await slotsOf(FRONT, D), S(18), S(19)) && freeAt(await slotsOf(BACK, D), S(18), S(19)), moved);
  const cancelled = await office(async (key) => {
    const B = EGBCBookings, db = EGBCAuth.db;
    const b = Object.assign({ key }, (await db.collection('bookings').doc(key).get()).data());
    const room = Object.assign({ id: b.roomId }, (await db.collection('rooms').doc(b.roomId).get()).data());
    try { await B.cancel(b, room, 'Test'); return 'ok'; } catch (e) { return String(e.message || e); }
  }, askKey);
  ok('   the office cancels it: the front is free at 18 again', cancelled === 'ok' && freeAt(await slotsOf(FRONT, D), S(18), S(19)), cancelled);
  const own = await Sm.evaluate(async (key) => {
    const B = EGBCBookings, db = EGBCAuth.db;
    const b = Object.assign({ key }, (await db.collection('bookings').doc(key).get()).data());
    try { await B.cancelOwn(b); return 'ok'; } catch (e) { return String(e.code || e.message || e); }
  }, wholeKey);
  ok('   the member cancels their own whole-hall booking: both halves free at 10 again', own === 'ok' && freeAt(await slotsOf(FRONT, D), S(10), S(11)) && freeAt(await slotsOf(BACK, D), S(10), S(11)), own);

  /* ---------- 5. closures ---------- */
  const closed = await office(async (id, d2) => {
    const B = EGBCBookings, db = EGBCAuth.db;
    const room = Object.assign({ id }, (await db.collection('rooms').doc(id).get()).data());
    const site = Object.assign({ id: 'site_cr' }, (await db.collection('sites').doc('site_cr').get()).data());
    try { const c = await B.closeRoom({ room, site, from: d2, to: d2, reason: 'Test: floor being sanded (invented)' }); window.__closure = c; return 'ok'; } catch (e) { return String(e.code || e.message || e); }
  }, WHOLE, D2);
  const shut = await Sm.evaluate(async (ids, d2) => {
    const all = (await EGBCAuth.db.collection('rooms').where('siteId', '==', 'site_cr').get()).docs.map(d => ({ id: d.id, ...d.data() }));
    return EGBCBookings.closedOn(all.filter(r => ids.includes(r.id)), d2);
  }, [WHOLE, FRONT, BACK], D2);
  ok('5. closing the whole hall closes both halves', closed === 'ok' && shut[WHOLE] && shut[FRONT] && shut[BACK], closed + ' ' + J(shut));
  ok('   a half cannot be booked that day (the rules refuse it)', /permission/i.test(await bookIn(Sm, FRONT, D2, '10:00', '11:00', { force: true })));
  const lifted = await office(async () => { const site = Object.assign({ id: 'site_cr' }, (await EGBCAuth.db.collection('sites').doc('site_cr').get()).data());
    try { await EGBCBookings.liftClosure(window.__closure, site); return 'ok'; } catch (e) { return String(e.code || e.message || e); } });
  ok('   opening it again opens the halves: the front can be booked', lifted === 'ok' && (await bookIn(Sm, FRONT, D2, '10:00', '11:00')) === 'booked', lifted);

  /* ---------- 6. changed later ---------- */
  ok('6. the whole hall is booked at 12:00', (await bookIn(Sm, WHOLE, D, '12:00', '13:00', { title: 'Before the change (invented)' })) === 'booked');
  await M.goto(URLB + 'places-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$(`[data-prof="${WHOLE}"]`));
  await M.$eval(`[data-prof="${WHOLE}"]`, b => b.click());
  await M.waitForSelector(`[data-part="${BACK}"]`);
  await M.$eval(`[data-part="${BACK}"]`, x => { x.checked = false; });
  await M.$eval('#p-save', b => b.click());
  const after = await until(async () => { const r = await get('rooms', WHOLE); return r && J(r.parts) === J([FRONT]) ? r : null; });
  const reworked = await until(async () => freeAt(await slotsOf(BACK, D), S(12), S(13)) ? 'yes' : null, 15000);
  ok('   the admin takes the back half out of it: the diary follows - the back is free at 12, the front still taken',
    !!after && reworked === 'yes' && taken(await slotsOf(FRONT, D), S(12), S(13)), J(after && after.parts));
  ok('   and the back can now be booked then', (await bookIn(Sm, BACK, D, '12:00', '13:00')) === 'booked');
  ok('   the bookings made earlier are all still held (front 14:00, back 14:00)', taken(await slotsOf(FRONT, D), S(14), S(15)) && taken(await slotsOf(BACK, D), S(14), S(15)));

  ok('no page threw an error', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
