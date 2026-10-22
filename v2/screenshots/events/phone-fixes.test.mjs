/* F-150: my pages at 375px, in app mode (APP-DESIGN-BRIEF §7d), judged the
   way a person sees them. Events window. Invented people only, events
   emulators only, network guard, no email leaves the machine.

     SHOT=after npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/phone-fixes.test.mjs"

   SHOT names the screenshots (phone-<page>-<SHOT>-375.png), so the same
   run makes the "before" pictures on the old code and the "after" ones on
   the new.

   What it checks, page by page, at 375px with ?app=1:
     kids-admin    a child's details: each label above its value, the
                   parent's email on one line, "May collect" not cut off
     safeguarding  the "Works with under-18s" tick: its words not squeezed
     rooms         every room's name whole in the day chart
     maintenance   both date boxes inside their card
     bookings-admin  the requester's email on one line; and every tab
     and on every page and tab: nothing scrolls sideways, and no words run
     past the right edge of the screen (outside a box that scrolls on
     purpose) - the main window's measure (APP-PARITY), so we judge alike */

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
const SHOT = process.env.SHOT || 'after';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-phone-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

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

const M = { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin' };
M.uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: M.email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
const PARENT_EMAIL = 'parent.synthetic@example.invalid', REQ_EMAIL = 'samy.member@example.invalid';
const DAY = fwd(5);
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'addressBook', M.mid), { name: M.name, email: M.email, markers: ['Core Team', 'Kids Church'], adminFor: [], masterAdmin: true });
  await setDoc(doc(db, 'users', M.uid), { memberId: M.mid, linkedBy: 'admin', name: M.name, email: M.email, teams: ['Core Team', 'Kids Church'], adminFor: [], masterAdmin: true, attender: true, status: 'active' });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  const ROOM = (name, order) => ({ siteId: 'site_t', name, kind: 'room', active: true, order, capacity: 0, colour: '#3d6263', accessible: true, bookableByMembers: true, bookableByHirers: true, description: '', photoUrl: '' });
  await setDoc(doc(db, 'rooms', 'room_sanct'), ROOM('Main Sanctuary', 1));
  await setDoc(doc(db, 'rooms', 'room_upper1'), ROOM('Upper Main Room 1', 2));
  await setDoc(doc(db, 'rooms', 'room_pastor'), ROOM('Pastors Office', 3));
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [M.mid], safeguardingLead: M.mid, safeguardingDeputy: '' });
  await setDoc(doc(db, 'bookings', 'bk_ask_0000000000000000000000000'), { kind: 'member', status: 'requested', siteId: 'site_t', roomId: 'room_upper1', groupId: '', day: DAY,
    startMin: 1140, endMin: 1200, startLocal: DAY + 'T19:00', endLocal: DAY + 'T20:00', setupMins: 0, packdownMins: 0, slotFrom: 76, slotTo: 80, title: 'Choir practice (invented)',
    people: 8, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '',
    requester: { name: 'Samy Member', email: REQ_EMAIL, phone: '07700 900222', org: '' }, memberUid: 'u_samy_x', memberName: 'Samy Member', createdAt: 'x' });
  /* So Coming up, Invoices and Hirers have something to show. */
  await setDoc(doc(db, 'bookings', 'bk_conf_000000000000000000000000'), { kind: 'hire', status: 'confirmed', siteId: 'site_t', roomId: 'room_sanct', groupId: '', day: DAY,
    startMin: 600, endMin: 720, startLocal: DAY + 'T10:00', endLocal: DAY + 'T12:00', setupMins: 30, packdownMins: 30, slotFrom: 38, slotTo: 50, title: 'Birthday party (invented)',
    people: 40, layout: 'theatre', av: { needed: true, what: 'Microphone and projector' }, refreshments: { needed: false }, resources: [], notes: 'Balloons, no confetti (invented).',
    requester: { name: 'Hirer Alpha', email: 'hirer.alpha@example.invalid', phone: '07700 900444', org: 'Invented Community Association' }, memberUid: '', memberName: '', createdAt: 'x',
    invoice: { number: 'INV-00001', issuedAt: new Date().toISOString(), dueDate: fwd(14), monthly: false, payText: 'Please pay by bank transfer.' } });
  await setDoc(doc(db, 'hirers', 'hr_alpha000000000'), { siteId: 'site_t', name: 'Hirer Alpha', org: 'Invented Community Association', email: 'hirer.alpha@example.invalid', phone: '07700 900444',
    address: '1 Invented Lane, Esher', charity: true, charityNumber: '1234567', charityChecked: true, regular: true, monthly: false, notes: '', documents: [], active: true, createdAt: 'x', updatedAt: 'x' });
  await setDoc(doc(db, 'invoices', 'inv_1'), { seq: 1, number: 'INV-00001', siteId: 'site_t', chargeIds: ['ch_x'], bookingKeys: ['bk_conf_000000000000000000000000'],
    payer: { name: 'Hirer Alpha', org: 'Invented Community Association', email: 'hirer.alpha@example.invalid', address: '1 Invented Lane, Esher' },
    lines: [{ label: 'Room hire', amount: 8000, chargeId: 'ch_x' }], subtotal: 8000, vat: 0, total: 8000, monthly: false, period: '', issuedAt: new Date().toISOString(), dueDate: fwd(14), status: 'unpaid', issuedBy: 'x', payText: '' });
  await setDoc(doc(db, 'counters', 'invoices'), { next: 2 });
  await setDoc(doc(db, 'kidsSettings', 'site_t'), { teams: ['Kids Church'], formId: '' });
  await setDoc(doc(db, 'kidsGroups', 'kg_little'), { siteId: 'site_t', name: 'Little ones', years: ['Year 1'], roomId: '', ratio: 5, day: 7, active: true, order: 1, leaderIds: [] });
  await setDoc(doc(db, 'kidsChildren', 'kc_ada0000000000'), { siteId: 'site_t', familyId: 'fam_1', name: 'Ada Synthetic', dob: '2020-06-01', year: 'Year 1', groupId: 'kg_little', groupFixed: false,
    status: 'registered', flags: { allergies: true, medical: false }, consentUntil: '2099-08-31', photo: true, firstaid: true, parentName: 'Parent Synthetic', phone: '07700 900111', email: PARENT_EMAIL,
    emergency: 'Aunt Invented 07700 900222, Uncle Invented 07700 900333', collectors: ['Parent Synthetic', 'Grandma Invented'], familyCode: 'K9SDYV' });
  await setDoc(doc(db, 'kidsMedical', 'kc_ada0000000000'), { siteId: 'site_t', groupId: 'kg_little', allergies: 'Peanuts: carries an EpiPen', medical: '', medication: '', needs: '', responseId: '' });
  await setDoc(doc(db, 'calEvents', 'ev_club'), { title: 'Test Kids Film Club', description: '', category: 'kids', labels: [], visibility: 'members', status: 'confirmed', audience: ['members'], teams: [],
    featured: false, startLocal: DAY + 'T10:00', startUtc: new Date(DAY + 'T10:00').getTime(), endLocal: DAY + 'T12:00', endUtc: new Date(DAY + 'T12:00').getTime(), allDay: false,
    location: { kind: 'room', siteId: 'site_t', roomIds: [] }, signupOn: true, capacity: 20, createdBy: M.uid });
});

const errors = [];
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, 'martin-')), args: ['--no-first-run'] });
GUARD.watchBrowser(b);
/* A FRESH TAB FOR EACH PAGE, the last one closed. Each page keeps a live
   connection to the database, and a browser allows only six to one local
   address; on the emulator the old pages' connections linger, and after a
   few pages the next one cannot check who you are (F-073). Live, the
   database shares one connection, so a phone does not meet this. */
const CONSOLE = [];
let P = null;
async function fresh() {
  if (P) await P.close().catch(() => {});
  P = await b.newPage();
  await GUARD.protect(P, 'martin');
  await P.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await P.setViewport({ width: 375, height: 812 });
  P.on('pageerror', e => errors.push(e.message));
  P.on('console', m => CONSOLE.push(m.type() + ': ' + m.text().slice(0, 160)));
  P.on('dialog', d => d.dismiss());
  return P;
}
await fresh();

/* ---- what a person sees ---- */
/* Words past the right edge of the screen, outside any box that scrolls
   sideways on purpose; and whether the page itself scrolls sideways. */
const offEdge = () => P.evaluate(() => {
  const W = window.innerWidth, out = [];
  const inScroller = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || el.closest('.firebase-emulator-warning') || inScroller(el)) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const q of r.getClientRects()) if (q.width && q.right > W + 1) { out.push(t.slice(0, 40)); break; }
  }
  return { sideways: document.scrollingElement.scrollWidth - W, off: out };
});
/* Words cut short with "…" by their own box. */
const cutShort = (sel) => P.$$eval(sel, els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()));
/* How many lines a piece of text takes. */
const linesOf = (text) => P.evaluate((text) => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const i = n.nodeValue.indexOf(text); if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
    return new Set([...r.getClientRects()].filter(q => q.width).map(q => Math.round(q.top))).size;
  }
  return -1;
}, text);
async function look(name, label) {
  const o = await offEdge();
  ok('   ' + label + ': nothing scrolls sideways, and no words run off the screen', o.sideways <= 0 && !o.off.length, J(o));
  await P.evaluate(() => document.querySelectorAll('.firebase-emulator-warning').forEach(e => { e.style.display = 'none'; }));
  await P.screenshot({ path: path.join(HERE, 'phone-' + name + '-' + SHOT + '-375.png'), fullPage: true });
}
/* Waits for the page's own content, not for the network to go quiet: a page with a live database connection may never be quiet. */
const open = async (url, sel) => { await fresh(); await P.goto(URLB + url + (url.includes('?') ? '&' : '?') + 'app=1', { waitUntil: 'domcontentloaded' }); if (sel) await P.waitForSelector(sel, { timeout: 20000 }); };

try {
  await P.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await P.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await P.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await P.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), M.email);
  await sleep(800);

  /* kids-admin: a child opened */
  await open('kids-admin.html', '[data-open="kc_ada0000000000"]');
  ok('0. the pages open in app mode (no website bar)', !(await P.$('#egbc-bar')) && await P.evaluate(() => sessionStorage.getItem('egbc_app_mode') === '1'));
  await P.$eval('[data-open="kc_ada0000000000"]', e => e.click());
  await P.waitForSelector('[data-detail="kc_ada0000000000"] dl');
  const stacked = await P.$eval('[data-detail="kc_ada0000000000"] dl', dl => {
    const dt = dl.querySelector('dt'), dd = dl.querySelector('dd');
    return { dt: dt.getBoundingClientRect().left, dd: dd.getBoundingClientRect().left, ddw: dd.getBoundingClientRect().width };
  });
  ok('1. KIDS-ADMIN: each label sits above its value, at full width', Math.abs(stacked.dt - stacked.dd) < 4 && stacked.ddw > 260, J(stacked));
  ok('   the parent\'s email is on one line, not broken mid-word', (await linesOf(PARENT_EMAIL)) === 1, await linesOf(PARENT_EMAIL));
  const coll = await P.$eval('.d-coll', e => ({ w: e.clientWidth, sw: e.scrollWidth, v: e.value }));
  ok('   "May collect" shows everyone, not cut off', coll.sw <= coll.w + 1 && coll.w > 250, J(coll));
  await look('kids-admin', 'kids-admin');

  /* safeguarding: the under-18s tick */
  await open('safeguarding.html?event=ev_club', '#under18');
  const tick = await P.evaluate(() => {
    const lab = document.getElementById('under18').closest('label'), bw = lab.querySelector('b');
    return { lines: new Set([...bw.getClientRects()].map(q => Math.round(q.top))).size, words: lab.getBoundingClientRect().width, b: bw.getBoundingClientRect().width };
  });
  ok('2. SAFEGUARDING: "Works with under-18s" on one line, its words at full width, not squeezed', tick.lines === 1 && tick.b > 120, J(tick));
  await look('safeguarding', 'safeguarding');

  /* rooms: the day chart */
  await open('rooms.html', '.bk-lab');
  await until(async () => (await P.$$('.bk-lab')).length >= 3);
  const cut = await cutShort('.bk-lab');
  const names = await P.$$eval('.bk-lab', els => els.map(e => e.textContent.trim()));
  ok('3. ROOMS: every room\'s name whole in the day chart', !cut.length && names.includes('Upper Main Room 1') && names.includes('Main Sanctuary'), 'cut short: ' + J(cut));
  await look('rooms', 'rooms');

  /* maintenance: Close a room */
  await open('maintenance.html', '#c-to');
  const edge = await P.$eval('#c-to', e => { const card = e.closest('.card') || e.parentElement; return { input: Math.round(e.getBoundingClientRect().right), card: Math.round(card.getBoundingClientRect().right) }; });
  ok('4. MAINTENANCE: both date boxes inside their card', edge.input <= edge.card, J(edge));
  await look('maintenance', 'maintenance');

  /* bookings-admin: the request, then every tab */
  await open('bookings-admin.html', '[data-tab="waiting"]');
  await until(async () => (await linesOf(REQ_EMAIL)) > 0);
  ok('5. BOOKINGS-ADMIN: the requester\'s email on one line, not broken mid-word', (await linesOf(REQ_EMAIL)) === 1, await linesOf(REQ_EMAIL));
  const bkStack = await P.$eval('.bk dl', dl => {
    const dt = dl.querySelector('dt'), dd = dl.querySelector('dd');
    return { dt: dt.getBoundingClientRect().left, dd: dd.getBoundingClientRect().left, ddw: dd.getBoundingClientRect().width };
  });
  ok('   each label sits above its value, at full width (not a thin column)', Math.abs(bkStack.dt - bkStack.dd) < 4 && bkStack.ddw > 260, J(bkStack));
  await look('bookings-waiting', 'bookings: Waiting');
  for (const [tab, label] of [['coming', 'Coming up'], ['day', 'Day view'], ['setup', 'Setup sheet'], ['invoices', 'Invoices'], ['hirers', 'Hirers'], ['accounts', 'Accounts'], ['past', 'Past and cancelled']]) {
    await P.$eval('[data-tab="' + tab + '"]', e => e.click());
    await sleep(1500);
    if (tab === 'day') {
      const dcut = await cutShort('.bk-lab');
      ok('   bookings: Day view: every room\'s name whole', !dcut.length, J(dcut));
    }
    await look('bookings-' + tab, 'bookings: ' + label);
  }

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  await P.screenshot({ path: path.join(TMP, 'failed.png'), fullPage: true }).catch(() => {});
  console.log(['FAILED AT ' + P.url(), await P.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => ''),
    'CONSOLE: ' + CONSOLE.slice(-8).join(' | '), 'PICTURE: ' + path.join(TMP, 'failed.png')].join('\n'));
  ok('the run finished', false, e.stack || e.message);
} finally {
  await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
