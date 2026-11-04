/* AN EVENT'S RISK ASSESSMENT, START TO FINISH (the going-live test, Stage 3).
   Events window. Invented people and events only, events emulators only,
   locked rules, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/event-ra.test.mjs"

   What it proves, for "St Aidan's with St Hild, Testbury (synthetic)":
     1. the organiser (on the event's team) makes the assessment: the kind,
        a hazard, an action, every question answered; saved as a draft
     2. signing is refused while a question is unanswered, then the organiser
        signs: that version is the one that stands (its snapshot: signedVersion)
     3. the building's health and safety lead (here a master admin) approves it;
        the organiser cannot approve their own
     4. it prints: the title, the hazard, approved, the version
     5. "Change it" starts version 2 as a draft; the signature goes with it
     6. refusals: someone on no team, a worship volunteer and a Kids Church
        helper are told the page isn't for them, see nothing of it, and the
        database refuses them the record and any write */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-era-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
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

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  kay:  { email: 'kay.organiser@example.invalid', name: 'Kay Organiser (invented)', mid: 'm_kay', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  max:  { email: 'max.master@example.invalid', name: 'Max Master (invented)', mid: 'm_max', teams: ['Core Team'], adminFor: [], master: true },
  eve:  { email: 'eve.everyone@example.invalid', name: 'Eve Everyone (invented)', mid: 'm_eve', teams: [], adminFor: [] },
  will: { email: 'will.worship@example.invalid', name: 'Will Worship (invented)', mid: 'm_will', teams: ['Worship Team'], adminFor: [] },
  hal:  { email: 'hal.helper@example.invalid', name: 'Hal Helper (invented)', mid: 'm_hal', teams: ['Kids Church'], adminFor: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const EID = 'ev_ra', SITE = 'site_ra';
const at = Date.now() + 12 * 86400000;
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const x of Object.values(P)) {
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: "St Aidan's with St Hild, Testbury (synthetic)", enquiryEmail: 'office@example.invalid' });
  await setDoc(doc(db, 'sites', SITE), { name: 'St Hild (synthetic)', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_ra'), { siteId: SITE, name: 'Hild Room (synthetic)', kind: 'room', active: true, order: 1, capacity: 40 });
  await setDoc(doc(db, 'raSiteRoles', SITE), { hsLead: P.max.mid, hsDeputy: '' });
  await setDoc(doc(db, 'calEvents', EID), { title: 'Holiday club (synthetic)', description: 'Synthetic.', category: 'children', visibility: 'members', status: 'confirmed', audience: ['members'],
    startLocal: new Date(at).toISOString().slice(0, 16), endLocal: new Date(at + 3 * 3600000).toISOString().slice(0, 16), startUtc: at, endUtc: at + 3 * 3600000, allDay: false,
    location: { kind: 'room', siteId: SITE, roomIds: ['room_ra'] }, signupOn: false, capacity: 30, createdBy: P.kay.uid, teamMemberIds: [P.kay.mid], teamUids: [P.kay.uid] });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const ra = () => readDb(db => getDoc(doc(db, 'raEvents', EID)).then(s => s.exists() ? s.data() : null));

const errors = [], BROWSERS = [];
async function as(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); BROWSERS.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1280, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const tap = (p, sel) => p.$eval(sel, e => e.click());
const fill = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);

try {
  /* ---------- 1. the organiser makes it ---------- */
  const K = await as('kay');
  await go(K, 'event-ra.html?event=' + EID, '#status');
  ok('1. THE ORGANISER opens a new assessment: a draft, version 1, with the questions to answer', /DRAFT, version 1/.test(await text(K, '#status')) && !!(await K.$('#questions')), await text(K, '#status'));
  await tap(K, '#hzAdd'); await K.waitForSelector('[data-hz] input[id$="what"]');
  await fill(K, '[data-hz] input[id$="what"]', 'Slips on the hall floor (synthetic)');
  const who = await K.$('[data-hz] input[id$="who"]'); if (who) await fill(K, '[data-hz] input[id$="who"]', 'Children and leaders');
  const ctl = await K.$('[data-hz] [id$="ctl"]'); if (ctl) await fill(K, '[data-hz] [id$="ctl"]', 'Mop spills at once');
  await tap(K, '#acAdd'); await K.waitForSelector('[data-ac] input[id$="what"]');
  await fill(K, '[data-ac] input[id$="what"]', 'Buy a wet-floor sign (synthetic)');
  ok('   a hazard and an action are added on the page', (await K.$$('[data-hz]')).length === 1 && (await K.$$('[data-ac]')).length === 1);
  /* signing is refused while a question is open */
  await tap(K, '#saveGo'); await until(async () => /Saved/.test(await text(K, '#said')));
  const blocked = await text(K, '#signBlocked');
  ok('2. NOT SIGNABLE YET: the page says how many questions are still to answer', /Not yet: \d+ question/.test(blocked) && !(await K.$('#signGo')), blocked);
  const careNo = await K.$('input[name="care"][value="no"]'); if (careNo) await careNo.click();
  for (const q of await K.$$eval('input[id^="q_"]', (l) => l.map((e) => e.id))) await fill(K, '#' + q, 'N/A: a synthetic test event');
  await tap(K, '#saveGo'); await until(async () => /Saved/.test(await text(K, '#said')));
  const d1 = await ra();
  ok('1. SAVED AS A DRAFT: the hazard, the action and every answer, in the event\'s own record', d1 && d1.status === 'draft' && (d1.hazards || []).length === 1 && /Slips/.test(d1.hazards[0].hazard)
    && (d1.actions || []).length === 1 && Object.keys(d1.answers || {}).length > 0, J(d1 && { s: d1.status, h: (d1.hazards || []).length, a: Object.keys(d1.answers || {}).length }));
  await K.waitForSelector('#signGo', { timeout: 15000 });
  await tap(K, '#signGo');
  const d2 = await until(async () => { const x = await ra(); return x && x.status === 'signed' ? x : null; });
  ok('2. THE ORGANISER SIGNS: version 1 is the one that stands (signedVersion), in their name', d2 && d2.signedVersion === 1 && d2.signedBy === P.kay.uid, J(d2 && { s: d2.status, v: d2.signedVersion }));
  await go(K, 'event-ra.html?event=' + EID, '#status');
  ok('3. THE ORGANISER CANNOT APPROVE THEIR OWN', !(await K.$('#approveGo')), await text(K, '#signCard'));

  /* ---------- 3. the health and safety lead approves ---------- */
  const M = await as('max');
  await go(M, 'event-ra.html?event=' + EID, '#approveGo');
  await tap(M, '#approveGo');
  const d3 = await until(async () => { const x = await ra(); return x && x.status === 'approved' ? x : null; });
  ok('3. THE HEALTH AND SAFETY LEAD APPROVES IT', d3 && d3.approvedBy === P.max.uid, J(d3 && { s: d3.status }));
  await go(M, 'event-ra.html?event=' + EID, '#status');
  ok('   the page says so: version 1, signed and approved', /Version 1: signed by .*approved/.test(await text(M, '#status')), await text(M, '#status'));

  /* ---------- 4. print ---------- */
  await go(M, 'ra-print.html?event=' + EID, '#sheet[data-ready]');
  const pr = await text(M, '#sheet');
  ok('4. IT PRINTS: the event, the hazard, approved, version 1', /Holiday club/.test(pr) && /Slips on the hall floor/.test(pr) && /pprov/.test(pr) && /1/.test(pr), pr.slice(0, 300));
  await M.setViewport({ width: 375, height: 812 });
  await go(M, 'ra-print.html?event=' + EID, '#sheet[data-ready]');
  ok('   and fits a phone: no sideways scroll', await M.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  /* ---------- 5. change it ---------- */
  await go(K, 'event-ra.html?event=' + EID, '#changeGo');
  await tap(K, '#changeGo'); await K.waitForSelector('#saveGo'); await tap(K, '#saveGo');
  const d5 = await until(async () => { const x = await ra(); return x && x.version === 2 ? x : null; });
  ok('5. "CHANGE IT" STARTS VERSION 2, A DRAFT: signed off again before it stands', d5 && d5.status === 'draft' && !d5.signedBy, J(d5 && { s: d5.status, v: d5.version, by: d5.signedBy }));

  /* ---------- 6. refusals ---------- */
  for (const k of ['eve', 'will', 'hal']) {
    const p = await as(k);
    await go(p, 'event-ra.html?event=' + EID, '#egbc-blocked-card');
    const t = await text(p);
    ok('6. ' + P[k].name + ': told it isn\'t for them, nothing of it shows', /isn.t for you/.test(t) && !/Slips|wet-floor/.test(t), t.slice(0, 200));
    const r = await p.evaluate((id) => EGBCAuth.db.collection('raEvents').doc(id).get().then(() => 'read', (e) => e.code), EID);
    const w = await p.evaluate((id) => EGBCAuth.db.collection('raEvents').doc(id).update({ status: 'approved' }).then(() => 'written', (e) => e.code), EID);
    ok('   and the database refuses them the record and a write', /permission/.test(r) && /permission/.test(w), r + ' / ' + w);
  }
} catch (e) {
  ok('the run finished', false, e.stack);
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
for (const b of BROWSERS) await b.close().catch(() => {});
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
