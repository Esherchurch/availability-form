/* Maintenance jobs (the app's Maintenance space; F-123, Martin A-M1):
   anyone signed in reports a job with one optional photo; the Maintenance
   team and the office mark it done; only they see the photo.
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/maint-jobs.test.mjs" */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner', BUCKET = PROJECT + '.firebasestorage.app';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098 || cfg.emulators.storage.port !== 9198) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-mj-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const PIC = path.join(TMP, 'leak.png'); fs.copyFileSync(path.join(V2, 'icon-192.png'), PIC);

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
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const storageList = async (prefix) => (await (await fetch(`http://127.0.0.1:9198/v0/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: { Authorization: 'Bearer owner' } })).json()).items || [];

const P = {
  ann:   { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] },
  mo:    { email: 'mo.maint@example.invalid', name: 'Mo Maintenance', mid: 'm_mo', teams: ['Maintenance'] },
  olive: { email: 'olive.office@example.invalid', name: 'Olive Office', mid: 'm_olive', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_t', name: 'Test Hall', kind: 'room', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_olive'], safeguardingLead: '', safeguardingDeputy: '' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
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
  p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'New tubes fitted (invented)' : undefined));
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
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const hideBanner = (p) => p.evaluate(() => { const b = document.querySelector('.firebase-emulator-warning'); if (b) b.style.display = 'none'; });

try {
  /* 1. an Attender reports a job, with a photo */
  const aB = await as('ann', 375); const AN = aB.page;
  await go(AN, 'maintenance.html', '#r-open'); await tap(AN, '#r-open'); await AN.waitForSelector('#r-go', { visible: true });
  await AN.select('#r-room', 'room_hall'); await val(AN, '#r-what', 'Two lights out'); await val(AN, '#r-details', 'At the back of the hall (invented).');
  await (await AN.$('#r-photo')).uploadFile(PIC);
  await hideBanner(AN);
  await AN.screenshot({ path: path.join(HERE, 'maint-report-375.png'), fullPage: true });
  await tap(AN, '#r-go');
  const job = await until(async () => (await readDb(db => getDocs(collection(db, 'maintJobs')))).docs.map(d => ({ id: d.id, ...d.data() }))[0]);
  ok('1. AN ATTENDER REPORTS A JOB: where, what, who and when', job && job.what === 'Two lights out' && job.where === 'Test Hall' && job.siteId === 'site_t' && job.status === 'todo' && job.reportedBy === P.ann.uid
    && job.reportedByName === 'Ann Attender' && typeof job.reportedAt.toMillis === 'function', J(job));
  const files = await until(async () => { const l = await storageList('maintJobs/' + job.id + '/'); return l.length ? l : null; });
  ok('   with its one photo', job.photoPath === 'maintJobs/' + job.id + '/photo' && files && files.length === 1);
  await AN.waitForSelector('[data-job="' + job.id + '"]');
  ok('   it shows in the list for everyone signed in', /Two lights out To do .*Test Hall · reported by Ann Attender/.test(await text(AN, '#todo')), await text(AN, '#todo'));
  ok('   but she has no "Mark done" and no photo button', !(await AN.$('[data-done]')) && !(await AN.$('[data-photo]')));
  const sneak = await AN.evaluate((id) => EGBCAuth.storage().ref('maintJobs/' + id + '/photo').getDownloadURL().then(() => 'read', e => e.code), job.id);
  ok('   THE PHOTO IS NOT HERS TO SEE, even round the page (the Maintenance team and the office only)', /unauthorized|permission/i.test(sneak), sneak);
  const doneSneak = await AN.evaluate((id) => EGBCAuth.db.collection('maintJobs').doc(id).update({ status: 'done', doneBy: EGBCAuth.user().uid, doneByName: 'x', doneAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => 'done', e => e.code), job.id);
  ok('   nor can she mark it done round the page', /permission/.test(doneSneak), doneSneak);

  /* 2. the Maintenance team */
  const mB = await as('mo', 375); const MO = mB.page;
  await go(MO, 'maintenance.html', '[data-photo="' + job.id + '"]');
  await tap(MO, '[data-photo="' + job.id + '"]');
  await MO.waitForSelector('#ph-' + job.id + ' img.photo');
  ok('2. the Maintenance team sees the photo', !!(await MO.$('#ph-' + job.id + ' img.photo')));
  await tap(MO, '[data-done="' + job.id + '"]');
  const done = await until(async () => { const d = (await readDb(db => getDoc(doc(db, 'maintJobs', job.id)))).data(); return d.status === 'done' ? d : null; });
  ok('   and marks it done, in their name, with a note', done && done.doneBy === P.mo.uid && done.doneByName === 'Mo Maintenance' && done.doneNote === 'New tubes fitted (invented)');
  await MO.waitForSelector('#done [data-job="' + job.id + '"]');
  ok('   it moves to Done', /Done by Mo Maintenance.*New tubes fitted/.test(await text(MO, '#done')));
  await hideBanner(MO);
  await MO.screenshot({ path: path.join(HERE, 'maint-team-375.png'), fullPage: true });

  /* 3. the office */
  const oB = await as('olive'); const OL = oB.page;
  await go(OL, 'maintenance.html', '[data-reopen="' + job.id + '"]');
  ok('3. the office (bookings admin of the job\'s site) sees the photo button too', !!(await OL.$('[data-photo="' + job.id + '"]')));
  await tap(OL, '[data-reopen="' + job.id + '"]');
  ok('   and can open it again', !!(await until(async () => (await readDb(db => getDoc(doc(db, 'maintJobs', job.id)))).data().status === 'todo')));
  await aB.close(); await mB.close(); await oB.close();
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
