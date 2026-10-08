/* Chunk 5, stage 1 — prices, the instant quote, the office's charge.
   Events window. Invented rooms and people only, events emulators only,
   network guard, no email leaves the machine.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/c5-hire-quote.test.mjs"

   The brief's proof (§6.18), up to the hirer's own page (stage 2):
     1. an admin adds "Private hire" and the hall's prices on the Places page
     2. a hirer finds a room by "40 people, cabaret, projector" (only the hall)
     3. asks for it on a Saturday, with tea for 40 (3 vegetarian), and sees the
        instant quote line by line: room hire, the weekend surcharge,
        catering, cleaning; the deposit and the damage deposit
     4. the office sees the same lines, changes one, and approves: the charge
        is recorded with the changed total, and the hirer's email has it
     5. the kitchen's list on the setup sheet has the tea, with the diets */

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
/* A Saturday at least a fortnight away. */
const SAT = plus(3);
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
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 1, fireMax: 120, layouts: { theatre: 100, cabaret: 48 }, facilities: { projector: true } }));
  await setDoc(doc(db, 'rooms', 'room_lounge'), ROOM('Test Lounge', { order: 2, fireMax: 30, layouts: { cabaret: 20 }, facilities: { projector: true } }));
  await setDoc(doc(db, 'rooms', 'room_annex'), ROOM('Test Annex', { order: 3, fireMax: 80, layouts: { cabaret: 50 } }));
  await setDoc(doc(db, 'menus', 'menu_tea'), { name: 'Tea and coffee', description: '', unit: 'head', price: 1.5, minimum: 0, noticeDays: 2, active: true, order: 1 });
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
  /* ---------- 1. the prices ---------- */
  const kB = await as('karen'); const K = kB.page;
  await go(K, 'places-admin.html', '.tab[data-tab="prices"]');
  await tap(K, '.tab[data-tab="prices"]');
  await val(K, '#t-name', 'Private hire');
  await tap(K, '#t-add');
  await K.waitForSelector('#rc-type option');
  await K.select('#rc-room', 'room_hall');
  await K.waitForSelector('#rc-hourly');
  for (const [k, v] of [['hourly', '20'], ['halfDay', '70'], ['evening', '60'], ['minimum', '40'], ['cleaning', '30'], ['deposit', '50'], ['damageDeposit', '100'], ['weekendPct', '25']]) await val(K, '#rc-' + k, v);
  await check(K, '#rc-setupCharged', true);
  await tap(K, '#rc-save');
  const typeId = (await readDb(db => getDocs(collection(db, 'bookingTypes')))).docs[0].id;
  const card = await until(() => get('rateCards', 'room_hall__' + typeId));
  ok('1. "Private hire" and the hall\'s prices, stored in pence', card && card.hourly === 2000 && card.halfDay === 7000 && card.weekendPct === 25 && card.damageDeposit === 10000 && card.setupCharged === true, JSON.stringify(card));
  await K.setViewport({ width: 375, height: 1600 });
  await K.screenshot({ path: path.join(HERE, 'c5-prices-375.png') });

  /* ---------- 2. the hirer finds a room ---------- */
  const gB = await launch('guest'); const G = await pageOf(gB, 'guest', 390);
  await go(G, 'hire.html', '#q-people');
  await val(G, '#q-people', '40');
  await G.select('#q-layout', 'cabaret');
  await check(G, '.q-fac[value="projector"]', true);
  await until(() => G.$eval('#count', e => /1 room/.test(e.textContent)));
  const shown = await G.evaluate(() => [...document.querySelectorAll('[data-room]')].map(x => x.dataset.room));
  ok('2. "40 people, cabaret, projector" leaves only the hall', shown.join() === 'room_hall', shown.join());
  await tap(G, '[data-room="room_hall"]');
  await G.waitForSelector('#ask');
  await tap(G, '#ask');
  await G.waitForSelector('#bt');

  /* ---------- 3. the instant quote ---------- */
  await val(G, '#bf-day', SAT); await G.select('#bf-start', '14:00'); await G.select('#bf-end', '16:00'); await G.select('#bf-setup', '30');
  await val(G, '#bf-title', 'Test ruby wedding'); await val(G, '#bf-people', '40'); await G.select('#bf-layout', 'cabaret');
  await check(G, '#bf-ref', true); await val(G, '.bf-menu[data-id="menu_tea"]', '40'); await val(G, '#bf-diet-vegetarian', '3');
  await val(G, '#bf-name', 'Hirer Synthetic'); await val(G, '#bf-email', 'hirer@example.invalid');
  await G.waitForSelector('#quoteTable');
  const qt = await until(async () => { const t = await G.$eval('#quoteTable', e => e.innerText.replace(/\s+/g, ' ')); return /Total £152\.50/.test(t) ? t : null; }, 10000)
    || await G.$eval('#quoteTable', e => e.innerText.replace(/\s+/g, ' '));
  ok('3. the quote, line by line: 2½ hours (with setting up) at £20 = £50', /Room hire, 2.5 hours at £20.00 an hour, including setting up and clearing away £50.00/.test(qt), qt);
  ok('   the weekend surcharge, 25% = £12.50', /Weekend surcharge \(25%\) £12.50/.test(qt), qt);
  ok('   tea for 40 at £1.50 = £60; cleaning £30; total £152.50', /40 × Tea and coffee \(a person\) £60.00/.test(qt) && /Cleaning £30.00/.test(qt) && /Total £152.50/.test(qt), qt);
  ok('   the deposit (part of it) and the refundable damage deposit (on top)', /deposit, due when it is confirmed £50.00/.test(qt) && /Refundable damage deposit, on top £100.00/.test(qt), qt);
  await goReady(G);
  await G.screenshot({ path: path.join(HERE, 'c5-instant-quote-375.png'), fullPage: true });
  await sleep(4200);
  await tap(G, '#f-go');
  await G.waitForSelector('#ref');
  const hire = (await bookings(['kind', 'hire']))[0];
  ok('   the request carries the kind of booking and the quote it showed', hire && hire.bookingType === typeId && hire.quote && hire.quote.total === 15250, JSON.stringify(hire && hire.quote));

  /* ---------- 4. the office adjusts one line and approves ---------- */
  const lB = await as('lena'); const L = lB.page;
  await go(L, 'bookings-admin.html', `[data-money="${hire.key}"]`);
  const lines = await L.evaluate((k) => [...document.querySelectorAll(`[data-money="${k}"] [data-ml]`)].map(x => x.value), hire.key);
  ok('4. the office sees the same lines, from the price list', lines.length === 4 && /Weekend surcharge/.test(lines[1]) && /Cleaning/.test(lines[3]), lines.join(' | '));
  await val(L, `[data-money="${hire.key}"] [data-ma="3"]`, '20.00');
  ok('   changing cleaning to £20 makes the total £142.50', /£142.50/.test(await L.$eval(`[data-mtotal="${hire.key}"]`, e => e.textContent)));
  await L.setViewport({ width: 375, height: 1400 });
  await L.screenshot({ path: path.join(HERE, 'c5-office-charges-375.png') });
  await L.setViewport({ width: 1100, height: 900 });
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-key="${hire.key}"] [data-do="approve"]`);
  const ch = await until(() => get('charges', 'ch_' + hire.key), 15000);
  ok('   approving records the charge: £142.50, unpaid, marked as adjusted', ch && ch.total === 14250 && ch.status === 'unpaid' && ch.adjusted === true && ch.lines.find(l => /Cleaning/.test(l.label)).amount === 2000, JSON.stringify(ch));
  ok('   the booking keeps the price it was confirmed at', (await get('bookings', hire.key)).quote.total === 14250);
  const m4 = await until(async () => (await outbox(L)).find(m => /confirmed/.test(m.subject) && m.to[0] === 'hirer@example.invalid'));
  ok('   the hirer\'s email has the price', m4 && /£142.50/.test(m4.html) && /Weekend surcharge/.test(m4.html));
  await go(L, 'bookings-admin.html', '[data-tab="coming"]');
  await tap(L, '[data-tab="coming"]');
  await L.waitForSelector(`[data-owed="${hire.key}"]`);
  ok('   "Coming up" shows what is owed', /£142.50, unpaid/.test(await L.$eval(`[data-owed="${hire.key}"]`, e => e.textContent)));

  /* ---------- 5. the kitchen's list ---------- */
  await tap(L, '[data-tab="setup"]');
  await L.waitForSelector('#s-day');
  await val(L, '#s-day', SAT);
  await L.waitForSelector(`[data-kitchen="${SAT}"]`);
  ok('5. the kitchen\'s list has tea for 40, 3 vegetarian', /40 × Tea and coffee; 3 vegetarian/.test(await L.$eval(`[data-kitchen="${SAT}"]`, e => e.innerText)));

  await kB.close(); await gB.close(); await lB.close();
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
