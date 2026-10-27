/* Payments SHUT until switch-over (bcbe6d7e): what people see. Events
   window. Invented people only, events emulators only, network guard. No
   Stripe or GoCardless at all, stand-in or real: the server refuses first.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/payments-shut.test.mjs"

   The live site is shut by payments-gate.js (PAYMENTS_LIVE = false). The
   emulator never is, so this test shuts it the emulator-only way
   (paymentSecrets/config.shutForTest), which the live site never reads.

   What it proves:
     1. the Payments page: "Check and save" says "Online payments open when
        the church switches over." and nothing is kept
     2. the pay buttons straight after signing up (card and bank) say it,
        and no place is held for payment
     3. the pay button on "my place" says it
     4. Give regularly says it, and no gift is started
     5. other refusals keep their own words: once the gate is open, "This
        church does not take card payments online." */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-payshut-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const WORDS = 'Online payments open when the hub goes live.';

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
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

/* ---------- invented church, shut as the live site is ---------- */
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
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid', hubUrl: URLB });
await db.collection('paymentSecrets').doc('config').set({ shutForTest: true });
/* As if a church had set both up before: the buttons show; the server says no. */
await db.collection('paymentSettings').doc('public').set({ card: true, bank: true, giving: true });
const start = new Date(); start.setDate(start.getDate() + 5); start.setHours(18, 0, 0, 0);
await db.collection('calEvents').doc('ev_pay').set({ title: 'Ceilidh (invented)', description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 3 * 3600e3)), endUtc: start.getTime() + 3 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 20, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x' });
await db.collection('calEvents').doc('ev_pay').collection('ticketTypes').doc('tt_pay').set({ name: 'Adult', price: 6, capacity: 0, order: 1, payBy: ['card', 'bank'] });
await db.collection('capacity').doc('ev_pay').set({ calEventId: 'ev_pay', taken: 0, capacity: 20 });

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
const data = async (c, id) => { const s = await db.collection(c).doc(id).get(); return s.exists ? s.data() : null; };
const said = (p, sel) => until(async () => { const t = (await p.$eval(sel, e => e.textContent).catch(() => '')).trim(); return t && !/Checking|Saving|Opening/.test(t) ? t : null; });
const count = async (c) => (await db.collection(c).get()).size;

try {
  /* ---------- 1. the Payments page ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#saveKey'));
  await M.$eval('#stripeKey', e => { e.value = 'rk_test_' + 'Q'.repeat(24); });
  await M.$eval('#saveKey', b => b.click());
  const k = await said(M, '#keyMsg');
  ok('1. THE PAYMENTS PAGE: "Check and save" says "' + WORDS + '"', k === WORDS, k);
  ok('   and nothing is kept', !(await data('paymentSecrets', 'stripe')));
  await M.screenshot({ path: path.join(HERE, 'payments-shut.png'), fullPage: true });

  /* ---------- 2. the pay buttons straight after signing up ---------- */
  const G = await browser('guest', 390);
  await G.goto(URLB + 'signup.html?event=ev_pay', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#nm');
  await G.type('#nm', 'Pat Payer (invented)'); await G.type('#em', 'pat.payer@example.invalid'); await G.type('#att0', 'Pat Payer (invented)');
  await sleep(2700);
  await G.$eval('#go', b => b.click());
  await until(() => G.$('#payCard'));
  await G.$eval('#payCard', b => b.click());
  const c1 = await said(G, '#payMsg');
  ok('2. PAY BY CARD after signing up says it', c1 === WORDS, c1);
  await G.$eval('#payMsg', e => { e.textContent = ''; });
  await G.$eval('#payBank', b => { b.disabled = false; b.click(); });
  const c2 = await said(G, '#payMsg');
  ok('   PAY BY BANK says it too', c2 === WORDS, c2);
  await G.screenshot({ path: path.join(HERE, 'payments-shut-signup-390.png'), fullPage: true });
  ok('   and no place is held for payment', (await count('signupPayments')) === 0 && /Online payments open/.test(await text(G)));
  let KEY = ''; (await db.collection('signups').where('email', '==', 'pat.payer@example.invalid').get()).docs.forEach(d => { KEY = d.id; });

  /* ---------- 3. "my place" ---------- */
  await G.goto(URLB + 'my-signup.html?key=' + KEY, { waitUntil: 'networkidle2' });
  await until(() => G.$('#payNow'));
  await G.$eval('#payNow', b => b.click());
  const c3 = await said(G, '#payMsg');
  ok('3. THE PAY BUTTON ON "MY PLACE" says it', c3 === WORDS, c3);

  /* ---------- 4. Give regularly ---------- */
  const D = await browser('giver', 390);
  await D.goto(URLB + 'give-regularly.html', { waitUntil: 'networkidle2' });
  await until(() => D.$('#go'));
  await D.$eval('#amt', e => { e.value = '20'; }); await D.select('#often', 'monthly'); await D.select('#day', '1');
  await D.$eval('#nm', e => { e.value = 'Gill Giver (invented)'; }); await D.$eval('#em', e => { e.value = 'gill.giver@example.invalid'; });
  await D.$eval('#go', b => b.click());
  const c4 = await said(D, '#msg');
  ok('4. GIVE REGULARLY says it', c4 === WORDS, c4);
  ok('   and no gift is started', (await count('regularGifts')) === 0);

  /* ---------- 5. other refusals keep their own words ---------- */
  await db.collection('paymentSecrets').doc('config').set({ shutForTest: false });
  await G.goto(URLB + 'my-signup.html?key=' + KEY, { waitUntil: 'networkidle2' });
  await until(() => G.$('#payNow'));
  await G.$eval('#payNow', b => b.click());
  const c5 = await said(G, '#payMsg');
  ok('5. OTHER REFUSALS KEEP THEIR OWN WORDS: gate open, no Stripe key: "This church does not take card payments online."', /This church does not take card payments online/.test(c5) && !/switches over|goes live/.test(c5), c5);

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
