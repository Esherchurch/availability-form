/* BUILDING COMPLIANCE, STAGE 2: the screens, walked in a browser (F-231, F-232).
   Events window. Invented people and buildings only, events emulators only,
   network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/compliance-stage2.test.mjs"

   What it proves, at 375px:
     1. THE OFFICE sets up a building by answering about it: its checks
        appear, each labelled (Legal requirement / Recommended standard /
        Good practice), with the law's or the standard's frequency already set
     2. records a check done WITH A FILE (a certificate), and the colour changes
     3. gives two checks to Val
     4. A LEGAL CHECK CANNOT BE MADE LESS FREQUENT from the page (plain reason),
        and has no "Switch it off"
     5. a NON-SAFETY job past due leaves the colour alone; a SAFETY follow-up
        past due turns the building red - and it is ONE job, on the
        Maintenance list once
     6. A TRUSTEE (an Elder) sees it all, changes nothing
     7. VAL ("The building"): only her two checks; does one; the walk-round
        tick-list room by room; "Report a problem" makes a safety job
     8. a volunteer with no checks sees none; Val and an Attender are turned
        away from the office page */

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
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-cmp-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const E = loadEngine(), S = loadStore(), T = loadTemplates();
const SHOTS = path.join(HERE);

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
  val:    { name: 'Val Caretaker (invented)', mid: 'm_val', teams: ['Maintenance'] },
  vic:    { name: 'Vic Volunteer (invented)', mid: 'm_vic', teams: ['Welcome'] },
  nina:   { name: 'Nina Attender (invented)', mid: 'm_nina', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.cmp@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
for (const name of ['Core Team', 'Church office', 'Elders', 'Maintenance', 'Welcome']) await db.collection('teams').doc(name).set({ name, label: name, rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await seedTemplates(db, T, true);
await db.collection('churchSettings').doc('features').set({ buildingCompliance: true });
/* The locked rules are on (switch-over), so private records may be saved (F-235). */
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });

/* The church and the manse are set up already; the hall is not (the office answers for it in the browser). */
for (const s of FIXTURES.sites) {
  await db.collection('sites').doc(s.id).set({ name: s.name, active: true, order: FIXTURES.sites.indexOf(s) + 1 });
  for (const [id, name, kind] of s.rooms) {
    await db.collection('rooms').doc(id).set({ name, siteId: s.id, active: true, kind: 'room' });
    await db.collection('roomProfiles').doc(id).set({ siteId: s.id, kind, updatedAt: 'x' });
  }
  if (s.id !== 'cmp_hall') await S.applyProfile(db, E, s.id, s.profile, T.TEMPLATES, { uid: 'seed', name: 'Setup' });
}
/* Val also has a check that is switched off (the manse walk-round): it must not show. */
await db.collection('buildingChecks').doc('cmp_house__walk-round').update({ responsibleIds: ['m_val'], state: 'off', offReason: 'Manse empty (invented)' });
await db.collection('fireEquipment').doc('fe_k1').set({ siteId: 'cmp_hall', roomId: 'cmp_hall_kitchen', type: 'fireBlanket', size: '', label: 'FB1', nextService: '2027-01-15', removed: false, updatedAt: 'x' });
await db.collection('fireEquipment').doc('fe_m1').set({ siteId: 'cmp_hall', roomId: 'cmp_hall_main', type: 'water', size: '6 l', label: 'W1', nextService: '2027-01-15', removed: false, updatedAt: 'x' });
const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PAST = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
const PDF = path.join(TMP, 'gas-certificate-invented.pdf');
fs.writeFileSync(PDF, '%PDF-1.4\n% invented certificate for a test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept('Invented reason'));
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const setVal = (pg, sel, v) => pg.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const shot = (pg, name) => pg.screenshot({ path: path.join(SHOTS, name), fullPage: false });
const check = async (id) => (await db.collection('buildingChecks').doc(id).get()).data();
const jobs = async () => (await db.collection('maintJobs').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const rag = (pg) => pg.$eval('#bldRag', e => e.getAttribute('data-rag')).catch(() => '');
const openSite = async (pg, id) => { await pg.goto(URLB + 'compliance.html?site=' + id, { waitUntil: 'networkidle2' }); await until(() => pg.$('#bldRag')); };
const openCheck = async (pg, id) => { await tap(pg, '[data-check="' + id + '"]'); await until(() => pg.$('.sheet')); };
const closeSheet = (pg) => pg.$eval('.sheet .x', e => e.click()).catch(() => {});

try {
  /* ---------- 1. the office answers about the hall ---------- */
  const olive = await as('olive');
  await olive.goto(URLB + 'compliance.html', { waitUntil: 'networkidle2' });
  await until(() => olive.$('[data-site="cmp_hall"]'));
  const ov = await text(olive, '#buildings');
  ok('1. THE OFFICE (Olive) sees the three buildings; the hall is "Not set up yet"', /St Example’s Church/.test(ov) && /Example Hall \(invented\) Not set up yet/.test(ov) && /The Manse/.test(ov), ov);
  ok('   the guidance line is on the page', /These checks are guidance to help you\. Your trustees remain responsible for your building’s safety\./.test(await text(olive, '#guide')));
  await shot(olive, 'compliance-overview-375.png');
  await tap(olive, '[data-site="cmp_hall"]'); await until(() => olive.$('#bldRag'));
  await olive.$$eval('.tabs button', bs => bs.find(b => b.getAttribute('data-v') === 'profile').click());
  await until(() => olive.$('#saveProfile'));
  await setVal(olive, 'select[data-q="type"]', 'hall');
  for (const q of ['publicUse', 'food', 'play', 'kitchen', 'fireAlarm']) await olive.$eval('input[data-q="' + q + '"]', e => { e.checked = true; });
  await tap(olive, '#saveProfile');
  await until(async () => (await db.collection('buildingChecks').where('siteId', '==', 'cmp_hall').get()).size > 20);
  await until(() => olive.$('[data-check="cmp_hall__fire-alarm-test"]'));
  const hallChecks = (await db.collection('buildingChecks').where('siteId', '==', 'cmp_hall').get()).docs.map(d => d.data());
  ok('   SAVED: the hall’s checks appear (food, play, the fire alarm; no gas)', hallChecks.some(c => c.templateId === 'fridge-temps') && hallChecks.some(c => c.templateId === 'play') && hallChecks.some(c => c.templateId === 'fire-alarm-test') && !hallChecks.some(c => /^gas-/.test(c.templateId)), hallChecks.length);
  const fa = hallChecks.find(c => c.templateId === 'fire-alarm-test'), fr = hallChecks.find(c => c.templateId === 'food-reg');
  ok('   WITH THE STANDARD’S FREQUENCY ALREADY SET, no confirmation step (the fire alarm: every week)', fa.every.unit === 'week' && fa.every.n === 1 && fa.basis === 'standard');
  const labels = await olive.$$eval('[data-check] [data-basis]', es => es.map(e => e.getAttribute('data-basis') + ':' + e.textContent));
  ok('   EACH CHECK SHOWS ITS LABEL in plain words (Legal requirement / Recommended standard / Good practice)', labels.length === (await olive.$$('[data-check]')).length && labels.includes('legal:Legal requirement') && labels.includes('standard:Recommended standard') && labels.includes('practice:Good practice'), J(labels.slice(0, 5)));
  ok('   never recorded: amber, "Not recorded yet" - the hall is amber', (await rag(olive)) === 'amber' && /Not recorded yet/.test(await text(olive, '[data-check="cmp_hall__fire-alarm-test"]')), await rag(olive));
  await shot(olive, 'compliance-checks-375.png');

  /* ---------- 2. done, with a certificate ---------- */
  await openCheck(olive, 'cmp_hall__fire-alarm-test');
  const fileIn = await olive.$('#dFile'); await fileIn.uploadFile(PDF);
  await setVal(olive, '#dNotes', 'Call point by the vestry door (invented)');
  await shot(olive, 'compliance-check-375.png');
  await tap(olive, '#dGo');
  const rec = await until(async () => (await db.collection('checkRecords').where('checkId', '==', 'cmp_hall__fire-alarm-test').get()).docs.map(d => d.data())[0]);
  ok('2. RECORDED DONE WITH A FILE: the record keeps the date, who, the note and the certificate', rec && rec.doneOn === TODAY && rec.doneBy === P.olive.uid && rec.files.length === 1 && /^compliance\/cmp_hall\/cmp_hall__fire-alarm-test\//.test(rec.files[0].path), J(rec));
  const stored = await fetch(`http://127.0.0.1:9198/v0/b/${PROJECT}.appspot.com/o/${encodeURIComponent(rec.files[0].path)}`).then(r => r.status).catch(() => 0);
  ok('   and the file is in Storage', stored === 200 || stored === 403, stored);
  await until(async () => (await olive.$eval('[data-check="cmp_hall__fire-alarm-test"]', e => e.getAttribute('data-rag')).catch(() => '')) === 'green');
  ok('   THE COLOUR CHANGES: the fire alarm test is green (next due in a week)', (await olive.$eval('[data-check="cmp_hall__fire-alarm-test"]', e => e.getAttribute('data-rag'))) === 'green');

  /* ---------- 3. two checks for Val ---------- */
  for (const id of ['cmp_hall__water-temps', 'cmp_hall__ext-in-place']) {
    await openCheck(olive, id);
    await olive.$eval('#eWho', (e) => { [...e.options].forEach(o => { o.selected = o.value === 'm_val'; }); });
    await tap(olive, '#eGo');
    await until(async () => J((await check(id)).responsibleIds) === J(['m_val']));
  }
  ok('3. THE OFFICE GIVES VAL TWO CHECKS (water temperatures, the extinguisher walk-round)', J((await check('cmp_hall__water-temps')).responsibleIds) === J(['m_val']) && J((await check('cmp_hall__ext-in-place')).responsibleIds) === J(['m_val']));

  /* ---------- 4. the law is a floor, on the page ---------- */
  await openSite(olive, 'cmp_house');
  await openCheck(olive, 'cmp_house__gas-safety');
  const sheetTxt = await text(olive, '.sheet');
  ok('4. THE LET HOUSE’S GAS SAFETY CHECK says "Legal requirement", and has no "Switch it off"', /Legal requirement/.test(sheetTxt) && !(await olive.$('#eOff')), sheetTxt.slice(0, 200));
  await setVal(olive, '#eN', '2'); await setVal(olive, '#eU', 'year');
  await tap(olive, '#eGo');
  const refusal = await until(async () => { const t = await text(olive, '#eMsg'); return /legal requirement/i.test(t) ? t : ''; });
  ok('   EVERY 2 YEARS IS REFUSED, in plain words', /legal requirement: it can be checked more often, never less often than every year/.test(refusal || ''), refusal);
  ok('   and nothing was saved', (await check('cmp_house__gas-safety')).every.n === 1 && (await check('cmp_house__gas-safety')).every.unit === 'year');
  await closeSheet(olive);
  await openCheck(olive, 'cmp_house__water-temps');
  await setVal(olive, '#eN', '3'); await tap(olive, '#eGo');
  const r2 = await until(async () => { const t = await text(olive, '#eMsg'); return /Say why/.test(t) ? t : ''; });
  ok('   a recommended standard (water temperatures, monthly) lengthened with no reason: asked why', /recommended standard \(every month\)\. Say why/.test(r2 || ''), r2);
  await setVal(olive, '#eWhy', 'The manse is empty between ministers (invented)'); await tap(olive, '#eGo');
  await until(async () => (await check('cmp_house__water-temps')).every.n === 3);
  ok('   with a reason it is saved, and the reason kept', (await check('cmp_house__water-temps')).lengthenReason === 'The manse is empty between ministers (invented)');

  /* ---------- 5. jobs: only safety changes the colour; one list ---------- */
  await openSite(olive, 'cmp_hall');
  const before = await rag(olive);
  await openCheck(olive, 'cmp_hall__walk-round');
  await setVal(olive, '#jWhat', 'Repaint the porch railings (invented)'); await setVal(olive, '#jDue', PAST);
  await olive.$eval('#jSafety', e => { e.checked = false; });
  await tap(olive, '#jGo');
  await until(async () => (await jobs()).some(j => /porch/.test(j.what)));
  await until(() => olive.$('#bldRag'));
  ok('5. A NON-SAFETY JOB PAST DUE: the colour does not change', (await rag(olive)) === before && before === 'amber', before + ' -> ' + (await rag(olive)));
  await openCheck(olive, 'cmp_hall__water-temps');
  await setVal(olive, '#jWhat', 'Hot tap in the hall kitchen only reaches 40 degrees (invented)'); await setVal(olive, '#jDue', PAST); await setVal(olive, '#jOwner', 'm_val');
  await tap(olive, '#jGo');
  const sj = await until(async () => (await jobs()).find(j => /40 degrees/.test(j.what)));
  ok('   A SAFETY FOLLOW-UP IS A MAINTENANCE JOB carrying the check, the tick, the due date and the owner', sj && sj.checkId === 'cmp_hall__water-temps' && sj.safety === true && sj.due === PAST && sj.ownerId === 'm_val' && sj.status === 'todo', J(sj));
  await until(async () => (await rag(olive)) === 'red');
  ok('   PAST DUE, IT TURNS THE BUILDING RED', (await rag(olive)) === 'red');
  ok('   and shows under "Safety jobs" on the building', /40 degrees/.test(await text(olive, '#safetyJobs')));
  await olive.goto(URLB + 'maintenance.html', { waitUntil: 'networkidle2' });
  await until(async () => /40 degrees/.test(await text(olive)));
  const mtext = await text(olive);
  ok('   IT IS ON THE MAINTENANCE LIST ONCE (one list, never two)', (mtext.match(/only reaches 40 degrees/g) || []).length === 1 && (await jobs()).filter(j => /40 degrees/.test(j.what)).length === 1, (mtext.match(/only reaches 40 degrees/g) || []).length);

  /* ---------- 6. a trustee ---------- */
  const eli = await as('eli');
  await eli.goto(URLB + 'compliance.html?site=cmp_hall', { waitUntil: 'networkidle2' });
  await until(() => eli.$('#bldRag'));
  ok('6. A TRUSTEE (Eli, an Elder) sees the building, red, and its checks', (await rag(eli)) === 'red' && !!(await eli.$('[data-check="cmp_hall__fire-alarm-test"]')));
  ok('   but cannot add a check or record building work', !(await eli.$('#addOwn')) && !(await eli.$('#addWork')));
  await eli.$$eval('.tabs button', bs => bs.find(b => b.getAttribute('data-v') === 'profile').click());
  ok('   the answers are shown, not editable', !(await eli.$('#saveProfile')) && (await eli.$eval('input[data-q="food"]', e => e.disabled && e.checked)));
  const eliWrite = await eli.evaluate(() => EGBCAuth.db.collection('buildingChecks').doc('cmp_hall__walk-round').update({ responsibleIds: ['m_eli'] }).then(() => 'written', e => e.code));
  ok('   and the rules refuse a trustee’s edit', eliWrite === 'permission-denied', eliWrite);

  /* ---------- 7. Val's "The building" ---------- */
  const val = await as('val');
  await val.goto(URLB + 'building.html', { waitUntil: 'networkidle2' });
  await until(() => val.$('#report'));
  await until(() => val.$('[data-check]'));
  const vt = await text(val);
  const mine = await val.$$eval('[data-check]', es => es.map(e => e.getAttribute('data-check')));
  ok('7. VAL SEES ONLY HER TWO CHECKS (water temperatures, the extinguishers)', J(mine.sort()) === J(['cmp_hall__ext-in-place', 'cmp_hall__water-temps']), J(mine));
  ok('   "Hello Val", the big "Report a problem", her job to do, and the guidance line', /Hello Val/.test(vt) && /Report a problem/.test(vt) && /40 degrees/.test(await text(val, '#jobs')) && /Your trustees remain responsible/.test(vt));
  ok('   her heading names only the building her checks are in (not the manse, where hers is switched off)', /Example Hall \(invented\) · what needs doing/.test(vt) && !/Manse/.test(await text(val, '.sub')), await text(val, '.sub'));
  await shot(val, 'building-home-375.png');
  const valOther = await val.evaluate(() => EGBCAuth.db.collection('buildingChecks').doc('cmp_hall__fire-alarm-test').get().then(() => 'read', e => e.code));
  ok('   the rules refuse her a check not given to her', valOther === 'permission-denied', valOther);
  /* The main window's Building home (F-241): her checks due, through the rules, as Val. */
  const due = await val.evaluate(() => EGBCComplianceStore.dueForMe(EGBCAuth.db, EGBCCompliance, 'm_val', {}).then(r => r.map(x => x.id + ':' + x.rag), e => 'ERR ' + e.message));
  ok('   dueForMe() (for the app’s Building home): her two checks, due, and no one else’s', Array.isArray(due) && due.length === 2 && due.some(x => /water-temps:(red|amber)/.test(x)) && due.some(x => /ext-in-place:(red|amber)/.test(x)), JSON.stringify(due));
  await tap(val, '[data-check="cmp_hall__water-temps"]'); await until(() => val.$('#dGo'));
  await setVal(val, '#dNotes', 'Hot 61, cold 18 (invented)');
  await tap(val, '#dGo');
  await until(() => val.$('#doneCard'));
  const dt = await text(val, '#doneCard');
  ok('   SHE RECORDS IT DONE: "Recorded", and the next due date (a month on)', /Recorded/.test(dt) && /Next due/.test(dt), dt);
  ok('   in her name', (await db.collection('checkRecords').where('checkId', '==', 'cmp_hall__water-temps').get()).docs.some(d => d.data().doneBy === P.val.uid && /Hot 61/.test(d.data().notes)));
  await shot(val, 'building-done-375.png');
  await tap(val, '#toList'); await until(() => val.$('[data-check="cmp_hall__ext-in-place"]'));
  await tap(val, '[data-check="cmp_hall__ext-in-place"]'); await until(() => val.$('#wGo'));
  const wt = await text(val);
  ok('   THE WALK-ROUND: room by room, each extinguisher and blanket to tick', /Hall kitchen \(invented\)/.test(wt) && /Fire blanket · FB1/.test(wt) && /Main hall \(invented\)/.test(wt) && /Water · W1/.test(wt), wt.slice(0, 300));
  ok('   the hall kitchen, with no wet chemical extinguisher: "The guide suggests…" and that the fire risk assessment decides', /The guide suggests Wet chemical here\. Your fire risk assessment decides/.test(wt), wt);
  await val.$eval('[data-eq="fe_k1"]', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
  ok('   the button counts: "1 of 2 seen"', /1 of 2 seen/.test(await text(val, '#wGo')));
  await shot(val, 'building-walk-375.png');
  await tap(val, '#wGo'); await until(() => val.$('#doneCard'));
  const wr = (await db.collection('checkRecords').where('checkId', '==', 'cmp_hall__ext-in-place').get()).docs.map(d => d.data())[0];
  ok('   the record keeps each item: seen or not', wr && J(wr.items) === J([{ id: 'fe_k1', ok: true }, { id: 'fe_m1', ok: false }]) || J(wr && wr.items) === J([{ id: 'fe_m1', ok: false }, { id: 'fe_k1', ok: true }]), J(wr && wr.items));
  await tap(val, '#toList'); await until(() => val.$('#report'));
  await tap(val, '#report'); await until(() => val.$('#rGo'));
  await setVal(val, '#rSite', 'cmp_hall'); await setVal(val, '#rRoom', 'cmp_hall_kitchen');
  await val.type('#rWhat', 'Smoke alarm in the kitchen keeps chirping (invented)');
  ok('   REPORT A PROBLEM: the safety tick is suggested from her words', await val.$eval('#rSafety', e => e.checked));
  await tap(val, '#rGo'); await until(() => val.$('#reported'));
  const rj = (await jobs()).find(j => /chirping/.test(j.what));
  ok('   it is a Maintenance job, marked safety, in the right room', rj && rj.safety === true && rj.roomId === 'cmp_hall_kitchen' && rj.reportedBy === P.val.uid, J(rj));
  await val.goto(URLB + 'compliance.html', { waitUntil: 'networkidle2' });
  await until(async () => /This page is for the office \(/.test(await text(val)));
  ok('   Val is turned away from the office page, pointed to "The building"', /This page is for the office \(Church office\), the trustees \(Elders\) and master admins/.test(await text(val)));

  /* ---------- 8. others ---------- */
  const vic = await as('vic');
  await vic.goto(URLB + 'building.html', { waitUntil: 'networkidle2' });
  await until(async () => /Nothing has been given to you yet/.test(await text(vic)));
  ok('8. A VOLUNTEER WITH NO CHECKS: "Nothing has been given to you yet", still "Report a problem"', /Nothing has been given to you yet/.test(await text(vic)) && !(await vic.$('[data-check]')) && !!(await vic.$('#report')));
  const vicRead = await vic.evaluate(() => EGBCAuth.db.collection('buildingChecks').doc('cmp_hall__water-temps').get().then(() => 'read', e => e.code));
  ok('   the rules refuse him Val’s check', vicRead === 'permission-denied', vicRead);
  const nina = await as('nina');
  await nina.goto(URLB + 'compliance.html', { waitUntil: 'networkidle2' });
  await until(async () => /This page is for the office \(/.test(await text(nina)));
  ok('   AN ATTENDER is turned away from the office page', /This page is for the office \(/.test(await text(nina)) && !(await nina.$('[data-site]')));
  const log = (await db.collection('complianceLog').get()).docs.map(d => d.data());
  ok('   EVERYTHING DONE IS IN THE LOG, by name', ['profile', 'done', 'edit', 'job'].every(w => log.some(l => l.what === w)) && log.some(l => l.byName === P.val.name && l.what === 'done'), J([...new Set(log.map(l => l.what))]));
  ok('   no page errors', errors.length === 0, errors.join(' | '));
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
