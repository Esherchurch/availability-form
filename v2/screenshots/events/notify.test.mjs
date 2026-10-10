/* The Notifications page (NEXT-BRIEF §23; F-144): Android and iPhone from
   day one. A test cannot hold a phone, so each "phone" here is the browser
   wearing that phone's name (its user agent) with a pretend notification
   service in place of Firebase's (egbc-notify.js reads it from
   window.__EGBC_NOTIFY_DRIVER). Everything around it is real: the rules,
   the records written, the switches, what each phone is shown.
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine. The real-phone proof is Martin's
   (FINDINGS-notify N-7).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/notify.test.mjs"

   What it proves:
     1. Android: turn on (this phone's record, in the person's name), the
        switches and quiet hours saved, a test message, turn off (the record
        goes)
     2. iPhone in Safari: the "Add to Home Screen" guide in plain words, and
        no button that could not work
     3. iPhone added to the Home Screen: the button
     4. an iPhone older than iOS 16.4: "update it first"
     5. notifications blocked: how to allow them
     6. a parent not in the address book: "call a parent" only (N-6b)
     7. nobody can read a phone's record, even their own */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-ntf-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
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
  ann: { email: 'ann.android@example.invalid', name: 'Ann Android', mid: 'm_ann', teams: ['Worship Team'], book: true },
  ivy: { email: 'ivy.iphone@example.invalid', name: 'Ivy Iphone', mid: 'm_ivy', teams: ['Kids Church'], book: true },
  pam: { email: 'pam.parent@example.invalid', name: 'Pam Parent', book: false }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k]; if (!x.book) continue;
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const tokens = () => readDb(async (db) => (await getDocs(collection(db, 'pushTokens'))).docs.map(d => ({ id: d.id, ...d.data() })));
const prefs = (uid) => readDb(async (db) => { const s = await getDoc(doc(db, 'notifyPrefs', uid)); return s.exists() ? s.data() : null; });

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  iphone17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphone161: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1'
};
/* A pretend phone: what it is called, whether it is on the Home Screen,
   and what its notification permission is and will be. */
async function phone(who, kind, o) {
  o = o || {};
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-' + kind + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b);
  const p = await b.newPage();
  await GUARD.protect(p, who + ':' + kind);
  await p.setUserAgent(UA[kind]);
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument((k, o) => {
    try { sessionStorage.setItem(k, '1'); } catch (e) {}
    if (o.standalone) Object.defineProperty(navigator, 'standalone', { get: () => true });
    window.__perm = o.perm || 'default';
    window.__EGBC_NOTIFY_DRIVER = {
      supported: () => true,
      permission: () => window.__perm,
      ask: () => { window.__perm = o.answer || 'granted'; return Promise.resolve(window.__perm); },
      token: () => Promise.resolve('fcm-invented-token-' + 'x'.repeat(60) + (o.tok || '1')),
      forget: () => Promise.resolve(true)
    };
  }, 'egbc_fresh_' + STAMP, o);
  p.on('pageerror', e => errors.push(who + ':' + kind + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await p.goto(URLB + 'notifications.html', { waitUntil: 'networkidle2' });
  await p.waitForSelector('#state .card h2, #iphone-guide', { timeout: 20000 });
  browsers.push(b);
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const errors = [], browsers = [];

try {
  /* 1. Android */
  const A = await phone('ann', 'android');
  ok('1. ANDROID: "Turn on notifications on this phone"', !!(await A.$('#n-on')) && /Turn on notifications/.test(await text(A, '#state')));
  await until(() => A.$('#switches'));
  const sw = await A.$$eval('#switches [data-type]', xs => xs.map(x => x.dataset.type + ':' + x.checked));
  ok('   the switches, each on to begin with: the six launch messages', J(sw) === J(['callParent:true', 'rota:true', 'booking:true', 'maintJob:true', 'urgent:true', 'checks:true']), J(sw));
  await tap(A, '#n-on');
  await A.waitForSelector('#on');
  const t1 = await until(async () => { const l = await tokens(); return l.length ? l : null; });
  ok('   ON: this phone\'s record, in Ann\'s name, as an Android phone', t1 && t1.length === 1 && t1[0].uid === P.ann.uid && t1[0].platform === 'android'
    && new RegExp('^' + P.ann.uid + '_[A-Za-z0-9_-]{8,64}$').test(t1[0].id) && /^fcm-invented-token-/.test(t1[0].token), J(t1 && t1.map(x => [x.id, x.platform])));
  ok('   and the page says it is on', /On for this phone/.test(await text(A, '#state')));
  await A.$eval('[data-type="rota"]', e => { e.click(); });
  await until(async () => { const p = await prefs(P.ann.uid); return p && p.types.rota === false; });
  await A.$eval('#q-from', e => { e.value = '22:00'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  const pr = await until(async () => { const p = await prefs(P.ann.uid); return p && p.quietFrom === '22:00' ? p : null; });
  ok('   SWITCHES SAVED: the rota reminder off, quiet from 22:00', pr && pr.types.rota === false && pr.types.callParent === true && pr.quietTo === '07:30', J(pr));
  await A.evaluate(() => { EGBCAuth.call = () => Promise.reject(new TypeError('Failed to fetch')); });
  await tap(A, '#n-test');
  await until(async () => /sending function is live/.test(await text(A, '#n-out')));
  ok('   "Send me a test", before the sending function is live: says so plainly', /Test messages start once the sending function is live/.test(await text(A, '#n-out')));
  await A.evaluate(() => { window.__asked = []; EGBCAuth.call = (n, d) => { window.__asked.push(n); return Promise.resolve({ phones: 1 }); }; });
  await tap(A, '#n-test');
  await until(async () => /Sent\. It should arrive/.test(await text(A, '#n-out')));
  ok('   once live: "Sent", by asking notifyTest', J(await A.evaluate(() => window.__asked)) === J(['notifyTest']));
  await A.screenshot({ path: path.join(HERE, 'notify-android-375.png'), fullPage: true });
  await tap(A, '#n-off');
  await A.waitForSelector('#off');
  ok('   TURN OFF ON THIS PHONE: the record goes', (await until(async () => (await tokens()).length === 0 ? 'gone' : null)) === 'gone');

  /* 7. nobody reads a phone's record */
  await tap(A, '#n-on'); await A.waitForSelector('#on');
  const id = (await until(async () => (await tokens())[0]))?.id;
  const peek = await A.evaluate((id) => EGBCAuth.db.collection('pushTokens').doc(id).get().then(() => 'read', e => e.code), id);
  ok('7. NOBODY READS A PHONE\'S RECORD, not even its owner (only the sending function)', peek === 'permission-denied', peek);

  /* 2. iPhone in Safari */
  const I = await phone('ivy', 'iphone17');
  const guide = await text(I, '#state');
  ok('2. IPHONE IN SAFARI: the "Add to Home Screen" guide, four plain steps with pictures', !!(await I.$('#iphone-guide')) && (await I.$$('#iphone-guide ol.steps li img')).length === 4
    && /tap the Share button.*Add to Home Screen.*open EGBC Hub from its new icon.*Turn on notifications/.test(guide), guide.slice(0, 400));
  ok('   and no button that could not work', !(await I.$('#n-on')));
  await I.screenshot({ path: path.join(HERE, 'notify-iphone-guide-375.png'), fullPage: true });

  /* 3. iPhone on the Home Screen */
  const IH = await phone('ivy', 'iphone17', { standalone: true, tok: '2' });
  ok('3. IPHONE ADDED TO THE HOME SCREEN: the button', !!(await IH.$('#n-on')) && !(await IH.$('#iphone-guide')));
  await tap(IH, '#n-on'); await IH.waitForSelector('#on');
  const ti = await until(async () => (await tokens()).find(t => t.uid === P.ivy.uid) || null);
  ok('   on: recorded as an iPhone', ti && ti.platform === 'iphone', J(ti && ti.platform));

  /* 4. too old */
  const IO = await phone('ivy', 'iphone161', { standalone: true });
  ok('4. AN IPHONE OLDER THAN iOS 16.4: "update it first", in plain words', /needs updating first.*iOS 16\.4 or later.*Settings, then General, then Software Update/.test(await text(IO, '#state')) && !(await IO.$('#n-on')));

  /* 5. blocked */
  const AB = await phone('ann', 'android', { perm: 'denied' });
  ok('5. BLOCKED: how to allow them, step by step', /blocked on this phone.*padlock beside the address, then Permissions, then Notifications, then Allow/.test(await text(AB, '#state')) && !(await AB.$('#n-on')));
  const AD = await phone('ann', 'android', { answer: 'denied', tok: '3' });
  await tap(AD, '#n-on');
  await until(async () => /This phone said no/.test(await text(AD, '#state')) || !!(await AD.$('#blocked')));
  ok('   saying no when asked: the page explains, and nothing is recorded for that phone', !(await tokens()).some(t => /3$/.test(t.token)));

  /* 6. a parent not in the address book */
  const PP = await phone('pam', 'android', { tok: '4' });
  await until(() => PP.$('#switches'));
  const psw = await PP.$$eval('#switches [data-type]', xs => xs.map(x => x.dataset.type));
  ok('6. A PARENT NOT IN THE ADDRESS BOOK: "call a parent" only, and told why', J(psw) === J(['callParent']) && /not in the church\'s address book yet/.test(await text(PP, '#switches')), J(psw));
  await tap(PP, '#n-on'); await PP.waitForSelector('#on');
  ok('   and may turn it on (Martin, N-6b)', !!(await until(async () => (await tokens()).find(t => t.uid === P.pam.uid))));

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
