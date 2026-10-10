/* The app's "What's on" (Me and my family; F-122, F-136): the events a
   person can come to, quick filters, an event's own view, "Book a room",
   and the Home helper myEvents() (A-050 A4). Drawn through the stand-in
   shell (screenshots/events/app-harness.html, built to A-050).
   Events window. Invented people and events only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/app-whatson.test.mjs"

   What it proves:
     1. an Attender sees what they can come to, never a members-only item;
        a Church member does see it, marked
     2. the quick filters
     3. an event: "You + 1 booked" (opens their booking), Add to my calendar
     4. Book a room: each room as it is today; a room closed today is not
        there at all
     5. myEvents() gives Home the person's own bookings, and nobody else's
     6. the words for a room's day (freeWords) */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-wo-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const iso = (d) => ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const TODAY = ymd(new Date());

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
  ann:  { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann' },
  cath: { email: 'cath.member@example.invalid', name: 'Cath Member', mid: 'm_cath', churchMember: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
/* Tomorrow (this month, unless today is the last day) and in six weeks. */
const soon = new Date(); soon.setDate(soon.getDate() + 1); soon.setHours(18, 0, 0, 0);
const later = new Date(); later.setDate(later.getDate() + 42); later.setHours(16, 0, 0, 0);
const EV = (title, category, when, visibility, audience, extra) => ({ title, description: 'Invented, for a test.\nBring a dish.', category, labels: [], visibility, status: 'confirmed', audience, teams: [],
  featured: false, startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 2 * 3600e3)), endUtc: when.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
const ROOM = (name, extra) => ({ siteId: 'site_t', name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
  bookableByMembers: true, bookableByHirers: false, description: '', photoUrl: '', ...(extra || {}) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: [], adminFor: [], masterAdmin: false, churchMember: !!x.churchMember });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: [], adminFor: [], masterAdmin: false,
      attender: true, churchMember: !!x.churchMember, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'calEvents', 'ev_soc'), EV('Test Harvest Supper', 'social', soon, 'public', ['public', 'members'], { signupOn: true }));
  await setDoc(doc(db, 'capacity', 'ev_soc'), { total: 40, taken: 2 });
  await setDoc(doc(db, 'calEvents', 'ev_kids'), EV('Test Light Party', 'kids', later, 'public', ['public', 'members'], { signupOn: true }));
  await setDoc(doc(db, 'capacity', 'ev_kids'), { total: 30, taken: 0 });
  await setDoc(doc(db, 'calEvents', 'ev_cm'), EV('Test Members\u2019 Meeting', 'other', soon, 'churchMembers', ['churchMembers']));
  await setDoc(doc(db, 'signups', 'su_ann_soc_000000000000000000000'), { calEventId: 'ev_soc', personKind: 'addressBook', personId: 'm_ann', name: 'Ann Attender', email: P.ann.email,
    phone: '', attendees: [{ name: 'Ann Attender' }, { name: 'Guest (invented)' }], answers: {}, places: 2, ticketTypeId: '', status: 'confirmed', donation: 0, notes: '',
    memberUid: P.ann.uid, createdAt: 'x' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_band'), ROOM('Test Band Room', { order: 1 }));
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 2 }));
  await setDoc(doc(db, 'rooms', 'room_vestry'), ROOM('Test Vestry', { order: 3 }));
  await setDoc(doc(db, 'roomDays', 'room_band_' + TODAY), { slots: Array(96).fill(1), lastBooking: '', roomId: 'room_band', day: TODAY, siteId: 'site_t' });
  await setDoc(doc(db, 'roomClosures', 'cl_t'), { siteId: 'site_t', roomId: 'room_hall', roomName: 'Test Hall', from: TODAY, to: TODAY, days: [TODAY], reason: 'Repainting (invented)', status: 'on', by: 'x', byName: 'x', at: new Date() });
  await setDoc(doc(db, 'roomClosedDays', 'room_hall_' + TODAY), { closureId: 'cl_t', roomId: 'room_hall', siteId: 'site_t', day: TODAY, on: true });
});

const errors = [], browsers = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b); return b;
}
async function as(who) {
  const b = await launch(who), p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 390, height: 844 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const app = 'screenshots/events/app-harness.html?space=me&tab=whatson';

try {
  /* 1. what Ann can come to */
  const A = await as('ann');
  await go(A, app, '.hello');
  await until(() => A.$('[data-w="events"]'));
  const at = await text(A, '[data-w="events"]');
  ok('1. an Attender sees what they can come to: her supper marked Booked, the party to sign up to', /Test Harvest Supper .*Booked/.test(at) && /Test Light Party .*Sign up/.test(at), at);
  ok('   NEVER THE CHURCH MEMBERS\u2019 MEETING', !/Members\u2019 Meeting/.test(await text(A, '#egbc-content')));
  const C = await as('cath');
  await go(C, app, '.hello');
  await until(() => C.$('[data-w="events"]'));
  const ct = await text(C, '[data-w="events"]');
  ok('   a Church member sees it, marked "Members" and "Church members only"', /Test Members\u2019 Meeting .*Church members only.*Members/.test(ct), ct);

  /* 2. the quick filters */
  await tap(A, '[data-wact="filter:kids"]');
  await until(async () => !/Harvest/.test(await text(A, '#egbc-content')));
  const fam = await text(A, '#egbc-content');
  ok('2. "For families" shows the party only', /Test Light Party/.test(fam) && !/Harvest/.test(fam) && /For families/.test(await text(A, '[data-w="chips"]')), fam.slice(0, 300));
  await tap(A, '[data-wact="filter:kids"]');
  await until(async () => /Harvest/.test(await text(A, '#egbc-content')));
  await tap(A, '[data-wact="filter:month"]');
  await until(async () => !/Light Party/.test(await text(A, '#egbc-content')));
  const sameMonth = ymd(soon).slice(0, 7) === TODAY.slice(0, 7);
  const mo = await text(A, '#egbc-content');
  ok('   "This month" shows this month\'s', sameMonth ? (/Harvest/.test(mo) && !/Light Party/.test(mo)) : !/Light Party/.test(mo), mo.slice(0, 300));
  await tap(A, '[data-wact="filter:month"]');
  await A.screenshot({ path: path.join(HERE, 'app-whatson-375.png'), fullPage: true });

  /* 3. an event */
  await until(() => A.$('[data-wact="event:ev_soc"]'));
  await tap(A, '[data-wact="event:ev_soc"]');
  await until(() => A.$('[data-w="acts"]'));
  const evt = await text(A, '#egbc-content');
  const manage = await A.$eval('[data-w="acts"] [data-wact^="open:"]', e => e.getAttribute('data-wact'));
  ok('3. the supper: "You + 1 booked", to change numbers or cancel', /Test Harvest Supper/.test(evt) && /You \+ 1 booked Change numbers or cancel/.test(evt) && /Bring a dish/.test(evt), evt.slice(0, 400));
  ok('   which opens her own booking', /^open:http:\/\/localhost:5601\/my-signup\.html\?key=su_ann_soc_0+$/.test(manage), manage);
  await A.evaluate(() => { window.__ics = null; EGBCICS.download = function (name, text) { window.__ics = { name: name, text: text }; }; });
  await tap(A, '[data-wact="ics"]');
  const ics = await until(() => A.evaluate(() => window.__ics));
  ok('   "Add to my calendar" gives a calendar file for it', ics && /BEGIN:VEVENT/.test(ics.text) && /Test Harvest Supper/.test(ics.text) && /egbc-event-ev_soc/.test(ics.text), J(ics && ics.name));
  await A.screenshot({ path: path.join(HERE, 'app-whatson-event-375.png'), fullPage: true });
  await tap(A, '[data-wact="list"]');
  await until(() => A.$('[data-w="events"]'));

  /* 4. Book a room */
  await A.evaluate(() => { EGBCAppWhatson.clock = () => 14 * 60; });
  await tap(A, '[data-wact="rooms"]');
  await until(() => A.$('[data-w="rooms"]'));
  const rt = await text(A, '[data-w="rooms"]');
  ok('4. Book a room: each room as it is today (at 2pm)', /Test Band Room .*Booked for the rest of the day.*Busy/.test(rt) && /Test Vestry Free for the rest of the day Free/.test(rt), rt);
  ok('   A ROOM CLOSED TODAY IS NOT THERE AT ALL', !/Test Hall/.test(rt), rt);
  await A.screenshot({ path: path.join(HERE, 'app-book-room-375.png'), fullPage: true });

  /* 5. myEvents() for Home */
  const mine = await A.evaluate(() => EGBCEventsHome.myEvents());
  ok('5. myEvents(): Ann\'s supper, for 2, with the link to change it', mine.length === 1 && mine[0].id === 'ev_soc' && mine[0].places === 2 && mine[0].waiting === false && /my-signup\.html\?key=su_ann_soc/.test(mine[0].manageUrl), J(mine));
  const cm = await C.evaluate(() => EGBCEventsHome.myEvents());
  ok('   and nothing of hers for anyone else', J(cm) === '[]', J(cm));

  /* 6. the words for a room's day */
  const words = await A.evaluate(() => {
    const B = EGBCBookings, z = B.zeros(), ev = z.slice(); for (let i = 72; i < 80; i++) ev[i] = 1;
    return [B.freeWords(z, 14 * 60).words, B.freeWords(z, 19 * 60).words, B.freeWords(ev, 14 * 60).words, B.freeWords(ev, 18 * 60 + 30).words, B.freeWords(z, 23 * 60 + 30).words];
  });
  ok('6. "Free for the rest of the day", "Free all evening", "Free until 6pm", "Booked until 8pm, then free"', J(words) === J(['Free for the rest of the day', 'Free all evening', 'Free until 6pm', 'Booked until 8pm, then free', 'Nothing more today']), J(words));

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
