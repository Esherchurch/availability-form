/* THE FIRE ROLL-CALL (F-214; Martin, 15 Oct: "YES - the fire roll-call
   also goes to NAMED people"). Events window. Invented people only, events
   emulators only (with the rules), network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/fire-rollcall.test.mjs"

   What it proves:
     1. a master admin names people in Safeguarding settings (adults only),
        each for every building or one building
     2. a check-in records its building
     3. A NAMED WARDEN (every building) opens the fire roll-call: who is in
        and how many - names, nothing else (no answers, no medical)
     4. a warden for one building sees that building only
     5. AN EVENT TEAM MEMBER OF A DIFFERENT EVENT does not get it
     6. THE WARDEN CANNOT SEE SIGN-UP ANSWERS
     7-11. CHILDREN AS NUMBERS (F-216): a count per group for each building,
        no names; a warden sees their own building's and nothing of any child;
        live as children go home. Needs the functions emulator. */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-fire-'));
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
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })();

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

/* ---------- invented church: two buildings ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin:  { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  wanda:   { email: 'wanda.warden@example.invalid', name: 'Wanda Warden (invented)', mid: 'm_wanda', teams: [] },
  sid:     { email: 'sid.steward@example.invalid', name: 'Sid Steward (invented)', mid: 'm_sid', teams: [] },
  natasha: { email: 'natasha.film@example.invalid', name: 'Natasha Film (invented)', mid: 'm_natasha', teams: [] },
  quinn:   { email: 'quinn.quiz@example.invalid', name: 'Quinn Quiz (invented)', mid: 'm_quinn', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
await db.collection('addressBook').doc('m_kid').set({ name: 'Kit Child (invented)', email: '', markers: [], adminFor: [], masterAdmin: false, isMinor: true });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await db.collection('sites').doc('site_a').set({ name: 'Main building (invented)', active: true, order: 1 });
await db.collection('sites').doc('site_b').set({ name: 'Hall annex (invented)', active: true, order: 2 });
await db.collection('rooms').doc('room_a').set({ name: 'Big hall (invented)', siteId: 'site_a', active: true, kind: 'room' });
await db.collection('rooms').doc('room_b').set({ name: 'Annex room (invented)', siteId: 'site_b', active: true, kind: 'room' });
const now = new Date(); now.setMinutes(0, 0, 0);
const EV = (title, site, room, team) => ({ title, description: '', category: 'social', labels: [], visibility: 'members', status: 'confirmed', audience: ['members'], teams: [], featured: false,
  startLocal: iso(now), startUtc: now.getTime(), endLocal: iso(new Date(now.getTime() + 3 * 3600e3)), endUtc: now.getTime() + 3 * 3600e3, allDay: false,
  location: { kind: 'room', siteId: site, roomIds: [room] }, organiserName: 'x', signupOn: true, capacity: 30, createdBy: P.martin.uid, updatedAt: 'x', ...team });
await db.collection('calEvents').doc('ev_film').set(EV('Film Club (invented)', 'site_a', 'room_a', { teamMemberIds: ['m_natasha'], teamUids: [P.natasha.uid] }));
await db.collection('calEvents').doc('ev_quiz').set(EV('Quiz night (invented)', 'site_b', 'room_b', { teamMemberIds: ['m_quinn'], teamUids: [P.quinn.uid] }));
await db.collection('signups').doc('su_film_ann_000000000000000000').set({ calEventId: 'ev_film', personKind: 'contacts', personId: 'c_ann', name: 'Ann Answer (invented)', email: 'ann@example.invalid', phone: '07000 999999', attendees: [{ name: 'Ann Answer (invented)' }, { name: 'Bea Answer (invented)' }], answers: { q_med: 'SECRET-ASTHMA-ANSWER' }, places: 2, ticketTypeId: '', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: 'x' });
const ckId = (ev, key, i) => ev + '__' + key + '__' + i;
await db.collection('checkins').doc(ckId('ev_quiz', 'su_quiz_q', 0)).set({ calEventId: 'ev_quiz', signupKey: 'su_quiz_q', attendeeIndex: 0, name: 'Quentin Quizzer (invented)', kind: 'booked', state: 'in', inAt: new Date().toISOString(), inBy: P.quinn.uid, roomId: 'room_b', day: TODAY, buildingId: 'site_b' });

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: width || 1100, height: 900 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const data = async (c, id) => { const s = await db.collection(c).doc(id).get(); return s.exists ? s.data() : null; };

try {
  /* ---------- 1. the list, in Safeguarding settings ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'safeguarding-settings.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#fireCard #fireAdd'));
  const offered = await M.$$eval('#fireAdd option', o => o.map(x => x.textContent));
  ok('1. SAFEGUARDING SETTINGS: a "Fire roll-call" list; adults only (the child is not offered)', offered.some(o => /Wanda Warden/.test(o)) && !offered.some(o => /Kit Child/.test(o)), J(offered));
  await M.select('#fireAdd', 'm_wanda');
  await until(() => M.$('[data-fire="m_wanda"]'));
  await M.select('#fireAdd', 'm_sid');
  await until(() => M.$('[data-fire="m_sid"]'));
  await M.select('[data-fire="m_sid"] .fireSite', 'site_b');
  await M.$eval('#fireSave', b => b.click());
  await until(async () => /Saved/.test(await text(M, '#fireMsg')));
  const fr = await data('fireRollCall', 'main');
  ok('   saved: Wanda for every building, Sid for the Hall annex only', fr && J(fr.allSites) === J(['m_wanda']) && J(fr.bySite) === J({ site_b: ['m_sid'] }) && J(fr.memberIds) === J(['m_wanda', 'm_sid']), J(fr));
  ok('   and the safeguarding settings were not touched by it', !(await M.$('.banner.gold')));
  await M.screenshot({ path: path.join(HERE, 'fire-rollcall-settings.png'), fullPage: true });

  /* ---------- 2. a check-in records its building ---------- */
  const N = await browser('natasha');
  await N.goto(URLB + 'checkin.html?event=ev_film', { waitUntil: 'networkidle2' });
  await until(async () => /Ann Answer/.test(await text(N)));
  for (const i of [0, 1]) await N.evaluate((i) => EGBCEvents.load('ev_film').then(r => EGBCCheckin.checkIn(r.ev, { id: 'ev_film__su_film_ann_000000000000000000__' + i, signupKey: 'su_film_ann_000000000000000000', index: i, name: i ? 'Bea Answer (invented)' : 'Ann Answer (invented)' })), i);
  const ck = await until(() => data('checkins', 'ev_film__su_film_ann_000000000000000000__0'));
  ok('2. A CHECK-IN RECORDS ITS BUILDING (the event\'s site)', ck && ck.buildingId === 'site_a' && ck.state === 'in', J(ck));

  /* ---------- 3. the named warden ---------- */
  const W = await browser('wanda', 390);
  await W.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /Ann Answer/.test(await text(W, '#wrap')) && /Quentin Quizzer/.test(await text(W, '#wrap')));
  const wt = await text(W, '#wrap');
  ok('3. A NAMED WARDEN (every building) OPENS THE FIRE ROLL-CALL: everyone in, and how many', /Fire roll-call/.test(wt) && /Ann Answer/.test(wt) && /Bea Answer/.test(wt) && /Quentin Quizzer/.test(wt) && /\b3\b People in the building/.test(wt), wt.slice(0, 400));
  ok('   names only: no answers, no medical details, no phone or email', !/SECRET-ASTHMA|07000|@example/.test(wt));
  await W.screenshot({ path: path.join(HERE, 'fire-rollcall-warden-390.png'), fullPage: true });

  /* ---------- 4. one building ---------- */
  const S = await browser('sid', 390);
  await S.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /Quentin Quizzer/.test(await text(S, '#wrap')));
  await sleep(1500);
  const st = await text(S, '#wrap');
  ok('4. A WARDEN FOR THE HALL ANNEX sees the annex only (Quentin), not the main building (Ann, Bea)', /Hall annex/.test(st) && /Quentin Quizzer/.test(st) && !/Ann Answer|Bea Answer/.test(st), st.slice(0, 400));

  /* ---------- 5. not a warden ---------- */
  const Q = await browser('quinn');
  await Q.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /fire roll-call is for master admins/.test(await text(Q)));
  ok('5. AN EVENT TEAM MEMBER OF A DIFFERENT EVENT does not get it', /The fire roll-call is for master admins and the people named for it/.test(await text(Q)) && !/Ann Answer/.test(await text(Q)));
  const qr = await Q.evaluate(() => EGBCAuth.db.collection('checkins').where('day', '==', EGBCCheckin.today()).where('kind', 'in', ['booked', 'walkin', 'leader']).get().then(() => 'read', e => e.code));
  ok('   and the rules say no too', /permission/.test(qr), qr);

  /* ---------- 6. no answers ---------- */
  const wa = await W.evaluate(() => EGBCAuth.db.collection('signups').where('calEventId', '==', 'ev_film').get().then(() => 'read', e => e.code));
  ok('6. THE WARDEN CANNOT SEE SIGN-UP ANSWERS', /permission/.test(wa), wa);
  await W.goto(URLB + 'attendance.html?event=ev_film', { waitUntil: 'networkidle2' });
  await until(async () => /for its event team/.test(await text(W)));
  ok('   nor the lists or the door sheet', /The lists for this event are for its event team/.test(await text(W)) && !/SECRET-ASTHMA/.test(await text(W)));

  /* ---------- 7. CHILDREN, AS NUMBERS (F-216) ---------- */
  const KID = (id, site, gid, gname, state) => ({ ck: { calEventId: 'kids_' + gid + '_' + TODAY, signupKey: id, attendeeIndex: 0, name: id[4].toUpperCase() + id.slice(5) + ' Synthetic-Child', kind: 'child', state, inAt: 'x', inBy: P.martin.uid, roomId: '', day: TODAY, groupId: gid, siteId: site, familyId: 'fam_' + id, pickupCode: '1234' },
    roll: { siteId: site, day: TODAY, groupId: gid, groupName: gname, childId: id, name: id[4].toUpperCase() + id.slice(5) + ' Synthetic-Child', state, inAt: 'x', outAt: '', roomId: '', updatedAt: new Date().toISOString() } });
  const KIDS = [['kid_cat', 'site_a', 'grp_jun', 'Juniors', 'in'], ['kid_dan', 'site_a', 'grp_jun', 'Juniors', 'in'], ['kid_eve', 'site_a', 'grp_cre', 'Creche', 'in'],
    ['kid_fay', 'site_a', 'grp_cre', 'Creche', 'out'], ['kid_gus', 'site_b', 'grp_junb', 'Juniors', 'in']];
  await db.collection('kidsSettings').doc('site_a').set({ teams: [] });   // so a master admin sees the main building's children by name
  for (const [id, site, gid, gname, state] of KIDS) {
    const k = KID(id, site, gid, gname, state);
    await db.collection('checkins').doc(id + '_' + TODAY).set(k.ck);
    await db.collection('kidsRoll').doc(id + '_' + TODAY).set(k.roll);
  }
  const ca = await until(async () => { const c = await data('kidsCounts', 'site_a__' + TODAY); return c && c.total === 3 ? c : null; });
  const cb = await until(async () => { const c = await data('kidsCounts', 'site_b__' + TODAY); return c && c.total === 1 ? c : null; });
  ok('7. CHILDREN AS NUMBERS: the function keeps a count per group (Creche 1, Juniors 2; the one gone home is not counted)', ca && J(ca.groups.map(g => [g.name, g.n])) === J([['Creche', 1], ['Juniors', 2]]) && cb && cb.total === 1, J(ca) + ' ' + J(cb));
  ok('   and the count holds no names', !/Synthetic|kid_/.test(J(ca) + J(cb)), J(ca));
  await W.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /total 3/.test(await text(W, '#wrap')) && /total 1/.test(await text(W, '#wrap')) && /Quentin/.test(await text(W, '#wrap')));
  const wk = await text(W, '#wrap');
  ok('8. THE WARDEN SEES THE COUNTS: "Creche 1 · Juniors 2 · total 3" in the main building, "Juniors 1 · total 1" in the annex', /Main building \(invented\).*Creche 1 · Juniors 2 · total 3/.test(wk) && /Hall annex \(invented\).*Juniors 1 · total 1/.test(wk), wk.slice(0, 600));
  ok('   and the children are in "People in the building" (3 adults + 4 children = 7)', /\b7\b People in the building/.test(wk), wk.slice(0, 300));
  ok('   NO CHILD\'S NAME on the page', !/Synthetic-Child/.test(wk));
  await W.screenshot({ path: path.join(HERE, 'fire-rollcall-children-390.png'), fullPage: true });
  const wr = await W.evaluate((d) => Promise.all([
    EGBCAuth.db.collection('kidsRoll').where('siteId', '==', 'site_a').where('day', '==', d).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('checkins').where('siteId', '==', 'site_a').where('day', '==', d).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('checkins').doc('kid_cat_' + d).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('kidsRoll').doc('kid_cat_' + d).get().then(() => 'read', e => e.code)]), TODAY);
  ok('9. THE WARDEN CANNOT READ ANY CHILD\'S NAME OR RECORD (the roll, the check-ins, one child\'s, by list or by id)', wr.every(x => /permission/.test(x)), J(wr));
  await S.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /total 1/.test(await text(S, '#wrap')));
  await sleep(1500);
  const sk = await text(S, '#wrap');
  ok('10. A ONE-BUILDING WARDEN sees their building\'s rooms only (the annex: Juniors 1), not the main building\'s', /Juniors 1 · total 1/.test(sk) && !/total 3|Creche/.test(sk), sk.slice(0, 500));
  const sa = await S.evaluate((d) => EGBCAuth.db.collection('kidsCounts').doc('site_a__' + d).get().then(() => 'read', e => e.code), TODAY);
  ok('    and the rules refuse the main building\'s count', /permission/.test(sa), sa);
  const qk = await Q.evaluate((d) => EGBCAuth.db.collection('kidsCounts').doc('site_b__' + d).get().then(() => 'read', e => e.code), TODAY);
  ok('    someone not named gets no count either', /permission/.test(qk), qk);
  await db.collection('checkins').doc('kid_cat_' + TODAY).set({ state: 'out', outAt: 'x' }, { merge: true });
  await db.collection('kidsRoll').doc('kid_cat_' + TODAY).set({ state: 'out', outAt: 'x', updatedAt: new Date().toISOString() }, { merge: true });
  ok('11. LIVE: a child collected, and the warden\'s count goes down (Juniors 1 · total 2)', !!(await until(async () => /Creche 1 · Juniors 1 · total 2/.test(await text(W, '#wrap')))), (await text(W, '#wrap')).slice(0, 400));
  await M.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /Dan Synthetic-Child/.test(await text(M, '#wrap')) && /total 2/.test(await text(M, '#wrap')));
  const mk = await text(M, '#wrap');
  ok('    a master admin still has the names, counted once (3 adults + 3 children = 6)', /Dan Synthetic-Child/.test(mk) && /\b6\b People in the building/.test(mk), mk.slice(250, 1400));

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
