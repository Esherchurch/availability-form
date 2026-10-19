/* SERMON MODE (F-229; Martin, 19 Oct). Events window. Invented people only,
   events emulators only (with the hub's functions), network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/sermon-planner.test.mjs"

   What it proves, at 375px:
     1. the preaching team (a Sermons group's leaders) plans a sermon FROM A
        SERVICE ON THE ROTA: the date, the speaker (events.speakerId), the
        description as the title, and the readers' passage come with it
     2. it is saved linked to the service (eventId, speakerId)
     3. THE OTHER WAY: sermonLinks/<service> is kept for the Preaching plan -
        title, series, passage, where the plan is - never the outline or notes
     4. the Preaching plan changes the speaker: the plan shows the new one,
        and saving keeps it (and the link follows)
     5. a service with a plan is not offered again
     6. the team reads only; someone else is refused; any volunteer may read
        the link, nobody may write it
     7. a plan deleted: its link goes; a children's plan never makes one */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-serm-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

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

await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  ryan: { name: 'Ryan Pastor (invented)', mid: 'm_ryan', teams: ['Preaching'] },
  pat:  { name: 'Pat Preacher (invented)', mid: 'm_pat', teams: ['Preaching'] },
  sue:  { name: 'Sue Team (invented)', mid: 'm_sue', teams: ['Preaching'] },
  mia:  { name: 'Mia Member (invented)', mid: 'm_mia', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.serm@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false, archived: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
await db.collection('teams').doc('Preaching').set({ name: 'Preaching', label: 'Preaching', rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7) + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const SUN = day(0), SUN2 = day(7);
await db.collection('events').doc('svc1').set({ date: SUN, type: 'Sunday Morning Worship', serviceTime: '10:30', publicTitle: 'Born of the Spirit (invented)', speaker: 'Pat Preacher (invented)', speakerId: 'm_pat',
  serviceLeader: 'Sue Team (invented)', readers: [{ name: 'Rita Reader (invented)', passage: 'John 3:1-8' }] });
await db.collection('events').doc('svc2').set({ date: SUN2, type: 'Sunday Morning Worship', serviceTime: '10:30', publicTitle: 'Light of the World (invented)', speaker: '', readers: [] });
await db.collection('events').doc('practice').set({ date: SUN, type: 'Band practice', publicTitle: 'Not a service' });
await db.collection('planGroups').doc('pg_serm').set({ name: 'Sermons', kind: 'sermon', leaderIds: ['m_ryan', 'm_pat'], teamName: 'Preaching', parts: ['Introduction', 'Point 1', 'Point 2', 'Application'], day: 0, order: 1 });
await db.collection('planGroups').doc('pg_kids').set({ name: 'Kids Church', kind: 'children', leaderIds: ['m_pat'], teamName: 'Kids Church', parts: ['Welcome'], day: 0, order: 2 });

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); localStorage.setItem('egbc_planner_group', 'pg_serm'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const setVal = (pg, sel, v) => pg.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const sermonPlans = async () => (await db.collection('planSessions').where('groupId', '==', 'pg_serm').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const linkOf = async (id) => { const d = await db.collection('sermonLinks').doc(id).get(); return d.exists ? d.data() : null; };

try {
  /* ---------- 1-2. a sermon from a service ---------- */
  const PA = await as('pat');
  await PA.goto(URLB + 'session-planner.html', { waitUntil: 'networkidle2' });
  await until(() => PA.$('#addWeek'));
  ok('1. THE PREACHING TEAM: "Plan a sermon for a service"', /Plan a sermon for a service/.test(await text(PA, '#addWeek')));
  await tap(PA, '#addWeek');
  await until(() => PA.$('[data-ev]'));
  const offered = await PA.$$eval('[data-ev]', e => e.map(x => x.getAttribute('data-ev')));
  ok('   it offers the services on the rota (not a band practice)', J(offered) === J(['svc1', 'svc2']), J(offered));
  await tap(PA, '[data-ev="svc1"]');
  await until(() => PA.$('#planSpeaker'));
  const card = await text(PA, '#fromPlan');
  ok('   FROM THE PREACHING PLAN: the date, the speaker, the description and the readers', /Speaker: Pat Preacher/.test(card) && /Born of the Spirit/.test(card) && /Rita Reader \(invented\) \(John 3:1-8\)/.test(card), card);
  ok('   the description is the title, the readers\' passage the passage; the outline\'s parts are the group\'s',
    (await PA.$eval('#sTitle', e => e.value)) === 'Born of the Spirit (invented)' && /John 3:1-8/.test(await text(PA, '#passageBox')) && (await PA.$$eval('.part', e => e.length)) === 4);
  ok('   no "who\'s on / away", no programme: a sermon, not a children\'s session', !(await PA.$('#onBox')) && !(await PA.$('#sProg')) && !!(await PA.$('#sSeries')));
  await setVal(PA, '#sSeries', 'Meeting Jesus (invented)');
  await tap(PA, '#save');
  await until(async () => /Saved/.test(await text(PA, '#sMsg')));
  const s1 = (await sermonPlans())[0];
  ok('2. SAVED, LINKED TO THE SERVICE: eventId, the date, the speaker\'s id', s1 && s1.eventId === 'svc1' && s1.date === SUN && s1.speakerId === 'm_pat' && s1.series === 'Meeting Jesus (invented)', J(s1));
  await PA.screenshot({ path: path.join(HERE, 'sermon-plan-375.png'), fullPage: true });

  /* ---------- 3. the other way ---------- */
  const l1 = await until(() => linkOf('svc1'));
  ok('3. THE OTHER WAY: the Preaching plan\'s link - title, series, passage, and where the plan is', l1 && l1.sessionId === s1.id && l1.title === 'Born of the Spirit (invented)' && l1.series === 'Meeting Jesus (invented)' && l1.passage === 'John 3:1-8', J(l1));
  ok('   never the outline or the notes', l1 && !('parts' in l1) && !('notes' in l1), J(l1));

  /* ---------- 4. the Preaching plan changes the speaker ---------- */
  await db.collection('events').doc('svc1').update({ speaker: 'Ryan Pastor (invented)', speakerId: 'm_ryan' });
  await PA.goto(URLB + 'session-planner.html?s=' + s1.id, { waitUntil: 'networkidle2' });
  await until(async () => /Ryan Pastor/.test(await text(PA, '#fromPlan')));
  ok('4. THE PREACHING PLAN CHANGES THE SPEAKER: the plan shows the new one, and says so', /Speaker: Ryan Pastor/.test(await text(PA, '#fromPlan')) && /has changed the date or the speaker/.test(await text(PA, '#sMsg')), await text(PA, '#sMsg'));
  await tap(PA, '#save');
  await until(async () => /Saved/.test(await text(PA, '#sMsg')));
  const s2 = (await sermonPlans())[0];
  const l2 = await until(async () => { const l = await linkOf('svc1'); return l && l.speakerId === 'm_ryan' ? l : null; });
  ok('   saved, the plan keeps the new speaker, and the link follows', s2.speakerId === 'm_ryan' && s2.speaker === 'Ryan Pastor (invented)' && !!l2, J({ s: s2.speakerId, l: l2 && l2.speakerId }));

  /* ---------- 5. not offered twice ---------- */
  await PA.evaluate(() => document.querySelector('#toTerm').click());
  await until(() => PA.$('#addWeek'));
  ok('   the term shows the speaker and the series', /Speaker: Ryan Pastor.*Meeting Jesus/.test(await text(PA, '#term')), await text(PA, '#term'));
  await tap(PA, '#addWeek');
  await until(() => PA.$('[data-ev]'));
  ok('5. A SERVICE WITH A SERMON PLAN IS NOT OFFERED AGAIN', J(await PA.$$eval('[data-ev]', e => e.map(x => x.getAttribute('data-ev')))) === J(['svc2']));
  await PA.keyboard.press('Escape');

  /* ---------- 6. who ---------- */
  const SU = await as('sue');
  await SU.goto(URLB + 'session-planner.html?s=' + s1.id, { waitUntil: 'networkidle2' });
  await until(() => SU.$('#sTitle'));
  ok('6. THE TEAM READS ONLY (no Save)', !(await SU.$('#save')) && (await SU.$eval('#sTitle', e => e.disabled)));
  const sw = await SU.evaluate((id) => EGBCAuth.db.collection('planSessions').doc(id).update({ title: 'Sue was here', updatedBy: EGBCAuth.user().uid }).then(() => 'written', e => e.code), s1.id);
  ok('   and the rules refuse her write', /permission/.test(sw), sw);
  const sl = await SU.evaluate(() => EGBCAuth.db.collection('sermonLinks').doc('svc1').get().then(d => d.exists ? 'read' : 'none', e => e.code));
  ok('   any volunteer may read the link (as the rota)', sl === 'read', sl);
  const lw = await PA.evaluate(() => EGBCAuth.db.collection('sermonLinks').doc('svc1').set({ title: 'Forged' }).then(() => 'written', e => e.code));
  ok('   NOBODY WRITES A LINK, not even the preaching team (only the server)', /permission/.test(lw), lw);
  const MI = await as('mia');
  await MI.goto(URLB + 'session-planner.html?s=' + s1.id, { waitUntil: 'networkidle2' });
  await until(async () => /This page is for/.test(await text(MI)));
  const ml = await MI.evaluate(() => EGBCAuth.db.collection('sermonLinks').doc('svc1').get().then(() => 'read', e => e.code));
  ok('   someone else: the page refuses, the plan and the link are not theirs to read', /This page is for/.test(await text(MI)) && /permission/.test(ml), ml);

  /* ---------- 7. links come and go ---------- */
  await db.collection('planSessions').doc('kid_1').set({ groupId: 'pg_kids', date: SUN2, eventId: 'svc2', title: 'A children\'s plan', parts: [], updatedBy: 'x' });
  await sleep(2500);
  ok('7. A CHILDREN\'S PLAN NEVER MAKES A PREACHING-PLAN LINK', !(await linkOf('svc2')));
  await db.collection('planSessions').doc(s1.id).delete();
  ok('   a sermon plan deleted: its link goes', !!(await until(async () => !(await linkOf('svc1')))));

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
