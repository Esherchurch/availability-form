/* Rota reports (R2; F-205). Events window. Invented people and services
   only, events emulators only, network guard. Read-only: the page writes
   nothing.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/rota-reports.test.mjs"

   What it proves:
     1. UNFILLED SLOTS in the dates chosen, every team, from the rota as
        saved; an archived service never counts
     2. HOW OFTEN each person serves: services and slots, last served (not a
        future date), practices left out unless ticked
     3. A ROLE HOLDING SEVERAL PEOPLE (F-204's fault) counts every one of them
     4. ONE PERSON'S SERVING, date by date
     5. NOT ON THE ROTA: people on a rota team who did not serve; archived
        people left out; Choir counts as Worship
     6. AN AREA LEADER sees only their own team's slots and people
     7. each report downloads as CSV, the same as the screen
     8. not a master admin or a rota team leader: turned away
     9. the page writes nothing */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-rotarep-'));
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
const pad = (n) => (n < 10 ? '0' : '') + n;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

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

/* ---------- invented church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  wes:    { email: 'wes.worship@example.invalid', name: 'Wes Worshiplead (invented)', mid: 'm_wes', teams: ['Worship Team'], adminFor: ['Worship Team'] },
  kim:    { email: 'kim.kids@example.invalid', name: 'Kim Kidslead (invented)', mid: 'm_kim', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  ann:    { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
const book = [['m_a', 'Alice Alto (invented)', ['Worship Team']], ['m_b', 'Bob Board (invented)', ['AV Team']], ['m_c', 'Cara Kids (invented)', ['Kids Church']],
  ['m_d', 'Dan Descant (invented)', ['Choir']], ['m_e', 'Eve Gone (invented)', ['Worship Team'], true], ['m_f', 'Fred Fallow (invented)', ['Kids Church']], ['m_g', 'Gina Guitar (invented)', ['Worship Team']]];
for (const [id, name, markers, archived] of book) await db.collection('addressBook').doc(id).set({ name, email: '', markers, adminFor: [], masterAdmin: false, ...(archived ? { archived: true } : {}) });
const p = (id, name) => ({ id, name });
const EV = (date, type, roles, assignments, extra) => ({ date, termLabel: 'Autumn', type, description: '', teams: ['Worship Team', 'AV Team'], startTime: '10:00', endTime: '11:30', roles, assignments, archived: false, ...(extra || {}) });
const D1 = day(-14), D2 = day(-7), DP = day(-10), D4 = day(7);
await db.collection('events').doc('ev1').set(EV(D1, 'Sunday Morning Worship', ['Worship Leader', 'Keyboard', 'Singer 1', 'Sound', 'Session Leader'],
  { 'Worship Leader': p('m_a', 'Alice Alto (invented)'), 'Singer 1': [p('m_a', 'Alice Alto (invented)'), p('m_g', 'Gina Guitar (invented)')], Sound: p('m_b', 'Bob Board (invented)'), 'Session Leader': p('m_c', 'Cara Kids (invented)') }));
await db.collection('events').doc('ev2').set(EV(D2, 'Sunday Morning Worship', ['Worship Leader', 'Sound', 'Session Leader'],
  { 'Worship Leader': [p('m_a', 'Alice Alto (invented)')], 'Session Leader': p('m_c', 'Cara Kids (invented)') }));
await db.collection('events').doc('evp').set(EV(DP, 'Sunday Team Practice', ['Worship Leader'], { 'Worship Leader': p('m_a', 'Alice Alto (invented)') }, { description: 'Thursday Rehearsal' }));
await db.collection('events').doc('ev4').set(EV(D4, 'Sunday Morning Worship', ['Worship Leader', 'Keyboard', 'Helper 1'], { 'Worship Leader': p('m_g', 'Gina Guitar (invented)') }));
await db.collection('events').doc('ev5').set(EV(day(-3), 'Sunday Morning Worship', ['Keyboard'], { Keyboard: p('m_h', 'ARCHIVED SERVICE (invented)') }, { archived: true }));
await db.collection('events').doc('ev6').set(EV(day(-200), 'Sunday Morning Worship', ['Keyboard'], { Keyboard: p('m_d', 'Dan Descant (invented)') }));
let before = J((await db.collection('events').get()).docs.map(d => [d.id, d.data()]));

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: width || 1100, height: 900 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const rows = (pg) => pg.$$eval('#table tbody tr', rs => rs.map(r => [...r.children].map(c => c.textContent.trim())));
const tab = async (pg, t) => { await pg.$eval('[data-tab="' + t + '"]', b => b.click()); await sleep(300); };
const open = async (pg) => { await pg.goto(URLB + 'rota-reports.html', { waitUntil: 'networkidle2' }); await until(() => pg.$('#sum')); };
async function csvOf(pg) {
  await pg.evaluate(() => { window.__blob = null; const make = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blob = b; return make(b); }; HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; }; });
  await pg.$eval('#csv', b => b.click());
  return until(() => pg.evaluate(async () => window.__blob ? { name: window.__dl, lines: (await window.__blob.text()).replace(/^\ufeff/, '').split('\r\n') } : null));
}

try {
  /* ---------- 1. unfilled ---------- */
  const M = await browser('martin');
  await open(M);
  const g = await rows(M);
  const gaps = g.map(r => r[2] + '@' + r[1]).sort();
  ok('1. UNFILLED SLOTS: Keyboard (twice), Sound and Helper 1 - from the rotas as saved', g.length === 4 && J(g.map(r => r[2]).sort()) === J(['Helper 1', 'Keyboard', 'Keyboard', 'Sound']) && /4 unfilled slots/.test(await text(M, '#sum')), J(g));
  ok('   an archived service never counts; nor one outside the dates', !/ARCHIVED|Dan Descant/.test(await text(M, '#out')));
  ok('   each with its team (Worship / AV / Kids Church)', g.some(r => r[2] === 'Sound' && r[3] === 'AV Team') && g.some(r => r[2] === 'Helper 1' && r[3] === 'Kids Church'), J(g));
  const c1 = await csvOf(M);
  ok('7. CSV, the same as the screen: "Unfilled slots <from> to <to>.csv"', c1 && /^Unfilled slots \d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d\.csv$/.test(c1.name) && c1.lines[0] === 'Date,Service,Slot,Team' && c1.lines.length === 5 && c1.lines.includes(D2 + ',Sunday Morning Worship,Sound,AV Team'), c1 && J(c1));

  /* ---------- 2-3. how often ---------- */
  await tab(M, 'often');
  await until(async () => /people served/.test(await text(M, '#sum')));
  const f = await rows(M);
  const row = (n) => f.find(r => r[0].startsWith(n)) || [];
  ok('2. HOW OFTEN: Alice 2 services (3 slots), Cara 2, Gina 2, Bob 1; most first', f.length === 4 && row('Alice')[1] === '2' && row('Alice')[2] === '3' && row('Cara')[1] === '2' && row('Gina')[1] === '2' && row('Bob')[1] === '1' && f[f.length - 1][0].startsWith('Bob'), J(f));
  ok('3. A ROLE HOLDING TWO PEOPLE (Singer 1: Alice and Gina) counts both', row('Gina')[1] === '2' && row('Alice')[2] === '3', J([row('Alice'), row('Gina')]));
  await M.$eval('#practices', c => c.click()); await sleep(300);
  const fp = await rows(M);
  ok('   practices left out unless ticked: ticked, Alice has 3 services', (fp.find(r => r[0].startsWith('Alice')) || [])[1] === '3', J(fp));
  await M.$eval('#practices', c => c.click()); await sleep(300);
  const c2 = await csvOf(M);
  ok('7. CSV: How often people serve', c2 && c2.lines[0] === 'Name,Services,Slots,Teams,Last served' && c2.lines.some(l => l === 'Alice Alto (invented),2,3,Worship Team,' + D2), c2 && J(c2.lines));
  /* The last-served date, exactly. */
  const lastG = await M.evaluate(() => EGBCRotaReports.frequency({ events: [], people: [] }, {}).length);
  const exact = await M.evaluate(async (o) => { const d = await EGBCRotaReports.load({ db: EGBCAuth.db, from: o.f, to: o.t }); const r = EGBCRotaReports.frequency(d, {}); return r.find(x => x.key === 'm_g').last; }, { f: day(-90), t: day(90) });
  ok('   Gina last served ' + D1 + ' (not ' + D4 + ', still to come)', exact === D1 && lastG === 0, exact);

  /* ---------- 4. one person ---------- */
  await tab(M, 'person');
  await M.select('#person', 'm_a'); await sleep(400);
  const h = await rows(M);
  ok('4. ONE PERSON\'S SERVING: Alice, 3 times, date by date (Worship Leader twice, Singer 1)', h.length === 3 && J(h.map(r => r[2]).sort()) === J(['Singer 1', 'Worship Leader', 'Worship Leader']), J(h));
  const c3 = await csvOf(M);
  ok('7. CSV: Serving history', c3 && c3.lines[0] === 'Date,Service,Slot,Team' && c3.lines.length === 4, c3 && J(c3.lines));

  /* ---------- 5. not on the rota ---------- */
  await tab(M, 'none');
  const n = await rows(M);
  ok('5. NOT ON THE ROTA: Dan (Choir counts as Worship), Fred, and the two team leaders who did not serve; Eve (archived) left out', J(n) === J([['Dan Descant (invented)', 'Worship Team'], ['Fred Fallow (invented)', 'Kids Church'], ['Kim Kidslead (invented)', 'Kids Church'], ['Wes Worshiplead (invented)', 'Worship Team']]), J(n));
  await M.setViewport({ width: 375, height: 800 });
  await M.screenshot({ path: path.join(HERE, 'rota-reports-375.png'), fullPage: true });
  await M.setViewport({ width: 1100, height: 900 });
  const c4 = await csvOf(M);
  ok('7. CSV: Not on the rota', c4 && c4.lines[0] === 'Name,Teams' && c4.lines.length === 5, c4 && J(c4.lines));

  /* ---------- 6. area leaders ---------- */
  const W = await browser('wes');
  await open(W);
  const wg = await rows(W);
  ok('6. THE WORSHIP LEADER sees only Worship\'s gaps (Keyboard twice), not Sound or Helper 1', J(wg.map(r => r[2])) === J(['Keyboard', 'Keyboard']) && /Worship Team/.test(await text(W, '.sub')), J(wg));
  await tab(W, 'often');
  const wf = await rows(W);
  ok('   and only Worship\'s people: no Bob (AV), no Cara (Kids)', wf.length === 2 && !wf.some(r => /Bob|Cara/.test(r[0])), J(wf));
  await tab(W, 'none');
  ok('   not on the rota: Worship people only (Dan, and Wes himself)', J(await rows(W)) === J([['Dan Descant (invented)', 'Worship Team'], ['Wes Worshiplead (invented)', 'Worship Team']]));
  const K = await browser('kim');
  await open(K);
  ok('   THE KIDS CHURCH LEADER: only Helper 1', J((await rows(K)).map(r => r[2])) === J(['Helper 1']));

  /* ---------- 10-11. clashes and the overview (F-210) ---------- */
  /* Bob: Sound at 10:00-11:30 AND a Kids Church helper at the café, 10:30.
     Cara: Session Leader AND Sound at the same service (two teams).
     Gina: Singer at 10:00 and Worship Leader at 18:30 - no clash.
     Alice: Worship Leader and Singer 1 at one service, one team - no clash. */
  await db.collection('events').doc('ev7').set(EV(D1, 'Café', ['Helper 2'], { 'Helper 2': p('m_b', 'Bob Board (invented)') }, { startTime: '10:30', endTime: '12:00' }));
  await db.collection('events').doc('ev9').set(EV(D1, 'Evening Worship', ['Worship Leader'], { 'Worship Leader': p('m_g', 'Gina Guitar (invented)') }, { startTime: '18:30', endTime: '19:30' }));
  await db.collection('events').doc('ev2').update({ 'assignments.Sound': p('m_c', 'Cara Kids (invented)') });
  before = J((await db.collection('events').get()).docs.map(d => [d.id, d.data()]));
  await open(M);
  await tab(M, 'clash');
  const cl = await rows(M);
  ok('10. CLASHES: Bob (Sound, and a Kids Church helper at the café at the same time) and Cara (two teams at one service)',
    cl.length === 2 && cl.some(r => /^Bob/.test(r[1]) && /Sound \(Sunday Morning Worship\)/.test(r[2] + r[3]) && /Helper 2 \(Café\)/.test(r[2] + r[3]) && r[4] === 'at the same time') &&
    cl.some(r => /^Cara/.test(r[1]) && /Session Leader/.test(r[2] + r[3]) && /Sound/.test(r[2] + r[3]) && r[4] === 'the same service'), J(cl));
  ok('    not a clash: Alice leading and singing at one service (one team); Gina morning and evening', !cl.some(r => /Alice|Gina/.test(r[1])), J(cl));
  const c5 = await csvOf(M);
  ok('    CSV: Clashes', c5 && c5.lines[0] === 'Date,Name,One slot,The other,Why' && c5.lines.length === 3, c5 && J(c5.lines));
  await tab(M, 'overview');
  const ov = await rows(M);
  const ov1 = ov.find(r => r[1] === 'Sunday Morning Worship' && r[3] === '4 of 5');
  ok('11. OVERVIEW of the dates: each service, slots filled, what is still empty (the first Sunday: 4 of 5, Keyboard)', ov.length === 5 && ov1 && ov1[4] === 'Keyboard' && /5 services: \d+ of \d+ slots filled/.test(await text(M, '#sum')), J(ov));
  const c6 = await csvOf(M);
  ok('    CSV: Overview', c6 && c6.lines[0] === 'Date,Service,Time,Slots filled,Slots,People,Still empty' && c6.lines.length === 6, c6 && J(c6.lines));
  await M.setViewport({ width: 375, height: 800 });
  await M.screenshot({ path: path.join(HERE, 'rota-reports-overview-375.png'), fullPage: true });
  await M.setViewport({ width: 1100, height: 900 });

  /* ---------- 8. nobody else ---------- */
  const A = await browser('ann');
  await A.goto(URLB + 'rota-reports.html', { waitUntil: 'networkidle2' });
  await until(async () => /for master admins and the leaders of rota teams/.test(await text(A)));
  ok('8. NOT A MASTER ADMIN OR A ROTA TEAM LEADER: turned away', /for master admins and the leaders of rota teams/.test(await text(A)) && !(await A.$('#table')));

  /* ---------- 9. writes nothing ---------- */
  ok('9. THE PAGE WROTE NOTHING: the rotas are exactly as they were', J((await db.collection('events').get()).docs.map(d => [d.id, d.data()])) === before);

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
