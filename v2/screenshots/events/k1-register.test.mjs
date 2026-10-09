/* Chunk 6, stage 1 — Sunday kids: groups, child profiles and households,
   registration through the parent consent form.
   Events window. Invented children and parents only, events emulators only,
   network guard, no email leaves the machine.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/k1-register.test.mjs"

   What it proves:
     1. an admin names the children's team (Kids Church), sets up the
        registration form from the parent consent form, and two groups by
        school year
     2. a member on no children's team cannot open the register
     3. someone on Kids Church sends the form; a parent fills it in for two
        children
     4. the completed form becomes a family and its children, each in the
        group for their school year (worked out from the date of birth when
        left blank), with allergy flags and the private medical half behind
        "Show medical details"
     5. a child moved by hand stays put when a group changes
     6. next year's form refreshes the family: nobody is on the register twice */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-r3-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

/* Dates: Wednesdays from at least a fortnight away (W[0] to W[5]), and the
   Thursday after the first (T[0] to T[6]). */
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const base = new Date(); base.setHours(12, 0, 0, 0); base.setDate(base.getDate() + 14);
while (base.getDay() !== 3) base.setDate(base.getDate() + 1);
const plus = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return ymd(d); };
const W = [0, 7, 14, 21, 28, 35].map(plus), T = [1, 8, 15, 22, 29, 36, 43].map(plus);

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
  karen: { email: 'karen.admin@example.invalid', name: 'Karen Admin', mid: 'm_karen', admin: true },
  samy:  { email: 'samy.member@example.invalid', name: 'Samy Member', mid: 'm_samy' },
  lena:  { email: 'lena.office@example.invalid', name: 'Lena Office', mid: 'm_lena' },
  lou:   { email: 'lou.little@example.invalid', name: 'Lou Little', mid: 'm_lou' },
  jo:    { email: 'jo.junior@example.invalid', name: 'Jo Junior', mid: 'm_jo' },
  sid:   { email: 'sid.helper@example.invalid', name: 'Sid Helper', mid: 'm_sid' }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const ROOM = (name, extra) => ({ siteId: 'site_t', name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
  bookableByMembers: true, bookableByHirers: false, description: '', photoUrl: '', ...(extra || {}) });
const TEAMS = { karen: ['Core Team'], samy: ['Kids Church'], lena: ['Worship'], lou: ['Kids Church'], jo: ['Kids Church'], sid: ['Kids Church'] };
/* Need to know (F-087): Samy is an admin of Kids Church, so a lead; Lou and Jo
   will lead a group each; Sid is on Kids Church and leads none. */
const ADMINFOR = { samy: ['Kids Church'] };
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: TEAMS[k], adminFor: ADMINFOR[k] || [], masterAdmin: !!x.admin });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: TEAMS[k], adminFor: ADMINFOR[k] || [], masterAdmin: !!x.admin, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_little'), ROOM('Test Little Room', { order: 1 }));
  await setDoc(doc(db, 'rooms', 'room_junior'), ROOM('Test Junior Room', { order: 2 }));
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const bookings = (w) => readDb(db => getDocs(query(collection(db, 'bookings'), where(w[0], '==', w[1]))).then(s => s.docs.map(d => ({ key: d.id, ...d.data() }))));
const range = (sl, a, b) => sl.slice(a, b);
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
const ics = (m) => { const a = (m && m.attachments || []).find(x => x.filename === 'booking.ics'); return a ? Buffer.from(a.content, 'base64').toString('utf8') : ''; };
const events = (m) => (ics(m).match(/BEGIN:VEVENT/g) || []).length;
async function pick(p, room, day, slot) {
  await p.waitForSelector(`.bk-row[data-room="${room}"][data-day="${day}"] [data-slot="${slot}"]`, { timeout: 15000 });
  await tap(p, `.bk-row[data-room="${room}"][data-day="${day}"] [data-slot="${slot}"]`);
  await p.waitForSelector('#bf-title');
}
const settled = (p) => until(() => p.evaluate(() => !!document.querySelector('[data-made]') || document.getElementById('toast').style.display === 'block'), 15000);
const goReady = (p, label) => until(() => p.$eval('#f-go', (e, l) => !e.disabled && (!l || e.textContent === l), label), 15000);
const toastText = (p) => until(() => p.evaluate(() => { const t = document.getElementById('toast'); return t.style.display === 'block' ? t.textContent : ''; }), 15000);

try {
  /* ---------- 1. the admin sets it up ---------- */
  const kB = await as('karen'); const K = kB.page;
  await go(K, 'kids-admin.html', '[data-tab="settings"]');
  await tap(K, '[data-tab="settings"]');
  await K.waitForSelector('.s-team[value="Kids Church"]');
  await check(K, '.s-team[value="Kids Church"]', true);
  await tap(K, '#s-save');
  await until(async () => J(((await get('kidsSettings', 'site_t')) || {}).teams) === J(['Kids Church']));
  await K.waitForSelector('#s-form-go');
  await tap(K, '#s-form-go');
  const ks = await until(async () => { const x = await get('kidsSettings', 'site_t'); return x && x.formId ? x : null; });
  const form = ks && await get('forms', ks.formId);
  ok('1. the children\'s team is Kids Church; the registration form is made from the parent consent form', form && form.template === 'parent' && form.validity.mode === 'months' && form.validity.months === 12 && form.fields.some(f => f.id === 'children'), J(ks));
  for (const [name, years, room, ratio, leader] of [['Little ones', ['Reception', 'Year 1', 'Year 2'], 'room_little', '4', 'm_lou'], ['Juniors', ['Year 3', 'Year 4', 'Year 5', 'Year 6'], 'room_junior', '8', 'm_jo']]) {
    await go(K, 'kids-admin.html', '[data-tab="groups"]'); await tap(K, '[data-tab="groups"]');
    await K.waitForSelector('#g-new'); await tap(K, '#g-new');
    await K.waitForSelector('#g-name');
    await val(K, '#g-name', name); await K.select('#g-room', room); await val(K, '#g-ratio', ratio);
    for (const y of years) await check(K, '.g-year[value="' + y + '"]', true);
    await K.select('#g-addlead', leader);
    await tap(K, '#g-save');
    await until(async () => (await readDb(db => getDocs(query(collection(db, 'kidsGroups'), where('name', '==', name))))).size === 1);
  }
  const groups = (await readDb(db => getDocs(collection(db, 'kidsGroups')))).docs.map(d => ({ id: d.id, ...d.data() }));
  const little = groups.find(g => g.name === 'Little ones'), juniors = groups.find(g => g.name === 'Juniors');
  ok('   two groups, by school year, each with its room, ratio and leader', little && juniors && J(little.years) === J(['Reception', 'Year 1', 'Year 2']) && juniors.roomId === 'room_junior' && little.ratio === 4 && little.day === 7
    && J(little.leaderIds) === J(['m_lou']) && J(juniors.leaderIds) === J(['m_jo']), J(groups.map(g => g.leaderIds)));

  /* ---------- 2. not for everyone ---------- */
  const lB = await as('lena'); const L = lB.page;
  await go(L, 'kids-admin.html', '#noaccess');
  ok('2. a member on no children\'s team cannot open the register', /for the children's team/.test(await L.$eval('#noaccess', e => e.textContent)));

  /* ---------- 3. Kids Church sends the form; a parent fills it in ---------- */
  const sB = await as('samy'); const S = sB.page;
  await go(S, 'kids-admin.html', '[data-tab="registration"]');
  const dB = await as('sid'); const Dd = dB.page;
  await go(Dd, 'kids-admin.html', '#noaccess');
  ok('3. someone on Kids Church who leads no group sees nothing', /children's team leads/.test(await Dd.$eval('#noaccess', e => e.textContent)));
  await dB.close();
  async function sendTo(page) {
    await tap(page, '[data-tab="registration"]'); await page.waitForSelector('#r-name');
    await val(page, '#r-name', 'Parent Synthetic'); await val(page, '#r-email', 'parent@example.invalid');
    await page.evaluate(() => EGBCEmail.clearOutbox());
    await tap(page, '#r-send');
    const m = await until(async () => (await outbox(page)).find(x => x.to[0] === 'parent@example.invalid'));
    return m && (m.html.match(/href="[^"]*form\.html\?k=([a-z0-9]+)/) || [])[1];
  }
  const key1 = await sendTo(S);
  const req1 = key1 && await get('formRequests', key1);
  ok('   the form goes to the parent, from the children\'s team', req1 && req1.formId === ks.formId && req1.siteId === 'site_t' && req1.createdBy === P.samy.uid, J(req1));
  const gB = await launch('parent'); const G = await pageOf(gB, 'parent', 390);
  async function fillForm(key, adaAllergy) {
    await go(G, 'form.html?k=' + key, '#go');
    await G.waitForSelector('[data-addrow="children"]');
    await tap(G, '[data-addrow="children"]');
    await G.waitForSelector('#f_children__1__name');
    const kids = [['Ada Synthetic', '2020-06-01', 'Year 1', adaAllergy, 'none', 'Yes'], ['Ben Synthetic', '2017-11-02', '', 'None', 'n/a', 'No']];
    for (let i = 0; i < 2; i++) {
      const [n, dob, yr, al, med, photo] = kids[i];
      await val(G, '#f_children__' + i + '__name', n); await val(G, '#f_children__' + i + '__dob', dob);
      if (yr) await val(G, '#f_children__' + i + '__year', yr);
      await val(G, '#f_children__' + i + '__allergies', al); await val(G, '#f_children__' + i + '__medical', med);
      await val(G, '#f_children__' + i + '__photo', photo); await val(G, '#f_children__' + i + '__firstaid', 'Yes');
    }
    await val(G, '#f_parentName', 'Parent Synthetic'); await val(G, '#f_parentPhone', '07700 900111');
    await val(G, '#f_emergency', 'Aunt Invented 07700 900222, Uncle Invented 07700 900333'); await val(G, '#f_collectors', 'Grandma Invented');
    await val(G, '#f_sign_n', 'Parent Synthetic'); await tap(G, '#f_sign_a');
    await tap(G, '#go');
    return until(() => G.$eval('body', e => /Your form is in/.test(e.innerText)), 15000);
  }
  ok('   the parent fills it in for two children', !!(await fillForm(key1, 'Peanuts: carries an EpiPen')));

  /* ---------- 4. onto the register ---------- */
  await go(S, 'kids-admin.html', '[data-tab="registration"]');
  await tap(S, '[data-tab="registration"]');
  await S.waitForSelector('[data-add]');
  const card = await S.$eval('[data-resp]', e => e.innerText);
  ok('4. the completed form is ready to add: Ada to Little ones, Ben (year worked out) to Juniors', /Ada Synthetic \(Year 1 → Little ones\)/.test(card) && /Ben Synthetic \(Year 4 → Juniors\)/.test(card), card);
  await S.setViewport({ width: 375, height: 1000 });
  await S.screenshot({ path: path.join(HERE, 'k1-registration-375.png'), fullPage: true });
  await S.setViewport({ width: 1100, height: 900 });
  await tap(S, '[data-add]');
  const kids = await until(async () => { const l = (await readDb(db => getDocs(collection(db, 'kidsChildren')))).docs.map(d => ({ id: d.id, ...d.data() })); return l.length === 2 ? l : null; }, 15000);
  const fams = (await readDb(db => getDocs(collection(db, 'kidsFamilies')))).docs.map(d => ({ id: d.id, ...d.data() }));
  const ada = kids && kids.find(c => c.name === 'Ada Synthetic'), ben = kids && kids.find(c => c.name === 'Ben Synthetic');
  ok('   one family: the parent, their phone, a family code, and who may collect', fams.length === 1 && fams[0].phone === '07700 900111' && /^[A-HJKMNP-Z2-9]{6}$/.test(fams[0].familyCode) && J(fams[0].collectors) === J(['Parent Synthetic', 'Grandma Invented']), J(fams[0]));
  ok('   two children, each in their group', ada && ben && ada.groupId === little.id && ben.groupId === juniors.id && ben.year === 'Year 4');
  ok('   Ada flagged for allergies; Ben has no flags and no photos', ada.flags.allergies === true && ada.flags.medical === false && ben.flags.allergies === false && ben.photo === false);
  ok('   consent for a year from when it was given (Martin)', ada.consentUntil === (() => { const d = new Date(); d.setHours(12); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })() && ada.consentUntil === fams[0].consentUntil, ada.consentUntil);
  await go(S, 'kids-admin.html', `[data-open="${ada.id}"]`);
  const listText = await S.$eval('#body', e => e.innerText);
  ok('   the register lists both, with the flags', /Ada Synthetic[\s\S]*Allergies/.test(listText) && /Ben Synthetic[\s\S]*No photos/.test(listText));
  await tap(S, `[data-open="${ada.id}"]`);
  await S.waitForSelector(`[data-detail="${ada.id}"] .d-med`);
  await tap(S, `[data-detail="${ada.id}"] .d-med`);
  await S.waitForSelector(`[data-med="${ada.id}"]`);
  ok('   first-aid consent shows as the parent gave it (it is kept in the private half)', /First aid\s*Yes/.test(await S.$eval(`[data-detail="${ada.id}"]`, e => e.innerText)));
  ok('   "Show medical details" opens the private half: the EpiPen', /Peanuts: carries an EpiPen/.test(await S.$eval(`[data-med="${ada.id}"]`, e => e.innerText)));
  await S.setViewport({ width: 375, height: 1400 });
  await S.screenshot({ path: path.join(HERE, 'k1-children-375.png'), fullPage: true });
  await S.setViewport({ width: 1100, height: 900 });

  /* ---------- need to know (Martin, F-087) ---------- */
  const louB = await as('lou'); const LO = louB.page;
  await go(LO, 'kids-admin.html', '[data-child]');
  const louSees = await LO.evaluate(() => [...document.querySelectorAll('[data-child]')].map(x => x.innerText.split('\n')[0]));
  ok('NEED TO KNOW: the leader of Little ones sees Ada, and not Ben (a Junior)', louSees.length === 1 && /Ada Synthetic/.test(louSees[0]), J(louSees));
  ok('   and only the one tab: their group', J(await LO.evaluate(() => [...document.querySelectorAll('[data-tab]')].map(x => x.textContent))) === J(['Your group']));
  await tap(LO, `[data-open="${ada.id}"]`);
  await LO.waitForSelector(`[data-detail="${ada.id}"] .d-med`);
  await tap(LO, `[data-detail="${ada.id}"] .d-med`);
  await LO.waitForSelector(`[data-med="${ada.id}"]`);
  ok('   with Ada\'s medical details, and the parent\'s phone and collectors', /EpiPen/.test(await LO.$eval(`[data-med="${ada.id}"]`, e => e.innerText)) && /Grandma Invented/.test(await LO.$eval(`[data-detail="${ada.id}"]`, e => e.innerText)));
  const sneak = await LO.evaluate((b) => Promise.all([
    EGBCAuth.db.collection('kidsMedical').doc(b).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('kidsChildren').doc(b).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('kidsFamilies').get().then(() => 'read', e => e.code)]), ben.id);
  ok('   THE LEADER OF LITTLE ONES CANNOT READ A JUNIOR\'S MEDICAL DETAILS, even round the page (nor Ben, nor the family records)', sneak.every(x => /permission/.test(x)), J(sneak));
  await LO.setViewport({ width: 375, height: 1200 });
  await LO.screenshot({ path: path.join(HERE, 'k1-leader-view-375.png'), fullPage: true });

  /* ---------- 5. moved by hand ---------- */
  await go(S, 'kids-admin.html', `[data-open="${ben.id}"]`);
  await tap(S, `[data-open="${ben.id}"]`);
  await S.waitForSelector(`[data-detail="${ben.id}"] .d-group`);
  await S.select(`[data-detail="${ben.id}"] .d-group`, little.id);
  await tap(S, `[data-detail="${ben.id}"] .d-save`);
  await until(async () => (await get('kidsChildren', ben.id)).groupId === little.id);
  ok('5. Ben moved by hand to Little ones', (await get('kidsChildren', ben.id)).groupFixed === true);
  await go(K, 'kids-admin.html', '[data-tab="groups"]'); await tap(K, '[data-tab="groups"]');
  await K.waitForSelector(`[data-gedit="${juniors.id}"]`); await tap(K, `[data-gedit="${juniors.id}"]`);
  await K.waitForSelector('#g-save'); await val(K, '#g-ratio', '9'); await tap(K, '#g-save');
  await until(async () => (await get('kidsGroups', juniors.id)).ratio === 9);
  await sleep(1000);
  ok('   and stays there when Juniors is changed', (await get('kidsChildren', ben.id)).groupId === little.id);
  ok('   his medical copy moved with him', (await get('kidsMedical', ben.id)).groupId === little.id);
  const joB = await as('jo'); const JO = joB.page;
  const moved = await JO.evaluate((b) => EGBCAuth.db.collection('kidsMedical').doc(b).get().then(() => 'read', e => e.code), ben.id);
  const louNow = await LO.evaluate((b) => EGBCAuth.db.collection('kidsMedical').doc(b).get().then(s => s.data().allergies, e => e.code), ben.id);
  ok('   now Little ones\' leader can read Ben\'s details, and Juniors\' leader cannot', /permission/.test(moved) && louNow === 'None', moved + ' / ' + louNow);
  await joB.close(); await louB.close();

  /* ---------- 6. next year's form ---------- */
  await go(S, 'kids-admin.html', '[data-tab="registration"]');
  const key2 = await sendTo(S);
  ok('6. next year: the form again', !!(await fillForm(key2, 'Peanuts and sesame: carries an EpiPen')));
  await go(S, 'kids-admin.html', '[data-tab="registration"]'); await tap(S, '[data-tab="registration"]');
  await S.waitForSelector('[data-add]');
  ok('   it says it updates the family already there', /Already on the register/.test(await S.$eval('[data-resp]', e => e.innerText)));
  await tap(S, '[data-add]');
  await until(async () => ((await readDb(db => getDocs(collection(db, 'kidsFamilies')))).docs[0].data().responseIds || []).length === 2, 15000);
  const kids2 = (await readDb(db => getDocs(collection(db, 'kidsChildren')))).docs.map(d => ({ id: d.id, ...d.data() }));
  ok('   still one family and two children: nobody twice', (await readDb(db => getDocs(collection(db, 'kidsFamilies')))).size === 1 && kids2.length === 2);
  ok('   Ben is still where he was moved; Ada\'s medical copy is the new one', kids2.find(c => c.id === ben.id).groupId === little.id && /sesame/.test((await get('kidsMedical', ada.id)).allergies));

  await kB.close(); await lB.close(); await sB.close(); await gB.close();
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
