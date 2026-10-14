/* "I'm new here" (NEXT-BRIEF §24 item 12; F-167). Events window. Invented
   people only, events emulators only, network guard, no email leaves the
   machine (the outbox is read instead).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/newhere.test.mjs"

   What it proves, at 375px:
     1. a visitor, NOT SIGNED IN, says hello and asks to be contacted; never
        asked to sign in
     2. NOTHING IS STORED UNTIL SEND: nothing in the database or on the
        phone while they type
     3. it goes to the people the church chose (welcomers) in the hub, and
        by email to the address the church chose; a welcomer marks it
        contacted
     4. NOBODY ELSE READS A HELLO: not an attender, not the visitor, not
        signed out
     5. "just saying hello" needs no contact details; asking for contact
        needs an email or phone; a robot filling the hidden field is turned
        away
     6. switched off for the church: not available */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-newhere-'));
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
  wendy:  { email: 'wendy.welcome@example.invalid', name: 'Wendy Welcome', mid: 'm_wendy' },
  ann:    { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann' },
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: [], adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: [], adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'welcomeSettings', 'main'), { memberIds: ['m_wendy'], updatedAt: 'x', updatedBy: 'x' });
  await setDoc(doc(db, 'welcomeSettings', 'public'), { notifyEmail: 'welcome@example.invalid', updatedAt: 'x', updatedBy: 'x' });
});
const list = async (c) => { let out = []; await env.withSecurityRulesDisabled(async (x) => { out = (await getDocs(collection(x.firestore(), c))).docs.map(d => ({ id: d.id, ...d.data() })); }); return out; };

const errors = [], browsers = [];
async function page(who, o) {
  o = o || {};
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k, off) => {
    try { sessionStorage.setItem(k, '1'); } catch (e) {}
    if (off) { let c = null; Object.defineProperty(window, 'EGBCChurch', { configurable: true, get() { return c; }, set(v) { if (v) v.uses = (n) => n !== 'newHere'; c = v; } }); }
  }, 'egbc_fresh_' + STAMP, !!o.off);
  await p.setViewport({ width: 375, height: 812 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  if (P[who]) {
    await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
    await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
    if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
    await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  }
  await p.goto(URLB + 'newhere.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => document.getElementById('f') || /Not available/.test(document.getElementById('main').textContent), { timeout: 20000 });
  if (!P[who] && (await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  return p;
}
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const storage = (p) => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/firebase|egbc_fresh|egbc_app/i.test(k)) o[k] = localStorage.getItem(k); } return o; });

try {
  /* ---------- 1, 2. a visitor, signed out ---------- */
  const V = await page('visitor');
  ok('1. A VISITOR, NOT SIGNED IN: the welcome card, never a sign-in', /Welcome!/.test(await text(V)) && !/sign in/i.test(await text(V)) && !(await V.$('#egbc-bar')));
  await val(V, '#n-name', 'Vera Visitor (invented)');
  await val(V, '#n-email', 'vera.visitor@example.invalid');
  await val(V, '#n-msg', 'We have just moved to Esher, with two children (invented).');
  await sleep(2700);
  ok('2. NOTHING STORED WHILE THEY TYPE: not in the database', (await list('welcomes')).length === 0);
  ok('   nor on the phone', J(await storage(V)) === '{}', J(await storage(V)));
  await V.screenshot({ path: path.join(HERE, 'newhere-375.png'), fullPage: true });
  ok('   nothing scrolls sideways at 375px', (await V.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await V.evaluate(() => { if (window.__egbcOutbox) window.__egbcOutbox.length = 0; });
  await V.$eval('#n-go', b => b.click());
  await V.waitForSelector('#thanks');
  ok('1. sent: "Thank you … Someone will be in touch soon"', /Thank you, Vera Visitor \(invented\)\. Someone will be in touch soon/.test(await text(V, '#thanks')));
  const h = (await list('welcomes'))[0];
  ok('   kept: name, email, words, asked to be contacted; nothing more', h && h.name === 'Vera Visitor (invented)' && h.email === 'vera.visitor@example.invalid' && h.contactMe === true && h.status === 'new' && h.uid === '', J(h));
  const mail = await until(() => V.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload)).then(l => l.find(m => /Someone new said hello/.test(m.subject))));
  ok('3. emailed to the address the church chose', mail && mail.to[0] === 'welcome@example.invalid' && /vera\.visitor@example\.invalid/.test(mail.html), J(mail));

  /* ---------- 3, 4. who reads it ---------- */
  const W = await page('wendy');
  await until(() => W.$('#hellos [data-hello]'));
  ok('3. THE WELCOMER the church chose sees it in the hub', /Vera Visitor/.test(await text(W, '#hellos')) && /would like contact/.test(await text(W, '#hellos')));
  await W.$eval('[data-done]', b => b.click());
  ok('   and marks it contacted', !!(await until(async () => (await list('welcomes'))[0].status === 'contacted')));
  const A = await page('ann');
  await sleep(1200);
  ok('4. NOT AN ATTENDER', !(await A.$('#hellos')) && !/Vera/.test(await text(A)));
  const read = await A.evaluate(() => EGBCAuth.db.collection('welcomes').get().then(() => 'read', e => e.code));
  ok('   the database refuses her', read === 'permission-denied', read);
  const vRead = await V.evaluate(() => EGBCAuth.db.collection('welcomes').get().then(() => 'read', e => e.code));
  ok('   nor the visitor, signed out, even after sending one', vRead === 'permission-denied', vRead);
  const M = await page('martin');
  await until(() => M.$('#w-settings'));
  ok('3. a master admin chooses who: the welcomers, and the email address', /Wendy Welcome/.test(await text(M, '#w-settings')) && (await M.$eval('#w-email', e => e.value)) === 'welcome@example.invalid');

  /* ---------- 5. the form's own checks ---------- */
  const V2p = await page('visitor2');
  await val(V2p, '#n-name', 'Just Hello (invented)');
  await V2p.$eval('input[name="n-contact"][value="no"]', r => r.click());
  await sleep(2700);
  await V2p.$eval('#n-go', b => b.click());
  await V2p.waitForSelector('#thanks');
  ok('5. "just saying hello" needs no contact details', /lovely to have you/.test(await text(V2p, '#thanks')));
  const V3 = await page('visitor3');
  await val(V3, '#n-name', 'Needs Contact (invented)');
  await sleep(2700);
  await V3.$eval('#n-go', b => b.click());
  await sleep(600);
  ok('   asking for contact needs an email or a phone', /email or a phone number/.test(await text(V3, '#n-err')));
  const R = await page('robot');
  await val(R, '#n-name', 'Robot'); await val(R, '#n-email', 'robot@example.invalid'); await val(R, '#website', 'http://spam.invalid');
  await sleep(2700);
  await R.$eval('#n-go', b => b.click());
  await sleep(800);
  ok('   a robot filling the hidden field is turned away, and nothing is kept', /did not go through/.test(await R.evaluate(() => (document.getElementById('n-err') || {}).textContent || '')) && !(await list('welcomes')).some(w => w.name === 'Robot'));

  /* ---------- 6. switched off ---------- */
  const F = await page('visitor4', { off: true });
  ok('6. switched off for the church: not available', /Not available/.test(await text(F, '#main')) && !(await F.$('#f')));

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
