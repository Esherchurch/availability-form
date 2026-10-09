/* F-098 (Martin) — the rota's Session Leader opens the morning; "Show on
   screen" pages a parent through ChurchShow (the contract in F-100); "Done"
   and the five-minute clear; term dates as a setting, used by the registers.
   Events window. Invented children and parents only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/f098-screen.test.mjs" */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-f98-'));
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
  nat:   { email: 'nat.helper@example.invalid', name: 'Nat Helper', mid: 'm_nat', teams: ['Kids Church'] },
  ava:   { email: 'ava.av@example.invalid', name: 'Ava Projection', mid: 'm_ava', teams: ['AV Team'], adminFor: ['AV Team'] }
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

const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
    await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
    await setDoc(doc(db, 'rooms', 'room_little'), { siteId: 'site_t', name: 'Test Little Room', kind: 'room', active: true, order: 1 });
  });
  await seedChurch();
  await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'kidsGroups', 'kg_little'), { roomId: 'room_little' }); });

  /* ---------- 1. the Session Leader opens the morning ---------- */
  const mB = await as('sam'); const M = mB.page;
  await go(M, 'kids-checkin.html', '#roll');
  const morning = await until(() => get('kidsMornings', 'site_t_' + UTCDAY));
  ok('1. THE ROTA\'S SESSION LEADER OPENS THE MORNING, before any lead has come', morning && morning.updatedBy === P.sam.uid && J(morning.sessionLeaderIds) === J(['m_sam']) && J(morning.leaderIds.sort()) === J(['m_jo', 'm_lou']), J(morning));
  ok('   and sees the roll-call', J(await M.$$eval('[data-tab]', b => b.map(x => x.textContent))) === J(['Roll-call']));
  const nB = await as('nat'); const N = nB.page;
  const natTry = await N.evaluate((d) => EGBCAuth.db.collection('kidsMornings').doc('site_t_' + d).set({ siteId: 'site_t', day: d, rotaId: 'rota_today', leaderIds: [], sessionLeaderIds: ['m_nat'],
    expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 3600000), updatedAt: 'x', updatedBy: 'x' }).then(() => 'opened', e => e.code), UTCDAY);
  ok('   someone not on the rota as Session Leader cannot', /permission/.test(natTry), natTry);
  await nB.close();

  /* a lead checks Ada in */
  const sB = await as('samy'); const S = sB.page;
  await go(S, 'kids-checkin.html', '#d-q');
  await val(S, '#d-q', '900111');
  await S.waitForSelector('[data-fam="fam_1"]');
  await check(S, '[data-fam="fam_1"] .d-tick[value="kc_ben"]', false); await check(S, '[data-fam="fam_1"] .d-tick[value="kc_eve"]', false);
  await tap(S, '[data-checkin="fam_1"]');
  const CKID = 'kids_kg_little_' + DAY + '__kc_ada__0';
  const ada = await until(() => get('checkins', CKID));
  const CODE = ada.pickupCode;

  /* ---------- 2. Show on screen ---------- */
  const lB = await as('lou', 375); const L = lB.page;
  await go(L, 'kids-checkin.html', '[data-more="kc_ada"]');
  await tap(L, '[data-more="kc_ada"]');
  await L.waitForSelector('#m-screen');
  ok('2. "Show on screen" sits next to "Page a parent"', J(await L.$$eval('#modal .btn', b => b.map(x => x.textContent).slice(0, 2))) === J(['Page a parent', 'Show on screen']));
  await tap(L, '#m-screen');
  await L.waitForSelector('#on-screen');
  ok('   the leader sees what the screen says', (await text(L, '#on-screen')).includes(CODE + ', please come to Little ones'), await text(L, '#on-screen'));
  const pg = await until(() => get('screenPages', CKID));
  ok('   THE CONTRACT: one document, exactly { siteId, code, room, message, createdBy, createdAt, clearedAt }',
    pg && Object.keys(pg).sort().join(',') === 'clearedAt,code,createdAt,createdBy,message,room,siteId' && pg.siteId === 'site_t' && pg.code === CODE && pg.room === 'Test Little Room'
    && pg.message === CODE + ', please come to Little ones' && pg.createdBy === P.lou.uid && pg.clearedAt === null && typeof pg.createdAt.toMillis === 'function', J(pg));
  ok('   THE CODE ONLY, NEVER THE CHILD\'S NAME', !/Ada|Synthetic/.test(J(pg)));
  await hideBanner(L);
  await L.screenshot({ path: path.join(HERE, 'f098-show-on-screen-375.png') });

  /* ---------- 3. ChurchShow reads it ---------- */
  const aB = await as('ava'); const A = aB.page;
  const churchShow = () => A.evaluate(() => EGBCAuth.db.collection('screenPages').where('siteId', '==', 'site_t').where('clearedAt', '==', null).get()
    .then(s => s.docs.map(d => { const x = d.data(); return { message: x.message, room: x.room, code: x.code, fresh: Date.now() - x.createdAt.toMillis() < 5 * 60000 }; }), e => e.code));
  const shown = await churchShow();
  ok('3. the projection computer (signed in as an AV admin, no children\'s rights) reads it as ChurchShow will', Array.isArray(shown) && shown.length === 1 && shown[0].message === CODE + ', please come to Little ones' && shown[0].fresh, J(shown));
  const avSneak = await A.evaluate((id) => Promise.all([EGBCAuth.db.collection('checkins').doc(id).get().then(() => 'read', e => e.code), EGBCAuth.db.collection('kidsChildren').doc('kc_ada').get().then(() => 'read', e => e.code)]), CKID);
  ok('   and nothing else about the child', avSneak.every(x => /permission/.test(x)), J(avSneak));

  /* ---------- 4. Done ---------- */
  await tap(L, '#m-done');
  const cleared = await until(async () => { const p = await get('screenPages', CKID); return p.clearedAt ? p : null; });
  ok('4. "Done" clears it, at server time', cleared && typeof cleared.clearedAt.toMillis === 'function');
  ok('   and the screen no longer shows it', J(await until(async () => { const x = await churchShow(); return Array.isArray(x) && !x.length ? x : null; })) === '[]');

  /* ---------- 5. it clears itself after five minutes ---------- */
  await tap(L, '[data-more="kc_ada"]'); await L.waitForSelector('#m-screen'); await tap(L, '#m-screen'); await L.waitForSelector('#on-screen');
  await until(async () => { const p = await get('screenPages', CKID); return p && p.clearedAt === null; });
  await tap(L, '#m-close');
  await L.waitForSelector('#g-onscreen');
  ok('5. paged again: the group screen shows what is on the screen, with Done', (await text(L, '#g-onscreen')).includes(CODE + ', please come to Little ones') && !!(await L.$('[data-pdone]')));
  await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'screenPages', CKID), { createdAt: Timestamp.fromMillis(Date.now() - 6 * 60000) }); });
  const auto = await until(async () => { const p = await get('screenPages', CKID); return p.clearedAt ? p : null; }, 45000);
  ok('   six minutes on, nobody pressed Done: the leader\'s screen clears it by itself', !!auto);
  await aB.close();

  /* ---------- 6. term dates ---------- */
  await go(S, 'kids-admin.html?tab=settings', '#t-card');
  const set = [['Test term A', fwd(-30), fwd(30)], ['Test term B', fwd(40), fwd(80)], ['Test term C', fwd(90), fwd(120)]];
  for (let i = 0; i < 3; i++) { await val(S, '#t-name-' + i, set[i][0]); await val(S, '#t-from-' + i, set[i][1]); await val(S, '#t-to-' + i, set[i][2]); }
  await val(S, '#t-to-0', fwd(50)); await tap(S, '#t-save');
  ok('6. overlapping terms are refused on the page', /without overlapping/.test(await text(S, '#t-err')));
  await val(S, '#t-to-0', fwd(30)); await tap(S, '#t-save');
  const terms = await until(async () => { const t = await get('kidsTerms', 'site_t'); return t && t.terms[0].name === 'Test term A' ? t : null; });
  ok('   a lead sets the year\'s three terms', terms && terms.terms.length === 3 && terms.terms[2].to === fwd(120));
  await go(S, 'kids-checkin.html', '[data-tab="register"]'); await tap(S, '[data-tab="register"]');
  await S.waitForSelector('#reg-period');
  ok('   the registers use them', J(await S.$$eval('#reg-period option', o => o.map(x => x.textContent))).includes('This term (Test term A)'), J(await S.$$eval('#reg-period option', o => o.map(x => x.textContent))));
  await lB.close(); await sB.close(); await mB.close();
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
