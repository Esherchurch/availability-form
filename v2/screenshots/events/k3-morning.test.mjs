/* Chunk 6, stage 3 — the morning: the fire roll-call for everyone leading
   it, the rota's Session Leader, consent renewal at the desk, registers,
   new families to welcome, allergies in the room, and "not set up yet".
   Events window. Invented children and parents only, events emulators only,
   network guard, no email leaves the machine.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/k3-morning.test.mjs"

   What it proves:
     0. with no site in Places, a master admin is told the steps (with
        links) and anyone else to ask the office; with a site but no
        children's team, the master admin is taken to Settings
     1. a lead opening the desk on a group's day opens the morning, naming
        the rota's Session Leader
     2. consent run out: the child still comes in, and the parent is shown a
        QR code for the form (and emailed it)
     3. the fire roll-call: the leader of Little ones sees every child
        checked in (name, group, time) and no medical details; their group
        screen lists the allergies in the room
     4. the Session Leader sees every group and, for children checked in,
        their medical details; nothing else; and nothing once the morning
        closes
     5. registers by group for chosen weeks, downloaded (and logged)
     6. new families to welcome */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, collection, query, where, Timestamp } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-k3-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const DAY = ymd(new Date()), UTCDAY = new Date().toISOString().slice(0, 10);
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const WEEKDAY = new Date().getDay() || 7;

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

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  karen: { email: 'karen.admin@example.invalid', name: 'Karen Admin', mid: 'm_karen', admin: true, teams: ['Core Team'] },
  samy:  { email: 'samy.lead@example.invalid', name: 'Samy Lead', mid: 'm_samy', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  lou:   { email: 'lou.little@example.invalid', name: 'Lou Little', mid: 'm_lou', teams: ['Kids Church'] },
  jo:    { email: 'jo.junior@example.invalid', name: 'Jo Junior', mid: 'm_jo', teams: ['Kids Church'] },
  sam:   { email: 'sam.session@example.invalid', name: 'Sam Session', mid: 'm_sam', teams: ['Kids Church'] },
  nat:   { email: 'nat.helper@example.invalid', name: 'Nat Helper', mid: 'm_nat', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});
/* The rest of the church, added after step 0. */
const FAMILY = (id, o) => ({ siteId: 'site_t', parentName: o.parent, phone: o.phone, email: o.email, emergency: '', collectors: [o.parent], familyCode: o.code, responseIds: [], ...(o.extra || {}) });
const KID = (fam, name, groupId, o) => ({ siteId: 'site_t', familyId: fam.id, name, dob: '', year: '', groupId, groupFixed: false, status: o.status || 'registered', flags: o.flags,
  consentUntil: o.consentUntil || '2099-08-31', photo: true, firstaid: true, parentName: fam.parent, phone: fam.phone, email: fam.email, emergency: '', collectors: [fam.parent], familyCode: fam.code });
async function seedChurch() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'forms', 'form_kids_site_t'), { title: 'Children\u2019s registration', purpose: 'To keep your children safe.', siteId: 'site_t', team: 'Kids Church',
      template: 'parent', kind: 'consent', version: 1, fields: [], validity: { mode: 'schoolyear' }, retentionMonths: 12 });
    await setDoc(doc(db, 'kidsSettings', 'site_t'), { teams: ['Kids Church'], formId: 'form_kids_site_t', formTitle: 'Children\u2019s registration' });
    await setDoc(doc(db, 'kidsGroups', 'kg_little'), { siteId: 'site_t', name: 'Little ones', years: ['Reception', 'Year 1', 'Year 2'], roomId: '', ratio: 4, day: WEEKDAY, start: '10:30', end: '12:00', active: true, order: 1, leaderIds: ['m_lou'] });
    await setDoc(doc(db, 'kidsGroups', 'kg_junior'), { siteId: 'site_t', name: 'Juniors', years: ['Year 3', 'Year 4', 'Year 5', 'Year 6'], roomId: '', ratio: 8, day: WEEKDAY, start: '10:30', end: '12:00', active: true, order: 2, leaderIds: ['m_jo'] });
    const f1 = { id: 'fam_1', parent: 'Parent Synthetic', phone: '07700 900111', email: 'parent@example.invalid', code: 'ABC234' };
    const fv = { id: 'fam_v', parent: 'Val Visitor', phone: '07700 900444', email: 'val@example.invalid', code: 'VVV234' };
    await setDoc(doc(db, 'kidsFamilies', 'fam_1'), FAMILY('fam_1', f1));
    await setDoc(doc(db, 'kidsFamilies', 'fam_v'), FAMILY('fam_v', { ...fv, extra: { visitor: true, firstVisit: back(3) } }));
    await setDoc(doc(db, 'kidsChildren', 'kc_ada'), KID(f1, 'Ada Synthetic', 'kg_little', { flags: { allergies: true, medical: false } }));
    await setDoc(doc(db, 'kidsChildren', 'kc_ben'), KID(f1, 'Ben Synthetic', 'kg_junior', { flags: { allergies: false, medical: true } }));
    await setDoc(doc(db, 'kidsChildren', 'kc_eve'), KID(f1, 'Eve Synthetic', 'kg_little', { flags: { allergies: false, medical: false } }));
    await setDoc(doc(db, 'kidsChildren', 'kc_vic'), KID(fv, 'Vic Visitor', 'kg_little', { status: 'visitor', consentUntil: back(3), flags: { allergies: true, medical: false } }));
    await setDoc(doc(db, 'kidsMedical', 'kc_ada'), { siteId: 'site_t', groupId: 'kg_little', allergies: 'Peanuts: carries an EpiPen', medical: '', medication: 'EpiPen', needs: '', responseId: '' });
    await setDoc(doc(db, 'kidsMedical', 'kc_ben'), { siteId: 'site_t', groupId: 'kg_junior', allergies: 'None', medical: 'Asthma (invented)', medication: 'Inhaler', needs: '', responseId: '' });
    await setDoc(doc(db, 'kidsMedical', 'kc_eve'), { siteId: 'site_t', groupId: 'kg_little', allergies: 'None', medical: 'Eve private (invented)', medication: '', needs: '', responseId: '' });
    await setDoc(doc(db, 'kidsMedical', 'kc_vic'), { siteId: 'site_t', groupId: 'kg_little', allergies: 'Dairy (invented)', medical: '', medication: '', needs: '', responseId: '' });
    /* The rota: Sam is today's Session Leader. */
    await setDoc(doc(db, 'events', 'rota_today'), { date: UTCDAY, roles: ['Session Leader'], assignments: { 'Session Leader': { id: 'm_sam', name: 'Sam Session' } } });
    /* Two weeks ago, Ada and Eve came (for the register). */
    for (const [kid, name] of [['kc_ada', 'Ada Synthetic'], ['kc_eve', 'Eve Synthetic']]) {
      const d = back(14), id = 'kids_kg_little_' + d + '__' + kid + '__0';
      await setDoc(doc(db, 'checkins', id), { calEventId: 'kids_kg_little_' + d, signupKey: kid, attendeeIndex: 0, name, kind: 'child', state: 'out', inAt: 'x', inBy: 'x', inByName: 'x',
        outAt: 'y', outBy: 'y', outByName: 'y', collectedBy: 'Parent Synthetic', collectorListed: true, codeGiven: '', roomId: '', day: d, updatedAt: 'y', groupId: 'kg_little', siteId: 'site_t', familyId: 'fam_1', pickupCode: 'OLDC' });
    }
  });
}
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const J = (x) => JSON.stringify(x);

const errors = [], PAGES = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); return b;
}
async function pageOf(b, label, width) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  PAGES.push([label, p]);
  return p;
}
async function as(who, width) {
  const b = await launch(who), p = await pageOf(b, who, width);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p; return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const check = (p, sel, on) => p.$eval(sel, (e, on) => { if (e.checked !== on) e.click(); }, on);
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const hideBanner = (p) => p.evaluate(() => { const b = document.querySelector('.firebase-emulator-warning'); if (b) b.style.display = 'none'; });

try {
  /* ---------- 0. not set up yet ---------- */
  const kB = await as('karen'); const KA = kB.page;
  const nB = await as('nat'); const N = nB.page;
  await go(KA, 'kids-admin.html', '#notsetup');
  ok('0. no site yet: a master admin is told the two steps, with a link to Places', /Not set up yet/.test(await text(KA, '#notsetup')) && (await KA.$eval('#ns-places', a => a.getAttribute('href'))) === 'places-admin.html'
    && (await KA.$eval('#ns-settings', a => a.getAttribute('href'))) === 'kids-admin.html?tab=settings', await text(KA, '#notsetup'));
  await hideBanner(KA);
  await KA.setViewport({ width: 375, height: 800 });
  await KA.screenshot({ path: path.join(HERE, 'k3-not-set-up-375.png'), fullPage: true });
  await KA.setViewport({ width: 1100, height: 900 });
  await go(N, 'kids-admin.html', '#notsetup');
  ok('   someone who is not an admin is told to ask the office', /Please ask the church office/.test(await text(N, '#notsetup')) && !(await N.$('#ns-places')));
  await go(KA, 'kids-checkin.html', '#notsetup');
  await go(N, 'kids-checkin.html', '#notsetup');
  ok('   the same on Sunday check-in', !!(await KA.$('#ns-places')) && /ask the church office/.test(await text(N, '#notsetup')));
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
    await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
  });
  await go(KA, 'kids-admin.html', '#notsetup-team');
  ok('   a site, but no children\'s team: the master admin is taken to Settings to choose it', /choose the children's team on Settings/.test(await text(KA, '#notsetup-team')) && !!(await KA.$('.s-team')));
  await go(KA, 'kids-checkin.html', '#notsetup');
  ok('   and Sunday check-in shows the first step done', /Places: add the site .*\(done\)/.test(await text(KA, '#notsetup')), await text(KA, '#notsetup'));
  await kB.close(); await seedChurch();

  /* ---------- 1. the morning opens ---------- */
  const sB = await as('samy'); const S = sB.page;
  await go(S, 'kids-checkin.html', '#morning-note');
  const morning = await until(() => get('kidsMornings', 'site_t_' + UTCDAY));
  ok('1. the desk opens the morning, with the rota\'s Session Leader', morning && J(morning.sessionLeaderIds) === J(['m_sam']) && J(morning.leaderIds.sort()) === J(['m_jo', 'm_lou']) && morning.rotaId === 'rota_today', J(morning));
  ok('   and says so', /Session Leader Sam Session \(from the rota\)/.test(await text(S, '#morning-note')), await text(S, '#morning-note'));
  await val(S, '#d-q', '900111');
  await S.waitForSelector('[data-fam="fam_1"]');
  await check(S, '[data-fam="fam_1"] .d-tick[value="kc_eve"]', false);
  await tap(S, '[data-checkin="fam_1"]');
  await until(async () => (await get('kidsRoll', 'kids_kg_junior_' + DAY + '__kc_ben__0')));
  const roll = await get('kidsRoll', 'kids_kg_little_' + DAY + '__kc_ada__0');
  ok('   each check-in has its roll-call copy: name, group and time only', roll && roll.name === 'Ada Synthetic' && roll.groupName === 'Little ones' && roll.state === 'in'
    && !('pickupCode' in roll) && !('familyId' in roll) && !Object.keys(roll).some(k => /phone|allerg|medic/i.test(k)), J(roll));

  /* ---------- 2. consent run out ---------- */
  await val(S, '#d-q', 'Val');
  await S.waitForSelector('[data-renew="fam_v"]');
  ok('2. Vic\'s consent has run out: shown in red, and Vic can still be ticked in', /Consent ran out/.test(await text(S, '[data-fam="fam_v"]')) && !!(await S.$('[data-fam="fam_v"] .d-tick:checked')));
  await S.evaluate(() => { window.__egbcOutbox.length = 0; });
  await tap(S, '[data-renew="fam_v"]');
  await S.waitForSelector('#renew-qr svg');
  const rq = await until(async () => (await readDb(db => getDocs(query(collection(db, 'formRequests'), where('email', '==', 'val@example.invalid'))))).docs.map(d => ({ key: d.id, ...d.data() }))[0]);
  ok('   the parent is shown a QR code for the registration form', !!rq && rq.formId === 'form_kids_site_t' && J(rq.subjects) === J(['Vic Visitor']));
  const mail = await until(async () => { const o = await outbox(S); return o.length ? o : null; });
  ok('   and the same link is emailed (to the outbox only)', mail && mail[0].to[0] === 'val@example.invalid' && JSON.stringify(mail[0]).includes(rq.key));
  await hideBanner(S);
  await S.setViewport({ width: 375, height: 900 });
  await S.screenshot({ path: path.join(HERE, 'k3-renew-qr-375.png') });
  await S.setViewport({ width: 1100, height: 900 });
  await tap(S, '#m-done');
  await tap(S, '[data-checkin="fam_v"]');
  ok('   Vic is checked in all the same', !!(await until(() => get('checkins', 'kids_kg_little_' + DAY + '__kc_vic__0'))));

  /* ---------- 3. the fire roll-call, for a group leader ---------- */
  const lB = await as('lou', 375); const L = lB.page;
  await go(L, 'kids-checkin.html', '#g-ins');
  await L.waitForSelector('#g-allergies');
  const alg = await text(L, '#g-allergies');
  ok('3. Little ones\' screen lists the allergies in the room now (Ada, Vic), not Eve who has not come', /Ada Synthetic: Allergies: Peanuts: carries an EpiPen; Medication: EpiPen/.test(alg) && /Vic Visitor: Allergies: Dairy/.test(alg) && !/Eve/.test(alg), alg);
  await tap(L, '[data-tab="roll"]');
  await until(async () => /3/.test(await L.$eval('#roll-total', e => e.textContent)));
  const lr = await text(L, '#roll');
  ok('   FIRE ROLL-CALL: the leader of Little ones sees every child in, Ben the Junior too: name, group, time', /Little ones Ada Synthetic in since .* Vic Visitor in since/.test(lr) && /Juniors Ben Synthetic in since/.test(lr), lr);
  ok('   and no medical details, no phone numbers, nothing to open', !(await L.$('[data-rmed]')) && !/Asthma|07700|EpiPen/.test(lr));
  const lsneak = await L.evaluate(() => Promise.all([EGBCAuth.db.collection('kidsMedical').doc('kc_ben').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('kidsChildren').doc('kc_ben').get().then(() => 'read', e => e.code)]));
  ok('   round the page too: not Ben\'s medical details, nor his record', lsneak.every(x => /permission/.test(x)), J(lsneak));
  await hideBanner(L);
  await L.screenshot({ path: path.join(HERE, 'k3-rollcall-375.png'), fullPage: true });

  /* ---------- 4. the Session Leader ---------- */
  const mB = await as('sam', 375); const M = mB.page;
  await go(M, 'kids-checkin.html', '#roll');
  ok('4. the Session Leader (on no group) sees the roll-call', J(await M.$$eval('[data-tab]', b => b.map(x => x.textContent))) === J(['Roll-call']));
  await until(async () => /3/.test(await M.$eval('#roll-total', e => e.textContent)));
  await tap(M, '[data-rmed="kc_ben"]');
  await M.waitForSelector('[data-med="kc_ben"]');
  ok('   THE SESSION LEADER SEES THE MEDICAL DETAILS OF A CHILD IN THIS MORNING, in any group', /Asthma \(invented\)/.test(await text(M, '[data-med="kc_ben"]')) && /this morning only/.test(await text(M, '#modal')));
  const msneak = await M.evaluate(() => Promise.all([EGBCAuth.db.collection('kidsMedical').doc('kc_eve').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('kidsChildren').doc('kc_ben').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('checkins').doc('kids_kg_junior_' + EGBCCheckin.today() + '__kc_ben__0').get().then(() => 'read', e => e.code)]));
  ok('   but not Eve\'s, who has not come; nor anyone\'s record or check-in', msneak.every(x => /permission/.test(x)), J(msneak));
  await go(N, 'kids-checkin.html', '#noaccess');
  ok('   someone on Kids Church not leading this morning sees nothing', !!(await N.$('#noaccess')));
  await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'kidsMornings', 'site_t_' + UTCDAY), { expiresAt: Timestamp.fromMillis(Date.now() - 60000) }); });
  const after = await M.evaluate(() => EGBCAuth.db.collection('kidsMedical').doc('kc_ben').get().then(() => 'read', e => e.code));
  await go(M, 'kids-checkin.html', '#noaccess');
  ok('   WHEN THE MORNING CLOSES: the Session Leader no longer sees the medical details, or the page', /permission/.test(after), after);
  await go(L, 'kids-checkin.html', '#g-ins'); await tap(L, '[data-tab="roll"]');
  await until(async () => /2/.test(await L.$eval('#roll-total', e => e.textContent)));
  ok('   and Little ones\' leader is back to their own group', !/Ben/.test(await text(L, '#roll')) && /own group/.test(await text(L, '#body')));
  await mB.close(); await nB.close();

  /* ---------- 5. registers ---------- */
  await tap(L, '[data-tab="register"]');
  await L.waitForSelector('#reg-period');
  await L.select('#reg-period', 'custom');
  await L.waitForSelector('#reg-from');
  await val(L, '#reg-from', back(14));
  const first = +back(14).slice(8, 10) + '/' + +back(14).slice(5, 7);
  await until(() => L.$eval('#reg-table th:nth-child(2)', (e, f) => e.textContent === f, first));
  const grid = await L.$$eval('#reg-table tr', rows => rows.map(r => [...r.children].map(c => c.textContent.trim()).join('|')));
  ok('5. a group leader\'s register for their group: three weeks, who came, and the totals',
    grid.length === 5 && grid[1] === 'Ada Synthetic|✓||✓|2' && grid[2] === 'Eve Synthetic|✓|||1' && grid[3] === 'Vic Visitor|||✓|1' && grid[4] === 'Children|2|0|2|', J(grid));
  await tap(L, '#reg-csv');
  const logged = await until(async () => (await readDb(db => getDocs(query(collection(db, 'downloadsLog'), where('by', '==', P.lou.uid))))).docs.map(d => d.data())[0]);
  ok('   downloaded, and the download logged in their name', logged && /Register: Little ones/.test(logged.what) && logged.sensitive === false, J(logged));
  await lB.close();
  await tap(S, '[data-tab="register"]');
  await S.waitForSelector('#reg-table');
  ok('   a lead sees every group\'s register', J(await S.$$eval('#reg-group option', o => o.map(x => x.textContent))) === J(['Little ones', 'Juniors']));

  /* ---------- 6. new families to welcome ---------- */
  await tap(S, '[data-tab="visitors"]');
  await S.waitForSelector('[data-vfam="fam_v"]');
  ok('6. new families this week: Val, with Vic, the form not back yet', /Val Visitor .*Vic Visitor \(Little ones\).*07700 900444.*Full form not back yet/.test(await text(S, '[data-vfam="fam_v"]')) && !(await S.$('[data-vfam="fam_1"]')));
  await tap(S, '[data-welcome="fam_v"]');
  const w = await until(async () => { const f = await get('kidsFamilies', 'fam_v'); return f.welcomedAt ? f : null; });
  ok('   "we have said hello" is noted, with who', w && w.welcomedBy === P.samy.uid);
  await S.waitForSelector('[data-vfam="fam_v"] .pill.ok');
  ok('   and shown', /Welcomed by Samy Lead/.test(await text(S, '[data-vfam="fam_v"]')));
  await hideBanner(S);
  await S.setViewport({ width: 375, height: 900 });
  await S.screenshot({ path: path.join(HERE, 'k3-visitors-375.png'), fullPage: true });
  await sB.close();
} catch (e) {
  ok('the run finished', false, e.stack);
  for (const [l, p] of PAGES) { try { console.log('     [' + l + '] ' + p.url() + ' :: ' + (await p.$eval('body', b => b.innerText)).replace(/\s+/g, ' ').slice(0, 600)); } catch (x) {} }
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
