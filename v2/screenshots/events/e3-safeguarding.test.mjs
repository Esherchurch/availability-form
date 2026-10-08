/* E3 — safeguarding, driven through the real pages.
   Events window. Invented people only, events emulators only, and the
   network guard (guard.mjs): only localhost and the public script and font
   sites, no service worker, any outside reply fails the run.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/e3-safeguarding.test.mjs"

   The people:
     Lena    the site's safeguarding lead. A member, NOT an admin.
     Leo     a leader of the kids' club. A member, NOT an admin.
     AV      an ordinary admin (AV Team).
     Master  a master admin.
     Parent  no account at all.

   What it proves, in order:
     1. Lena names the leaders from the rota for that date; one has never
        signed in and is shown so; ratios warn when there are too few
        leaders; leader checks are dates and status only, and an
        out-of-date one is flagged
     2. Leo, not an admin, checks children in at the event he leads - and
        sees the medical flag and the collectors from the consent form -
        but not at an event he does not lead
     3. the ordinary admin is told medical details exist, and cannot see them
     4. a family says "still correct" for the next event: Leo cannot see
        their medical details there until Lena shares them; then he can
     5. Leo records an incident; the ordinary admin cannot see the log;
        Lena can, and her download of it is logged as sensitive
     6. Leo reports a concern: Lena is emailed that there is one - the email
        does not say what - and only she can read it; the master admin
        cannot
     7. the "due for deletion" list: a master admin deletes an answer whose
        time is up, with its medical half and its file, and it is recorded
     8. the events page links to Safeguarding */

import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
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
const PROJECT = 'egbc-worship-planner', BUCKET = PROJECT + '.firebasestorage.app';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
const FS_PORT = cfg.emulators.firestore.port, AUTH_PORT = cfg.emulators.auth.port, ST_PORT = cfg.emulators.storage.port;
if (FS_PORT !== 8182 || AUTH_PORT !== 9098 || ST_PORT !== 9198) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-e3-'));

const results = [];
function ok(name, pass, why) {
  results.push({ name, pass: !!pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 300)));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 12000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); }
  return last;
}

/* ---- the forms template, from the page's own file ---- */
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['egbc-events-checkin.js', 'egbc-events-forms.js']) vm.runInContext(fs.readFileSync(path.join(V2, f), 'utf8'), ctx);
/* Copied as plain data: an object made inside the sandbox is not a plain
   object to the database library. */
const PARENT_FORM = JSON.parse(JSON.stringify(ctx.window.EGBCForms.fromTemplate('parent')));

/* ---- serve v2 on 5601 ---- */
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

/* ---- clean emulators, invented people and events ---- */
const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: FS_PORT } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:${AUTH_PORT}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
async function makeUser(email) {
  const r = await fetch(`http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'synthetic-only-123', returnSecureToken: true }) });
  return (await r.json()).localId;
}
const P = {
  master: { email: 'master.admin@example.invalid', name: 'Master Admin', memberId: 'm_master', markers: ['Core Team'], adminFor: [], masterAdmin: true },
  av: { email: 'av.admin@example.invalid', name: 'AV Admin', memberId: 'm_av', markers: ['AV Team'], adminFor: ['AV Team'], masterAdmin: false },
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead', memberId: 'm_lena', markers: ['Kids Church'], adminFor: [], masterAdmin: false },
  leo: { email: 'leo.leader@example.invalid', name: 'Leo Leader', memberId: 'm_leo', markers: ['Kids Church'], adminFor: [], masterAdmin: false }
};
for (const k of Object.keys(P)) P[k].uid = await makeUser(P[k].email);

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const X_DAY = new Date(Date.now() + 3 * 864e5), Y_DAY = new Date(Date.now() + 10 * 864e5);
const yesterday = ymd(new Date(Date.now() - 864e5));
const signup = (ev, key, name, email, kids) => [key, { calEventId: ev, personKind: 'contacts', personId: 'c_' + key.slice(4, 10), name, email,
  phone: '', attendees: kids.map(n => ({ name: n })), answers: {}, places: kids.length, ticketTypeId: '', status: 'confirmed',
  donation: 0, notes: '', memberUid: '', createdAt: new Date().toISOString() }];
const REQ = (ev, evDay, extra) => ({ formId: 'form_p', formTitle: PARENT_FORM.title, calEventId: ev, eventTitle: 'Test Kids Club', eventStart: ymd(evDay) + 'T10:00',
  signupKey: 'key_fam_' + ev, personKind: 'contacts', personId: 'c_fam', name: 'Parent Synthetic', email: 'parent@example.invalid',
  subjects: ['Child One', 'Child Two'], siteId: 'site_t', status: 'sent', reuseOf: '', sentAt: new Date().toISOString(), reminders: [], createdBy: 'x', ...(extra || {}) });

await env.withSecurityRulesDisabled(async (ctx2) => {
  const db = ctx2.firestore();
  for (const p of Object.values(P)) {
    await setDoc(doc(db, 'addressBook', p.memberId), { name: p.name, email: p.email, markers: p.markers, adminFor: p.adminFor, masterAdmin: p.masterAdmin });
    await setDoc(doc(db, 'users', p.uid), { memberId: p.memberId, linkedBy: 'admin', name: p.name, email: p.email, teams: p.markers,
      adminFor: p.adminFor, masterAdmin: p.masterAdmin, status: 'active' });
  }
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: 'm_lena', safeguardingDeputy: '' });
  const ev = (d, title) => ({ title, description: '', category: 'kids', labels: [], visibility: 'members', status: 'confirmed',
    audience: ['members'], teams: [], featured: false, startLocal: ymd(d) + 'T10:00', startUtc: new Date(ymd(d) + 'T10:00').getTime(), endLocal: '',
    endUtc: new Date(ymd(d) + 'T10:00').getTime(), allDay: false, location: { kind: 'room', siteId: 'site_t', roomIds: [] }, signupOn: true, capacity: 20, createdBy: P.master.uid });
  await setDoc(doc(db, 'calEvents', 'ev_x'), ev(X_DAY, 'Test Kids Club'));
  await setDoc(doc(db, 'calEvents', 'ev_y'), ev(Y_DAY, 'Test Kids Club, week two'));
  await setDoc(doc(db, 'calEvents', 'ev_unled'), ev(X_DAY, 'Test Youth Night'));
  for (const [k, d] of [
    signup('ev_x', 'key_fam_ev_x', 'Parent Synthetic', 'parent@example.invalid', ['Child One', 'Child Two']),
    signup('ev_x', 'key_oth_ev_x', 'Other Parent', 'other@example.invalid', ['Child Three']),
    signup('ev_y', 'key_fam_ev_y', 'Parent Synthetic', 'parent@example.invalid', ['Child One', 'Child Two'])
  ]) await setDoc(doc(db, 'signups', k), d);
  /* The rota for that date: Leo leads, Nora helps and has never signed in. */
  await setDoc(doc(db, 'events', 'rota_x'), { date: ymd(X_DAY), roles: ['Kids Leader', 'Kids Helper'],
    assignments: { 'Kids Leader': { id: 'm_leo', name: 'Leo Leader' }, 'Kids Helper': [{ id: 'm_nora', name: 'Nora Notsignedin' }] } });
  await setDoc(doc(db, 'forms', 'form_p'), { ...PARENT_FORM, siteId: 'site_t', team: 'AV Team', version: 1 });
  /* the form is asked for at the event (forms-admin writes this) */
  await setDoc(doc(db, 'eventForms', 'ev_x'), { forms: [{ formId: 'form_p' }] });
  await setDoc(doc(db, 'formRequests', 'req_x_fam_0000000000000000000000'), REQ('ev_x', X_DAY));
  /* An old answer whose time is up, with a medical half and a file. */
  await setDoc(doc(db, 'formRequests', 'req_old_00000000000000000000000'), REQ('', X_DAY, { calEventId: '', status: 'done', responseId: 'resp_old' }));
  await setDoc(doc(db, 'formResponses', 'resp_old'), { formId: 'form_p', requestKey: 'req_old_00000000000000000000000', calEventId: '', email: 'gone@example.invalid',
    name: 'Long Gone', subjects: ['Old Child'], siteId: 'site_t', answers: { policyFile: { path: 'formUploads/req_old_00000000000000000000000/old.pdf', name: 'old.pdf' } },
    hasSensitive: true, submittedAt: '2024-09-01T10:00:00Z', validUntil: '2025-08-31', deleteAfter: yesterday });
  await setDoc(doc(db, 'sensitiveResponses', 'secret_old_00000000000000000000'), { responseId: 'resp_old', requestKey: 'req_old_00000000000000000000000',
    formId: 'form_p', siteId: 'site_t', calEventId: '', answers: { children: [{ allergies: 'Invented old allergy' }] }, deleteAfter: yesterday });
});
await fetch(`http://127.0.0.1:${ST_PORT}/v0/b/${BUCKET}/o?name=${encodeURIComponent('formUploads/req_old_00000000000000000000000/old.pdf')}`,
  { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 invented\n%%EOF\n' });
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const storageList = async (prefix) => (await (await fetch(`http://127.0.0.1:${ST_PORT}/v0/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: { Authorization: 'Bearer owner' } })).json()).items || [];

/* ---- browsers ---- */
const errors = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b);
  b.__dl = fs.mkdtempSync(path.join(TMP, label + '-dl-'));
  const s = await b.target().createCDPSession();
  await s.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: b.__dl, eventsEnabled: true });
  return b;
}
async function pageOf(b, label, width) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  return p;
}
async function as(who, width) {
  const b = await launch(who);
  const p = await pageOf(b, who, width);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p;
  return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const text = (p) => p.$eval('body', e => e.innerText);
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); };

try {
  /* ---------- the parent sends the consent form for the first event ---------- */
  const gB = await launch('parent');
  const G = await pageOf(gB, 'parent', 390);
  await go(G, 'form.html?k=req_x_fam_0000000000000000000000', '#go');
  for (const i of [0, 1]) {
    await val(G, '#f_children__' + i + '__dob', i ? '2016-04-01' : '2020-06-01');
    await val(G, '#f_children__' + i + '__photo', 'Yes');
    await val(G, '#f_children__' + i + '__firstaid', 'Yes');
  }
  await val(G, '#f_children__0__allergies', 'Peanuts - carries an EpiPen');
  await val(G, '#f_children__1__allergies', 'None');
  await val(G, '#f_parentName', 'Parent Synthetic');
  await val(G, '#f_parentPhone', '07700 900000');
  await val(G, '#f_emergency', 'Aunt Invented 07700 900001');
  await val(G, '#f_collectors', 'Parent Synthetic, Aunt Invented');
  await val(G, '#f_sign_n', 'Parent Synthetic');
  await tap(G, '#f_sign_a');
  await tap(G, '#go');
  await until(() => G.$eval('body', e => /Your form is in/.test(e.innerText)), 15000);
  const rid = (await readDb(db => getDoc(doc(db, 'formRequests', 'req_x_fam_0000000000000000000000')))).data().responseId;
  const sens = (await readDb(db => getDocs(query(collection(db, 'sensitiveResponses'), where('responseId', '==', rid))))).docs.map(d => d.data());
  ok('the medical half now says which event it was given for', sens.length === 1 && sens[0].calEventId === 'ev_x');

  /* ---------- 1. Lena: leaders, ratios, checks ---------- */
  const lB = await as('lena'); const L = lB.page;
  await go(L, 'safeguarding.html?event=ev_x', '#fromRota');
  await tap(L, '#fromRota');
  await L.waitForSelector('.rp');
  const rotaText = await L.$eval('#modal', e => e.innerText);
  ok('the rota for that date offers its people, and says who has never signed in', /Leo Leader/.test(rotaText) && /Nora Notsignedin/.test(rotaText) && /has not signed in yet/.test(rotaText), rotaText);
  await L.$$eval('.rp', cs => cs.forEach(c => c.click()));
  await tap(L, '#rpAdd');
  const led = await until(async () => { const d = (await readDb(db => getDoc(doc(db, 'eventLeaders', 'ev_x')))).data(); return d && d.leaders.length === 2 ? d : null; });
  ok('both are named leaders; only the one who has signed in can use the leader pages', led && JSON.stringify(led.leaderUids) === JSON.stringify([P.leo.uid]) && led.siteId === 'site_t', JSON.stringify(led));
  await L.waitForSelector('#rAll');
  await val(L, '#rAll', '1');
  await tap(L, '#saveSettings');
  await until(() => L.$eval('#ratioMsg', e => /more leader/.test(e.textContent)));
  ok('three children at 1 to 1 with two leaders: one more leader needed', /1 more leader needed/.test(await L.$eval('#ratioMsg', e => e.textContent)));
  await val(L, '#rAll', '2'); await val(L, '#rU8', '1');
  await L.$eval('#reqChecks', e => { e.checked = true; });
  await tap(L, '#saveSettings');
  await until(() => L.$eval('#ratioMsg', e => /Enough leaders/.test(e.textContent)));
  const tilesTxt = await L.$$eval('.tile', ts => ts.map(t => t.innerText.replace(/\s+/g, ' ')).join(' | '));
  ok('the under-8 count comes from the consent form (one child, aged 6), one age not known yet', /^3 Children booked \| 1 \+1\? Under 8/.test(tilesTxt), tilesTxt);
  ok('one leader per two, one per under-8: two leaders are enough', /Enough leaders/.test(await L.$eval('#ratioMsg', e => e.textContent)));
  await until(() => L.$('.recCheck'));
  await tap(L, '.recCheck');
  await L.waitForSelector('#cSave');
  ok('the checks form says never the certificate number', /Never the DBS certificate number/.test(await L.$eval('#modal', e => e.innerText)));
  await L.select('#cDbs', 'current');
  await val(L, '#cSeen', '2025-01-10');
  await val(L, '#cTr', '2020-05-01');
  await tap(L, '#cSave');
  /* A warning was already showing (no checks at all), so wait for the new
     dates themselves, not just the warning. */
  await until(() => L.$eval('.card', e => /Training: out of date/.test(e.innerText)));
  const leaderRow = await L.$eval('.card', e => e.innerText);
  ok('an out-of-date training date is flagged, and the event says not every leader is checked',
    /DBS: in date/.test(leaderRow) && /Training: out of date/.test(leaderRow) && !!(await L.$('#checksMsg')), leaderRow.slice(0, 400));
  const chk = (await readDb(db => getDoc(doc(db, 'leaderChecks', 'm_leo')))).data();
  ok('the record holds status and dates, and nothing else', JSON.stringify(Object.keys(chk).sort()) === JSON.stringify(['dbsSeen', 'dbsStatus', 'name', 'siteId', 'trainingDate', 'updatedAt', 'updatedBy']), JSON.stringify(chk));
  await L.setViewport({ width: 390, height: 900 });
  await L.screenshot({ path: path.join(HERE, 'e3-safeguarding-event-375.png'), fullPage: true });
  await L.setViewport({ width: 1100, height: 900 });

  /* ---------- 2. Leo, a leader who is not an admin ---------- */
  const oB = await as('leo', 390); const O = oB.page;
  await go(O, 'checkin.html?event=ev_x', '#tiles');
  const oneId = 'ev_x__key_fam_ev_x__0';
  ok('Leo checks children in at the event he leads', /Expected/.test(await O.$eval('#tiles', e => e.innerText)));
  await until(() => O.$('[data-flag="' + oneId + '"]'));
  await tap(O, '[data-flag="' + oneId + '"]');
  ok('he sees Child One\'s medical flag from the consent form, with the detail', /Peanuts - carries an EpiPen/.test(await O.$eval('#people', e => e.innerText)));
  ok('and no flag for Child Two ("None")', !(await O.$('[data-flag="ev_x__key_fam_ev_x__1"]')));
  await tap(O, '.act[data-id="' + oneId + '"]');
  await until(() => readDb(db => getDoc(doc(db, 'checkins', oneId)).then(s => s.exists())));
  await sleep(500);
  await tap(O, '.act[data-id="' + oneId + '"]');
  await O.waitForSelector('#doOut');
  const coll = await O.$$eval('input[name="coll"]', els => els.map(e => e.value));
  ok('check-out offers the collectors written on the consent form', coll.includes('Aunt Invented') && coll.includes('Parent Synthetic'), JSON.stringify(coll));
  await tap(O, '[data-close]');
  await O.screenshot({ path: path.join(HERE, 'e3-checkin-leader-375.png'), fullPage: true });
  await go(O, 'checkin.html?event=ev_unled', '.banner');
  ok('but not at an event he does not lead', /for admins and the event's leaders/.test(await text(O)));

  /* ---------- 3. the ordinary admin ---------- */
  const aB = await as('av'); const A = aB.page;
  await go(A, 'checkin.html?event=ev_x', '#tiles');
  await until(() => A.$('[data-flag="' + oneId + '"]'));
  await tap(A, '[data-flag="' + oneId + '"]');
  const avPeople = await A.$eval('#people', e => e.innerText);
  ok('an admin of the form2019s team is told medical details are held, and cannot see them', /Held on their consent form/.test(avPeople) && !/Peanuts/.test(avPeople), avPeople.slice(0, 300));

  /* ---------- 4. "still correct" for the next event ---------- */
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'formRequests', 'req_y_fam_0000000000000000000000'), REQ('ev_y', Y_DAY, { signupKey: 'key_fam_ev_y', status: 'reuse', reuseOf: rid }));
  });
  await go(G, 'form.html?k=req_y_fam_0000000000000000000000', '#yes');
  await tap(G, '#yes');
  await until(() => G.$eval('body', e => /still correct/.test(e.innerText) && /Thank you/.test(e.innerText)));
  await go(L, 'safeguarding.html?event=ev_y', '#addLeader');
  await tap(L, '#addLeader');
  await L.waitForSelector('#lq');
  await val(L, '#lq', 'Leo');
  await until(() => L.$('.pick'));
  await tap(L, '.pick');
  await until(async () => ((await readDb(db => getDoc(doc(db, 'eventLeaders', 'ev_y')))).data() || {}).leaderUids?.includes(P.leo.uid));
  await go(O, 'checkin.html?event=ev_y', '#tiles');
  const yOne = 'ev_y__key_fam_ev_y__0';
  await until(() => O.$('[data-flag="' + yOne + '"]'));
  await tap(O, '[data-flag="' + yOne + '"]');
  const before = await O.$eval('#people', e => e.innerText);
  ok('"still correct": the next event\'s leader is told medical details are held, but cannot yet see them', /Held on their consent form/.test(before) && !/Peanuts/.test(before), before.slice(0, 300));
  await go(L, 'safeguarding.html?event=ev_y', '#shareMed');
  ok('Lena is asked to share them', /1 family told us/.test(await text(L)));
  await tap(L, '#shareMed');
  await until(async () => (await readDb(db => getDocs(query(collection(db, 'sensitiveResponses'), where('calEventId', '==', 'ev_y'))))).size === 1);
  await go(O, 'checkin.html?event=ev_y', '#tiles');
  await until(() => O.$('[data-flag="' + yOne + '"]'));
  await tap(O, '[data-flag="' + yOne + '"]');
  ok('once shared, the next event\'s leader sees them', /Peanuts - carries an EpiPen/.test(await O.$eval('#people', e => e.innerText)));

  /* ---------- 5. incidents ---------- */
  await go(O, 'safeguarding.html?event=ev_x', '#addInc');
  await tap(O, '#addInc');
  await O.waitForSelector('#iSave');
  await val(O, '#iWho', 'Child Two');
  await val(O, '#iWhat', 'Invented: tripped on the stairs and grazed a knee');
  await val(O, '#iFa', 'yes'); await val(O, '#iFaBy', 'Leo Leader');
  await val(O, '#iTold', 'yes'); await val(O, '#iToldBy', 'Leo Leader');
  await tap(O, '#iSave');
  await until(async () => (await readDb(db => getDocs(collection(db, 'incidents')))).size === 1);
  const inc = (await readDb(db => getDocs(collection(db, 'incidents')))).docs[0].data();
  ok('Leo records an incident, in his own name, against the event and its site', inc.reportedBy === P.leo.uid && inc.calEventId === 'ev_x' && inc.siteId === 'site_t' && inc.firstAid === true);
  await go(A, 'safeguarding.html?event=ev_x', '#concernBtn');
  await sleep(800);
  ok('the ordinary admin does not see the incident log', !/grazed/.test(await text(A)) && !(await A.$('#addInc')));
  await go(L, 'safeguarding.html?event=ev_x', '#incCsv');
  ok('Lena sees it', /grazed a knee/.test(await text(L)));
  await L.click('#incCsv');
  const csv = await until(() => fs.readdirSync(lB.__dl).find(f => /incidents\.csv$/.test(f)));
  ok('Lena downloads the log', csv && /grazed a knee/.test(fs.readFileSync(path.join(lB.__dl, csv), 'utf8')));
  const dl = (await readDb(db => getDocs(collection(db, 'downloadsLog')))).docs.map(d => d.data());
  ok('and the download is logged as sensitive, in her name', dl.some(d => d.by === P.lena.uid && d.what === 'incident log' && d.sensitive === true));

  /* ---------- 6. a concern ---------- */
  await go(O, 'safeguarding.html?event=ev_x', '#concernBtn');
  await tap(O, '#concernBtn');
  await O.waitForSelector('#cSend');
  await val(O, '#cAbout', 'Child Three');
  await val(O, '#cText', 'Invented for a test: said something worrying at drop-off');
  await tap(O, '#cSend');
  await until(async () => (await readDb(db => getDocs(collection(db, 'concerns')))).size === 1);
  const mail = await until(() => O.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload).find(m => /safeguarding concern/i.test(m.subject))));
  ok('Lena is emailed that there is a concern', mail && mail.to[0] === P.lena.email);
  ok('the email does not say what it is', mail && !/worrying|Child Three/.test(mail.html));
  const mB = await as('master'); const M = mB.page;
  await go(M, 'safeguarding.html', '#concernBtn');
  await sleep(800);
  ok('a master admin cannot read it', !/worrying/.test(await text(M)));
  await go(L, 'safeguarding.html', '.cNote');
  ok('Lena reads it', /said something worrying at drop-off/.test(await text(L)) && /Child Three/.test(await text(L)));
  await L.setViewport({ width: 390, height: 900 });
  await L.screenshot({ path: path.join(HERE, 'e3-concerns-375.png'), fullPage: true });
  await L.setViewport({ width: 1100, height: 900 });
  await tap(L, '.cNote');
  await L.waitForSelector('#cnSave');
  await val(L, '#cn', 'Spoke to the parent; nothing further');
  await tap(L, '#cnSave');
  ok('she marks it seen, with her notes', await until(async () => (await readDb(db => getDocs(collection(db, 'concerns')))).docs[0].data().status === 'seen'));

  /* ---------- 7. due for deletion ---------- */
  ok('the old answer\'s file is there to start with', (await storageList('formUploads/req_old_00000000000000000000000/')).length === 1);
  await go(M, 'retention.html', '#del');
  const due = await M.$$eval('.pick', ps => ps.map(p => p.value));
  ok('only the answer whose time is up is due', JSON.stringify(due) === JSON.stringify(['resp_old']), JSON.stringify(due));
  await M.setViewport({ width: 390, height: 900 });
  await M.screenshot({ path: path.join(HERE, 'e3-retention-375.png'), fullPage: true });
  await M.setViewport({ width: 1100, height: 900 });
  await tap(M, '#del');
  await until(async () => !(await readDb(db => getDoc(doc(db, 'formResponses', 'resp_old')))).exists(), 15000);
  ok('it is deleted', !(await readDb(db => getDoc(doc(db, 'formResponses', 'resp_old')))).exists());
  ok('with its medical half', (await readDb(db => getDocs(query(collection(db, 'sensitiveResponses'), where('responseId', '==', 'resp_old'))))).size === 0);
  ok('and its file', (await until(async () => (await storageList('formUploads/req_old_00000000000000000000000/')).length === 0)) === true);
  ok('everything current is left alone', (await readDb(db => getDoc(doc(db, 'formResponses', rid)))).exists());
  const rlog = (await readDb(db => getDocs(collection(db, 'retentionLog')))).docs.map(d => d.data());
  ok('what was deleted, and who did it, is recorded', rlog.length === 1 && rlog[0].by === P.master.uid && rlog[0].formResponses === 1 && rlog[0].sensitiveResponses === 1 && rlog[0].files === 1, JSON.stringify(rlog));

  /* ---------- 8. from the event ---------- */
  await go(M, 'events-admin.html', '.open[data-id="ev_x"]');
  await tap(M, '.open[data-id="ev_x"]');
  await M.waitForSelector('.tab[data-tab="people"]');
  await tap(M, '.tab[data-tab="people"]');
  await M.waitForSelector('#csv');
  ok('the events page links to Safeguarding', (await M.$$eval('#tabBody a.btn', as => as.map(a => a.getAttribute('href')))).includes('safeguarding.html?event=ev_x'));

  for (const b of [gB, lB, oB, aB, mB]) await b.close();
} catch (e) {
  ok('the run finished', false, e.stack);
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup();
server.close();
const failed = results.filter(r => !r.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
