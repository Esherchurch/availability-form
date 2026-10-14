/* Gift Aid declarations (NEXT-BRIEF §24 item 6; F-169). Events window.
   Invented people and addresses only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/giftaid.test.mjs"

   What it proves, at 375px in app mode:
     1. a person declares in the app: HMRC's wording in the church's name;
        not without the taxpayer tick, not with a postcode that is not one;
        then "You have a Gift Aid declaration from …"
     2. they keep their address up to date, and can cancel (from today);
        the cancelled record is KEPT, and they can declare again
     3. the office records a declaration made on paper, for someone in the
        address book, with the paper held
     4. the office and the treasurer get the list, and the CSV for the HMRC
        claim: title, first name, last name, house, postcode, date, how,
        status
     5. NOBODY ELSE: another member sees no list, and the database refuses
     6. switched off for the church: not used */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-giftaid-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
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

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  gina:  { email: 'gina.giver@example.invalid', name: 'Gina Giver', mid: 'm_gina', teams: [] },
  paul:  { email: 'paul.paper@example.invalid', name: 'Paul Paper', mid: 'm_paul', teams: [] },
  val:   { email: 'val.office@example.invalid', name: 'Val Office', mid: 'm_val', teams: ['Church office'] },
  terry: { email: 'terry.treasurer@example.invalid', name: 'Terry Treasurer', mid: 'm_terry', teams: ['Finance'] },
  nosy:  { email: 'nosy.member@example.invalid', name: 'Nosy Member', mid: 'm_nosy', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});
const list = async () => { let out = []; await env.withSecurityRulesDisabled(async (x) => { out = (await getDocs(collection(x.firestore(), 'giftAid'))).docs.map(d => ({ id: d.id, ...d.data() })); }); return out; };

const errors = [], browsers = [];
async function as(who, o) {
  o = o || {};
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k, off) => {
    try { sessionStorage.setItem(k, '1'); } catch (e) {}
    if (off) { let c = null; Object.defineProperty(window, 'EGBCChurch', { configurable: true, get() { return c; }, set(v) { if (v) v.uses = (n) => n !== 'giftAid'; c = v; } }); }
  }, 'egbc_fresh_' + STAMP, !!o.off);
  await p.setViewport({ width: 375, height: 812 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await p.goto(URLB + 'giftaid.html?app=1', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => document.querySelector('#declare, #have') || /not used/.test(document.getElementById('main').textContent), { timeout: 20000 });
  return p;
}
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const toast = (p) => until(() => p.evaluate(() => { const t = document.getElementById('toast'); return t.style.display === 'block' ? t.textContent : ''; }));

try {
  /* ---------- 1. declaring ---------- */
  const G = await as('gina');
  const words = await text(G, '#g-words');
  ok('1. HMRC\'s wording, in the church\'s own name', /I want to Gift Aid any donations I make in the future, and have made in the past 4 years, to Test Green Church\. I am a UK taxpayer/.test(words), words);
  ok('   her name is filled in from her record', (await G.$eval('#g-first', e => e.value)) === 'Gina' && (await G.$eval('#g-last', e => e.value)) === 'Giver');
  await val(G, '#g-house', '12'); await val(G, '#g-pc', 'kt10 9aa');
  await G.$eval('#g-go', b => b.click());
  ok('   not without the taxpayer tick', /UK taxpayer/.test(await toast(G)) && (await list()).length === 0);
  await G.$eval('#g-yes', c => c.click());
  await val(G, '#g-pc', 'nowhere');
  await G.$eval('#g-go', b => b.click());
  await sleep(300);
  ok('   not with a postcode that is not one', /postcode/.test(await toast(G)) && (await list()).length === 0);
  await val(G, '#g-pc', 'kt10 9aa');
  await G.screenshot({ path: path.join(HERE, 'giftaid-declare-375.png'), fullPage: true });
  ok('   nothing scrolls sideways at 375px', (await G.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await G.$eval('#g-go', b => b.click());
  await G.waitForSelector('#have');
  ok('   then: "You have a Gift Aid declaration from …"', /You have a Gift Aid declaration from/.test(await text(G, '#have')));
  const d1 = (await list())[0];
  ok('   kept: her own, in the app, the words she agreed to, the postcode tidied', d1.memberId === 'm_gina' && d1.source === 'app' && d1.taxpayer === true && /Test Green Church/.test(d1.wording) && d1.postcode === 'KT10 9AA', J(d1));

  /* ---------- 2. address and cancelling ---------- */
  await G.$eval('#have details summary', s => s.click());
  await val(G, '#m-house', '14');
  await G.$eval('#m-save', b => b.click());
  ok('2. she keeps her address up to date', !!(await until(async () => (await list())[0].house === '14')));
  await G.waitForSelector('#m-cancel');
  await G.$eval('#m-cancel', b => b.click());
  await G.waitForSelector('#declare');
  const c1 = (await list()).find(x => x.id === d1.id);
  ok('   she cancels: from today, and THE RECORD IS KEPT', c1 && c1.cancelled === true && /^\d{4}-\d{2}-\d{2}$/.test(c1.cancelledOn), J(c1));

  /* ---------- 3, 4. the office and the treasurer ---------- */
  const V = await as('val');
  await until(() => V.$('#paper'));
  await val(V, '#p-who', 'Paul Paper');
  await V.$eval('#p-who', e => e.dispatchEvent(new Event('change')));
  await val(V, '#p-house', 'Rose Cottage'); await val(V, '#p-pc', 'KT10 8BB'); await val(V, '#p-date', '2024-03-01');
  await V.$eval('#p-go', b => b.click());
  ok('3. the office must tick that the paper is held', /paper declaration is held/.test(await toast(V)));
  await V.$eval('#p-held', c => c.click());
  await V.$eval('#p-go', b => b.click());
  const pp = await until(async () => (await list()).find(x => x.source === 'paper'));
  ok('   records a paper declaration for someone in the address book', pp && pp.memberId === 'm_paul' && pp.firstName === 'Paul' && pp.paperHeld === true && pp.declaredOn === '2024-03-01', J(pp));
  await until(async () => /Paul Paper/.test(await text(V, '#list')));
  const lt = await text(V, '#list');
  ok('4. THE OFFICE\'S LIST: Paul (on paper); Gina\'s cancelled one kept, under Cancelled', /Declarations: 1/.test(lt) && /Paul Paper on paper/.test(lt) && /Cancelled: 1.*Gina Giver cancelled/.test(lt), lt);
  const T = await as('terry');
  await until(() => T.$('#csv'));
  await T.$eval('#csv', b => b.click());
  const csv = await until(() => T.evaluate(() => window.__giftAidCsv));
  const lines = csv.split('\r\n');
  ok('4. THE TREASURER\'S CSV, in the order the HMRC claim asks for', lines[0] === 'Title,First name,Last name,House name or number,Postcode,Declaration date,How made,Status,Cancelled on', lines[0]);
  ok('   one row each, active and cancelled', lines.some(l => /^,Paul,Paper,Rose Cottage,KT10 8BB,2024-03-01,Paper,Active,$/.test(l)) && lines.some(l => /^,Gina,Giver,14,KT10 9AA,\d{4}-\d{2}-\d{2},Online,Cancelled,\d{4}/.test(l)), csv);

  /* ---------- 5. nobody else ---------- */
  const N = await as('nosy');
  await sleep(800);
  ok('5. ANOTHER MEMBER: no list, no names', !(await N.$('#list')) && !/Gina|Paul Paper/.test(await text(N)));
  const r = await N.evaluate(() => EGBCAuth.db.collection('giftAid').get().then(() => 'read', e => e.code));
  ok('   and the database refuses', r === 'permission-denied', r);
  await G.reload({ waitUntil: 'networkidle2' }); await G.waitForSelector('#declare');
  ok('   (Gina, after cancelling, can declare again)', !!(await G.$('#g-go')));

  /* ---------- 6. switched off ---------- */
  const F = await as('gina', { off: true });
  ok('6. switched off for the church: not used', /not used by this church/.test(await text(F, '#main')));

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
