/* Pay on the day (F-183): ChurchSuite's "pay on arrival" tickets.
   Events window. Invented people and events only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/pay-on-day.test.mjs"

   What it proves:
     1. the sign-up page says what to pay on the day, AS TICKETS AND PEOPLE
        CHANGE (2 adults £10, 2 children £4), and again on the thank-you
     2. "my place" says what is owed
     3. AT THE DOOR the event's leader (not an admin) sees "£10.00 to pay"
        ONCE for the booking, not once per person, marks it paid by card,
        and it reads "Paid £10.00"; "Not paid after all" puts it back
     4. "my place" then says Paid £10.00
     5. events-admin shows each booking's amount and the event's totals:
        paid, and still to pay; a waiting-list place owes nothing
     6. a free event shows no amount anywhere */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-payday-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
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

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  lee:    { email: 'lee.leader@example.invalid', name: 'Lee Leader', mid: 'm_lee', teams: ['Welcome'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
const EV = (title, extra) => ({ title, description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 2 * 3600e3)), endUtc: start.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'room', siteId: 'site_t', roomIds: ['room_hall'] }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 20,
  allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_t', name: 'Test Hall', kind: 'room', active: true, order: 1 });
  await setDoc(doc(db, 'calEvents', 'ev_tea'), EV('Cream tea (invented)'));
  await setDoc(doc(db, 'calEvents', 'ev_tea', 'ticketTypes', 'tt_adult'), { name: 'Adult', price: 5, capacity: 0, order: 1 });
  await setDoc(doc(db, 'calEvents', 'ev_tea', 'ticketTypes', 'tt_child'), { name: 'Child', price: 2, capacity: 0, order: 2 });
  await setDoc(doc(db, 'capacity', 'ev_tea'), { calEventId: 'ev_tea', taken: 1, capacity: 20 });
  await setDoc(doc(db, 'eventLeaders', 'ev_tea'), { leaders: [], leaderUids: [P.lee.uid], siteId: 'site_t', ratioAll: 8, ratioUnder8: 4, requireChecks: false, dbsYears: 3, trainingYears: 3 });
  /* Someone already booked and not yet paid; someone on the waiting list. */
  const SU = (name, extra) => ({ calEventId: 'ev_tea', personKind: 'contacts', personId: 'c_' + name.slice(0, 3), name, email: name.slice(0, 3).toLowerCase() + '@example.invalid', phone: '',
    attendees: [{ name }], answers: {}, places: 1, ticketTypeId: 'tt_adult', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: '2026-10-01T10:00:00Z', ...(extra || {}) });
  await setDoc(doc(db, 'signups', 'key_una_' + 'u'.repeat(24)), SU('Una Unpaid (invented)'));
  await setDoc(doc(db, 'signups', 'key_wes_' + 'w'.repeat(24)), SU('Wes Waiting (invented)', { status: 'waiting', createdAt: '2026-10-02T10:00:00Z' }));
  /* A free event. */
  await setDoc(doc(db, 'calEvents', 'ev_free'), EV('Free coffee morning (invented)'));
  await setDoc(doc(db, 'calEvents', 'ev_free', 'ticketTypes', 'tt_free'), { name: 'Standard', price: 0, capacity: 0, order: 1 });
  await setDoc(doc(db, 'capacity', 'ev_free'), { calEventId: 'ev_free', taken: 0, capacity: 20 });
});
const get = async (c, id) => { let out = null; await env.withSecurityRulesDisabled(async (x) => { const s = await getDoc(doc(x.firestore(), c, id)); out = s.exists() ? s.data() : null; }); return out; };

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));

try {
  /* ---------- 1. the sign-up page ---------- */
  const G = await browser('guest', 390);
  await G.goto(URLB + 'signup.html?event=ev_tea', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#nm');
  await G.type('#nm', 'Pat Payer (invented)');
  await G.type('#em', 'pat.payer@example.invalid');
  await G.type('#att0', 'Pat Payer (invented)');
  await G.$eval('#addAtt', b => b.click());
  await G.waitForSelector('#att1');
  await G.type('#att1', 'Sam Payer (invented)');
  const due = () => G.$eval('#due', e => e.textContent);
  ok('1. SIGN-UP: "To pay on the day: £10.00" for 2 adults at £5', !!(await until(async () => /To pay on the day: £10\.00/.test(await due()))), await due());
  await G.$eval('#tt', s => { s.value = 'tt_child'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  ok('   CHANGES WITH THE TICKET: 2 children at £2 = £4.00', /£4\.00/.test(await due()), await due());
  await G.$eval('#tt', s => { s.value = 'tt_adult'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await G.screenshot({ path: path.join(HERE, 'payday-signup-390.png'), fullPage: true });
  await sleep(2700);
  await G.$eval('#go', b => b.click());
  await G.waitForFunction(() => /You are signed up/.test(document.body.innerText), { timeout: 15000 });
  ok('   and on the thank-you: £10.00 to pay on the day', /To pay on the day: £10\.00/.test(await text(G, '#dueDone')));
  let KEY = '';
  await env.withSecurityRulesDisabled(async (c) => { const s = await getDocs(query(collection(c.firestore(), 'signups'), where('email', '==', 'pat.payer@example.invalid'))); KEY = s.docs[0] ? s.docs[0].id : ''; });
  ok('   the booking is saved, for 2 adults', !!KEY && (await get('signups', KEY)).places === 2 && (await get('signups', KEY)).ticketTypeId === 'tt_adult');

  /* ---------- 2. my place ---------- */
  await G.goto(URLB + 'my-signup.html?key=' + KEY, { waitUntil: 'networkidle2' });
  await until(() => G.$('#due'));
  ok('2. MY PLACE: "To pay on the day £10.00"', /To pay on the day £10\.00/.test(await text(G, '#due')));

  /* ---------- 3. at the door: the event's leader ---------- */
  const L = await browser('lee', 390);
  await L.goto(URLB + 'checkin.html?event=ev_tea', { waitUntil: 'networkidle2' });
  const flag = await until(() => L.$('[data-pay="' + KEY + '"]'));
  if (!flag) console.log('DOOR SHOWS: ' + (await text(L)).slice(0, 400));
  ok('3. AT THE DOOR, the leader (not an admin) sees "£10.00 to pay"', !!flag && /£10\.00 to pay/.test(await L.$eval('[data-pay="' + KEY + '"]', b => b.textContent)));
  ok('   ONCE for the booking, not once for each person', (await L.$$('[data-pay="' + KEY + '"]')).length === 1 && (await L.$$('[data-row]')).length >= 3);
  ok('   the waiting-list place is not at the door at all', !/Wes Waiting/.test(await text(L, '#people')));
  await L.$eval('[data-pay="' + KEY + '"]', b => b.click());
  await L.waitForSelector('#payGo');
  await L.$eval('input[name="payHow"][value="card"]', r => r.click());
  await L.screenshot({ path: path.join(HERE, 'payday-door-390.png') });
  await L.$eval('#payGo', b => b.click());
  const paid = await until(async () => { const p = await get('signupPayments', KEY); return p && p.paid ? p : null; });
  ok('   PAID BY CARD: saved as paid, £10, card, by the leader', paid && paid.amount === 10 && paid.method === 'card' && paid.by === P.lee.uid && paid.calEventId === 'ev_tea', J(paid));
  ok('   and the door reads "Paid £10.00"', !!(await until(async () => /Paid £10\.00/.test(await L.$eval('[data-pay="' + KEY + '"]', b => b.textContent)))));
  await L.$eval('[data-pay="' + KEY + '"]', b => b.click());
  await L.waitForSelector('#payNo');
  await L.$eval('#payNo', b => b.click());
  ok('   "Not paid after all" puts it back', !!(await until(async () => { const p = await get('signupPayments', KEY); return p && p.paid === false; })) &&
    !!(await until(async () => /£10\.00 to pay/.test(await L.$eval('[data-pay="' + KEY + '"]', b => b.textContent)))));
  await L.$eval('[data-pay="' + KEY + '"]', b => b.click());
  await L.waitForSelector('#payGo');
  await L.$eval('#payGo', b => b.click());
  await until(async () => { const p = await get('signupPayments', KEY); return p && p.paid ? p : null; });

  /* ---------- 4. my place, paid ---------- */
  await G.goto(URLB + 'my-signup.html?key=' + KEY, { waitUntil: 'networkidle2' });
  await until(() => G.$('#paid'));
  ok('4. MY PLACE NOW SAYS "Paid £10.00"', /Paid £10\.00/.test(await text(G, '#paid')) && !(await G.$('#due')));

  /* ---------- 5. events-admin ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="ev_tea"]'));
  await M.$eval('.open[data-id="ev_tea"]', e => e.click());
  await until(() => M.$('[data-tab="people"]'));
  await M.$eval('[data-tab="people"]', e => e.click());
  await until(() => M.$('#payTotals'));
  ok('5. EVENTS: the totals, paid and still to pay', /£10\.00 paid, £5\.00 still to pay/.test(await text(M, '#payTotals')), await text(M, '#payTotals'));
  ok('   each booking: Paid £10.00, and £5.00 owed', /Paid £10\.00/.test(await M.$eval('[data-pay="' + KEY + '"]', e => e.textContent)) &&
    /£5\.00/.test(await M.$eval('[data-pay="key_una_' + 'u'.repeat(24) + '"]', e => e.textContent)));
  ok('   the waiting-list place owes nothing', (await M.$eval('[data-pay="key_wes_' + 'w'.repeat(24) + '"]', e => e.textContent)) === '');
  await M.screenshot({ path: path.join(HERE, 'payday-admin.png'), fullPage: true });

  /* ---------- 6. a free event ---------- */
  await G.goto(URLB + 'signup.html?event=ev_free', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#nm');
  await G.type('#att0', 'Fred Free (invented)');
  await sleep(300);
  ok('6. A FREE EVENT: no amount anywhere', (await G.$eval('#due', e => e.textContent)) === '' && !/To pay/.test(await text(G)));

  ok('no page errors', errors.length === 0, errors.join(' | '));
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
