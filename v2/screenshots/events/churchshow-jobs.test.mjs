/* A CHURCHSHOW COMPUTER'S JOB AND NAME, START TO FINISH (the going-live test,
   Stage 3). Events window. Invented people only, events emulators only,
   locked rules, network guard. Until this, only the every-control audit
   pressed "Job" and "Rename" on churchshow.html.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/churchshow-jobs.test.mjs"
     (with APPDATA, CLOUDSDK_CONFIG and XDG_CONFIG_HOME on empty folders, so no live secret is read)

   What it proves:
     1. a master admin gives the hall computer a job (lessons for one group,
        not the main services): saved, and the computer's record says so
     2. a job with nothing ticked is refused on the page, with a reason
     3. an AV admin renames it (saved), is not offered "Job", and the function
        refuses them a job if they ask for one directly
     4. a blank name is refused on the page
     5. someone on no team is told the page isn't for them, and the function
        refuses them a rename
     6. the database refuses a direct write to the computer's record, even
        from the AV admin (only the functions write it) */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-cs-'));
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

const SITE = 'site_cs', DEV = 'churchshow-dev_cs';
const P = {
  mia: { email: 'mia.master@example.invalid', name: 'Mia Master (invented)', mid: 'm_mia', teams: [], adminFor: [], master: true },
  ada: { email: 'ada.av@example.invalid', name: 'Ada AV Admin (invented)', mid: 'm_ada', teams: ['AV Team'], adminFor: ['AV Team'] },
  eve: { email: 'eve.everyone@example.invalid', name: 'Eve Everyone (invented)', mid: 'm_eve', teams: [], adminFor: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const x of Object.values(P)) {
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: "St Aidan's with St Hild, Testbury (synthetic)", enquiryEmail: 'office@example.invalid' });
  await setDoc(doc(db, 'churchSettings', 'launch'), { rulesLocked: true });
  await setDoc(doc(db, 'sites', SITE), { name: 'St Hild (synthetic)', active: true, order: 1 });
  await setDoc(doc(db, 'planGroups', 'pg_cs'), { name: 'Little ones (synthetic)', kind: 'children', siteId: SITE, order: 1, archived: false });
  await setDoc(doc(db, 'devices', DEV), { kind: 'churchshow', siteId: SITE, name: 'Hall PC (synthetic)', active: true, pairedAt: new Date().toISOString(), pairedBy: P.mia.uid, jobs: { services: true, lessonGroups: [] } });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const device = () => readDb((db) => getDoc(doc(db, 'devices', DEV)).then((s) => s.data()));

const errors = [], BROWSERS = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); BROWSERS.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 375, height: 812 });
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
const open = async (p) => { await p.goto(URLB + 'churchshow.html', { waitUntil: 'networkidle2' }); await until(async () => (await p.$('#egbc-blocked-card')) || (await p.$('[data-dev]'))); };
const tap = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
/* the page's own toast, as a person reads it */
const toastSaid = (p, re) => until(() => p.evaluate((src) => { const r = new RegExp(src); return [...document.querySelectorAll('.toast, #toast, [role=status]')].map((t) => t.textContent).find((t) => r.test(t)) || ''; }, re.source), 8000);
const callAs = (p, name, data) => p.evaluate((n, d) => EGBCAuth.call(n, d).then(() => 'done', (e) => (e.code || '') + ' ' + (e.message || '')), name, data);

try {
  const M = await as('mia');
  await open(M);
  await tap(M, '[data-act="job"]');
  await M.evaluate(() => { const s = document.querySelector('[data-job="services"]'); if (s.checked) s.click(); const l = document.querySelector('[data-job="lesson"][value="pg_cs"]'); if (!l.checked) l.click(); });
  await tap(M, '[data-act="jobsave"]');
  const saved = await until(async () => { const d = await device(); return d.jobs && d.jobs.services === false && (d.jobs.lessonGroups || []).join() === 'pg_cs' ? d : null; });
  ok('1. A MASTER ADMIN GIVES THE COMPUTER A JOB: lessons for one group, not the services', !!saved, JSON.stringify((await device()).jobs));
  ok('   and the page says it is saved', !!(await toastSaid(M, /Saved/)));
  await until(() => M.$('[data-act="job"]'));
  await tap(M, '[data-act="job"]');
  await M.evaluate(() => document.querySelectorAll('.jb input[type=checkbox]').forEach((c) => { if (c.checked) c.click(); }));
  await tap(M, '[data-act="jobsave"]');
  ok('2. NOTHING TICKED: refused on the page, with a reason', !!(await toastSaid(M, /at least one job/)));

  const A = await as('ada');
  await open(A);
  ok('3. AN AV ADMIN is not offered "Job"', !(await A.$('[data-act="job"]')) && !!(await A.$('[data-act="rename"]')));
  await tap(A, '[data-act="rename"]');
  await A.evaluate(() => { const i = document.querySelector('.rn input'); i.value = 'Hall laptop (synthetic)'; });
  await tap(A, '[data-act="save"]');
  ok('   renames it: saved', !!(await until(async () => (await device()).name === 'Hall laptop (synthetic)')), (await device()).name);
  const adaJob = await callAs(A, 'churchShowSetJob', { deviceId: DEV, services: true, lessonGroups: [] });
  ok('   and is refused a job when they ask the function directly', /permission-denied/.test(adaJob), adaJob);
  await open(A);
  await tap(A, '[data-act="rename"]');
  await A.evaluate(() => { document.querySelector('.rn input').value = '   '; });
  await tap(A, '[data-act="save"]');
  ok('4. A BLANK NAME: refused on the page', !!(await toastSaid(A, /Give it a name/)) && (await device()).name === 'Hall laptop (synthetic)');
  const adaWrite = await A.evaluate((id) => EGBCAuth.db.collection('devices').doc(id).set({ name: 'Written directly' }, { merge: true }).then(() => 'written', (e) => e.code), DEV);
  ok('6. THE DATABASE refuses a direct write to the computer, even from the AV admin', /permission/.test(adaWrite), adaWrite);

  const E = await as('eve');
  await open(E);
  ok('5. SOMEONE ON NO TEAM is told the page isn\u2019t for them', !!(await E.$('#egbc-blocked-card')) && !(await E.$('[data-dev]')));
  const eveRename = await callAs(E, 'churchShowRename', { deviceId: DEV, name: 'Eve was here' });
  ok('   and the function refuses them a rename', /permission-denied/.test(eveRename) && (await device()).name === 'Hall laptop (synthetic)', eveRename);
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
