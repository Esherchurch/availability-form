/* Phone notifications end to end (launch list item 4; FINDINGS-notify N-4,
   N-5, N-7 is the real-phone part this cannot prove).
   Events window. Invented people only, events emulators only, network
   guard. NOTHING LEAVES THE MACHINE: on the emulator the main window's
   functions write every push to pushOutbox and every email to emailOutbox.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/notify-e2e.test.mjs"

   The chain under test: my pages (notifications.html, egbc-notify.js) ->
   the main window's REAL functions (codebase hub, run by the functions
   emulator) -> pushOutbox / emailOutbox -> my service worker
   (egbc-notify-sw.js) deciding what the phone shows. The two timed
   reminders (rota, checks) are run directly from functions/notify.js at a
   chosen time, because a timer cannot be fired on the emulator.

   What it proves:
     1. CALL A PARENT: a group leader presses it; both parents are reached
        (a phone, and an email for the one with none); the phone shows
        "Please come to Juniors / Collection code Q7P2" and NEVER THE
        CHILD'S NAME, anywhere in what is sent, emailed or logged; a dead
        phone is removed; a second press inside two minutes sends nothing;
        someone who leads nothing is refused
     2. it is loud at night; a rota reminder at night arrives silently
     3. the switches: a message turned off is not sent at all; no phone
        means email, except booking news (the page emails those already)
     4. every launch message arrives with its own words: test, rota,
        booking, maintenance job (no photo), urgent notice, checks
     5. timers and triggers that run twice send once
     6. the service worker shows exactly the words sent, loud or silent,
        and a tap opens the hub inside its own scope */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-nte2e-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

/* The functions' own copy of the Admin SDK, and their sender. FN_DIR is
   for the deliberate breaks only: a scratch copy of functions/, so the
   main window's files are never edited, even for a moment. */
const FN = process.env.FN_DIR || path.join(V2, 'functions');
const fnRequire = createRequire(path.join(FN, 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getAuth } = fnRequire('firebase-admin/auth');
const Notify = await import(pathToFileURL(path.join(FN, 'notify.js')).href);
const Core = fnRequire('./notify-core.cjs');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const adminAuth = getAuth();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(300); } return last; }
const J = (x) => JSON.stringify(x);

/* A London wall-clock time on a London date, as an instant. */
const TODAY = Notify.londonDate(new Date());
const dayPlus = (n) => Notify.londonDate(new Date(), n);
function londonAt(ymd, hhmm) {
  const [y, m, d] = ymd.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  for (const off of [60, 0]) {
    const t = new Date(Date.UTC(y, m - 1, d, h, mi) - off * 60000);
    if (Core.londonMinutes(t) === h * 60 + mi && Notify.londonDate(t) === ymd) return t;
  }
  throw new Error('no such London time');
}
const yearsAgo = (n, plusDays = 0) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() + plusDays); return d.toISOString().slice(0, 10); };

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

/* ---------------- the people (all invented) ---------------- */
const P = {
  jo:   { email: 'jo.leader@example.invalid', name: 'Jo Leader', mid: 'm_jo', teams: ['Kids Church'] },
  ann:  { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] },
  rob:  { email: 'rob.bass@example.invalid', name: 'Rob Bass', mid: 'm_rob', teams: ['Worship Team'] },
  mo:   { email: 'mo.maint@example.invalid', name: 'Mo Maintenance', mid: 'm_mo', teams: ['Maintenance'] },
  sam:  { email: 'sam.member@example.invalid', name: 'Sam Member', mid: 'm_sam', teams: [] },
  lead: { email: 'sg.lead@example.invalid', name: 'Safe Lead', mid: 'm_lead', teams: [] },
  /* Parents NOT in the address book (N-6b), with verified sign-ins. */
  pam:  { email: 'pam.parent@example.invalid', name: 'Pam Parent', parent: true },
  pat:  { email: 'pat.parent@example.invalid', name: 'Pat Parent', parent: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  await adminAuth.updateUser(P[k].uid, { emailVerified: true });
}
const CHILD = 'Cat Synthetic', CK = 'kids_grp_j_' + TODAY + '__kc_q8w2e4r6t8y0u1__0';
const seed = async () => {
  const b = db.batch(), set = (c, id, d) => b.set(db.collection(c).doc(id), d);
  for (const k of Object.keys(P)) {
    const x = P[k]; if (x.parent) continue;
    set('addressBook', x.mid, { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    set('users', x.uid, { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  set('churchSettings', 'details', { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  set('sites', 'site_k', { name: 'Test Green', active: true, order: 1 });
  set('bookingSettings', 'site_k', { bookingsAdmins: [], safeguardingLead: 'm_lead', safeguardingDeputy: '' });
  set('kidsSettings', 'site_k', { teams: ['Kids Church'] });
  set('kidsGroups', 'grp_j', { siteId: 'site_k', name: 'Juniors', leaderIds: ['m_jo'], years: [3, 4] });
  set('kidsFamilies', 'fam_1', { siteId: 'site_k', parentName: 'Pam Parent', email: P.pam.email, email2: P.pat.email, phone: '07700 900111' });
  set('kidsChildren', 'kc_q8w2e4r6t8y0u1', { siteId: 'site_k', familyId: 'fam_1', name: CHILD, groupId: 'grp_j', status: 'registered', collectors: [] });
  set('checkins', CK, { kind: 'child', state: 'in', siteId: 'site_k', groupId: 'grp_j', familyId: 'fam_1', pickupCode: 'Q7P2', name: CHILD,
    signupKey: 'kc_q8w2e4r6t8y0u1', attendeeIndex: 0, calEventId: 'kids_grp_j_' + TODAY, day: TODAY, inAt: 'x', inBy: 'x', inByName: 'x', roomId: '', updatedAt: 'x' });
  set('rooms', 'room_hall', { siteId: 'site_k', name: 'Test Hall', kind: 'room', active: true });
  await b.commit();
};
await seed();

/* ---------------- reading the outboxes ---------------- */
const pushes = async () => (await db.collection('pushOutbox').get()).docs.map(d => d.data()).sort((a, b) => a.at < b.at ? -1 : 1);
const emails = async () => (await db.collection('emailOutbox').get()).docs.map(d => d.data());
const tokenOf = async (uid) => (await db.collection('pushTokens').where('uid', '==', uid).get()).docs.map(d => d.data().token);
const forToken = (list, tok) => list.filter(p => (p.tokens || []).includes(tok));

/* The service worker, as a phone would run it. */
async function phoneShows(data) {
  const shown = [], opened = [], handlers = {};
  const self = {
    addEventListener: (t, f) => { handlers[t] = f; },
    registration: { scope: URLB, showNotification: (title, o) => { shown.push({ title, ...o }); return Promise.resolve(); } },
    clients: { matchAll: () => Promise.resolve([]), openWindow: (u) => { opened.push(u); return Promise.resolve(); } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-notify-sw.js'), 'utf8'), { self, URL, String, Promise });
  handlers.push({ data: { json: () => ({ data }) }, waitUntil: () => {} });
  const n = shown[0];
  /* A tap finishes when the promise it hands waitUntil does. */
  let done = Promise.resolve();
  handlers.notificationclick({ notification: { data: n.data, close: () => {} }, waitUntil: (p) => { done = p; } });
  await done;
  return { ...n, opened: opened[0] };
}

/* ---------------- the browsers ---------------- */
const errors = [], browsers = [];
async function as(who, tok) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k, tok) => {
    try { sessionStorage.setItem(k, '1'); } catch (e) {}
    window.__perm = 'default';
    window.__EGBC_NOTIFY_DRIVER = {
      supported: () => true, permission: () => window.__perm,
      ask: () => { window.__perm = 'granted'; return Promise.resolve('granted'); },
      token: () => Promise.resolve(tok), forget: () => Promise.resolve(true)
    };
  }, 'egbc_fresh_' + STAMP, tok || ('fcm-invented-' + who + '-' + 'x'.repeat(40)));
  await p.setViewport({ width: 390, height: 844 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await p.goto(URLB + 'notifications.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.EGBCNotify && window.EGBCAuth && EGBCAuth.user && EGBCAuth.user(), { timeout: 20000 });
  return p;
}
const turnOn = (p) => p.evaluate(() => EGBCNotify.turnOn().then(() => 'on', (e) => 'failed: ' + (e.code || e.message)));

/* The sender, for the two timers, built as index.js builds it. */
const deps = {
  db, auth: adminAuth,
  push: Notify.pushTransport({ db, onEmulator: true }),
  email: async (msg, meta) => { await db.collection('emailOutbox').add({ ...msg, ...meta, at: new Date().toISOString(), ok: true, stubbed: true }); return { ok: true }; },
  hub: await Notify.hubUrl(db)
};

try {
  /* ---------- phones on ---------- */
  const PAM = await as('pam'), ROB = await as('rob'), MO = await as('mo'), JO = await as('jo'), ANN = await as('ann');
  ok('0. the parent (not in the address book), Rob and Mo turn notifications on, on the page', (await turnOn(PAM)) === 'on' && (await turnOn(ROB)) === 'on' && (await turnOn(MO)) === 'on');
  const pamTok = (await tokenOf(P.pam.uid))[0];
  await db.collection('pushTokens').doc(P.pam.uid + '_oldphone').set({ uid: P.pam.uid, token: 'dead-pam-old-phone', platform: 'android', createdAt: new Date(), lastSeen: new Date() });
  /* Mo has turned the day-before-I-serve reminder off, on the page. */
  await MO.evaluate(() => EGBCNotify.loadPrefs().then(p => { p.types.rota = false; return EGBCNotify.savePrefs(p); }));
  ok('   Mo turns "the day before I serve" off', (await db.collection('notifyPrefs').doc(P.mo.uid).get()).data().types.rota === false);

  /* ---------- 0b. the main window's master switch (A-081), off by default ---------- */
  const r0 = await JO.evaluate((id) => EGBCNotify.callParent(id).then(r => ({ r, words: EGBCNotify.callWords(r) })), CK);
  ok('0. SWITCHED OFF (the default): calling a parent is refused in words, and nothing is sent', r0.r.error === 'failed-precondition' && /not switched on yet/.test(r0.words) && (await pushes()).length === 0, J(r0));
  await db.collection('churchSettings').doc('notifications').set({ live: true });

  /* ---------- 1. call a parent ---------- */
  const r1 = await JO.evaluate((id) => EGBCNotify.callParent(id).then(r => ({ r, words: EGBCNotify.callWords(r) })), CK);
  ok('1. CALL A PARENT: Jo (Juniors\' leader) presses it: one phone, one email', r1.r.phones === 1 && r1.r.emailed === 1, J(r1));
  ok('   and is told so in words', r1.words === 'Sent to 1 phone, emailed 1.', r1.words);
  const call = forToken(await pushes(), pamTok)[0];
  ok('   the parent\'s phone gets "Please come to Juniors" / "Collection code Q7P2", urgent', call && call.data.title === 'Please come to Juniors' && call.data.body === 'Collection code Q7P2' && call.urgency === 'high', J(call));
  const pat = (await emails()).filter(e => (e.to || []).includes(P.pat.email));
  ok('   the second parent, with no phone, is emailed the same words', pat.length === 1 && pat[0].subject === 'Please come to Juniors' && /Collection code Q7P2/.test(pat[0].html), J(pat));
  const everything = J(await pushes()) + J(await emails()) + J((await db.collection('notifyLog').get()).docs.map(d => d.data()));
  ok('   THE CHILD\'S NAME IS NOWHERE: not in the push, the email or the log', !everything.includes('Cat') && !everything.includes('Synthetic'), everything.slice(0, 400));
  const shows = await phoneShows(call.data);
  ok('   THE PHONE SHOWS exactly that, stays on screen, and is not silent', shows.title === 'Please come to Juniors' && shows.body === 'Collection code Q7P2' && shows.requireInteraction === true && shows.silent === false && !/Cat/.test(J(shows)), J(shows));
  ok('   tapped, it opens the hub inside its own scope', shows.opened === URLB + 'app.html', shows.opened);
  ok('   the parent\'s old, dead phone is removed', !(await db.collection('pushTokens').doc(P.pam.uid + '_oldphone').get()).exists);
  const logs = (await db.collection('notifyLog').get()).docs.map(d => d.data());
  ok('   the log keeps no phone address and no email address', !/fcm-invented|dead-pam|example\.invalid/.test(J(logs)) && logs.some(l => l.type === 'callParent' && l.phones === 1), J(logs));

  const n1 = (await pushes()).length;
  const r2 = await JO.evaluate((id) => EGBCNotify.callParent(id).then(r => ({ r, words: EGBCNotify.callWords(r) })), CK);
  ok('1. a second press inside two minutes sends nothing, and says so', r2.r.reason === 'too-soon' && /less than two minutes ago/.test(r2.words) && (await pushes()).length === n1, J(r2));
  const r3 = await ANN.evaluate((id) => EGBCNotify.callParent(id), CK);
  ok('1. SOMEONE WHO LEADS NOTHING IS REFUSED', r3.error === 'permission-denied' && (await pushes()).length === n1, J(r3));

  /* ---------- 2. loud at night, quiet at night ---------- */
  let night = londonAt(TODAY, '23:30');
  if (night.getTime() < Date.now() + 3 * 60000) night = londonAt(dayPlus(1), '23:30');
  const r4 = await Notify.callParent(deps, { uid: P.jo.uid, checkinId: CK, now: night });
  const nightCall = forToken(await pushes(), pamTok).slice(-1)[0];
  ok('2. at 23:30, calling a parent is NOT quiet', r4.phones === 1 && nightCall.data.silent === 'false' && (await phoneShows(nightCall.data)).silent === false, J(r4) + J(nightCall));

  /* ---------- 3 and 4. the day before I serve ---------- */
  const robTok = (await tokenOf(P.rob.uid))[0], moTok = (await tokenOf(P.mo.uid))[0];
  await db.collection('events').doc('rota_d1').set({ date: dayPlus(1), type: 'Morning Service', startTime: '10:30',
    assignments: { Bass: { id: 'm_rob', name: 'Rob' }, Welcome: { id: 'm_sam', name: 'Sam' }, Sound: { id: 'm_mo', name: 'Mo' } } });
  await Notify.runRotaReminders(deps, londonAt(TODAY, '17:00'));
  const rota = forToken(await pushes(), robTok)[0];
  ok('4. ROTA at 17:00: Rob\'s phone, "You are serving tomorrow", his role and the service, not quiet', rota && rota.data.title === 'You are serving tomorrow' && /Bass/.test(rota.data.body) && /Morning Service, 10:30/.test(rota.data.body) && rota.data.silent === 'false', J(rota));
  const samRota = (await emails()).filter(e => (e.to || []).includes(P.sam.email) && e.subject === 'You are serving tomorrow');
  ok('3. Sam has no phone: emailed instead', samRota.length === 1 && samRota[0].subject === 'You are serving tomorrow', J(samRota));
  ok('3. MO TURNED IT OFF: nothing to his phone, and no email either', forToken(await pushes(), moTok).length === 0 && !(await emails()).some(e => (e.to || []).includes(P.mo.email)));
  const n2 = (await pushes()).length, e2 = (await emails()).length;
  await Notify.runRotaReminders(deps, londonAt(TODAY, '17:00'));
  ok('5. the timer runs again (a retry): nobody gets it twice', (await pushes()).length === n2 && (await emails()).length === e2);
  await db.collection('events').doc('rota_d2').set({ date: dayPlus(2), type: 'Evening Service', startTime: '18:30', assignments: { Bass: { id: 'm_rob', name: 'Rob' } } });
  await Notify.runRotaReminders(deps, londonAt(dayPlus(1), '22:00'));
  const quietRota = forToken(await pushes(), robTok).slice(-1)[0];
  ok('2. a rota reminder at 22:00 ARRIVES, SILENTLY (quiet hours 21:30 to 07:30)', quietRota && /Evening Service/.test(quietRota.data.body) && quietRota.data.silent === 'true' && (await phoneShows(quietRota.data)).silent === true, J(quietRota));

  /* ---------- 4. "send me a test" ---------- */
  const t = await PAM.evaluate(() => EGBCNotify.test());
  const testPush = forToken(await pushes(), pamTok).slice(-1)[0];
  ok('4. TEST: the parent presses "Send me a test": it reaches her phone', t.phones === 1 && testPush.data.title === 'Notifications are on', J(t) + J(testPush));

  /* ---------- 4. bookings (a trigger) ---------- */
  const BK = (uid) => ({ kind: 'member', status: 'requested', siteId: 'site_k', roomId: 'room_hall', day: dayPlus(5), startLocal: dayPlus(5) + 'T19:00', memberUid: uid, title: 'Practice (invented)' });
  await db.collection('bookings').doc('bk_rob').set(BK(P.rob.uid));
  await db.collection('bookings').doc('bk_sam').set(BK(P.sam.uid));
  await db.collection('bookings').doc('bk_rob').update({ status: 'confirmed' });
  await db.collection('bookings').doc('bk_sam').update({ status: 'declined' });
  const bk = await until(async () => forToken(await pushes(), robTok).find(p => p.data.type === 'booking'));
  ok('4. BOOKING approved: Rob\'s phone, "Your booking is confirmed", the room and the day', bk && bk.data.title === 'Your booking is confirmed' && /Test Hall/.test(bk.data.body), J(bk));
  await until(async () => (await db.collection('notifyLog').where('type', '==', 'booking').get()).size >= 2);
  ok('3. Sam (no phone) is NOT emailed by the function: the page emails booking news already', !(await emails()).some(e => (e.to || []).includes(P.sam.email) && /booking/i.test(String(e.kind || '') + String(e.subject || ''))));
  const nb = (await pushes()).length;
  await db.collection('bookings').doc('bk_rob').update({ title: 'Practice, renamed (invented)' });
  await sleep(4000);
  ok('5. a change that is not a status change sends nothing', (await pushes()).length === nb);

  /* ---------- 4. a maintenance job (a trigger) ---------- */
  await db.collection('maintJobs').doc('job_1').set({ siteId: 'site_k', roomId: 'room_hall', where: 'Test Hall', what: 'Radiator dripping (invented)', details: 'Under the window.',
    photoPath: 'maintJobs/job_1/photo', status: 'todo', reportedBy: P.ann.uid, reportedByName: 'Ann Attender', reportedAt: new Date() });
  const mj = await until(async () => forToken(await pushes(), moTok).find(p => p.data.type === 'maintJob'));
  ok('4. MAINTENANCE: Mo\'s phone, "New maintenance job", where and what', mj && mj.data.title === 'New maintenance job' && mj.data.body === 'Test Hall: Radiator dripping (invented)', J(mj));
  ok('   NO PHOTO: neither the picture nor where it is kept', !/photo/i.test(J(mj.data)));
  const mjShows = await phoneShows(mj.data);
  ok('   it opens that job', mjShows.opened === URLB + 'maintenance.html#job_1', mjShows.opened);

  /* ---------- 4. an urgent notice (a trigger) ---------- */
  await db.collection('news').doc('n_urgent').set({ title: 'Hall closed today', body: '<p>The <b>hall</b> is closed today.</p>', teams: [], urgent: true, postedBy: 'x' });
  const ur = await until(async () => forToken(await pushes(), robTok).find(p => p.data.type === 'urgent'));
  ok('4. URGENT: to everyone, "Urgent: Hall closed today", the words as plain text, never quiet', ur && ur.data.title === 'Urgent: Hall closed today' && ur.data.body === 'The hall is closed today.' && ur.urgency === 'high' && ur.data.silent === 'false', J(ur));
  ok('   Mo\'s phone too', !!(await until(async () => forToken(await pushes(), moTok).find(p => p.data.type === 'urgent'))));
  const nu = (await pushes()).filter(p => p.data.type === 'urgent').length;
  await db.collection('news').doc('n_urgent').update({ title: 'Hall closed today (edited)' });
  await sleep(4000);
  ok('5. editing an urgent notice does not send it again', (await pushes()).filter(p => p.data.type === 'urgent').length === nu);

  /* ---------- 4. checks running out (§24) ---------- */
  await db.collection('leaderChecks').doc('m_rob').set({ name: 'Rob Bass', siteId: 'site_k', dbsStatus: 'current', dbsSeen: yearsAgo(1), trainingDate: yearsAgo(3, 20) });
  await Notify.runChecksReminders(deps, new Date());
  const ch = forToken(await pushes(), robTok).find(p => p.data.type === 'checks');
  ok('4. CHECKS: Rob\'s phone, "Your safeguarding training runs out soon"', ch && ch.data.title === 'Your safeguarding training runs out soon', J(ch));
  const leadMail = (await emails()).filter(e => (e.to || []).includes(P.lead.email) && e.subject === 'DBS checks and training running out');
  ok('   the site\'s safeguarding lead gets one email listing it', leadMail.length === 1 && /Rob Bass/.test(leadMail[0].html), J(leadMail));
  const nc = (await pushes()).length, ec2 = (await emails()).length;
  await Notify.runChecksReminders(deps, new Date());
  ok('5. run again the same week: nobody is told twice', (await pushes()).length === nc && (await emails()).length === ec2);

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
