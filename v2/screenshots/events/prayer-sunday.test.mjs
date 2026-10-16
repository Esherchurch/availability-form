/* FOR SUNDAY: THE SERVICE LEADER AND THE PASTOR (F-222; Martin, 16 Oct).
   Events window. Invented people only, events emulators only (with the
   hub's functions), network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/prayer-sunday.test.mjs"

   What it proves:
     1. the server keeps a list per Sunday: only the requests marked yes,
        not answered, from the four weeks before; a name only "with my name"
     2. THE SERVICE LEADER for the coming Sunday (typed on the rota, matched
        by name) sees that Sunday's list on prayer.html, from the Wednesday
        before until the Sunday ends - and never a request marked No
     3. they read no prayer request itself
     4. LAST WEEK'S SERVICE LEADER IS REFUSED, and next week's leader is
        refused before their Wednesday
     5. THE PASTOR (the one team mail uses) sees For Sunday, always; reads
        no request itself
     6. anyone else: no For Sunday
     7. it follows the requests: one marked yes appears, one changed to No
        goes; a new service leader typed on the rota gets it */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { comingSunday, windowOf, buildSunday } from '../../functions/prayer-sunday.js';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-psun-'));
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
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };

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

/* ---------- the test church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  sally: { email: 'sally.leader@example.invalid', name: 'Sally Leader (invented)', mid: 'm_sally', teams: [] },
  lou:   { email: 'lou.lastweek@example.invalid', name: 'Lou Lastweek (invented)', mid: 'm_lou', teams: [] },
  nell:  { email: 'nell.nextweek@example.invalid', name: 'Nell Nextweek (invented)', mid: 'm_nell', teams: [] },
  pat:   { email: 'pat.pastor@example.invalid', name: 'Pat Pastor (invented)', mid: 'm_pat', teams: [] },
  oli:   { email: 'oli.other@example.invalid', name: 'Oli Other (invented)', mid: 'm_oli', teams: [] },
  ann:   { email: 'ann.asker@example.invalid', name: 'Ann Asker (invented)', mid: 'm_ann', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true, opensOn: '' });
await db.collection('teamMailSettings').doc('main').set({ pastor: 'm_pat', officeAdmin: '' });
const SUN = comingSunday(), LAST = addDays(SUN, -7), NEXT = addDays(SUN, 7);
const W = windowOf(SUN), NOW = Date.now(), INWINDOW = NOW >= W.from && NOW <= W.until;
await db.collection('events').doc('svc_this').set({ date: SUN, startTime: '10:30', type: 'Morning service', serviceLeader: 'Sally Leader (invented)', speaker: '' });
await db.collection('events').doc('svc_last').set({ date: LAST, startTime: '10:30', type: 'Morning service', serviceLeader: 'Lou Lastweek (invented)', speaker: '' });
await db.collection('events').doc('svc_next').set({ date: NEXT, startTime: '10:30', type: 'Morning service', serviceLeader: 'Nell Nextweek (invented)', speaker: '' });
const at = (daysAgo) => new Date(NOW - daysAgo * 864e5);
const PR = (id, text, sunday, extra) => db.collection('prayers').doc(id).set({ by: P.ann.uid, byName: 'Ann Asker (invented)', text, share: 'pastoral', sunday, at: at(1), answered: false, answer: '', answeredAt: null, ...(extra || {}) });
await PR('p_named', 'NAMED: for my sister in hospital (invented).', 'named');
await PR('p_anon', 'ANON: for a hard week at work (invented).', 'anon');
await PR('p_no', 'SECRET: never on Sunday (invented).', 'no');
await PR('p_done', 'DONE: already answered (invented).', 'named', { answered: true, answer: 'yes', answeredAt: at(0) });
await PR('p_old', 'OLD: from six weeks ago (invented).', 'named', { at: at(42) });

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await pg.goto(URLB + 'prayer.html?app=1', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => document.querySelector('[data-tab]'), { timeout: 20000 });
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const tab = async (pg, t) => { await pg.$eval('[data-tab="' + t + '"]', b => b.click()); await sleep(300); };
const read = (pg, c, id) => pg.evaluate((c, id) => EGBCAuth.db.collection(c).doc(id).get().then(s => s.exists ? 'read' : 'none', e => e.code), c, id);
const list = (pg) => pg.evaluate(() => EGBCAuth.db.collection('prayers').get().then(() => 'read', e => e.code));

try {
  /* ---------- 1. the list ---------- */
  const L = await until(async () => { const s = await db.collection('prayerSundayList').doc(SUN).get(); return s.exists && s.data().items.length === 2 ? s.data() : null; });
  ok('1. THE SERVER KEEPS THE LIST for Sunday ' + SUN + ' (made by the prayer trigger): the two marked yes', !!L && J(L.items.map(i => i.text.split(':')[0]).sort()) === J(['ANON', 'NAMED']), J(L));
  ok('   a name only "with my name"', !!L && L.items.find(i => /NAMED/.test(i.text)).name === 'Ann Asker (invented)' && L.items.find(i => /ANON/.test(i.text)).name === '', J(L && L.items));
  ok('   never one marked No, an answered one, or one from six weeks ago', !!L && !/SECRET|DONE|OLD/.test(J(L.items)));
  ok('   the service leader, matched by name: Sally', !!L && J(L.leaderMemberIds) === J(['m_sally']), J(L && L.leaderMemberIds));
  ok('   from the Wednesday before to the end of the Sunday', !!L && L.from.toMillis() === W.from && L.until.toMillis() === W.until && new Date(W.from).getUTCDay() !== 0);
  await buildSunday(db, LAST);
  await buildSunday(db, NEXT);

  /* ---------- 2-3. the service leader ---------- */
  const S = await as('sally');
  if (INWINDOW) {
    await until(() => S.$('[data-tab="sunday"]'));
    await tab(S, 'sunday');
    const st = await text(S, '#sunday');
    ok('2. THE SERVICE LEADER (Sally, this Sunday) sees For Sunday', /For Sunday/.test(st) && /NAMED: for my sister/.test(st) && /ANON: for a hard week/.test(st), st);
    ok('   with the name only where asked ("No name given" for the other)', /Ann Asker/.test(st) && /No name given/.test(st), st);
    ok('   A SERVICE LEADER CANNOT SEE A REQUEST MARKED No', !/SECRET/.test(st) && !/DONE|OLD/.test(st), st);
    await S.screenshot({ path: path.join(HERE, 'prayer-sunday-leader-375.png'), fullPage: true });
  } else {
    ok('2. (today is ' + new Date().toDateString() + ', before Wednesday: the leader is refused until then)', (await read(S, 'prayerSundayList', SUN)) === 'permission-denied');
  }
  ok('3. the service leader reads no request itself (the list of requests)', /permission/.test(await list(S)));
  ok('   nor one by its id - not even the one marked No', /permission/.test(await read(S, 'prayers', 'p_no')) && /permission/.test(await read(S, 'prayers', 'p_named')));
  ok('   no "Requests to pray for" tab', !(await S.$('[data-tab="forus"]')));

  /* ---------- 4. last week's, next week's ---------- */
  const LO = await as('lou');
  ok('4. LAST WEEK\'S SERVICE LEADER IS REFUSED (their own Sunday is over)', /permission/.test(await read(LO, 'prayerSundayList', LAST)));
  ok('   and this Sunday\'s too', /permission/.test(await read(LO, 'prayerSundayList', SUN)));
  ok('   and the page offers them no For Sunday', !(await LO.$('[data-tab="sunday"]')));
  const NE = await as('nell');
  ok('   NEXT week\'s leader is refused before their Wednesday', /permission/.test(await read(NE, 'prayerSundayList', NEXT)));

  /* ---------- 5. the Pastor ---------- */
  const PA = await as('pat');
  await until(() => PA.$('[data-tab="sunday"]'));
  await tab(PA, 'sunday');
  const pt = await text(PA, '#sunday');
  ok('5. THE PASTOR SEES FOR SUNDAY', /NAMED: for my sister/.test(pt) && /ANON/.test(pt) && !/SECRET/.test(pt), pt);
  ok('   any Sunday\'s (last week\'s, next week\'s)', (await read(PA, 'prayerSundayList', LAST)) === 'read' && (await read(PA, 'prayerSundayList', NEXT)) === 'read');
  ok('   and reads no request itself', /permission/.test(await list(PA)) && /permission/.test(await read(PA, 'prayers', 'p_no')));
  await PA.screenshot({ path: path.join(HERE, 'prayer-sunday-pastor-375.png'), fullPage: true });

  /* ---------- 6. anyone else ---------- */
  const O = await as('oli');
  ok('6. anyone else: no For Sunday, and the rules say no', !(await O.$('[data-tab="sunday"]')) && /permission/.test(await read(O, 'prayerSundayList', SUN)));

  /* ---------- 7. it follows ---------- */
  await db.collection('prayers').doc('p_named').update({ sunday: 'no' });
  ok('7. changed to No: it leaves the list', !!(await until(async () => { const d = (await db.collection('prayerSundayList').doc(SUN).get()).data(); return d && !/NAMED/.test(J(d.items)); })));
  await db.collection('events').doc('svc_this').update({ serviceLeader: 'Oli Other (invented)' });
  const L2 = await until(async () => { const d = (await db.collection('prayerSundayList').doc(SUN).get()).data(); return d && J(d.leaderMemberIds) === J(['m_oli']) ? d : null; });
  ok('   a new service leader typed on the rota gets it (Oli), and Sally no longer', !!L2);
  if (INWINDOW) ok('   (Oli can read it now; Sally cannot)', (await read(O, 'prayerSundayList', SUN)) === 'read' && /permission/.test(await read(S, 'prayerSundayList', SUN)));

  /* 8. by id, not by name (Martin, 16 Oct) */
  await db.collection('events').doc('svc_this').update({ serviceLeaderId: 'm_nell', serviceLeader: 'Oli Other (invented)' });
  const L3 = await until(async () => { const d = (await db.collection('prayerSundayList').doc(SUN).get()).data(); return d && J(d.leaderMemberIds) === J(['m_nell']) ? d : null; });
  ok('8. THE SERVICE LEADER BY ID: the rota’s id (Nell) wins over a typed name (Oli)', !!L3, J(L3));
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
