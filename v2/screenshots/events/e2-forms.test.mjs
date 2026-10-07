/* E2 — forms and consent, driven through the real pages.
   Events window. Synthetic people only, events emulators only (checked
   before anything is written).

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/e2-forms.test.mjs"

   What it proves, in order:
     1. an admin builds the parent consent form from its template; a new
        question about asthma is treated as medical from its wording alone
     2. the form is asked for at an event and sent to every booking
     3. a parent fills it in from the email link, with no account: one
        section per child, names already there; medical answers are stored
        apart from the rest; the parent's own link shows them everything
     4. the chase list shows who has not finished; a reminder goes only to them
     5. a master admin sees the medical answers; an ordinary admin is told
        they exist but cannot see them
     6. reuse: the next event asks the same family "still correct?" -
        "something has changed" brings back the ordinary answers but not the
        medical ones; "yes" completes it without filling anything in
     7. a hirer is sent the safeguarding form on its own, attaches a PDF,
        and the file lands in that request's folder
     8. the events page links to the forms */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
/* Only localhost and the public script and font sites may be reached; no
   service worker; any reply from elsewhere fails the run (guard.mjs). */
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
const FS_PORT = cfg.emulators.firestore.port, AUTH_PORT = cfg.emulators.auth.port, ST_PORT = cfg.emulators.storage.port;
if (FS_PORT !== 8182 || AUTH_PORT !== 9098 || ST_PORT !== 9198) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-e2-'));

const results = [];
function ok(name, pass, why) {
  results.push({ name, pass: !!pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 300)));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); }
  return last;
}

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

/* ---- clean emulators and invented people ---- */
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
const MASTER = { email: 'master.admin@example.invalid', name: 'Master Admin' };
const AVADMIN = { email: 'av.admin@example.invalid', name: 'AV Admin' };
MASTER.uid = await makeUser(MASTER.email);
AVADMIN.uid = await makeUser(AVADMIN.email);

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T10:00';
const A_DAY = new Date(Date.now() + 7 * 864e5), B_DAY = new Date(Date.now() + 14 * 864e5);
const signup = (ev, key, name, email, kids) => [key, { calEventId: ev, personKind: 'contacts', personId: 'c_' + key.slice(0, 6), name, email,
  phone: '', attendees: kids.map(n => ({ name: n })), answers: {}, places: kids.length, ticketTypeId: '', status: 'confirmed',
  donation: 0, notes: '', memberUid: '', createdAt: new Date().toISOString() }];

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'addressBook', 'm_master'), { name: MASTER.name, email: MASTER.email, markers: ['Core Team'], adminFor: [], masterAdmin: true });
  await setDoc(doc(db, 'users', MASTER.uid), { memberId: 'm_master', linkedBy: 'admin', name: MASTER.name, email: MASTER.email, teams: ['Core Team'], adminFor: [], masterAdmin: true, status: 'active' });
  await setDoc(doc(db, 'addressBook', 'm_av'), { name: AVADMIN.name, email: AVADMIN.email, markers: ['AV Team'], adminFor: ['AV Team'], masterAdmin: false });
  await setDoc(doc(db, 'users', AVADMIN.uid), { memberId: 'm_av', linkedBy: 'admin', name: AVADMIN.name, email: AVADMIN.email, teams: ['AV Team'], adminFor: ['AV Team'], masterAdmin: false, status: 'active' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: 'm_lead_nobody', safeguardingDeputy: '' });
  const ev = (d) => ({ title: 'Test Kids Club ' + d.getDate(), description: '', category: 'kids', labels: [], visibility: 'public', status: 'confirmed',
    audience: ['public', 'members'], teams: [], featured: false, startLocal: iso(d), startUtc: d.getTime(), endLocal: '', endUtc: d.getTime(),
    allDay: false, location: { kind: 'room', siteId: 'site_t', roomIds: [] }, signupOn: true, capacity: 20, createdBy: MASTER.uid });
  await setDoc(doc(db, 'calEvents', 'ev_a'), ev(A_DAY));
  await setDoc(doc(db, 'calEvents', 'ev_b'), ev(B_DAY));
  for (const [k, d] of [
    signup('ev_a', 'key_fam_a_0000000000000000000000', 'Parent Synthetic', 'parent@example.invalid', ['Child One', 'Child Two']),
    signup('ev_a', 'key_other_a_00000000000000000000', 'Other Parent', 'other@example.invalid', ['Child Three']),
    signup('ev_b', 'key_fam_b_0000000000000000000000', 'Parent Synthetic', 'parent@example.invalid', ['Child One', 'Child Two']),
    signup('ev_b', 'key_new_b_0000000000000000000000', 'New Family', 'newfamily@example.invalid', ['Child Four'])
  ]) await setDoc(doc(db, 'signups', k), d);
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };

/* ---- browsers ---- */
const errors = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b);
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
async function signIn(p, who) {
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), who.email);
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const text = (p) => p.$eval('body', e => e.innerText);
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const linkIn = (html) => (html.match(/href="([^"]*form\.html\?k=[^"]+)"/) || [])[1];

try {
  /* ---------- 1. build the form ---------- */
  const mB = await launch('master');
  const M = await pageOf(mB, 'master');
  await signIn(M, MASTER);
  await M.goto(URLB + 'forms-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newTpl');
  await M.select('#newTpl', 'parent');
  await M.waitForSelector('#edSave');
  ok('the parent template opens with a section for each child', await M.$eval('#edFields', e => /Each child/.test(e.innerHTML) && /Allergies/.test(e.innerHTML)));
  await tap(M, '#edAdd');
  await M.waitForFunction(() => document.querySelectorAll('#edFields > .fieldbox').length > 0);
  const last = '#edFields > .fieldbox:last-child';
  await val(M, last + ' .fe-label', 'Does any child have asthma?');
  await M.$eval(last + ' > .two .fe-type', (e) => { e.value = 'yesno'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  ok('a new question about asthma is private from its wording alone', await M.$eval('#edFields > .fieldbox:last-child', e => /Private anyway, from its wording/.test(e.textContent)));
  await tap(M, '#edSave');
  const form = await until(() => readDb(db => getDocs(collection(db, 'forms')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))[0])));
  ok('the form is saved with its site, its purpose and how long it lasts',
    form && form.siteId === 'site_t' && /keep your child safe/.test(form.purpose) && form.validity.mode === 'schoolyear', JSON.stringify(form && { siteId: form.siteId, v: form.validity }));
  const asthmaId = form.fields.find(f => /asthma/i.test(f.label)).id;

  /* ---------- 2. ask for it at the event and send ---------- */
  await M.goto(URLB + 'forms-admin.html?event=ev_a', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#attPick');
  await M.select('#attPick', form.id);
  await M.waitForSelector('.sendAll');
  await tap(M, '.sendAll');
  const reqsA = await until(async () => { const s = await readDb(db => getDocs(query(collection(db, 'formRequests'), where('calEventId', '==', 'ev_a')))); return s.size === 2 ? s : null; });
  ok('a request is written for each booking', !!reqsA);
  const mailsA = await until(async () => { const o = await outbox(M); return o.length >= 2 ? o : null; });
  const toParent = mailsA.find(m => m.to[0] === 'parent@example.invalid');
  ok('each booker is emailed a link of their own', mailsA.length === 2 && !!linkIn(toParent.html) && linkIn(toParent.html) !== linkIn(mailsA.find(m => m.to[0] === 'other@example.invalid').html));

  /* ---------- 3. the parent fills it in ---------- */
  const gB = await launch('parent');
  const G = await pageOf(gB, 'parent', 390);
  await G.goto(linkIn(toParent.html), { waitUntil: 'networkidle2' });
  await G.waitForSelector('#go');
  ok('the form says why it asks', /keep your child safe/.test(await text(G)));
  ok('one section per child, names already filled in',
    (await G.$eval('#f_children__0__name', e => e.value)) === 'Child One' && (await G.$eval('#f_children__1__name', e => e.value)) === 'Child Two');
  ok('medical questions are marked as kept private', (await G.$$eval('.lock', ls => ls.length)) >= 5);
  for (const i of [0, 1]) {
    await val(G, '#f_children__' + i + '__dob', i ? '2020-06-01' : '2018-03-01');
    await val(G, '#f_children__' + i + '__photo', 'Yes');
    await val(G, '#f_children__' + i + '__firstaid', 'Yes');
  }
  await val(G, '#f_children__0__allergies', 'Peanuts - carries an EpiPen');
  await val(G, '#f_children__1__allergies', 'None');
  await val(G, '#f_children__0__dietary', 'Vegetarian');
  await val(G, '#f_parentName', 'Parent Synthetic');
  await val(G, '#f_parentPhone', '07700 900000');
  await val(G, '#f_emergency', 'Aunt Invented 07700 900001; Uncle Invented 07700 900002');
  await val(G, '#f_collectors', 'Parent Synthetic, Aunt Invented');
  await val(G, '#f_' + asthmaId, 'Yes');
  await tap(G, '#go');
  await sleep(800);
  ok('it cannot be sent unsigned', /Please answer/.test(await G.$eval('#err', e => e.textContent)));
  await val(G, '#f_sign_n', 'Parent Synthetic');
  await G.$eval('#f_sign_a', e => { e.checked = true; });
  await G.screenshot({ path: path.join(HERE, 'e2-form-fill-375.png'), fullPage: true });
  await tap(G, '#go');
  await until(() => G.$eval('body', e => /Your form is in/.test(e.innerText)), 15000);
  ok('the parent is told it is in', /Your form is in/.test(await text(G)));

  const reqParentA = reqsA.docs.find(d => d.data().email === 'parent@example.invalid');
  const done = (await readDb(db => getDoc(doc(db, 'formRequests', reqParentA.id)))).data();
  const resp = (await readDb(db => getDoc(doc(db, 'formResponses', done.responseId)))).data();
  const sens = (await readDb(db => getDocs(query(collection(db, 'sensitiveResponses'), where('responseId', '==', done.responseId))))).docs.map(d => ({ id: d.id, ...d.data() }));
  const plainText = JSON.stringify(resp.answers), sensText = JSON.stringify(sens[0] && sens[0].answers);
  ok('the request is marked done, with the answer', done.status === 'done' && !!done.responseId);
  ok('the ordinary half holds no medical answer', !/Peanuts|EpiPen/.test(plainText) && !(asthmaId in resp.answers) && /Vegetarian/.test(plainText) && /Aunt Invented/.test(plainText), plainText);
  ok('the medical half holds them, for the right child', sens.length === 1 && sens[0].answers.children[0].allergies === 'Peanuts - carries an EpiPen' && sens[0].answers[asthmaId] === 'Yes', sensText);
  ok('it carries the site, how long it lasts and when it is due for deletion', resp.siteId === 'site_t' && /-08-31$/.test(resp.validUntil) && resp.deleteAfter > resp.validUntil);
  ok('the signature is the typed name, agreed, with the time', resp.answers.sign && resp.answers.sign.name === 'Parent Synthetic' && resp.answers.sign.agreed === true && !!resp.answers.sign.at);
  ok('the medical half is filed under a key the ordinary answer does not hold', sens[0] && plainText.indexOf(sens[0].id) < 0 && JSON.stringify(done).indexOf(sens[0].id) < 0);

  const received = (await outbox(G)).find(m => /^Received/.test(m.subject));
  const viewLink = received && linkIn(received.html);
  ok('the parent is emailed a private link to what they sent', !!viewLink && viewLink.indexOf('&s=' + sens[0].id) > 0);
  await G.goto(viewLink, { waitUntil: 'networkidle2' });
  await until(() => G.$eval('body', e => /What you sent/.test(e.innerText)));
  const viewText = await text(G);
  ok('that link shows them everything, medical answers included', /Peanuts - carries an EpiPen/.test(viewText) && /Aunt Invented/.test(viewText) && /Kept until/.test(viewText));
  await G.screenshot({ path: path.join(HERE, 'e2-form-view-375.png'), fullPage: true });
  await G.goto(linkIn(toParent.html), { waitUntil: 'networkidle2' });
  await until(() => G.$eval('body', e => /was sent on/.test(e.innerText)));
  const again = await text(G);
  ok('the first link, opened again, shows no medical answers and no second form', /was sent on/.test(again) && !/Peanuts/.test(again) && !(await G.$('#go')));

  /* ---------- 4. chase ---------- */
  await M.goto(URLB + 'forms-admin.html?event=ev_a', { waitUntil: 'networkidle2' });
  await until(() => M.$eval('#evBody', e => /1 of 2 done/.test(e.textContent)));
  ok('the chase list shows 1 of 2 done', /1 of 2 done/.test(await M.$eval('#evBody', e => e.textContent)));
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await tap(M, '.remind');
  const rem = await until(async () => { const o = await outbox(M); return o.length ? o : null; });
  ok('a reminder goes only to the one not finished', rem.length === 1 && rem[0].to[0] === 'other@example.invalid' && /^Reminder:/.test(rem[0].subject), JSON.stringify(rem.map(m => m.to)));
  const otherReq = reqsA.docs.find(d => d.data().email === 'other@example.invalid');
  ok('the reminder is recorded on the request', (await until(async () => ((await readDb(db => getDoc(doc(db, 'formRequests', otherReq.id)))).data().reminders || []).length === 1)) === true);
  await M.setViewport({ width: 390, height: 900 });
  await M.screenshot({ path: path.join(HERE, 'e2-forms-admin-375.png'), fullPage: true });
  await M.setViewport({ width: 1100, height: 900 });

  /* ---------- 5. who sees the medical answers ---------- */
  await until(() => M.$('.view'));
  await tap(M, '.view');
  await until(() => M.$eval('#modal', e => /Peanuts/.test(e.textContent)));
  ok('a master admin sees the medical answers', /Peanuts - carries an EpiPen/.test(await M.$eval('#modal', e => e.textContent)));
  const aB = await launch('avadmin');
  const AV = await pageOf(aB, 'ordinary admin');
  await signIn(AV, AVADMIN);
  await AV.goto(URLB + 'forms-admin.html?event=ev_a', { waitUntil: 'networkidle2' });
  await until(() => AV.$('.view'));
  await tap(AV, '.view');
  await until(() => AV.$('#modal .ans'));
  await sleep(500);
  const avModal = await AV.$eval('#modal', e => e.textContent);
  ok('an ordinary admin sees the ordinary answers', /Aunt Invented/.test(avModal) && /Vegetarian/.test(avModal));
  ok('but is told the medical ones exist and cannot see them', !!(await AV.$('#medRefused')) && !/Peanuts|EpiPen/.test(avModal));
  await aB.close();

  /* ---------- 6. reuse at the next event ---------- */
  await M.goto(URLB + 'forms-admin.html?event=ev_b', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#attPick');
  await M.select('#attPick', form.id);
  await M.waitForSelector('.sendAll');
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await tap(M, '.sendAll');
  const reqsB = await until(async () => { const s = await readDb(db => getDocs(query(collection(db, 'formRequests'), where('calEventId', '==', 'ev_b')))); return s.size === 2 ? s : null; });
  const rB = Object.fromEntries(reqsB.docs.map(d => [d.data().email, { id: d.id, ...d.data() }]));
  ok('the same family, same children, still valid: asked "still correct?"', rB['parent@example.invalid'].status === 'reuse' && rB['parent@example.invalid'].reuseOf === done.responseId);
  ok('a new family is asked to fill it in', rB['newfamily@example.invalid'].status === 'sent');
  const mailsB = await until(async () => { const o = await outbox(M); return o.length >= 2 ? o : null; });
  const reuseMail = mailsB.find(m => m.to[0] === 'parent@example.invalid');
  ok('the email asks them to check it, not fill it in', /still correct/i.test(reuseMail.html));
  await G.goto(linkIn(reuseMail.html), { waitUntil: 'networkidle2' });
  await G.waitForSelector('#yes');
  const onFile = await text(G);
  ok('"still correct?" shows what is on file, without the medical answers', /What we have on file/.test(onFile) && /Aunt Invented/.test(onFile) && !/Peanuts/.test(onFile) && /Health and medical details are on file too/.test(onFile));
  await G.screenshot({ path: path.join(HERE, 'e2-form-reuse-375.png'), fullPage: true });
  await tap(G, '#no');
  await G.waitForSelector('#go');
  ok('"something has changed": the ordinary answers come back, the medical ones are asked again',
    (await G.$eval('#f_parentName', e => e.value)) === 'Parent Synthetic' && (await G.$eval('#f_collectors', e => e.value)) === 'Parent Synthetic, Aunt Invented' &&
    (await G.$eval('#f_children__0__allergies', e => e.value)) === '' && (await G.$eval('#f_children__0__dietary', e => e.value)) === 'Vegetarian');
  await G.reload({ waitUntil: 'networkidle2' });
  await G.waitForSelector('#yes');
  await tap(G, '#yes');
  await until(() => G.$eval('body', e => /still correct/.test(e.innerText) && /Thank you/.test(e.innerText)));
  const rDone = (await readDb(db => getDoc(doc(db, 'formRequests', rB['parent@example.invalid'].id)))).data();
  ok('"yes, still correct" completes it, pointing at the answer on file', rDone.status === 'done' && rDone.confirmedStillCorrect === true && rDone.responseId === done.responseId);
  await M.goto(URLB + 'forms-admin.html?event=ev_b', { waitUntil: 'networkidle2' });
  await until(() => M.$eval('#evBody', e => /Still correct/.test(e.textContent)));
  ok('the chase list says "still correct"', /Still correct/.test(await M.$eval('#evBody', e => e.textContent)) && /1 of 2 done/.test(await M.$eval('#evBody', e => e.textContent)));

  /* ---------- 7. a hirer, with a file ---------- */
  await M.goto(URLB + 'forms-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newTpl');
  await M.select('#newTpl', 'hirer');
  await M.waitForSelector('#edSave');
  await tap(M, '#edSave');
  const hirerForm = await until(() => readDb(db => getDocs(collection(db, 'forms')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).find(f => f.template === 'hirer'))));
  await M.waitForFunction((id) => [...document.querySelectorAll('#oForm option')].some(o => o.value === id), {}, hirerForm.id);
  await M.select('#oForm', hirerForm.id);
  await val(M, '#oName', 'Hirer Synthetic');
  await val(M, '#oEmail', 'hirer@example.invalid');
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await tap(M, '#oSend');
  const hMail = await until(async () => (await outbox(M)).find(m => m.to[0] === 'hirer@example.invalid'));
  ok('a form is sent to one person, with no event', !!hMail && /Hirer safeguarding/.test(hMail.subject));
  const pdf = path.join(TMP, 'policy.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n% invented safeguarding policy for a test\n%%EOF\n');
  await G.goto(linkIn(hMail.html), { waitUntil: 'networkidle2' });
  await G.waitForSelector('#go');
  await val(G, '#f_org', 'Invented Toddler Group');
  await val(G, '#f_children', 'Yes');
  await val(G, '#f_contact', 'Hirer Synthetic, 07700 900003, hirer@example.invalid');
  await (await G.$('#f_policyFile')).uploadFile(pdf);
  await val(G, '#f_sign_n', 'Hirer Synthetic');
  await G.$eval('#f_sign_a', e => { e.checked = true; });
  await tap(G, '#go');
  await until(() => G.$eval('body', e => /Your form is in/.test(e.innerText)), 15000);
  const hReq = (await readDb(db => getDocs(query(collection(db, 'formRequests'), where('email', '==', 'hirer@example.invalid'))))).docs[0];
  const hResp = (await readDb(db => getDoc(doc(db, 'formResponses', hReq.data().responseId)))).data();
  const fileAns = hResp.answers.policyFile || {};
  ok('the PDF is recorded on the answer, in that request\'s own folder', fileAns.name === 'policy.pdf' && fileAns.path.indexOf('formUploads/' + hReq.id + '/') === 0, JSON.stringify(fileAns));
  const list = await (await fetch(`http://127.0.0.1:${ST_PORT}/v0/b/${PROJECT}.firebasestorage.app/o?prefix=${encodeURIComponent('formUploads/' + hReq.id + '/')}`,
    { headers: { Authorization: 'Bearer owner' } })).json();
  ok('and the file is in storage', (list.items || []).length === 1, JSON.stringify(list).slice(0, 200));
  await M.reload({ waitUntil: 'networkidle2' });
  await until(() => M.$eval('#one', e => /Hirer Synthetic/.test(e.textContent) && /Done/.test(e.textContent)));
  ok('the one-person list shows it done', /Done/.test(await M.$eval('#one', e => e.textContent)));

  /* ---------- 8. from the event ---------- */
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('.open[data-id="ev_a"]');
  await tap(M, '.open[data-id="ev_a"]');
  await M.waitForSelector('.tab[data-tab="people"]');
  await tap(M, '.tab[data-tab="people"]');
  await M.waitForSelector('#csv');
  ok('the events page links to the event\'s forms', (await M.$$eval('#tabBody a.btn', as => as.map(a => a.getAttribute('href')))).includes('forms-admin.html?event=ev_a'));

  await mB.close(); await gB.close();
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
