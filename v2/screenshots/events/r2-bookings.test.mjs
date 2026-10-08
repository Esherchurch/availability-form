/* Chunk 4, R2 — room bookings: members, the public, the office.
   Events window. Invented rooms and people only, events emulators only,
   network guard, no email leaves the machine (egbc-email's outbox).

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/r2-bookings.test.mjs"

   What it proves:
     1. an admin puts Sunday worship on the Places page; the rooms it uses
        carry it as a weekly pattern the rules read
     2. a member sees a room free and books a band practice straight away;
        its setup time is held too; they are emailed with a calendar file
     3. the page will not offer a time over a booking's setup, or over the
        Sunday service - and writing round the page is refused by the rules
     4. THE DELIBERATE BREAK: the room is switched to "wait for the office
        to approve"; the member's booking is held, not confirmed, takes no
        time, and they are told it is waiting; the office approves it and
        they are emailed again, with the calendar file
     5. a site whose default is "wait for approval" holds a booking for a
        room that follows the site
     6. the public find a free room by date and time, ask for it, and are
        told it waits; the office declines it with a reason, which goes in
        the email; the public can never confirm their own
     7. the office moves a booking onto the service only with a reason, and
        cancelling gives the time back without freeing the service
     8. the closed set: from hire.html, signed out, every link on every
        page reached stays within hire.html, room.html and book.html */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-r2-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

/* Dates: a Wednesday at least a fortnight away, and the Sunday after. */
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const base = new Date(); base.setHours(12, 0, 0, 0); base.setDate(base.getDate() + 14);
while (base.getDay() !== 3) base.setDate(base.getDate() + 1);
const WED = ymd(base); const sun = new Date(base); sun.setDate(sun.getDate() + 4); const SUN = ymd(sun);

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
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.admin ? ['Core Team'] : ['Worship'], adminFor: [], masterAdmin: !!x.admin });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.admin ? ['Core Team'] : ['Worship'],
      adminFor: [], masterAdmin: !!x.admin, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_band'), ROOM('Test Band Room', { order: 1, fireMax: 20, layouts: { theatre: 20 } }));
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 2, bookableByHirers: true, fireMax: 120, layouts: { theatre: 100, cabaret: 48 } }));
  await setDoc(doc(db, 'rooms', 'room_vestry'), ROOM('Test Vestry', { order: 3, capacity: 8 }));
  await setDoc(doc(db, 'menus', 'menu_tea'), { name: 'Tea and coffee', description: '', unit: 'head', price: 1.5, minimum: 0, noticeDays: 2, active: true, order: 1 });
  await setDoc(doc(db, 'bookableResources', 'kit_pa'), { name: 'Test PA', quantity: 1, unlimited: false, homeRoomId: 'room_hall', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_lena'], safeguardingLead: '', safeguardingDeputy: '' });
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
const text = (p) => p.$eval('body', e => e.innerText);
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); };
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const ics = (m) => { const a = (m && m.attachments || []).find(x => x.filename === 'booking.ics'); return a ? Buffer.from(a.content, 'base64').toString('utf8') : ''; };
/* Click the free quarter-hour on a room's row, then wait for the sheet. */
async function pick(p, room, day, slot) {
  await p.waitForSelector(`.bk-row[data-room="${room}"][data-day="${day}"] [data-slot="${slot}"]`, { timeout: 15000 });
  await tap(p, `.bk-row[data-room="${room}"][data-day="${day}"] [data-slot="${slot}"]`);
  await p.waitForSelector('#bf-title');
}
/* The booking went in, or the page said it could not. */
const settled = (p) => until(() => p.evaluate(() => !!document.querySelector('[data-made]') || document.getElementById('toast').style.display === 'block'), 15000);
const goReady = (p, label) => until(() => p.$eval('#f-go', (e, l) => !e.disabled && (!l || e.textContent === l), label), 10000);

try {
  /* ---------- 1. Sunday worship on the Places page ---------- */
  const kB = await as('karen'); const K = kB.page;
  await go(K, 'places-admin.html', '.tab[data-tab="bookings"]');
  await tap(K, '.tab[data-tab="bookings"]');
  await K.waitForSelector('[data-rbadd="site_t"]');
  await tap(K, '[data-rbadd="site_t"]');
  await K.waitForSelector('[data-rb="site_t"][data-i="0"][data-f="type"]');
  await val(K, '[data-rb="site_t"][data-i="0"][data-f="type"]', 'Sunday morning worship');
  await check(K, '[data-rbroom="site_t"][data-i="0"][data-r="room_hall"]', true);
  await check(K, '[data-rbroom="site_t"][data-i="0"][data-r="room_band"]', true);
  await tap(K, '[data-rbsave="site_t"]');
  const hallWeek = await until(async () => { const r = await get('rooms', 'room_hall'); return r.rotaWeek && r.rotaWeek['7'].indexOf(1) >= 0 ? r.rotaWeek : null; });
  ok('1. the service is saved on the site', ((await get('sites', 'site_t')).rotaBusy || [])[0]?.type === 'Sunday morning worship');
  ok('   and the hall is taken 09:30-12:30 every Sunday (quarter-hours 38 to 49), no other day',
    hallWeek && range(hallWeek['7'], 38, 50).every(x => x === 1) && hallWeek['7'][37] === 0 && hallWeek['7'][50] === 0 && hallWeek['3'].every(x => x === 0));
  ok('   the band room too; the vestry, not in the service, is not', (await get('rooms', 'room_band')).rotaWeek['7'][40] === 1 && (await get('rooms', 'room_vestry')).rotaWeek['7'].every(x => x === 0));
  await K.setViewport({ width: 375, height: 800 });
  await K.screenshot({ path: path.join(HERE, 'r2-places-bookings-375.png'), fullPage: true });
  await K.setViewport({ width: 1100, height: 900 });

  /* ---------- 2. Samy books a band practice ---------- */
  const sB = await as('samy'); const S = sB.page;
  await go(S, 'rooms.html', '#c-date');
  await val(S, '#c-date', WED);
  await pick(S, 'room_band', WED, 72);
  ok('2. clicking a free 18:00 opens the form with the room, day and time filled in',
    await S.evaluate(() => { const v = EGBCBookForm.values(document.getElementById('f')); return v.rooms.join() === 'room_band' && v.start === '18:00' && v.end === '19:00'; }),
    JSON.stringify(await S.evaluate(() => EGBCBookForm.values(document.getElementById('f')))));
  await S.select('#bf-setup', '15');
  await val(S, '#bf-title', 'Test band practice');
  await val(S, '#bf-people', '6');
  await val(S, '.bf-kit[data-id="kit_pa"]', '1');
  ok('   the page says it will be confirmed straight away', await goReady(S, 'Book it') && /confirmed straight away/.test(await S.$eval('#f-status', e => e.innerText)));
  await S.evaluate(() => EGBCEmail.clearOutbox());
  await tap(S, '#f-go');
  await settled(S);
  const b1 = (await bookings(['memberUid', P.samy.uid]))[0];
  ok('   the booking is confirmed', b1 && b1.status === 'confirmed' && b1.kind === 'member', JSON.stringify(b1));
  const wedBand = (await get('roomDays', 'room_band_' + WED)).slots;
  ok('   and holds 17:45 to 19:00 - the practice and its 15 minutes to set up', b1.slotFrom === 71 && b1.slotTo === 76 && range(wedBand, 71, 76).every(x => x === 1) && wedBand[70] === 0 && wedBand[76] === 0);
  const m1 = (await outbox(S)).find(m => /Your room is booked/.test(m.subject));
  ok('   Samy is emailed, with the calendar file', m1 && m1.to[0] === P.samy.email && /BEGIN:VEVENT/.test(ics(m1)) && /SUMMARY:Test band practice/.test(ics(m1)), JSON.stringify(m1 && m1.subject));
  ok('   the reply address is the church\'s, from Church details', m1 && m1.replyTo === 'office@example.invalid');
  await S.setViewport({ width: 375, height: 800 });
  await S.screenshot({ path: path.join(HERE, 'r2-rooms-booked-375.png'), fullPage: true });
  await S.setViewport({ width: 1100, height: 900 });
  await tap(S, '#f-done');

  /* ---------- 3. what the page will not offer, and the rules behind it ---------- */
  await pick(S, 'room_band', WED, 77);
  await S.select('#bf-start', '19:00'); await S.select('#bf-end', '20:00'); await S.select('#bf-setup', '15');
  await val(S, '#bf-title', 'Test second practice'); await val(S, '#bf-people', '4');
  await until(() => S.$eval('#f-status', e => /not free/.test(e.innerText)));
  ok('3. 19:00 with 15 minutes to set up runs into the practice: not offered', /Test Band Room<\/b> is not free/.test(await S.$eval('#f-status', e => e.innerHTML)) && await S.$eval('#f-go', e => e.disabled));
  await S.select('#bf-setup', '0');
  ok('   19:00 with no setup, straight after it, is fine', !!(await goReady(S)));
  await val(S, '#bf-day', SUN); await S.select('#bf-start', '10:00'); await S.select('#bf-end', '11:00');
  await until(() => S.$eval('#f-status', e => /not free/.test(e.innerText)));
  ok('   Sunday 10:00 is not offered, and the page says why', /Sunday morning worship/.test(await S.$eval('#f-status', e => e.innerText)) && await S.$eval('#f-go', e => e.disabled));
  const sneak = await S.evaluate((day) => {
    const B = EGBCBookings, r = { id: 'room_band', siteId: 'site_t' };
    const b = B.prepare({ kind: 'member', room: r, site: {}, day, start: '10:00', end: '11:00', title: 'Round the page', people: 3 });
    return B.write([{ booking: b }], { room_band: B.zeros() }).then(() => 'written', e => e.code || e.message);
  }, SUN);
  ok('   writing it round the page, pretending the day is empty, is refused by the rules', /permission/i.test(sneak), sneak);
  await tap(S, '#f-cancel');

  /* ---------- 4. THE DELIBERATE BREAK: the room now waits for approval ---------- */
  await go(K, 'places-admin.html', '.tab[data-tab="rooms"]');
  await tap(K, '.tab[data-tab="rooms"]');
  await K.waitForSelector('[data-prof="room_band"]');
  await tap(K, '[data-prof="room_band"]');
  await K.waitForSelector('#p-mb-approval');
  await tap(K, '#p-mb-approval');
  await tap(K, '#p-save');
  await until(async () => (await get('rooms', 'room_band')).memberBookings === 'approval');
  ok('4. the admin switches the band room to "wait for the office to approve"', (await get('rooms', 'room_band')).memberBookings === 'approval');
  await go(S, 'rooms.html', '#c-date');
  await val(S, '#c-date', WED);
  await pick(S, 'room_band', WED, 80);
  await val(S, '#bf-title', 'Test late practice'); await val(S, '#bf-people', '5');
  ok('   the page now says it waits, and the button asks', await goReady(S, 'Ask for it') && /wait for the office/.test(await S.$eval('#f-status', e => e.innerText)));
  await S.evaluate(() => EGBCEmail.clearOutbox());
  await tap(S, '#f-go');
  await settled(S);
  const b2 = (await bookings(['memberUid', P.samy.uid])).find(b => b.title === 'Test late practice');
  ok('   Samy\'s booking is HELD, not confirmed', b2 && b2.status === 'requested', JSON.stringify(b2 && b2.status));
  ok('   and takes no time until it is approved', range((await get('roomDays', 'room_band_' + WED)).slots, 80, 84).every(x => x === 0));
  const box4 = await outbox(S);
  ok('   Samy is emailed that it is waiting, with no calendar file', box4.some(m => /waiting for approval/.test(m.subject) && m.to[0] === P.samy.email && !ics(m)));
  ok('   and the office is told', box4.some(m => /Booking request/.test(m.subject) && m.to[0] === 'office@example.invalid'));
  await go(S, 'rooms.html', '#mine .bk');
  ok('   Your bookings shows it waiting', /Test late practice[\s\S]*Waiting for approval/.test(await S.$eval('#mine', e => e.innerText)));
  const forced = await S.evaluate((day) => {
    const B = EGBCBookings, r = { id: 'room_band', siteId: 'site_t', memberBookings: 'instant' };
    const b = B.prepare({ kind: 'member', room: r, site: {}, day, start: '21:30', end: '22:00', title: 'Pretend instant', people: 2 });
    return EGBCAuth.db.collection('roomDays').doc('room_band_' + day).get().then(s => B.write([{ booking: b }], { room_band: s.data().slots })).then(() => b.status + ' written', e => e.code || e.message);
  }, WED);
  ok('   telling the page the room is instant does not help: the rules refuse a confirmed booking', /permission/i.test(forced), forced);

  /* The office approves it. */
  const lB = await as('lena'); const L = lB.page;
  await go(L, 'bookings-admin.html', `[data-key="${b2.key}"]`);
  await until(() => L.$eval(`[data-free="${b2.key}"]`, e => /still free/.test(e.textContent)));
  ok('   Lena, the site\'s bookings admin, sees it waiting, and that the time is still free', true);
  await L.setViewport({ width: 375, height: 800 });
  await L.screenshot({ path: path.join(HERE, 'r2-bookings-admin-375.png'), fullPage: true });
  await L.setViewport({ width: 1100, height: 900 });
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-key="${b2.key}"] [data-do="approve"]`);
  await until(async () => (await get('bookings', b2.key)).status === 'confirmed');
  ok('   she approves it: confirmed, and now it takes its time', (await get('bookings', b2.key)).decidedByName === P.lena.name && range((await get('roomDays', 'room_band_' + WED)).slots, 80, 84).every(x => x === 1));
  const m4 = await until(async () => (await outbox(L)).find(m => /Your booking is confirmed/.test(m.subject)));
  ok('   and Samy is emailed again, with the calendar file', m4 && m4.to[0] === P.samy.email && /SUMMARY:Test late practice/.test(ics(m4)));

  /* ---------- 5. a site whose default is "wait" ---------- */
  await go(K, 'places-admin.html', '.tab[data-tab="bookings"]');
  await tap(K, '.tab[data-tab="bookings"]');
  await K.waitForSelector('[data-mbsite="site_t"][value="approval"]');
  await tap(K, '[data-mbsite="site_t"][value="approval"]');
  await until(async () => (await get('sites', 'site_t')).memberBookings === 'approval');
  await go(S, 'rooms.html', '#c-date');
  await val(S, '#c-date', WED);
  await pick(S, 'room_vestry', WED, 40);
  await val(S, '#bf-title', 'Test prayer meeting'); await val(S, '#bf-people', '4');
  await goReady(S, 'Ask for it');
  await tap(S, '#f-go');
  await settled(S);
  const b5 = (await bookings(['memberUid', P.samy.uid])).find(b => b.title === 'Test prayer meeting');
  ok('5. the site says "wait": the vestry, which follows the site, holds the booking', b5 && b5.status === 'requested');
  await tap(K, '[data-mbsite="site_t"][value="instant"]');
  await until(async () => (await get('sites', 'site_t')).memberBookings === 'instant');

  /* ---------- 6. the public ---------- */
  const gB = await launch('guest'); const G = await pageOf(gB, 'guest', 390);
  await go(G, 'hire.html', '#q-day');
  await val(G, '#q-day', SUN); await G.select('#q-from', '10:00'); await G.select('#q-to', '11:00');
  await until(() => G.$eval('#results', e => /booked then/.test(e.innerText)));
  ok('6. hire.html, Sunday 10:00-11:00: the hall is not shown, because it is booked then', /Test Hall: .*booked then/.test(await G.$eval('#results', e => e.innerText)));
  await G.select('#q-from', '14:00'); await G.select('#q-to', '16:00');
  await until(() => G.$eval('[data-room="room_hall"]', e => /^book.html/.test(e.getAttribute('href'))));
  const href = await G.$eval('[data-room="room_hall"]', e => e.getAttribute('href'));
  ok('   14:00-16:00 it is free, and leads straight to asking for that time', href === `book.html?room=room_hall&day=${SUN}&start=14:00&end=16:00`, href);
  await G.screenshot({ path: path.join(HERE, 'r2-hire-free-375.png'), fullPage: true });
  await tap(G, '[data-room="room_hall"]');
  await G.waitForSelector('#bf-name');
  ok('   the form has the room, day and times filled in', await G.evaluate(() => { const v = EGBCBookForm.values(document.getElementById('f')); return v.rooms[0] === 'room_hall' && v.start === '14:00' && v.end === '16:00'; }));
  ok('   and no kit, which is for members', !(await G.$('.bf-kit')));
  await val(G, '#bf-title', 'Test birthday party'); await val(G, '#bf-people', '30');
  await check(G, '#bf-ref', true); await val(G, '.bf-menu[data-id="menu_tea"]', '30'); await G.select('#bf-serve', '15:00');
  await val(G, '#bf-diet-vegetarian', '4');
  await val(G, '#bf-name', 'Hirer Synthetic'); await val(G, '#bf-email', 'hirer@example.invalid'); await val(G, '#bf-org', 'Invented Club');
  await goReady(G);
  await G.screenshot({ path: path.join(HERE, 'r2-book-375.png'), fullPage: true });
  await sleep(4200);
  await tap(G, '#f-go');
  await G.waitForSelector('#ref');
  const hire = (await bookings(['kind', 'hire']))[0];
  ok('   the request is saved, waiting', hire && hire.status === 'requested' && hire.requester.email === 'hirer@example.invalid' && hire.refreshments.items[0].qty === 30 && hire.refreshments.dietary.vegetarian === 4);
  ok('   with the reference shown', (await G.$eval('#ref', e => e.textContent)) === hire.key.slice(3, 11).toUpperCase());
  ok('   the hirer is told it is waiting', (await outbox(G)).some(m => /waiting for approval/.test(m.subject) && m.to[0] === 'hirer@example.invalid'));
  await G.screenshot({ path: path.join(HERE, 'r2-book-thanks-375.png'), fullPage: true });
  const pubSneak = await G.evaluate((day) => {
    const B = EGBCBookings, r = { id: 'room_hall', siteId: 'site_t' };
    const b = B.prepare({ kind: 'hire', room: r, site: {}, day, start: '17:00', end: '18:00', title: 'x', people: 3, requester: { name: 'X', email: 'x@example.invalid', phone: '', org: '' } });
    b.status = 'confirmed';
    return B.write([{ booking: b }], { room_hall: B.zeros() }).then(() => 'written', e => e.code || e.message);
  }, SUN);
  ok('   the public can never confirm their own booking, even round the page', /permission/i.test(pubSneak), pubSneak);
  /* A robot: the hidden box is filled in. It is thanked, and nothing is saved. */
  await go(G, 'book.html?room=room_hall&day=' + SUN + '&start=17:00&end=18:00', '#bf-name');
  await val(G, '#bf-title', 'Robot'); await val(G, '#bf-people', '3'); await val(G, '#bf-name', 'Robot'); await val(G, '#bf-email', 'robot@example.invalid');
  await G.$eval('#bf-website', e => { e.value = 'http://spam.invalid'; });
  await goReady(G); await sleep(4200); await tap(G, '#f-go');
  await G.waitForSelector('#done');
  ok('   a robot that fills in the hidden box is thanked, and nothing is saved', (await bookings(['kind', 'hire'])).length === 1);

  /* The office declines it, with a reason. */
  await go(L, 'bookings-admin.html', `[data-key="${hire.key}"]`);
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-key="${hire.key}"] [data-do="decline"]`);
  await val(L, `[data-key="${hire.key}"] .a-note`, 'The hall is being painted that week.');
  await tap(L, `[data-key="${hire.key}"] .a-go`);
  await until(async () => (await get('bookings', hire.key)).status === 'declined');
  const m6 = await until(async () => (await outbox(L)).find(m => /could not go ahead/.test(m.subject)));
  ok('   the office declines it; the hirer is told why', m6 && m6.to[0] === 'hirer@example.invalid' && /being painted/.test(m6.html));

  /* ---------- 7. the office books over the service, only with a reason ---------- */
  await go(K, 'bookings-admin.html', '[data-tab="coming"]');
  await tap(K, '[data-tab="coming"]');
  await K.waitForSelector(`[data-key="${b1.key}"] [data-do="move"]`);
  await tap(K, `[data-key="${b1.key}"] [data-do="move"]`);
  await val(K, `[data-key="${b1.key}"] .m-day`, SUN);
  await K.select(`[data-key="${b1.key}"] .m-start`, '10:00'); await K.select(`[data-key="${b1.key}"] .m-end`, '11:00');
  await tap(K, `[data-key="${b1.key}"] .m-go`);
  await K.waitForSelector(`[data-key="${b1.key}"] .o-go`);
  ok('7. moving the practice onto Sunday worship is stopped: it asks for a reason', (await get('bookings', b1.key)).day === WED);
  await K.evaluate(() => EGBCEmail.clearOutbox());
  await val(K, `[data-key="${b1.key}"] .o-note`, 'Test: the band plays in the service');
  await tap(K, `[data-key="${b1.key}"] .o-go`);
  await until(async () => (await get('bookings', b1.key)).day === SUN);
  const moved = await get('bookings', b1.key), sunBand = (await get('roomDays', 'room_band_' + SUN)).slots;
  ok('   with a reason, it moves; the booking says it was booked over something', moved.override === true && /plays in the service/.test(moved.decisionNote));
  ok('   Sunday now counts both (2), and Wednesday\'s practice time is given back', sunBand[40] === 2 && range((await get('roomDays', 'room_band_' + WED)).slots, 71, 76).every(x => x === 0));
  ok('   Samy is emailed that it has moved', (await outbox(K)).some(m => /has moved/.test(m.subject) && m.to[0] === P.samy.email && ics(m)));
  await go(K, 'bookings-admin.html', '[data-tab="coming"]');
  await tap(K, '[data-tab="coming"]');
  await K.waitForSelector(`[data-key="${b1.key}"] [data-do="cancel"]`);
  await tap(K, `[data-key="${b1.key}"] [data-do="cancel"]`);
  await val(K, `[data-key="${b1.key}"] .a-note`, 'Test: not needed after all');
  await tap(K, `[data-key="${b1.key}"] .a-go`);
  await until(async () => (await get('bookings', b1.key)).status === 'cancelled');
  ok('   cancelling it gives its time back, but the service still holds Sunday', (await get('roomDays', 'room_band_' + SUN)).slots[40] === 1);
  ok('   a member cannot open the office page for a site they do not look after', await (async () => {
    await go(S, 'bookings-admin.html', '#main .card'); return /for the people who look after room bookings/.test(await text(S)); })());

  /* The room's week, as the public see it. */
  await go(G, 'room.html?id=room_hall', '#week .bk-bar');
  ok('   room.html shows the week, with Sunday\'s service', await G.$$eval('#week .bk-c.s', l => l.length) > 0);
  await G.screenshot({ path: path.join(HERE, 'r2-room-week-375.png'), fullPage: true });

  /* ---------- 8. the closed set ---------- */
  const SET = new Set(['/hire.html', '/room.html', '/book.html']);
  const seen = new Set(), queue = [URLB + 'hire.html'], outside = [];
  let visited = 0;
  while (queue.length && visited < 40) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u); visited++;
    await G.goto(u, { waitUntil: 'networkidle2' });
    /* Wait until the page has drawn: its header, and nothing still loading. */
    await until(() => G.evaluate(() => !!document.querySelector('.ch-in') && !/Loading/.test(document.body.innerText) && (location.pathname !== '/room.html' || !!document.querySelector('#ask, #week .bk-bar'))), 15000);
    const info = await G.evaluate(() => ({
      links: [...document.querySelectorAll('a[href]')].map(a => a.href),
      shell: !!document.querySelector('script[src*="egbc-shell"]'),
      signIn: /sign in|log in/i.test(document.body.innerText)
    }));
    if (/room.html/.test(u) && !info.links.some(h => /book.html/.test(h))) outside.push(u + ' drew no way to ask: ' + (await G.$eval('#wrap', e => e.innerText)).replace(/\s+/g, ' ').slice(0, 200));
    if (info.shell) outside.push(u + ' loads the hub shell');
    if (info.signIn) outside.push(u + ' offers a sign-in');
    for (const h of info.links) {
      if (/^mailto:/i.test(h)) { if (!/^mailto:office@example\.invalid/i.test(h)) outside.push(u + ' -> ' + h); continue; }
      const x = new URL(h);
      if (x.origin !== 'http://localhost:5601' || !SET.has(x.pathname)) { outside.push(u + ' -> ' + h); continue; }
      x.hash = '';
      if (!seen.has(x.href)) queue.push(x.href);
    }
  }
  ok('8. the closed set: ' + visited + ' pages reached from hire.html, signed out; every link stays within hire, room and book',
    outside.length === 0 && visited >= 3 && [...seen].some(u => /book\.html/.test(u)) && [...seen].some(u => /room\.html/.test(u)), outside.join(' | ') || [...seen].join(' '));
  await G.goto(URLB + 'room.html?id=room_hall', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#week [data-slot]');
  await Promise.all([G.waitForNavigation({ waitUntil: 'networkidle2' }), tap(G, '#week [data-slot]')]);
  ok('   clicking a free time on the room\'s week stays in the set too', new URL(G.url()).pathname === '/book.html');

  await kB.close(); await sB.close(); await lB.close(); await gB.close();
} catch (e) {
  ok('the run finished', false, e.stack);
  for (const [l, p] of PAGES) { try { console.log('     [' + l + '] ' + p.url() + ' :: ' + (await p.$eval('body', b => b.innerHTML)).replace(/\s+/g, ' ').slice(0, 1500)); } catch (x) {} }
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
