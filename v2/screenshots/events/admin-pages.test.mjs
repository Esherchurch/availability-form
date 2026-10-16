/* WHO OPENS PLACES, THE PICTURE LIBRARY AND HEADCOUNTS (Martin, 16 Oct).
   Events window. Invented people only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/admin-pages.test.mjs"

   What it proves, at 412px:
     1. Places and the Picture library: the church office, a bookings admin
        and a master admin get in; a Worship admin, a Kids Church lead and a
        member are refused (the page says so, and is marked refused)
     2. Headcounts: a Kids Church lead and a master admin get in; the
        church office, a Worship admin and a member are refused
     3. View as: a master admin viewing as a member is refused all three */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-adm-'));
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
  martin: { name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'], adminFor: [] },
  olive:  { name: 'Olive Office (invented)', mid: 'm_olive', teams: ['Church office'], adminFor: [] },
  bob:    { name: 'Bob Bookings (invented)', mid: 'm_bob', teams: [], adminFor: [] },
  kim:    { name: 'Kim Kidslead (invented)', mid: 'm_kim', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  wes:    { name: 'Wes Worshipadmin (invented)', mid: 'm_wes', teams: ['Worship Team'], adminFor: ['Worship Team'] },
  mia:    { name: 'Mia Member (invented)', mid: 'm_mia', teams: [], adminFor: [] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.adm@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master, attender: true, status: 'active' });
}
/* A team's document id is its name, as the church's own list has it. */
for (const [name, extra] of [['Core Team', {}], ['Kids Church', {}], ['Worship Team', {}],
  ['Church office', { rota: false, runs: ['today', 'people', 'bookings', 'send'] }]]) {
  await db.collection('teams').doc(name).set({ name, label: name, rota: true, order: 1, ...extra });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await db.collection('sites').doc('site_a').set({ name: 'Main building (invented)', active: true, order: 1 });
await db.collection('bookingSettings').doc('site_a').set({ bookingsAdmins: ['m_bob'], safeguardingLead: '', safeguardingDeputy: '' });
await db.collection('kidsSettings').doc('site_a').set({ teams: ['Kids Church'] });

const browsers = [], errors = [];
async function as(who, viewAs) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k, va) => { try { sessionStorage.setItem(k, '1'); if (va) sessionStorage.setItem('egbc_view_as', va); } catch (e) {} }, 'egbc_fresh_' + STAMP, viewAs ? JSON.stringify(viewAs) : '');
  await pg.setViewport({ width: 412, height: 915 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(600);
  return pg;
}
/* opened: the page's own working parts are there; refused: marked, and says who it is for */
const SIGNS = { 'places-admin.html': '#sites-list', 'picture-library.html': '#main .card:not(.hint)', 'headcounts.html': '#hSave' };
async function visit(pg, page) {
  await pg.goto(URLB + page, { waitUntil: 'networkidle2' });
  const r = await until(() => pg.evaluate((sel) => {
    const blocked = document.body.getAttribute('data-egbc-blocked');
    const t = document.body.innerText;
    if (blocked) return { refused: true, words: t.replace(/\s+/g, ' ').slice(0, 600) };
    if (/Checking access|Loading…/.test(t)) return null;
    return document.querySelector(sel) ? { refused: false } : null;
  }, SIGNS[page]), 15000);
  return r || { refused: null };
}

try {
  const PG = {};
  for (const k of Object.keys(P)) PG[k] = await as(k);
  const RULE = {
    'places-admin.html': { yes: ['martin', 'olive', 'bob'], no: ['wes', 'kim', 'mia'] },
    'picture-library.html': { yes: ['martin', 'olive', 'bob'], no: ['wes', 'kim', 'mia'] },
    'headcounts.html': { yes: ['martin', 'kim'], no: ['olive', 'wes', 'mia'] }
  };
  for (const page of Object.keys(RULE)) {
    for (const who of RULE[page].yes) { const r = await visit(PG[who], page); ok(page + ': ' + P[who].name + ' gets in', r.refused === false, JSON.stringify(r)); }
    for (const who of RULE[page].no) {
      const r = await visit(PG[who], page);
      ok(page + ': ' + P[who].name + ' IS REFUSED, and told who it is for', r.refused === true && /This page is for/.test(r.words), JSON.stringify(r));
    }
  }
  await PG.olive.goto(URLB + 'places-admin.html', { waitUntil: 'networkidle2' }); await sleep(1500);
  await PG.olive.screenshot({ path: path.join(HERE, 'admin-pages-places-office-412.png'), fullPage: true });
  await PG.mia.goto(URLB + 'headcounts.html', { waitUntil: 'networkidle2' }); await sleep(1500);
  await PG.mia.screenshot({ path: path.join(HERE, 'admin-pages-headcounts-refused-412.png'), fullPage: true });
  const VA = await as('martin', { team: '__everyone', admin: false });
  for (const page of Object.keys(RULE)) { const r = await visit(VA, page); ok('VIEW AS a member: ' + page + ' is refused', r.refused === true, JSON.stringify(r)); }
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
