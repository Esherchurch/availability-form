/* Chunk 5, stage 2 — the members' rate (F-077), the hirer's own page,
   terms by kind of booking, payments.
   Events window. Invented rooms and people only, events emulators only,
   network guard, no email leaves the machine.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/c5-stage2.test.mjs"

   What it proves:
     1. Places: a members' rate of 25% on "Private hire"; VAT stays off, with
        its rate a setting; the terms, as version 1
     2. a member booking Private hire in the hub gets the members' rate, and
        the quote says so; it waits for the office
     3. the public do not, and cannot claim it
     4. the office prices each one the same way and approves; the member's
        charge has the members' rate, the hirer's does not
     5. the hirer's own page (the link in the email): the quote as a
        document, the terms, accepting both, timed by the server
     6. new terms are version 2; what the hirer accepted stays version 1
     7. payments recorded by hand: part-paid, then paid, with receipts, and
        the hirer's page shows it
     8. printing gives the document alone; a wrong link finds nothing */

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
  bookableByMembers: true, bookableByHirers: true, description: '', photoUrl: '', ...(extra || {}) });
const WED = plus(0), THU = plus(1);
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
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 1, fireMax: 120, layouts: { theatre: 100 } }));
  await setDoc(doc(db, 'bookingTypes', 'type_hire'), { name: 'Private hire', forPublic: true, charged: true, active: true, order: 2 });
  await setDoc(doc(db, 'bookingTypes', 'type_church'), { name: 'Church use', forPublic: false, charged: false, active: true, order: 1 });
  await setDoc(doc(db, 'rateCards', 'room_hall__type_hire'), { roomId: 'room_hall', typeId: 'type_hire', siteId: 'site_t', hourly: 2000, cleaning: 3000, vat: false, vatRate: 20, active: true });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_lena'], safeguardingLead: '', safeguardingDeputy: '' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const bookings = (w) => readDb(db => getDocs(query(collection(db, 'bookings'), where(w[0], '==', w[1]))).then(s => s.docs.map(d => ({ key: d.id, ...d.data() }))));
const range = (sl, a, b) => sl.slice(a, b);
const J = (x) => JSON.stringify(x);

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
  /* ---------- 1. Places ---------- */
  const kB = await as('karen'); const K = kB.page;
  await go(K, 'places-admin.html', '.tab[data-tab="prices"]');
  await tap(K, '.tab[data-tab="prices"]');
  await K.waitForSelector('[data-tmr="type_hire"]');
  await K.select('[data-tmr="type_hire"]', 'percent');
  await K.waitForSelector('[data-tmrp="type_hire"]');
  await val(K, '[data-tmrp="type_hire"]', '25');
  await until(async () => ((await get('bookingTypes', 'type_hire')).membersRate || {}).pct === 25);
  ok("1. Private hire gets a members' rate: 25% off", J((await get('bookingTypes', 'type_hire')).membersRate) === J({ mode: 'percent', pct: 25 }));
  await K.select('#rc-room', 'room_hall'); await K.select('#rc-type', 'type_hire');
  await K.waitForSelector('#rc-vatRate');
  const vatBox = await K.evaluate(() => ({ ticked: document.getElementById('rc-vat').checked, rate: document.getElementById('rc-vatRate').value }));
  ok('   VAT is off, and its rate is a box next to the tick (not a fixed 20%)', !vatBox.ticked && vatBox.rate === '20', J(vatBox));
  await val(K, '#rc-vatRate', '5'); await tap(K, '#rc-save');
  await until(async () => (await get('rateCards', 'room_hall__type_hire')).vatRate === 5);
  ok('   the rate saves (5%), and VAT stays off until it is ticked', (await get('rateCards', 'room_hall__type_hire')).vat === false);
  await K.select('#tm-type', 'type_hire');
  await val(K, '#tm-text', 'Test terms: leave the hall as you found it.');
  await tap(K, '#tm-save');
  await until(async () => (await get('bookingTypes', 'type_hire')).termsVersion === 1);
  ok('   the terms are saved as version 1', ((await get('terms', 'type_hire_v1')) || {}).text === 'Test terms: leave the hall as you found it.');

  /* ---------- 2. a member, at the members' rate ---------- */
  const sB = await as('samy'); const S = sB.page;
  await go(S, 'rooms.html', '#c-date');
  await val(S, '#c-date', WED);
  await S.waitForSelector(`.bk-row[data-room="room_hall"][data-day="${WED}"] [data-slot="40"]`);
  await tap(S, `.bk-row[data-room="room_hall"][data-day="${WED}"] [data-slot="40"]`);
  await S.waitForSelector('#bt');
  ok('2. a member chooses what kind of booking; church use is free and first', (await S.evaluate(() => document.getElementById('bt').options[0].textContent)) === 'Church use');
  await S.select('#bt', 'type_hire');
  await S.select('#bf-end', '12:00');
  await val(S, '#bf-title', 'Test christening party'); await val(S, '#bf-people', '30');
  const sq = await until(async () => { const t = await S.evaluate(() => { const e = document.querySelector('[data-quote="room_hall"]'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; }); return /Total £60.00/.test(t) ? t : null; }, 10000);
  ok("   the quote says so: Members' rate, 25% off the room, -£10; total £60", sq && /Members' rate, 25% off the room -?£-?10.00/.test(sq.replace('£-10.00', '-£10.00')), sq);
  ok('   it is charged, so it waits for the office ("Ask for it")', !!(await goReady(S, 'Ask for it')));
  await S.setViewport({ width: 375, height: 2200 });
  await S.screenshot({ path: path.join(HERE, 'c5-member-rate-375.png') });
  await S.setViewport({ width: 1100, height: 900 });
  await tap(S, '#f-go');
  await settled(S);
  const mb = (await bookings(['memberUid', P.samy.uid]))[0];
  ok('   the booking waits, as a member\'s, at the members\' rate', mb && mb.status === 'requested' && mb.kind === 'member' && mb.memberRate === true && mb.quote.total === 6000, J(mb && { s: mb.status, r: mb.memberRate, q: mb.quote && mb.quote.total }));

  /* ---------- 3. the public do not get it ---------- */
  const gB = await launch('guest'); const G = await pageOf(gB, 'guest', 390);
  await go(G, 'book.html?room=room_hall&day=' + THU + '&start=14:00&end=16:00', '#bt');
  await val(G, '#bf-title', 'Test birthday'); await val(G, '#bf-people', '30');
  await val(G, '#bf-name', 'Hirer Synthetic'); await val(G, '#bf-email', 'hirer@example.invalid');
  const gq = await until(async () => { const t = await G.evaluate(() => { const e = document.getElementById('quoteTable'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; }); return /Total £70.00/.test(t) ? t : null; }, 10000);
  ok("3. the public's quote has no members' rate: £40 + £30 cleaning = £70", gq && !/Members/.test(gq), gq);
  const claim = await G.evaluate((day) => {
    const B = EGBCBookings, b = B.prepare({ kind: 'hire', room: { id: 'room_hall', siteId: 'site_t' }, site: {}, day, start: '18:00', end: '19:00', title: 'x', people: 3,
      requester: { name: 'X', email: 'x@example.invalid', phone: '', org: '' } });
    b.memberRate = true; b.bookingType = 'type_hire';
    return EGBCAuth.db.collection('bookings').doc('bk_' + EGBCEvents.key(28)).set(b).then(() => 'written', e => e.code || e.message);
  }, THU);
  ok("   claiming the members' rate round the page is refused by the rules", /permission/i.test(claim), claim);
  await goReady(G); await sleep(4200); await tap(G, '#f-go'); await G.waitForSelector('#ref');
  const hb = (await bookings(['kind', 'hire']))[0];

  /* ---------- 4. the office ---------- */
  const lB = await as('lena'); const L = lB.page;
  await go(L, 'bookings-admin.html', `[data-money="${hb.key}"]`);
  await L.waitForSelector(`[data-money="${mb.key}"]`);
  const lines = await L.evaluate((a, b) => [a, b].map(k => [...document.querySelectorAll('[data-money="' + k + '"] [data-ml]')].map(x => x.value).join(' | ')), mb.key, hb.key);
  ok("4. the office: the member's lines have the members' rate, the hirer's do not", /Members' rate/.test(lines[0]) && !/Members/.test(lines[1]), lines.join(' // '));
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-key="${mb.key}"] [data-do="approve"]`);
  await until(() => get('charges', 'ch_' + mb.key), 15000);
  await go(L, 'bookings-admin.html', `[data-key="${hb.key}"] [data-do="approve"]`);
  await tap(L, `[data-key="${hb.key}"] [data-do="approve"]`);
  const hc = await until(() => get('charges', 'ch_' + hb.key), 15000), mc = await get('charges', 'ch_' + mb.key);
  ok("   the member's charge: £60, with the members' rate line; marked as a member's", mc.total === 6000 && mc.lines.some(l => l.code === 'member' && l.amount === -1000) && mc.kind === 'member', J(mc));
  ok("   the hirer's: £70, with none", hc.total === 7000 && !hc.lines.some(l => l.code === 'member'), J(hc));
  const mail = await until(async () => (await outbox(L)).find(m => m.to[0] === 'hirer@example.invalid' && /confirmed/.test(m.subject)));
  const link = mail && (mail.html.match(/href="([^"]*my-booking\.html\?k=[^"]+)"/) || [])[1];
  ok('   the hirer\'s email links to their own page', !!link && link.indexOf('k=' + hb.key) > 0, mail && mail.html.slice(0, 200));

  /* ---------- 5. the hirer's own page ---------- */
  await G.goto(link.replace(/^https?:\/\/[^/]+\//, URLB), { waitUntil: 'networkidle2' });
  await G.waitForSelector('#quoteTable');
  const docText = await G.$eval('#quoteTable', e => e.innerText.replace(/\s+/g, ' '));
  ok('5. the hirer\'s page: the quote, £70, and the terms (version 1)', /Total £70.00/.test(docText) && /leave the hall as you found it/.test(await G.$eval('#terms', e => e.innerText)), docText);
  await tap(G, '#accept');
  ok('   accepting needs the tick', /Tick the box/.test(await G.$eval('#acceptMsg', e => e.textContent)) && !(await get('bookings', hb.key)).accepted);
  await check(G, '#agree', true); await val(G, '#who', 'Hirer Synthetic');
  await G.screenshot({ path: path.join(HERE, 'c5-hirer-page-375.png'), fullPage: true });
  await tap(G, '#accept');
  await G.waitForSelector('#accepted', { timeout: 15000 });
  const acc = (await get('bookings', hb.key)).accepted;
  ok('   accepted: the name, £70, terms version 1, and the server\'s time', acc && acc.name === 'Hirer Synthetic' && acc.total === 7000 && acc.termsVersion === 1 && acc.termsId === 'type_hire_v1' && typeof acc.at.toDate === 'function', J(acc));
  const again = await G.evaluate((k) => EGBCAuth.db.collection('bookings').doc(k).update({ accepted: { name: 'Someone else', at: firebase.firestore.FieldValue.serverTimestamp(), termsId: 'type_hire_v1', termsVersion: 1, total: 7000 } }).then(() => 'written', e => e.code || e.message), hb.key);
  ok('   and only once', /permission/i.test(again), again);

  /* ---------- 6. new terms ---------- */
  await go(K, 'places-admin.html', '.tab[data-tab="prices"]');
  await tap(K, '.tab[data-tab="prices"]');
  await K.waitForSelector('#tm-type option[value="type_hire"]');
  await K.select('#tm-type', 'type_hire');
  await until(() => K.$eval('#tm-text', e => /version|found it/.test(e.value)));
  await val(K, '#tm-text', 'Test terms, version 2: no confetti.'); await tap(K, '#tm-save');
  await until(async () => (await get('bookingTypes', 'type_hire')).termsVersion === 2);
  ok('6. new terms are version 2; version 1 is unchanged', ((await get('terms', 'type_hire_v2')) || {}).text === 'Test terms, version 2: no confetti.' && (await get('terms', 'type_hire_v1')).text === 'Test terms: leave the hall as you found it.');
  await G.reload({ waitUntil: 'networkidle2' }); await G.waitForSelector('#accepted');
  ok('   the hirer\'s page still shows the version they accepted', /version 1/.test(await G.$eval('#accepted', e => e.textContent)) && /found it/.test(await G.$eval('#terms', e => e.innerText)));

  /* ---------- 7. payments ---------- */
  await go(L, 'bookings-admin.html', '[data-tab="coming"]');
  await tap(L, '[data-tab="coming"]');
  await L.waitForSelector(`[data-key="${hb.key}"] [data-do="pay"]`);
  await ok('   the office sees it was accepted', /Accepted by Hirer Synthetic, terms version 1/.test(await L.$eval(`[data-acc="${hb.key}"]`, e => e.textContent)));
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-key="${hb.key}"] [data-do="pay"]`);
  await val(L, `[data-key="${hb.key}"] .p-amt`, '50.00'); await val(L, `[data-key="${hb.key}"] .p-ref`, 'TEST123');
  await tap(L, `[data-key="${hb.key}"] .p-go[data-kind="payment"]`);
  await until(async () => (await get('charges', 'ch_' + hb.key)).status === 'part-paid', 15000);
  const ch1 = await get('charges', 'ch_' + hb.key), bk1 = await get('bookings', hb.key);
  ok('7. £50 by bank transfer: part-paid, recorded with its reference', ch1.payments.length === 1 && ch1.payments[0].amount === 5000 && ch1.payments[0].method === 'Bank transfer' && ch1.payments[0].ref === 'TEST123');
  ok('   the booking says so too, for the hirer\'s page', J(bk1.payment) === J({ status: 'part-paid', paid: 5000, total: 7000 }));
  const rc = await until(async () => (await outbox(L)).find(m => /Payment received: £50.00/.test(m.subject)));
  ok('   and the hirer gets a receipt: £50 of £70 so far', rc && rc.to[0] === 'hirer@example.invalid' && /£50.00 of £70.00/.test(rc.html));
  await G.reload({ waitUntil: 'networkidle2' }); await G.waitForSelector('#paid');
  ok('   the hirer\'s page: paid £50 of £70', /Paid £50.00 of £70.00/.test(await G.$eval('#paid', e => e.innerText)));
  await go(L, 'bookings-admin.html', '[data-tab="coming"]');
  await tap(L, '[data-tab="coming"]');
  await L.waitForSelector(`[data-key="${hb.key}"] [data-do="pay"]`);
  await tap(L, `[data-key="${hb.key}"] [data-do="pay"]`);
  ok('   the next payment starts at what is left: £20', (await L.$eval(`[data-key="${hb.key}"] .p-amt`, e => e.value)) === '20.00');
  await L.select(`[data-key="${hb.key}"] .p-how`, 'Cash');
  await tap(L, `[data-key="${hb.key}"] .p-go[data-kind="payment"]`);
  await until(async () => (await get('charges', 'ch_' + hb.key)).status === 'paid', 15000);
  await G.reload({ waitUntil: 'networkidle2' }); await G.waitForSelector('#paid');
  ok('   then paid in full, on both', /Paid in full/.test(await G.$eval('#paid', e => e.innerText)) && (await get('bookings', hb.key)).payment.status === 'paid');

  /* ---------- 8. printing, and a wrong link ---------- */
  await G.emulateMediaType('print');
  const pr = await G.evaluate(() => ({ doc: getComputedStyle(document.getElementById('doc')).visibility, head: getComputedStyle(document.getElementById('chead')).visibility,
    btn: getComputedStyle(document.getElementById('print').closest('.noprint')).display }));
  ok('8. printing (or saving as a PDF) gives the quote document alone', pr.doc === 'visible' && pr.head === 'hidden' && pr.btn === 'none', J(pr));
  await G.screenshot({ path: path.join(HERE, 'c5-quote-print.png'), fullPage: true });
  await G.emulateMediaType('screen');
  await go(G, 'my-booking.html?k=bk_nothing_here_00000000000000000', '#nolink');
  ok('   a wrong link finds nothing, and says so', /cannot find that booking/.test(await G.$eval('#nolink', e => e.textContent)));

  await kB.close(); await sB.close(); await gB.close(); await lB.close();
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
