/* THE YOUTH CHARTER, START TO FINISH (the going-live test, Stage 3). Events
   window. Invented people only, events emulators only, locked rules,
   network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/youth-charter.test.mjs"

   What it proves:
     1. a youth volunteer reads the charter; someone on no team is told the
        page isn't for them
     2. there is no password in the page any more
     3. the hidden gesture opens editing only for the youth team's admins (and
        master admins); a volunteer is told plainly it is the admins'
     4. an admin changes the title and the words: saved, and the volunteer sees
        them
     5. the database refuses a volunteer's write whatever the page does */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-yc-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

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
  ada:  { email: 'ada.youthadmin@example.invalid', name: 'Ada Youth Admin (invented)', mid: 'm_ada', teams: ['Youth Worship'], adminFor: ['Youth Worship'] },
  vic:  { email: 'vic.youth@example.invalid', name: 'Vic Volunteer (invented)', mid: 'm_vic', teams: ['Youth Worship'], adminFor: [] },
  eve:  { email: 'eve.everyone@example.invalid', name: 'Eve Everyone (invented)', mid: 'm_eve', teams: [], adminFor: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const x of Object.values(P)) {
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: false, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: "St Aidan's with St Hild, Testbury (synthetic)", enquiryEmail: 'office@example.invalid' });
  /* the youth job's team (team jobs), so the guard knows which teams are the youth groups */
  await setDoc(doc(db, 'teams', 'Youth Worship'), { name: 'Youth Worship', label: 'Youth', rota: true, order: 1, under18: true });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };

const errors = [], BROWSERS = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); BROWSERS.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 1280, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const open = async (p) => { await p.goto(URLB + 'Youthcharter.html', { waitUntil: 'networkidle2' }); await until(async () => (await p.$('#egbc-blocked-card')) || /\S/.test(await text(p, '#content-display'))); };
/* the hidden gesture: three quick clicks on the right of the top bar */
const gesture = (p) => p.evaluate(() => { const b = document.getElementById('admin-bar'), r = b.getBoundingClientRect();
  for (let i = 0; i < 3; i++) b.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.right - 5, clientY: r.top + r.height / 2 })); });
const toastText = (p) => until(() => p.evaluate(() => { const t = document.getElementById('toast'); return t && t.textContent && getComputedStyle(t).display !== 'none' ? t.textContent : ''; }), 5000);

try {
  ok('2. NO PASSWORD IN THE PAGE', !/ADMIN_PW|Surreykt/.test(fs.readFileSync(path.join(V2, 'Youthcharter.html'), 'utf8')));
  const V = await as('vic');
  await open(V);
  ok('1. A YOUTH VOLUNTEER reads the charter', !(await V.$('#egbc-blocked-card')) && /\S/.test(await text(V, '#content-display')), (await text(V)).slice(0, 200));
  const E = await as('eve');
  await open(E);
  ok('   someone on no team is told the page isn\u2019t for them', !!(await E.$('#egbc-blocked-card')));
  await gesture(V);
  const vt = await toastText(V);
  ok('3. THE GESTURE, AS A VOLUNTEER: no editing, and told it is the admins\u2019', !(await V.evaluate(() => document.body.classList.contains('admin-mode'))) && /youth team.s admins/.test(vt), vt);
  const vw = await V.evaluate(() => EGBCAuth.db.collection('pageContent').doc(PAGE_ID).set({ title: 'Changed by a volunteer' }, { merge: true }).then(() => 'written', (e) => e.code));
  ok('5. THE DATABASE refuses a volunteer\u2019s write', /permission/.test(vw), vw);

  const A = await as('ada');
  await open(A);
  await gesture(A);
  ok('3. THE GESTURE, AS THE YOUTH TEAM\u2019S ADMIN: editing opens', !!(await until(() => A.evaluate(() => document.body.classList.contains('admin-mode')))));
  await A.evaluate(() => { document.getElementById('page-title-display').textContent = 'Our youth charter (synthetic)'; document.getElementById('content-display').innerHTML = '<p>We look after each other (synthetic).</p>'; return saveAll(); });
  const id = await A.evaluate(() => PAGE_ID);
  const saved = await until(() => readDb((db) => getDoc(doc(db, 'pageContent', id)).then((s) => (s.exists() && /synthetic/.test(s.data().title || '') ? s.data() : null))));
  ok('4. THE ADMIN\u2019S CHANGES ARE SAVED', !!saved && /look after each other/.test(saved.html || ''), JSON.stringify(saved));
  await open(V);
  ok('   and the volunteer reads them', /look after each other/.test(await text(V, '#content-display')), await text(V, '#content-display'));
} catch (e) {
  ok('the run finished', false, e.stack);
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
for (const b of BROWSERS) await b.close().catch(() => {});
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
