/* THE SAFEGUARDING RISK REGISTER, step 4: the dials, the annual review and
   the trustees' snapshots (F-265 part B and part 4). Events window.
   Invented people, groups, incidents and concerns only, events emulators
   only (with the hub's functions), network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/sg-dash.test.mjs"

   What it proves:
     1. THE SERVER works out six dials from what the hub holds, as counts:
        no child's, leader's or incident's words, and no concern
     2. THE LEAD opens on the Dashboard: the big "Ready for the annual review"
        dial, "Next, cheapest first", and five dials coloured by meaning
     3. a dial takes the lead to the page that fixes it (checks to
        Safeguarding; assessments to Tab B; sessions to the numbers on Tab C)
     4. A TRUSTEE sees the same dials and, where the names are, the counts:
        never sent to a page that would refuse them; no names anywhere
     5. THE ANNUAL REVIEW: the lead records their items, marks one "does
        not apply"; a trustee records theirs; the big dial follows
     6. THRESHOLDS are settings: lowered on Safeguarding settings, the
        checks dial turns from red to green; a renewed check turns it too
     7. SNAPSHOTS: a trustee takes one with the banner; the lead reads it
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sgd-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const { runSgWarnings, londonDay } = await import('../../functions/sg-warnings.js');
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

const TODAY = londonDay(new Date()), Y = +TODAY.slice(0, 4), D7 = Core.plus(TODAY, -7), D14 = Core.plus(TODAY, -14), D10 = Core.plus(TODAY, 10);
const P = {
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Kids Church'] },
  tom:  { email: 'tom.trustee@example.invalid', name: 'Tom Trustee (invented)', mid: 'm_tom', teams: ['Elders'] },
  vic:  { email: 'vic.volunteer@example.invalid', name: 'Vic Volunteer (invented)', mid: 'm_vic', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
/* what must never reach a dial, a count or a snapshot */
const SECRET = /Charlie|Casey|Cal Child|Vic Volunteer|m_vic|Invented fall|bumped his head|Worried about/;
const SETTINGS = { templates: {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, leadSiteId: 'site_t', leadName: 'Lena Lead (invented)', leadPhone: '', updatedAt: 'x', updatedBy: 'x' };
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
  S('bookingSettings', 'site_t', { bookingsAdmins: [], safeguardingLead: 'm_lena', safeguardingDeputy: '' });
  S('safeguardingSettings', 'defaults', SETTINGS);
  S('kidsGroups', 'kg_juniors', { siteId: 'site_t', name: 'Juniors (invented)', years: [3, 4], active: true, ratio: 8, leaderIds: ['m_vic', 'm_lena'], day: 7, order: 1 });
  /* checks: one in date, one run out -> 50% */
  S('leaderChecks', 'm_vic', { dbsStatus: 'seen', dbsSeen: '2020-01-01', trainingDate: '2020-01-01' });
  S('leaderChecks', 'm_lena', { dbsStatus: 'seen', dbsSeen: Core.plus(TODAY, -100), trainingDate: Core.plus(TODAY, -100) });
  /* two past sessions: a week ago with two leaders (met), a fortnight ago with one (short) */
  ['Charlie Child (invented)', 'Casey Child (invented)', 'Cal Child (invented)'].forEach((n, i) => {
    for (const d of [D7, D14]) S('checkins', 'ck_' + d + '_' + i, { calEventId: 'kids_kg_juniors_' + d, signupKey: 'kc_' + i, attendeeIndex: 0, name: n, kind: 'child', state: 'out', inAt: 'x', day: d, groupId: 'kg_juniors', siteId: 'site_t', familyId: 'f_' + i, pickupCode: '1234' });
  });
  for (const [d, mids] of [[D7, ['m_vic', 'm_lena']], [D14, ['m_vic']]]) for (const m of mids) S('kidsLeaderIns', 'site_t_' + d + '_' + m, { siteId: 'site_t', day: d, memberId: m, name: m, groupId: 'kg_juniors', state: 'out', inAt: 'x' });
  /* consent: three of four in date -> 75% */
  ['Charlie Child (invented)', 'Casey Child (invented)', 'Cal Child (invented)', 'Cy Child (invented)'].forEach((n, i) => S('kidsChildren', 'kc_' + i, { siteId: 'site_t', groupId: 'kg_juniors', name: n, status: 'registered', consentUntil: i === 0 ? '' : Core.plus(TODAY, 300) }));
  /* assessments: two trips, one signed -> 1 of 2 */
  for (const [id, signed] of [['ev_trip', false], ['ev_trip2', true]]) {
    S('calEvents', id, { title: 'Trip (invented) ' + id, status: 'confirmed', visibility: 'public', signupOn: true, capacity: 30, sgKind: 'trip',
      startLocal: D10 + 'T10:00', startUtc: Date.parse(D10 + 'T10:00:00Z'), endLocal: D10 + 'T16:00', endUtc: Date.parse(D10 + 'T16:00:00Z'), location: { kind: 'room', siteId: 'site_t', roomIds: [] } });
    S('eventLeaders', id, { under18: true, leaders: [{ memberId: 'm_lena', name: 'Lena Lead (invented)' }, { memberId: 'm_vic', name: 'Vic Volunteer (invented)' }], leaderIds: ['m_lena', 'm_vic'], leaderUids: [], siteId: 'site_t', clearedIds: [], lastCleared: [], updatedAt: 'x', updatedBy: 'x' });
    if (signed) S('sgAssessments', id, { siteId: 'site_t', calEventId: id, title: 'x', templateId: 'trip', answers: {}, risks: [], status: 'signed', version: 1, signedBy: 'x', signedByName: 'x', signedAt: 'x', signedVersion: 1, updatedAt: 'x', updatedBy: 'x' });
  }
  /* incidents: one with no follow-up after 20 days (open), one followed up; and a concern that must never be counted */
  S('incidents', 'inc_1', { calEventId: 'ev_trip2', siteId: 'site_t', happenedAt: Core.plus(TODAY, -20) + 'T10:00', people: 'Charlie Child (invented)', what: 'Invented fall: bumped his head', firstAid: true, firstAidBy: 'x', parentInformed: true, informedBy: 'x', informedAt: 'x', followUp: '', reportedBy: 'x', reportedByName: 'x', createdAt: Core.plus(TODAY, -20) + 'T11:00:00.000Z' });
  S('incidents', 'inc_2', { calEventId: 'ev_trip2', siteId: 'site_t', happenedAt: Core.plus(TODAY, -30) + 'T10:00', people: 'Casey Child (invented)', what: 'Invented fall', firstAid: false, firstAidBy: '', parentInformed: true, informedBy: 'x', informedAt: 'x', followUp: 'Spoke to the family (invented)', reportedBy: 'x', reportedByName: 'x', createdAt: Core.plus(TODAY, -30) + 'T11:00:00.000Z' });
  for (let i = 0; i < 5; i++) S('concerns', 'cn_' + i, { siteId: 'site_t', calEventId: '', about: 'Charlie Child (invented)', concern: 'Worried about Charlie (invented)', reportedBy: 'x', reportedByName: 'x', createdAt: Core.plus(TODAY, -15) + 'T10:00:00.000Z', status: 'new' });
  /* the register itself, for the snapshot */
  S('sgActivities', 'act_jun', { siteId: 'site_t', kind: 'sunday', name: 'Juniors (invented)', link: { type: 'kidsGroup', id: 'kg_juniors' }, active: true, updatedAt: 'x', updatedBy: 'x' });
  S('sgRisks', 'r_two', { siteId: 'site_t', activityId: 'act_jun', risk: 'Fewer than two adults with the group', who: 'Children', l: 3, i: 5, controls: [{ kind: 'twoAdults', text: '' }], ownerName: 'The Juniors leader', reviewDue: Core.plus(TODAY, 90), rl: 1, ri: 5, status: 'open', source: 'added', starterId: '', createdAt: 'x', updatedAt: 'x', updatedBy: 'x' });
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
const dash = async () => (await db.collection('sgDashboard').doc('site_t').get()).data();
const shot = (p, name) => p.screenshot({ path: path.join(HERE, name), fullPage: true });
const dialOf = (p, k) => p.$eval(`[data-dialkey="${k}"]`, e => ({ rag: e.getAttribute('data-rag'), t: e.innerText.replace(/\s+/g, ' '), red: e.querySelectorAll('rect[data-b="red"]').length,
  green: e.querySelectorAll('rect[data-b="green"]').length, slate: e.querySelectorAll('rect[data-b="progress"]').length, amber: e.querySelectorAll('rect[data-b="amber"]').length })).catch(() => ({}));

try {
  /* 1. the server */
  await runSgWarnings({ db, siteIds: ['site_t'] });
  let d = await dash(), dl = (d || {}).dials || {};
  ok('1. THE SERVER: checks 1 of 2 (50%, red)', dl.checks && dl.checks.value === 1 && dl.checks.of === 2 && dl.checks.rag === 'red', J(dl.checks));
  ok('   sessions: a week ago met, a fortnight ago short (1 of 2)', dl.sessions && dl.sessions.value === 1 && dl.sessions.of === 2, J(dl.sessions) + J(d && d.sessions));
  ok('   consent 3 of 4; assessments 1 of 2', dl.consent && dl.consent.value === 3 && dl.consent.of === 4 && dl.assess && dl.assess.value === 1 && dl.assess.of === 2, J([dl.consent, dl.assess]));
  ok('   incident follow-ups: 1 open (20 days), amber', dl.incidents && dl.incidents.value === 1 && dl.incidents.oldestDays === 20 && dl.incidents.rag === 'amber', J(dl.incidents));
  ok('   the review: 0 of 8, not started', dl.review && dl.review.value === 0 && dl.review.of === 8 && d.review.status === 'notstarted', J([dl.review, d && d.review && d.review.status]));
  ok('   COUNTS ONLY: no child\u2019s or leader\u2019s name, no incident\u2019s words, no concern in what the server wrote', d && !SECRET.test(J(d)), (J(d).match(SECRET) || [])[0]);
  ok('   CONCERNS ARE NOT COUNTED (five on file, no dial for them)', d && !/concern/i.test(J(Object.keys(dl))), J(Object.keys(dl)));

  /* 2. the lead's dashboard */
  const L = await as('lena');
  await go(L, 'safeguarding-risk.html', '#dash');
  ok('2. THE LEAD opens on the Dashboard', /tab on/.test(await L.$eval('[data-tab="dash"]', e => e.className)));
  ok('   "Ready for the annual review": 0%, "0 of 8 items", and the note', /Ready for the annual review/.test(await text(L, '#dash')) && /0 of 8 items/.test(await text(L, '[data-dialkey="review"]')) && /It is not a score for the church/.test(await text(L, '#dash')));
  const nexts = await L.$$eval('[data-next]', a => a.map(b => b.getAttribute('data-next')));
  ok('   "Next, cheapest first": the lead and deputy named, the register, the policy', J(nexts) === J(['leads', 'register', 'policy']), J(nexts));
  const ck = await dialOf(L, 'checks');
  ok('   checks: "50%", "1 of 2 leaders", red, with slate and red blocks', ck.rag === 'red' && /50\s?%/.test(ck.t) && /1 of 2 leaders/.test(ck.t) && ck.red > 0 && ck.slate > 0 && /1 has run out or is missing/.test(ck.t), J(ck));
  const inc = await dialOf(L, 'incidents');
  ok('   incident follow-ups: "1", "of 2 this year", amber, "the oldest is 20 days"', inc.rag === 'amber' && /\b1\b/.test(inc.t) && /of 2 this year/.test(inc.t) && /oldest is 20 days/.test(inc.t), J(inc));
  ok('   all five dials, and the legend', (await L.$$('.sgd-small')).length === 5 && /On file, towards complete/.test(await text(L, '.sgd-legend')));
  ok('   NO NAME, NO INCIDENT\u2019S WORDS, NO CONCERN on the dashboard', !SECRET.test(await text(L, '#app')), (await text(L, '#app')).match(SECRET));
  ok('   computer: no sideways scrolling', (await wide(L)) <= 0);
  await shot(L, 'sg-dash-lead-desk.png');
  await L.setViewport({ width: 375, height: 800 }); await sleep(300);
  ok('   375px: no sideways scrolling, two dials across', (await wide(L)) <= 0 && (await L.$$eval('.sgd-small', a => new Set(a.map(x => Math.round(x.getBoundingClientRect().top))).size)) === 3, await wide(L));
  await shot(L, 'sg-dash-lead-375.png');
  await L.setViewport({ width: 1280, height: 900 });

  /* 3. where the dials go, for the lead */
  await tap(L, '[data-dialkey="assess"]');
  ok('3. THE LEAD: the assessments dial opens Tab B', !!(await until(() => L.$('#evList [data-sgev], #noEvents'))) && /tab on/.test(await L.$eval('[data-tab="events"]', e => e.className)));
  await tap(L, '[data-tab="dash"]'); await L.waitForSelector('[data-dialkey="sessions"]');
  await tap(L, '[data-dialkey="sessions"]');
  await L.waitForSelector('#sessList');
  const rows = await L.$$eval('#sessList [data-sess]', a => a.map(r => r.getAttribute('data-sess') + ':' + r.innerText.replace(/\s+/g, ' ')));
  ok('   the sessions dial opens the numbers on Warnings: two sessions, one short', rows.length === 2 && rows.filter(r => /^short/.test(r)).length === 1 && rows.some(r => /Juniors \(invented\)/.test(r)), J(rows));
  ok('   numbers only there too', !SECRET.test(await text(L, '#sessList')));
  await tap(L, '[data-tab="dash"]'); await L.waitForSelector('[data-dialkey="checks"]');
  await Promise.all([L.waitForNavigation({ waitUntil: 'networkidle2' }), tap(L, '[data-dialkey="checks"]')]);
  ok('   the checks dial takes the lead to Safeguarding, which has the names', /safeguarding\.html$/.test(L.url()), L.url());

  /* 4. a trustee */
  const T = await as('tom');
  await go(T, 'safeguarding-risk.html', '#dash');
  const tck = await dialOf(T, 'checks');
  ok('4. A TRUSTEE sees the same dials', tck.rag === 'red' && /1 of 2 leaders/.test(tck.t), J(tck));
  for (const k of ['checks', 'consent', 'incidents']) {
    const at = T.url();
    await tap(T, `[data-dialkey="${k}"]`);
    const sheet = await until(() => T.$(`[data-counts="${k}"]`));
    const t = await text(T, '#sheet');
    ok(`   the ${k} dial: the counts, "the safeguarding lead can see who", and no page that would refuse them`, !!sheet && T.url() === at && /The safeguarding lead can see who/.test(t) && !SECRET.test(t), t);
    if (k === 'consent') ok('   consent per group: Juniors 3 in date, 1 missing', /Juniors \(invented\) 3 0 1/.test(t), t);
    await tap(T, '#sheet [data-close]');
  }
  ok('   NO NAME, NO INCIDENT\u2019S WORDS, NO CONCERN anywhere on the trustee\u2019s page', !SECRET.test(await text(T)), (await text(T)).match(SECRET));
  await shot(T, 'sg-dash-trustee-desk.png');
  const Vv = await as('vic');
  await go(Vv, 'safeguarding-risk.html', '#notYours');
  const vr = await Vv.evaluate(() => EGBCAuth.db.collection('sgDashboard').doc('site_t').get().then(() => 'read', e => e.code));
  ok('   A VOLUNTEER: the page and the database refuse the dials', /permission/.test(vr), vr);

  /* 5. the annual review */
  await go(L, 'safeguarding-risk.html', '[data-next="leads"]');
  await tap(L, '[data-next="leads"]');
  await L.waitForSelector('#reviewItems');
  ok('5. THE ANNUAL REVIEW: "Next" opens it; the lead may record their items, not the trustees\u2019', !!(await L.$('[data-record="leads"]')) && !(await L.$('[data-record="adopted"]')) && /For a trustee to record/.test(await text(L, '[data-item="adopted"]')));
  await tap(L, '[data-record="leads"]');
  await L.waitForSelector('#rvGo');
  await L.$eval('#rvNote', e => { e.value = 'Confirmed at the leaders\u2019 meeting (invented)'; });
  await tap(L, '#rvGo');
  await until(async () => /Done/.test(await text(L, '[data-item="leads"]')));
  const rl = (await db.collection('sgReviews').doc(Y + '_leads').get()).data() || {};
  ok('   recorded once, with who and when', rl.by === P.lena.uid && rl.at && rl.at.toDate && rl.siteId === 'site_t' && /leaders/.test(rl.note), J(rl));
  ok('   it says "Under way", 1 of 8', /Under way/.test(await text(L, '#reviewHead')) && /1 of 8 items on file/.test(await text(L, '#reviewHead')), await text(L, '#reviewHead'));
  await tap(L, '[data-record="hirers"]');
  await L.waitForSelector('#rvNa');
  await L.$eval('#rvNa', e => { e.checked = true; });
  await tap(L, '#rvGo');
  await until(async () => /Does not apply/.test(await text(L, '[data-item="hirers"]')));
  ok('   an optional item marked "does not apply": 1 of 7', /1 of 7 items on file/.test(await text(L, '#reviewHead')), await text(L, '#reviewHead'));
  await go(T, 'safeguarding-risk.html?tab=review', '#reviewItems');
  ok('   A TRUSTEE records the trustees\u2019 items, not the lead\u2019s', !!(await T.$('[data-record="adopted"]')) && !(await T.$('[data-record="policy"]')));
  await tap(T, '[data-record="adopted"]'); await T.waitForSelector('#rvGo'); await tap(T, '#rvGo');
  await until(async () => /Done/.test(await text(T, '[data-item="adopted"]')));
  await go(L, 'safeguarding-risk.html', '#dash');
  const big = await dialOf(L, 'review');
  ok('   THE BIG DIAL FOLLOWS: 28%, "2 of 7 items" (the server, through the functions emulator)', /2 of 7 items/.test(big.t) && /28\s?%/.test(big.t) && big.slate > 0, J(big));
  ok('   and "Next" moves on, with "hirers does not apply" said in the beige note', !(await L.$('[data-next="leads"]')) && /Hirers’ safeguarding policies checked does not apply to this church/.test(await text(L, '.sgd-soft')), await text(L, '.sgd-next'));

  /* 6. thresholds and renewal */
  await go(L, 'safeguarding-settings.html', '#dg_checks');
  await L.$eval('#dg_checks', e => { e.value = '50'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await L.$eval('#da_checks', e => { e.value = '40'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await tap(L, '#save');
  const st = await until(async () => { const s = (await db.collection('safeguardingSettings').doc('defaults').get()).data(); return s && s.register && s.register.dials && s.register.dials.checks && s.register.dials.checks.g === 50 ? s : null; });
  ok('6. THRESHOLDS ARE SETTINGS: saved (green 50, amber 40), the rest kept', !!st && st.register.dials.checks.a === 40 && st.register.dials.incidents.a === 2 && st.register.dueSoonDays === 42 && st.leadSiteId === 'site_t', J(st && st.register));
  await runSgWarnings({ db, siteIds: ['site_t'] });
  await go(L, 'safeguarding-risk.html', '#dash');
  ok('   then 50% is green', (await dialOf(L, 'checks')).rag === 'green', J(await dialOf(L, 'checks')));
  await db.collection('safeguardingSettings').doc('defaults').set(Object.assign({}, st, { register: {} }));
  await runSgWarnings({ db, siteIds: ['site_t'] });
  ok('   back to the defaults: red again', ((await dash()).dials.checks || {}).rag === 'red');
  await db.collection('leaderChecks').doc('m_vic').set({ dbsStatus: 'seen', dbsSeen: Core.plus(TODAY, -10), trainingDate: Core.plus(TODAY, -10) });
  await runSgWarnings({ db, siteIds: ['site_t'] });
  await go(L, 'safeguarding-risk.html', '#dash');
  const ck2 = await dialOf(L, 'checks');
  ok('   A RENEWED CHECK: 100%, green, all green blocks', ck2.rag === 'green' && /100\s?%/.test(ck2.t) && ck2.green === 14, J(ck2));

  /* 7. snapshots */
  await go(T, 'safeguarding-risk.html?tab=snaps', '#snapGo');
  await tap(T, '#snapGo');
  await T.waitForSelector('#snGo');
  ok('7. SNAPSHOTS: the trustee sees the banner first', /^Safeguarding risk register: Test Green, /.test(await text(T, '#snapBanner')), await text(T, '#snapBanner'));
  await T.$eval('#snNote', e => { e.value = 'For the trustees\u2019 meeting (invented)'; });
  await tap(T, '#snGo');
  await until(() => T.$('[data-snap]'));
  const sn = (await db.collection('sgSnapshots').get()).docs.map(x => x.data())[0] || {};
  ok('   taken: the risks with their ratings, the dials, the warnings, the review', sn.by === P.tom.uid && sn.risks.length === 1 && sn.risks[0].before === 'red' && sn.risks[0].after === 'amber' && sn.dials.checks.rag === 'green' && sn.review.of === 7 && typeof sn.warnings.red === 'number', J(sn));
  ok('   COUNTS ONLY in the snapshot too', !SECRET.test(J(sn)), (J(sn).match(SECRET) || [])[0]);
  await go(L, 'safeguarding-risk.html?tab=snaps', '[data-snap]');
  ok('   THE LEAD reads it, but takes none', !(await L.$('#snapGo')) && /Taken .* by Tom Trustee \(invented\)/.test(await text(L, '[data-snap]')));
  await tap(L, '[data-opensnap]');
  await L.waitForSelector('#snapView');
  ok('   opened: the banner, the dials, the risk', /Safeguarding risk register: Test Green/.test(await text(L, '#snapView')) && /Leaders with in-date checks 100%/.test(await text(L, '#snapView')) && /Fewer than two adults/.test(await text(L, '#snapView')), await text(L, '#snapView'));
  await shot(L, 'sg-dash-snapshot-desk.png');

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
