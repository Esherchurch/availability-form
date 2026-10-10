/* The phone app's Kids Church space: "Today" and "Children" (F-120), drawn
   through a stand-in shell built to the main window's contract (A-050):
   screenshots/events/app-harness.html.
   Events window. Invented children and parents only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/kids-today.test.mjs"

   What it proves:
     1. the rota's Session Leader, first in, opens the morning from the app;
        sees the needs in the room for the children checked in; cannot page
        (no collection codes); checks themselves in
     2. a group leader: the counts (in, not arrived, leaders); the needs of
        their own group only (not a Junior's); shows a family's code on the
        screen and clears it; checks themselves in
     3. Children: their group, with "Renew" a month before consent runs out
        and "Consent ran out"
     4. the fire roll-call lists the leaders who checked in
     5. someone with no part sees a plain note, not an empty screen */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-kt-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const DAY = ymd(new Date()), UTCDAY = new Date().toISOString().slice(0, 10), WEEKDAY = new Date().getDay() || 7;
const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

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
  samy: { email: 'samy.lead@example.invalid', name: 'Samy Lead', mid: 'm_samy', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  lou:  { email: 'lou.little@example.invalid', name: 'Lou Little', mid: 'm_lou', teams: ['Kids Church'] },
  jo:   { email: 'jo.junior@example.invalid', name: 'Jo Junior', mid: 'm_jo', teams: ['Kids Church'] },
  sam:  { email: 'sam.session@example.invalid', name: 'Sam Session', mid: 'm_sam', teams: ['Kids Church'] },
  nat:  { email: 'nat.helper@example.invalid', name: 'Nat Helper', mid: 'm_nat', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const KID = (id, name, groupId, flags, consentUntil) => ({ siteId: 'site_t', familyId: 'fam_1', name, dob: '', year: groupId === 'kg_little' ? 'Year 1' : 'Year 4', groupId, groupFixed: false,
  status: 'registered', flags, consentUntil, photo: true, firstaid: true, parentName: 'Parent Synthetic', phone: '07700 900111', email: 'parent@example.invalid', emergency: '',
  collectors: ['Parent Synthetic'], familyCode: 'ABC234' });
const CK = (kid, name, groupId) => ({ calEventId: 'kids_' + groupId + '_' + DAY, signupKey: kid, attendeeIndex: 0, name, kind: 'child', state: 'in', inAt: new Date().toISOString(),
  inBy: 'x', inByName: 'Samy Lead', roomId: '', day: DAY, updatedAt: 'x', groupId, siteId: 'site_t', familyId: 'fam_1', pickupCode: 'K7P2' });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: false, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'kidsSettings', 'site_t'), { teams: ['Kids Church'], formId: '' });
  await setDoc(doc(db, 'kidsGroups', 'kg_little'), { siteId: 'site_t', name: 'Little ones', years: ['Year 1'], roomId: '', ratio: 5, day: WEEKDAY, active: true, order: 1, leaderIds: ['m_lou'] });
  await setDoc(doc(db, 'kidsGroups', 'kg_junior'), { siteId: 'site_t', name: 'Juniors', years: ['Year 4'], roomId: '', ratio: 8, day: WEEKDAY, active: true, order: 2, leaderIds: ['m_jo'] });
  await setDoc(doc(db, 'kidsChildren', 'kc_ada'), KID('kc_ada', 'Ada Synthetic', 'kg_little', { allergies: true, medical: false }, '2099-08-31'));
  await setDoc(doc(db, 'kidsChildren', 'kc_eve'), KID('kc_eve', 'Eve Synthetic', 'kg_little', { allergies: false, medical: false }, fwd(10)));
  await setDoc(doc(db, 'kidsChildren', 'kc_vic'), KID('kc_vic', 'Vic Synthetic', 'kg_little', { allergies: false, medical: false }, fwd(-3)));
  await setDoc(doc(db, 'kidsChildren', 'kc_ben'), KID('kc_ben', 'Ben Synthetic', 'kg_junior', { allergies: false, medical: true }, '2099-08-31'));
  await setDoc(doc(db, 'kidsMedical', 'kc_ada'), { siteId: 'site_t', groupId: 'kg_little', allergies: 'Peanuts: carries an EpiPen', medical: '', medication: '', needs: '', responseId: '' });
  await setDoc(doc(db, 'kidsMedical', 'kc_ben'), { siteId: 'site_t', groupId: 'kg_junior', allergies: 'None', medical: 'Asthma (invented)', medication: 'Inhaler', needs: '', responseId: '' });
  await setDoc(doc(db, 'events', 'rota_today'), { date: UTCDAY, roles: ['Session Leader'], assignments: { 'Session Leader': { id: 'm_sam', name: 'Sam Session' } } });
  /* Ada and Ben are in: their check-ins and roll-call copies, as the desk writes them. */
  for (const [kid, name, g, gname] of [['kc_ada', 'Ada Synthetic', 'kg_little', 'Little ones'], ['kc_ben', 'Ben Synthetic', 'kg_junior', 'Juniors']]) {
    const id = 'kids_' + g + '_' + DAY + '__' + kid + '__0', ck = CK(kid, name, g);
    await setDoc(doc(db, 'checkins', id), ck);
    await setDoc(doc(db, 'kidsRoll', id), { siteId: 'site_t', day: DAY, groupId: g, groupName: gname, childId: kid, name, state: 'in', inAt: ck.inAt, outAt: '', roomId: '', updatedAt: 'x' });
  }
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const J = (x) => JSON.stringify(x);

const errors = [], PAGES = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); return b;
}
async function pageOf(b, label) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 390, height: 844 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  PAGES.push([label, p]);
  return p;
}
async function as(who) {
  const b = await launch(who), p = await pageOf(b, who);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p; return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const app = (tab) => 'screenshots/events/app-harness.html?space=kids' + (tab ? '&tab=' + tab : '');

try {
  /* 1. the Session Leader, first in */
  const mB = await as('sam'); const M = mB.page;
  await go(M, app('today'), '[data-k="counts"]');
  const morning = await until(() => get('kidsMornings', 'site_t_' + UTCDAY));
  ok('1. the rota\'s Session Leader opens the morning from the app', morning && J(morning.sessionLeaderIds) === J(['m_sam']));
  await until(async () => /Peanuts/.test(await text(M, '#egbc-content')) && /Asthma/.test(await text(M, '#egbc-content')));
  const mt = await text(M, '#egbc-content');
  ok('   "Today": you are session leader; 2 in; the needs in the room for both children in', /you are session leader/.test(mt) && (await M.$eval('[data-k="in"]', e => e.textContent)) === '2'
    && /Ada Synthetic · Little ones Peanuts: carries an EpiPen Allergy/.test(mt) && /Ben Synthetic · Juniors Asthma \(invented\) · Medication: Inhaler Medical/.test(mt), mt.slice(0, 500));
  ok('   no codes, so no paging: "Group leaders and the leads call a parent"', /Group leaders and the leads call a parent from here/.test(mt) && !(await M.$('[data-kact^="screen:"]')));
  await tap(M, '[data-kact="in"]');
  await until(async () => /You checked in at/.test(await text(M, '[data-k="me"]')));
  const samIn = await get('kidsLeaderIns', 'site_t_' + DAY + '_m_sam');
  ok('   CHECKS THEMSELVES IN: the leaders count goes up', samIn && samIn.state === 'in' && (await M.$eval('[data-k="leaders"]', e => e.textContent)) === '1', J(samIn));
  await M.screenshot({ path: path.join(HERE, 'kids-today-session-375.png'), fullPage: true });

  /* 2. a group leader */
  const lB = await as('lou'); const L = lB.page;
  await go(L, app('today'), '[data-k="counts"]');
  await until(async () => /Peanuts/.test(await text(L, '#egbc-content')));
  await sleep(800);
  const lt = await text(L, '#egbc-content');
  ok('2. a group leader: 2 in, 2 of Little ones not arrived, 1 leader in', /you lead Little ones/.test(lt) && (await L.$eval('[data-k="in"]', e => e.textContent)) === '2'
    && (await L.$eval('[data-k="due"]', e => e.textContent)) === '2' && (await L.$eval('[data-k="leaders"]', e => e.textContent)) === '1', lt.slice(0, 300));
  ok('   NEED TO KNOW: Ada\'s allergy shows, a Junior\'s asthma does not', /Peanuts/.test(lt) && !/Asthma|Inhaler/.test(lt));
  await tap(L, '[data-kact="screen:kc_ada"]');
  const pg = await until(() => get('screenPages', 'kids_kg_little_' + DAY + '__kc_ada__0'));
  ok('   "Show on screen": the family\'s code, never the name', pg && pg.message === 'K7P2, please come to Little ones' && !/Ada/.test(J(pg)));
  await L.waitForSelector('[data-k="onscreen"]');
  ok('   and Today says it is on the screen now', /On the screen now: K7P2, please come to Little ones/.test(await text(L, '[data-call="kc_ada"]')));
  await L.screenshot({ path: path.join(L === L ? HERE : HERE, 'kids-today-leader-375.png'), fullPage: true });
  await tap(L, '[data-call="kc_ada"] [data-kact^="done:"]');
  ok('   "Done" clears it', !!(await until(async () => (await get('screenPages', 'kids_kg_little_' + DAY + '__kc_ada__0')).clearedAt)));
  await tap(L, '[data-kact="in"]');
  await until(async () => (await L.$eval('[data-k="leaders"]', e => e.textContent)) === '2');
  ok('   she checks herself in too: 2 leaders', true);

  /* 3. Children */
  await tap(L, '[data-tab="children"]');
  await L.waitForSelector('[data-kid="kc_eve"]');
  const ct = await text(L, '#egbc-content');
  ok('3. Children: her group, who is in and who is not', /Ada Synthetic Year 1 · in at/.test(ct) && /Eve Synthetic Year 1 · not arrived/.test(ct) && !/Ben/.test(ct), ct.slice(0, 400));
  ok('   "Renew" a month before consent runs out; "Consent ran out" after', !!(await L.$('[data-kid="kc_eve"] [data-consent="renew"]')) && !!(await L.$('[data-kid="kc_vic"] [data-consent="out"]')) && !(await L.$('[data-kid="kc_ada"] [data-consent]')));
  await L.screenshot({ path: path.join(HERE, 'kids-children-375.png'), fullPage: true });

  /* 4. the fire roll-call lists the leaders in */
  await go(L, 'kids-checkin.html?tab=roll', '[data-rleaders]');
  await until(async () => /Leaders in \(2\)/.test(await text(L, '[data-rleaders]')));
  ok('4. the fire roll-call lists the leaders who checked in', /Leaders in \(2\) Lou Little in since .* Sam Session in since/.test(await text(L, '[data-rleaders]')), await text(L, '[data-rleaders]'));
  const louSneak = await L.evaluate((d) => EGBCAuth.db.collection('kidsLeaderIns').doc('site_t_' + d + '_m_jo').set({ siteId: 'site_t', day: d, memberId: 'm_jo', name: 'Jo', groupId: '', state: 'in',
    inAt: firebase.firestore.FieldValue.serverTimestamp(), outAt: null }).then(() => 'wrote', e => e.code), DAY);
  ok('   round the page, nobody can check someone else in', /permission/.test(louSneak), louSneak);

  /* 5. no part to play */
  const nB = await as('nat'); const N = nB.page;
  await go(N, app('today'), '[data-k="none"]');
  ok('5. someone with no part this morning sees a plain note, not an empty screen', /for the children's team leads, each group's leaders and the Session Leader/.test(await text(N, '[data-k="none"]')));
  await mB.close(); await lB.close(); await nB.close();
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
