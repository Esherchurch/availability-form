/* THE YOUTH HUB'S IDEAS, PLAN AND MUSIC, START TO FINISH (the going-live
   test, Stage 3). Events window. Invented people only, events emulators
   only, locked rules, network guard. Until this, only the every-control
   audit pressed the board, the planner's save and the uploader.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/youth-hub.test.mjs"

   What it proves:
     1. a young person with a code suggests an idea: it goes to the leaders'
        queue with their first name only; they cannot pin it to the board,
        and the database refuses a surname
     2. an adult on Youth Worship pins an idea, reacts to it, and removes it
     3. a youth leader (an admin of Youth Worship, as the rules' canAct asks) saves
        the plan for a youth service; an adult member of the team and the young
        person are told plainly that only a youth leader can save it, and nothing
        is written
     4. music for the library: refused for the young person and the adult
        volunteer, in words (only the church's admins add to the library)
     5. someone on no team is told the page isn't for them */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-yh-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const DATE = '2026-12-06';

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
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  yan: { email: 'yan.youth@example.invalid', name: 'Yan Youth', youth: true },
  vic: { email: 'vic.youth@example.invalid', name: 'Vic Volunteer (invented)', mid: 'm_vic', teams: ['Youth Worship'], adminFor: [] },
  lee: { email: 'lee.leader@example.invalid', name: 'Lee Leader (invented)', mid: 'm_lee', teams: ['Youth Worship'], adminFor: ['Youth Worship'] },
  eve: { email: 'eve.everyone@example.invalid', name: 'Eve Everyone (invented)', mid: 'm_eve', teams: [], adminFor: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
/* the young person's code, as youth-access.html's redeem leaves it: the claim, and their record */
await fetch(`http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify({ localId: P.yan.uid, customAttributes: JSON.stringify({ youth: true }) }) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const x of [P.vic, P.lee, P.eve]) {
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: false });
    /* jobs: as the server's permsOnUser writes them (Youth Worship does the youth job), which storage.rules reads */
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: false, status: 'active', jobs: x.teams.includes('Youth Worship') ? ['youth'] : [] });
  }
  await setDoc(doc(db, 'youthAccess', P.yan.uid), { active: true, expiresAt: new Date(Date.now() + 30 * 86400000), memberName: 'Yan Youth', memberId: 'm_yan', groups: ['Youth Worship'] });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: "St Aidan's with St Hild, Testbury (synthetic)", enquiryEmail: 'office@example.invalid' });
  await setDoc(doc(db, 'teams', 'Youth Worship'), { name: 'Youth Worship', label: 'Youth', rota: true, order: 1, under18: true });
  await setDoc(doc(db, 'teamFlags', 'boards'), { boards: { youth: 'Youth Worship' } });
  await setDoc(doc(db, 'worshipBoardState', 'youth'), { pages: [{ id: 'main', title: 'General Board' }], notes: [] });
  await setDoc(doc(db, 'events', 'rota_y'), { date: DATE, type: 'Youth service', description: 'Youth service (synthetic)', assignments: { 'Worship leader': [{ id: 'm_vic', name: P.vic.name }] } });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const board = () => readDb((db) => getDoc(doc(db, 'worshipBoardState', 'youth')).then((s) => s.data() || {}));
const all = (name) => readDb((db) => getDocs(collection(db, name)).then((q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data()))));

const errors = [], BROWSERS = [], SAID = {};
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); BROWSERS.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); localStorage.setItem('egbc_youth_hub_toured_home', '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 375, height: 812 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  /* the planner speaks in alert()s: kept, then accepted */
  p.on('dialog', d => { SAID[who] = d.message(); d.accept(); });
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return p;
}
const open = async (p) => { await p.goto(URLB + 'youthapp2.html', { waitUntil: 'networkidle2' }); await until(async () => (await p.$('#egbc-blocked-card')) || (await p.$('#tiles-grid .tile'))); await sleep(800); };
const toastSaid = (p, re) => until(() => p.evaluate((src) => { const t = document.getElementById('toast'); return t && new RegExp(src).test(t.textContent) ? t.textContent : ''; }, re.source), 8000);
async function addIdea(p, author, title) {
  await p.evaluate(() => { openSection('board'); openAddNote(); });
  await p.evaluate((a, t) => { document.getElementById('note-author').value = a; document.getElementById('note-title').value = t; document.getElementById('note-body').value = 'Synthetic.'; }, author, title);
  await p.evaluate(() => saveNote());
}
async function planFor(p) {
  await p.evaluate(() => openSection('planner'));
  await p.evaluate((d) => { const e = document.getElementById('serviceDate'); e.value = d; e.dispatchEvent(new Event('change', { bubbles: true })); }, DATE);
  await until(() => p.$('#eventSelect option[value="0"]'));
  await p.evaluate(() => { const e = document.getElementById('eventSelect'); e.value = '0'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(() => p.evaluate(() => typeof planShownFor !== 'undefined' && planShownFor === document.getElementById('serviceDate').value));
  await p.evaluate(() => { addSong(); const t = document.querySelector('.song-title-input'); if (t) t.value = 'Here I am to worship (synthetic)'; });
}
const services = () => all('services');

try {
  /* 1 */
  const Y = await as('yan');
  await open(Y);
  ok('1. A YOUNG PERSON WITH A CODE opens the Youth Hub', !(await Y.$('#egbc-blocked-card')) && !!(await Y.$('#tiles-grid .tile')));
  await addIdea(Y, 'Yan Smith', 'A games night (synthetic)');
  const sugg = await until(async () => (await all('boardSuggestions'))[0]);
  ok('   suggests an idea: it goes to the leaders\u2019 queue, with their first name only', !!sugg && sugg.firstName === 'Yan' && /games night/.test(sugg.text) && sugg.boardId === 'youth', JSON.stringify(sugg));
  ok('   and is told so', !!(await toastSaid(Y, /Sent to a leader/)));
  ok('   it is not pinned to the board', !((await board()).notes || []).length);
  const surname = await Y.evaluate((u) => EGBCAuth.db.collection('boardSuggestions').doc('youth__' + u + '_1').set({ boardId: 'youth', text: 'x', firstName: 'Yan Smith', byUid: u, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => 'written', (e) => e.code), P.yan.uid);
  ok('   the database refuses a surname', /permission/.test(surname), surname);
  const pin = await Y.evaluate(() => EGBCAuth.db.collection('worshipBoardState').doc('youth').set({ notes: [] }, { merge: true }).then(() => 'written', (e) => e.code));
  ok('   and refuses them pinning to the board directly', /permission/.test(pin), pin);

  /* 2 */
  const V = await as('vic');
  await open(V);
  await addIdea(V, 'Vic', 'A worship night (synthetic)');
  const pinned = await until(async () => ((await board()).notes || []).find((n) => /worship night/.test(n.title)));
  ok('2. AN ADULT ON YOUTH WORSHIP pins an idea to the board', !!pinned && pinned.author === 'Vic', JSON.stringify((await board()).notes));
  await V.evaluate((id) => react(id, 'love'), pinned.id);
  ok('   reacts to it', !!(await until(async () => (((await board()).notes || []).find((n) => n.id === pinned.id) || {}).reactions?.love === 1)));
  await V.evaluate((id) => deleteNote(id), pinned.id);
  ok('   and removes it (kept, marked removed)', !!(await until(async () => (((await board()).notes || []).find((n) => n.id === pinned.id) || {}).archived === true)));

  /* 3 */
  const Ld = await as('lee');
  await open(Ld);
  await planFor(Ld);
  await Ld.evaluate(() => saveSchedule());
  const saved = await until(async () => (await services()).find((s) => s.date === DATE && (s.order || []).some((o) => /Here I am/.test(o.title))));
  ok('3. A YOUTH LEADER SAVES THE PLAN for the youth service', !!saved && /saved/i.test(SAID.lee || ''), JSON.stringify({ said: SAID.lee, saved }));
  await planFor(V);
  await V.evaluate(() => { const t = document.querySelector('.song-title-input'); if (t) t.value = 'Changed by Vic (synthetic)'; });
  SAID.vic = '';
  await V.evaluate(() => saveSchedule());
  await until(() => SAID.vic);
  ok('   an adult member of the team is told only a youth leader can save it (not to check their internet), and nothing changes', /Only a youth leader can save the plan/.test(SAID.vic) && !(await services()).some((s) => (s.order || []).some((o) => /Changed by Vic/.test(o.title))), SAID.vic);
  await open(Y);
  await planFor(Y);
  await Y.evaluate(() => { const t = document.querySelector('.song-title-input'); if (t) t.value = 'Changed by Yan (synthetic)'; });
  SAID.yan = '';
  await Y.evaluate(() => saveSchedule());
  await until(() => SAID.yan);
  ok('   the young person is told only a youth leader can save it, and nothing changes', /Only a youth leader can save the plan/.test(SAID.yan) && !(await services()).some((s) => (s.order || []).some((o) => /Changed by Yan/.test(o.title))), SAID.yan);

  /* 4: Upload is offered only to those who may add to the library (Martin, 7 Nov 2026) */
  const tileShown = (p) => p.evaluate(() => { const t = document.getElementById('tileUpload'); return !!t && getComputedStyle(t).display !== 'none'; });
  ok('4. THE MUSIC UPLOADER: not offered to the young person, nor to the adult volunteer', !(await tileShown(Y)) && !(await tileShown(V)));
  ok('   offered to the youth leader (an admin of Youth Worship)', await tileShown(Ld));
  /* 4 */
  const pdf = path.join(TMP, 'here-i-am (synthetic).pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n% synthetic\n');
  for (const [who, p] of [['vic', V], ['yan', Y]]) {
    await p.evaluate(() => openSection('upload'));
    await p.evaluate(() => { document.getElementById('upload-song-title').value = 'Here I am (synthetic)'; /* the choices have no value attribute: the first real one */ document.getElementById('upload-key').selectedIndex = 1; document.getElementById('upload-type').selectedIndex = 1; });
    const input = await p.$('#upload-file-input-0');
    await input.uploadFile(pdf);
    await sleep(300);
    await p.evaluate(() => submitUpload());
    const said = await until(() => p.evaluate(() => { const s = document.getElementById('upload-status').textContent; return /Not uploaded|Upload failed|Uploaded/.test(s) ? s : ''; }), 20000);
    ok('4. MUSIC FOR THE LIBRARY, AS ' + (who === 'vic' ? 'THE ADULT VOLUNTEER' : 'THE YOUNG PERSON') + ': refused, in words', /Not uploaded: only the church.s admins/.test(said || ''), said);
  }
  ok('   and nothing was added to the library', !(await all('songs')).length);
  /* and the youth leader, who is offered it, can use it */
  await Ld.evaluate(() => openSection('upload'));
  await Ld.evaluate(() => { document.getElementById('upload-song-title').value = 'Here I am (synthetic)'; document.getElementById('upload-key').selectedIndex = 1; document.getElementById('upload-type').selectedIndex = 1; });
  await (await Ld.$('#upload-file-input-0')).uploadFile(pdf);
  await sleep(300);
  await Ld.evaluate(() => submitUpload());
  const leeSaid = await until(() => Ld.evaluate(() => { const s = document.getElementById('upload-status').textContent; return /Not uploaded|Upload failed|Uploaded/.test(s) ? s : ''; }), 20000);
  ok('   THE YOUTH LEADER UPLOADS: the music is added to the library', /^Uploaded/.test(leeSaid || '') && (await all('songs')).length === 1, JSON.stringify({ leeSaid, songs: (await all('songs')).length }));

  /* 5 */
  const E = await as('eve');
  await open(E);
  ok('5. SOMEONE ON NO TEAM is told the page isn\u2019t for them', !!(await E.$('#egbc-blocked-card')));
} catch (e) {
  ok('the run finished', false, e.stack);
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
for (const b of BROWSERS) await b.close().catch(() => {});
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
