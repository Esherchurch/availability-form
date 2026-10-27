/* ROOMS ON THE DAY AND AFTER (F-260): "we've arrived", the office's Today,
   the caterers' list, room use, rooms side by side, and the Places settings.
   Events window. Invented people and rooms only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/roomday.test.mjs"

   What it proves:
     1. the office's Today: who is late, who is due; "Mark arrived"; a flag
        the 15-minute check made shows as "office emailed"
     2. the hirer says "We've arrived" from their booking's own link
     3. a member says so from Book a room
     4. a mistaken "arrived" comes off
     5. the caterers' list: made by the server from the booking (nobody's
        name), marked prepared then served; someone else is turned away
     6. room use: hours booked this month, by kind
     7. rooms side by side on Hire our rooms and Book a room
     8. Places: the flag's minutes and the opening hours are saved */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { syncCatering } from '../../functions/rooms-day.js';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-rd-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = fwd(0), TOMORROW = fwd(1);
/* "now" as the pages see it; a booking an hour ago is late, one in an hour is due */
const NOW = new Date().getHours() * 60 + new Date().getMinutes();
if (NOW < 75 || NOW > 1350) { console.log('  This check needs to run between 01:15 and 22:30 (it books an hour either side of now).'); process.exit(1); }
const AGO = Math.floor((NOW - 60) / 15) * 15, SOON = Math.ceil((NOW + 60) / 15) * 15;

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
  samy: { email: 'samy.member@example.invalid', name: 'Samy Member', mid: 'm_samy', teams: ['Worship Team'] },
  lena: { email: 'lena.office@example.invalid', name: 'Lena Office', mid: 'm_lena', teams: [] },
  cook: { email: 'cook.catering@example.invalid', name: 'Cook Caterer', mid: 'm_cook', teams: ['Catering'] },
  ann:  { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: ['Welcome'] },
  max:  { email: 'max.master@example.invalid', name: 'Max Master', mid: 'm_max', teams: ['Core Team'], master: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const ROOM = (name, extra) => ({ siteId: 'site_t', name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
  bookableByMembers: true, bookableByHirers: false, description: '', photoUrl: '', ...(extra || {}) });
const K = (n) => ('bk_' + n).padEnd(32, '0');
const BOOK = (key, o) => Object.assign({ kind: 'hire', status: 'confirmed', siteId: 'site_t', roomId: 'room_hall', groupId: '', day: TODAY, startMin: AGO, endMin: AGO + 60,
  setupMins: 0, packdownMins: 0, slotFrom: AGO / 15, slotTo: AGO / 15 + 4, title: 'Invented booking', people: 10, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false },
  resources: [], notes: '', requester: { name: 'Hirer Synthetic', email: 'hirer@example.invalid', phone: '01234 000000', org: '' }, memberUid: '', memberName: '', createdAt: 'x' }, o);
const B = {
  late:   [K('late'), BOOK(K('late'), { title: 'Late hire (invented)' })],
  flag:   [K('flag'), BOOK(K('flag'), { title: 'Flagged hire (invented)', roomId: 'room_band', arrivalFlaggedAt: new Date().toISOString() })],
  member: [K('member'), BOOK(K('member'), { kind: 'member', title: 'Band practice (invented)', roomId: 'room_lounge', memberUid: '', memberName: 'Samy Member', requester: { name: 'Samy Member', email: 'samy.member@example.invalid', phone: '', org: '' } })],
  office: [K('office'), BOOK(K('office'), { kind: 'office', title: 'Office meeting (invented)', startMin: SOON, endMin: SOON + 60, slotFrom: SOON / 15, slotTo: SOON / 15 + 4 })],
  /* the office's own, started an hour ago: never "late" */
  office2: [K('office2'), BOOK(K('office2'), { kind: 'office', title: 'Office set-up (invented)', roomId: 'room_band' })],
  food:   [K('food'), BOOK(K('food'), { day: TOMORROW, title: 'Book club (invented)', roomId: 'room_band', requester: { name: 'Secret Hirer', email: 'secret@example.invalid', phone: '07000 000000', org: '' },
    refreshments: { needed: true, servingAt: '10:30', items: [{ id: 'tea', name: 'Tea and coffee', qty: 12, unit: 'cup', price: 1.5 }], dietary: { vegan: 2 }, notes: 'Oat milk please' } })]
};
B.member[1].memberUid = P.samy.uid;
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active', roles: x.master ? {} : { [x.teams[0] || 'Worship Team']: 'leader' } });   /* Book a room is for team leaders (H-16) */
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  /* open all day here, so "booked this month" does not depend on the clock */
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1, bookingsEmail: 'bookings@example.invalid', openFrom: 0, openTo: 1440 });
  await setDoc(doc(db, 'rooms', 'room_band'), ROOM('Test Band Room', { order: 1, fireMax: 20, bookableByHirers: true, layouts: { theatre: 25 }, facilities: { piano: true } }));
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 2, bookableByHirers: true, fireMax: 120, layouts: { theatre: 100, cabaret: 60 }, dims: { length: 10, width: 12 }, naturalLight: true, facilities: { projector: true } }));
  await setDoc(doc(db, 'rooms', 'room_lounge'), ROOM('Test Lounge', { order: 3, bookableByHirers: true, capacity: 15 }));
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_lena'], safeguardingLead: '', safeguardingDeputy: '' });
  for (const [key, b] of Object.values(B)) await setDoc(doc(db, 'bookings', key), b);
  /* THE SERVER'S PART, as the trigger runs it: syncCatering, over the emulator */
  const adapter = { collection: (c) => ({ doc: (id) => ({
    get: async () => { const s = await getDoc(doc(db, c, id)); return { exists: s.exists(), data: () => (s.exists() ? s.data() : undefined) }; },
    set: (v) => setDoc(doc(db, c, id), v), delete: () => deleteDoc(doc(db, c, id)) }) }) };
  for (const [key, b] of Object.values(B)) await syncCatering(adapter, key, b);
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (col, id) => readDb(async (db) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? s.data() : null; });

const errors = [], browsers = [];
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

try {
  /* 1. the office's Today */
  const L = (await as('lena')).page;
  await go(L, 'bookings-admin.html', '[data-tab="today"]');
  const badge = await L.$eval('[data-tab="today"]', e => e.innerText.replace(/\s+/g, ' '));
  ok('1. TODAY: the tab counts who has not arrived (the late hire, the flagged one, the member)', /Today\s*3/.test(badge), badge);
  await tap(L, '[data-tab="today"]');
  await L.waitForSelector('#arrivals');
  const chips = await L.$$eval('[data-arrive]', rs => rs.map(r => [r.getAttribute('data-arrive'), (r.querySelector('[data-arr]') || {}).getAttribute ? r.querySelector('[data-arr]').getAttribute('data-arr') : '']));
  const chip = (k) => (chips.filter(c => c[0] === k)[0] || [])[1];
  ok('   the hire an hour ago is late; the office\'s own bookings (an hour ago, in an hour) are only due', chip(B.late[0]) === 'late' && chip(B.office[0]) === 'due' && chip(B.office2[0]) === 'due', J(chips));
  ok('   tomorrow\'s booking is not on today\'s list', !chip(B.food[0]));
  ok('   a flag the 15-minute check made says the office was emailed', /office emailed/.test(await text(L, `[data-arrive="${B.flag[0]}"]`)));
  ok('   the hirer\'s name and phone are there to ring', /Hirer Synthetic, 01234 000000/.test(await text(L, `[data-arrive="${B.late[0]}"]`)));
  await tap(L, `[data-markarrive="${B.flag[0]}"]`);
  const byOffice = await until(async () => (await get('bookings', B.flag[0])).arrived);
  ok('   "Mark arrived": saved with the server\'s time and who did it', byOffice && byOffice.by === 'office' && byOffice.name === 'Lena Office' && byOffice.at && byOffice.at.toDate, J(byOffice));

  /* 2. the hirer, from their own link, signed out */
  const Hb = await launch('hirer'), H = await pageOf(Hb, 'hirer');
  await go(H, 'my-booking.html?k=' + B.late[0], '#arriveGo');
  await tap(H, '#arriveGo');
  await H.waitForSelector('#arrivedMsg', { timeout: 15000 });
  const byHirer = (await get('bookings', B.late[0])).arrived;
  ok('2. THE HIRER says "We\'ve arrived" from their booking\'s link', byHirer && byHirer.by === 'hirer' && byHirer.name === 'Hirer Synthetic', J(byHirer));
  ok('   and is told so, with the time', /marked as arrived at \d\d:\d\d/.test(await text(H, '#arrivedMsg')), await text(H, '#arrivedMsg'));
  await go(H, 'my-booking.html?k=' + B.food[0], '#arrivedMsg, .card, h1');
  ok('   tomorrow\'s booking has no "We\'ve arrived" yet', !(await H.$('#arriveGo')));

  /* 3. the member, from Book a room */
  const S = (await as('samy')).page;
  await go(S, 'rooms.html', `[data-bk="${B.member[0]}"] [data-arrive]`);
  await tap(S, `[data-bk="${B.member[0]}"] [data-arrive]`);
  await S.waitForSelector(`[data-bk="${B.member[0]}"] [data-arrived]`, { timeout: 15000 });
  const byMember = (await get('bookings', B.member[0])).arrived;
  ok('3. A MEMBER says so on their own booking', byMember && byMember.by === 'member' && byMember.name === 'Samy Member', J(byMember));

  /* 4. back on Today: everyone arrived; one taken off again */
  await go(L, 'bookings-admin.html', '[data-tab="today"]');
  const badge2 = await L.$eval('[data-tab="today"]', e => e.innerText.replace(/\s+/g, ' '));
  await tap(L, '[data-tab="today"]'); await L.waitForSelector('#arrivals');
  const t2 = await text(L, `[data-arrive="${B.late[0]}"]`);
  ok('4. TODAY again: nobody late now; the hirer\'s own "arrived" says so', !/\d/.test(badge2.replace('Today', '')) && /Arrived \d\d:\d\d \(the hirer said so\)/.test(t2) && !(await L.$('#lateCount')), badge2 + ' | ' + t2);
  await tap(L, `[data-unarrive="${B.late[0]}"]`);
  ok('   "Not arrived after all" takes it off', await until(async () => !(await get('bookings', B.late[0])).arrived));
  await L.waitForSelector(`[data-arrive="${B.late[0]}"] [data-arr="late"]`, { timeout: 15000 }).catch(() => {});
  ok('   and it is late again', !!(await L.$(`[data-arrive="${B.late[0]}"] [data-arr="late"]`)));

  /* 5. the caterers' list */
  const order = await get('cateringOrders', B.food[0]);
  ok('5. THE SERVER made the kitchen\'s order from the booking, with no name, email, phone or price', order && order.people === 10 && order.servingAt === '10:30' && !/Secret|example\.invalid|07000|price/.test(J(order)), J(order));
  ok('   and none for bookings with no refreshments', !(await get('cateringOrders', B.late[0])));
  const C = (await as('cook')).page;
  await go(C, 'catering.html', `[data-corder="${B.food[0]}"]`);
  const ct = await text(C, `[data-corder="${B.food[0]}"]`);
  ok('   the Catering team sees what to make, for how many, when and where', /10:30/.test(ct) && /Test Band Room/.test(ct) && /10 people/.test(ct) && /12 × Tea and coffee/.test(ct) && /2 vegan/.test(ct) && /Oat milk please/.test(ct), ct);
  ok('   and not who booked', !/Secret Hirer|secret@|07000/.test(await text(C)));
  await tap(C, `[data-corder="${B.food[0]}"] [data-cset="prepared"]`);
  await C.waitForSelector(`[data-corder="${B.food[0]}"] [data-cstate="prepared"]`, { timeout: 15000 });
  const prep = await get('cateringOrders', B.food[0]);
  ok('   "Prepared" is saved with who', prep.state === 'prepared' && prep.stateBy === P.cook.uid && prep.stateByName === 'Cook Caterer', J({ state: prep.state, by: prep.stateByName }));
  await tap(C, `[data-corder="${B.food[0]}"] [data-cset="served"]`);
  await C.waitForSelector(`[data-corder="${B.food[0]}"] [data-cstate="served"]`, { timeout: 15000 });
  ok('   then "Served"', (await get('cateringOrders', B.food[0])).state === 'served');
  /* the booking changes; how far the kitchen got is kept */
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const adapter = { collection: (c) => ({ doc: (id) => ({ get: async () => { const s = await getDoc(doc(db, c, id)); return { exists: s.exists(), data: () => (s.exists() ? s.data() : undefined) }; }, set: (v) => setDoc(doc(db, c, id), v), delete: () => deleteDoc(doc(db, c, id)) }) }) };
    await syncCatering(adapter, B.food[0], Object.assign({}, B.food[1], { people: 14 }));
  });
  const moved = await get('cateringOrders', B.food[0]);
  ok('   a change to the booking (14 people) updates the order and keeps "served"', moved.people === 14 && moved.state === 'served', J({ people: moved.people, state: moved.state }));
  await go(L, 'catering.html', `[data-corder="${B.food[0]}"]`);
  ok('   the site\'s bookings admin sees it too', /14 people/.test(await text(L, `[data-corder="${B.food[0]}"]`)));
  const A = (await as('ann')).page;
  await go(A, 'catering.html', '#app .card');
  ok('   someone else is told the page is for the caterers', /for the caterers/.test(await text(A, '#app')));

  /* 6. room use */
  await go(L, 'bookings-admin.html', '[data-tab="use"]');
  await tap(L, '[data-tab="use"]');
  await L.waitForSelector('[data-useroom="room_hall"]', { timeout: 15000 });
  const cells = await L.$$eval('[data-useroom="room_hall"] td', ts => ts.map(t => t.innerText.trim()));
  ok('6. ROOM USE: the Hall, this month - 2 hours booked: 1 hire, 1 office', cells[1] === '2' && cells[2] === '1' && cells[4] === '1', J(cells));
  const lounge = await L.$$eval('[data-useroom="room_lounge"] td', ts => ts.map(t => t.innerText.trim()));
  ok('   the Lounge: the member\'s hour', lounge[1] === '1' && lounge[3] === '1', J(lounge));

  /* 7. rooms side by side */
  const Hc = await pageOf(Hb, 'hirer-compare');
  await go(Hc, 'hire.html', '#cmpOpen');
  await tap(Hc, '#cmpOpen');
  await Hc.waitForSelector('#cmpTable');
  const heads = await Hc.$$eval('#cmpTable [data-croom]', hs => hs.map(h => h.innerText));
  ok('7. HIRE OUR ROOMS: "Compare" shows two rooms side by side to start', heads.length === 2, J(heads));
  await val(Hc, '[data-cmppick="2"]', 'room_lounge');
  const heads3 = await Hc.$$eval('#cmpTable [data-croom]', hs => hs.map(h => h.getAttribute('data-croom')));
  ok('   a third can be added', heads3.length === 3 && heads3[2] === 'room_lounge', J(heads3));
  const fire = await Hc.$eval('#cmpTable [data-crow="lay-theatre"]', r => r.innerText.replace(/\s+/g, ' '));
  ok('   never more than the fire-safety maximum (the band room sets out 25, holds 20)', /\b20\b/.test(fire) && !/\b25\b/.test(fire), fire);
  await go(S, 'rooms.html', '#c-cmp');
  await tap(S, '#c-cmp');
  await S.waitForSelector('#sheet #cmpTable');
  ok('   BOOK A ROOM (members): the same, in a sheet', (await S.$$eval('#cmpTable [data-croom]', hs => hs.length)) === 2 && await S.$eval('#back', e => getComputedStyle(e).display !== 'none'));

  /* 8. Places */
  const X = (await as('max')).page;
  await go(X, 'places-admin.html', '[data-agrace="site_t"]');
  await val(X, '[data-agrace="site_t"]', '45');
  ok('8. PLACES: the minutes before a flag are saved', await until(async () => (await get('sites', 'site_t')).arrivalGraceMins === 45));
  await val(X, '[data-openfrom="site_t"]', '09:00');
  await val(X, '[data-opento="site_t"]', '17:30');
  ok('   and the opening hours, in minutes', await until(async () => { const s = await get('sites', 'site_t'); return s.openFrom === 540 && s.openTo === 1050; }));
  await val(X, '[data-opento="site_t"]', '08:00');
  await sleep(1500);
  const s3 = await get('sites', 'site_t');
  ok('   closing before opening is refused', s3.openFrom === 540 && s3.openTo === 1050, J({ from: s3.openFrom, to: s3.openTo }));
  await val(X, '[data-agrace="site_t"]', '0');
  await until(async () => (await get('sites', 'site_t')).arrivalGraceMins === 0);
  await go(L, 'bookings-admin.html', '[data-tab="today"]');
  await tap(L, '[data-tab="today"]'); await L.waitForSelector('#arrivals');
  ok('   0 turns the flag off: nobody is shown late', !(await L.$('[data-arr="late"]')) && /Flagging is off/.test(await text(L, '#arrivals')));

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
