/* Chunk 4, R3 — repeating bookings, members cancelling their own, the
   emails, the setup sheet; and the way back to the hub (F-062).
   Events window. Invented rooms and people only, events emulators only,
   network guard, no email leaves the machine (egbc-email's outbox).

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/r3-bookings.test.mjs"

   What it proves:
     0. "Back to the hub" is on the public pages only for someone signed in
     1. a site's own address for booking requests, set on the Places page
     2. a member books a band practice every week: the date the office has
        already taken is shown, cannot be ticked and is left out; a date they
        untick (a holiday) is left out too; the rest are confirmed, as one
        series, in one email with every date in one calendar file
     3. the member cancels one date, then "this and the ones after it": the
        time is given back, they are emailed, the office is told; one the
        office booked over has to go to the office
     4. the public ask for a fortnightly booking; the date not free is left
        out; the site's address hears about it, not the church's
     5. the office sees the series as one card with a clash report, approves
        every free date in one go (one email, one calendar file), and
        declines the one that became busy, with the reason in the email
     6. the setup sheet: times with setting up and clearing away, numbers and
        layout, sound and projection, kit and where to fetch it, refreshments
        and the kitchen's list; and it prints only the sheet */

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
/* A booking as it is stored, for the ones put in place before the run. */
const BK = (o) => ({ kind: 'office', status: 'confirmed', siteId: 'site_t', groupId: '', setupMins: 0, packdownMins: 0, layout: '', people: 10, notes: '',
  av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], requester: { name: 'Office', email: '', phone: '', org: '' },
  memberUid: '', memberName: '', createdAt: 'x', startLocal: o.day + 'T' + pad(Math.floor(o.startMin / 60)) + ':' + pad(o.startMin % 60),
  endLocal: o.day + 'T' + pad(Math.floor(o.endMin / 60)) + ':' + pad(o.endMin % 60), slotFrom: o.startMin / 15 - (o.setupMins || 0) / 15, slotTo: o.endMin / 15 + (o.packdownMins || 0) / 15, ...o });
const KEYS = { officeW2: 'bk_office_w2_000000000000000000', officeT4: 'bk_office_t4_000000000000000000', samyOver: 'bk_samy_over_00000000000000000', sheet: 'bk_sheet_w5_0000000000000000000' };
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
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 2, bookableByHirers: true, fireMax: 120, layouts: { theatre: 100 } }));
  await setDoc(doc(db, 'rooms', 'room_vestry'), ROOM('Test Vestry', { order: 3, capacity: 8 }));
  await setDoc(doc(db, 'menus', 'menu_tea'), { name: 'Tea and coffee', description: '', unit: 'head', price: 1.5, minimum: 0, noticeDays: 2, active: true, order: 1 });
  await setDoc(doc(db, 'bookableResources', 'kit_pa'), { name: 'Test PA', quantity: 1, unlimited: false, homeRoomId: 'room_hall', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_lena'], safeguardingLead: '', safeguardingDeputy: '' });
  /* The office already has the band room on the third Wednesday, 18:00-19:00. */
  await setDoc(doc(db, 'bookings', KEYS.officeW2), BK({ roomId: 'room_band', day: W[2], startMin: 1080, endMin: 1140, title: 'Test office meeting' }));
  await setDoc(doc(db, 'roomDays', 'room_band_' + W[2]), { slots: take(72, 76), lastBooking: '', roomId: 'room_band', day: W[2], siteId: 'site_t' });
  /* ...and the hall on the fifth Thursday, 10:00-12:00. */
  await setDoc(doc(db, 'bookings', KEYS.officeT4), BK({ roomId: 'room_hall', day: T[4], startMin: 600, endMin: 720, title: 'Test funeral' }));
  await setDoc(doc(db, 'roomDays', 'room_hall_' + T[4]), { slots: take(40, 48), lastBooking: '', roomId: 'room_hall', day: T[4], siteId: 'site_t' });
  /* Samy's vestry booking that the office booked over (the count is 2). */
  await setDoc(doc(db, 'bookings', KEYS.samyOver), BK({ kind: 'member', roomId: 'room_vestry', day: W[1], startMin: 600, endMin: 660, title: 'Test prayer', memberUid: P.samy.uid, memberName: P.samy.name,
    requester: { name: P.samy.name, email: P.samy.email, phone: '', org: '' } }));
  await setDoc(doc(db, 'roomDays', 'room_vestry_' + W[1]), { slots: take(40, 44, 2), lastBooking: '', roomId: 'room_vestry', day: W[1], siteId: 'site_t' });
  /* For the setup sheet: a full evening in the band room on the sixth Wednesday. */
  await setDoc(doc(db, 'bookings', KEYS.sheet), BK({ kind: 'member', roomId: 'room_band', day: W[5], startMin: 1140, endMin: 1260, setupMins: 30, packdownMins: 15, title: 'Test quiz night',
    people: 12, layout: 'theatre', av: { needed: true, what: 'Two microphones' }, resources: [{ id: 'kit_pa', name: 'Test PA', qty: 1 }],
    refreshments: { needed: true, items: [{ id: 'menu_tea', name: 'Tea and coffee', qty: 12, unit: 'head', price: 1.5 }], servingAt: '20:00', dietary: { vegan: 2 }, notes: '' },
    notes: 'Invented: leave the piano covered', memberUid: P.samy.uid, memberName: P.samy.name, requester: { name: P.samy.name, email: P.samy.email, phone: '07700 900123', org: '' } }));
  await setDoc(doc(db, 'roomDays', 'room_band_' + W[5]), { slots: take(74, 85), lastBooking: '', roomId: 'room_band', day: W[5], siteId: 'site_t' });
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
  /* ---------- 0. the way back to the hub ---------- */
  const gB = await launch('guest'); const G = await pageOf(gB, 'guest', 390);
  const sB = await as('samy'); const S = sB.page;
  for (const u of ['hire.html', 'room.html?id=room_hall', 'book.html?room=room_hall']) {
    await go(G, u, '.ch-in'); await sleep(1500);
    await go(S, u, '.ch-in');
    const signedIn = await until(() => S.$eval('#ch-hub', e => e.getAttribute('href')), 8000);
    /* NEXT-BRIEF §19: the credit, in the footer, at phone width. */
    const pb = await G.evaluate(() => { const e = document.querySelector('#poweredby .egbc-poweredby'), i = e && e.querySelector('img'); return e ? { text: e.innerText.trim(), mark: !!(i && i.complete && i.naturalWidth > 0), links: e.querySelectorAll('a').length } : null; });
    ok('   ' + u.split('?')[0] + ': "Powered by Church HQ" in the footer, with the mark', pb && pb.text === 'Powered by Church HQ' && pb.mark, JSON.stringify(pb));
    /* The emulator's own warning bar sits over the foot of the page, so the footer is captured on its own. */
    await G.evaluate(() => document.querySelectorAll('.firebase-emulator-warning').forEach(e => { e.style.display = 'none'; }));
  await (await G.$('#poweredby')).screenshot({ path: path.join(HERE, 'r3-poweredby-' + u.split('.')[0] + '-375.png') });
    ok('0. ' + u.split('?')[0] + ': signed out, no way into the hub; signed in, "Back to the hub"', !(await G.$('#ch-hub')) && signedIn === 'hub.html', 'guest: ' + !!(await G.$('#ch-hub')) + ', member: ' + signedIn);
  }
  await S.screenshot({ path: path.join(HERE, 'r3-hub-link-member.png') });
  /* F-073: back and forth between the rooms and a room, in one tab, used to
     leave the page on "Loading…" once the old connections piled up. */
  let slow = [];
  for (let i = 0; i < 12; i++) {
    const room = i % 2 === 0, t0 = Date.now();
    await G.goto(URLB + (room ? 'room.html?id=room_hall' : 'hire.html'), { waitUntil: 'domcontentloaded' });
    const drawn = await until(() => G.$(room ? '#ask' : '[data-room]'), 5000);
    if (!drawn) slow.push((room ? 'room' : 'hire') + ' #' + i);
    else if (Date.now() - t0 > 3000) slow.push((room ? 'room' : 'hire') + ' #' + i + ' took ' + (Date.now() - t0) + ' ms');
  }
  ok('   twelve times back and forth in one tab: every page drawn within 3 seconds', slow.length === 0, slow.join(', '));
  await G.goBack(); await until(() => G.$('#ask, [data-room]'), 5000);
  ok('   and the Back button brings a working page', !!(await G.$('#ask, [data-room]')));

  /* ---------- 1. the site's own address ---------- */
  const kB = await as('karen'); const K = kB.page;
  await go(K, 'places-admin.html', '.tab[data-tab="bookings"]');
  await tap(K, '.tab[data-tab="bookings"]');
  await K.waitForSelector('[data-bemail="site_t"]');
  await val(K, '[data-bemail="site_t"]', 'bookings@example.invalid');
  await until(async () => (await get('sites', 'site_t')).bookingsEmail === 'bookings@example.invalid');
  ok('1. the site\'s address for booking requests is saved on the Places page', (await get('sites', 'site_t')).bookingsEmail === 'bookings@example.invalid');
  await check(K, '[data-sheetmail="site_t"]', true);
  ok('   and the switch for the morning setup-sheet email (F-091)', !!(await until(async () => (await get('sites', 'site_t')).setupSheetEmail === true)));

  /* ---------- 2. a weekly practice ---------- */
  await go(S, 'rooms.html', '#c-date');
  await val(S, '#c-date', W[0]);
  await pick(S, 'room_band', W[0], 72);
  await val(S, '#bf-title', 'Test weekly practice'); await val(S, '#bf-people', '5');
  await S.select('#bf-rep', 'week');
  await val(S, '#bf-until', W[4]);
  await S.waitForSelector(`.bf-date[value="${W[4]}"]`);
  await until(() => S.$eval('#bf-count', e => /4 of 5/.test(e.textContent)));
  const clashRow = await S.$eval(`.bf-date[value="${W[2]}"]`, e => ({ off: !e.checked, locked: e.disabled, why: e.parentNode.innerText }));
  ok('2. five Wednesdays; the third, which the office has, cannot be ticked and says why', clashRow.off && clashRow.locked && /Test Band Room is booked/.test(clashRow.why), JSON.stringify(clashRow));
  await tap(S, `.bf-date[value="${W[3]}"]`);
  await until(() => S.$eval('#bf-count', e => /3 of 5/.test(e.textContent)));
  ok('   Samy unticks the fourth (a holiday): 3 of 5 will be booked', /3 of 5/.test(await S.$eval('#bf-count', e => e.textContent)));
  await goReady(S, 'Book it');
  /* The form is a sheet over the page that scrolls on its own: a tall window shows all of it. */
  await S.setViewport({ width: 375, height: 2400 });
  await S.screenshot({ path: path.join(HERE, 'r3-repeating-375.png') });
  await S.setViewport({ width: 1100, height: 900 });
  await S.evaluate(() => EGBCEmail.clearOutbox());
  await tap(S, '#f-go');
  await settled(S);
  const mine = (await bookings(['memberUid', P.samy.uid])).filter(b => b.title === 'Test weekly practice').sort((a, b) => a.day < b.day ? -1 : 1);
  ok('   three bookings, all confirmed, on the first, second and fifth Wednesdays', mine.length === 3 && mine.every(b => b.status === 'confirmed') && mine.map(b => b.day).join() === [W[0], W[1], W[4]].join(), JSON.stringify(mine.map(b => [b.day, b.status])));
  ok('   one series: the same id, dates 1, 2 and 3 of 3, every week', mine.length === 3 && new Set(mine.map(b => b.series.id)).size === 1 && mine.map(b => b.series.n + '/' + b.series.of).join() === '1/3,2/3,3/3' && mine[0].series.rule === 'week');
  const daysTaken = await Promise.all([W[0], W[1], W[4]].map(d => get('roomDays', 'room_band_' + d)));
  ok('   each date holds 18:00-19:00 in the band room', daysTaken.every(d => d && range(d.slots, 72, 76).every(x => x === 1)));
  ok('   the office\'s Wednesday is untouched, and the holiday is not booked', range((await get('roomDays', 'room_band_' + W[2])).slots, 72, 76).every(x => x === 1) && !(await get('roomDays', 'room_band_' + W[3])));
  const m2 = (await outbox(S)).filter(m => m.to[0] === P.samy.email);
  ok('   ONE email lists the three dates, with one calendar file holding all three', m2.length === 1 && /repeating booking is confirmed/.test(m2[0].subject) && (m2[0].html.match(/<li>/g) || []).length === 3 && events(m2[0]) === 3,
    JSON.stringify(m2.map(m => [m.subject, events(m)])));
  await tap(S, '#f-done');

  /* ---------- 3. Samy cancels ---------- */
  await go(S, 'rooms.html', `[data-bk="${mine[1].key}"] [data-cancel="one"]`);
  await S.evaluate(() => EGBCEmail.clearOutbox());
  await tap(S, `[data-bk="${mine[1].key}"] [data-cancel="one"]`);
  await until(async () => (await get('bookings', mine[1].key)).status === 'cancelled');
  const w1 = await get('roomDays', 'room_band_' + W[1]);
  ok('3. Samy cancels the second Wednesday; its time is given back', range(w1.slots, 72, 76).every(x => x === 0) && w1.lastCancel === mine[1].key);
  const box3 = await until(async () => { const b = await outbox(S); return b.length >= 2 ? b : null; });
  ok('   Samy is told, and so is the site\'s bookings address (not the church\'s)', box3 && box3.some(m => /cancelled/.test(m.subject) && m.to[0] === P.samy.email) &&
    box3.some(m => /Booking cancelled/.test(m.subject) && m.to[0] === 'bookings@example.invalid'), JSON.stringify(box3 && box3.map(m => [m.subject, m.to])));
  await go(S, 'rooms.html', `[data-bk="${mine[0].key}"] [data-cancel="later"]`);
  ok('   the first date offers "cancel this and the 1 after it" (the second is already cancelled)', /the 1 after it/.test(await S.$eval(`[data-bk="${mine[0].key}"] [data-cancel="later"]`, e => e.textContent)));
  await S.evaluate(() => EGBCEmail.clearOutbox());
  await tap(S, `[data-bk="${mine[0].key}"] [data-cancel="later"]`);
  await until(async () => (await get('bookings', mine[2].key)).status === 'cancelled' && (await get('bookings', mine[0].key)).status === 'cancelled');
  ok('   "this and the ones after it" cancels the first and the last, and frees both',
    range((await get('roomDays', 'room_band_' + W[0])).slots, 72, 76).every(x => x === 0) && range((await get('roomDays', 'room_band_' + W[4])).slots, 72, 76).every(x => x === 0));
  const m3 = await until(async () => (await outbox(S)).find(m => m.to[0] === P.samy.email));
  ok('   in one email listing both dates', m3 && /Your bookings have been cancelled/.test(m3.subject) && (m3.html.match(/<li>/g) || []).length === 2);
  await go(S, 'rooms.html', `[data-bk="${KEYS.samyOver}"] [data-cancel="one"]`);
  await tap(S, `[data-bk="${KEYS.samyOver}"] [data-cancel="one"]`);
  const t3 = await toastText(S);
  ok('   one the office booked over cannot be cancelled by Samy: the page says to ask the office', /ask the office/.test(t3) && (await get('bookings', KEYS.samyOver)).status === 'confirmed', t3);
  const sneak = await S.evaluate((k) => EGBCAuth.db.collection('bookings').doc(k).update({ status: 'cancelled', cancelledAt: 'x', cancelledBy: EGBCAuth.user().uid }).then(() => 'written', e => e.code || e.message), KEYS.samyOver);
  ok('   and writing round the page is refused: the time would stay held by nobody', /permission/i.test(sneak), sneak);

  /* ---------- 4. the public ask for a fortnightly booking ---------- */
  await go(G, 'book.html?room=room_hall&day=' + T[0] + '&start=10:00&end=12:00', '#bf-name');
  await G.select('#bf-rep', 'fortnight');
  await val(G, '#bf-until', T[6]);
  await G.waitForSelector(`.bf-date[value="${T[6]}"]`);
  ok('4. a fortnightly request: four Thursdays, the one with the funeral cannot be ticked', await G.$eval(`.bf-date[value="${T[4]}"]`, e => e.disabled && !e.checked) && (await G.$$('.bf-date')).length === 4);
  await val(G, '#bf-title', 'Test toddler group'); await val(G, '#bf-people', '25');
  await val(G, '#bf-name', 'Hirer Synthetic'); await val(G, '#bf-email', 'hirer@example.invalid'); await val(G, '#bf-org', 'Invented Tots');
  await goReady(G);
  await G.screenshot({ path: path.join(HERE, 'r3-book-repeating-375.png'), fullPage: true });
  await sleep(4200);
  await tap(G, '#f-go');
  await G.waitForSelector('#ref');
  const hire = (await bookings(['kind', 'hire'])).sort((a, b) => a.day < b.day ? -1 : 1);
  ok('   three requests, waiting, as one series', hire.length === 3 && hire.every(b => b.status === 'requested') && new Set(hire.map(b => b.series.id)).size === 1 && hire.map(b => b.day).join() === [T[0], T[2], T[6]].join(),
    JSON.stringify(hire.map(b => [b.day, b.status])));
  const box4 = await outbox(G);
  ok('   the hirer gets one email listing the three dates', box4.filter(m => m.to[0] === 'hirer@example.invalid').length === 1 && /repeating booking is waiting/.test(box4.find(m => m.to[0] === 'hirer@example.invalid').subject));
  ok('   the site\'s bookings address is told, not the church\'s enquiry email', box4.some(m => /Booking request/.test(m.subject) && m.to[0] === 'bookings@example.invalid') && !box4.some(m => m.to[0] === 'office@example.invalid'));

  /* Meanwhile the office takes the hall on the second date of the series. */
  await readDb(async (db) => {
    await setDoc(doc(db, 'bookings', 'bk_office_t2_000000000000000000'), BK({ roomId: 'room_hall', day: T[2], startMin: 600, endMin: 720, title: 'Test wedding rehearsal' }));
    await setDoc(doc(db, 'roomDays', 'room_hall_' + T[2]), { slots: take(40, 48), lastBooking: '', roomId: 'room_hall', day: T[2], siteId: 'site_t' });
  });

  /* ---------- 5. the office ---------- */
  const lB = await as('lena'); const L = lB.page;
  await go(L, 'bookings-admin.html', `[data-series="${hire[0].series.id}"]`);
  await until(() => L.$eval(`[data-free="${hire[1].key}"]`, e => /now has/.test(e.textContent)));
  const rows = await L.$$eval(`[data-series="${hire[0].series.id}"] .drow`, l => l.map(r => r.innerText.replace(/\s+/g, ' ')));
  ok('5. the series is one card, a row per date; the date that became busy says so', rows.length === 3 && /now has/.test(rows[1]) && /still free/.test(rows[0]) && /still free/.test(rows[2]), rows.join(' | '));
  await L.setViewport({ width: 375, height: 800 });
  await L.screenshot({ path: path.join(HERE, 'r3-series-admin-375.png'), fullPage: true });
  await L.setViewport({ width: 1100, height: 900 });
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-series="${hire[0].series.id}"] [data-sdo="approve"]`);
  await until(async () => (await get('bookings', hire[2].key)).status === 'confirmed');
  const after5 = await Promise.all(hire.map(b => get('bookings', b.key)));
  ok('   "approve every free date": the first and last confirmed, the busy one still waiting', after5.map(b => b.status).join() === 'confirmed,requested,confirmed', after5.map(b => b.status).join());
  const m5 = await until(async () => (await outbox(L)).find(m => /repeating booking is confirmed/.test(m.subject)));
  ok('   one email to the hirer, two dates, a calendar file holding both', m5 && m5.to[0] === 'hirer@example.invalid' && (m5.html.match(/<li>/g) || []).length === 2 && events(m5) === 2);
  await go(L, 'bookings-admin.html', `[data-key="${hire[1].key}"] [data-do="decline"]`);
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-key="${hire[1].key}"] [data-do="decline"]`);
  await val(L, `[data-key="${hire[1].key}"] .a-note`, 'The hall has a wedding rehearsal that morning.');
  await tap(L, `[data-key="${hire[1].key}"] .a-go`);
  await until(async () => (await get('bookings', hire[1].key)).status === 'declined');
  const m5b = await until(async () => (await outbox(L)).find(m => /could not go ahead/.test(m.subject)));
  ok('   the busy date is declined on its own, with the reason in the email', m5b && /wedding rehearsal/.test(m5b.html));

  /* ---------- 6. the setup sheet ---------- */
  await go(L, 'bookings-admin.html', '[data-tab="setup"]');
  await tap(L, '[data-tab="setup"]');
  await L.waitForSelector('#s-day');
  await val(L, '#s-day', W[5]);
  await L.waitForSelector(`[data-sheet="${KEYS.sheet}"]`);
  const sheet = (await L.$eval(`[data-sheet="${KEYS.sheet}"]`, e => e.innerText)).replace(/\s+/g, ' ');
  ok('6. the setup sheet: set up from 18:30, 19:00-21:00, cleared by 21:15', /Set up from 18:30/.test(sheet) && /19:00–21:00 Test quiz night/.test(sheet) && /cleared by 21:15/.test(sheet), sheet);
  ok('   12 people, theatre; two microphones; the PA, fetched from the hall', /12 people, set out theatre/.test(sheet) && /Two microphones/.test(sheet) && /1 × Test PA \(from Test Hall\)/.test(sheet), sheet);
  ok('   refreshments at 20:00 with the diets, the notes, and who to call', /Refreshments at 20:00: 12 × Tea and coffee \(2 vegan\)/.test(sheet) && /piano covered/.test(sheet) && /07700 900123/.test(sheet), sheet);
  ok('   and the kitchen\'s list for the day', /20:00, Test Band Room: 12 × Tea and coffee; 2 vegan/.test(await L.$eval(`[data-kitchen="${W[5]}"]`, e => e.innerText)));
  await tap(L, '#s-7');
  await L.waitForSelector(`[data-sheetday="${plus(41)}"]`);
  ok('   "A week" shows seven days', (await L.$$('[data-sheetday]')).length === 7);
  await tap(L, '#s-1');
  await L.waitForSelector(`[data-sheet="${KEYS.sheet}"]`);
  await L.emulateMediaType('print');
  const printed = await L.evaluate(() => ({ sheet: getComputedStyle(document.getElementById('print')).visibility, tabs: getComputedStyle(document.querySelector('.tabs')).visibility }));
  ok('   printing shows the sheet and hides the page around it', printed.sheet === 'visible' && printed.tabs === 'hidden', JSON.stringify(printed));
  await L.screenshot({ path: path.join(HERE, 'r3-setup-sheet-print.png'), fullPage: true });
  await L.emulateMediaType('screen');

  await kB.close(); await sB.close(); await lB.close(); await gB.close();
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
