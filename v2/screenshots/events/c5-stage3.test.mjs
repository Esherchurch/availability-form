/* Chunk 5, stage 3 — hirers, numbered invoices (single and monthly), the
   damage deposit, asking to cancel, the accounts export and the Calla seam.
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/c5-stage3.test.mjs"

   What it proves:
     1. a hirer's record, made from their booking: charity (checked), regular,
        invoiced monthly; documents with expiry dates, flagged when expired or
        expiring
     2. the record decides the rate: the checked charity rate, not the
        self-declared tick
     3. monthly: both of the hirer's bookings in a month on one invoice,
        INV-00001; a one-off hirer's own invoice is INV-00002
     4. the damage deposit: taken, then returned with some kept, and why
     5. asking to cancel never cancels by itself; the office keeps one (with
        a reason) and cancels another, recording the refund as a payment
     6. the export: CSV, Excel and JSON; "only what is new" never repeats a row
     7. Calla Accounts mode: nothing waits for it; what is not sent is listed */

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
/* Three weekdays in one month, two months on, so they share an invoice. */
const m0 = new Date(); m0.setHours(12, 0, 0, 0); m0.setDate(1); m0.setMonth(m0.getMonth() + 2);
const inMonth = (n) => { const d = new Date(m0); d.setDate(n); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return ymd(d); };
const D1 = inMonth(4), D2 = inMonth(12), D3 = inMonth(19), PERIOD = D1.slice(0, 7);
const HA = 'hirer.a@example.invalid', HB = 'hirer.b@example.invalid';
const KA1 = 'bk_c5s3_a1_00000000000000000000', KA2 = 'bk_c5s3_a2_00000000000000000000', KB = 'bk_c5s3_b_000000000000000000000';
const BK = (key, day, email, name, org) => ({ kind: 'hire', status: 'requested', siteId: 'site_t', roomId: 'room_hall', groupId: '', day, startMin: 600, endMin: 720,
  startLocal: day + 'T10:00', endLocal: day + 'T12:00', setupMins: 0, packdownMins: 0, slotFrom: 40, slotTo: 48, title: 'Test ' + org, people: 20, layout: '',
  av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '', requester: { name, email, phone: '', org }, memberUid: '', memberName: '',
  createdAt: 'x', bookingType: 'type_hire', charity: false });
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
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('Test Hall', { order: 1, fireMax: 120 }));
  await setDoc(doc(db, 'bookingTypes', 'type_hire'), { name: 'Private hire', forPublic: true, charged: true, active: true, order: 1 });
  await setDoc(doc(db, 'rateCards', 'room_hall__type_hire'), { roomId: 'room_hall', typeId: 'type_hire', siteId: 'site_t', hourly: 2000, cleaning: 3000,
    damageDeposit: 10000, charityPct: 20, regularPct: 10, vat: false, vatRate: 20, active: true });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_lena'], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'bookings', KA1), BK(KA1, D1, HA, 'Hirer Alpha', 'Invented Tots'));
  await setDoc(doc(db, 'bookings', KA2), BK(KA2, D2, HA, 'Hirer Alpha', 'Invented Tots'));
  await setDoc(doc(db, 'bookings', KB), BK(KB, D3, HB, 'Hirer Beta', 'Invented Party'));
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
  const lB = await as('lena'); const L = lB.page;
  const dl = fs.mkdtempSync(path.join(TMP, 'dl-'));
  const cdp = await L.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  const newest = async (ext, after) => until(() => { const f = fs.readdirSync(dl).filter(n => n.endsWith(ext) && !after.includes(n)); return f.length ? f[0] : null; }, 15000);

  /* ---------- 1. a hirer's record ---------- */
  await go(L, 'bookings-admin.html', `[data-addhirer="${KA1}"]`);
  await tap(L, `[data-addhirer="${KA1}"]`);
  await L.waitForSelector('#hf-name');
  ok('1. "Add as a hirer" fills in the name and email from the booking', (await L.$eval('#hf-email', e => e.value)) === HA && (await L.$eval('#hf-name', e => e.value)) === 'Hirer Alpha');
  await val(L, '#hf-address', '1 Invented Lane, Testtown'); await check(L, '#hf-charity', true); await val(L, '#hf-charityNumber', '000001');
  await check(L, '#hf-charityChecked', true); await check(L, '#hf-regular', true); await check(L, '#hf-monthly', true);
  await tap(L, '#hf-save');
  const hA = await until(async () => (await readDb(db => getDocs(query(collection(db, 'hirers'), where('email', '==', HA))))).docs.map(d => ({ id: d.id, ...d.data() }))[0]);
  ok('   saved: charity (checked), regular, invoiced monthly', hA && hA.charityChecked && hA.regular && hA.monthly && hA.address.includes('Invented Lane'), J(hA));
  const pdf = path.join(TMP, 'insurance.pdf'); fs.writeFileSync(pdf, '%PDF-1.4\n% invented test document\n%%EOF\n');
  const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  for (const [kind, exp] of [['insurance', plusDays(20)], ['safeguarding', plusDays(-1)]]) {
    await L.waitForSelector('#hd-file');
    await L.select('#hd-kind', kind); await val(L, '#hd-exp', exp);
    await (await L.$('#hd-file')).uploadFile(pdf);
    const before = ((await get('hirers', hA.id)).documents || []).length;
    await tap(L, '#hd-add');
    await until(async () => ((await get('hirers', hA.id)).documents || []).length === before + 1, 20000);
    /* Wait for the page to draw the record again, with the new document. */
    await until(() => L.evaluate((n) => document.querySelectorAll('[data-hopen]').length === n && !!document.getElementById('hd-file'), before + 1), 15000);
  }
  const docs = (await get('hirers', hA.id)).documents;
  ok('   two documents stored, with their expiry dates', docs.length === 2 && docs.every(d => d.path.indexOf('hirerDocs/site_t/' + hA.id + '/') === 0));
  await go(L, 'bookings-admin.html', `[data-key="${KA1}"]`);
  const warn = await L.evaluate((k) => [...document.querySelectorAll('[data-docwarn="' + k + '"]')].map(x => x.innerText), KA1);
  ok('   the booking shows the insurance expiring in 20 days and the safeguarding policy expired', warn.some(w => /insurance expires in 20 days/i.test(w)) && warn.some(w => /Safeguarding policy expired/.test(w)), warn.join(' | '));

  /* ---------- 2. the record decides the rate ---------- */
  const linesA = await L.evaluate((k) => [...document.querySelectorAll('[data-money="' + k + '"] [data-ml]')].map(x => x.value), KA1);
  ok('2. the checked charity rate (20%) applies, not the regular 10%: one discount', linesA.filter(l => /Charity rate, 20% off/.test(l)).length === 1 && !linesA.some(l => /Regular/.test(l)), linesA.join(' | '));
  for (const k of [KA1, KA2, KB]) {
    await go(L, 'bookings-admin.html', `[data-key="${k}"] [data-do="approve"]`);
    await tap(L, `[data-key="${k}"] [data-do="approve"]`);
    await until(() => get('charges', 'ch_' + k), 15000);
  }
  const cA1 = await get('charges', 'ch_' + KA1), cB = await get('charges', 'ch_' + KB);
  ok('   Alpha: £40 hire - £8 charity + £30 cleaning = £62; Beta (no record) £70', cA1.total === 6200 && cB.total === 7000, cA1.total + ' / ' + cB.total);

  /* ---------- 3. invoices ---------- */
  await go(L, 'bookings-admin.html', '[data-tab="invoices"]');
  await tap(L, '[data-tab="invoices"]');
  await val(L, '#i-month', PERIOD);
  await L.waitForSelector(`[data-due="${hA.id}"]`);
  ok('3. the month lists Alpha: 2 bookings, £124', /2 bookings/.test(await L.$eval(`[data-due="${hA.id}"]`, e => e.innerText)) && /£124.00/.test(await L.$eval(`[data-due="${hA.id}"]`, e => e.innerText)));
  ok('   Beta is not monthly, so not listed', !(await L.$('[data-due]:not([data-due="' + hA.id + '"])')));
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, '#i-go');
  const inv1 = await until(() => get('invoices', 'inv_1'), 15000);
  ok('   one invoice, INV-00001: both bookings, £124', inv1 && inv1.number === 'INV-00001' && inv1.chargeIds.length === 2 && inv1.total === 12400 && inv1.monthly && inv1.period === PERIOD, J(inv1));
  ok('   each charge and booking knows its invoice', (await get('charges', 'ch_' + KA2)).invoiceNumber === 'INV-00001' && (await get('bookings', KA1)).invoice.number === 'INV-00001');
  const mi = await until(async () => (await outbox(L)).find(m => /Invoice INV-00001: £124.00/.test(m.subject)));
  ok('   emailed to Alpha, with both bookings and the address', mi && mi.to[0] === HA && /Invented Lane/.test(mi.html) && (mi.html.match(/my-booking\.html\?k=/g) || []).length === 2);
  await go(L, 'bookings-admin.html', '[data-tab="coming"]'); await tap(L, '[data-tab="coming"]');
  await L.waitForSelector(`[data-key="${KB}"] [data-do="invoice"]`);
  ok('   a monthly hirer\'s booking has no "Issue an invoice"; a one-off\'s does', !(await L.$(`[data-key="${KA1}"] [data-do="invoice"]`)));
  await tap(L, `[data-key="${KB}"] [data-do="invoice"]`);
  const inv2 = await until(() => get('invoices', 'inv_2'), 15000);
  ok('   Beta\'s invoice is the next number, INV-00002, £70; the counter is at 3', inv2 && inv2.number === 'INV-00002' && inv2.total === 7000 && (await get('counters', 'invoices')).next === 3);

  /* ---------- 4. the damage deposit ---------- */
  await go(L, 'bookings-admin.html', '[data-tab="coming"]'); await tap(L, '[data-tab="coming"]');
  await L.waitForSelector(`[data-key="${KB}"] [data-do="dtake"]`);
  await tap(L, `[data-key="${KB}"] [data-do="dtake"]`);
  await tap(L, `[data-key="${KB}"] .d-go`);
  await until(async () => ((await get('charges', 'ch_' + KB)).damage || {}).status === 'held', 15000);
  ok('4. the £100 damage deposit is recorded as taken (held)', (await get('charges', 'ch_' + KB)).damage.amount === 10000);
  await go(L, 'bookings-admin.html', '[data-tab="coming"]'); await tap(L, '[data-tab="coming"]');
  await L.waitForSelector(`[data-key="${KB}"] [data-do="dreturn"]`);
  await tap(L, `[data-key="${KB}"] [data-do="dreturn"]`);
  await val(L, `[data-key="${KB}"] .d-amt`, '80.00');
  await tap(L, `[data-key="${KB}"] .d-go`);
  const why = await toastText(L);
  await sleep(1500);
  ok('   keeping some needs a reason: the page asks, and nothing is saved', /Say why/.test(why || '') && ((await get('charges', 'ch_' + KB)).damage || {}).status === 'held', why);
  await val(L, `[data-key="${KB}"] .d-note`, 'Test: a broken chair');
  await tap(L, `[data-key="${KB}"] .d-go`);
  await until(async () => ((await get('charges', 'ch_' + KB)).damage || {}).status === 'returned', 15000);
  const dm = (await get('charges', 'ch_' + KB)).damage;
  ok('   returned £80, kept £20, and why', dm.returned === 8000 && dm.kept === 2000 && dm.note === 'Test: a broken chair');

  /* ---------- 5. asking to cancel ---------- */
  const gB = await launch('guest'); const G = await pageOf(gB, 'guest', 390);
  await go(G, 'my-booking.html?k=' + KB, '#damage');
  ok('   the hirer\'s page shows it: returned £80, kept £20 (a broken chair)', /Returned to you: £80.00. Kept: £20.00 \(Test: a broken chair\)/.test(await G.$eval('#damage', e => e.innerText)));
  ok('   and the invoice number', /INV-00002/.test(await G.$eval('#invoice', e => e.innerText)));
  await go(G, 'my-booking.html?k=' + KA2, '#askOpen');
  await tap(G, '#askOpen'); await val(G, '#askWhy', 'Test: half term');
  await tap(G, '#askGo');
  await G.waitForSelector('#asked', { timeout: 15000 });
  const a2 = await get('bookings', KA2);
  ok('5. asking to cancel records the ask, at the server\'s time, and cancels nothing', a2.cancelRequest.status === 'asked' && typeof a2.cancelRequest.at.toDate === 'function' && a2.status === 'confirmed');
  await go(L, 'bookings-admin.html', `[data-ask="${KA2}"]`);
  ok('   the office sees it in Waiting, with the reason', /half term/.test(await L.$eval(`[data-ask="${KA2}"]`, e => e.innerText)));
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, `[data-ask="${KA2}"] [data-askdo="keep"]`);
  ok('   keeping it needs a reason', (await get('bookings', KA2)).cancelRequest.status === 'asked');
  await val(L, `[data-ask="${KA2}"] .a-answer`, 'Test: inside the notice period');
  await tap(L, `[data-ask="${KA2}"] [data-askdo="keep"]`);
  await until(async () => (await get('bookings', KA2)).cancelRequest.status === 'declined', 15000);
  const kept = await until(async () => (await outbox(L)).find(m => /We have kept your booking/.test(m.subject)));
  ok('   kept: the booking stands, and the hirer is told why', (await get('bookings', KA2)).status === 'confirmed' && kept && /notice period/.test(kept.html));
  /* Beta has paid, then asks: cancelled, and the refund recorded. */
  await go(L, 'bookings-admin.html', '[data-tab="coming"]'); await tap(L, '[data-tab="coming"]');
  await L.waitForSelector(`[data-key="${KB}"] [data-do="pay"]`);
  await tap(L, `[data-key="${KB}"] [data-do="pay"]`);
  await tap(L, `[data-key="${KB}"] .p-go[data-kind="payment"]`);
  await until(async () => (await get('charges', 'ch_' + KB)).status === 'paid', 15000);
  ok('   (Beta pays £70; the invoice INV-00002 is paid too)', (await until(async () => (await get('invoices', 'inv_2')).status === 'paid' ? true : null, 10000)) === true);
  await go(G, 'my-booking.html?k=' + KB, '#askOpen');
  await tap(G, '#askOpen'); await tap(G, '#askGo');
  await G.waitForSelector('#asked', { timeout: 15000 });
  await go(L, 'bookings-admin.html', `[data-ask="${KB}"]`);
  await val(L, `[data-ask="${KB}"] .a-answer`, 'Test: cancelled as you asked');
  await tap(L, `[data-ask="${KB}"] [data-askdo="cancel"]`);
  await L.waitForSelector(`[data-ask="${KB}"] .p-go`, { timeout: 15000 });
  ok('   cancelling offers the refund: £70', (await get('bookings', KB)).status === 'cancelled' && (await L.$eval(`[data-ask="${KB}"] .p-amt`, e => e.value)) === '70.00');
  await tap(L, `[data-ask="${KB}"] .p-go`);
  await until(async () => ((await get('charges', 'ch_' + KB)).payments || []).some(p => p.kind === 'refund'), 15000);
  const cB2 = await get('charges', 'ch_' + KB);
  ok('   the refund is recorded as a payment the other way; the charge is cancelled', cB2.payments.length === 2 && cB2.payments[1].kind === 'refund' && cB2.payments[1].amount === 7000 && cB2.status === 'cancelled', J(cB2.payments) + ' ' + cB2.status);

  /* ---------- 6. the export ---------- */
  await go(L, 'bookings-admin.html', '[data-tab="accounts"]'); await tap(L, '[data-tab="accounts"]');
  await L.waitForSelector('#x-from');
  ok('6. a bookings admin exports, but does not see the accounts setting (admins only)', !(await L.$('#x-save')));
  const today = ymd(new Date()), end = ymd(new Date(m0.getFullYear(), m0.getMonth() + 1, 0, 12));
  await val(L, '#x-from', today); await val(L, '#x-to', end);
  let seen = fs.readdirSync(dl);
  await tap(L, '[data-x="csv"]');
  const csvName = await newest('.csv', seen);
  await until(() => /rows exported/.test(fs.readFileSync(path.join(dl, csvName), 'utf8')) ? true : L.$eval('#x-out', e => /rows exported/.test(e.textContent)));
  const csv = fs.readFileSync(path.join(dl, csvName), 'utf8').replace(/^\ufeff/, '').trim().split(/\r?\n/);
  ok('   CSV: a head row and a row for every line, payment, refund and deposit move', csv[0].startsWith('Id,Date,Type,Invoice') && csv.length > 10 && csv.some(r => /^ch_bk_c5s3_b_[^,]*#P1,.*Refund/.test(r)) && csv.some(r => /Damage deposit kept/.test(r)), csv.length + ' rows; ' + csv.slice(0, 3).join(' / '));
  ok('   with the invoice number on each charge row; the cancelled booking has only its payment and refund', csv.filter(r => /#L0,/.test(r)).every(r => /INV-00001/.test(r)) && !csv.some(r => /c5s3_b_[^,]*#L0/.test(r)) && csv.some(r => /c5s3_b_[^,]*#P0/.test(r)));
  await go(L, 'bookings-admin.html', '[data-tab="accounts"]'); await tap(L, '[data-tab="accounts"]');
  await val(L, '#x-from', today); await val(L, '#x-to', end);
  await tap(L, '[data-x="csv"]');
  await until(() => L.$eval('#x-out', e => e.textContent));
  ok('   exported again "only what is new": nothing, so nothing goes in twice', /Nothing to export/.test(await L.$eval('#x-out', e => e.textContent)));
  await check(L, '#x-new', false);
  seen = fs.readdirSync(dl);
  await tap(L, '[data-x="json"]');
  const js = JSON.parse(fs.readFileSync(path.join(dl, await newest('.json', seen)), 'utf8'));
  ok('   JSON (everything, ticked off): the same rows, by name', js.length === csv.length - 1 && js[0].Id && 'Gross (£)' in js[0]);
  seen = fs.readdirSync(dl);
  await tap(L, '[data-x="xlsx"]');
  const xl = await newest('.xlsx', seen);
  await sleep(1500);
  ok('   and Excel', xl && fs.readFileSync(path.join(dl, xl)).slice(0, 2).toString() === 'PK', 'file: ' + xl + '; files: ' + fs.readdirSync(dl).join(', ') + '; page: ' + (await L.$eval('#x-out', e => e.textContent)));

  /* ---------- 7. Calla Accounts mode ---------- */
  const kB = await as('karen'); const K = kB.page;
  await go(K, 'bookings-admin.html', '[data-tab="accounts"]'); await tap(K, '[data-tab="accounts"]');
  await K.waitForSelector('#x-save');
  await tap(K, 'input[name="x-mode"][value="calla"]');
  await val(K, '#x-pay', 'Test: bank transfer to the invented account');
  await tap(K, '#x-save');
  await until(async () => ((await get('settings', 'accounts')) || {}).mode === 'calla');
  ok('7. an admin switches to Calla Accounts; who numbers invoices stays "hub" until Martin decides', (await get('settings', 'accounts')).invoiceNumbersBy === 'hub');
  await go(L, 'bookings-admin.html', '[data-tab="hirers"]'); await tap(L, '[data-tab="hirers"]');
  await L.waitForSelector(`[data-hedit="${hA.id}"]`);
  await tap(L, `[data-hedit="${hA.id}"]`);
  await val(L, '#hf-phone', '07700 900456');
  await tap(L, '#hf-save');
  await until(async () => (await get('hirers', hA.id)).phone === '07700 900456', 15000);
  const q1 = await until(async () => { const q = await get('accountsQueue', 'aq_customer_' + hA.id); return q && q.tries >= 1 ? q : null; }, 15000);
  ok('   saving still works, and the hirer waits for Calla, with the reason', q1 && q1.status === 'waiting' && q1.tries === 1 && /not built yet/.test(q1.lastError), J(q1));
  await go(L, 'bookings-admin.html', '[data-tab="accounts"]'); await tap(L, '[data-tab="accounts"]');
  await until(() => L.$eval('#x-count', e => e.textContent));
  ok('   the office sees "not yet sent to Calla Accounts", and what is waiting', /1 waiting/.test(await L.$eval('#x-queue', e => e.innerText)));
  await tap(L, '#x-retry');
  await until(async () => (await get('accountsQueue', 'aq_customer_' + hA.id)).tries === 2, 15000);
  ok('   "Try again" tries again, and it still waits', (await get('accountsQueue', 'aq_customer_' + hA.id)).status === 'waiting');
  await L.setViewport({ width: 375, height: 1400 });
  await L.screenshot({ path: path.join(HERE, 'c5-accounts-375.png'), fullPage: true });
  await tap(K, 'input[name="x-mode"][value="none"]'); await tap(K, '#x-save');
  await until(async () => ((await get('settings', 'accounts')) || {}).mode === 'none');

  await go(L, 'bookings-admin.html', '[data-tab="hirers"]'); await tap(L, '[data-tab="hirers"]');
  await L.waitForSelector(`[data-hrow="${hA.id}"]`);
  await L.screenshot({ path: path.join(HERE, 'c5-hirers-375.png'), fullPage: true });
  await go(G, 'my-booking.html?k=' + KA1, '#invoice');
  await G.screenshot({ path: path.join(HERE, 'c5-hirer-invoice-375.png'), fullPage: true });

  await lB.close(); await gB.close(); await kB.close();
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
