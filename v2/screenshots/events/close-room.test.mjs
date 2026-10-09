/* Close a room (F-123, F-135; Martin, A-M2): the app's Maintenance "Rooms",
   maintenance.html, and what it does to Book a room and Room bookings.
   Also the two style fixes the main window's sweep asked for (places-admin's
   arrow buttons, bookings-admin's h2 weight).
   Events window. Invented people and rooms only, events emulators only,
   network guard, no email leaves the machine (egbc-email's outbox).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/close-room.test.mjs"

   What it proves:
     1. only the Maintenance team and the office close a room
     2. the Maintenance team closes the Hall from the app, with a reason;
        the office is emailed
     3. the Hall disappears from Book a room on those days (members), the
        week shows it closed, and asking for it is refused; the public's
        page says it is closed
     4. the office sees who is booked then, and warns them in one go
     5. "Open it again" brings it back
     6. the style fixes */

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
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-cr-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const D1 = fwd(3), D2 = fwd(4), D3 = fwd(5);

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
  mo:   { email: 'mo.maint@example.invalid', name: 'Mo Maintenance', mid: 'm_mo', teams: ['Maintenance'] },
  ann:  { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] },
  samy: { email: 'samy.member@example.invalid', name: 'Samy Member', mid: 'm_samy', teams: ['Worship Team'] },
  lena: { email: 'lena.office@example.invalid', name: 'Lena Office', mid: 'm_lena', teams: [] },
  max:  { email: 'max.master@example.invalid', name: 'Max Master', mid: 'm_max', teams: ['Core Team'], master: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const ROOM = (name, extra) => ({ siteId: 'site_t', name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
  bookableByMembers: true, bookableByHirers: false, description: '', photoUrl: '', ...(extra || {}) });
/* Samy's band practice in the Hall on the first closed day, confirmed. */
const BK = 'bk_samy_hall_d1_000000000000000';
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1, bookingsEmail: 'bookings@example.invalid' });
  await setDoc(doc(db, 'rooms', 'room_band'), ROOM('Test Band Room', { order: 1, fireMax: 20 }));
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 2, bookableByHirers: true, fireMax: 120 }));
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_lena'], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'bookings', BK), { kind: 'member', status: 'confirmed', siteId: 'site_t', roomId: 'room_hall', groupId: '', day: D1, startMin: 1140, endMin: 1260,
    startLocal: D1 + 'T19:00', endLocal: D1 + 'T21:00', setupMins: 0, packdownMins: 0, slotFrom: 76, slotTo: 84, title: 'Band practice (invented)', people: 6, layout: '',
    av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '', requester: { name: 'Samy Member', email: P.samy.email, phone: '', org: '' },
    memberUid: P.samy.uid, memberName: 'Samy Member', createdAt: 'x' });
  const sl = Array(96).fill(0); for (let i = 76; i < 84; i++) sl[i] = 1;
  await setDoc(doc(db, 'roomDays', 'room_hall_' + D1), { slots: sl, lastBooking: BK, roomId: 'room_hall', day: D1, siteId: 'site_t' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (col, id) => readDb(async (db) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? s.data() : null; });
const list = (col) => readDb(async (db) => (await getDocs(collection(db, col))).docs.map(d => ({ id: d.id, ...d.data() })));

const errors = [], PAGES = [], browsers = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b); return b;
}
async function pageOf(b, label) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 390, height: 844 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  PAGES.push([label, p]);
  return p;
}
async function as(who) {
  const b = await launch(who), p = await pageOf(b, who);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p; return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const app = (space, tab) => 'screenshots/events/app-harness.html?space=' + space + '&tab=' + tab;

try {
  /* 1. who may close */
  const A = (await as('ann')).page;
  await go(A, app('maint', 'rooms'), '.hello');
  await until(async () => /Only the Maintenance team and the office close rooms/.test(await text(A, '#content')));
  ok('1. an Attender is told only the Maintenance team and the office close rooms', /Only the Maintenance team and the office close rooms/.test(await text(A, '#content')) && !(await A.$('[data-mact^="close:"]')));

  /* 2. Mo closes the Hall from the app */
  const M = (await as('mo')).page;
  await go(M, app('maint', 'rooms'), '.hello');
  await until(() => M.$('[data-mact="close:room_hall"]'));
  const mt = await text(M, '#content');
  ok('2. the Maintenance team sees the rooms, each open', /Close a room.*Test Band Room Open.*Test Hall Open/.test(mt), mt);
  await tap(M, '[data-mact="close:room_hall"]');
  await M.waitForSelector('#mt-from');
  await val(M, '#mt-from', D1); await val(M, '#mt-to', D2);
  await tap(M, '[data-mact="doclose"]');
  ok('   not without a reason', !!(await until(async () => /Say why the room is closed/.test(await text(M, '#content')))));
  await val(M, '#mt-why', 'Repainting (invented)');
  await tap(M, '[data-mact="doclose"]');
  const cl = await until(async () => (await list('roomClosures'))[0] || null);
  ok('   CLOSED: the Hall, those two days, the reason, in Mo\'s name', cl && cl.roomId === 'room_hall' && J(cl.days) === J([D1, D2]) && cl.reason === 'Repainting (invented)' && cl.by === P.mo.uid && cl.status === 'on', J(cl));
  const m1 = await get('roomClosedDays', 'room_hall_' + D1), m2 = await get('roomClosedDays', 'room_hall_' + D2), m3 = await get('roomClosedDays', 'room_hall_' + D3);
  ok('   each day is marked closed (and no more)', m1 && m1.on && m2 && m2.on && !m3 && !('reason' in m1), J([m1, m2, m3]));
  await until(async () => /Test Hall closed/.test(await text(M, '#content')));
  const mail = (await outbox(M)).find(m => /Room closed: Test Hall/.test(m.subject));
  ok('   THE OFFICE IS EMAILED (the site\'s bookings address), with the reason', mail && mail.to[0] === 'bookings@example.invalid' && /Repainting/.test(mail.html) && /Room bookings/.test(mail.html), J(mail && mail.to));
  ok('   the app says so, and shows the Hall closed', /Test Hall closed .*The office has been told/.test(await text(M, '#content')) && /Test Hall Closed .*Repainting \(invented\) Closed/.test(await text(M, '[data-m="rooms"]')),
    await text(M, '#content'));
  await M.screenshot({ path: path.join(HERE, 'close-room-app-375.png'), fullPage: true });

  /* 3. Book a room */
  const S = (await as('samy')).page;
  await go(S, 'rooms.html', '#c-date');
  await val(S, '#c-date', D1);
  await until(() => S.$('.bk-row[data-room="room_band"]'));
  ok('3. THE HALL DISAPPEARS FROM BOOK A ROOM THAT DAY; the band room is still there', !(await S.$('.bk-row[data-room="room_hall"]')) && !!(await S.$('.bk-row[data-room="room_band"]')));
  await val(S, '#c-date', D3);
  await until(() => S.$('.bk-row[data-room="room_hall"]'));
  ok('   the day after, it is back', !!(await S.$('.bk-row[data-room="room_hall"]')));
  await tap(S, '#c-week');
  await S.waitForSelector('#c-room');
  await S.select('#c-room', 'room_hall');
  await val(S, '#c-date', D1);
  await until(async () => /· closed/.test(await text(S, '#c-grid')));
  const wk = await text(S, '#c-grid');
  ok('   the Hall\'s week shows the two days closed', (wk.match(/· closed/g) || []).length === 2, wk.slice(0, 300));
  await tap(S, '#c-book');
  await S.waitForSelector('#bf-title');
  await val(S, '#bf-day', D2); await val(S, '#bf-start', '10:00'); await val(S, '#bf-end', '11:00');
  await val(S, '#bf-title', 'Rehearsal (invented)'); await val(S, '#bf-people', '5');
  await until(() => S.$eval('#f-status', e => /closed that day/.test(e.innerText)));
  ok('   asking for it that day is refused: "closed that day"', /Test Hall is not free then \(closed that day\)/.test(await text(S, '#f-status')) && await S.$eval('#f-go', e => e.disabled), await text(S, '#f-status'));
  const sneak = await S.evaluate((d) => EGBCAuth.db.collection('bookings').doc('bk_sneak_hall_00000000000000000').set({ kind: 'member', status: 'requested', siteId: 'site_t', roomId: 'room_hall', groupId: '', day: d,
    startMin: 600, endMin: 660, startLocal: d + 'T10:00', endLocal: d + 'T11:00', setupMins: 0, packdownMins: 0, slotFrom: 40, slotTo: 44, title: 'x', people: 2, layout: '',
    av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '', requester: { name: 'S', email: 's@example.invalid', phone: '', org: '' },
    memberUid: EGBCAuth.user().uid, memberName: 'S', createdAt: 'x' }).then(() => 'written', e => e.code), D2);
  ok('   AND THE RULES REFUSE IT, whatever the page does', sneak === 'permission-denied', sneak);
  const G = (await launch('public')).page || await pageOf(browsers[browsers.length - 1], 'public');
  await go(G, 'book.html?room=room_hall&day=' + D1 + '&start=10:00&end=11:00', '#bf-name');
  await until(() => G.$eval('#f-status', e => /closed that day/.test(e.innerText)));
  ok('   the public\'s page says the room is closed that day', /The room is closed that day/.test(await text(G, '#f-status')));

  /* 4. the office */
  const L = (await as('lena')).page;
  await go(L, 'bookings-admin.html', '.tabs');
  await until(() => L.$('[data-closure]'));
  const card = await text(L, '[data-closure]');
  ok('4. ROOM BOOKINGS SHOWS THE CLOSURE, and who is booked then', /Test Hall closed: .*Repainting \(invented\).*Closed by Mo Maintenance.*1 booked then.*Band practice \(invented\) \(Samy Member\)/.test(card), card);
  ok('   it counts as waiting', /Waiting\s*1/.test(await text(L, '.tabs')), await text(L, '.tabs'));
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, '[data-cwarn]');
  const warned = await until(async () => { const c = await get('roomClosures', cl.id); return c && c.warnedAt ? c : null; });
  const w = (await outbox(L)).find(m => /The room you booked will be closed/.test(m.subject));
  ok('   THE OFFICE WARNS THEM IN ONE GO: Samy is emailed, the booking is kept', warned && warned.warnedCount === 1 && w && w.to[0] === P.samy.email && /has not been cancelled/.test(w.html)
    && (await get('bookings', BK)).status === 'confirmed', J(w && w.subject));
  await until(async () => /Warned: 1 email sent/.test(await text(L, '[data-closure]')));
  ok('   and the card says it has been done', /Warned: 1 email sent/.test(await text(L, '[data-closure]')) && !(await L.$('[data-cwarn]')));
  await L.screenshot({ path: path.join(HERE, 'close-room-office-375.png'), fullPage: true });
  await tap(L, '[data-tab="day"]');
  await L.waitForSelector('#d-day');
  await val(L, '#d-day', D1);
  await until(async () => /Test Hall · closed/.test(await text(L, '#d-grid')));
  ok('   the day view shows the Hall closed', /Test Hall · closed/.test(await text(L, '#d-grid')));
  const h2s = await L.$$eval('h2', hs => hs.map(h => +getComputedStyle(h).fontWeight));
  await tap(L, '[data-tab="waiting"]');
  await until(() => L.$('[data-closure]'));
  const h2w = await L.$$eval('h2', hs => hs.map(h => +getComputedStyle(h).fontWeight));
  ok('6. ROOM BOOKINGS: no heading heavier than 600 (DESIGN.md)', h2s.concat(h2w).length > 0 && h2s.concat(h2w).every(w => w <= 600), J(h2s.concat(h2w)));

  /* 5. open again, from the Maintenance page */
  await go(M, 'maintenance.html', '#closeCard');
  await until(() => M.$('[data-lift]'));
  ok('5. maintenance.html lists the closure for the team', /Test Hall Closed .*Repainting \(invented\)/.test(await text(M, '#closeCard')));
  await M.evaluate(() => EGBCEmail.clearOutbox());
  await tap(M, '[data-lift]');
  const lifted = await until(async () => { const c = await get('roomClosures', cl.id); return c && c.status === 'lifted' ? c : null; });
  const off1 = await get('roomClosedDays', 'room_hall_' + D1);
  ok('   "Open it again" lifts it, in Mo\'s name, and its days open', lifted && lifted.liftedBy === P.mo.uid && off1 && off1.on === false, J(off1));
  ok('   the office is told', !!(await until(async () => (await outbox(M)).find(m => /Room open again: Test Hall/.test(m.subject)))));
  await go(S, 'rooms.html', '#c-date');
  await val(S, '#c-date', D1);
  await until(() => S.$('.bk-row[data-room="room_hall"]'));
  ok('   and the Hall is back in Book a room', !!(await S.$('.bk-row[data-room="room_hall"]')));

  /* 6. places-admin's arrow buttons */
  const X = (await as('max')).page;
  await go(X, 'places-admin.html', 'body');
  await until(() => X.$('[data-mv="rooms"]'));
  const arrows = await X.$$eval('[data-mv]', bs => bs.map(b => ({ t: b.textContent.trim(), label: b.getAttribute('aria-label'), icon: !!b.querySelector('[data-lucide], svg') })));
  ok('6. PLACES: the move buttons are icons with a label, not "↑" and "↓"', arrows.length > 0 && arrows.every(a => a.t === '' && /Move (up|down)/.test(a.label) && a.icon), J(arrows.slice(0, 2)));
  const before = await readDb(async (db) => (await getDocs(collection(db, 'rooms'))).docs.map(d => [d.id, d.data().order]).sort((a, b) => a[1] - b[1]).map(x => x[0]).join());
  await X.$eval('[data-mv="rooms"][data-id="room_hall"][data-d="-1"] [data-lucide], [data-mv="rooms"][data-id="room_hall"][data-d="-1"] svg', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const after = await until(async () => { const o = await readDb(async (db) => (await getDocs(collection(db, 'rooms'))).docs.map(d => [d.id, d.data().order]).sort((a, b) => a[1] - b[1]).map(x => x[0]).join()); return o !== before ? o : null; });
  ok('   a tap on the icon itself still moves the room', after === 'room_hall,room_band', after + ' (was ' + before + ')');

  ok('errors on the pages', errors.length === 0, errors.join(' | '));
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
