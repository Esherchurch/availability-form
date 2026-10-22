/* Several events at once (F-186; ChurchSuite's batch actions on the events
   list). Events window. Invented people and events only, events emulators
   only, network guard, no email leaves the machine (the outbox is read).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/bulk.test.mjs"

   What it proves:
     1. tick events in the list: "2 chosen", and the actions appear
     2. CHANGE: category and who can come, on exactly the ticked ones; "who
        can come" also changes who can READ it (its audience), as editing one
        does; each records what changed
     3. CANCEL: the event is cancelled and EVERYONE SIGNED UP IS TOLD, as
        cancelling one does
     4. DOWNLOAD: a spreadsheet of the ticked ones, in words
     5. DELETE: gone, and each one recorded in Deleted events first
     6. choose all; at 375px nothing scrolls sideways */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-bulk-'));
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

const P = { martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const day = (n, h) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };
const EV = (title, when, extra) => ({ title, description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 2 * 3600e3)), endUtc: when.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, capacity: 0, image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'calEvents', 'ev_a'), EV('Alpha supper (invented)', day(2, 18)));
  await setDoc(doc(db, 'calEvents', 'ev_b'), EV('Bravo quiz (invented)', day(3, 19), { signupOn: true, capacity: 20 }));
  await setDoc(doc(db, 'calEvents', 'ev_c'), EV('Charlie walk (invented)', day(4, 10), { category: 'community' }));
  await setDoc(doc(db, 'calEvents', 'ev_d'), EV('Delta, "the big one" (invented)', day(5, 10)));
  await setDoc(doc(db, 'capacity', 'ev_b'), { calEventId: 'ev_b', taken: 1, capacity: 20 });
  await setDoc(doc(db, 'signups', 'key_quiz_' + 'q'.repeat(23)), { calEventId: 'ev_b', personKind: 'contacts', personId: 'c_q', name: 'Quinn Quizzer (invented)', email: 'quinn@example.invalid', phone: '',
    attendees: [{ name: 'Quinn Quizzer (invented)' }], answers: {}, places: 1, ticketTypeId: '', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: '2026-10-01T10:00:00Z' });
});
const get = async (c, id) => { let out = null; await env.withSecurityRulesDisabled(async (x) => { const s = await getDoc(doc(x.firestore(), c, id)); out = s.exists() ? s.data() : null; }); return out; };
const list = async (c, f, v) => { let out = []; await env.withSecurityRulesDisabled(async (x) => { const q = f ? query(collection(x.firestore(), c), where(f, '==', v)) : collection(x.firestore(), c); out = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() })); }); return out; };

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
const tick = (p, id) => p.$eval('.pick[data-pick="' + id + '"]', c => { c.checked = true; c.dispatchEvent(new Event('change')); });
const open = async (p) => { await p.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' }); await until(() => p.$('.pick[data-pick="ev_a"]')); };

try {
  const M = await browser('martin');
  await open(M);
  /* ---------- 1. tick ---------- */
  ok('1. no actions until something is ticked', (await M.$eval('#bulk', b => b.innerHTML)) === '');
  await tick(M, 'ev_a'); await tick(M, 'ev_b');
  ok('   ticked two: "2 chosen", with the actions', /2 chosen/.test(await text(M, '#bulkCount')) && !!(await M.$('#bApply')) && !!(await M.$('#bDel')) && !!(await M.$('#bCsv')));

  /* ---------- 2. change category and who can come ---------- */
  await M.select('#bCat', 'music');
  await M.select('#bWho', 'churchMembers');
  await M.$eval('#bApply', b => b.click());
  const a = await until(async () => { const x = await get('calEvents', 'ev_a'); return x.category === 'music' ? x : null; });
  const b2 = await get('calEvents', 'ev_b'), c0 = await get('calEvents', 'ev_c');
  ok('2. CHANGED, the two ticked: category Music, church members only', a && a.visibility === 'churchMembers' && b2.category === 'music' && b2.visibility === 'churchMembers', J([a, b2].map(x => x && [x.category, x.visibility])));
  ok('   AND WHO CAN READ THEM: church members only, as editing one does', J(a.audience) === '["churchMembers"]' && J(b2.audience) === '["churchMembers"]', J([a.audience, b2.audience]));
  ok('   the others untouched', c0.category === 'community' && c0.visibility === 'public');
  ok('   each records what changed', !!(await until(async () => (await list('eventChanges')).filter(x => /Changed with others/.test(x.what)).length === 2)));

  /* ---------- 3. cancel: everyone signed up is told ---------- */
  await open(M);
  await tick(M, 'ev_b');
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await M.select('#bStatus', 'cancelled');
  await M.$eval('#bApply', b => b.click());
  const bc = await until(async () => { const x = await get('calEvents', 'ev_b'); return x.status === 'cancelled' ? x : null; });
  const mail = await until(() => M.evaluate(() => (window.__egbcOutbox || []).map(e => e.payload).find(p => p && /^Cancelled: Bravo quiz/.test(p.subject))));
  ok('3. CANCELLED, and EVERYONE SIGNED UP IS TOLD, as cancelling one does', !!bc && mail && J(mail.to) === '["quinn@example.invalid"]', J(mail));

  /* ---------- 4. download ---------- */
  await open(M);
  await tick(M, 'ev_c'); await tick(M, 'ev_d');
  await M.evaluate(() => {
    const make = URL.createObjectURL;
    URL.createObjectURL = (b) => { window.__blob = b; return make(b); };
    HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; };
  });
  await M.$eval('#bCsv', b => b.click());
  const csv = await M.evaluate(async () => ({ name: window.__dl, text: window.__blob ? await window.__blob.text() : '' }));
  const rows = csv.text.replace(/^\ufeff/, '').split('\r\n');
  ok('4. DOWNLOAD: a spreadsheet of the two ticked, in words', csv.name === 'Events.csv' && rows.length === 3 && rows[0].startsWith('Title,Starts,Ends,Category,Status,Who can come') &&
    /^Charlie walk \(invented\),.*,Community,confirmed,Everyone,Online/.test(rows[1]) && rows[2].startsWith('"Delta, ""the big one"" (invented)"'), J(rows));

  /* ---------- 5. delete ---------- */
  await open(M);
  await tick(M, 'ev_c'); await tick(M, 'ev_d');
  await M.$eval('#bDel', b => b.click());
  await until(async () => !(await get('calEvents', 'ev_c')) && !(await get('calEvents', 'ev_d')));
  const gone = await list('calEventsDeleted');
  ok('5. DELETED, and each one recorded in Deleted events first', !(await get('calEvents', 'ev_c')) && !(await get('calEvents', 'ev_d')) && gone.length === 2 &&
    gone.every(g => g.count === 1 && g.byUid === P.martin.uid) && gone.some(g => g.title === 'Charlie walk (invented)'), J(gone));
  ok('   the others are still there', !!(await get('calEvents', 'ev_a')) && !!(await get('calEvents', 'ev_b')));

  /* ---------- 6. choose all; at 375px ---------- */
  const S = await browser('martin', 375);
  await open(S);
  await S.$eval('#pickAll', c => { c.checked = true; c.dispatchEvent(new Event('change')); });
  await until(() => S.$('#bulkCount'));
  const n = await S.$$eval('.pick', cs => cs.length);
  ok('6. CHOOSE ALL ticks every one shown', /^\d+ chosen$/.test(await text(S, '#bulkCount')) && (await text(S, '#bulkCount')) === n + ' chosen' && (await S.$$eval('.pick', cs => cs.every(c => c.checked))));
  ok('   at 375px nothing scrolls sideways', (await S.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await S.screenshot({ path: path.join(HERE, 'bulk-375.png') });

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
