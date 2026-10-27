/* H&S STEP 3a (FINDINGS-events F-298). Events window. Invented people only,
   events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,functions \
       --project egbc-worship-planner "node screenshots/events/hs-3a.test.mjs"

   As THE SYNTHETIC PARISH (St Aidan's with St Hild, Testbury), whose
   Parish office does the office job and whose PCC are the trustees:
     1. Book a room: the office and the bookings admins may book too (Martin,
        28 Oct), a bookings admin at the buildings they look after
     2. A new building gets its copy of the Accounts setting at once (the
        accountsForNewSite function), never overwriting one already there
     3. Safeguarding settings' trustee box says when the team jobs decide
     4. Building compliance's history: all of it, 200 at a time
     5. The fire roll call: one list for each building and one for every
        building, set in Health and safety settings by the office job;
        500 to a list, and the page says when one is full
     6. The old single list moved by tools/migrate-fire-rollcall.mjs, and
        the evacuation plans' function reading either */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-hs3a-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const ACC = await import(pathToFileURL(path.join(V2, 'functions', 'accounts-copy.js')).href);
const PEEPS = await import(pathToFileURL(path.join(V2, 'functions', 'peeps.js')).href);

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = JSON.stringify;

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
  pam:    { name: 'Pam Parish (invented)', mid: 'm_pam', teams: ['Parish office'] },
  olive:  { name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Church office'] },
  percy:  { name: 'Percy PCC (invented)', mid: 'm_percy', teams: ['PCC'] },
  fran:   { name: 'Fran Fabric (invented)', mid: 'm_fran', teams: ['Fabric team'] },
  sam:    { name: 'Sam Member (invented)', mid: 'm_sam', teams: ['Choir'] },
  lee:    { name: 'Lee Leader (invented)', mid: 'm_lee', teams: ['Choir'], roles: { Choir: 'leader' } },
  bea:    { name: 'Bea Bookings (invented)', mid: 'm_bea', teams: [] },
  mara:   { name: 'Mara Master (invented)', mid: 'm_mara', teams: [], master: true }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.hs3a@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active', roles: x.roles || {} });
}
for (const name of ['Parish office', 'Church office', 'PCC', 'Elders', 'Fabric team', 'Choir']) await db.collection('teams').doc(name).set({ name, label: name, rota: false, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'St Aidan’s with St Hild, Testbury (synthetic)' });
await db.collection('churchSettings').doc('features').set({ buildingCompliance: true, roomBookings: true });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
const PARISH = { office: ['Parish office'], trustees: ['PCC'], buildings: ['Fabric team'] };
await db.collection('churchSettings').doc('teamJobs').set(PARISH);
const SITES = { st_aidan: 'St Aidan (synthetic)', st_hild: 'St Hild (synthetic)', parish_hall: 'Parish hall (synthetic)' };
for (const [i, s] of Object.keys(SITES).entries()) {
  await db.collection('sites').doc(s).set({ name: SITES[s], active: true, order: i + 1 });
  await db.collection('bookingSettings').doc(s).set({ bookingsAdmins: s === 'parish_hall' ? ['m_bea'] : [], safeguardingLead: '', safeguardingDeputy: '' });
  await db.collection('rooms').doc('room_' + s).set({ siteId: s, name: 'The ' + SITES[s].replace(' (synthetic)', '') + ' room (invented)', kind: 'room', active: true, order: 1, capacity: 40 });
}

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
const PAGES = {};
const who = async (k) => (PAGES[k] = PAGES[k] || await browser(k));
const blockedOn = (pg) => pg.evaluate(() => document.body.getAttribute('data-egbc-blocked'));

try {
  /* ---------- 1. Book a room ---------- */
  const settledRooms = async (pg) => (await blockedOn(pg)) || !/Loading/.test(await text(pg, '#cal'));
  const pam = await who('pam'); await open(pam, 'rooms.html', settledRooms);
  ok('1. BOOK A ROOM: THE PARISH OFFICE (the office job, leading no team) may book (Martin, 28 Oct)', !(await blockedOn(pam)) && !!(await pam.$('#c-site')), (await text(pam)).slice(0, 300));
  const pamSites = await pam.$$eval('#c-site option', o => o.map(x => x.textContent));
  ok('   at every building', pamSites.length === 3, J(pamSites));
  const bea = await who('bea'); await open(bea, 'rooms.html', settledRooms);
  const beaText = await text(bea);
  ok('   THE PARISH HALL\'S BOOKINGS ADMIN may book', !(await blockedOn(bea)) && /The Parish hall room/.test(beaText), beaText.slice(0, 300));
  ok('     only at the building they look after (as the rules allow)', !(await bea.$('#c-site')) && !/The St Hild room|The St Aidan room/.test(beaText), beaText.slice(0, 300));
  ok('     and is told they look after its bookings', /You look after bookings/.test(await text(bea, '#office')), await text(bea, '#office'));
  const sam = await who('sam'); await open(sam, 'rooms.html', settledRooms);
  ok('   a plain member is still turned away, with the office and bookings admins named', /For team leaders and core teams/.test(await text(sam)) && /the office and the bookings admins/.test(await text(sam)), (await text(sam)).slice(0, 300));
  const lee = await who('lee'); await open(lee, 'rooms.html', settledRooms);
  ok('   a team leader still books anywhere', !(await blockedOn(lee)) && !!(await lee.$('#c-site')), (await text(lee)).slice(0, 300));
  const olive = await who('olive'); await open(olive, 'rooms.html', settledRooms);
  ok('   a team called "Church office" is not the parish\'s office', !!(await blockedOn(olive)), (await text(olive)).slice(0, 300));
  /* the rules: the page's own write, as each */
  const req = async (pg, roomId, siteId) => pg.evaluate(async (roomId, siteId, uid) => {
    const d = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
    try {
      await EGBCAuth.db.collection('bookings').doc(('bk_3a_' + roomId + '_' + uid).slice(0, 32).padEnd(31, '0')).set({ kind: 'member', status: 'requested', siteId, roomId, groupId: '', day: d, startMin: 600, endMin: 660,
        startLocal: d + 'T10:00', endLocal: d + 'T11:00', slotFrom: 40, slotTo: 44, setupMins: 0, packdownMins: 0, title: 'Asked (invented)', people: 6, layout: '', av: { needed: false, what: '' },
        refreshments: { needed: false }, resources: [], notes: '', requester: { name: 'x', email: 'x@example.invalid', phone: '', org: '' }, memberUid: uid, memberName: 'x', createdAt: new Date().toISOString() });
      return 'ok';
    } catch (e) { return e.code || String(e); }
  }, roomId, siteId, await pg.evaluate(() => EGBCAuth.user().uid));
  ok('   THE RULES: the Parish office asks for St Hild', (await req(pam, 'room_st_hild', 'st_hild')) === 'ok');
  ok('     the Parish hall\'s bookings admin asks for the Parish hall', (await req(bea, 'room_parish_hall', 'parish_hall')) === 'ok');
  ok('     but not for St Hild', (await req(bea, 'room_st_hild', 'st_hild')) === 'permission-denied');
  ok('     nor may a plain member ask', (await req(sam, 'room_st_aidan', 'st_aidan')) === 'permission-denied');

  /* ---------- 2. a new building's Accounts copy ---------- */
  await db.collection('settings').doc('accounts').set({ mode: 'calla', invoiceNumbersBy: 'hub', payText: 'Pay by bank transfer (invented)', payDays: 21, updatedAt: 'x' });
  await db.collection('sites').doc('parish_centre').set({ name: 'Parish centre (synthetic)', active: true, order: 4 });
  const copy = await until(async () => { const s = await db.collection('accountsFor').doc('parish_centre').get(); return s.exists ? s.data() : null; }, 30000);
  ok('2. A NEW BUILDING GETS ITS ACCOUNTS COPY AT ONCE (the function, no page opened)', copy && copy.mode === 'calla' && copy.payDays === 21 && /bank transfer/.test(copy.payText), J(copy));
  ok('   only the setting\'s own fields', copy && J(Object.keys(copy).sort()) === J(['invoiceNumbersBy', 'mode', 'payDays', 'payText', 'updatedAt']), J(copy && Object.keys(copy)));
  await db.collection('accountsFor').doc('mission_hut').set({ mode: 'none', invoiceNumbersBy: 'hub', payText: '', payDays: 7, updatedAt: 'x' });
  ok('   a copy already there is left alone', J(await ACC.onSiteCreated(db, 'mission_hut')) === J({ skipped: 'already has its copy' }) && (await db.collection('accountsFor').doc('mission_hut').get()).data().payDays === 7);
  await db.collection('settings').doc('accounts').delete();
  ok('   with no Accounts setting saved, nothing is written (the defaults answer)', J(await ACC.onSiteCreated(db, 'chapel')) === J({ skipped: 'no Accounts setting saved' }) && !(await db.collection('accountsFor').doc('chapel').get()).exists);

  /* ---------- 3. the trustee box ---------- */
  const mara = await who('mara');
  const settledSg = async (pg) => !!(await pg.$('#regCard'));
  await open(mara, 'safeguarding-settings.html', settledSg);
  const box = await text(mara, '#regCard');
  ok('3. SAFEGUARDING SETTINGS: THE TEAM JOBS DECIDE THE TRUSTEES, AND THE BOX SAYS SO ("PCC")', !!(await mara.$('#trByJobs')) && /The trustees PCC/.test(box) && /Church settings’ team jobs say who does the trustees job, so it is changed there/.test(box), box.slice(0, 400));
  ok('   no box to type a team in', (await mara.$eval('#trTeam', e => e.type)) === 'hidden');
  ok('   the fire roll call has moved: a pointer to Health and safety settings', /now named for each building in Health and safety settings/.test(await text(mara, '#fireCard')) && !!(await mara.$('#fireCard a[href="hs-settings.html"]')), await text(mara, '#fireCard'));
  await db.collection('churchSettings').doc('teamJobs').set({ office: ['Parish office'] });
  await open(mara, 'safeguarding-settings.html', settledSg);
  ok('   with no trustees job stored, the box is the setting, as before', !(await mara.$('#trByJobs')) && (await mara.$eval('#trTeam', e => e.type)) !== 'hidden');
  await db.collection('churchSettings').doc('teamJobs').set(PARISH);

  /* ---------- 4. compliance history ---------- */
  await db.collection('buildingProfiles').doc('st_hild').set({ siteId: 'st_hild' });
  const t0 = Date.parse('2026-01-01T09:00:00Z');
  for (let i = 0; i < 450; i += 150) {
    const b = db.batch();
    for (let j = i; j < Math.min(450, i + 150); j++) b.set(db.collection('complianceLog').doc('cl_' + j), { siteId: 'st_hild', what: 'done', by: 'x', byName: 'Rec ' + j, at: new Date(t0 + j * 3600e3).toISOString(), detail: {} });
    await b.commit();
  }
  await open(pam, 'compliance.html?site=st_hild', async (pg) => !!(await pg.$('[data-v="history"]')));
  await pam.click('[data-v="history"]');
  await until(async () => /Showing the latest/.test(await text(pam, '#history')));
  const recs = async () => pam.$$eval('#history .rec', r => r.length);
  ok('4. COMPLIANCE HISTORY: the latest 200, and it says there are more', (await recs()) === 200 && /Showing the latest 200 of 450/.test(await text(pam, '#history')), await text(pam, '#histMore'));
  await pam.click('#histNext'); await until(async () => (await recs()) === 400);
  ok('   "Show 200 older" shows 400', (await recs()) === 400 && /Show 50 older/.test(await text(pam, '#histMore')), await text(pam, '#histMore'));
  await pam.click('#histNext'); await until(async () => (await recs()) === 450);
  ok('   then all 450, the oldest last, and no more button', (await recs()) === 450 && !(await pam.$('#histNext')) && /^Check done · Rec 0 /.test(await pam.$eval('#history .rec:last-of-type', e => e.innerText.replace(/\s+/g, ' '))), await text(pam, '#history'));

  /* ---------- 5. the fire roll call, by building ---------- */
  const settledHs = async (pg) => !!(await pg.$('#hsFire')) || !!(await pg.$('#hsRefused'));
  await open(pam, 'hs-settings.html', settledHs);
  const scopes = await pam.$$eval('#hsFire [data-fire] h3', h => h.map(x => x.textContent));
  ok('5. THE FIRE ROLL CALL IN HEALTH AND SAFETY SETTINGS: every building, then each of the four', scopes.length === 5 && /Every building/.test(scopes[0]) && /St Hild/.test(scopes.join('|')), J(scopes));
  await pam.select('#fireAdd_st_hild', 'm_fran');
  await until(async () => !!(await pam.$('[data-fire="st_hild"] [data-who="m_fran"]')));
  await pam.select('[data-fire="st_hild"] [data-who="m_fran"] .fireRole', 'steward');
  await pam.select('#fireAdd_all', 'm_percy');
  await until(async () => !!(await pam.$('[data-fire="all"] [data-who="m_percy"]')));
  ok('   it says "Not saved yet."', /Not saved yet/.test(await text(pam, '#hsMsg')));
  await pam.click('#hsSave');
  const hild = await until(async () => { const s = await db.collection('fireRollCall').doc('st_hild').get(); return s.exists ? s.data() : null; });
  const all = (await db.collection('fireRollCall').doc('all').get()).data();
  ok('   THE PARISH OFFICE SAVES ST HILD\'S LIST: Fran, a duty steward, names only', hild && hild.siteId === 'st_hild' && J(hild.memberIds) === J(['m_fran']) && J(hild.stewards) === J(['m_fran']) && J(Object.keys(hild.people[0]).sort()) === J(['memberId', 'name', 'role']), J(hild));
  ok('   and every building\'s: Percy', all && all.siteId === '' && J(all.memberIds) === J(['m_percy']), J(all));
  ok('   the other buildings\' lists are not written', !(await db.collection('fireRollCall').doc('st_aidan').get()).exists);
  const fran = await who('fran');
  const readAs = (pg, id) => pg.evaluate((id) => EGBCAuth.db.collection('fireRollCall').doc(id).get().then(() => 'ok', (e) => e.code), id);
  ok('   Fran reads St Hild\'s list', (await readAs(fran, 'st_hild')) === 'ok');
  ok('     not every building\'s', (await readAs(fran, 'all')) === 'permission-denied');
  await open(olive, 'hs-settings.html', settledHs);
  ok('   a team called "Church office" may not set it (the page)', !!(await olive.$('#hsRefused')) && !(await olive.$('#hsFire')));
  const olWrite = await olive.evaluate(() => EGBCAuth.db.collection('fireRollCall').doc('st_aidan').set({ siteId: 'st_aidan', people: [], memberIds: [], stewards: [], updatedBy: EGBCAuth.user().uid, updatedByName: 'x', updatedAt: 'x' }).then(() => 'ok', (e) => e.code));
  ok('     nor (the rules)', olWrite === 'permission-denied', olWrite);
  const five = Array.from({ length: 500 }, (_, i) => ({ memberId: 'm_f' + i, name: 'Warden ' + i + ' (invented)', role: 'warden' }));
  await db.collection('fireRollCall').doc('parish_hall').set({ siteId: 'parish_hall', people: five, memberIds: five.map(p => p.memberId), stewards: [], updatedBy: 'x', updatedByName: 'x', updatedAt: 'x' });
  await open(pam, 'hs-settings.html', settledHs);
  const full = await text(pam, '[data-fire="parish_hall"] [data-full]');
  ok('   A FULL LIST SAYS SO: 500 people, the most one building\'s list holds; no "Add someone"', /This list is full: 500 people/.test(full) && !(await pam.$('#fireAdd_parish_hall')), full);
  ok('     the other lists can still add', !!(await pam.$('#fireAdd_st_aidan')));
  await pam.setViewport({ width: 375, height: 800 });
  await open(pam, 'hs-settings.html', settledHs);
  const wide = await pam.evaluate(() => document.documentElement.scrollWidth);
  ok('   at phone width (375) nothing is wider than the screen', wide <= 375, wide);
  await pam.setViewport({ width: 1100, height: 900 });

  /* ---------- 6. the old single list, moved ---------- */
  for (const d of (await db.collection('fireRollCall').get()).docs) await d.ref.delete();
  await db.collection('fireRollCall').doc('main').set({ people: [{ memberId: 'm_a', name: 'Ann (invented)', siteId: '' }, { memberId: 'm_b', name: 'Bob (invented)', siteId: 'st_hild', role: 'steward' }, { memberId: 'm_c', name: 'Cy (invented)', siteId: 'gone_site' }],
    memberIds: ['m_a', 'm_b', 'm_c'], allSites: ['m_a'], bySite: { st_hild: ['m_b'], gone_site: ['m_c'] }, stewards: ['m_b'], updatedBy: 'u_x', updatedByName: 'Old saver (invented)', updatedAt: 'x' });
  const legacy = await PEEPS.rollCallOf(db);
  ok('6. BEFORE THE MOVE, the evacuation plans\' function still reads the old list', J(legacy.all) === J(['m_a']) && J(legacy.per.st_hild) === J(['m_b']) && J(legacy.stewards) === J(['m_b']), J(legacy));
  const tool = (args) => execFileSync(process.execPath, [path.join(V2, 'tools', 'migrate-fire-rollcall.mjs'), ...args], { cwd: V2, encoding: 'utf8', env: process.env });
  const dry = tool(['--project', PROJECT]);
  ok('   THE MOVE, A DRY RUN: it lists what it would write, and writes nothing', /WOULD CHANGE/.test(dry) && /2 records to write/.test(dry) && (await db.collection('fireRollCall').get()).size === 1, dry);
  ok('     a building no longer in Places is for a person', /FOR A PERSON: building gone_site/.test(dry), dry);
  const wet = tool(['--project', PROJECT, '--write']);
  const a2 = (await db.collection('fireRollCall').doc('all').get()).data(), h2 = (await db.collection('fireRollCall').doc('st_hild').get()).data();
  ok('   WITH --write: every building\'s list and St Hild\'s, in the page\'s own shape', /Done: 2 written/.test(wet) && J(a2.memberIds) === J(['m_a']) && a2.siteId === '' && J(h2.stewards) === J(['m_b']) && h2.siteId === 'st_hild', wet + J(a2) + J(h2));
  ok('     the old list is left where it is', (await db.collection('fireRollCall').doc('main').get()).exists);
  ok('     run again, it leaves them alone', /0 records to write, 2 already there/.test(tool(['--project', PROJECT])));
  await db.collection('fireRollCall').doc('st_hild').set({ ...h2, memberIds: ['m_z'], people: [{ memberId: 'm_z', name: 'Zed', role: 'warden' }], stewards: [] });
  const after = await PEEPS.rollCallOf(db);
  ok('   AFTER THE MOVE, the function reads the new lists, not the old one', J(after.all) === J(['m_a']) && J(after.per.st_hild) === J(['m_z']) && J(after.stewards) === J([]), J(after));

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
