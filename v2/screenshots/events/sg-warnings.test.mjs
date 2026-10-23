/* THE SAFEGUARDING RISK REGISTER, step 3: live warnings and the email two
   days before (F-265). Events window. Invented people, groups and events
   only, events emulators only (with the hub's functions), network guard;
   the email goes to a stand-in that keeps it on this machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/sg-warnings.test.mjs"

   What it proves:
     1. THE SERVER works out a site's warnings from what the hub holds:
        two adults this morning, an under-18s trip short of leaders and not
        signed off, a leader's check run out, consent forms missing
     2. THE LEAD sees them on the register's Warnings tab, worst first,
        each with what to do and a way to it; a standing risk whose
        control has slipped is marked on the first tab
     3. COUNTS ONLY: no child's or leader's name anywhere in them
     4. A TRUSTEE reads them, with no way into the pages that show names
     5. A VOLUNTEER is refused, by the database and by the server
     6. "REFRESH NOW": a second leader checks in; the warning goes
     7. THE EMAIL TWO DAYS BEFORE: the lead and deputy, once, no names
     8. 375px and computer, no sideways scrolling, pictures */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sgw-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const { runSgWarnings, runTwoAdultsMail, londonDay } = await import('../../functions/sg-warnings.js');
const Core = fnRequire('./sg-warnings-core.cjs');

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
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

const TODAY = londonDay(new Date()), D2 = Core.plus(TODAY, 2);
const WD2 = new Date(D2 + 'T12:00:00Z').getUTCDay() || 7;   /* a Sunday group's day: 1-7, Monday to Sunday */
const P = {
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Kids Church'] },
  dee:  { email: 'dee.deputy@example.invalid', name: 'Dee Deputy (invented)', mid: 'm_dee', teams: [] },
  tom:  { email: 'tom.trustee@example.invalid', name: 'Tom Trustee (invented)', mid: 'm_tom', teams: ['Elders'] },
  vic:  { email: 'vic.volunteer@example.invalid', name: 'Vic Volunteer (invented)', mid: 'm_vic', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const NAMES = /Lena|Dee|Tom|Vic|Charlie|Casey|m_vic|m_lena/;
{
  const b = db.batch(), S = (c, id, d) => b.set(db.collection(c).doc(id), d);
  for (const k of Object.keys(P)) {
    const x = P[k];
    S('addressBook', x.mid, { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    S('users', x.uid, { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  for (const name of ['Kids Church', 'Elders']) S('teams', name, { name, label: name, rota: true, order: 1 });
  S('churchSettings', 'details', { name: 'Test Green Church' });
  S('sites', 'site_t', { name: 'Test Green', active: true, order: 1 });
  S('bookingSettings', 'site_t', { bookingsAdmins: [], safeguardingLead: 'm_lena', safeguardingDeputy: 'm_dee' });
  S('safeguardingSettings', 'defaults', { templates: {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, leadSiteId: 'site_t', leadName: 'Lena Lead (invented)', leadPhone: '', updatedAt: 'x', updatedBy: 'x' });
  /* a Sunday group meeting two days on, with one regular leader, whose check has run out */
  S('kidsGroups', 'kg_juniors', { siteId: 'site_t', name: 'Juniors (invented)', years: [3, 4], active: true, ratio: 8, leaderIds: ['m_vic'], day: WD2, order: 1 });
  S('leaderChecks', 'm_vic', { dbsStatus: 'seen', dbsSeen: '2020-01-01', trainingDate: '2020-01-01' });
  S('leaderChecks', 'm_lena', { dbsStatus: 'seen', dbsSeen: Core.plus(TODAY, -100), trainingDate: Core.plus(TODAY, -100) });
  /* this morning: three children in, one leader */
  for (const [i, n] of ['Charlie Child (invented)', 'Casey Child (invented)', 'Cal Child (invented)'].entries()) {
    S('checkins', 'ck_' + i, { calEventId: 'kids_kg_juniors_' + TODAY, signupKey: 'kc_' + i, attendeeIndex: 0, name: n, kind: 'child', state: 'in', inAt: 'x', day: TODAY, groupId: 'kg_juniors', siteId: 'site_t', familyId: 'f_' + i, pickupCode: '1234' });
    S('kidsChildren', 'kc_' + i, { siteId: 'site_t', groupId: 'kg_juniors', name: n, status: 'registered', consentUntil: i === 0 ? '' : Core.plus(TODAY, 300) });
  }
  S('kidsLeaderIns', 'site_t_' + TODAY + '_m_vic', { siteId: 'site_t', day: TODAY, memberId: 'm_vic', name: 'Vic Volunteer (invented)', groupId: 'kg_juniors', state: 'in', inAt: 'x' });
  /* an under-18s trip two days on: one leader named for six children, not signed off */
  S('calEvents', 'ev_trip', { title: 'Beach trip (invented)', status: 'confirmed', visibility: 'public', signupOn: true, capacity: 30, sgKind: 'trip',
    startLocal: D2 + 'T10:00', startUtc: Date.parse(D2 + 'T10:00:00Z'), endLocal: D2 + 'T16:00', endUtc: Date.parse(D2 + 'T16:00:00Z'), location: { kind: 'room', siteId: 'site_t', roomIds: [] } });
  S('eventLeaders', 'ev_trip', { under18: true, leaders: [{ memberId: 'm_vic', name: 'Vic Volunteer (invented)', uid: P.vic.uid }], leaderIds: ['m_vic'], leaderUids: [P.vic.uid], siteId: 'site_t', clearedIds: [], lastCleared: [], updatedAt: 'x', updatedBy: 'x' });
  S('signups', 'su_1', { calEventId: 'ev_trip', personKind: 'contacts', personId: 'c_1', name: 'Parent (invented)', email: 'p@example.invalid', places: 6, status: 'confirmed', attendees: Array.from({ length: 6 }, (_, i) => ({ name: 'Child ' + (i + 1) + ' (invented)' })), answers: {} });
  /* the register: the group as an activity, with a two-adults risk and a written-only one */
  S('sgActivities', 'act_jun', { siteId: 'site_t', kind: 'sunday', name: 'Juniors (invented)', link: { type: 'kidsGroup', id: 'kg_juniors' }, active: true, updatedAt: 'x', updatedBy: 'x' });
  const R = (id, risk, controls) => S('sgRisks', id, { siteId: 'site_t', activityId: 'act_jun', risk, who: 'Children', l: 3, i: 4, controls, ownerName: 'The Juniors leader', reviewDue: Core.plus(TODAY, 90), rl: 2, ri: 4, status: 'open', source: 'added', starterId: '', createdAt: 'x', updatedAt: 'x', updatedBy: 'x' });
  R('r_two', 'Fewer than two adults with the group', [{ kind: 'twoAdults', text: '' }]);
  R('r_plain', 'Slips on the hall floor', [{ kind: 'text', text: 'Mop spills at once' }]);
  await b.commit();
}

const errors = [], browsers = [];
async function as(who, w = 1280, h = 900) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => { errors.push(who + ' was shown: ' + d.message()); d.accept(); });
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(400);
  return p;
}
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (p, sel) => p.$eval(sel, e => e.click());
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const warnings = async () => (await db.collection('sgWarnings').doc('site_t').get()).data();
const shot = (p, name) => p.screenshot({ path: path.join(HERE, name), fullPage: true });

try {
  /* 1. the server */
  await runSgWarnings({ db, siteIds: ['site_t'] });
  const w = await warnings(), ids = (w && w.items || []).map(i => i.id);
  ok('1. THE SERVER: two adults this morning (3 children, 1 leader in)', ids.includes('two_kg_juniors'), J(ids));
  ok('   the trip two days on: one leader named, and not signed off', ids.includes('two_ev_trip') && ids.includes('sign_ev_trip'), J(ids));
  ok('   a leader\u2019s check run out; a consent form missing', ids.includes('checks_out') && ids.includes('consent_kg_juniors'), J(ids));
  ok('   all red (each is today or within two days)', w.items.every(i => i.level === 'red'), J(w.items.map(i => i.id + ':' + i.level)));
  ok('   and the group\u2019s two-adults control marked red', w.controls['act_jun|twoAdults'] === 'red', J(w.controls));
  ok('3. COUNTS ONLY: no child\u2019s or leader\u2019s name in what the server wrote', !NAMES.test(J(w)), (J(w).match(NAMES) || [])[0]);

  /* 2. the lead */
  const L = await as('lena');
  await go(L, 'safeguarding-risk.html?tab=risks', '[data-tab="warnings"]');
  ok('2. THE LEAD: the tab says how many', /Warnings \(5\)/.test(await text(L, '[data-tab="warnings"]')), await text(L, '[data-tab="warnings"]'));
  await L.waitForSelector('[data-risk="r_two"]');
  ok('   the two-adults risk is marked "A control has slipped" (red)', !!(await L.$('[data-risk="r_two"] [data-slipped="red"]')) && /A control has slipped/.test(await text(L, '[data-risk="r_two"]')));
  ok('   the written-only risk is not', !(await L.$('[data-risk="r_plain"] [data-slipped]')));
  await tap(L, '[data-tab="warnings"]');
  await L.waitForSelector('[data-warn]');
  const cards = await L.$$eval('[data-warn]', a => a.map(c => ({ id: c.getAttribute('data-warn'), level: c.getAttribute('data-level'), t: c.innerText.replace(/\s+/g, ' '), fix: (c.querySelector('[data-fix]') || {}).href || '' })));
  ok('   five warnings, each "Act now", with what to do and "Go to it"', cards.length === 5 && cards.every(c => /Act now/.test(c.t) && /What to do: \w/.test(c.t) && c.fix), J(cards));
  const two = cards.find(c => c.id === 'two_kg_juniors') || {};
  ok('   in plain words: "Juniors (invented), today: 3 children in, 1 leader in. Two adults are needed at all times."', /Juniors \(invented\), today: 3 children in, 1 leader in\. Two adults are needed at all times\./.test(two.t), two.t);
  ok('   the trip\u2019s goes to its safeguarding page', /safeguarding\.html\?event=ev_trip$/.test((cards.find(c => c.id === 'sign_ev_trip') || {}).fix || ''), J(cards.map(c => c.fix)));
  ok('3. COUNTS ONLY on the page too', !cards.some(c => NAMES.test(c.t)), J(cards.map(c => c.t)));
  ok('   computer: no sideways scrolling', (await wide(L)) <= 0);
  await shot(L, 'sg-warnings-lead-desk.png');
  await L.setViewport({ width: 375, height: 800 });
  await sleep(300);
  ok('   375px: no sideways scrolling', (await wide(L)) <= 0, await wide(L));
  await shot(L, 'sg-warnings-lead-375.png');
  await L.setViewport({ width: 1280, height: 900 });

  /* 4. a trustee */
  const T = await as('tom');
  await go(T, 'safeguarding-risk.html', '[data-tab="warnings"]');
  await tap(T, '[data-tab="warnings"]');
  await T.waitForSelector('[data-warn]');
  const tt = await text(T, '#app');
  ok('4. A TRUSTEE reads the same five', (await T.$$('[data-warn]')).length === 5, tt);
  ok('   with no way into the pages that show names (no "Go to it")', !(await T.$('[data-fix]')));
  ok('   and no name', !(await T.$$eval('[data-warn]', a => a.map(c => c.innerText).join(' '))).match(NAMES));
  await shot(T, 'sg-warnings-trustee-desk.png');

  /* 5. a volunteer */
  const Vv = await as('vic');
  await go(Vv, 'safeguarding-risk.html', '#notYours');
  const vRead = await Vv.evaluate(() => EGBCAuth.db.collection('sgWarnings').doc('site_t').get().then(() => 'read', e => e.code));
  ok('5. A VOLUNTEER: the database refuses the warnings', /permission/.test(vRead), vRead);
  const vCall = await Vv.evaluate(() => EGBCAuth.call('sgWarningsNow', { siteId: 'site_t' }).then(() => 'ran', e => e.code || e.message));
  ok('   and the server refuses "Refresh now"', /permission/.test(vCall), vCall);

  /* 6. refresh now */
  await db.collection('kidsLeaderIns').doc('site_t_' + TODAY + '_m_lena').set({ siteId: 'site_t', day: TODAY, memberId: 'm_lena', name: 'Lena Lead (invented)', groupId: 'kg_juniors', state: 'in', inAt: 'x' });
  ok('6. a second leader checks in: the page still shows the old warning until refreshed', !!(await L.$('[data-warn="two_kg_juniors"]')));
  await tap(L, '#warnNow');
  const gone = await until(async () => !(await L.$('[data-warn="two_kg_juniors"]')) && (await L.$$('[data-warn]')).length === 4);
  ok('   "REFRESH NOW" (the server, through the functions emulator): the two-adults warning goes', !!gone, await text(L, '#app'));
  ok('   and the risk is no longer marked', !((await warnings()).controls['act_jun|twoAdults']), J((await warnings()).controls));

  /* 7. the email two days before */
  const sent = [];
  const fake = (msg, meta) => { sent.push({ ...msg, meta }); return Promise.resolve(); };
  const keys = await runTwoAdultsMail({ db, send: fake, hub: 'https://hub.example.invalid' });
  ok('7. THE EMAIL: the trip and the Sunday group two days on, both short of two adults', J(keys.sort()) === J(['ev_ev_trip_' + D2, 'kg_kg_juniors_' + D2].sort()), J(keys));
  ok('   to the lead and deputy only', sent.length === 2 && sent.every(m => J(m.to) === J([P.lena.email, P.dee.email])), J(sent.map(m => m.to)));
  ok('   saying what to do, with a link', sent.every(m => /Two adults are needed/.test(m.html) && /https:\/\/hub\.example\.invalid\//.test(m.html)), J(sent.map(m => m.html)));
  ok('   NO NAME of a child or a leader', !sent.some(m => NAMES.test(m.subject + m.html)), J(sent.map(m => m.subject + m.html)));
  const again = await runTwoAdultsMail({ db, send: fake, hub: 'https://hub.example.invalid' });
  ok('   ONCE: the next morning\u2019s run sends nothing more', again.length === 0 && sent.length === 2, J(again));

  /* 8. hirers who work with children (the office ticks it on the hirer's record) */
  await db.collection('hirers').doc('hr_kids').set({ siteId: 'site_t', name: 'Hilda Hirer (invented)', org: 'Toddler Music (invented)', email: 'hilda.hirer@example.invalid', withChildren: true, active: true,
    documents: [{ kind: 'safeguarding', name: 'policy.pdf', path: 'x', expires: Core.plus(TODAY, -3) }] });
  await db.collection('hirers').doc('hr_unbooked').set({ siteId: 'site_t', name: 'Una Hirer (invented)', email: 'una.hirer@example.invalid', withChildren: true, active: true, documents: [] });
  await db.collection('bookings').doc('bk_hilda_00000000000000000000000000').set({ kind: 'hire', status: 'confirmed', siteId: 'site_t', roomId: 'r_hall', day: Core.plus(TODAY, 10), startMin: 600, endMin: 660, title: 'Toddler music (invented)',
    requester: { name: 'Hilda Hirer (invented)', email: 'hilda.hirer@example.invalid', phone: '', org: 'Toddler Music (invented)' } });
  await runSgWarnings({ db, siteIds: ['site_t'] });
  const hw = ((await warnings()).items || []).find((i) => i.id === 'hirers');
  ok('8. A HIRER WHO WORKS WITH CHILDREN, booked in 10 days, whose policy ran out: amber, 1 (the unbooked one not counted)', hw && hw.level === 'amber' && hw.count === 1 && hw.kind === 'hirerDocs' && hw.fix === 'bookings-admin.html', J(hw));
  ok('   NO HIRER\u2019S NAME in it', !/Hilda|Una|Toddler/.test(J(await warnings())));
  await go(L, 'safeguarding-risk.html?tab=warnings', '[data-warn="hirers"]');
  ok('   the lead sees it, with "Go to it" to the bookings page', /1 hirer who works with children is booked in the next 30 days/.test(await text(L, '[data-warn="hirers"]')) && /bookings-admin\.html$/.test(await L.$eval('[data-warn="hirers"] [data-fix]', (e) => e.href).catch(() => '')));
  await db.collection('hirers').doc('hr_kids').update({ documents: [{ kind: 'safeguarding', name: 'policy.pdf', path: 'x', expires: Core.plus(TODAY, 300) }] });
  await runSgWarnings({ db, siteIds: ['site_t'] });
  ok('   a new policy on file: the warning goes', !((await warnings()).items || []).some((i) => i.id === 'hirers'));
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
