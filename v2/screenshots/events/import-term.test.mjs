/* IMPORTING A TERM INTO THE SESSION PLANNER (Martin, 19 Oct: Karen's
   "Autumn 2026 Church rota"). Events window. Events emulators only; the
   group is invented to match the live one's shape; no name from the
   document is ever written.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/import-term.test.mjs"

   Proves: the dry run writes nothing and lists every row; --write makes one
   plan per row (date, title, code, the programme's link, special weeks);
   who's on and away come from the rota and availability, never the
   document; a second run makes nothing; it won't write live without --live;
   the planner shows the term (375px). Needs the .docx at its usual place
   (Downloads); it is read, never copied into the repo. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const DOCX = process.env.TERM_DOCX || 'C:/Users/marti/Downloads/Autumn 2026 Church rota.docx';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const J = (x) => JSON.stringify(x);
const run = (...args) => { try { return execFileSync(process.execPath, [path.join(V2, 'tools', 'import-planner-term.mjs'), ...args], { cwd: V2, encoding: 'utf8', env: process.env }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };

await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const GID = 'Xm3vrZe6ksKjRUPWiZ6u';
await db.collection('planGroups').doc(GID).set({ name: 'Kids Church', kind: 'children', teamName: 'Kids Church', siteId: 'site_cs_esher-green-baptist-church', leaderIds: ['m_lead1', 'm_lead2'],
  programmes: [{ name: 'Urban Saints', link: 'https://example.invalid/urban-saints/{code}' }], parts: ['Welcome', 'Game', 'Story', 'Craft', 'Prayer'], day: 0, order: 1 });
await db.collection('addressBook').doc('m_lead1').set({ name: 'Lea Leader (invented)', markers: ['Kids Church'] });
await db.collection('addressBook').doc('m_lead2').set({ name: 'Leo Leader (invented)', markers: ['Kids Church'] });
await db.collection('addressBook').doc('m_kid1').set({ name: 'Kit Helper (invented)', markers: ['Kids Church'] });
/* the rota for one Sunday, and someone away */
await db.collection('events').doc('svc_0920').set({ date: '2026-09-20', type: 'Sunday Morning Worship', assignments: { 'Leader (Younger)': { id: 'm_lead1', name: 'Lea Leader (invented)' }, 'Helper 1': { id: 'm_kid1', name: 'Kit Helper (invented)' }, 'Worship Leader': { id: 'm_x', name: 'X' } } });
await db.collection('availability').doc('a1').set({ eventId: 'svc_0920', memberId: 'm_lead2', status: 'unavailable' });
/* a week already planned by hand: left alone */
await db.collection('planSessions').doc('by_hand').set({ groupId: GID, date: '2026-10-18', title: 'Planned by hand (invented)', parts: [], updatedBy: 'x' });
const all = async () => (await db.collection('planSessions').where('groupId', '==', GID).get()).docs.map(d => ({ id: d.id, ...d.data() }));

try {
  const dry = run('--docx', DOCX, '--group', GID);
  ok('1. THE DRY RUN lists all 20 rows and writes nothing', /DRY RUN/.test(dry) && /Would make 19, left alone 1/.test(dry) && (await all()).length === 1, dry);
  ok('   it shows the codes, the links, the special weeks', /EJ03 Born again\?/.test(dry) && /urban-saints\/EJ03/.test(dry) && /SPECIAL: Preparation for family nativity/.test(dry) && /NO SESSION: Family nativity service/.test(dry) && /NO SESSION: No church service/.test(dry), dry);
  ok('   NOT A NAME FROM THE DOCUMENT in what it prints', !/Karen|Lois|Maya|Samy|Simon|Matei|Amelie|Caleb/.test(dry));
  const w1 = run('--docx', DOCX, '--group', GID, '--write');
  const docs = await all();
  ok('2. WRITTEN: one plan per row (19 new, the hand-made week left alone)', /Made 19, left alone 1/.test(w1) && docs.length === 20 && docs.find(d => d.id === 'by_hand').title === 'Planned by hand (invented)', w1);
  const d = (date) => docs.find(x => x.date === date) || {};
  ok('   EJ03: title, code, Urban Saints and its link', d('2026-09-20').title === 'Born again?' && d('2026-09-20').lessonCode === 'EJ03' && d('2026-09-20').programme === 'Urban Saints' && d('2026-09-20').lessonLink === 'https://example.invalid/urban-saints/EJ03', J(d('2026-09-20')));
  ok('   nativity preparation: a special week, with the group\'s parts', d('2026-11-29').special === 'Preparation for family nativity' && d('2026-11-29').title === '' && d('2026-11-29').parts.length === 5, J(d('2026-11-29')));
  ok('   "Family nativity service", "Carol service pm", "No church service": no session', ['2026-12-13', '2026-12-20', '2026-12-27'].every(x => d(x).special === 'none') && d('2026-12-13').title === 'Family nativity service' && d('2026-12-27').parts.length === 0);
  ok('   into January: SP101, SP906, IAM01', d('2027-01-03').lessonCode === 'SP101' && d('2027-01-10').lessonCode === 'SP906' && d('2027-01-17').lessonCode === 'IAM01' && d('2027-01-17').title === 'Introducing the Messiah');
  ok('3. WHO\'S ON AND AWAY FROM THE ROTA AND AVAILABILITY (20 Sep: the two on Kids Church roles; the one marked away)', J(d('2026-09-20').onIds) === J(['m_lead1', 'm_kid1']) && J(d('2026-09-20').awayIds) === J(['m_lead2']), J({ on: d('2026-09-20').onIds, away: d('2026-09-20').awayIds }));
  ok('   NOT A NAME FROM THE DOCUMENT IS STORED', !/Karen|Lois|Maya|Samy|Simon|Matei|Amelie|Caleb/.test(J(docs)));
  const w2 = run('--docx', DOCX, '--group', GID, '--write');
  ok('4. RUN AGAIN: it makes nothing twice', /Made 0, left alone 20/.test(w2) && (await all()).length === 20, w2);
  const env2 = { ...process.env }; delete env2.FIRESTORE_EMULATOR_HOST;
  let live = '';
  try { live = execFileSync(process.execPath, [path.join(V2, 'tools', 'import-planner-term.mjs'), '--docx', DOCX, '--group', GID, '--write'], { cwd: V2, encoding: 'utf8', env: env2 }); } catch (e) { live = (e.stdout || '') + (e.stderr || ''); }
  ok('5. NOT ON THE EMULATOR, IT WON\'T WRITE without --live', /add --live to write to the real database/.test(live), live);

  /* the term in the planner, as a leader sees it */
  await db.collection('users').doc('u_lead1').set({ memberId: 'm_lead1', name: 'Lea Leader (invented)', teams: ['Kids Church'], adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  const up = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'lea.term@example.invalid', password: 'synthetic-only-123', returnSecureToken: true }) })).json();
  const ud = (await db.collection('users').doc('u_lead1').get()).data(); await db.collection('users').doc(up.localId).set(ud);
  const server = http.createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = path.join(V2, p); if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise(r => server.listen(5601, 'localhost', r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-term-')) });
  GUARD.watchBrowser(b);
  const pg = await b.newPage(); await GUARD.protect(pg, 'lea');
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  await pg.goto('http://localhost:5601/whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  await pg.evaluate(() => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword('lea.term@example.invalid', 'synthetic-only-123'));
  await new Promise(r => setTimeout(r, 600));
  await pg.goto('http://localhost:5601/session-planner.html', { waitUntil: 'networkidle2' });
  await pg.waitForSelector('#term .wk', { timeout: 20000 });
  const term = await pg.$eval('#term', e => e.innerText.replace(/\s+/g, ' '));
  ok('6. THE PLANNER SHOWS THE TERM: 20 weeks, codes, the special weeks, no "Untitled"', /20 plans/.test(term) && /EJ03\s*Born again\?/.test(term) && /★ Preparation for family nativity/.test(term) && /No Kids Church: Family nativity service/.test(term) && !/Untitled/.test(term), term.slice(0, 600));
  await pg.screenshot({ path: path.join(HERE, 'import-term-375.png'), fullPage: true });
  await b.close(); server.close();
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
}
const leaks = GUARD.leaks();
ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
