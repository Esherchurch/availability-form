/* The public "Hire our rooms" pages, signed in and signed out (Martin,
   11 Oct: "the drop down menu disappears on some pages").
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/public-menu.test.mjs"

   For hire.html, room.html, book.html and my-booking.html, at a computer's
   width and at 375px:
     SIGNED IN:  the hub's own top bar, with its Menu, which opens and lists
                 things; the page still works; nothing scrolls sideways
     SIGNED OUT: today's public header; no hub bar, no Menu, no Hub button,
                 no sign-in prompt, never sent to sign in; the page works;
                 nothing scrolls sideways */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-pubmenu-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }

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

const SAMY = { email: 'samy.member@example.invalid', name: 'Samy Member', mid: 'm_samy' };
SAMY.uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: SAMY.email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'addressBook', SAMY.mid), { name: SAMY.name, email: SAMY.email, markers: ['Worship Team'], adminFor: [], masterAdmin: false });
  await setDoc(doc(db, 'users', SAMY.uid), { memberId: SAMY.mid, linkedBy: 'admin', name: SAMY.name, email: SAMY.email, teams: ['Worship Team'], adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_t', name: 'Test Hall', kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
    bookableByMembers: true, bookableByHirers: true, description: 'A big room (invented).', photoUrl: '', fireMax: 120, layouts: { theatre: 100 } });
});

const PAGES = [
  ['hire.html', /Test Hall/],
  ['room.html?id=room_hall', /Test Hall/],
  ['book.html?room=room_hall', /Test Hall/],
  ['my-booking.html?k=bk_nothing_here_00000000000000000', /We cannot find that booking/]
];

const errors = [], browsers = [];
async function browser(who, signIn) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => { errors.push(who + ' dialog: ' + d.message()); d.dismiss(); });
  if (signIn) {
    await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
    await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
    const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
    if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
    await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), SAMY.email);
  }
  return p;
}
const text = (p) => p.$eval('body', e => e.innerText);
const sideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);

try {
  const G = await browser('guest', false);
  const S = await browser('samy', true);
  for (const [w, label] of [[1280, 'computer'], [375, '375px']]) {
    await G.setViewport({ width: w, height: 860 });
    await S.setViewport({ width: w, height: 860 });
    for (const [url, works] of PAGES) {
      const name = url.split('?')[0] + ' (' + label + ')';

      /* signed out */
      await G.goto(URLB + url, { waitUntil: 'networkidle2' });
      await until(async () => works.test(await text(G)));
      await sleep(1200);   /* time for anything that would appear late */
      const gt = await text(G);
      ok('SIGNED OUT ' + name + ': the page works', works.test(gt), gt.slice(0, 200));
      ok('   no hub bar, no Menu, no Hub button, no "Back to the hub"', !(await G.$('#egbc-bar')) && !(await G.$('#egbc-nav-btn')) && !(await G.$('a[href="hub.html"]')));
      ok('   no sign-in prompt, and still on the page', !/sign in/i.test(gt) && G.url().indexOf(URLB + url.split('?')[0]) === 0, G.url());
      ok('   the public header is there', !!(await G.$('.ch-in')) && await G.$eval('.chead', e => getComputedStyle(e).display !== 'none'));
      ok('   nothing scrolls sideways', (await sideways(G)) <= 0, await sideways(G));
      if (w === 375 && url.startsWith('hire')) await G.screenshot({ path: path.join(HERE, 'public-menu-guest-375.png') });

      /* signed in */
      await S.goto(URLB + url, { waitUntil: 'networkidle2' });
      await until(() => S.$('#egbc-nav-btn'));
      await until(async () => works.test(await text(S)));
      ok('SIGNED IN ' + name + ': the hub\'s bar with its Menu', !!(await S.$('#egbc-bar')) && !!(await S.$('#egbc-nav-btn')));
      ok('   the page still works', works.test(await text(S)));
      await S.$eval('#egbc-nav-btn', e => e.click());
      const opened = await until(() => S.evaluate(() => {
        const n = document.getElementById('egbc-nav'), l = document.getElementById('egbc-nav-list');
        return n && n.classList.contains('on') && l && l.querySelectorAll('a').length > 0 ? l.querySelectorAll('a').length : 0;
      }));
      ok('   the Menu opens and lists pages', opened > 0, opened);
      if (w === 375 && url.startsWith('hire')) await S.screenshot({ path: path.join(HERE, 'public-menu-member-375.png') });
      await S.keyboard.press('Escape');
      ok('   the public logo and name step back (one bar, not two)', await S.$eval('.ch-name', e => getComputedStyle(e).display === 'none'));
      ok('   nothing scrolls sideways', (await sideways(S)) <= 0, await sideways(S));
    }
  }
  ok('no page errors or alerts', errors.length === 0, errors.join(' | '));
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
