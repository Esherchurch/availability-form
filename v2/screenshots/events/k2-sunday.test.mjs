/* Chunk 6, stage 2 — Sunday check-in: the family desk, labels with a
   collection code, check-out only to a listed collector or the code, the
   first-time visitor form, and the leader screen per group. Built on E1's
   check-in (the checkins collection).
   Events window. Invented children and parents only, events emulators only,
   network guard, no email leaves the machine.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/k2-sunday.test.mjs"

   What it proves:
     1. at the desk, a lead finds a family by phone, by name or by their
        family QR code, ticks the children and checks them in: one check-in
        record each in E1's check-in, in the session for their own group,
        with one collection code for the family; labels show name, group,
        the allergy flag and the code; the parent's slip carries the family QR
     2. the leader of Little ones sees Ada in their group (with her medical
        details, her parent's number on tap, and "page a parent"), and does
        not see Ben, a Junior, even round the page
     3. check-out: a stranger with the wrong code is refused (by the page
        and, round it, by the rules); a listed collector takes Ada home; Ben
        goes with someone not listed who has the code
     4. an admin of another team sees no child: not the page, not the
        records, not in the fire roll-call; a master admin's roll-call has them
     5. a first-time family is checked in from the door form within a few
        taps, and the full registration form is emailed (to the outbox only)
     6. a lead adds a collector for the whole family on the register */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-k2-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const DAY = ymd(new Date());

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

const P = {
  karen: { email: 'karen.admin@example.invalid', name: 'Karen Admin', mid: 'm_karen', admin: true, teams: ['Core Team'] },
  samy:  { email: 'samy.lead@example.invalid', name: 'Samy Lead', mid: 'm_samy', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  lou:   { email: 'lou.little@example.invalid', name: 'Lou Little', mid: 'm_lou', teams: ['Kids Church'] },
  jo:    { email: 'jo.junior@example.invalid', name: 'Jo Junior', mid: 'm_jo', teams: ['Kids Church'] },
  wes:   { email: 'wes.worship@example.invalid', name: 'Wes Worship', mid: 'm_wes', teams: ['Worship Team'], adminFor: ['Worship Team'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const ROOM = (name, extra) => ({ siteId: 'site_t', name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
  bookableByMembers: true, bookableByHirers: false, description: '', photoUrl: '', ...(extra || {}) });
const FAMILY = { siteId: 'site_t', parentName: 'Parent Synthetic', phone: '07700 900111', email: 'parent@example.invalid', emergency: 'Grandma Invented 07700 900999',
  collectors: ['Parent Synthetic', 'Grandma Invented'], familyCode: 'ABC234', responseIds: ['resp_1'] };
const KID = (name, groupId, year, flags) => ({ siteId: 'site_t', familyId: 'fam_1', name, dob: '', year, groupId, groupFixed: false, status: 'registered', flags,
  consentUntil: '2099-08-31', photo: true, firstaid: true, parentName: FAMILY.parentName, phone: FAMILY.phone, email: FAMILY.email, emergency: FAMILY.emergency,
  collectors: FAMILY.collectors, familyCode: FAMILY.familyCode });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_little'), ROOM('Test Little Room', { order: 1 }));
  await setDoc(doc(db, 'rooms', 'room_junior'), ROOM('Test Junior Room', { order: 2 }));
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'forms', 'form_kids_site_t'), { title: 'Children\u2019s registration', purpose: 'To keep your children safe.', siteId: 'site_t', team: 'Kids Church',
    template: 'parent', kind: 'consent', version: 1, fields: [], validity: { mode: 'schoolyear' }, retentionMonths: 12 });
  await setDoc(doc(db, 'kidsSettings', 'site_t'), { teams: ['Kids Church'], formId: 'form_kids_site_t', formTitle: 'Children\u2019s registration' });
  await setDoc(doc(db, 'kidsGroups', 'kg_little'), { siteId: 'site_t', name: 'Little ones', years: ['Reception', 'Year 1', 'Year 2'], roomId: 'room_little', ratio: 4, day: 7,
    start: '10:30', end: '12:00', active: true, order: 1, leaderIds: ['m_lou'] });
  await setDoc(doc(db, 'kidsGroups', 'kg_junior'), { siteId: 'site_t', name: 'Juniors', years: ['Year 3', 'Year 4', 'Year 5', 'Year 6'], roomId: 'room_junior', ratio: 8, day: 7,
    start: '10:30', end: '12:00', active: true, order: 2, leaderIds: ['m_jo'] });
  await setDoc(doc(db, 'kidsFamilies', 'fam_1'), FAMILY);
  await setDoc(doc(db, 'kidsChildren', 'kc_ada'), KID('Ada Synthetic', 'kg_little', 'Year 1', { allergies: true, medical: false }));
  await setDoc(doc(db, 'kidsChildren', 'kc_ben'), KID('Ben Synthetic', 'kg_junior', 'Year 4', { allergies: false, medical: false }));
  await setDoc(doc(db, 'kidsMedical', 'kc_ada'), { siteId: 'site_t', groupId: 'kg_little', allergies: 'Peanuts: carries an EpiPen', medical: '', medication: 'EpiPen', needs: '', responseId: 'resp_1' });
  await setDoc(doc(db, 'kidsMedical', 'kc_ben'), { siteId: 'site_t', groupId: 'kg_junior', allergies: 'None', medical: 'Asthma (invented)', medication: '', needs: '', responseId: 'resp_1' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const cks = () => readDb(db => getDocs(query(collection(db, 'checkins'), where('day', '==', DAY))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))));
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
  p.on('dialog', d => d.accept());
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
const check = (p, sel, on) => p.$eval(sel, (e, on) => { if (e.checked !== on) e.click(); }, on);
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const hideBanner = (p) => p.evaluate(() => { const b = document.querySelector('.firebase-emulator-warning'); if (b) b.style.display = 'none'; });

try {
  /* ---------- 1. the desk ---------- */
  const sB = await as('samy'); const S = sB.page;
  await go(S, 'kids-checkin.html', '#d-q');
  ok('1. a lead opens Sunday check-in at the desk', J(await S.$$eval('[data-tab]', b => b.map(x => x.textContent))) === J(['Desk', 'First time here', 'Groups']));
  await val(S, '#d-q', '900 111');
  await S.waitForSelector('[data-fam="fam_1"]');
  ok('   found by part of the parent\'s phone: the whole family, both ticked', J(await S.$$eval('[data-fam="fam_1"] .d-tick:checked', x => x.map(e => e.value))) === J(['kc_ada', 'kc_ben']));
  ok('   with Ada\'s allergy flag and each child\'s group', /Ada Synthetic Little ones Allergies/.test(await text(S, '[data-fam="fam_1"]')) && /Ben Synthetic Juniors/.test(await text(S, '[data-fam="fam_1"]')), await text(S, '[data-fam="fam_1"]'));
  await tap(S, '[data-checkin="fam_1"]');
  const two = await until(async () => { const c = await cks(); return c.length === 2 ? c : null; });
  const ada = two && two.find(c => c.signupKey === 'kc_ada'), ben = two && two.find(c => c.signupKey === 'kc_ben');
  ok('   two check-ins in E1\'s check-in, one per child, each in their own group\'s session for today',
    ada && ben && ada.calEventId === 'kids_kg_little_' + DAY && ben.calEventId === 'kids_kg_junior_' + DAY && ada.kind === 'child' && ada.id === 'kids_kg_little_' + DAY + '__kc_ada__0' && ada.roomId === 'room_little', J(two));
  ok('   one collection code for the family', ada && /^[A-HJKMNP-Z2-9]{4}$/.test(ada.pickupCode) && ada.pickupCode === ben.pickupCode, ada && ada.pickupCode + ' / ' + ben.pickupCode);
  const CODE = ada.pickupCode;
  await S.waitForSelector('#labels .label');
  const labels = await S.$$eval('#labels .label:not(.slip)', x => x.map(e => e.innerText.replace(/\s+/g, ' ')));
  ok('   labels: name, group, the allergy flag only where there is one, and the code', labels.length === 2 && /Ada Synthetic Little ones .*ALLERGY: ask a leader/.test(labels[0]) && labels[0].includes(CODE)
    && /Ben Synthetic Juniors/.test(labels[1]) && !/ALLERGY/.test(labels[1]) && labels[1].includes(CODE), J(labels));
  ok('   and the parent\'s slip, with the code and the family QR for next week', (await text(S, '[data-slip]')).includes(CODE) && !!(await S.$('[data-slip] svg')) && /ABC234/.test(await text(S, '[data-slip]')));
  ok('   no medical details on a label', !/Peanuts|EpiPen/.test(await text(S, '#labels')));
  await hideBanner(S);
  await S.setViewport({ width: 375, height: 1200 });
  await S.screenshot({ path: path.join(HERE, 'k2-desk-labels-375.png'), fullPage: true });
  await S.setViewport({ width: 1100, height: 900 });
  await val(S, '#d-q', '');
  await S.evaluate(() => window.__kidsScan('EGBCK1|ABC234'));
  await S.waitForSelector('[data-fam="fam_1"] [data-out]');
  ok('   the family QR finds them (as the camera would), now both in', (await S.$$('[data-fam="fam_1"] [data-out]')).length === 2 && /collection code/.test(await text(S, '[data-fam="fam_1"]')));
  await S.evaluate(() => window.__kidsScan('EGBC1|ev_x|abcdefghij|0'));
  ok('   an event ticket is not a family code', /not a family code/.test(await text(S, '#d-msg')));

  /* ---------- 2. the leader of Little ones ---------- */
  const lB = await as('lou', 375); const L = lB.page;
  await go(L, 'kids-checkin.html', '#g-ins');
  ok('2. the leader of Little ones sees only their group', J(await L.$$eval('[data-tab]', b => b.map(x => x.textContent))) === J(['Your group']) && !(await L.$('#g-pick')));
  const lt = await text(L, '#g-body');
  ok('   Ada is in, with her allergy flag; Ben (a Junior) is nowhere', /In now Ada Synthetic Allergies/.test(lt) && !/Ben/.test(lt), lt);
  ok('   the count: 1 in, 1 leader needed at 1 to 4', /^1 in now 1 leaders needed \(1 to 4\)/.test(lt), lt.slice(0, 80));
  await tap(L, '[data-more="kc_ada"]');
  await L.waitForSelector('[data-med="kc_ada"]');
  ok('   her medical details, and her parent\'s number on tap', /Peanuts: carries an EpiPen/.test(await text(L, '#modal')) && (await L.$eval('#modal a[href^="tel:"]', a => a.getAttribute('href'))) === 'tel:07700900111');
  await tap(L, '#m-page');
  ok('   "page a parent" shows the number to call, large, with a Call button', /Call Parent Synthetic to come to Little ones/.test(await text(L, '#pager')) && (await L.$eval('#pager a.btn', a => a.getAttribute('href'))) === 'tel:07700900111');
  await hideBanner(L);
  await L.screenshot({ path: path.join(HERE, 'k2-leader-375.png'), fullPage: true });
  await tap(L, '#m-close');
  const sneak = await L.evaluate((id) => Promise.all([
    EGBCAuth.db.collection('checkins').doc(id).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('checkins').where('groupId', '==', 'kg_junior').where('day', '==', EGBCCheckin.today()).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('kidsMedical').doc('kc_ben').get().then(() => 'read', e => e.code)]), ben.id);
  ok('   NEED TO KNOW: Little ones\' leader cannot open Ben\'s check-in, list Juniors\' morning, or read his medical details, even round the page', sneak.every(x => /permission/.test(x)), J(sneak));

  /* ---------- 3. check-out ---------- */
  await tap(L, '[data-gout="' + ada.id + '"]');
  await L.waitForSelector('#o-go');
  await L.$eval('[name="o-who"][value="__code"]', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
  await val(L, '#o-name', 'A Stranger'); await val(L, '#o-code', 'zzzz');
  await tap(L, '#o-go');
  await L.waitForSelector('#o-nomatch');
  ok('3. a stranger with the wrong code: refused, and told to find a lead and ring the parent', /does not match.*find a lead, and ring the parent/.test(await text(L, '#o-nomatch')));
  await tap(L, '#o-cancel');
  const forced = await L.evaluate((id) => EGBCCheckin.kidsOut({ id }, { collectedBy: 'A Stranger', listed: true }).then(() => 'out', e => e.code), ada.id);
  const forced2 = await L.evaluate((id) => EGBCAuth.db.collection('checkins').doc(id).update({ state: 'out', collectedBy: 'A Stranger', overrideReason: 'Says she is an aunt', updatedAt: 'x' }).then(() => 'out', e => e.code), ada.id);
  ok('   ROUND THE PAGE, THE RULES REFUSE IT TOO: claiming a stranger is listed, or giving a reason instead', /permission/.test(forced) && /permission/.test(forced2) && (await get('checkins', ada.id)).state === 'in', forced + ' / ' + forced2);
  await tap(L, '[data-gout="' + ada.id + '"]');
  await L.waitForSelector('#o-go');
  ok('   the list offered is the one on her record', J(await L.$$eval('[name="o-who"]', x => x.map(e => e.value))) === J(['Parent Synthetic', 'Grandma Invented', '__code']));
  await L.$eval('[name="o-who"][value="Grandma Invented"]', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
  await tap(L, '#o-go');
  const adaOut = await until(async () => { const c = await get('checkins', ada.id); return c.state === 'out' ? c : null; });
  ok('   Ada goes home with Grandma, who is on her list', adaOut && adaOut.collectedBy === 'Grandma Invented' && adaOut.collectorListed === true && adaOut.outBy === P.lou.uid, J(adaOut));
  await until(() => L.$('#g-outs'));
  ok('   and the leader\'s screen shows her gone home, live', /Gone home Ada Synthetic .*with Grandma Invented/.test(await text(L, '#g-body')) && /^0 in now/.test(await text(L, '#g-body')));
  await S.waitForSelector('[data-out="' + ben.id + '"]');
  await tap(S, '[data-out="' + ben.id + '"]');
  await S.waitForSelector('#o-go');
  await S.$eval('[name="o-who"][value="__code"]', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
  await val(S, '#o-name', 'Uncle Synthetic'); await val(S, '#o-code', CODE.toLowerCase().split('').join(' '));
  await tap(S, '#o-go');
  const benOut = await until(async () => { const c = await get('checkins', ben.id); return c.state === 'out' ? c : null; });
  ok('   Ben goes home with his uncle, not on the list, who has the code from the slip', benOut && benOut.collectedBy === 'Uncle Synthetic' && benOut.codeGiven === CODE && benOut.collectorListed === false, J(benOut));
  await lB.close();

  /* ---------- 4. another team's admin, and the roll-call ---------- */
  const wB = await as('wes'); const W = wB.page;
  await go(W, 'kids-checkin.html', '#noaccess');
  ok('4. an admin of another team (Worship) cannot open Sunday check-in', /children's team leads and each group's leaders/.test(await text(W, '#noaccess')));
  const wsneak = await W.evaluate((id, day) => Promise.all([
    EGBCAuth.db.collection('checkins').doc(id).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('checkins').where('day', '==', day).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('kidsChildren').doc('kc_ada').get().then(() => 'read', e => e.code)]), ada.id, DAY);
  ok('   nor read a child\'s check-in or record round the page', wsneak.every(x => /permission/.test(x)), J(wsneak));
  /* Ben back in, so somebody is in the building for the roll-call. */
  await val(S, '#d-q', 'Ben');
  await S.waitForSelector('[data-fam="fam_1"] .d-tick[value="kc_ben"]');
  await check(S, '[data-fam="fam_1"] .d-tick[value="kc_ada"]', false);
  await tap(S, '[data-checkin="fam_1"]');
  const benBack = await until(async () => { const c = await get('checkins', ben.id); return c.state === 'in' ? c : null; });
  ok('   (Ben back in later: the same record, the same code)', benBack && benBack.pickupCode === CODE);
  await go(W, 'checkin.html?view=rollcall', '#wrap h1');
  await until(async () => /Roll-call/.test(await text(W, '#wrap')));
  await sleep(800);
  ok('   the fire roll-call still opens for that admin, without the children in it', /Roll-call/.test(await text(W, '#wrap')) && !/Ben Synthetic/.test(await text(W, '#wrap')) && !/Could not load/.test(await text(W, '#wrap')), await text(W, '#wrap'));
  await wB.close();
  const kB = await as('karen'); const KA = kB.page;
  await go(KA, 'checkin.html?view=rollcall', '#wrap h1');
  const rc = await until(async () => { const t = await text(KA, '#wrap'); return /Ben Synthetic/.test(t) ? t : null; });
  ok('   a master admin\'s roll-call has Ben, in his room', rc && /Test Junior Room/.test(rc) && /Sunday children's groups/.test(rc), rc || await text(KA, '#wrap'));
  await kB.close();

  /* ---------- 5. first time here ---------- */
  await tap(S, '[data-tab="visitor"]');
  await S.waitForSelector('#v-go');
  await S.evaluate(() => { window.__egbcOutbox.length = 0; });
  await tap(S, '#v-go');
  ok('5. the door form says what is still needed', /Still needed: the child's name, their school year, the parent's name, the parent's phone number, the parent's consent/.test(await text(S, '#v-err')), await text(S, '#v-err'));
  await val(S, '#v-child-0', 'Vic Visitor'); await S.select('#v-year-0', 'Year 1'); await val(S, '#v-allergy-0', 'Dairy (invented)');
  await tap(S, '#v-more'); await val(S, '#v-child-1', 'Wyn Visitor'); await S.select('#v-year-1', 'Year 5');
  await val(S, '#v-parent', 'Val Visitor'); await val(S, '#v-phone', '07700 900444'); await val(S, '#v-email', 'val@example.invalid');
  await check(S, '#v-consent', true);
  await tap(S, '#v-go');
  await S.waitForSelector('#v-sent', { timeout: 20000 });
  const vfam = (await readDb(db => getDocs(query(collection(db, 'kidsFamilies'), where('parentName', '==', 'Val Visitor'))))).docs[0];
  const vkids = (await readDb(db => getDocs(query(collection(db, 'kidsChildren'), where('familyId', '==', vfam.id))))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  ok('   a new family and two children, each in the group for their year, marked visitors with consent for today',
    vfam.data().visitor === true && vkids.length === 2 && vkids[0].groupId === 'kg_little' && vkids[1].groupId === 'kg_junior' && vkids.every(c => c.status === 'visitor' && c.consentUntil === DAY)
    && J(vkids[0].collectors) === J(['Val Visitor']), J(vkids.map(c => [c.name, c.groupId, c.status, c.consentUntil])));
  ok('   Vic\'s allergy goes into her medical copy, and a flag on her', (await get('kidsMedical', vkids[1 - 1].id)).allergies === 'Dairy (invented)' && vkids[0].flags.allergies === true);
  const vcks = (await cks()).filter(c => c.familyId === vfam.id);
  ok('   both checked in, with one code', vcks.length === 2 && vcks.every(c => c.state === 'in' && c.pickupCode === vcks[0].pickupCode));
  ok('   their labels', (await S.$$('#labels .label:not(.slip)')).length === 2 && /Vic Visitor Little ones .*ALLERGY/.test(await text(S, '#labels')));
  const mail = await until(async () => { const o = await outbox(S); return o.length ? o : null; });
  const req = (await readDb(db => getDocs(query(collection(db, 'formRequests'), where('email', '==', 'val@example.invalid'))))).docs.map(d => d.data())[0];
  ok('   the full registration form is emailed to fill in at home (to the outbox: nothing leaves the machine)', mail && mail.length === 1 && mail[0].to[0] === 'val@example.invalid'
    && req && req.formId === 'form_kids_site_t' && J(req.subjects) === J(['Vic Visitor', 'Wyn Visitor']), J({ mail: mail && mail.map(m => m.to), req }));
  await hideBanner(S);
  await S.setViewport({ width: 375, height: 1200 });
  await S.screenshot({ path: path.join(HERE, 'k2-first-time-375.png'), fullPage: true });
  await S.setViewport({ width: 1100, height: 900 });
  const lB2 = await as('lou'); const L2 = lB2.page;
  await go(L2, 'kids-checkin.html', '#g-ins');
  ok('   Little ones\' leader sees Vic arrive in their group (and not Wyn, a Junior)', /Vic Visitor Allergies ?Visitor/.test(await text(L2, '#g-ins')) && !/Wyn/.test(await text(L2, '#g-body')), await text(L2, '#g-body'));
  await lB2.close();

  /* ---------- 6. a new collector, for the whole family ---------- */
  await go(S, 'kids-admin.html', '[data-open="kc_ben"]');
  await tap(S, '[data-open="kc_ben"]');
  await S.waitForSelector('[data-detail="kc_ben"] .d-coll');
  await val(S, '[data-detail="kc_ben"] .d-coll', 'Parent Synthetic, Grandma Invented, Uncle Synthetic');
  await tap(S, '[data-detail="kc_ben"] .d-save');
  await until(async () => ((await get('kidsChildren', 'kc_ada')).collectors || []).length === 3);
  ok('6. a lead adds a collector on the register: Ben, his sister and the family record all change',
    J((await get('kidsChildren', 'kc_ben')).collectors) === J(['Parent Synthetic', 'Grandma Invented', 'Uncle Synthetic']) && (await get('kidsChildren', 'kc_ada')).collectors.length === 3 && (await get('kidsFamilies', 'fam_1')).collectors.length === 3);
  ok('   and the register links to Sunday check-in', (await S.$eval('#k-sunday', a => a.getAttribute('href'))) === 'kids-checkin.html');
  await sB.close();
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
