/* Setting the safeguarding lead and deputy on Safeguarding settings (F-190;
   Martin, 14 Oct: "Set one" led to a page with no way to set a name).
   Events window. Invented people only, events emulators only, network
   guard. Runs the hub's REAL functions, so careRouting/status is worked out
   by the server's own trigger, as it will be live.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/sg-lead.test.mjs"

   What it proves:
     1. a master admin sees, for each building, a "Safeguarding lead" and
        "Deputy" picker of ADULTS (nobody marked under 16), and which
        building's lead the forms reach first
     2. saving writes bookingSettings/<site>.safeguardingLead/Deputy - the
        fields Places shows, and Places shows the same - and leadSiteId,
        leadName and the phone number for the "I'm worried" form
     3. THE SERVER THEN SAYS A LEAD IS SET (careRouting/status.leadSet)
     4. the lead and the deputy cannot be the same person
     5. saving the other settings no longer drops who the lead is
     6. the lead, not an admin, sees who it is but cannot change it
     7. the hub's "Set one" goes to Safeguarding settings */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sglead-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
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

await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  lena:   { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
for (const k of Object.keys(P)) {
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
await db.collection('addressBook').doc('m_tom').set({ name: 'Tom Deputy (invented)', email: 'tom@example.invalid', markers: [], adminFor: [], masterAdmin: false });
await db.collection('addressBook').doc('m_kid').set({ name: 'Kit Young (invented)', email: '', markers: ['Lazers'], adminFor: [], masterAdmin: false, isMinor: true });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await db.collection('sites').doc('site_a').set({ name: 'Test Green (invented)', active: true, order: 1 });
await db.collection('sites').doc('site_b').set({ name: 'The Annexe (invented)', active: true, order: 2 });
await db.collection('bookingSettings').doc('site_a').set({ bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
await db.collection('careRouting').doc('status').set({ leadSet: false, leadIds: [] });

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const data = async (c, id) => { const s = await db.collection(c).doc(id).get(); return s.exists ? s.data() : null; };

try {
  /* ---------- 1. the pickers ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'safeguarding-settings.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#lead_site_a'));
  const opts = await M.$$eval('#lead_site_a option', os => os.map(o => o.textContent));
  ok('1. A LEAD AND A DEPUTY FOR EACH BUILDING', !!(await M.$('#dep_site_a')) && !!(await M.$('#lead_site_b')) && !!(await M.$('#dep_site_b')));
  ok('   ADULTS ONLY: nobody marked under 16 is offered', opts.includes('Lena Lead (invented)') && opts.includes('Tom Deputy (invented)') && !opts.some(o => /Kit Young/.test(o)), J(opts));
  ok('   and which building\'s lead the forms reach first', (await M.$$('input[name="leadSite"]')).length === 2);

  /* ---------- 4. not the same person twice ---------- */
  await M.select('#lead_site_a', 'm_lena'); await M.select('#dep_site_a', 'm_lena');
  await M.$eval('#save', b => b.click());
  await sleep(1200);
  ok('4. THE LEAD AND THE DEPUTY CANNOT BE THE SAME PERSON: refused, nothing saved', /two different people/.test(await M.evaluate(() => document.getElementById('toast').textContent)) && !(await data('bookingSettings', 'site_a')).safeguardingLead);

  /* ---------- 2. saving ---------- */
  await M.select('#dep_site_a', 'm_tom');
  await M.$eval('input[name="leadSite"][value="site_a"]', r => r.click());
  await M.$eval('#leadPhone', e => { e.value = '07700 900123'; });
  await M.screenshot({ path: path.join(HERE, 'sg-lead-settings.png') });
  await M.$eval('#save', b => b.click());
  const bs = await until(async () => { const d = await data('bookingSettings', 'site_a'); return d && d.safeguardingLead === 'm_lena' ? d : null; });
  ok('2. SAVED on the building, the fields Places uses: lead Lena, deputy Tom', bs && bs.safeguardingDeputy === 'm_tom', J(bs));
  const def = await until(async () => { const d = await data('safeguardingSettings', 'defaults'); return d && d.leadSiteId ? d : null; });
  ok('   and which building first, the lead\'s name and phone for the "I\'m worried" form', def && def.leadSiteId === 'site_a' && def.leadName === 'Lena Lead (invented)' && def.leadPhone === '07700 900123', J(def));

  /* ---------- 3. the server says a lead is set ---------- */
  const st = await until(async () => { const d = await data('careRouting', 'status'); return d && d.leadSet === true ? d : null; }, 30000);
  ok('3. THE SERVER NOW SAYS A LEAD IS SET (careRouting/status.leadSet)', st && J(st.leadIds) === '["m_lena","m_tom"]', J(st));

  /* ---------- Places shows the same ---------- */
  await M.goto(URLB + 'places-admin.html', { waitUntil: 'networkidle2' });
  await until(async () => (await M.$eval('select[data-sg="site_a"]', s => s.value)) === 'm_lena');
  ok('   PLACES SHOWS THE SAME: lead Lena, deputy Tom', (await M.$eval('select[data-sg="site_a"]', s => s.value)) === 'm_lena' && (await M.$eval('select[data-sgd="site_a"]', s => s.value)) === 'm_tom');

  /* ---------- 5. saving the rest keeps the lead ---------- */
  await M.goto(URLB + 'safeguarding-settings.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#rAll'));
  await M.$eval('#rAll', e => { e.value = '6'; });
  await M.$eval('#save', b => b.click());
  const def2 = await until(async () => { const d = await data('safeguardingSettings', 'defaults'); return d && d.ratioAll === 6 ? d : null; });
  ok('5. SAVING THE OTHER SETTINGS KEEPS WHO THE LEAD IS (it used to drop it)', def2 && def2.leadSiteId === 'site_a' && def2.leadName === 'Lena Lead (invented)' && def2.leadPhone === '07700 900123', J(def2));

  /* ---------- 6. the lead, not an admin ---------- */
  const L = await browser('lena');
  await L.goto(URLB + 'safeguarding-settings.html', { waitUntil: 'networkidle2' });
  await until(() => L.$('#who'));
  ok('6. THE LEAD (not an admin) sees who it is, and cannot change it', /The safeguarding lead is Lena Lead/.test(await text(L, '#who')) && !(await L.$('#lead_site_a')));
  /* The lead's page has no pickers, so nothing there re-supplies who leads:
     saving the other settings from it must still keep the name and number. */
  await L.$eval('#rAll', e => { e.value = '7'; });
  await L.$eval('#save', b => b.click());
  const def3 = await until(async () => { const d = await data('safeguardingSettings', 'defaults'); return d && d.ratioAll === 7 ? d : null; });
  ok('   AND WHEN THE LEAD SAVES THE OTHER SETTINGS, the name and number are kept', def3 && def3.leadName === 'Lena Lead (invented)' && def3.leadPhone === '07700 900123' && def3.leadSiteId === 'site_a', J(def3));

  /* ---------- 7. the hub's "Set one" ---------- */
  const hub = fs.readFileSync(path.join(V2, 'hub-app.js'), 'utf8');
  ok('7. THE HUB\'S "Set one" goes to Safeguarding settings', /href="safeguarding-settings\.html">Set one</.test(hub) && !/Set one in Places/.test(hub));

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
