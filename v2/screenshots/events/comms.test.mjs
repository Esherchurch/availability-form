/* Every email the church sent, and the ones that failed (R8). Events
   window. Invented people only, events emulators only (with the hub's
   functions), network guard. Nothing is emailed: the rows are invented.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/comms.test.mjs"

   What it proves:
     1. an admin sees every email in the time chosen, the server's and the
        pages' together, newest first, in plain words ("Sign-up
        confirmation", "Event cancelled: Quiz night"), with who to and the
        result
     2. "Only the ones that failed": the failures, with why
     3. the server hands over THE OUTLINE ONLY: never the email, its
        attachments or the private links in it
     4. not an admin: refused, by the server and the page
     5. the download says the same */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-comms-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);

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
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  ann:    { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
const ago = (days, h) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(h || 10, 0, 0, 0); return d.toISOString(); };
const SECRETLINK = 'https://example.invalid/hub/my-signup.html?key=PRIVATEKEY0000000000000000000000';
await db.collection('emailOutbox').add({ to: ['pat@example.invalid', 'sam@example.invalid'], subject: 'You are signed up: Ceilidh', html: '<a href="' + SECRETLINK + '">View</a>', attachments: [{ filename: 'event.ics' }], source: 'public-mail', kind: 'signup', ok: true, error: '', stubbed: false, at: ago(2) });
await db.collection('emailOutbox').add({ to: ['hirer@example.invalid'], subject: 'Your booking is waiting for approval: Hall', html: '<p>x</p>', source: 'public-mail', kind: 'booking waiting', ok: false, error: 'HTTP 500', stubbed: false, at: ago(5) });
await db.collection('emailOutbox').add({ to: [], subject: 'Someone new said hello', html: '<p>x</p>', source: 'public-mail', kind: 'new here', ok: false, error: 'no address', stubbed: false, at: ago(1) });
await db.collection('emailOutbox').add({ to: ['old@example.invalid'], subject: 'OLD: long ago', html: '<p>x</p>', source: 'public-mail', kind: 'signup', ok: true, error: '', at: ago(60) });
await db.collection('calEvents').doc('ev_quiz').set({ title: 'Quiz night (invented)', audience: ['public', 'members'], visibility: 'public', status: 'cancelled', startUtc: Date.now() + 864e5 });
await db.collection('commsLog').add({ calEventId: 'ev_quiz', kind: 'cancellation', subject: 'Cancelled: Quiz night', to: 12, failed: 0, error: '', stubbed: false, by: 'Karen Office', at: ago(3) });
await db.collection('commsLog').add({ calEventId: 'ev_quiz', kind: 'email', subject: 'A note about the quiz', to: 4, failed: 4, error: 'quota exceeded', stubbed: false, by: 'Karen Office', at: ago(4) });

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));

try {
  const M = await browser('martin');
  await M.goto(URLB + 'comms.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-row]'));
  const rows = await M.$$eval('[data-row]', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok('1. EVERY EMAIL IN THE LAST 30 DAYS: the server\'s and the pages\' together, newest first', rows.length === 5 && /Someone new said hello/.test(rows[0]) && /Sign-up confirmation/.test(rows[1]) && /Event cancelled: Quiz night/.test(rows[2]) && !rows.some(r => /OLD: long ago/.test(r)), J(rows));
  ok('   in plain words, with who to, who sent it and the result', /Sign-up confirmation You are signed up: Ceilidh pat@example\.invalid and 1 more The hub Sent/.test(rows[1]) && /12 people Karen Office Sent/.test(rows[2]), J(rows.slice(1, 3)));
  ok('   the summary: 5 emails, 3 failed', /^5 emails to \d+ people in the last 30 days\. 3 failed\./.test(await text(M, '#sum')), await text(M, '#sum'));
  await M.screenshot({ path: path.join(HERE, 'comms.png'), fullPage: true });
  await M.$eval('#failed', c => c.click());
  const bad = await M.$$eval('[data-row]', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok('2. ONLY THE ONES THAT FAILED, with why', bad.length === 3 && bad.every(r => /Failed/.test(r)) && bad.some(r => /no address/.test(r)) && bad.some(r => /HTTP 500/.test(r)) && bad.some(r => /quota exceeded/.test(r)), J(bad));
  const raw = await M.evaluate(() => { const d = new Date(), f = new Date(); f.setDate(f.getDate() - 30); const y = (x) => x.toISOString().slice(0, 10); return EGBCAuth.call('commsReport', { from: y(f), to: y(d) }); });
  ok('3. THE OUTLINE ONLY: no email, no attachments, no private link', raw.rows.length === 3 && !J(raw).includes('PRIVATEKEY') && !J(raw).includes('event.ics') && raw.rows.every(r => !('html' in r) && !('attachments' in r)), J(raw).slice(0, 300));
  await M.evaluate(() => { const make = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blob = b; return make(b); }; HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; }; });
  await M.$eval('#csv', b => b.click());
  const csv = await until(() => M.evaluate(async () => window.__blob ? { name: window.__dl, text: await window.__blob.text() } : null));
  const lines = csv ? csv.text.replace(/^\ufeff/, '').split('\r\n') : [];
  ok('5. THE DOWNLOAD says the same: the 3 that failed, named "Email errors"', csv && csv.name === 'Email errors.csv' && lines[0] === 'When,What,Subject,To,People,Sent by,Result,Error' && lines.length === 4 && lines.slice(1).every(l => /,failed,/.test(l)), J(lines));

  const A = await browser('ann');
  const refused = await A.evaluate(() => EGBCAuth.call('commsReport', { from: '2026-01-01', to: '2026-12-31' }).then(() => 'given', e => e.message));
  ok('4. NOT AN ADMIN: the server refuses', /for master admins/.test(refused), refused);
  await A.goto(URLB + 'comms.html', { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok('   and the page says it is for master admins', /This page is for master admins/.test(await text(A)));

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
