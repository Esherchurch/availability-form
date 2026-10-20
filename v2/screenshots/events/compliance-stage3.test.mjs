/* BUILDING COMPLIANCE, STAGE 3: connections and reports (F-233). Events window.
   Invented people and buildings only, events emulators only, network guard;
   no email leaves the machine (the daily run is given a sender that only
   writes down what it would send).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/compliance-stage3.test.mjs"

   The brief's proofs, each able to fail:
     1. RULE ZERO: with the add-on OFF, the daily run does nothing at all, the
        room bookings screen shows no colour (even with one on file) and a
        booking is approved exactly as before
     2. a check made overdue on purpose turns the bookings screen's dot RED -
        and the booking can still be approved
     3. a reminder goes for an overdue check, and NOT for one in date; once
        only; "due soon" when amber
   And:
     4. the monthly summary (the 1st) to the office, the trustees and master
        admins, not to Val
     5. the trustee report: every check with its label, as a CSV; a trustee
        signs off for the year (logged); the office cannot
     6. a safety job fixed on the Maintenance page marks its check done in
        the same step
     7. the server runs THE SAME engine file as the pages */

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
import { differs } from '../../tools/sync-compliance.mjs';
import { runCompliance } from '../../functions/compliance.js';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-cmp3-'));
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

/* ---------- the synthetic church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  olive:  { name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Church office'] },
  eli:    { name: 'Eli Elder (invented)', mid: 'm_eli', teams: ['Elders'] },
  val:    { name: 'Val Caretaker (invented)', mid: 'm_val', teams: ['Maintenance'] },
  bea:    { name: 'Bea Bookings (invented)', mid: 'm_bea', teams: ['Welcome'] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.cmp3@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
for (const name of ['Core Team', 'Church office', 'Elders', 'Maintenance', 'Welcome']) await db.collection('teams').doc(name).set({ name, label: name, rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await seedTemplates(db, T, true);
/* The locked rules are on (switch-over), so private records may be saved (F-235). */
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });

const who = { uid: 'seed', name: 'Setup' };
for (const s of FIXTURES.sites) {
  await db.collection('sites').doc(s.id).set({ name: s.name, active: true, order: FIXTURES.sites.indexOf(s) + 1 });
  for (const [id, name, kind] of s.rooms) {
    await db.collection('rooms').doc(id).set({ name, siteId: s.id, active: true, kind: 'room', order: 1 });
    await db.collection('roomProfiles').doc(id).set({ siteId: s.id, kind, updatedAt: 'x' });
  }
  await S.applyProfile(db, E, s.id, s.profile, T.TEMPLATES, who);
}
/* Bea looks after the hall's bookings; she is no compliance person. */
await db.collection('bookingSettings').doc('cmp_hall').set({ bookingsAdmins: ['m_bea'], safeguardingLead: '', safeguardingDeputy: '' });
const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const FUTURE = addDays(TODAY, 21);
const booking = (key, from) => db.collection('bookings').doc(key).set({ siteId: 'cmp_hall', roomId: 'cmp_hall_main', day: FUTURE, slotFrom: from, slotTo: from + 8, startMin: from * 15, endMin: (from + 8) * 15, title: 'Birthday party (invented)', status: 'requested', kind: 'member',
  name: 'Ruth Renter (invented)', email: 'ruth@example.invalid', phone: '', purpose: 'Birthday party (invented)', people: 20, createdAt: new Date().toISOString() });
/* Every check in the hall recorded today (in date), then two given to Val. */
const hall = (await db.collection('buildingChecks').where('siteId', '==', 'cmp_hall').get()).docs.map(d => ({ id: d.id, ...d.data() }));
for (const c of hall) if (c.state === 'on' && c.every.unit !== 'demand') await db.collection('checkRecords').doc().set({ checkId: c.id, siteId: 'cmp_hall', doneOn: TODAY, doneBy: 'seed', doneByName: 'Setup', notes: '', files: [], certExpiry: '', items: [], jobId: '', at: 'x' });
await db.collection('buildingChecks').doc('cmp_hall__water-temps').update({ responsibleIds: ['m_val'] });
await db.collection('buildingChecks').doc('cmp_hall__flush-taps').update({ responsibleIds: ['m_val'] });

const outbox = [];
const send = async (msg, meta) => { outbox.push({ to: msg.to, subject: msg.subject, html: msg.html, kind: meta && meta.kind }); return { ok: true }; };
const errors = [], browsers = [];
async function as(whoK) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, whoK + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, whoK);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push(whoK + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[whoK].email);
  await sleep(500);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const status = async () => { const d = await db.collection('complianceStatus').doc('cmp_hall').get(); return d.exists ? d.data() : null; };
const bk = async (key) => (await db.collection('bookings').doc(key).get()).data();
async function approveAs(pg, key) {
  await pg.goto(URLB + 'bookings-admin.html', { waitUntil: 'networkidle2' });
  await until(() => pg.$(`[data-key="${key}"] [data-do="approve"]`));
  await tap(pg, `[data-key="${key}"] [data-do="approve"]`);
  return until(async () => (await bk(key)).status === 'confirmed', 15000);
}

try {
  ok('7. THE SERVER RUNS THE SAME ENGINE FILE AS THE PAGES (byte for byte)', differs().length === 0, differs().join(', '));

  /* ---------- 1. Rule Zero: the add-on off ---------- */
  /* Switched off, as a master admin stores it: with nothing stored, the add-on is ON (Martin, 19 Oct; F-239). */
  await db.collection('churchSettings').doc('features').set({ buildingCompliance: false });
  const off = await runCompliance({ db, send, today: TODAY });
  ok('1. ADD-ON OFF: the daily run does nothing - no colour written, no email', off.off === true && !(await status()) && outbox.length === 0 && (await db.collection('complianceReminders').get()).size === 0, J(off));
  await db.collection('complianceStatus').doc('cmp_hall').set({ siteId: 'cmp_hall', rag: 'red', counts: { red: 1, amber: 0, green: 0, grey: 0 }, safetyJobs: 0, at: 'x' });
  const bea = await as('bea');
  await booking('bk_off_000000000000000000000000', 40);
  ok('   with a colour on file, the bookings screen still shows NO dot while the add-on is off', (await approveAs(bea, 'bk_off_000000000000000000000000')) && !(await bea.$('#cmpDot')));
  ok('   AND THE BOOKING IS APPROVED EXACTLY AS BEFORE', (await bk('bk_off_000000000000000000000000')).status === 'confirmed');
  await db.collection('complianceStatus').doc('cmp_hall').delete();

  /* ---------- 2. on: overdue turns the dot red; bookings carry on ---------- */
  await db.collection('churchSettings').doc('features').set({ buildingCompliance: true }, { merge: true });
  const r1 = await runCompliance({ db, send, today: TODAY });
  ok('2. ADD-ON ON, everything in date: the hall is green', r1.off === false && (await status()).rag === 'green', J(await status()));
  ok('   AN IN-DATE CHECK GETS NO REMINDER', outbox.length === 0, J(outbox.map(o => o.subject)));
  /* Make Val's water temperatures overdue on purpose: its only record moved back two months. */
  const wtRecs = await db.collection('checkRecords').where('checkId', '==', 'cmp_hall__water-temps').get();
  for (const d of wtRecs.docs) await d.ref.update({ doneOn: addDays(TODAY, -62) });
  const r2 = await runCompliance({ db, send, today: TODAY });
  ok('   A CHECK MADE OVERDUE ON PURPOSE: the hall is red', (await status()).rag === 'red' && (await status()).counts.red === 1, J(await status()));
  await booking('bk_on_0000000000000000000000000', 56);
  await bea.goto(URLB + 'bookings-admin.html', { waitUntil: 'networkidle2' });
  await until(() => bea.$('#cmpDot'));
  const dot = await bea.$eval('#cmpDot', e => ({ rag: e.getAttribute('data-rag'), text: e.innerText, href: e.getAttribute('href') })).catch(() => null);
  ok('   THE BOOKINGS SCREEN\u2019S DOT IS RED, for Bea (she looks after bookings, not compliance), linked to the building', dot && dot.rag === 'red' && /overdue/.test(dot.text) && /compliance\.html\?site=cmp_hall/.test(dot.href), J(dot));
  ok('   it says it is a warning only', /a warning only; bookings carry on/.test(dot && dot.text));
  await bea.screenshot({ path: path.join(HERE, 'compliance-bookings-dot-375.png') });
  ok('   AND THE BOOKING CAN STILL BE APPROVED', !!(await approveAs(bea, 'bk_on_0000000000000000000000000')) && (await bk('bk_on_0000000000000000000000000')).status === 'confirmed');

  /* ---------- 3. reminders ---------- */
  const over = outbox.filter(o => o.kind === 'compliance overdue');
  ok('3. A REMINDER FOR THE OVERDUE CHECK, to Val', over.length === 1 && J(over[0].to) === J([P.val.email]) && /^Overdue: Check hot and cold water temperatures \(Example Hall/.test(over[0].subject), J(outbox.map(o => [o.kind, o.subject, o.to])));
  ok('   and NOT for her in-date one (flushing the taps, done today)', !outbox.some(o => /Flush/.test(o.subject)));
  ok('   in plain words, with its label and the guidance line, and no regulation numbers', /Recommended standard/.test(over[0].html) && /Your trustees remain responsible/.test(over[0].html) && !/regulation \d|BS ?\d{3,}|Act \d{4}/i.test(over[0].html));
  const n2 = outbox.length;
  await runCompliance({ db, send, today: TODAY });
  ok('   ONCE: the next morning\u2019s run sends it again only if the due date changes', outbox.length === n2, J(outbox.slice(n2).map(o => o.subject)));
  /* Due soon: the flushing (weekly) checked 6 days ago is amber. */
  const ftRecs = await db.collection('checkRecords').where('checkId', '==', 'cmp_hall__flush-taps').get();
  for (const d of ftRecs.docs) await d.ref.update({ doneOn: addDays(TODAY, -6) });
  await runCompliance({ db, send, today: TODAY });
  ok('   "DUE SOON" when it turns amber (flushing, due tomorrow)', outbox.some(o => o.kind === 'compliance soon' && /^Due soon: Flush little-used taps/.test(o.subject) && J(o.to) === J([P.val.email])), J(outbox.slice(n2).map(o => o.subject)));

  /* ---------- 4. the monthly summary ---------- */
  const first = addDays(TODAY, 40).slice(0, 8) + '01';
  const n4 = outbox.length;
  await runCompliance({ db, send, today: first });
  const sum = outbox.slice(n4).find(o => o.kind === 'compliance summary');
  ok('4. ON THE 1ST: one summary to the office, the trustees and master admins', sum && J([...sum.to].sort()) === J([P.eli.email, P.martin.email, P.olive.email].sort()), J(sum && sum.to));
  ok('   not to Val or Bea', sum && !sum.to.includes(P.val.email) && !sum.to.includes(P.bea.email));
  ok('   listing what is overdue, by building', sum && /Example Hall \(invented\): something is overdue/.test(sum.html) && /Overdue<\/strong>: Check hot and cold water temperatures/.test(sum.html), sum && sum.html.slice(0, 400));
  const n4b = outbox.length;
  await runCompliance({ db, send, today: first });
  ok('   once a month', !outbox.slice(n4b).some(o => o.kind === 'compliance summary'));

  /* ---------- 5. the trustee report and sign-off ---------- */
  const eli = await as('eli');
  await eli.goto(URLB + 'compliance.html', { waitUntil: 'networkidle2' });
  await until(() => eli.$('#toReport'));
  await eli.evaluate(() => { window.__csv = null; const o = URL.createObjectURL; URL.createObjectURL = (b) => { b.text().then(t => { window.__csv = t; }); return o(b); }; });
  await tap(eli, '#toReport'); await until(() => eli.$('#repTable'));
  const rt = await text(eli, '#report');
  ok('5. THE TRUSTEE REPORT: each building, then every check with its label, last done, next due and status', /Trustee report: Test Green Church/.test(rt) && /Example Hall \(invented\): 1 overdue/.test(rt) && /Gas safety check and certificate Legal requirement/.test(rt) && /Check hot and cold water temperatures Recommended standard Every month/.test(rt) && /Overdue/.test(rt), rt.slice(0, 500));
  await tap(eli, '#repCsv');
  const csv = await until(() => eli.evaluate(() => window.__csv));
  const lines = String(csv || '').replace(/^\uFEFF/, '').split('\r\n');
  ok('   AS A CSV: a header, then one line per check, with the label', lines[0] === 'Building,Area,Check,Label,How often,Last done,Next due,Status,Open actions' && lines.some(l => /^The Manse \(invented\),Gas,Gas safety check and certificate,Legal requirement,Every year,/.test(l)) && lines.length > 60, lines.slice(0, 3).join(' | '));
  await eli.screenshot({ path: path.join(HERE, 'compliance-report-375.png') });
  await eli.$eval('#soYes', e => { e.checked = true; });
  await eli.type('#soNote', 'Reviewed at the October trustees meeting (invented)');
  await tap(eli, '#soGo');
  const so = await until(async () => (await db.collection('complianceSignoffs').get()).docs.map(d => d.data())[0]);
  ok('   A TRUSTEE SIGNS OFF FOR THE YEAR: their name, the date, a snapshot of the colours', so && so.year === +TODAY.slice(0, 4) && so.by === P.eli.uid && so.byName === P.eli.name && so.snapshot.cmp_hall.rag === 'red', J(so));
  ok('   and it is in the log', (await db.collection('complianceLog').where('what', '==', 'signoff').get()).size === 1);
  await until(async () => /reviewed by Eli Elder/.test(await text(eli, '#signoff')));
  ok('   shown on the report', /reviewed by Eli Elder \(invented\)/.test(await text(eli, '#signoff')));
  const olive = await as('olive');
  await olive.goto(URLB + 'compliance.html', { waitUntil: 'networkidle2' });
  await until(() => olive.$('#toReport')); await tap(olive, '#toReport'); await until(() => olive.$('#repTable'));
  ok('   THE OFFICE sees the report but has no sign-off (the trustees sign off)', !(await olive.$('#soGo')) && /The trustees \(the Elders\) sign off/.test(await text(olive, '#signoff')));

  /* ---------- 6. fixing a safety job marks its check done ---------- */
  await db.collection('maintJobs').doc('mj_fix').set({ siteId: 'cmp_hall', roomId: 'cmp_hall_kitchen', where: 'Hall kitchen (invented)', what: 'Hot water only 40 degrees (invented)', details: '', photoPath: '', status: 'todo',
    checkId: 'cmp_hall__water-temps', safety: true, due: addDays(TODAY, -2), ownerId: 'm_val', reportedBy: P.olive.uid, reportedByName: P.olive.name, reportedAt: new Date() });
  const val = await as('val');
  await val.goto(URLB + 'maintenance.html', { waitUntil: 'networkidle2' });
  await until(() => val.$('[data-done="mj_fix"]'));
  await tap(val, '[data-done="mj_fix"]');
  const fixed = await until(async () => (await db.collection('checkRecords').where('jobId', '==', 'mj_fix').get()).docs.map(d => d.data())[0]);
  ok('6. VAL (the Maintenance team, and the check is hers) MARKS THE SAFETY JOB FIXED, and records its check done in the same step', fixed && fixed.checkId === 'cmp_hall__water-temps' && fixed.doneOn === TODAY && fixed.doneBy === P.val.uid && /Fixed: Hot water only 40 degrees/.test(fixed.notes), J(fixed));
  ok('   the job is done', (await db.collection('maintJobs').doc('mj_fix').get()).data().status === 'done');
  await runCompliance({ db, send, today: TODAY });
  ok('   and the next run turns the hall back from red', (await status()).rag !== 'red', J(await status()));

  /* F-239: nothing stored means ON, on the server as on the pages (functions/features.js). */
  await db.collection('churchSettings').doc('features').delete();
  const def = await runCompliance({ db, send, today: TODAY });
  ok('THE SWITCH WITH NOTHING STORED: the daily run counts the add-on ON, as the pages do', def.off === false && def.status.length > 0, JSON.stringify({ off: def.off }));
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
