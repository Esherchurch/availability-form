/* BUILDING COMPLIANCE, STAGE 4: the live risk register, PEEPs and GEEPs (F-234).
   Events window. Invented people and buildings only, events emulators only,
   network guard; no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/compliance-stage4.test.mjs"

   Martin's proofs, each able to fail:
     1. A WARDEN SEES A PEEP ONLY FOR SOMEONE IN TODAY (checked in, or on the
        rota) - not for someone who is not here
     2. A STEWARD NOT ON DUTY DOESN'T (a steward on the rota today does)
     3. A PEEP NEVER APPEARS IN ANY EMAIL (every mail the hub's compliance
        run makes, and no other server file reads the plans)
   And:
     4. the person makes their plan only with their agreement, changes it,
        deletes it; a look at it on the roll-call is logged
     5. LABELLED A MANAGEMENT TOOL THAT SUPPLEMENTS THE PROFESSIONAL RISK
        ASSESSMENTS: Martin's banner, word for word, on every screen of the
        register, on a snapshot and on the trustee report; never "Risk
        assessment" on its own
     6. hazards: the controls ARE the checks (an overdue check turns its
        hazard red; a safety job on it is an open issue); a professional
        report's next review becomes the review check's due date; changes
        since the assessment; a trustee's dated snapshot
     7. the building's GEEP on the roll-call
     8. RULE ZERO: with the add-on off there are no plans on the roll-call */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { loadEngine, loadStore, loadTemplates } from './compliance-engine.mjs';
import { seedTemplates, FIXTURES } from '../../tools/seed-compliance.mjs';
import { runCompliance } from '../../functions/compliance.js';
import { runPeepToday } from '../../functions/peeps.js';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-cmp4-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const E = loadEngine(), S = loadStore(), T = loadTemplates();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
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

/* ---------- the synthetic church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  olive:  { name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Church office'] },
  eli:    { name: 'Eli Elder (invented)', mid: 'm_eli', teams: ['Elders'] },
  wendy:  { name: 'Wendy Warden (invented)', mid: 'm_wendy', teams: ['Welcome'] },
  hal:    { name: 'Hal Hall-warden (invented)', mid: 'm_hal', teams: ['Welcome'] },
  stan:   { name: 'Stan Steward (invented)', mid: 'm_stan', teams: ['Welcome'] },
  sue:    { name: 'Sue Steward (invented)', mid: 'm_sue', teams: ['Welcome'] },
  pat:    { name: 'Pat Person (invented)', mid: 'm_pat', teams: [] },
  rob:    { name: 'Rob Rota (invented)', mid: 'm_rob', teams: ['Welcome'] },
  quinn:  { name: 'Quinn Away (invented)', mid: 'm_quinn', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.cmp4@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
for (const name of ['Core Team', 'Church office', 'Elders', 'Welcome']) await db.collection('teams').doc(name).set({ name, label: name, rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await seedTemplates(db, T, true);
/* The locked rules are on (switch-over), so private records may be saved (F-235). */
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });

for (const s of FIXTURES.sites) {
  await db.collection('sites').doc(s.id).set({ name: s.name, active: true, order: FIXTURES.sites.indexOf(s) + 1 });
  for (const [id, name, kind] of s.rooms) {
    await db.collection('rooms').doc(id).set({ name, siteId: s.id, active: true, kind: 'room', order: 1 });
    await db.collection('roomProfiles').doc(id).set({ siteId: s.id, kind, updatedAt: 'x' });
  }
  await S.applyProfile(db, E, s.id, s.profile, T.TEMPLATES, { uid: 'seed', name: 'Setup' });
}
const TODAY = (() => { const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/* The roll-call list: Wendy a fire warden; Stan and Sue duty stewards. */
/* Hal is a fire warden for the hall only (Martin, 19 Oct: their building only). */
await db.collection('fireRollCall').doc('main').set({ people: [{ memberId: 'm_hal', name: P.hal.name, siteId: 'cmp_hall', role: 'warden' }, { memberId: 'm_wendy', name: P.wendy.name, siteId: '', role: 'warden' }, { memberId: 'm_stan', name: P.stan.name, siteId: '', role: 'steward' }, { memberId: 'm_sue', name: P.sue.name, siteId: '', role: 'steward' }],
  memberIds: ['m_hal', 'm_wendy', 'm_stan', 'm_sue'], allSites: ['m_wendy', 'm_stan', 'm_sue'], bySite: { cmp_hall: ['m_hal'] }, stewards: ['m_stan', 'm_sue'], updatedBy: 'seed', updatedByName: 'x', updatedAt: 'x' });
/* Today: Pat checked in at an event in the church; Rob and Sue on the rota; Quinn not here. */
await db.collection('calEvents').doc('ce_today').set({ title: 'Coffee morning (invented)', startLocal: TODAY + 'T10:00', location: { siteId: 'cmp_church' } });
await db.collection('signups').doc('su_pat_00000000000000000000000000').set({ calEventId: 'ce_today', personKind: 'addressBook', personId: 'm_pat', name: P.pat.name, status: 'confirmed', places: 1, memberUid: P.pat.uid });
await db.collection('checkins').doc('ck_pat').set({ calEventId: 'ce_today', signupKey: 'su_pat_00000000000000000000000000', attendeeIndex: 0, name: P.pat.name, kind: 'booked', state: 'in', inAt: new Date().toISOString(), inBy: 'seed', inByName: 'x', roomId: '', day: TODAY, buildingId: 'cmp_church', updatedAt: 'x' });
await db.collection('events').doc('svc_today').set({ date: TODAY, startTime: '10:30', type: 'Morning service', assignments: { 'Welcome': { id: 'm_rob', name: P.rob.name }, 'Duty steward': [{ id: 'm_sue', name: P.sue.name }] } });
const NEEDS = { pat: 'Cannot use stairs; needs the lift side exit (invented)', rob: 'Walks slowly with a stick (invented)', quinn: 'Uses a wheelchair (invented)' };
for (const k of ['rob', 'quinn']) await db.collection('peeps').doc(P[k].mid).set({ memberId: P[k].mid, name: P[k].name, agreed: true, agreedAt: 'x', needs: NEEDS[k], helpers: '', route: '', equipment: '', reviewDue: addDays(TODAY, 300), madeBy: 'self', updatedBy: P[k].uid, updatedAt: 'x' });
await db.collection('peepToday').doc(addDays(TODAY, -1)).set({ day: addDays(TODAY, -1), readers: ['m_wendy'], entries: [], at: 'x' });

const outbox = [];
const send = async (msg, meta) => { outbox.push({ to: msg.to, subject: msg.subject, html: msg.html, kind: meta && meta.kind }); return { ok: true }; };
const errors = [], browsers = [];
async function as(whoK) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, whoK + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, whoK);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push(whoK + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[whoK].email);
  await sleep(500);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const setVal = (pg, sel, v) => pg.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
/* Martin's words, exactly as he gave them (19 Oct) - held here, not taken
   from the templates, so a change to the wording there is caught. */
const BANNER = 'Live risk management: how Test Green Church manages, day to day, the risks identified in its professional Health, Safety and Fire risk assessments. ' +
  'It records the checks, issues, actions and reviews that show those risks are being controlled. It supplements those assessments; it does not replace them. ' +
  "Your trustees remain responsible for your building's safety.";
const shot = (pg, name) => pg.screenshot({ path: path.join(HERE, name) });

try {
  /* ---------- 8. Rule Zero ---------- */
  const off = await runPeepToday({ db, today: TODAY });
  ok('8. ADD-ON OFF: no plans for the roll-call at all, and yesterday\u2019s is gone', off.off === true && !(await db.collection('peepToday').doc(TODAY).get()).exists && !(await db.collection('peepToday').doc(addDays(TODAY, -1)).get()).exists);
  await db.collection('churchSettings').doc('features').set({ buildingCompliance: true }, { merge: true });

  /* ---------- 4. Pat makes a plan ---------- */
  const pat = await as('pat');
  await pat.goto(URLB + 'peep.html', { waitUntil: 'networkidle2' });
  await until(() => pat.$('#save'));
  await setVal(pat, '#needs', NEEDS.pat);
  await tap(pat, '#save');
  ok('4. PAT\u2019S PLAN: not saved without her agreement', /Tick to agree/.test(await text(pat, '#msg')) && !(await db.collection('peeps').doc('m_pat').get()).exists);
  await pat.$eval('#agree', e => { e.checked = true; });
  await setVal(pat, '#helpers', 'A steward (invented)');
  await tap(pat, '#save');
  const pp = await until(async () => (await db.collection('peeps').doc('m_pat').get()).data());
  ok('   with it, saved: what help, who helps, reviewed in a year; no medical field', pp && pp.agreed === true && pp.needs === NEEDS.pat && pp.reviewDue === addDays(TODAY, 365).slice(0, 4) + TODAY.slice(4) && !('medical' in pp), J(pp));
  ok('   the page asks for no medical details', /Please do not put medical details here/.test(await text(pat)));
  await pat.screenshot({ path: path.join(HERE, 'peep-mine-375.png') });

  /* Martin enters a plan for Quinn, who asked: it says so (Martin, 19 Oct). */
  const mar = await as('martin');
  await mar.goto(URLB + 'peep.html', { waitUntil: 'networkidle2' });
  await until(() => mar.$('#forWho'));
  await setVal(mar, '#forWho', 'm_quinn');
  await until(async () => /What help would Quinn Away/.test(await text(mar)));
  await setVal(mar, '#needs', 'Uses a wheelchair; needs the ramp (invented)');
  await mar.$eval('#agree', e => { e.checked = true; });
  await tap(mar, '#save');
  const qp = await until(async () => { const d = (await db.collection('peeps').doc('m_quinn').get()).data(); return d && d.enteredByName ? d : null; });
  ok('   A MASTER ADMIN ENTERS A PLAN FOR SOMEONE: recorded "entered by Martin Master with their agreement"', qp && qp.enteredBy === P.martin.uid && qp.enteredByName === 'Martin Master' && qp.madeBy === 'master', J(qp));
  ok('   and shown on the plan', /Entered by Martin Master with their agreement/.test(await text(mar, '#enteredBy')));
  await mar.browser().close();
  const quinn = await as('quinn');
  await quinn.goto(URLB + 'peep.html', { waitUntil: 'networkidle2' }); await until(() => quinn.$('#enteredBy'));
  ok('   Quinn sees it on her own plan: "Entered by Martin Master with your agreement"', /Entered by Martin Master with your agreement/.test(await text(quinn, '#enteredBy')));
  await quinn.browser().close();

  /* ---------- 1, 2. who sees which plans ---------- */
  const r = await runPeepToday({ db, today: TODAY });
  const ch = (x) => (x.docs || {}).cmp_church || { entries: [], readers: [] };
  const names = ch(r).entries.map(e => e.memberId).sort();
  ok('1. TODAY\u2019S PLANS: Pat (checked in) and Rob (on the rota) - NOT QUINN, who is not here', J(names) === J(['m_pat', 'm_rob']), J(names));
  ok('   each says why: "Checked in" (with the building) or "On the rota"', ch(r).entries.find(e => e.memberId === 'm_pat').why === 'Checked in' && /St Example/.test(ch(r).entries.find(e => e.memberId === 'm_pat').building) && ch(r).entries.find(e => e.memberId === 'm_rob').why === 'On the rota');
  ok('2. WHO MAY READ THEM: the warden, and Sue (a steward ON THE ROTA today) - NOT STAN (a steward not on duty)', J([...ch(r).readers].sort()) === J(['m_sue', 'm_wendy']), J(ch(r).readers));
  ok('   THEIR BUILDING ONLY: Hal (a warden for the hall) is not a reader of the church’s plans', !ch(r).readers.includes('m_hal') && !Object.keys(r.docs).includes('cmp_hall'), J(Object.keys(r.docs)));
  const wendy = await as('wendy');
  await wendy.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(() => wendy.$('#peeps'));
  const wt = await text(wendy, '#peeps');
  ok('   WENDY (a warden) SEES THE PLANS on the roll-call: Pat and Rob, not Quinn', /Pat Person/.test(wt) && /Rob Rota/.test(wt) && !/Quinn/.test(wt), wt);
  await wendy.$eval('[data-peep="m_pat"] summary', e => e.click());
  await until(async () => (await db.collection('peepLog').where('what', '==', 'view').get()).size > 0);
  const lg = (await db.collection('peepLog').where('what', '==', 'view').get()).docs.map(d => d.data());
  ok('   opening Pat\u2019s plan shows it, and THE LOOK IS LOGGED (who, whose)', /Cannot use stairs/.test(await text(wendy, '[data-peep="m_pat"]')) && lg.some(l => l.memberId === 'm_pat' && l.by === P.wendy.uid), J(lg));
  await wendy.screenshot({ path: path.join(HERE, 'peep-rollcall-375.png') });
  const wRaw = await wendy.evaluate(() => EGBCAuth.db.collection('peeps').doc('m_quinn').get().then(() => 'read', e => e.code));
  ok('   the rules refuse her Quinn\u2019s plan (she never reads the plans themselves)', wRaw === 'permission-denied', wRaw);
  const stan = await as('stan');
  await stan.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /Fire roll-call/.test(await text(stan)));
  await sleep(1500);
  ok('   STAN (a steward not on duty) opens the roll-call but SEES NO PLANS', /Fire roll-call/.test(await text(stan)) && !(await stan.$('#peeps')) && !/Cannot use stairs/.test(await text(stan)));
  const sRaw = await stan.evaluate((d) => EGBCAuth.db.collection('peepToday').doc(d + '__cmp_church').get().then(() => 'read', e => e.code), TODAY);
  ok('   and the rules refuse him today\u2019s plans', sRaw === 'permission-denied', sRaw);
  const sue = await as('sue');
  await sue.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(() => sue.$('#peeps'));
  ok('   SUE (a steward on the rota today) sees them', /Pat Person/.test(await text(sue, '#peeps')));
  const hal = await as('hal');
  await hal.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  await until(async () => /Fire roll-call/.test(await text(hal)));
  await sleep(1500);
  ok('   HAL (a warden for the hall) sees no plans for the church', !(await hal.$('#peeps')) && !/Cannot use stairs/.test(await text(hal)));
  const hRaw = await hal.evaluate((d) => EGBCAuth.db.collection('peepToday').doc(d + '__cmp_church').get().then(() => 'read', e => e.code), TODAY);
  ok('   and the rules refuse him the church’s list', hRaw === 'permission-denied', hRaw);
  await hal.browser().close();
  /* Done with Stan and Sue: their browsers closed now, not at the end (memory). */
  await stan.browser().close(); await sue.browser().close();
  /* Pat goes home: checked out, and her plan is gone from today's. */
  await db.collection('checkins').doc('ck_pat').update({ state: 'out' });
  const r2 = await runPeepToday({ db, today: TODAY });
  ok('   PAT CHECKS OUT: her plan leaves today\u2019s list', !ch(r2).entries.some(e => e.memberId === 'm_pat') && ch(r2).entries.some(e => e.memberId === 'm_rob'));
  await db.collection('checkins').doc('ck_pat').update({ state: 'in' });
  await runPeepToday({ db, today: TODAY });

  /* ---------- 3. never in an email ---------- */
  /* Wendy (a warden, who reads plans) is given the walk-rounds, one overdue: she gets a reminder. */
  for (const id of ['cmp_church', 'cmp_hall']) {
    await db.collection('buildingChecks').doc(id + '__walk-round').update({ responsibleIds: ['m_wendy'] });
    const w = (await db.collection('buildingChecks').doc(id + '__walk-round').get()).data(); w.id = id + '__walk-round';
    await S.recordDone(db, w, { doneOn: addDays(TODAY, -45) }, { uid: 'seed', name: 'x' });
  }
  await runCompliance({ db, send, today: TODAY });
  await runCompliance({ db, send, today: addDays(TODAY, 40).slice(0, 8) + '01' });
  const mails = outbox.map(o => o.subject + ' ' + o.html).concat((await db.collection('emailOutbox').get()).docs.map(d => J(d.data())));
  /* A plan's own words: what help, who helps. (A check called "Review
     personal evacuation plans" is a check's name, not anyone's plan.) */
  const planWords = Object.values(NEEDS).map(n => n.split(';')[0].replace(' (invented)', '')).concat(['A steward (invented)']);
  const leak = mails.filter(m => planWords.some(w => m.includes(w)));
  ok('3. A PEEP NEVER APPEARS IN ANY EMAIL: ' + mails.length + ' compliance emails made (a reminder to Wendy, who reads plans, and the summary), none with a plan in it',
    mails.length >= 2 && outbox.some(o => o.to.includes(P.wendy.email)) && leak.length === 0, leak.join(' | ').slice(0, 300));
  const readers = fs.readdirSync(path.join(V2, 'functions')).filter(f => /\.(m?js|cjs)$/.test(f) && f !== 'peeps.js' && f !== 'index.js').filter(f => /['"`](peeps|peepToday)['"`]/.test(fs.readFileSync(path.join(V2, 'functions', f), 'utf8')));
  ok('   and no server file but peeps.js reads the plans (none can mail them)', readers.length === 0, readers.join(', '));
  ok('   peeps.js itself sends nothing', !/makeSender|sendEmail|send\(/.test(fs.readFileSync(path.join(V2, 'functions', 'peeps.js'), 'utf8')));

  /* ---------- 5, 6. the live risk register ---------- */
  const olive = await as('olive');
  await olive.goto(URLB + 'risk.html?site=cmp_church', { waitUntil: 'networkidle2' });
  await until(() => olive.$('#riskBanner'));
  ok('5. THE LIVE RISK REGISTER carries Martin\u2019s banner, word for word', (await olive.$eval('#riskBanner', e => e.textContent)) === BANNER, await olive.$eval('#riskBanner', e => e.textContent));
  ok('   it is called the "Live risk register", never "Risk assessment" on its own', /^Live risk register\b/.test(await olive.title()) && (await text(olive, 'h1')) === 'Live risk register' && !(await olive.$$eval('h1,h2,h3,title,button', es => es.some(e => /^\s*risk assessments?\s*$/i.test(e.textContent)))), J([await olive.title(), await text(olive, 'h1')]));
  await tap(olive, '#addStarter');
  await until(async () => (await db.collection('hazards').where('siteId', '==', 'cmp_church').get()).size >= 10);
  const fireHz = (await db.collection('hazards').doc('cmp_church__fire').get()).data();
  ok('6. THE STARTER HAZARDS: each one\u2019s CONTROLS ARE THE BUILDING\u2019S CHECKS', fireHz && fireHz.controls.includes('cmp_church__fire-alarm-test') && fireHz.controls.includes('cmp_church__escape-routes') && fireHz.controls.every(c => c.startsWith('cmp_church__')), J(fireHz && fireHz.controls));
  ok('   and nothing for checks this building does not have (no gas safety here: not a let house)', !(await db.collection('hazards').doc('cmp_church__gas').get()).data().controls.includes('cmp_church__gas-safety'));
  /* Make the fire alarm test overdue, and raise a safety job on it. */
  const fa = (await db.collection('buildingChecks').doc('cmp_church__fire-alarm-test').get()).data(); fa.id = 'cmp_church__fire-alarm-test';
  await S.recordDone(db, fa, { doneOn: addDays(TODAY, -30) }, { uid: 'seed', name: 'x' });
  await db.collection('maintJobs').doc('mj_sounder').set({ siteId: 'cmp_church', roomId: '', where: 'Nave', what: 'Sounder in the nave is quiet (invented)', details: '', photoPath: '', status: 'todo', checkId: 'cmp_church__fire-alarm-test', safety: true, due: addDays(TODAY, 7), ownerId: '', reportedBy: 'seed', reportedByName: 'x', reportedAt: new Date() });
  await olive.reload({ waitUntil: 'networkidle2' }); await until(() => olive.$('[data-hz="cmp_church__fire"]'));
  ok('   AN OVERDUE CHECK TURNS ITS HAZARD RED (the fire alarm test, overdue)', (await olive.$eval('[data-hz="cmp_church__fire"]', e => e.getAttribute('data-rag'))) === 'red');
  await tap(olive, '[data-hz="cmp_church__fire"]'); await until(() => olive.$('.sheet'));
  const hs = await text(olive, '.sheet');
  ok('   the hazard shows its controls and the safety job on one as an OPEN ISSUE', /Controls \(the checks\)/.test(hs) && /Test the fire alarm/.test(hs) && /Open: Sounder in the nave is quiet/.test(hs), hs.slice(0, 400));
  await shot(olive, 'risk-hazard-375.png');
  await olive.$eval('.sheet .x', e => e.click());
  /* A professional fire risk assessment report: its next review IS the review check. */
  await olive.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'reports').click());
  await until(() => olive.$('#rGo'));
  ok('   the professional reports tab carries the banner too', (await olive.$eval('#riskBanner', e => e.textContent)) === BANNER);
  await setVal(olive, '#rKind', 'fire'); await setVal(olive, '#rDate', addDays(TODAY, -10)); await setVal(olive, '#rNext', addDays(TODAY, 355)); await setVal(olive, '#rWho', 'A. Assessor Ltd (invented)');
  await tap(olive, '#rGo');
  const ra = await until(async () => (await db.collection('raReports').get()).docs.map(d => d.data())[0]);
  const fraRec = await until(async () => (await db.collection('checkRecords').where('checkId', '==', 'cmp_church__fire-ra').get()).docs.map(d => d.data())[0]);
  ok('   A PROFESSIONAL REPORT: date, assessor, next review - and THE REVIEW CHECK is recorded, due on the next review', ra && ra.assessor === 'A. Assessor Ltd (invented)' && fraRec && fraRec.doneOn === addDays(TODAY, -10) && fraRec.certExpiry === addDays(TODAY, 355), J(fraRec));
  /* A change since: a new hazard. */
  await db.collection('hazards').doc('hz_new').set({ siteId: 'cmp_church', area: 'Building', hazard: 'New stage in the nave (invented)', who: 'Musicians', l: 2, s: 3, controls: [], notes: '', status: 'open', source: 'added', starterId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: P.olive.uid });
  await olive.reload({ waitUntil: 'networkidle2' }); await until(() => olive.$('[data-v="changes"]'));
  await olive.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'changes').click());
  await until(() => olive.$('#changes'));
  ok('   CHANGES SINCE THE PROFESSIONAL ASSESSMENT: the new hazard is listed', /Hazard added: New stage in the nave/.test(await text(olive, '#changes')), await text(olive, '#changes'));
  /* A trustee's dated snapshot. */
  const eli = await as('eli');
  await eli.goto(URLB + 'risk.html?site=cmp_church', { waitUntil: 'networkidle2' });
  await until(() => eli.$('[data-v="snapshots"]'));
  await eli.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'snapshots').click());
  await until(() => eli.$('#snGo')); await tap(eli, '#snGo');
  const snap = await until(async () => (await db.collection('riskSnapshots').get()).docs.map(d => d.data())[0]);
  ok('   A TRUSTEE SIGNS OFF: a dated snapshot, in their name, with the banner word for word', snap && snap.by === P.eli.uid && snap.banner === BANNER && snap.hazards.some(h => /fire starts/.test(h.hazard) && h.rag === 'red') && snap.at, J(snap && { by: snap.by, banner: snap.banner === BANNER }));
  await until(() => eli.$('[data-snap="0"]')); await tap(eli, '[data-snap="0"]'); await until(() => eli.$('#snapView'));
  ok('   THE SNAPSHOT carries the banner', (await text(eli, '#snapView')).includes(BANNER));
  ok('   the office cannot sign off (no button)', await (async () => { await olive.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'snapshots').click()); return !(await olive.$('#snGo')); })());
  await eli.goto(URLB + 'compliance.html', { waitUntil: 'networkidle2' }); await until(() => eli.$('#toReport'));
  await tap(eli, '#toReport'); await until(() => eli.$('#repTable'));
  ok('   THE TRUSTEE REPORT carries the banner too', (await eli.$eval('#reportBanner', e => e.textContent).catch(() => '')) === BANNER);
  await eli.browser().close();   /* done with Eli: one browser fewer (memory) */

  /* ---------- 7. the GEEP ---------- */
  await olive.$$eval('[data-v]', bs => bs.find(b => b.getAttribute('data-v') === 'geep').click());
  await until(() => olive.$('#gGo'));
  await setVal(olive, '#g_identify', 'Ask at the welcome desk; hirers tell us (invented)');
  await setVal(olive, '#g_refuges', 'The refuge on the stairs landing (invented)');
  await tap(olive, '#gGo');
  await until(async () => (await db.collection('geeps').doc('cmp_church').get()).exists);
  await wendy.reload({ waitUntil: 'networkidle2' });
  await until(() => wendy.$('[data-geep="cmp_church"]'));
  ok('7. THE GEEP (visitors who need help) is on the roll-call', /Ask at the welcome desk/.test(await text(wendy, '[data-geep="cmp_church"]')));

  /* ---------- 4 again: change, then delete ---------- */
  await pat.reload({ waitUntil: 'networkidle2' }); await until(() => pat.$('#del'));
  await tap(pat, '#del');
  await until(async () => !(await db.collection('peeps').doc('m_pat').get()).exists);
  ok('4. PAT DELETES HER PLAN when it is no longer needed; made and deleted are logged', !(await db.collection('peeps').doc('m_pat').get()).exists &&
    (await db.collection('peepLog').where('memberId', '==', 'm_pat').get()).docs.map(d => d.data().what).filter(w => w === 'made' || w === 'deleted').length === 2);
  const r3 = await runPeepToday({ db, today: TODAY });
  ok('   and it is gone from today\u2019s', !ch(r3).entries.some(e => e.memberId === 'm_pat'));
  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
