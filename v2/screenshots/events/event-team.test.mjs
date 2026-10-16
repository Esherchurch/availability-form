/* THE EVENT TEAM (F-212; Martin, 15 Oct: "does each event have admins? If
   I run Film Club only me, Natasha and Val should be able to edit things
   and download lists"). Events window. Invented people only, events
   emulators only (with the rules), network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/event-team.test.mjs"

   What it proves:
     1. Natasha, on Film Club's team with NO ADMIN ROLE: "Events I run"
        shows Film Club only; no New event
     2. she edits it and it saves (the title)
     3. she sees who is coming, downloads/prints the door sheet, and checks
        people in
     4. THE MAINTENANCE ADMIN (Film Club is tagged Maintenance; she is not
        on its team): sees the event, cannot change it, and cannot see who
        is coming, the door sheet or check-in
     5. Martin (master admin) opens it: the team, with Val joined from the
        old overseer names (an exact match); "Unknown Person" left to pick;
        no child offered; saved with Val's account too - and Val then sees
        the list
     6. a new event starts with its maker on the team; a copy keeps it
     7. "Events I run" in the app (What's on) for Natasha */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-evteam-'));
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
  martin:  { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  natasha: { email: 'natasha.film@example.invalid', name: 'Natasha Film (invented)', mid: 'm_natasha', teams: [] },
  val:     { email: 'val.viewer@example.invalid', name: 'Val Viewer (invented)', mid: 'm_val', teams: [] },
  mo:      { email: 'mo.maint@example.invalid', name: 'Mo Maintenance (invented)', mid: 'm_mo', teams: ['Maintenance'], adminFor: ['Maintenance'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
await db.collection('addressBook').doc('m_kid').set({ name: 'Kit Child (invented)', email: '', markers: [], adminFor: [], masterAdmin: false, isMinor: true });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
const start = new Date(); start.setDate(start.getDate() + 4); start.setHours(16, 0, 0, 0);
const EV = (title, extra) => ({ title, description: '<p>Invented.</p>', category: 'kids', labels: [], visibility: 'members', status: 'confirmed', audience: ['members'], teams: ['Maintenance'], featured: false,
  startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 2 * 3600e3)), endUtc: start.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'online', videoRoom: '' }, organiserName: 'Natasha', overseers: [], overseerUids: [], signupOn: true, capacity: 30, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '',
  createdBy: P.martin.uid, updatedAt: 'x', ...(extra || {}) });
await db.collection('calEvents').doc('ev_film').set(EV('Film Club (invented)', {
  teamMemberIds: ['m_martin', 'm_natasha'], teamUids: [P.martin.uid, P.natasha.uid], teamNames: ['Martin Master', 'Natasha Film (invented)'],
  overseers: ['Val Viewer (invented)', 'Unknown Person (invented)'] }));
await db.collection('calEvents').doc('ev_quiz').set(EV('Quiz night (invented)', { teamMemberIds: [], teamUids: [], teamNames: [] }));
/* A Sunday service copied from the rota by the server (F-218, main window). */
await db.collection('calEvents').doc('rota_svc1').set({ ...EV('Sunday morning service (invented)', { teamMemberIds: [], teamUids: [], teamNames: [] }), source: 'rota', rotaId: 'svc1', speaker: 'Pat Preacher (invented)', createdBy: 'rota' });
for (const id of ['ev_film', 'ev_quiz']) await db.collection('capacity').doc(id).set({ calEventId: id, taken: 3, capacity: 30 });
await db.collection('calEvents').doc('ev_film').collection('ticketTypes').doc('tt_a').set({ name: 'Adult', price: 0, capacity: 0, order: 1 });
const SU = (name, email, atts) => ({ calEventId: 'ev_film', personKind: 'contacts', personId: 'c_' + email, name, email, phone: '', attendees: atts.map(n => ({ name: n })), answers: {}, places: atts.length, ticketTypeId: 'tt_a', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: new Date().toISOString() });
await db.collection('signups').doc('su_film_amy_000000000000000000').set(SU('Amy Audience (invented)', 'amy@example.invalid', ['Amy Audience (invented)', 'Ari Audience (invented)']));
await db.collection('signups').doc('su_film_bob_000000000000000000').set(SU('Bob Popcorn (invented)', 'bob@example.invalid', ['Bob Popcorn (invented)']));

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
const openEvent = async (pg, id) => { await pg.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' }); await until(() => pg.$('.open[data-id="' + id + '"]')); await pg.$eval('.open[data-id="' + id + '"]', e => e.click()); await until(() => pg.$('#f_title')); };
const tab = async (pg, t) => { await pg.$eval('[data-tab="' + t + '"]', e => e.click()); await sleep(600); };

try {
  /* ---------- 1. Events I run ---------- */
  const N = await browser('natasha');
  await N.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => N.$('.open[data-id="ev_film"]'));
  const listed = await N.$$eval('.open[data-id]', b => b.map(x => x.getAttribute('data-id')));
  ok('1. NATASHA (no admin role) GETS "EVENTS I RUN": Film Club only, no New event', (await text(N, '#pageTitle')) === 'Events I run' && J(listed) === J(['ev_film']) && (await N.$eval('#newEv', b => getComputedStyle(b).display)) === 'none', J(listed));
  await N.screenshot({ path: path.join(HERE, 'event-team-runs.png'), fullPage: true });

  /* ---------- 2. edits ---------- */
  await openEvent(N, 'ev_film');
  await N.$eval('#f_title', e => { e.value = 'Film Club: Paddington (invented)'; });
  await N.$eval('#save', b => b.click());
  await until(async () => (await data('calEvents', 'ev_film')).title === 'Film Club: Paddington (invented)');
  ok('2. SHE EDITS IT, AND IT SAVES', (await data('calEvents', 'ev_film')).title === 'Film Club: Paddington (invented)');
  ok('   the under-18s box is an admin\'s (shown, not changed)', await N.$eval('#f_u18', c => c.disabled).catch(() => false));

  /* ---------- 3. lists, door sheet, check-in ---------- */
  await openEvent(N, 'ev_film');
  await tab(N, 'people');
  await until(async () => /Amy Audience/.test(await text(N, '#tabBody')));
  ok('3. SHE SEES WHO IS COMING', /Amy Audience/.test(await text(N, '#tabBody')) && /Bob Popcorn/.test(await text(N, '#tabBody')));
  await N.goto(URLB + 'attendance.html?event=ev_film', { waitUntil: 'networkidle2' });
  await until(() => N.$('#dsShow'));
  await N.$eval('#dsShow', b => b.click());
  await until(() => N.$('#doorTable'));
  ok('   prints the door sheet (and so can download the lists)', /Ari Audience/.test(await text(N, '#doorTable')));
  await N.goto(URLB + 'checkin.html?event=ev_film', { waitUntil: 'networkidle2' });
  await until(async () => /Bob Popcorn/.test(await text(N)));
  ok('   and checks people in at the door', /Bob Popcorn/.test(await text(N)) && !/is for its event team/.test(await text(N)));

  /* ---------- 4. the Maintenance admin ---------- */
  const MO = await browser('mo');
  await openEvent(MO, 'ev_film');
  ok('4. THE MAINTENANCE ADMIN sees Film Club, but is told only its team can change it; no Save', !!(await MO.$('#notYours')) && (await MO.$eval('#save', b => getComputedStyle(b).display)) === 'none' && await MO.$eval('#f_title', e => e.disabled));
  await tab(MO, 'people');
  ok('   CANNOT SEE WHO IS COMING', !!(await MO.$('#noList')) && !/Amy Audience|Bob Popcorn/.test(await text(MO, '#tabBody')), await text(MO, '#tabBody'));
  await MO.goto(URLB + 'attendance.html?event=ev_film', { waitUntil: 'networkidle2' });
  await until(async () => /The lists for this event are for its event team/.test(await text(MO)));
  ok('   nor the lists or the door sheet', /The lists for this event are for its event team/.test(await text(MO)) && !/Amy Audience/.test(await text(MO)));
  await MO.goto(URLB + 'checkin.html?event=ev_film', { waitUntil: 'networkidle2' });
  await until(async () => /for its event team/.test(await text(MO)));
  ok('   nor check-in', /Check-in for this event is for its event team/.test(await text(MO)) && !/Bob Popcorn/.test(await text(MO)));
  await MO.screenshot({ path: path.join(HERE, 'event-team-not-yours.png'), fullPage: true });

  /* ---------- 5. Martin: the team, the old overseers ---------- */
  const M = await browser('martin');
  await openEvent(M, 'ev_film');
  await until(async () => (await M.$$('#teamChips [data-tm]')).length === 3);
  const chips = await M.$$eval('#teamChips [data-tm]', c => c.map(x => x.getAttribute('data-tm')));
  ok('5. THE TEAM: Martin, Natasha, and Val JOINED FROM THE OLD OVERSEER NAMES (an exact match)', J(chips) === J(['m_martin', 'm_natasha', 'm_val']), J(chips));
  ok('   "Unknown Person" is left for someone to pick', /Named before as overseers, not on the team yet .*Unknown Person/.test(await text(M, '#teamLegacy')));
  const offered = await M.$$eval('#teamAdd option', o => o.map(x => x.textContent));
  ok('   adults only: the child is not offered', !offered.some(o => /Kit Child/.test(o)) && offered.some(o => /Mo Maintenance/.test(o)), J(offered));
  await M.screenshot({ path: path.join(HERE, 'event-team-field.png'), fullPage: false });
  await M.$eval('#save', b => b.click());
  await until(async () => ((await data('calEvents', 'ev_film')).teamMemberIds || []).includes('m_val'));
  const saved = await data('calEvents', 'ev_film');
  ok('   saved: memberIds AND accounts (Val\'s too); the unmatched name kept', J(saved.teamMemberIds) === J(['m_martin', 'm_natasha', 'm_val']) && saved.teamUids.includes(P.val.uid) && saved.teamUids.includes(P.natasha.uid) && J(saved.overseers) === J(['Unknown Person (invented)']), J(saved));
  const V = await browser('val');
  await V.goto(URLB + 'attendance.html?event=ev_film', { waitUntil: 'networkidle2' });
  await until(() => V.$('#dsShow'));
  ok('   AND VAL, NOW ON THE TEAM, sees the lists', !!(await V.$('#dsShow')));

  /* ---------- 6. new events; copies ---------- */
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#newEv'));
  await M.$eval('#newEv', b => b.click());
  await until(() => M.$('#teamChips'));
  ok('6. A NEW EVENT STARTS WITH ITS MAKER ON THE TEAM', J(await M.$$eval('#teamChips [data-tm]', c => c.map(x => x.getAttribute('data-tm')))) === J(['m_martin']));
  await openEvent(M, 'ev_film');
  await M.$eval('#dup', b => b.click());
  await until(async () => (await M.$eval('#f_title', e => e.value)) === 'Film Club: Paddington (invented) (copy)');
  await M.$eval('#save', b => b.click());
  const copy = await until(async () => (await db.collection('calEvents').where('title', '==', 'Film Club: Paddington (invented) (copy)').get()).docs[0]);
  ok('   a copy keeps the team', copy && J(copy.data().teamMemberIds) === J(['m_martin', 'm_natasha', 'm_val']), copy && J(copy.data().teamMemberIds));

  /* ---------- 7. the app ---------- */
  await N.setViewport({ width: 390, height: 844 });
  await N.goto(URLB + 'screenshots/events/app-harness.html?space=me&tab=whatson', { waitUntil: 'networkidle2' });
  await until(() => N.$('[data-w="run"]'));
  ok('7. "EVENTS I RUN" IN THE APP (What\'s on), opening it on the Events page', /Film Club: Paddington/.test(await text(N, '[data-w="run"]')) && (await N.$$eval('[data-w="run"] [data-wact]', e => e.map(x => x.getAttribute('data-wact')))).some(w => w.endsWith('events-admin.html?open=ev_film')), await N.$eval('[data-w="run"]', e => e.outerHTML.slice(0, 400)).catch(e => 'none: ' + e.message));
  await N.screenshot({ path: path.join(HERE, 'event-team-app-390.png'), fullPage: true });

  /* 8. a rota service is shown, not edited (F-218) */
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="rota_svc1"]'));
  await M.$eval('.open[data-id="rota_svc1"]', e => e.click());
  await until(() => M.$('#rotaOnly'));
  const ro = await text(M, '#rotaOnly');
  ok('8. A SUNDAY SERVICE FROM THE ROTA: shown, not edited ("Change it in the Rota Planner"), no Save', /Change it in the Rota Planner/.test(ro) && /Pat Preacher/.test(ro) && !(await M.$('#save')) && !(await M.$('#f_title')), ro);
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
