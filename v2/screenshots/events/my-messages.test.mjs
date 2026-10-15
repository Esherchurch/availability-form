/* "My messages" (R6; F-206): what the church has emailed ME. Events window.
   Invented people only, events emulators only (with the hub's functions),
   network guard. Nothing is emailed: the rows are invented.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/my-messages.test.mjs"

   What it proves:
     1. Mary sees the emails sent to HER, newest first: when, what kind,
        subject; one that could not be sent says so
     2. her address in other capitals still counts as hers
     3. NEVER ANYONE ELSE'S: Paul's email is not on her list, and his list
        has only his own (and the one sent to both of them)
     4. THE OUTLINE ONLY: no email, no private link, no other recipients
     5. asking for someone else's changes nothing; signed out: refused
     6. older than a year: not listed
     7. my place links to it when signed in; not when signed out
     8. the app's helper (EGBCEventsHome.myMessages) gives the same list */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-mymsgs-'));
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
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();

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
const P = {
  mary: { email: 'mary.msgs@example.invalid', name: 'Mary Messages (invented)', mid: 'm_mary' },
  paul: { email: 'paul.other@example.invalid', name: 'Paul Other (invented)', mid: 'm_paul' }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: [], adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: [], adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
const OUT = (to, subject, kind, at, extra) => db.collection('emailOutbox').add({ to, subject, html: '<p>Private: <a href="https://example.invalid/my-signup.html?key=PRIVATEKEY0000000000000">link</a></p>', attachments: [{ filename: 'event.ics' }], source: 'public-mail', kind, ok: true, error: '', stubbed: false, at, ...(extra || {}) });
await OUT([P.mary.email], 'You are signed up: Ceilidh (invented)', 'signup', ago(3));
await OUT(['MARY.Msgs@Example.invalid'], 'Your booking is waiting for approval: Hall (invented)', 'booking waiting', ago(10));
await OUT([P.mary.email, P.paul.email], 'Your request to join Tuesday group (invented)', 'group ask', ago(20));
await OUT([P.paul.email], 'PAUL ONLY: You are signed up: Quiz (invented)', 'signup', ago(2));
await OUT([P.mary.email], 'Form received: Gift Aid (invented)', 'form received', ago(30), { ok: false, error: 'HTTP 500' });
await OUT([P.mary.email], 'TOO OLD: a year and more (invented)', 'signup', ago(400));

const errors = [], browsers = [];
async function browser(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const msgs = (pg) => pg.$$eval('[data-msg] b', bs => bs.map(b => b.textContent));

try {
  /* ---------- 1-2. Mary ---------- */
  const M = await browser('mary');
  await M.goto(URLB + 'my-messages.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-msg]'));
  const ml = await msgs(M);
  ok('1. MARY SEES THE EMAILS SENT TO HER, newest first', J(ml) === J(['You are signed up: Ceilidh (invented)', 'Your booking is waiting for approval: Hall (invented)', 'Your request to join Tuesday group (invented)', 'Form received: Gift Aid (invented)']), J(ml));
  ok('   with when and what kind ("Sign-up confirmation"); the failed one says it could not be sent', /Sign-up confirmation/.test(await text(M, '#list')) && /Form received.*it could not be sent/.test(await text(M, '#list')));
  ok('2. her address in other capitals (MARY.Msgs@Example) still counts as hers', ml.includes('Your booking is waiting for approval: Hall (invented)'));
  ok('6. OLDER THAN A YEAR: not listed', !/TOO OLD/.test(await text(M)));
  await M.screenshot({ path: path.join(HERE, 'my-messages-375.png'), fullPage: true });

  /* ---------- 3-5. never anyone else's ---------- */
  ok('3. NEVER ANYONE ELSE\'S: Paul\'s email is not on Mary\'s list', !/PAUL ONLY/.test(await text(M)));
  const raw = await M.evaluate(() => EGBCAuth.call('myMessages', { email: 'paul.other@example.invalid', uid: 'someone' }));
  const rs = J(raw);
  ok('4. THE OUTLINE ONLY: no email, no private link, no attachment, no list of who else it went to', !rs.includes('PRIVATEKEY') && !rs.includes('event.ics') && !rs.includes('paul.other') && raw.rows.every(r => J(Object.keys(r).sort()) === J(['at', 'ok', 'subject', 'what'])), rs.slice(0, 400));
  ok('5. ASKING FOR PAUL\'S changes nothing: still Mary\'s four', raw.rows.length === 4 && !rs.includes('PAUL ONLY'));
  const PL = await browser('paul');
  await PL.goto(URLB + 'my-messages.html', { waitUntil: 'networkidle2' });
  await until(() => PL.$('[data-msg]'));
  ok('   Paul\'s list: only his own, and the one sent to both of them', J(await msgs(PL)) === J(['PAUL ONLY: You are signed up: Quiz (invented)', 'Your request to join Tuesday group (invented)']), J(await msgs(PL)));
  const anon = await fetch('http://127.0.0.1:5102/' + PROJECT + '/europe-west2/myMessages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) }).then(r => r.json());
  ok('   signed out: refused', anon.error && /UNAUTHENTICATED/.test(anon.error.status), J(anon));

  /* ---------- 7. my place ---------- */
  /* (Made now: its own confirmation email to Mary would otherwise change the counts above.) */
  await db.collection('signups').doc('su_mary_0000000000000000000000').set({ calEventId: 'ev_x', personKind: 'addressBook', personId: 'm_mary', name: P.mary.name, email: P.mary.email, phone: '', attendees: [{ name: P.mary.name }], answers: {}, places: 1, ticketTypeId: '', status: 'confirmed', donation: 0, notes: '', memberUid: P.mary.uid, createdAt: ago(3) });
  await db.collection('calEvents').doc('ev_x').set({ title: 'Ceilidh (invented)', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [], startLocal: '2026-12-01T19:00', startUtc: Date.parse('2026-12-01T19:00:00Z'), endLocal: '2026-12-01T22:00', endUtc: Date.parse('2026-12-01T22:00:00Z'), allDay: false, location: { kind: 'online' }, signupOn: true, allowSelfCancel: true, createdBy: 'x', updatedAt: 'x' });
  await M.goto(URLB + 'my-signup.html?key=su_mary_0000000000000000000000', { waitUntil: 'networkidle2' });
  await until(() => M.$('#msgsLink'));
  ok('7. MY PLACE LINKS TO IT when signed in', (await M.$eval('#msgsLink', a => a.getAttribute('href'))) === 'my-messages.html');
  const G = await browser('guest');
  await G.goto(URLB + 'my-signup.html?key=su_mary_0000000000000000000000', { waitUntil: 'networkidle2' });
  await sleep(2000);
  ok('   not when signed out', !(await G.$('#msgsLink')));

  /* ---------- 8. the app's helper ---------- */
  await M.goto(URLB + 'my-messages.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-msg]'));
  const h = await M.evaluate(() => EGBCEventsHome.myMessages().then(r => r.map(x => x.subject)));
  const fresh = await msgs(M);
  ok('8. THE APP\'S HELPER gives the same list (for the Me tab to draw)', J(h) === J(fresh) && h.length >= 4, J([h, fresh]));

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
