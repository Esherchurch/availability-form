/* "My usual people" (usualPeople; Martin, 15 Oct: "remember who I usually
   sign up"). Events window. Invented people only, events emulators only
   (with the hub's functions), network guard, nothing emailed.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/usual-people.test.mjs"

   What it proves, at 375px:
     1. signed in: "Same as last time: Martin, Natasha and Daniel" from the
        person's OWN most recent sign-up; one tap fills the names, the
        ticket (by its name) and the answers, all still editable
     2. answers filled in from last time are MARKED "please check"; health
        answers need a tick before anything is sent; without it nothing is
        saved
     3. edited and sent: the edited names and answers are what is saved
     4. NEVER ANYONE ELSE'S: another person's sign-up names appear nowhere
     5. the household as tick boxes (first names); tick and untick
     6. names from their own past sign-ups offered as they type
     7. a health answer older than six months is not filled in; others are
     8. "My usual people" on my place: remove a name, and it is offered no
        more; put it back
     9. the rules: nobody reads or writes another person's list
    10. signed out: the last sign-up's names on this device only, with "Not
        you? Clear"; nothing kept on the server
    11. nobody added is emailed: only the person signing up */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-usual-'));
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
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();

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
  martin: { email: 'martin.usual@example.invalid', name: 'Martin (invented)', mid: 'm_martin' },
  pat:    { email: 'pat.other@example.invalid', name: 'Pat Other (invented)', mid: 'm_pat' },
  sam:    { email: 'sam.longago@example.invalid', name: 'Sam Longago (invented)', mid: 'm_sam' }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: [], adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: [], adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
/* Martin's household: Natasha and Daniel (Daniel a child). */
await db.collection('addressBook').doc('m_natasha').set({ name: 'Natasha Usual (invented)', email: '', householdId: 'm_martin', markers: [], adminFor: [], masterAdmin: false });
await db.collection('addressBook').doc('m_daniel').set({ name: 'Daniel Usual (invented)', email: '', householdId: 'm_martin', isMinor: true, markers: [], adminFor: [], masterAdmin: false });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid', hubUrl: URLB });
/* After switch-over (the locked rules on) for 1-11; 12 is before it (F-203). */
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true, opensOn: '' });

const day = (n, h) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };
const EV = (title, when, extra) => ({ title, description: '', category: 'kids', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [], featured: false, allDay: false,
  startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 2 * 3600e3)), endUtc: when.getTime() + 2 * 3600e3,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 50, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
async function event(id, title, when, qs, tts) {
  await db.collection('calEvents').doc(id).set(EV(title, when));
  await db.collection('capacity').doc(id).set({ calEventId: id, taken: 0, capacity: 50 });
  for (const q of qs) await db.collection('calEvents').doc(id).collection('questions').doc(q.id).set(q);
  for (const t of tts) await db.collection('calEvents').doc(id).collection('ticketTypes').doc(t.id).set(t);
}
/* Last time's event and this time's: the same questions by name, their own ids. */
await event('ev_last', 'Kids club summer (invented)', day(-14, 10),
  [{ id: 'q_all', label: 'Allergies', kind: 'text', per: 'attendee', order: 1 }, { id: 'q_col', label: 'Favourite colour', kind: 'text', per: 'attendee', order: 2 }, { id: 'q_diet', label: 'Dietary needs', kind: 'text', per: 'booking', order: 3 }],
  [{ id: 'tt_l_adult', name: 'Adult', price: 0, order: 1 }, { id: 'tt_l_fam', name: 'Family', price: 0, order: 2 }]);
await event('ev_new', 'Kids club autumn (invented)', day(5, 10),
  [{ id: 'n_all', label: 'Allergies', kind: 'text', per: 'attendee', order: 1 }, { id: 'n_col', label: 'Favourite colour', kind: 'text', per: 'attendee', order: 2 }, { id: 'n_diet', label: 'Dietary needs', kind: 'text', per: 'booking', order: 3 }],
  [{ id: 'tt_n_adult', name: 'Adult', price: 0, order: 1 }, { id: 'tt_n_fam', name: 'Family', price: 0, order: 2 }]);
await event('ev_other', 'Quiz night (invented)', day(9, 19), [], []);
const SU = (who, ev, attendees, answers, tt, createdAt) => ({ calEventId: ev, personKind: 'addressBook', personId: P[who].mid, name: P[who].name, email: P[who].email, phone: '', attendees, answers: answers || {},
  places: attendees.length, ticketTypeId: tt || '', status: 'confirmed', donation: 0, notes: '', memberUid: P[who].uid, createdAt });
/* Martin: an older sign-up, then last time. */
await db.collection('signups').doc('su_martin_old_000000000000000000').set(SU('martin', 'ev_last', [{ name: 'Martin (invented)' }, { name: 'Old Friend (invented)' }], {}, 'tt_l_adult', ago(60)));
await db.collection('signups').doc('su_martin_last_00000000000000000').set(SU('martin', 'ev_last', [
  { name: 'Martin (invented)', q_q_all: 'None', q_q_col: 'Blue' },
  { name: 'Natasha (invented)', q_q_all: 'Peanuts', q_q_col: 'Green' },
  { name: 'Daniel (invented)', q_q_all: 'Dairy', q_q_col: 'Red' }], { q_diet: 'Vegetarian' }, 'tt_l_fam', ago(14)));
/* Someone else's: must never appear. */
await db.collection('signups').doc('su_pat_00000000000000000000000').set(SU('pat', 'ev_last', [{ name: 'PAT SECRET (invented)', q_q_all: 'PAT ALLERGY' }], { q_diet: 'PAT DIET' }, 'tt_l_fam', ago(1)));
/* Sam: last time was eight months ago. */
await db.collection('signups').doc('su_sam_00000000000000000000000').set(SU('sam', 'ev_last', [{ name: 'Sam Longago (invented)', q_q_all: 'Eggs', q_q_col: 'Yellow' }], { q_diet: 'Halal' }, 'tt_l_adult', ago(245)));

const errors = [], browsers = [];
async function browser(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 375, height: 812 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel) => p.$eval(sel, e => e.value);
const setVal = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const signupsOf = async (ev) => (await db.collection('signups').where('calEventId', '==', ev).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const open = async (p, ev) => { await p.goto(URLB + 'signup.html?event=' + ev, { waitUntil: 'networkidle2' }); await until(() => p.$('#nm')); };

try {
  /* ---------- 1. same as last time ---------- */
  const M = await browser('martin');
  await open(M, 'ev_new');
  await until(() => M.$('#usualSame'));
  ok('1. SIGNED IN: "Same as last time: Martin, Natasha and Daniel", from his own most recent sign-up', (await text(M, '#usualSame')) === 'Same as last time: Martin (invented), Natasha (invented) and Daniel (invented)', await text(M, '#usualBox').catch(() => ''));
  await M.screenshot({ path: path.join(HERE, 'usual-people-offer-375.png'), fullPage: true });
  await tap(M, '#usualSame');
  await until(() => M.$('#att2'));
  const names = [await val(M, '#att0'), await val(M, '#att1'), await val(M, '#att2')];
  ok('   one tap fills the three names', J(names) === J(['Martin (invented)', 'Natasha (invented)', 'Daniel (invented)']), J(names));
  ok('   the ticket, by its name ("Family", this event\'s own)', (await val(M, '#tt')) === 'tt_n_fam', await val(M, '#tt'));
  const filled = { a1: await val(M, '#a1_n_all'), c1: await val(M, '#a1_n_col'), diet: await val(M, '#b_n_diet') };
  ok('   the answers, matched by question (Natasha: Peanuts, Green; the booking: Vegetarian)', filled.a1 === 'Peanuts' && filled.c1 === 'Green' && filled.diet === 'Vegetarian', J(filled));

  /* ---------- 2. marked, and checked before sending ---------- */
  const marks = await M.$$eval('.prefill', fs => fs.map(f => f.textContent.includes('From last time: please check')));
  ok('2. EVERY ANSWER FROM LAST TIME IS MARKED "please check" (6 per person + 1 booking = 7)', marks.length === 7 && marks.every(Boolean), J(marks));
  ok('   health answers need a tick: "I have checked the health answers..."', !!(await M.$('#usualChecked')) && /allergies, medical, dietary/.test(await text(M, '#usualCheck')));
  const ticks = await M.$$eval('#usualHouse [data-usual-name]', cs => cs.map(c => c.checked));
  ok('   the household boxes follow: Martin, Natasha and Daniel all ticked (first names match the full names)', ticks.length === 3 && ticks.every(Boolean), JSON.stringify(ticks));
  const place = await M.evaluate(() => { const c = document.getElementById('usualChecked').getBoundingClientRect(), g = document.getElementById('go').getBoundingClientRect(), d = document.getElementById('b_n_diet').getBoundingClientRect(); return { aboveGo: c.bottom <= g.top && g.top - c.bottom < 120, belowAnswers: c.top > d.bottom }; });
  ok('   the health tick sits just above Sign up, below the answers', place.aboveGo && place.belowAnswers, JSON.stringify(place));
  await M.screenshot({ path: path.join(HERE, 'usual-people-filled-375.png'), fullPage: true });
  await sleep(2700);
  await tap(M, '#go');
  await until(async () => /Please check the answers filled in from last time/.test(await text(M, '#err')), 5000);
  ok('   sent without the tick: refused in words, and NOTHING SAVED', /Please check the answers filled in from last time/.test(await text(M, '#err')) && (await signupsOf('ev_new')).length === 0, await text(M, '#err'));

  /* ---------- 3. edited, then sent ---------- */
  await setVal(M, '#att2', 'Daniel J (invented)');
  await setVal(M, '#a2_n_all', 'Dairy and eggs');
  await tap(M, '#usualChecked');
  const sentFrom = new Date().toISOString();
  await tap(M, '#go');
  const saved = await until(async () => { const s = await signupsOf('ev_new'); return s.length ? s[0] : null; });
  ok('3. EDITED, THEN SENT: what he changed is what is saved', saved && J(saved.attendees.map(a => a.name)) === J(['Martin (invented)', 'Natasha (invented)', 'Daniel J (invented)']) && saved.attendees[2].q_n_all === 'Dairy and eggs' && saved.answers.n_diet === 'Vegetarian' && saved.ticketTypeId === 'tt_n_fam' && !J(saved).includes('_pre'), J(saved).slice(0, 500));

  /* ---------- 11. nobody added is emailed ---------- */
  const mails = await until(async () => { const r = (await db.collection('emailOutbox').get()).docs.map(d => d.data()).filter(m => m.at >= sentFrom); return r.length ? r : null; }, 15000) || [];
  ok('11. NOBODY ADDED IS EMAILED: one confirmation, to Martin only', mails.length === 1 && J(mails[0].to) === J([P.martin.email]), J(mails.map(m => m.to)));

  /* ---------- 4-6. never anyone else's; household; suggestions ---------- */
  await open(M, 'ev_other');
  await until(() => M.$('#usualHouse'));
  const house = await M.$$eval('#usualHouse [data-usual-name]', cs => cs.map(c => c.getAttribute('data-usual-name')));
  ok('5. THE HOUSEHOLD AS TICK BOXES: Martin, Natasha, Daniel (first names)', house[0] === 'Martin (invented)' && J(house.slice(1).sort()) === J(['Daniel', 'Natasha']), J(house));
  await M.$eval('#usualHouse [data-usual-name="Natasha"]', c => c.click());
  await until(async () => (await val(M, '#att0')) === 'Natasha');
  await M.$eval('#usualHouse [data-usual-name="Daniel"]', c => c.click());
  await until(() => M.$('#att1'));
  const t5 = [await val(M, '#att0'), await val(M, '#att1')];
  await M.$eval('#usualHouse [data-usual-name="Natasha"]', c => c.click());
  await until(async () => (await val(M, '#att0')) === 'Daniel');
  ok('   tick Natasha and Daniel: both in; untick Natasha: out again', J(t5) === J(['Natasha', 'Daniel']) && !(await M.$('#att1')), J(t5));
  const sugg = await M.$$eval('#usualNames option', os => os.map(o => o.value));
  ok('6. NAMES FROM HIS OWN PAST SIGN-UPS OFFERED AS HE TYPES (Old Friend from the older one too)', sugg.includes('Old Friend (invented)') && sugg.includes('Natasha (invented)') && (await M.$eval('#att0', i => i.getAttribute('list'))) === 'usualNames', J(sugg));
  const page = await M.content();
  ok('4. NEVER ANYONE ELSE\'S: Pat\'s names and answers appear nowhere', !/PAT SECRET|PAT ALLERGY|PAT DIET/.test(page) && !/PAT/.test(J(sugg)));

  /* ---------- 8. my usual people ---------- */
  await M.goto(URLB + 'my-signup.html?key=' + saved.id, { waitUntil: 'networkidle2' });
  await until(() => M.$('#usualCard'));
  ok('8. "MY USUAL PEOPLE" ON MY PLACE: his names, each with Remove', /Old Friend \(invented\)/.test(await text(M, '#usualCard')) && (await M.$$('[data-usual-hide]')).length >= 4);
  await M.$eval('[data-usual-hide="Old Friend (invented)"]', b => b.click());
  await until(() => M.$('[data-usual-show="Old Friend (invented)"]'));
  const hid = (await db.collection('signupUsual').doc(P.martin.uid).get()).data();
  ok('   removed: kept as "taken off" (Put back), on his own record', J(hid.hidden) === J(['Old Friend (invented)']), J(hid));
  await M.screenshot({ path: path.join(HERE, 'usual-people-manage-375.png'), fullPage: true });
  await open(M, 'ev_other');
  await until(() => M.$('#usualNames option'));
  const sugg2 = await M.$$eval('#usualNames option', os => os.map(o => o.value));
  ok('   and no longer offered when he signs up', !sugg2.includes('Old Friend (invented)') && sugg2.includes('Natasha (invented)'), J(sugg2));
  await M.goto(URLB + 'my-signup.html?key=' + saved.id, { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-usual-show="Old Friend (invented)"]'));
  await M.$eval('[data-usual-show="Old Friend (invented)"]', b => b.click());
  await until(async () => J(((await db.collection('signupUsual').doc(P.martin.uid).get()).data() || {}).hidden) === '[]');
  ok('   Put back: offered again', true);

  /* ---------- 9. the rules ---------- */
  const PT = await browser('pat');
  const r1 = await PT.evaluate((u) => EGBCAuth.db.collection('signupUsual').doc(u).get().then(() => 'read', e => e.code), P.martin.uid);
  const r2 = await PT.evaluate((u) => EGBCAuth.db.collection('signupUsual').doc(u).set({ hidden: ['x'] }).then(() => 'written', e => e.code), P.martin.uid);
  const r3 = await PT.evaluate((u) => EGBCAuth.db.collection('signups').where('memberUid', '==', u).get().then(() => 'listed', e => e.code), P.martin.uid);
  const r4 = await PT.evaluate((u) => EGBCAuth.db.collection('signupUsual').doc(u).set({ hidden: ['mine'], extra: 'no' }).then(() => 'written', e => e.code), P.pat.uid);
  ok('9. THE RULES: Pat can\'t read or write Martin\'s list, or list his sign-ups; her own list takes only names', /permission/.test(r1) && /permission/.test(r2) && /permission/.test(r3) && /permission/.test(r4), J([r1, r2, r3, r4]));
  await open(PT, 'ev_new');
  await until(() => PT.$('#usualSame'));
  ok('   and Pat is offered only her own: "Same as last time: PAT SECRET"', (await text(PT, '#usualSame')) === 'Same as last time: PAT SECRET (invented)' && !/Natasha|Martin \(invented\)/.test(await PT.$$eval('#usualNames option', os => os.map(o => o.value).join(','))));

  /* ---------- 7. six months ---------- */
  const S = await browser('sam');
  await open(S, 'ev_new');
  await until(() => S.$('#usualSame'));
  await tap(S, '#usualSame');
  await until(async () => (await val(S, '#att0')) === 'Sam Longago (invented)');
  const s7 = { all: await val(S, '#a0_n_all'), col: await val(S, '#a0_n_col'), diet: await val(S, '#b_n_diet') };
  ok('7. LAST TIME EIGHT MONTHS AGO: allergies and dietary NOT filled in; the favourite colour is', s7.all === '' && s7.diet === '' && s7.col === 'Yellow' && !(await S.$('#usualChecked')), J(s7));

  /* ---------- 10. signed out ---------- */
  const G = await browser('guest');
  await open(G, 'ev_new');
  await sleep(1500);
  ok('10. SIGNED OUT, FIRST TIME: nothing offered', !(await G.$('#usualSame')));
  await G.type('#nm', 'Gina Guest (invented)'); await G.type('#em', 'gina.guest@example.invalid'); await G.type('#att0', 'Gina Guest (invented)');
  await G.$eval('#addAtt', b => b.click()); await G.waitForSelector('#att1'); await G.type('#att1', 'Gus Guest (invented)');
  await sleep(2700);
  await tap(G, '#go');
  await until(async () => /You are signed up/.test(await text(G, '#signupCard')));
  const ls = await G.evaluate(() => localStorage.getItem('egbc_usual_v1'));
  await open(G, 'ev_other');
  await until(() => G.$('#usualSame'));
  ok('    next time on this device: "Same as last time: Gina and Gus", and "Not you? Clear"', (await text(G, '#usualSame')) === 'Same as last time: Gina Guest (invented) and Gus Guest (invented)' && !!(await G.$('#usualClear')) && /Gina/.test(ls) && !/gina\.guest@/.test(ls), ls);
  await G.screenshot({ path: path.join(HERE, 'usual-people-device-375.png'), fullPage: true });
  await tap(G, '#usualClear');
  ok('    Clear: gone, from the page and the device', !(await G.$('#usualSame')) && (await G.evaluate(() => localStorage.getItem('egbc_usual_v1'))) === null);
  const usualDocs = (await db.collection('signupUsual').get()).docs.map(d => d.id);
  ok('    nothing kept on the server for a signed-out person (only Martin\'s own record exists)', J(usualDocs) === J([P.martin.uid]), J(usualDocs));

  /* ---------- 12. BEFORE SWITCH-OVER (F-203): rulesLocked not true ---------- */
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: false, opensOn: '1 November' });
  await event('ev_off', 'Kids club winter (invented)', day(12, 10),
    [{ id: 'o_all', label: 'Allergies', kind: 'text', per: 'attendee', order: 1, required: true }, { id: 'o_col', label: 'Favourite colour', kind: 'text', per: 'attendee', order: 2 }, { id: 'o_diet', label: 'Dietary needs', kind: 'text', per: 'booking', order: 3, required: true }],
    [{ id: 'tt_o_fam', name: 'Family', price: 0, order: 1 }]);
  await open(M, 'ev_off');
  await until(() => M.$('#healthLater'));
  ok('12. BEFORE SWITCH-OVER: the health questions are not asked (even required ones); the others are', !(await M.$('#a0_o_all')) && !(await M.$('#b_o_diet')) && !!(await M.$('#a0_o_col')));
  ok('    and the page says: "Please tell the organiser about any health needs (allergies, medical, dietary) directly until 1 November."', (await text(M, '#healthLater')) === 'Please tell the organiser about any health needs (allergies, medical, dietary) directly until 1 November.', await text(M, '#healthLater'));
  await until(() => M.$('#usualSame'));
  await tap(M, '#usualSame');
  await until(async () => (await val(M, '#att1').catch(() => '')) === 'Natasha (invented)');
  ok('    "Same as last time" fills the names and the colour, no health answers, and no health tick', (await val(M, '#a1_o_col')) === 'Green' && !(await M.$('#usualChecked')) && !/Peanuts|Dairy|Vegetarian/.test(await M.content()));
  await M.screenshot({ path: path.join(HERE, 'usual-people-before-switchover-375.png'), fullPage: true });
  await sleep(2700);
  await tap(M, '#go');
  const off = await until(async () => (await signupsOf('ev_off'))[0]);
  ok('    THE SIGN-UP STILL WORKS, and NO HEALTH ANSWER IS SAVED (the colour is)', off && off.attendees.length === 3 && off.attendees[1].q_o_col === 'Green' && !J(off).includes('q_o_all') && !('o_diet' in (off.answers || {})) && !/Peanuts|Dairy|Vegetarian/.test(J(off)), J(off).slice(0, 400));
  await M.goto(URLB + 'my-signup.html?key=' + off.id, { waitUntil: 'networkidle2' });
  await until(() => M.$('#usualCard'));
  ok('    "My usual people": nothing can be taken off yet ("You can take names off from 1 November.")', /You can take names off from 1 November\./.test(await text(M, '#usualCard')) && !(await M.$('[data-usual-hide]')));
  const tried = await M.evaluate(() => EGBCUsual.hide('Natasha (invented)').then(() => 'saved', e => e.message));
  ok('    and the list is not saved on the server, even if asked', /from 1 November/.test(tried) && J(((await db.collection('signupUsual').doc(P.martin.uid).get()).data() || {}).hidden) === '[]', tried);
  const G2 = await browser('guest2');
  await open(G2, 'ev_off');
  await until(() => G2.$('#healthLater'));
  await G2.type('#nm', 'Gwen Guest (invented)'); await G2.type('#em', 'gwen.guest@example.invalid'); await G2.type('#att0', 'Gwen Guest (invented)');
  await sleep(2700); await tap(G2, '#go');
  await until(async () => /You are signed up/.test(await text(G2, '#signupCard')));
  ok('    signed out: the device memory still works ("this device only" is fine)', /Gwen Guest/.test(await G2.evaluate(() => localStorage.getItem('egbc_usual_v1') || '')));
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true, opensOn: '1 November' });
  await open(M, 'ev_off');
  await until(() => M.$('#a0_o_all'));
  ok('    SWITCHED OVER (rulesLocked true): the health questions are asked again, and the note is gone', !!(await M.$('#a0_o_all')) && !!(await M.$('#b_o_diet')) && !(await M.$('#healthLater')));

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
