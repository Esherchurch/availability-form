/* THE SAFEGUARDING RISK REGISTER, step 1: standing risks (F-265). Events
   window. Invented people, groups and risks only, events emulators only,
   network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/sg-register.test.mjs"

   What it proves:
     1. the site's safeguarding lead adds an activity from the hub's own
        groups, and another by kind
     2. adds the starter risks, adapts one (ratings, a written control, an
        owner, a review date), and closes one (kept, not deleted)
     3. the rating reads in words and colour (High 20, before and after);
        an overdue review says so
     4. a trustee reads it, read-only; a master admin reads it, read-only
     5. an activity's own leader (a volunteer) is told it is not for them
     6. the trustee team is a setting on Safeguarding settings
     7. the way in from Safeguarding and the Live risk register
     8. 375px and computer, no sideways scrolling, pictures */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sgr-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
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

const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Kids Church'] },
  tom:  { email: 'tom.trustee@example.invalid', name: 'Tom Trustee (invented)', mid: 'm_tom', teams: ['Elders'] },
  vic:  { email: 'vic.volunteer@example.invalid', name: 'Vic Volunteer (invented)', mid: 'm_vic', teams: ['Kids Church'] },
  max:  { email: 'max.master@example.invalid', name: 'Max Master (invented)', mid: 'm_max', teams: ['Core Team'], master: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  for (const name of ['Kids Church', 'Elders', 'Core Team', 'Trustees']) await setDoc(doc(db, 'teams', name), { name, label: name, rota: true, order: 1 });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: 'm_lena', safeguardingDeputy: '' });
  await setDoc(doc(db, 'kidsGroups', 'kg_juniors'), { siteId: 'site_t', name: 'Juniors (invented)', years: [3, 4], active: true, ratio: 8, leaderIds: ['m_vic'], order: 1 });
  await setDoc(doc(db, 'safeguardingSettings', 'defaults'), { templates: {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, leadSiteId: 'site_t', leadName: 'Lena Lead (invented)', leadPhone: '', updatedAt: 'x', updatedBy: 'x' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const risks = () => readDb(async (db) => (await getDocs(collection(db, 'sgRisks'))).docs.map(d => ({ id: d.id, ...d.data() })));

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

try {
  /* 1. the lead adds activities */
  const L = await as('lena');
  await go(L, 'safeguarding-risk.html?tab=risks', '#addAct');
  ok('1. THE LEAD: the hub\u2019s own Sunday group is offered as an activity', /Juniors \(invented\)/.test(await text(L, '#addAct')), await text(L, '#addAct'));
  await tap(L, '[data-sugg="0"]');
  await L.waitForSelector('[data-act]', { timeout: 15000 });
  const act = await readDb(async (db) => (await getDocs(collection(db, 'sgActivities'))).docs.map(d => d.data())[0]);
  ok('   added, linked to the group, as a Sunday children\u2019s group', act && act.kind === 'sunday' && act.link.type === 'kidsGroup' && act.link.id === 'kg_juniors' && act.siteId === 'site_t', J(act));
  ok('   and no longer offered', !/\+ Juniors/.test(await text(L, '#addAct')));
  await L.select('#newKind', 'transport');
  await L.$eval('#newName', e => { e.value = 'Lifts to the youth weekend (invented)'; });
  await tap(L, '#newGo');
  await until(async () => (await L.$$('[data-act]')).length === 2);
  ok('   and another, by kind', (await L.$$('[data-act]')).length === 2 && /Lifts to the youth weekend/.test(await text(L)));

  /* 2. starter risks, adapt one, close one */
  const actId = await L.$eval('[data-act]', e => e.getAttribute('data-act'));
  const juniorsId = (await readDb(async (db) => (await getDocs(collection(db, 'sgActivities'))).docs.find(d => d.data().kind === 'sunday').id));
  await tap(L, `[data-starter="${juniorsId}"]`);
  await L.waitForSelector('#sGo');
  const n = await L.$$eval('[data-st]', a => a.length);
  await tap(L, '#sGo');
  await until(async () => (await L.$$(`[data-act="${juniorsId}"] [data-risk]`)).length === n);
  const rs = await risks();
  ok('2. THE STARTER LIST: ' + n + ' risks added, in general words, marked as from the list', rs.length === n && rs.every(r => r.source === 'starter' && r.starterId && r.status === 'open'), J(rs.map(r => r.starterId)));
  await tap(L, `[data-starter="${juniorsId}"]`);
  await L.waitForSelector('#sGo');
  ok('   offered again, the ones already in are marked and can\u2019t be added twice', (await L.$$eval('[data-st]', a => a.every(c => c.disabled))) && /Already in the register/.test(await text(L, '#sheet')));
  await tap(L, '[data-close]');
  const target = rs.find(r => r.starterId === 'sun-ratio');
  await tap(L, `[data-edit="${target.id}"]`);
  await L.waitForSelector('#eSave');
  ok('   THE EDITOR SAYS: general words only, never a child, a family or a concern', /General words only: never name a child, a family or a concern/.test(await text(L, '#generalWords')));
  await L.select('#eL', '5'); await L.select('#eI', '4'); await L.select('#eRL', '3'); await L.select('#eRI', '4');
  await L.$eval('#eOwner', e => { e.value = 'The Juniors leader'; });
  await L.$eval('#eDue', e => { e.value = '2025-01-01'; });
  await L.$$eval('[data-ct]', (a) => { a[a.length - 1].value = 'A spare leader is on call each week'; });
  await tap(L, '#eSave');
  await until(async () => /High 20/.test(await text(L, `[data-risk="${target.id}"]`)));
  const t2 = (await risks()).find(r => r.id === target.id);
  ok('   adapted: ratings, owner, review date and a written control saved', t2.l === 5 && t2.i === 4 && t2.rl === 3 && t2.ri === 4 && t2.ownerName === 'The Juniors leader' && t2.reviewDue === '2025-01-01' && t2.controls.some(c => c.kind === 'text' && /spare leader/.test(c.text)) && t2.controls.some(c => c.kind === 'ratio'), J(t2));
  const row = await text(L, `[data-risk="${target.id}"]`);
  ok('3. THE RATING IN WORDS AND COLOUR: "Before: High 20", "After: Medium 12"', /Before: High 20/.test(row) && /After: Medium 12/.test(row) && await L.$eval(`[data-risk="${target.id}"] [data-rag="red"]`, e => !!e).catch(() => false), row);
  ok('   an overdue review says so', /Review overdue \(2025-01-01\)/.test(row), row);
  ok('   a watched control is marked as one the hub watches', await L.$eval(`[data-risk="${target.id}"] [data-linked="ratio"]`, e => /hub watches/.test(e.title)).catch(() => false));
  const top = await L.$eval(`[data-act="${juniorsId}"] [data-risk]`, e => e.getAttribute('data-risk'));
  ok('   the worst after its controls is first', top === target.id, top);
  /* S4: still to do on a standing risk (Derby's steps 4 and 5) */
  await tap(L, `[data-edit="${target.id}"]`); await L.waitForSelector('[data-rtodo] [data-rt="what"]');
  await L.$eval('[data-rtodo] [data-rt="what"]', e => { e.value = 'Recruit a fourth leader (invented)'; });
  await tap(L, '#eSave');
  ok('S4 STILL TO DO: refused without a person and a date', !!(await until(async () => /^Give each thing still to do a person and a date\.$/.test(await text(L, '#eMsg')))), await text(L, '#eMsg'));
  await L.$eval('[data-rtodo] [data-rt="who"]', e => { e.value = 'The Juniors leader'; });
  await L.$eval('[data-rtodo] [data-rt="by"]', e => { e.value = '2025-02-01'; });
  await tap(L, '#eSave');
  await until(async () => /Still to do:/.test(await text(L, `[data-risk="${target.id}"]`)));
  const t4 = (await risks()).find(r => r.id === target.id);
  ok('   saved on the risk, and shown with it - overdue, as its date has passed', t4.todo && t4.todo.length === 1 && t4.todo[0].what === 'Recruit a fourth leader (invented)' && t4.todo[0].who === 'The Juniors leader' && t4.todo[0].by === '2025-02-01' && t4.todo[0].done === false
    && /Still to do: Recruit a fourth leader \(invented\) \(The Juniors leader, by 2025-02-01\) overdue/.test(await text(L, `[data-risk="${target.id}"]`)), J(t4.todo));
  const toClose = rs.find(r => r.starterId === 'sun-photos');
  await tap(L, `[data-edit="${toClose.id}"]`); await L.waitForSelector('#eClosed');
  await L.$eval('#eClosed', e => { e.checked = true; }); await tap(L, '#eSave');
  await until(async () => /Closed \(1\)/.test(await text(L, `[data-act="${juniorsId}"]`)));
  ok('   CLOSED, NOT DELETED: kept under "Closed (1)"', /Closed \(1\)/.test(await text(L, `[data-act="${juniorsId}"]`)) && (await risks()).find(r => r.id === toClose.id).status === 'closed');
  ok('   nothing scrolls sideways at a computer', (await L.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await L.screenshot({ path: path.join(HERE, 'sg-register-lead-desk.png'), fullPage: true });
  await L.setViewport({ width: 375, height: 812 }); await sleep(300);
  ok('8. AT 375px nothing scrolls sideways', (await L.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await L.screenshot({ path: path.join(HERE, 'sg-register-lead-375.png'), fullPage: true });
  await L.setViewport({ width: 1280, height: 900 });

  /* 4. the trustee and the master admin read it */
  const Tt = await as('tom');
  await go(Tt, 'safeguarding-risk.html?tab=risks', '[data-act]');
  ok('4. A TRUSTEE (Elders) reads the register, read-only', /Read only/.test(await text(Tt, '#readOnly')) && /High 20/.test(await text(Tt)) && !(await Tt.$('[data-edit]')) && !(await Tt.$('#addAct')) && !(await Tt.$('[data-starter]')));
  await Tt.screenshot({ path: path.join(HERE, 'sg-register-trustee-desk.png'), fullPage: true });
  const M = await as('max');
  await go(M, 'safeguarding-risk.html?tab=risks', '[data-act]');
  ok('   a master admin reads it, read-only too (the lead and deputy keep it)', /Read only/.test(await text(M, '#readOnly')) && !(await M.$('[data-edit]')));

  /* 5. a volunteer */
  const Vv = await as('vic');
  await go(Vv, 'safeguarding-risk.html', '#notYours');
  ok('5. AN ACTIVITY\u2019S OWN LEADER is told it is for the lead, deputy and trustees', /for the safeguarding lead and deputy, and the trustees/.test(await text(Vv, '#notYours')));
  const vRead = await Vv.evaluate(() => EGBCAuth.db.collection('sgRisks').where('siteId', '==', 'site_t').get().then(() => 'read', e => e.code));
  ok('   and the database refuses them too', /permission/.test(vRead), vRead);

  /* 6. the trustee team is a setting */
  await go(M, 'safeguarding-settings.html', '#trTeam');
  ok('6. SAFEGUARDING SETTINGS: the trustee team, "Elders" unless set', (await M.$eval('#trTeam', e => e.value)) === 'Elders');
  await M.$eval('#trTeam', e => { e.value = 'Trustees'; });
  await tap(M, '#save');
  const st = await until(async () => { const s = await readDb(async (db) => (await getDoc(doc(db, 'safeguardingSettings', 'defaults'))).data()); return s && s.trusteeTeam === 'Trustees' ? s : null; });
  ok('   saved as "Trustees", with the lead and the rest kept', !!st && st.leadSiteId === 'site_t' && st.leadName === 'Lena Lead (invented)' && typeof st.register === 'object', J(st && { t: st.trusteeTeam, lead: st.leadSiteId }));
  await go(Tt, 'safeguarding-risk.html', '#notYours');
  ok('   then the Elders are no longer the trustees here', /for the safeguarding lead and deputy, and the trustees/.test(await text(Tt, '#notYours')));

  /* 7. the ways in */
  await go(L, 'safeguarding.html', '#riskRegLink');
  ok('7. SAFEGUARDING: the lead has "Safeguarding risk register"', await L.$eval('#riskRegLink', e => e.getAttribute('href') === 'safeguarding-risk.html'));

  /* 8. LOOK AT IT AGAIN (S5): an incident, linked by the lead to its activity, prompts that activity's risks */
  await readDb(async (db) => {
    await setDoc(doc(db, 'calEvents', 'ev_reg_inc'), { title: 'Juniors outing (invented)', status: 'confirmed', visibility: 'public', audience: ['public'], startLocal: '2026-10-20T10:00', startUtc: 1792483200000, location: { kind: 'site', siteId: 'site_t' }, teams: [], createdBy: 'x' });
    await setDoc(doc(db, 'incidents', 'inc_reg_1'), { calEventId: 'ev_reg_inc', siteId: 'site_t', happenedAt: new Date().toISOString(), people: 'A child (invented)', what: 'Grazed knee on the climbing frame (invented)', firstAid: false, parentInformed: true, reportedBy: 'x', reportedByName: 'x', createdAt: new Date().toISOString() });
  });
  await go(L, 'safeguarding-risk.html?tab=risks', '#incLinkCard');
  const il = await text(L, '#incLinkCard');
  ok('8. INCIDENTS TO LINK: the lead sees this year’s, by date and event only - never what happened or who', /Juniors outing \(invented\)/.test(il) && !/Grazed knee|A child/.test(il), il);
  await L.select('[data-inc="inc_reg_1"] [data-incact]', juniorsId);
  await tap(L, '[data-inc="inc_reg_1"] [data-inclink]');
  const linked = await until(async () => { const i = await readDb(async (db) => (await getDoc(doc(db, 'incidents', 'inc_reg_1'))).data()); return i && i.activityId === juniorsId ? i : null; });
  ok('   linked: the incident keeps the activity, and nothing else changes', !!linked && linked.what === 'Grazed knee on the climbing frame (invented)', J(linked && linked.activityId));
  const pr = await until(async () => { const t = await text(L, `[data-risk="${target.id}"]`); return /Review prompted: an incident on \d{4}-\d{2}-\d{2}/.test(t) ? t : null; }, 30000);
  ok('   THE JUNIORS RISK SAYS "Review prompted: an incident on <date>" (it was last reviewed before it)', !!pr, await text(L, `[data-risk="${target.id}"]`));
  ok('   and the warnings count it, amber', !!(await readDb(async (db) => ((await getDoc(doc(db, 'sgWarnings', 'site_t'))).data().items || []).find((i) => i.id === 'reviewIncident' && i.level === 'amber'))));
  await tap(L, `[data-edit="${target.id}"]`); await L.waitForSelector('#eSave');
  await tap(L, '#eSave');
  const gone = await until(async () => { const t = await text(L, `[data-risk="${target.id}"]`); return /Review prompted/.test(t) ? null : t; }, 30000);
  ok('   REVIEWED (saved again): the prompt goes', !!gone, await text(L, `[data-risk="${target.id}"]`));

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
