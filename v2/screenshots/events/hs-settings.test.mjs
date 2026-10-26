/* HEALTH AND SAFETY SETTINGS (H&S step 2; F-280 section 8; Martin's answers
   to F-280). Events window. Invented people only, events emulators only,
   network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/hs-settings.test.mjs"

     1. who may: the office job (and master admins) - read through the jobs
        mapping, never a team's name; anyone else is refused, page and rules
     2. how many the church employs: the duties follow it, live as it is
        typed, and the buildings' checks follow it when saved - only where
        someone employed works; fewer, and those checks no longer apply
     3. who looks after each building: lead and deputy two people; the
        responsible person on the fire assessment
     4. insurance cover under the minimum is flagged
     5. the rules hold the shape: whole numbers, AI 0-500, months 1-120,
        no other field, no other record, never deleted
     6. THE SYNTHETIC PARISH: its "Parish office" does the office job - so
        it, not a team called "Church office", may set these
     7. the store's sums are egbc-hs-core.js's; at phone width nothing
        spills over */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { loadEngine, loadStore, loadTemplates } from './compliance-engine.mjs';
import { seedTemplates, FIXTURES } from '../../tools/seed-compliance.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-hss-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const E = loadEngine(), S = loadStore(), T = loadTemplates();
const hctx = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-hs-core.js'), 'utf8'), hctx);
const H = hctx.module.exports;
const SRV = fnRequire('./compliance-store.cjs');

const results = [];
const J = (x) => JSON.stringify(x);
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }

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
const P = {
  olive: { name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Church office'] },
  pam:   { name: 'Pam Parish (invented)', mid: 'm_pam', teams: ['Parish office'] },
  ed:    { name: 'Ed Elder (invented)', mid: 'm_ed', teams: ['Elders'] },
  pat:   { name: 'Pat Person (invented)', mid: 'm_pat', teams: [] },
  fay:   { name: 'Fay Fire (invented)', mid: 'm_fay', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.hss@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
for (const name of ['Church office', 'Parish office', 'Elders']) await db.collection('teams').doc(name).set({ name, label: name, rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church' });
await db.collection('churchSettings').doc('features').set({ buildingCompliance: true });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
await seedTemplates(db, T, true);
/* two buildings: someone employed works at the church; nobody at the hall */
const CH = FIXTURES.sites[0], HALL = FIXTURES.sites[1];
for (const [i, s] of [CH, HALL].entries()) {
  await db.collection('sites').doc(s.id).set({ name: s.name, active: true, order: i + 1 });
  await S.applyProfile(db, E, s.id, Object.assign({}, s.profile, s === CH ? { employees: true } : {}), T.TEMPLATES, { uid: 'seed', name: 'Setup' });
}
const checkOn = async (site, tpl) => { const d = await db.collection('buildingChecks').doc(S.checkId(site, tpl)).get(); return d.exists ? d.data().state : 'none'; };

const errors = [], browsers = [];
async function browser(whoK) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, whoK + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, whoK);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 1100, height: 900 });
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
const go = async (pg) => { await pg.goto(URLB + 'hs-settings.html', { waitUntil: 'networkidle2' }); await pg.waitForSelector('#hsSave, #hsRefused', { timeout: 20000 }); };
/* a write straight from the page, as that person: allowed or refused by the rules */
const tryWrite = (pg, c, d, data) => pg.evaluate((c, d, data) => EGBCAuth.db.collection(c).doc(d).set(data).then(() => 'ok', (e) => e.code || String(e)), c, d, data);
const typeIn = async (pg, id, v) => { await pg.$eval('#' + id, (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, String(v)); };
const saveIt = async (pg) => { await pg.$eval('#toast', (e) => { e.textContent = ''; e.style.display = 'none'; }); await pg.$eval('#hsMsg', (e) => { e.textContent = ''; }); await tap(pg, '#hsSave'); return until(async () => /Saved\.|Not saved/.test(await text(pg, '#toast')) || /Not saved|must be/.test(await text(pg, '#hsMsg')) ? (await text(pg, '#toast')) + ' ' + (await text(pg, '#hsMsg')) : null); };

try {
  /* ---------- 1. who may ---------- */
  const pat = await browser('pat');
  await go(pat);
  ok('1. SOMEONE WITHOUT THE OFFICE JOB: refused, told who sets them ("the Church office and master admins")', !!(await pat.$('#hsRefused')) && /set by the Church office and master admins/.test(await text(pat, '#hsRefused')), await text(pat));
  ok('   and the rules refuse them too (the settings, a building’s leads)', (await tryWrite(pat, 'raSettings', 'church', { employees: 1 })) === 'permission-denied' && (await tryWrite(pat, 'raSiteRoles', CH.id, { siteId: CH.id, hsLead: 'm_pat' })) === 'permission-denied');
  const ed = await browser('ed');
  ok('   a trustee (Elders) without the office job: refused by the rules', (await tryWrite(ed, 'raSettings', 'church', { employees: 1 })) === 'permission-denied');

  const ol = await browser('olive');
  await go(ol);
  ok('THE OFFICE JOB (EGBC’s default, nothing stored: "Church office"): the settings, with the "not legal advice" words', !!(await ol.$('#hsSave')) && (await text(ol, '#hsNotAdvice')) === H.NOT_ADVICE, await text(ol));
  ok('   each building, with its lead, deputy and fire safety lead; the responsible person: "The trustees of Test Green Church"', (await ol.$$('[data-site]')).length === 2 && !!(await ol.$('#hsLead_' + CH.id)) && !!(await ol.$('#fireLead_' + HALL.id)) && /The trustees of Test Green Church\./.test(await text(ol, '[data-site="' + CH.id + '"] [data-responsible]')), await text(ol, '#hsWho'));

  /* ---------- 2. employees ---------- */
  ok('2. NOT ANSWERED YET: no duties listed; a building where someone employed works already has the one-or-more checks (its own answer), and nothing from the number', /Give the number/.test(await text(ol, '#hsDuties')) && (await checkOn(CH.id, 'hs-law-poster')) === 'on' && (await checkOn(CH.id, 'hs-policy-written')) === 'none' && (await checkOn(HALL.id, 'hs-law-poster')) === 'none', await text(ol, '#hsDuties'));
  await typeIn(ol, 'hsEmployees', 6); await ol.$eval('#hsScreen', (e) => { e.checked = true; e.dispatchEvent(new Event('change')); });
  const d6 = await ol.$$eval('[data-duty]', (l) => l.map((x) => x.getAttribute('data-duty')));
  ok('   6 EMPLOYED, SCREEN WORK: the duties listed as it is typed (1 or more, 5 or more, screens; not yet a larger team)', J(d6) === J(['one', 'poster', 'report', 'firstAid', 'policy', 'findings', 'dse']), J(d6));
  const s6 = await saveIt(ol);
  const c6 = (await db.collection('raSettings').doc('church').get()).data();
  ok('   SAVED: the number and the tick; the buildings’ checks follow it', /Saved\. Buildings’ checks: \d+ added/.test(s6) && c6.employees === 6 && c6.screenWork === true && c6.updatedBy === P.olive.uid, s6 + ' ' + J(c6));
  const on6 = {}; for (const t of ['hs-law-poster', 'reportable-injuries', 'first-aid-needs', 'hs-policy-written', 'hs-findings-written', 'dse-assessment', 'staff-hs-training']) on6[t] = await checkOn(CH.id, t);
  ok('   WHERE SOMEONE EMPLOYED WORKS (the church): the poster, injuries, first aid, the written policy and findings, screens - not yet staff training', J(on6) === J({ 'hs-law-poster': 'on', 'reportable-injuries': 'on', 'first-aid-needs': 'on', 'hs-policy-written': 'on', 'hs-findings-written': 'on', 'dse-assessment': 'on', 'staff-hs-training': 'none' }), J(on6));
  const raw6 = (await db.collection('buildingProfiles').doc(CH.id).get()).data() || {};
  ok('   the number’s flags are worked out, never stored on the building (its own answers only)', raw6.employees === true && !('employees5' in raw6) && !('dse' in raw6) && !('staffMany' in raw6), J(raw6));
  ok('   WHERE NOBODY EMPLOYED WORKS (the hall): none of them', (await checkOn(HALL.id, 'hs-law-poster')) === 'none' && (await checkOn(HALL.id, 'hs-policy-written')) === 'none');
  await typeIn(ol, 'hsEmployees', 12);
  ok('   12 EMPLOYED: a larger staff team (from 10): training, consulting, lone working join the list', J(await ol.$$eval('[data-duty]', (l) => l.map((x) => x.getAttribute('data-duty')).slice(-3))) === J(['training', 'consult', 'lone']));
  await saveIt(ol);
  ok('   saved: staff training, consulting employees and lone working for staff are checks at the church', (await checkOn(CH.id, 'staff-hs-training')) === 'on' && (await checkOn(CH.id, 'consult-employees')) === 'on' && (await checkOn(CH.id, 'staff-lone-working')) === 'on');
  await typeIn(ol, 'hsEmployees', 3); await ol.$eval('#hsScreen', (e) => { e.checked = false; e.dispatchEvent(new Event('change')); });
  await saveIt(ol);
  ok('   3 EMPLOYED, NO SCREENS: the 5-or-more, screen and larger-team checks no longer apply (kept, marked removed); the 1-or-more stay', (await checkOn(CH.id, 'hs-policy-written')) === 'removed' && (await checkOn(CH.id, 'dse-assessment')) === 'removed' && (await checkOn(CH.id, 'staff-hs-training')) === 'removed' && (await checkOn(CH.id, 'hs-law-poster')) === 'on');
  const L = await S.load(db, CH.id), Lh = await S.load(db, HALL.id);
  ok('   THE STORE (pages and server alike): the church’s flags added to the profile where someone employed works, never stored', L.profile.employees === true && !L.profile.employees5 && !L.answers.employees5 && !Lh.profile.employees5, J([L.profile, Lh.profile]).slice(0, 300));

  /* ---------- 3. who looks after each building ---------- */
  await ol.$eval('#hsLead_' + CH.id, (e) => { e.value = 'm_olive'; }); await ol.$eval('#hsDeputy_' + CH.id, (e) => { e.value = 'm_olive'; });
  const same = await saveIt(ol);
  ok('3. THE LEAD AND THE DEPUTY THE SAME PERSON: not saved, said plainly', /must be two different people/.test(same) && !(await db.collection('raSiteRoles').doc(CH.id).get()).exists, same);
  await ol.$eval('#hsDeputy_' + CH.id, (e) => { e.value = 'm_ed'; });
  await ol.$eval('#fireLead_' + CH.id, (e) => { e.value = 'm_fay'; e.dispatchEvent(new Event('change')); });
  ok('   the responsible person names the fire safety lead as it is chosen', /The trustees of Test Green Church, with Fay Fire \(invented\), the fire safety lead, acting for them\./.test(await text(ol, '[data-site="' + CH.id + '"] [data-responsible]')), await text(ol, '[data-site="' + CH.id + '"] [data-responsible]'));
  await saveIt(ol);
  const r3 = (await db.collection('raSiteRoles').doc(CH.id).get()).data() || {};
  ok('   saved as member ids only (no names beside them): lead, deputy, fire safety lead', r3.siteId === CH.id && r3.hsLead === 'm_olive' && r3.hsDeputy === 'm_ed' && r3.fireLead === 'm_fay' && !/Olive|Fay/.test(J(r3)) && !(await db.collection('raSiteRoles').doc(HALL.id).get()).exists, J(r3));
  ok('   the rules refuse the lead and deputy the same, straight from the page', (await tryWrite(ol, 'raSiteRoles', HALL.id, { siteId: HALL.id, hsLead: 'm_ed', hsDeputy: 'm_ed', fireLead: '' })) === 'permission-denied');

  /* ---------- 4. insurance ---------- */
  await typeIn(ol, 'hsPublic', 500000); await typeIn(ol, 'hsEmployers', 2000000);
  ok('4. INSURANCE: public liability under £1 million, employers’ liability under the £5 million legal minimum - both flagged', J(await ol.$$eval('[data-cover]', (l) => l.map((x) => x.textContent))) === J(['Public liability cover under £1 million', 'Employers’ liability cover under £5 million, the legal minimum']), await text(ol, '#hsCover'));
  await typeIn(ol, 'hsPublic', 10000000); await typeIn(ol, 'hsEmployers', 10000000);
  ok('   enough cover: no flag', (await ol.$$('[data-cover]')).length === 0);
  await saveIt(ol);

  /* ---------- 5. the rules hold the shape ---------- */
  const base = { employees: 3, screenWork: false, ai: { perChurch: 20, perPerson: 5 }, targets: { high: 1, medium: 3, low: 6 }, updatedAt: 'x', updatedBy: P.olive.uid };
  const tries = {
    ok: await tryWrite(ol, 'raSettings', 'church', base),
    negative: await tryWrite(ol, 'raSettings', 'church', Object.assign({}, base, { employees: -1 })),
    fraction: await tryWrite(ol, 'raSettings', 'church', Object.assign({}, base, { employees: 2.5 })),
    ai501: await tryWrite(ol, 'raSettings', 'church', Object.assign({}, base, { ai: { perChurch: 501, perPerson: 5 } })),
    months0: await tryWrite(ol, 'raSettings', 'church', Object.assign({}, base, { targets: { high: 0, medium: 3, low: 6 } })),
    extra: await tryWrite(ol, 'raSettings', 'church', Object.assign({}, base, { hidden: 1 })),
    otherDoc: await tryWrite(ol, 'raSettings', 'other', base),
    noSite: await tryWrite(ol, 'raSiteRoles', 'nowhere', { siteId: 'nowhere', hsLead: 'm_ed' }),
    del: await ol.evaluate(() => EGBCAuth.db.collection('raSettings').doc('church').delete().then(() => 'ok', (e) => e.code))
  };
  ok('5. THE RULES: whole numbers only, AI 0-500, months 1-120, no other field or record, a real building, never deleted', tries.ok === 'ok' && Object.keys(tries).filter((k) => k !== 'ok').every((k) => tries[k] === 'permission-denied'), J(tries));
  ok('   no hidden cap: 500 AI drafts a day, and a church employing 2,000, are allowed', (await tryWrite(ol, 'raSettings', 'church', Object.assign({}, base, { employees: 2000, ai: { perChurch: 500, perPerson: 500 } }))) === 'ok');
  await tryWrite(ol, 'raSettings', 'church', base);

  /* ---------- 6. the synthetic parish: a job, not a team ---------- */
  await db.collection('churchSettings').doc('teamJobs').set({ office: ['Parish office'] });
  const ol2 = await browser('olive');
  await go(ol2);
  ok('6. THE PARISH’S JOBS: its "Parish office" does the office job, so a "Church office" team no longer may - the page says who does', !!(await ol2.$('#hsRefused')) && /set by the Parish office and master admins/.test(await text(ol2, '#hsRefused')) && (await tryWrite(ol2, 'raSettings', 'church', base)) === 'permission-denied', await text(ol2));
  const pam = await browser('pam');
  await go(pam);
  ok('   and the Parish office may: the page, and the rules', !!(await pam.$('#hsSave')) && (await tryWrite(pam, 'raSettings', 'church', base)) === 'ok', await text(pam));
  await db.collection('churchSettings').doc('teamJobs').set({ office: [] });
  ok('   a job nobody does ([]): nobody but master admins', (await tryWrite(pam, 'raSettings', 'church', base)) === 'permission-denied');
  await db.collection('churchSettings').doc('teamJobs').delete();

  /* ---------- 7. one set of sums; phone width ---------- */
  const grid = [];
  for (const employees of [undefined, 0, 1, 4, 5, 9, 10, 25]) for (const screenWork of [false, true]) for (const largerTeam of [undefined, 3, 20]) grid.push({ employees, screenWork, largerTeam });
  const differ = grid.filter((c) => J(H.flagsFor(c)) !== J(SRV.churchFlags(c)) || J(S.churchFlags(c)) !== J(SRV.churchFlags(c)));
  ok('7. THE SAME SUMS: egbc-hs-core.js, the page’s store and the server’s store agree (' + grid.length + ' cases)', differ.length === 0, J(differ.slice(0, 3)));
  await pam.setViewport({ width: 375, height: 812 });
  await db.collection('churchSettings').doc('teamJobs').set({ office: ['Parish office'] });
  await go(pam);
  ok('   AT PHONE WIDTH (375): nothing wider than the screen', (await pam.evaluate(() => document.documentElement.scrollWidth)) <= 375, await pam.evaluate(() => document.documentElement.scrollWidth));
  await pam.screenshot({ path: path.join(HERE, 'hs-settings-375.png'), fullPage: true });

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
