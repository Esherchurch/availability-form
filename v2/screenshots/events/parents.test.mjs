/* Parents' Sunday (F-121; Martin, A-K1 and N-6): "This Sunday, for
   parents" on Home - the family's code on the parent's own phone, who is
   in, and the collection code - through myFamilyThisSunday(), on the real
   shell's page (screenshots/events/app-harness.html).
   Events window. Invented families only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/parents.test.mjs"

   What it proves:
     1. a parent signed in with the email on the registration form sees
        their family: the code and its QR to show at the door, and their
        children due
     2. the code on the phone is the one the door's scanner reads
     3. once checked in: who is in, in which group, and the collection code
     4. the second parent sees the same (N-6c); a parent not in the address
        book still does (§21)
     5. NOBODY ELSE: not another parent, not a sign-in whose email is not
        verified, and never another family's collection code */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-par-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const DAY = ymd(new Date());

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

/* Pat registered the children; Sam is the second parent and is not in the
   address book; Una registered her own family but never verified the email
   she signs in with (sign-in emails are unique, so it can only be hers);
   Olly is another family's parent. */
const P = {
  pat:  { email: 'Pat.Parent@example.invalid', name: 'Pat Parent', mid: 'm_pat', verified: true, book: true },
  sam:  { email: 'sam.carer@example.invalid', name: 'Sam Carer', verified: true, book: false },
  una:  { email: 'una.unverified@example.invalid', name: 'Una Unverified', verified: false, book: false },
  olly: { email: 'olly.other@example.invalid', name: 'Olly Other', mid: 'm_olly', verified: true, book: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  if (P[k].verified) await fetch(`http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: P[k].uid, emailVerified: true }) });
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k]; if (!x.book) continue;
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email.toLowerCase(), markers: [], adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email.toLowerCase(), teams: [], adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'kidsGroups', 'kg_little'), { siteId: 'site_t', name: 'Little ones', years: ['Year 1'], ratio: 5, leaderIds: ['m_lou'], active: true, order: 1 });
  await setDoc(doc(db, 'kidsGroups', 'kg_junior'), { siteId: 'site_t', name: 'Juniors', years: ['Year 4'], ratio: 8, leaderIds: ['m_jo'], active: true, order: 2 });
  await setDoc(doc(db, 'kidsFamilies', 'fam_p'), { siteId: 'site_t', parentName: 'Pat Parent', email: 'pat.parent@example.invalid', email2: 'sam.carer@example.invalid', phone: '07700 900111',
    familyCode: 'ABC234', collectors: ['Pat Parent', 'Sam Carer'] });
  await setDoc(doc(db, 'kidsFamilies', 'fam_u'), { siteId: 'site_t', parentName: 'Una Unverified', email: 'una.unverified@example.invalid', familyCode: 'UUU234', collectors: [] });
  await setDoc(doc(db, 'kidsFamilies', 'fam_o'), { siteId: 'site_t', parentName: 'Olly Other', email: 'olly.other@example.invalid', familyCode: 'XYZ789', collectors: ['Olly Other'] });
  const KID = (id, fam, name, groupId, extra) => setDoc(doc(db, 'kidsChildren', id), { siteId: 'site_t', familyId: fam, name, groupId, status: 'registered', ...(extra || {}) });
  await KID('kc_ada', 'fam_p', 'Ada Synthetic', 'kg_little'); await KID('kc_ben', 'fam_p', 'Ben Synthetic', 'kg_junior');
  await KID('kc_old', 'fam_p', 'Cal Synthetic', 'kg_junior', { status: 'left' });
  await KID('kc_otto', 'fam_o', 'Otto Synthetic', 'kg_little');
  await setDoc(doc(db, 'kidsMedical', 'kc_ada'), { siteId: 'site_t', groupId: 'kg_little', allergies: 'Peanuts (invented)' });
});
const CK = (kid, name, groupId, fam, code) => ({ calEventId: 'kids_' + groupId + '_' + DAY, signupKey: kid, attendeeIndex: 0, name, kind: 'child', state: 'in', inAt: new Date().toISOString(),
  inBy: 'x', inByName: 'Desk', roomId: '', day: DAY, updatedAt: 'x', groupId, siteId: 'site_t', familyId: fam, pickupCode: code });

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 390, height: 844 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await p.goto(URLB + 'screenshots/events/app-harness.html', { waitUntil: 'networkidle2' });
  await until(() => p.evaluate(() => !!(window.EGBCAuth && EGBCAuth.user && EGBCAuth.user() && window.EGBCEventsHome)));
  return p;
}
const family = (p) => p.evaluate(() => EGBCEventsHome.myFamilyThisSunday().then(l => JSON.parse(JSON.stringify(l)), e => ({ error: e.code || e.message })));

try {
  /* 1. before arriving */
  const Pat = await as('pat');
  const f1 = await family(Pat);
  const fam = Array.isArray(f1) && f1[0];
  ok('1. PAT SEES HER OWN FAMILY: the family code, its QR to show at the door, both children due', f1.length === 1 && fam.familyCode === 'ABC234' && /^<svg/.test(fam.qrSvg)
    && J(fam.children.map(c => [c.name, c.group, c.state])) === J([['Ada Synthetic', 'Little ones', 'due'], ['Ben Synthetic', 'Juniors', 'due']]) && fam.collectionCode === '', J(f1).slice(0, 400));
  ok('   a child who has left the register is not shown', !J(f1).includes('Cal Synthetic'));
  ok('   NOTHING MEDICAL comes with it', !/Peanut|allerg/i.test(J(f1)));
  /* 2. the door reads it */
  const scanned = await Pat.evaluate((t) => EGBCKids.parseFamilyQR(t), fam.qrText);
  ok('2. THE CODE ON THE PHONE IS THE ONE THE DOOR\'S SCANNER READS', scanned === 'ABC234', scanned);
  /* 3. checked in at the door */
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'checkins', 'ck_ada'), CK('kc_ada', 'Ada Synthetic', 'kg_little', 'fam_p', 'K7P2'));
    await setDoc(doc(ctx.firestore(), 'checkins', 'ck_otto'), CK('kc_otto', 'Otto Synthetic', 'kg_little', 'fam_o', 'Q9R3'));
  });
  const f3 = (await family(Pat))[0];
  ok('3. ONCE IN: Ada in Little ones, Ben still due, and the collection code K7P2', f3.collectionCode === 'K7P2' && f3.inCount === 1
    && J(f3.children.map(c => [c.name, c.state])) === J([['Ada Synthetic', 'in'], ['Ben Synthetic', 'due']]), J(f3).slice(0, 400));
  ok('   NEVER ANOTHER FAMILY\'S CODE', !J(f3).includes('Q9R3') && !J(f3).includes('Otto'));
  /* 4. the second parent, not in the address book */
  const Sam = await as('sam');
  const fs4 = await family(Sam);
  ok('4. THE SECOND PARENT SEES THE SAME, though not in the address book (N-6c, §21)', fs4.length === 1 && fs4[0].familyCode === 'ABC234' && fs4[0].collectionCode === 'K7P2', J(fs4).slice(0, 300));
  /* 5. nobody else */
  const Una = await as('una');
  const f5 = await family(Una);
  ok('5. A SIGN-IN WHOSE EMAIL IS NOT VERIFIED SEES NOTHING, not even her own family',Array.isArray(f5) && f5.length === 0, J(f5));
  const sneak = await Una.evaluate(() => EGBCAuth.db.collection('kidsFamilies').where('email', '==', 'una.unverified@example.invalid').get().then(s => 'read ' + s.size, e => e.code));
  ok('   and the rules refuse her, whatever the page does', sneak === 'permission-denied', sneak);
  const Olly = await as('olly');
  const fo = await family(Olly);
  ok('   another parent sees only their own family', fo.length === 1 && fo[0].familyCode === 'XYZ789' && !J(fo).includes('ABC234') && !J(fo).includes('Ada'), J(fo).slice(0, 300));
  const peek = await Olly.evaluate(() => EGBCAuth.db.collection('checkins').doc('ck_ada').get().then(() => 'read', e => e.code));
  ok('   and cannot read Pat\'s collection code', peek === 'permission-denied', peek);

  ok('errors on the pages', errors.length === 0, errors.join(' | '));
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
