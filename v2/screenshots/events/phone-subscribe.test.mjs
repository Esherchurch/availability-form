/* Subscribe to What's on FROM A PHONE (F-197; Martin: "there is no link
   to that calendar from the phone"). Events window. Invented people and
   events only, events emulators only (with the hub's functions), network
   guard, nothing emailed.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/phone-subscribe.test.mjs"

   What it proves, at 375px wide with an iPhone's and an Android's own
   browser names:
     1. the app's What's on: "Add What's on to my phone's calendar", which
        opens the Subscribe card
     2. on an iPhone, ONE BIG BUTTON, "Add to my phone's calendar": the
        webcal:// link, for the public events to start with
     3. the link really is a calendar: what the phone's calendar would
        fetch is text/calendar with the public events, and nothing else
     4. categories: ticking Music narrows the link and the calendar
     5. "my own link": the button now carries the person's own key, and
        that calendar has their team's event too; asked for the moment
        the app opens (before the sign-in has settled), it still comes
     6. "Copy the link" puts the very same link on the clipboard (for
        Google Calendar, which takes it on a computer)
     7. ANDROID (F-198; Martin's phone: webcal does nothing there): no
        webcal button. "Add it once on a computer", the Google and Outlook
        steps, the https link, a big Copy, and "Then on your phone ...
        Sync on"
     8. "Email me the link": to the signed-in person's OWN address only,
        whatever the page asks; their own link in it when chosen; refused
        signed out; a few an hour at most
     9. the hub's What's on page (whatson.html): the iPhone button on an
        iPhone, the Android steps on Android (no email button signed
        out), and on a computer Google / Apple or Outlook / Copy

   What it cannot prove: the hand-off itself (iPhone's "Subscribe to
   calendar?"). That needs a real phone (Martin's iPhone: fine). */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-phonesub-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

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
const P = { wendy: { email: 'wendy.welcome@example.invalid', name: 'Wendy Welcome', mid: 'm_wendy', teams: ['Welcome'] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid', hubUrl: URLB });
const day = (n, h) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };
const EV = (title, category, when, extra) => ({ title, description: '', category, labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [], featured: false, allDay: false,
  startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 2 * 3600e3)), endUtc: when.getTime() + 2 * 3600e3,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, image: '', createdBy: 'x', updatedAt: '2026-10-01T10:00:00.000Z', ...(extra || {}) });
await db.collection('calEvents').doc('e_supper').set(EV('Harvest supper (invented)', 'social', day(3, 18)));
await db.collection('calEvents').doc('e_organ').set(EV('Organ recital (invented)', 'music', day(4, 15)));
await db.collection('calEvents').doc('e_team').set(EV('WELCOME TEAM briefing (invented)', 'other', day(5, 9), { visibility: 'team', audience: ['Welcome'], teams: ['Welcome'] }));

const errors = [], browsers = [];
async function browser(who, ua, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  await b.defaultBrowserContext().overridePermissions(URLB.slice(0, -1), ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  if (ua) await p.setUserAgent(ua);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 375, height: 812, isMobile: !!ua, hasTouch: !!ua });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const tap = (p, sel) => p.$eval(sel, e => e.click());
const href = (p) => p.$eval('#subPhone', a => a.getAttribute('href')).catch(() => '');
/* What the phone's calendar app fetches: the same link, over https (here http). */
const calendar = async (webcal) => { const r = await fetch(webcal.replace(/^webcal:/, 'http:')); return { type: r.headers.get('content-type') || '', text: await r.text() }; };
const app = 'screenshots/events/app-harness.html?space=me&tab=whatson';

try {
  /* ---------- 1-2. the app, on an iPhone ---------- */
  const W = await browser('wendy', IPHONE);
  await W.goto(URLB + app, { waitUntil: 'networkidle2' });
  await until(() => W.$('[data-wact="subscribe"]'));
  ok('1. THE APP\'S WHAT\'S ON: "Add What\'s on to my phone\'s calendar"', /Add What's on to my phone's calendar/.test(await text(W, '[data-wact="subscribe"]')));
  await tap(W, '[data-wact="subscribe"]');
  await until(() => W.$('#subPhone'));
  const h1 = await href(W);
  ok('2. ON A PHONE, ONE BIG BUTTON: "Add to my phone\'s calendar", the webcal:// link to the public events', /Add to my phone's calendar/.test(await text(W, '#subPhone')) && h1.startsWith('webcal://localhost:5102/' + PROJECT + '/europe-west2/eventsFeed?church=1') && !(await W.$('#subApple')), h1);
  const big = await W.$eval('#subPhone', a => { const r = a.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  ok('   big: the width of the card, at least 52px tall', big.w > 300 && big.h >= 52, JSON.stringify(big));
  const c1 = await calendar(h1);
  ok('3. IT REALLY IS A CALENDAR: text/calendar, the public events, never the team\'s', /text\/calendar/.test(c1.type) && /BEGIN:VCALENDAR/.test(c1.text) && /Harvest supper/.test(c1.text) && /Organ recital/.test(c1.text) && !/WELCOME TEAM/.test(c1.text), c1.type + ' ' + c1.text.slice(0, 200));

  /* ---------- 4. categories ---------- */
  await tap(W, 'input.subCat[value="music"]');
  await until(async () => /cat=music/.test(await href(W)));
  const c2 = await calendar(await href(W));
  ok('4. TICK MUSIC: the link and the calendar narrow to the recital', /&cat=music$/.test(await href(W)) && /Organ recital/.test(c2.text) && !/Harvest supper/.test(c2.text), await href(W));
  ok('   and the box stays ticked', await W.$eval('input.subCat[value="music"]', c => c.checked));
  await tap(W, 'input.subCat[value="music"]');
  await until(async () => !/cat=/.test(await href(W)));

  /* ---------- 5. my own link ---------- */
  await tap(W, 'input[name="subWho"][value="mine"]');
  await until(async () => /[?]k=/.test(await href(W)));
  const h3 = await href(W), m3 = await text(W, '#subMsg').catch(() => '');
  const c3 = await calendar(h3);
  ok('5. MY OWN LINK: the button carries Wendy\'s own key, and her calendar has her team\'s briefing', /^webcal:\/\/localhost:5102\/.*eventsFeed\?k=[A-Za-z0-9]{20,}$/.test(h3) && /WELCOME TEAM briefing/.test(c3.text) && /Harvest supper/.test(c3.text), h3 + ' | message: ' + m3);
  ok('   with "keep it to yourself" and Reset', /keep it to yourself/.test(await text(W, '[data-w="subscribe"]')) && !!(await W.$('#subReset')));
  await W.screenshot({ path: path.join(HERE, 'phone-subscribe-app-375.png'), fullPage: true });

  /* The flake (15 Oct): asked before the sign-in has settled. */
  const R = await browser('wendy', IPHONE);
  await R.goto(URLB + app, { waitUntil: 'domcontentloaded' });
  await R.waitForFunction(() => window.EGBCEvents && EGBCEvents.subscribeAct);
  const early = await R.evaluate(() => { const st = { signedIn: true, mine: '', cats: [] }; const before = !!(firebase.auth(firebase.app('egbc')).currentUser); return EGBCEvents.subscribeAct('sub:who:mine', st).then(() => ({ before, mine: st.mine, msg: st.msg })); });
  ok('   ASKED THE MOMENT THE APP OPENS (sign-in not settled yet): the own link still comes', /^[A-Za-z0-9]{20,}$/.test(early.mine), JSON.stringify(early));

  /* ---------- 6. copy ---------- */
  await tap(W, '#subCopy');
  await until(async () => /Copied/.test(await text(W, '#subCopy')));
  const clip = await W.evaluate(() => navigator.clipboard.readText()).catch(e => 'unreadable: ' + e.message);
  ok('6. COPY THE LINK: the very same link (https form) on the clipboard, and how to use it in Google', clip === h3.replace(/^webcal:/, 'http:') && /Google Calendar on a computer/.test(await text(W, '#subMsg')), clip);

  /* ---------- 7. Android ---------- */
  const A = await browser('wendy', ANDROID);
  await A.goto(URLB + app, { waitUntil: 'networkidle2' });
  await until(() => A.$('[data-wact="subscribe"]'));
  await tap(A, '[data-wact="subscribe"]');
  await until(() => A.$('#subAndroid'));
  const at = await text(A, '[data-w="subscribe"]');
  ok('7. ANDROID: NO webcal button; "add it once on a computer and it appears on your phone"', !(await A.$('#subPhone')) && !(await A.$('#subApple')) && !(await A.$('a[href^="webcal:"]')) && /On Android, add it once on a computer and it appears on your phone/.test(at), at.slice(0, 300));
  ok('   IT LEADS WITH THE APP: "Everything coming up is always in What\'s on in this app." first; the computer set-up underneath, marked optional', /^Everything coming up is always in What's on in this app\.$/.test(await A.$eval('[data-w="subscribe"] > :first-child', e => e.textContent)) && /Also in Google Calendar or Outlook \(optional\)/.test(at) && at.indexOf('always in What') < at.indexOf('Google Calendar or Outlook (optional)'), at.slice(0, 300));
  ok('   NEVER the one-off .ics download as subscribe: no download, no .ics, no data: link in the card', !(await A.$('[data-w="subscribe"] a[download], [data-w="subscribe"] a[href*=".ics"], [data-w="subscribe"] a[href^="data:"], [data-w="subscribe"] a[href^="blob:"]')) && !/Add to my calendar/.test(at));
  ok('   the Google steps (calendar.google.com, Other calendars +, From URL) and Outlook\'s (outlook.com, Add calendar, Subscribe from web)', /calendar\.google\.com/.test(at) && /"Other calendars", click \+, then "From URL"/.test(at) && /outlook\.com/.test(at) && /"Add calendar", then "Subscribe from web"/.test(at), at);
  ok('   and "Then on your phone: Google Calendar > Settings > the new calendar > Sync on"', /Then on your phone: Google Calendar > Settings > the new calendar > Sync on/.test(at));
  const au = await A.$eval('#subUrl', e => e.textContent);
  const cb = await A.$eval('#subCopy', b => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, primary: b.classList.contains('primary') }; });
  ok('   the https link shown, and a BIG Copy button', /^http:\/\/localhost:5102\/.*eventsFeed\?church=1$/.test(au) && !cb.primary && cb.w > 300 && cb.h >= 52, au + ' ' + JSON.stringify(cb));
  await tap(A, '#subCopy');
  await until(async () => /Copied/.test(await text(A, '#subCopy')));
  const aclip = await A.evaluate(() => navigator.clipboard.readText()).catch(e => 'unreadable: ' + e.message);
  ok('   Copy puts that same https link on the clipboard', aclip === au, aclip);

  /* ---------- 8. email me the link ---------- */
  await tap(A, 'input[name="subWho"][value="mine"]');
  await until(async () => /k=/.test(await A.$eval('#subUrl', e => e.textContent)));
  const own = await A.$eval('#subUrl', e => e.textContent);
  await A.screenshot({ path: path.join(HERE, 'phone-subscribe-android-375.png'), fullPage: true });
  await tap(A, '#subEmail');
  await until(async () => /Sent to your email/.test(await text(A, '#subMsg')));
  const rows = async () => (await db.collection('emailOutbox').where('kind', '==', 'calendar link').get()).docs.map(d => d.data());
  const m1 = (await until(async () => { const r = await rows(); return r.length ? r : null; })) || [];
  ok('8. EMAIL ME THE LINK: sent to Wendy\'s own address, with her own link and the steps', m1.length === 1 && JSON.stringify(m1[0].to) === JSON.stringify([P.wendy.email]) && m1[0].html.includes(own) && /From URL/.test(m1[0].html) && /Subscribe from web/.test(m1[0].html) && /keep it to yourself/.test(m1[0].html) && /Sent to your email/.test(await text(A, '#subMsg')), JSON.stringify(m1).slice(0, 400));
  const sneaky = await A.evaluate(() => EGBCAuth.call('emailMyFeedLink', { mine: false, to: 'someone.else@example.invalid', email: 'someone.else@example.invalid' }).then(() => 'sent', e => e.message));
  const m2 = await until(async () => { const r = await rows(); return r.length === 2 ? r : null; }) || await rows();
  ok('   ASKED TO SEND IT TO SOMEONE ELSE: it still goes only to Wendy (the public link this time)', sneaky === 'sent' && m2.length === 2 && m2.every(r => JSON.stringify(r.to) === JSON.stringify([P.wendy.email])) && m2.some(r => /church=1/.test(r.html)) && !JSON.stringify(m2).includes('someone.else'), JSON.stringify(m2.map(r => r.to)));
  const lots = []; for (let i = 0; i < 4; i++) lots.push(await A.evaluate(() => EGBCAuth.call('emailMyFeedLink', {}).then(() => 'sent', e => e.message)));
  ok('   a few an hour at most: the 6th is refused, in words', lots.slice(0, 3).every(x => x === 'sent') && /sent a few times already/.test(lots[3]), JSON.stringify(lots));
  const anon = await fetch('http://127.0.0.1:5102/' + PROJECT + '/europe-west2/emailMyFeedLink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) }).then(r => r.json());
  ok('   signed out: refused', anon.error && /UNAUTHENTICATED/.test(anon.error.status), JSON.stringify(anon));
  ok('   logged for Emails sent (source events-feed, kind calendar link)', m1[0] && m1[0].source === 'events-feed');

  /* ---------- 9. the hub's What's on page ---------- */
  const G = await browser('guest', IPHONE);
  await G.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => G.$('#subBtn'));
  await tap(G, '#subBtn');
  await until(() => G.$('#subPhone'));
  const h4 = await href(G);
  ok('9. WHAT\'S ON (whatson.html) ON AN IPHONE: the big webcal button, public events', h4.startsWith('webcal://localhost:5102/') && /church=1/.test(h4) && !(await G.$('#subApple')) && !(await G.$('#subAndroid')), h4);
  await G.screenshot({ path: path.join(HERE, 'phone-subscribe-whatson-375.png'), fullPage: true });
  const GA = await browser('guest', ANDROID);
  await GA.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => GA.$('#subBtn'));
  await tap(GA, '#subBtn');
  await until(() => GA.$('#subAndroid'));
  ok('   ON ANDROID: the steps and Copy, no webcal button, and no "Email me" when signed out', !(await GA.$('#subPhone')) && !!(await GA.$('#subCopy')) && !(await GA.$('#subEmail')) && /add it once on a computer/.test(await text(GA, '#subscribe')) && /^Everything coming up is always here, in What's on.$/.test(await GA.$eval('#subLead', e => e.textContent)));
  await GA.screenshot({ path: path.join(HERE, 'phone-subscribe-whatson-android-375.png'), fullPage: true });
  const C = await browser('guest', null, 1100);
  await C.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => C.$('#subBtn'));
  await tap(C, '#subBtn');
  await until(() => C.$('#subApple'));
  ok('   on a computer it keeps Google / Apple or Outlook / Copy, no phone button', !!(await C.$('#subGoogle')) && !!(await C.$('#subCopy')) && !(await C.$('#subPhone')) && !(await C.$('#subAndroid')));

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
