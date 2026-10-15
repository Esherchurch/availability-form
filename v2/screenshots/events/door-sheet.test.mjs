/* The door sheet (F-210; Martin, 15 Oct: "can I download a check-in list
   of attendees for an event like I can with ChurchSuite?"). Events window.
   Invented people only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/door-sheet.test.mjs"

   What it proves:
     1. a clean page per event: by SURNAME, a tick box for each named
        person on their own line, extra places without names shown once
     2. each booking's ticket, places, "to pay £x" / "paid", notes ONCE,
        and the total booked (and what is to collect, and the waiting list)
     3. cancelled and waiting people are not on it; phone and answers only
        when ticked
     4. MEDICAL answers only with the download recorded (who, when, which
        columns), as the other downloads
     5. the same as a PDF
     6. it is a sign-up list, not an attendance record: nothing about who
        came is written
     7. printed, only the sheet prints (A4) */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-door-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

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

await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = { martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
const start = new Date(); start.setDate(start.getDate() + 3); start.setHours(19, 30, 0, 0);
await db.collection('calEvents').doc('ev_door').set({ title: 'Barn dance (invented)', description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 3 * 3600e3)), endUtc: start.getTime() + 3 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 40, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x' });
await db.collection('calEvents').doc('ev_door').collection('ticketTypes').doc('tt_adult').set({ name: 'Adult', price: 5, capacity: 0, order: 1, payBy: ['day'] });
await db.collection('calEvents').doc('ev_door').collection('ticketTypes').doc('tt_child').set({ name: 'Child', price: 0, capacity: 0, order: 2, payBy: ['day'] });
await db.collection('calEvents').doc('ev_door').collection('questions').doc('q_all').set({ label: 'Allergies', kind: 'text', per: 'attendee', order: 1 });
await db.collection('calEvents').doc('ev_door').collection('questions').doc('q_song').set({ label: 'Favourite song', kind: 'text', per: 'booking', order: 2 });
await db.collection('capacity').doc('ev_door').set({ calEventId: 'ev_door', taken: 6, capacity: 40 });
const SU = (name, email, attendees, places, tt, extra) => ({ calEventId: 'ev_door', personKind: 'guest', personId: '', name, email, phone: '', attendees, answers: {}, places, ticketTypeId: tt, status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: new Date().toISOString(), ...(extra || {}) });
await db.collection('signups').doc('su_zoe_00000000000000000000000').set(SU('Zoe Adams (invented)', 'zoe@example.invalid', [{ name: 'Zoe Adams (invented)', q_q_all: 'None' }, { name: 'Tom Adams (invented)', q_q_all: 'PEANUTS-SECRET' }], 2, 'tt_adult', { phone: '07000 000001', notes: 'Wheelchair space please', answers: { q_song: 'Cotton Eye Joe' } }));
await db.collection('signups').doc('su_brian_000000000000000000000').set(SU('Brian Carter (invented)', 'brian@example.invalid', [{ name: 'Brian Carter (invented)' }], 3, 'tt_adult'));
await db.collection('signups').doc('su_amy_00000000000000000000000').set(SU('Amy Brown (invented)', 'amy@example.invalid', [{ name: 'Amy Brown (invented)' }], 1, 'tt_child'));
await db.collection('signups').doc('su_will_0000000000000000000000').set(SU('Will Waiting (invented)', 'will@example.invalid', [{ name: 'Will Waiting (invented)' }], 1, 'tt_adult', { status: 'waiting' }));
await db.collection('signups').doc('su_gone_0000000000000000000000').set(SU('Cancelled Person (invented)', 'gone@example.invalid', [{ name: 'Cancelled Person (invented)' }], 1, 'tt_adult', { status: 'cancelled' }));
await db.collection('signupPayments').doc('su_brian_000000000000000000000').set({ calEventId: 'ev_door', paid: true, amount: 15, method: 'card-online', status: 'paid', by: '', byName: 'Online' });
const snap = async () => J({ s: (await db.collection('signups').get()).docs.map(d => [d.id, d.data()]), c: (await db.collection('checkins').get()).size, a: (await db.collection('attendance').get()).size });
const before = await snap();

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: width || 1100, height: 900 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const lines = (pg) => pg.$$eval('#doorTable tbody tr', rs => rs.map(r => [...r.children].map(c => c.textContent.trim())));
const logs = async () => (await db.collection('downloadsLog').get()).docs.map(d => d.data());

try {
  const M = await browser('martin');
  await M.goto(URLB + 'attendance.html?event=ev_door', { waitUntil: 'networkidle2' });
  await until(() => M.$('#dsShow'));
  /* ---------- 1-3. the sheet ---------- */
  await M.$eval('#dsShow', b => b.click());
  await until(() => M.$('#doorTable'));
  const L = await lines(M);
  const names = L.map(r => r[1]);
  ok('1. BY SURNAME, one line each: Adams (Zoe, Tom), Brown (Amy), Carter (Brian, + 2 more with no name)', J(names) === J(['Zoe Adams (invented)', 'Tom Adams (invented)', 'Amy Brown (invented)', 'Brian Carter (invented)', '+ 2 more (no name given)']), J(names));
  const boxes = await M.$$eval('#doorTable tbody tr', rs => rs.map(r => !!r.querySelector('td .box')));
  ok('   a tick box for each named person (not for the line of unnamed places)', J(boxes) === J([true, true, true, true, false]), J(boxes));
  ok('2. EACH BOOKING ONCE: ticket, places, payment - Adams: Adult, 2, "To pay £10.00"; Brown: Child, 1, nothing to pay; Carter: Adult, 3, "Paid £15.00 (card)"',
    J(L[0].slice(2, 5)) === J(['Adult', '2', 'To pay £10.00']) && J(L[2].slice(2, 5)) === J(['Child', '1', '']) && J(L[3].slice(2, 5)) === J(['Adult', '3', 'Paid £15.00 (card)']) && L[1].length === 2, J(L));
  ok('   the notes, once: "Wheelchair space please"', L[0][L[0].length - 1] === 'Wheelchair space please', J(L[0]));
  ok('   THE TOTAL: "6 places booked in 3 bookings · £10.00 to collect · 1 on the waiting list"', (await text(M, '#doorTotal')) === 'Door sheet: 6 places booked in 3 bookings · £10.00 to collect · 1 on the waiting list', await text(M, '#doorTotal'));
  const page = await text(M, '#printArea');
  ok('3. CANCELLED AND WAITING PEOPLE NOT ON IT; no phone or answers unless ticked', !/Cancelled Person|Will Waiting|07000|PEANUTS|Cotton Eye/.test(page), page.slice(0, 300));
  ok('   it says it is not a record of who came', /It is not kept as a record of who came/.test(page));

  /* ---------- 7. printed ---------- */
  await M.setViewport({ width: 794, height: 1123 });
  await M.emulateMediaType('print');
  const vis = await M.evaluate(() => ({ wrap: getComputedStyle(document.getElementById('wrap')).display, sheet: getComputedStyle(document.getElementById('printArea')).display, bar: getComputedStyle(document.querySelector('.door-bar')).display }));
  ok('7. PRINTED: only the sheet (the page, the menu bar and the buttons are not printed)', vis.wrap === 'none' && vis.sheet === 'block' && vis.bar === 'none', J(vis));
  await M.screenshot({ path: path.join(HERE, 'door-sheet-a4.png'), fullPage: true });
  await M.emulateMediaType('screen');
  await M.setViewport({ width: 1100, height: 900 });
  const n0 = (await logs()).length;
  ok('   a sheet with no medical answers: recorded as a plain download, like the others here', n0 >= 1 && (await logs()).every(l => l.sensitive === false && l.what === 'door sheet'), J(await logs()));

  /* ---------- 3-4. columns; medical ---------- */
  await M.$eval('#dsClose', b => b.click());
  await M.$eval('#dsPhone', c => c.click());
  await M.$eval('.dsQ[value="q_song"]', c => c.click());
  await M.$eval('#dsShow', b => b.click());
  await until(() => M.$('#doorTable'));
  const L2 = await lines(M), head2 = await M.$$eval('#doorTable th', t => t.map(x => x.textContent));
  ok('3. TICKED: Phone and Favourite song appear, once per booking', head2.includes('Phone') && head2.includes('Favourite song') && L2[0].includes('07000 000001') && L2[0].includes('Cotton Eye Joe') && !head2.includes('Allergies'), J([head2, L2[0]]));
  ok('   Allergies is marked Medical on the options', /Allergies\s*Medical/.test(await text(M, '#doorCard')));
  await M.$eval('#dsClose', b => b.click());
  await M.$eval('.dsQ[value="q_all"]', c => c.click());
  await M.$eval('#dsShow', b => b.click());
  await until(async () => /PEANUTS-SECRET/.test(await text(M, '#printArea').catch(() => '')));
  const med = (await logs()).find(l => l.sensitive === true);
  ok('4. MEDICAL ANSWERS: shown on each person\'s line, and the download RECORDED first (who, when, which columns)', !!med && med.by === P.martin.uid && med.columns.includes('Allergies') && med.what === 'door sheet' && med.calEventId === 'ev_door', J(med));
  const L3 = await lines(M);
  ok('   Tom\'s allergy on Tom\'s own line', L3[1].includes('PEANUTS-SECRET') && !L3[0].includes('PEANUTS-SECRET'), J(L3.slice(0, 2)));

  /* ---------- 5. PDF ---------- */
  await M.evaluate(() => { window.__blob = null; const make = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blob = b; return make(b); }; HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; }; const de = HTMLAnchorElement.prototype.dispatchEvent; HTMLAnchorElement.prototype.dispatchEvent = function (e) { if (this.download) { window.__dl = this.download; return true; } return de.call(this, e); }; });
  await M.$eval('#dsPdf', b => b.click());
  const pdf = await until(() => M.evaluate(async () => window.__blob ? { name: window.__dl, type: window.__blob.type, size: window.__blob.size, text: await window.__blob.text() } : null), 25000);
  ok('5. THE SAME AS A PDF: "Barn dance (invented) <date> door sheet.pdf", with the totals and the names', pdf && /door sheet\.pdf$/.test(pdf.name) && /pdf/.test(pdf.type) && pdf.size > 2000 && /Door sheet: 6 places booked in 3 bookings/.test(pdf.text) && /Adams/.test(pdf.text), pdf && J({ name: pdf.name, type: pdf.type, size: pdf.size, has: /Door sheet: 6 places/.test(pdf.text), adams: /Adams/.test(pdf.text), start: pdf.text.slice(0, 120) }));

  /* ---------- 6. not an attendance record ---------- */
  ok('6. NOT AN ATTENDANCE RECORD: no check-ins, no attendance, the sign-ups unchanged', (await snap()) === before);

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
