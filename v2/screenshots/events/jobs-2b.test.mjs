/* MY PAGES BY JOB, NEVER A TEAM'S NAME (H&S step 2b; FINDINGS-churchhq
   H-9). Events window. Invented people only, events emulators only,
   network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/jobs-2b.test.mjs"

   THE SYNTHETIC PARISH (St Aidan's with St Hild, Testbury) names its own
   teams for each job: the Parish office (office), the PCC (trustees), the
   Fabric team (buildings), the Kitchen team (catering), Treasury
   (finance). Each page lets that team in and tells EGBC's team name
   ("Church office", "Maintenance", ...) who the page is for:
     1. Building compliance and the live risk register: office and trustees
     2. Maintenance: the buildings job marks a repair done; its words name
        the church's own team
     3. The caterers' list: the catering job
     4. Payments: the finance job
     5. Book a room: team leaders and core teams (Martin, H-16)
     6. The accounts setting: each site's copy, for any number of sites
     7. EGBC, with nothing stored: its own teams, as before */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-jobs-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
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
  pam:     { name: 'Pam Parish (invented)', mid: 'm_pam', teams: ['Parish office'] },
  olive:   { name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Church office'] },
  percy:   { name: 'Percy PCC (invented)', mid: 'm_percy', teams: ['PCC'] },
  ed:      { name: 'Ed Elder (invented)', mid: 'm_ed', teams: ['Elders'] },
  fran:    { name: 'Fran Fabric (invented)', mid: 'm_fran', teams: ['Fabric team'] },
  mo:      { name: 'Mo Maintenance (invented)', mid: 'm_mo', teams: ['Maintenance'] },
  kit:     { name: 'Kit Kitchen (invented)', mid: 'm_kit', teams: ['Kitchen team'] },
  cat:     { name: 'Cat Catering (invented)', mid: 'm_cat', teams: ['Catering'] },
  tess:    { name: 'Tess Treasury (invented)', mid: 'm_tess', teams: ['Treasury'] },
  finn:    { name: 'Finn Finance (invented)', mid: 'm_finn', teams: ['Finance'] },
  sam:     { name: 'Sam Member (invented)', mid: 'm_sam', teams: ['Choir'] },
  lee:     { name: 'Lee Leader (invented)', mid: 'm_lee', teams: ['Choir'], roles: { Choir: 'leader' } },
  bea:     { name: 'Bea Bookings (invented)', mid: 'm_bea', teams: [] },
  martin:  { name: 'Mara Master (invented)', mid: 'm_mara', teams: [], master: true }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.jobs@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active', roles: x.roles || {} });
}
for (const name of ['Parish office', 'Church office', 'PCC', 'Elders', 'Fabric team', 'Maintenance', 'Kitchen team', 'Catering', 'Treasury', 'Finance', 'Choir']) await db.collection('teams').doc(name).set({ name, label: name, rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'St Aidan’s with St Hild, Testbury (synthetic)' });
await db.collection('churchSettings').doc('features').set({ buildingCompliance: true, roomBookings: true, catering: true });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
const PARISH = { office: ['Parish office'], trustees: ['PCC'], buildings: ['Fabric team'], catering: ['Kitchen team'], finance: ['Treasury'] };
await db.collection('churchSettings').doc('teamJobs').set(PARISH);
/* four buildings: three where nothing more than three was checked before (the accounts setting) */
const SITES = ['st_aidan', 'st_hild', 'parish_hall', 'parish_centre'];
for (const [i, s] of SITES.entries()) {
  await db.collection('sites').doc(s).set({ name: s.replace('_', ' ') + ' (synthetic)', active: true, order: i + 1 });
  await db.collection('bookingSettings').doc(s).set({ bookingsAdmins: s === 'parish_centre' ? ['m_bea'] : [], safeguardingLead: '', safeguardingDeputy: '' });
}
await db.collection('maintJobs').doc('mj_1').set({ siteId: 'st_hild', roomId: '', where: 'Vestry', what: 'A tap drips (invented)', details: '', photoPath: '', status: 'todo', reportedBy: P.percy.uid, reportedByName: 'Percy', reportedAt: new Date().toISOString() });
const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
await db.collection('cateringOrders').doc('co_1').set({ siteId: 'st_aidan', day, state: 'new', bookingKey: 'bk_x', title: 'Baptism lunch (invented)', people: 20, lines: [] });

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
const open = async (pg, page, settled) => { await pg.goto(URLB + page, { waitUntil: 'networkidle2' }); return until(async () => (await settled(pg)) ? true : null, 20000); };
const refusedWith = async (pg) => { const t = await text(pg, '#whoFor'); return t || null; };
const PAGES = {};
const who = async (k) => (PAGES[k] = PAGES[k] || await browser(k));

try {
  /* ---------- 1. compliance and the risk register ---------- */
  const settledCmp = async (pg) => (await pg.$('#whoFor')) || !/Loading/.test(await text(pg, '#wrap'));
  for (const page of ['compliance.html', 'risk.html']) {
    const name = page === 'compliance.html' ? 'Building compliance' : 'The live risk register';
    const pam = await who('pam'); await open(pam, page, settledCmp);
    ok('1. ' + name.toUpperCase() + ': THE PARISH OFFICE (the office job) opens it', !(await pam.$('#whoFor')) && !/This page is for/.test(await text(pam, '#wrap')), await text(pam, '#wrap'));
    const percy = await who('percy'); await open(percy, page, settledCmp);
    ok('   the PCC (the trustees job) opens it', !(await percy.$('#whoFor')), await text(percy, '#wrap'));
    const olive = await who('olive'); await open(olive, page, settledCmp);
    const ow = await text(olive, '#whoFor');
    ok('   a team called "Church office" is turned away, told it is for "the office (Parish office), the trustees (PCC)"', /the office \(Parish office\), the trustees \(PCC\) and master admins/.test(ow), ow || await text(olive, '#wrap'));
    const ed = await who('ed'); await open(ed, page, settledCmp);
    ok('   and so are the Elders', !!(await ed.$('#whoFor')), await text(ed, '#wrap'));
  }

  /* ---------- 2. maintenance ---------- */
  const settledMaint = async (pg) => /A tap drips/.test(await text(pg));
  const fran = await who('fran'); await open(fran, 'maintenance.html', settledMaint);
  ok('2. MAINTENANCE: THE FABRIC TEAM (the buildings job) may mark a repair done', !!(await fran.$('[data-done="mj_1"]')), await text(fran));
  const mo = await who('mo'); await open(mo, 'maintenance.html', settledMaint);
  ok('   a team called "Maintenance" no longer may', !(await mo.$('[data-done="mj_1"]')), await text(mo));
  const sam = await who('sam'); await open(sam, 'maintenance.html', settledMaint);
  ok('   the words name the church’s own team: "Only the Fabric team and the office see the photo"', /Only the Fabric team and the office see the photo/.test(await sam.$eval('#report', e => e.textContent)), await sam.$eval('#report', e => e.textContent));   /* the report form, shown by "+ Report a job" */
  await fran.$eval('[data-done="mj_1"]', e => e.click());
  ok('   and it is done, in the Fabric team’s name (the rules agree)', !!(await until(async () => { const d = (await db.collection('maintJobs').doc('mj_1').get()).data(); return d.status === 'done' && d.doneBy === P.fran.uid; })));

  /* ---------- 3. the caterers' list ---------- */
  const settledCat = async (pg) => (await pg.$('#whoFor')) || /Baptism lunch|order/i.test(await text(pg, '#app'));
  const kit = await who('kit'); await open(kit, 'catering.html', settledCat);
  ok('3. THE CATERERS’ LIST: THE KITCHEN TEAM (the catering job) sees the orders', !(await kit.$('#whoFor')) && /Baptism lunch/.test(await text(kit, '#app')), await text(kit, '#app'));
  const cat = await who('cat'); await open(cat, 'catering.html', settledCat);
  ok('   a team called "Catering" is told it is for "the caterers (Kitchen team)"', /for the caterers \(Kitchen team\)/.test(await text(cat, '#whoFor')), await text(cat, '#app'));

  /* ---------- 4. payments ---------- */
  const settledPay = async (pg) => !/Loading/.test(await text(pg, '#wrap'));
  const tess = await who('tess'); await open(tess, 'payments.html', settledPay);
  ok('4. PAYMENTS: TREASURY (the finance job) opens it', !/is for master admins and the church's money team/.test(await text(tess, '#wrap')) && !!(await tess.$('#team')), await text(tess, '#wrap'));
  ok('   it names Treasury, and says the team jobs decide it', /money team: Treasury/.test(await text(tess, '#team')) && !!(await tess.$('#teamByJobs')), await text(tess, '#team'));
  const finn = await who('finn'); await open(finn, 'payments.html', settledPay);
  ok('   a team called "Finance" is turned away', /is for master admins and the church's money team/.test(await text(finn, '#wrap')), await text(finn, '#wrap'));

  /* ---------- 5. Book a room ---------- */
  const settledRooms = async (pg) => (await pg.$('[data-egbc-blocked]')) || /Book|room/i.test(await text(pg));
  await open(sam, 'rooms.html', settledRooms);
  const blocked = await sam.evaluate(() => document.body.getAttribute('data-egbc-blocked'));
  ok('5. BOOK A ROOM: a plain member is turned away, "For team leaders and core teams" (Martin, H-16)', !!blocked && /For team leaders and core teams/.test(await text(sam)), (await text(sam)).slice(0, 300));
  const lee = await who('lee'); await open(lee, 'rooms.html', settledRooms);
  ok('   a team leader opens it', !(await lee.evaluate(() => document.body.getAttribute('data-egbc-blocked'))), (await text(lee)).slice(0, 300));

  /* ---------- 6. the accounts setting, by site ---------- */
  const mara = await who('martin');
  await open(mara, 'bookings-admin.html', async (pg) => !!(await pg.evaluate(() => !!window.EGBCAccounts)));
  await mara.evaluate(() => EGBCAuth.db.collection('settings').doc('accounts').set({ mode: 'calla', invoiceNumbersBy: 'hub', payText: 'Bank: invented', payDays: 21 }));
  const n = await mara.evaluate((s) => EGBCAccounts.settings(true).then(function (st) { return EGBCAccounts.copyToSites(st, s); }).then(() => s.length), SITES);
  const copies = await Promise.all(SITES.map(s => db.collection('accountsFor').doc(s).get().then(d => d.exists && d.data().mode)));
  ok('6. THE ACCOUNTS SETTING: an admin’s save copies it to every site - all four, where three were checked before', n === 4 && copies.every(m => m === 'calla'), JSON.stringify(copies));
  const bea = await who('bea');
  await open(bea, 'bookings-admin.html', async (pg) => !!(await pg.evaluate(() => !!window.EGBCAccounts)));
  const beaSt = await bea.evaluate(() => EGBCAccounts.settings(true, 'parish_centre').then(s => s.mode + '/' + s.payDays, e => 'refused ' + e));
  ok('   the fourth site’s bookings admin reads it: Calla mode, pay within 21 days', beaSt === 'calla/21', beaSt);
  const beaMain = await bea.evaluate(() => EGBCAuth.db.collection('settings').doc('accounts').get().then(() => 'read', e => e.code));
  ok('   but not the church-wide setting itself (admins only)', beaMain === 'permission-denied', beaMain);
  await db.collection('accountsFor').doc('parish_hall').delete();
  const filled = await mara.evaluate((s) => EGBCAccounts.fillMissing(s), SITES);
  ok('   a site with no copy yet gets one when an admin next opens the bookings', filled === 1 && (await db.collection('accountsFor').doc('parish_hall').get()).exists, filled);

  /* ---------- 7. EGBC, nothing stored ---------- */
  await db.collection('churchSettings').doc('teamJobs').delete();
  const olive = await who('olive'); await open(olive, 'compliance.html', settledCmp);
  ok('7. EGBC (NO TEAM JOBS STORED): the Church office opens Building compliance, as before', !(await olive.$('#whoFor')), await text(olive, '#wrap'));
  await open(mo, 'maintenance.html', async (pg) => /A tap drips/.test(await text(pg)));
  ok('   and Maintenance may run the repairs', !!(await mo.$('[data-reopen="mj_1"]')), await text(mo));
  await open(sam, 'maintenance.html', async (pg) => /A tap drips/.test(await text(pg)));
  ok('   with "the Maintenance team" in the words', /Only the Maintenance team and the office see the photo/.test(await sam.$eval('#report', e => e.textContent)));

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
