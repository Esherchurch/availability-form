/* BUILDING COMPLIANCE: NOTHING PRIVATE IS SAVED BEFORE SWITCH-OVER (F-235).
   Events window. Invented people only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/compliance-gate.test.mjs"

   The reviewing window, 19 Oct: until the locked rules are on, the live
   database is readable signed out, and a PEEP is disability information.
   On the live-like setup (churchSettings/launch.rulesLocked NOT true):
     1. signed out: no evacuation plan form at all
     2. signed in: peep.html has nothing to type into; risk.html no report
        upload, no hazard, no snapshot, no visitors' plan to write;
        compliance.html no certificate upload; building.html no check
        record - each page says why
     3. and nothing was written: no peeps, no reports, no hazards, no
        records, nothing in Storage under compliance/
     4. with the add-on OFF, all four pages show only "not switched on"
     5. once rulesLocked is true, the plan form is there (the gate opens) */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { loadEngine, loadStore, loadTemplates } from './compliance-engine.mjs';
import { seedTemplates, FIXTURES } from '../../tools/seed-compliance.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-cmpg-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const E = loadEngine(), S = loadStore(), T = loadTemplates();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }

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
  olive: { name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Church office'] },
  val:   { name: 'Val Caretaker (invented)', mid: 'm_val', teams: ['Maintenance'] },
  pat:   { name: 'Pat Person (invented)', mid: 'm_pat', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.cmpg@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
for (const name of ['Church office', 'Maintenance']) await db.collection('teams').doc(name).set({ name, label: name, rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church' });
await seedTemplates(db, T, true);
const s0 = FIXTURES.sites[1];
await db.collection('sites').doc(s0.id).set({ name: s0.name, active: true, order: 1 });
for (const [id, name, kind] of s0.rooms) await db.collection('rooms').doc(id).set({ name, siteId: s0.id, active: true, kind: 'room' });
await S.applyProfile(db, E, s0.id, s0.profile, T.TEMPLATES, { uid: 'seed', name: 'Setup' });
await db.collection('buildingChecks').doc('cmp_hall__water-temps').update({ responsibleIds: ['m_val'] });
/* THE LIVE-LIKE SETUP: the add-on on, the locked rules NOT on yet. */
await db.collection('churchSettings').doc('features').set({ buildingCompliance: true });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: false });

const errors = [], browsers = [];
async function browser(whoK) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, (whoK || 'out') + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, whoK || 'signed-out');
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push((whoK || 'out') + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (whoK) { await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[whoK].email); await sleep(500); }
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const inputs = (pg) => pg.$$eval('#wrap textarea, #wrap input[type=file], #wrap input[type=text], .sheet textarea, .sheet input[type=file]', es => es.length);
const count = async (c) => (await db.collection(c).get()).size;

try {
  /* ---------- 1. signed out ---------- */
  const out = await browser('');
  await out.goto(URLB + 'peep.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  ok('1. SIGNED OUT: no evacuation plan form, nothing to type into', !(await out.$('#needs')) && !(await out.$('#save')) && (await inputs(out)) === 0, await text(out));
  await out.browser().close();

  /* ---------- 2. signed in, rules not yet locked ---------- */
  const pat = await browser('pat');
  await pat.goto(URLB + 'peep.html', { waitUntil: 'networkidle2' });
  await until(() => pat.$('#held'));
  ok('2. PEEP.HTML: says why, and there is nothing to type into', /not yet private/.test(await text(pat, '#held')) && /tell a steward or the church office in person/.test(await text(pat, '#held')) && !(await pat.$('#needs')) && !(await pat.$('#save')) && (await inputs(pat)) === 0, await text(pat));
  await pat.screenshot({ path: path.join(HERE, 'peep-held-375.png') });
  await pat.browser().close();

  const olive = await browser('olive');
  await olive.goto(URLB + 'risk.html?site=cmp_hall', { waitUntil: 'networkidle2' });
  await until(() => olive.$('#held'));
  ok('   RISK.HTML: says why; no hazards to add', /not yet private/.test(await text(olive, '#held')) && !(await olive.$('#addStarter')) && !(await olive.$('#addHz')));
  await olive.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'reports').click());
  ok('   no report to upload', !(await olive.$('#rFile')) && !(await olive.$('#rGo')));
  await olive.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'snapshots').click());
  ok('   no snapshot to take', !(await olive.$('#snGo')));
  await olive.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'geep').click());
  ok('   no visitors\u2019 plan to write', !(await olive.$('#gGo')) && (await olive.$$eval('#geep textarea', es => es.length)) === 0);
  await olive.goto(URLB + 'compliance.html?site=cmp_hall', { waitUntil: 'networkidle2' });
  await until(() => olive.$('[data-check="cmp_hall__water-temps"]'));
  await tap(olive, '[data-check="cmp_hall__water-temps"]'); await until(() => olive.$('.sheet'));
  ok('   COMPLIANCE.HTML: no certificate to upload, and it says why', !(await olive.$('#dFile')) && /not yet private/.test(await text(olive, '#heldFile')));
  await olive.browser().close();

  const val = await browser('val');
  await val.goto(URLB + 'building.html', { waitUntil: 'networkidle2' });
  await until(() => val.$('[data-check="cmp_hall__water-temps"]'));
  await tap(val, '[data-check="cmp_hall__water-temps"]'); await until(() => val.$('#held'));
  ok('   BUILDING.HTML: no check record to save, no photo to upload, and it says why', !(await val.$('#dGo')) && !(await val.$('#dFile')) && /not yet private/.test(await text(val, '#held')));
  ok('   "Report a problem" still goes to Maintenance, as the Maintenance page does', !!(await val.$('#wrong')));
  await val.browser().close();

  /* ---------- 3. nothing written ---------- */
  const files = await fetch(`http://127.0.0.1:9198/v0/b/${PROJECT}.appspot.com/o?prefix=compliance%2F`).then(r => r.json()).catch(() => ({}));
  ok('3. NOTHING WAS WRITTEN: no plans, reports, hazards, snapshots, records; nothing in Storage', (await count('peeps')) === 0 && (await count('raReports')) === 0 && (await count('hazards')) === 0 &&
    (await count('riskSnapshots')) === 0 && (await count('checkRecords')) === 0 && !((files.items || []).length), JSON.stringify(files).slice(0, 200));

  /* ---------- 4. the add-on off ---------- */
  await db.collection('churchSettings').doc('features').set({ buildingCompliance: false });
  const o2 = await browser('olive');
  for (const pg of ['compliance.html', 'risk.html', 'peep.html', 'building.html']) {
    await o2.goto(URLB + pg, { waitUntil: 'networkidle2' });
    await until(() => o2.$('#off'));
    ok('4. ADD-ON OFF: ' + pg + ' says only that it is not switched on', /Building compliance is not switched on for this church/.test(await text(o2, '#off')) && (await inputs(o2)) === 0 && !(await o2.$('[data-check],[data-site],[data-hz],#needs')), (await text(o2)).slice(0, 300));
  }
  await o2.browser().close();

  /* ---------- 5. switch-over: the gate opens ---------- */
  /* Nothing stored: the add-on is ON, the same answer as the server (F-239). */
  await db.collection('churchSettings').doc('features').delete();
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
  const p2 = await browser('pat');
  await p2.goto(URLB + 'peep.html', { waitUntil: 'networkidle2' });
  await until(() => p2.$('#needs'));
  ok('5. RULES LOCKED (switch-over), and the switch with nothing stored (on, as the server): the plan form is there', !!(await p2.$('#needs')) && !(await p2.$('#held')));
  await p2.browser().close();
  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
