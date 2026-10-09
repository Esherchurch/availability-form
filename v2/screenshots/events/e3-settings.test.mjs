/* Safeguarding settings - one place for the periods (after E3).
   Events window. Invented people only, events emulators only, network guard.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/e3-settings.test.mjs"

   Lena is the safeguarding lead of Test Green and NOT an admin.
   What it proves:
     1. the page starts from the built-in defaults: the templates' own
        periods, 1 to 8, 1 to 4, 3 years each, checks not required
     2. Lena changes them and saves
     3. "already made" counts only what she may change: her site's forms
        made from a template, and her site's events with leaders set
     4. applying changes those, and nothing else - not another site's form,
        not a form built from scratch, not an answer already given
     5. new forms and new events take the new defaults */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-set-'));

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 300))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 12000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

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
async function makeUser(email) {
  const r = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'synthetic-only-123', returnSecureToken: true }) });
  return (await r.json()).localId;
}
const P = {
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead', memberId: 'm_lena', markers: ['Kids Church'], adminFor: [], masterAdmin: false },
  master: { email: 'master.admin@example.invalid', name: 'Master Admin', memberId: 'm_master', markers: ['Core Team'], adminFor: [], masterAdmin: true }
};
for (const k of Object.keys(P)) P[k].uid = await makeUser(P[k].email);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const day = (n) => new Date(Date.now() + n * 864e5);

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const p of Object.values(P)) {
    await setDoc(doc(db, 'addressBook', p.memberId), { name: p.name, email: p.email, markers: p.markers, adminFor: p.adminFor, masterAdmin: p.masterAdmin });
    await setDoc(doc(db, 'users', p.uid), { memberId: p.memberId, linkedBy: 'admin', name: p.name, email: p.email, teams: p.markers, adminFor: p.adminFor, masterAdmin: p.masterAdmin, status: 'active' });
  }
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'sites', 'site_z'), { name: 'Test Other', active: true, order: 2 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { safeguardingLead: 'm_lena', safeguardingDeputy: '' });
  await setDoc(doc(db, 'bookingSettings', 'site_z'), { safeguardingLead: 'm_somebody_else', safeguardingDeputy: '' });
  const F = (title, template, siteId, validity, keep) => ({ title, template, siteId, validity, retentionMonths: keep, fields: [], purpose: 'Invented', version: 1 });
  await setDoc(doc(db, 'forms', 'form_parent'), F('Test parent consent', 'parent', 'site_t', { mode: 'schoolyear' }, 12));
  await setDoc(doc(db, 'forms', 'form_trip'), F('Test trip consent', 'trip', 'site_t', { mode: 'event' }, 12));
  await setDoc(doc(db, 'forms', 'form_other_site'), F('Test other site consent', 'parent', 'site_z', { mode: 'schoolyear' }, 12));
  await setDoc(doc(db, 'forms', 'form_custom'), F('Test custom form', '', 'site_t', { mode: 'event' }, 12));
  const EV = (title, siteId, d) => ({ title, visibility: 'members', status: 'confirmed', audience: ['members'], startLocal: ymd(d) + 'T10:00',
    startUtc: new Date(ymd(d) + 'T10:00').getTime(), endUtc: new Date(ymd(d) + 'T10:00').getTime(), location: { kind: 'room', siteId, roomIds: [] }, teams: [], createdBy: P.master.uid });
  await setDoc(doc(db, 'calEvents', 'ev_1'), EV('Test Club One', 'site_t', day(5)));
  await setDoc(doc(db, 'calEvents', 'ev_2'), EV('Test Club Elsewhere', 'site_z', day(6)));
  await setDoc(doc(db, 'calEvents', 'ev_3'), EV('Test Club No Leaders', 'site_t', day(7)));
  const L = (siteId) => ({ leaders: [], leaderUids: [], siteId, ratioAll: 8, ratioUnder8: 4, requireChecks: false, dbsYears: 3, trainingYears: 3 });
  await setDoc(doc(db, 'eventLeaders', 'ev_1'), L('site_t'));
  await setDoc(doc(db, 'eventLeaders', 'ev_2'), L('site_z'));
  await setDoc(doc(db, 'formResponses', 'resp_given'), { formId: 'form_parent', requestKey: 'k', siteId: 'site_t', answers: {}, validUntil: '2027-08-31', deleteAfter: '2028-08-31' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.data()));

const errors = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.setViewport({ width: 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p; return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const v = (p, sel) => p.$eval(sel, e => e.value);

try {
  /* 1. the starting point */
  const lB = await as('lena'); const L = lB.page;
  await L.goto(URLB + 'safeguarding-settings.html', { waitUntil: 'networkidle2' });
  await L.waitForSelector('#save');
  ok('the lead, not an admin, can open it', !!(await L.$('#save')));
  ok('it starts from the built-in defaults: parent consent lasts 12 months from when given (Martin), kept 1 year',
    (await v(L, '#v_parent')) === 'months' && (await v(L, '#m_parent')) === '12' && (await v(L, '#k_parent')) === '12'
    && (await v(L, '#v_trip')) === 'months' && (await v(L, '#v_health')) === 'months' && (await v(L, '#v_leader')) === 'months');
  ok('1 to 5 (Martin), 1 to 4 for under-8s, 3 years each, checks not required',
    (await v(L, '#rAll')) === '5' && (await v(L, '#rU8')) === '4' && (await v(L, '#yDbs')) === '3' && (await v(L, '#yTr')) === '3' && !(await L.$eval('#req', e => e.checked)));

  /* 2. change and save */
  await L.select('#k_parent', '24');
  await L.select('#v_trip', 'days');
  await val(L, '#d_trip', '30');
  await val(L, '#rAll', '6'); await val(L, '#rU8', '3');
  await L.select('#yDbs', '5');
  await tap(L, '#req');
  ok('before saving, it asks to save first', /Save the settings first/.test(await L.$eval('#already', e => e.innerText)));
  await tap(L, '#save');
  const saved = await until(() => get('safeguardingSettings', 'defaults'));
  ok('saved, in her name and with the site she leads', saved && saved.leadSiteId === 'site_t' && saved.updatedBy === P.lena.uid &&
    saved.templates.parent.retentionMonths === 24 && saved.templates.trip.validity.mode === 'days' && saved.templates.trip.validity.days === 30 &&
    saved.ratioAll === 6 && saved.ratioUnder8 === 3 && saved.dbsYears === 5 && saved.trainingYears === 3 && saved.requireChecks === true, JSON.stringify(saved));

  /* 3. what would change */
  await until(() => L.$('#nForms'));
  ok('2 forms would change: her site\'s, made from a template', (await L.$eval('#nForms', e => e.textContent)) === '2', await L.$eval('#already', e => e.innerText));
  ok('1 event would change: her site\'s, with leaders set', (await L.$eval('#nEvents', e => e.textContent)) === '1');
  await L.setViewport({ width: 390, height: 900 });
  await L.screenshot({ path: path.join(HERE, 'e3-settings-375.png'), fullPage: true });
  await L.setViewport({ width: 1100, height: 900 });

  /* 4. apply */
  await tap(L, '#applyForms');
  await until(async () => (await get('forms', 'form_parent')).retentionMonths === 24);
  ok('the parent consent form now keeps answers 2 years', (await get('forms', 'form_parent')).retentionMonths === 24);
  const trip = await get('forms', 'form_trip');
  ok('the trip form now lasts 30 days', trip.validity.mode === 'days' && trip.validity.days === 30);
  ok('another site\'s form is left alone', (await get('forms', 'form_other_site')).retentionMonths === 12);
  ok('a form built from scratch is left alone', (await get('forms', 'form_custom')).retentionMonths === 12);
  const given = await get('formResponses', 'resp_given');
  ok('an answer already given keeps its dates', given.validUntil === '2027-08-31' && given.deleteAfter === '2028-08-31');
  await until(() => L.$('#applyEvents:not([disabled])'));
  await tap(L, '#applyEvents');
  await until(async () => (await get('eventLeaders', 'ev_1')).ratioAll === 6);
  const e1 = await get('eventLeaders', 'ev_1');
  ok('her event now has 1 to 6, 1 to 3, DBS 5 years, checks required', e1.ratioAll === 6 && e1.ratioUnder8 === 3 && e1.dbsYears === 5 && e1.requireChecks === true);
  ok('another site\'s event is left alone', (await get('eventLeaders', 'ev_2')).ratioAll === 8);
  await until(async () => (await L.$eval('#nForms', e => e.textContent)) === '0' && (await L.$eval('#nEvents', e => e.textContent)) === '0');
  ok('afterwards, nothing more would change', (await L.$eval('#nForms', e => e.textContent)) === '0' && (await L.$eval('#nEvents', e => e.textContent)) === '0');

  /* 5. new ones take the defaults */
  await L.goto(URLB + 'safeguarding.html?event=ev_3', { waitUntil: 'networkidle2' });
  await L.waitForSelector('#rAll');
  ok('an event with no leaders set starts at 1 to 6 and 1 to 3', (await v(L, '#rAll')) === '6' && (await v(L, '#rU8')) === '3' && (await v(L, '#yDbs')) === '5');
  ok('and requires checks', await L.$eval('#reqChecks', e => e.checked));
  const mB = await as('master'); const M = mB.page;
  await M.goto(URLB + 'forms-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newTpl');
  await M.select('#newTpl', 'parent');
  await M.waitForSelector('#edKeep');
  ok('a new parent consent form keeps answers 2 years', (await v(M, '#edKeep')) === '24');
  await M.select('#newTpl', 'trip');
  await M.waitForSelector('#edDays');
  ok('a new trip form lasts 30 days', (await v(M, '#edValid')) === 'days' && (await v(M, '#edDays')) === '30');
  await lB.close(); await mB.close();
} catch (e) { ok('the run finished', false, e.stack); }

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
