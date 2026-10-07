/* E1 — check-in and attendance, driven through the real pages.
   Events window (EVENTS-WINDOW-BRIEF.md). Synthetic people only, and only
   ever the events window's own emulators (8182 / 9098), which this script
   checks before it writes anything.

   Run from v2/, with the browser driver installed without touching
   package.json:

     npm i --no-save puppeteer-core jsqr
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/e1-checkin.test.mjs"

   It serves v2/ itself on localhost:5601 - the port egbc-auth.js maps to the
   events emulators - and uses Chrome from its usual place (or CHROME=...).

   What it proves, in order:
     1. a guest signs up on signup.html; the confirmation email carries one
        QR code per person, and each reads back as that person's code
     2. my-signup.html shows the same codes
     3. TWO phones, each with a camera pointed at the same QR code, scan at
        the same moment: the child is checked in once, the headcount says 1
     4. two phones pressing "Check in" for the same child at the same
        moment: one record, and the headcount is not doubled
     5. the medical flag shows for the child whose answer needs it, and
        only that child
     6. check-out offers the listed collectors; someone not listed needs a
        written reason, and the record says so
     7. walk-ins count against capacity: the event fills, the next is refused
     8. leaders are listed apart; the roll-call groups by room
     9. downloads: CSV and Excel with chosen columns, PDF registers and a
        sign-in sheet; a medical column is logged as sensitive, first
    10. series attendance: people down the side, dates across
    11. headcounts: a count is saved and shown with its total
    12. events-admin.html still opens every tab, and links to check-in
*/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import jsQR from 'jsqr';
import { createGuard } from './guard.mjs';
/* Only localhost and the public script and font sites may be reached; no
   service worker; any reply from elsewhere fails the run (guard.mjs). */
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
const FS_PORT = cfg.emulators.firestore.port, AUTH_PORT = cfg.emulators.auth.port;
const PAGE_PORT = 5601;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = HERE;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-e1-'));

if (FS_PORT !== 8182 || AUTH_PORT !== 9098) throw new Error('Not the events emulators - refusing to write.');

/* ---- results ---- */
const results = [];
function ok(name, pass, why) {
  results.push({ name, pass: !!pass, why });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000, step = 150) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await sleep(step); }
  return last;
}

/* ---- a static server for v2/ on 5601 ---- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(PAGE_PORT, 'localhost', r));
const URLB = 'http://localhost:' + PAGE_PORT + '/';

/* ---- the emulators: prove where we are, then start clean ---- */
const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: FS_PORT },
});
await env.clearFirestore();
await fetch(`http://127.0.0.1:${AUTH_PORT}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

async function makeUser(email) {
  const r = await fetch(`http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'synthetic-only-123', returnSecureToken: true }) });
  return (await r.json()).localId;
}
const ADMIN1 = { email: 'admin.one@example.invalid', name: 'Admin One' };
const ADMIN2 = { email: 'admin.two@example.invalid', name: 'Admin Two' };
ADMIN1.uid = await makeUser(ADMIN1.email);
ADMIN2.uid = await makeUser(ADMIN2.email);

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
const NEXT = new Date(now.getTime() + 7 * 864e5);
const NEXTDAY = NEXT.getFullYear() + '-' + pad(NEXT.getMonth() + 1) + '-' + pad(NEXT.getDate());
/* Started half an hour ago and runs three more hours, so it is "today" for
   the roll-call and not yet over for the booking page, whenever this runs. */
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const START = new Date(Math.max(now.getTime() - 30 * 60e3, new Date(TODAY + 'T00:01').getTime()));
const startUtc = START.getTime();

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [a, id] of [[ADMIN1, 'm_admin1'], [ADMIN2, 'm_admin2']]) {
    await setDoc(doc(db, 'addressBook', id), { name: a.name, email: a.email, markers: ['Core Team'], adminFor: [], masterAdmin: true });
    await setDoc(doc(db, 'users', a.uid), { memberId: id, linkedBy: 'admin', name: a.name, email: a.email,
      teams: ['Core Team'], adminFor: [], masterAdmin: true, status: 'active' });
  }
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_t', name: 'Test Hall', kind: 'room', active: true, order: 1 });
  const ev = (id, day, t) => ({
    title: 'Test Kids Club', description: '', category: 'kids', labels: [], visibility: 'public', status: 'confirmed',
    audience: ['public', 'members'], teams: [], featured: false,
    startLocal: iso(new Date(t)), startUtc: t, endLocal: iso(new Date(t + 3 * 3600e3)), endUtc: t + 3 * 3600e3, allDay: false,
    location: { kind: 'room', siteId: 'site_t', roomIds: ['room_hall'] }, organiserName: 'Admin One',
    overseers: [], overseerUids: [], signupOn: true, capacity: 4, allowSelfCancel: true, donationsOn: false,
    signupScope: 'date', image: '', seriesId: 'ser_test', createdBy: ADMIN1.uid, updatedAt: new Date().toISOString() });
  await setDoc(doc(db, 'calEvents', 'ev_e1'), ev('ev_e1', TODAY, startUtc));
  await setDoc(doc(db, 'calEvents', 'ev_e1b'), ev('ev_e1b', NEXTDAY, startUtc + 7 * 864e5));
  await setDoc(doc(db, 'capacity', 'ev_e1'), { calEventId: 'ev_e1', taken: 0, capacity: 4 });
  await setDoc(doc(db, 'capacity', 'ev_e1b'), { calEventId: 'ev_e1b', taken: 0, capacity: 4 });
  for (const e of ['ev_e1', 'ev_e1b']) {
    await setDoc(doc(db, 'calEvents', e, 'questions', 'q_collect'), { label: 'Who may collect your children?', kind: 'text', per: 'booking', required: false, options: [], order: 1 });
    await setDoc(doc(db, 'calEvents', e, 'questions', 'q_medical'), { label: 'Any medical conditions we should know about?', kind: 'text', per: 'booking', required: false, options: [], order: 3 });
    await setDoc(doc(db, 'calEvents', e, 'questions', 'q_allergy'), { label: 'Allergies or medical needs', kind: 'text', per: 'attendee', required: false, options: [], order: 2 });
  }
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };

/* ---- browsers ---- */
const errors = [];
async function launch(label, extraArgs = []) {
  const dir = fs.mkdtempSync(path.join(TMP, label + '-'));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: dir,
    args: ['--no-first-run', '--use-fake-ui-for-media-stream'].concat(extraArgs) });
  GUARD.watchBrowser(b);
  b.__dl = fs.mkdtempSync(path.join(TMP, label + '-dl-'));
  const s = await b.target().createCDPSession();
  await s.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: b.__dl, eventsEnabled: true });
  return b;
}
/* egbc-shell.js reloads a page once per tab when version.json's stamp
   differs from its own. Marking the tab as already refreshed keeps that
   reload out of the way of the other checks; the F-025 check below opens a
   tab WITHOUT the mark, to prove the reload keeps the rest of the address. */
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^﻿/, '')).stamp;
async function pageOf(b, label, width = 1100, raw = false) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  if (!raw) await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width, height: 900 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  return p;
}
async function signIn(p, who) {
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Page is not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), who.email);
}
/* Pressed in the page rather than at a screen position: the emulator's
   own "emulator mode" strip covers the bottom of a phone-sized screen. */
const tap = (p, sel) => p.$eval(sel, e => e.click());
const toastText = (p) => p.$eval('#toast', t => t.style.display === 'block' ? t.textContent : '').catch(() => '');

try {
  /* ---------- 1. a guest signs up ---------- */
  const guestB = await launch('guest');
  const guest = await pageOf(guestB, 'guest', 390);
  await guest.goto(URLB + 'signup.html?event=ev_e1', { waitUntil: 'networkidle2' });
  ok('the sign-up page is on the events emulator',
    (await guest.evaluate(() => EGBCAuth.db._delegate._settings.host)) === 'localhost:8182');
  await guest.waitForSelector('#nm');
  await guest.type('#nm', 'Parent Synthetic');
  await guest.type('#em', 'parent@example.invalid');
  await guest.type('#att0', 'Child One');
  await guest.type('#a0_q_allergy', 'Peanuts - carries an EpiPen');
  await tap(guest, '#addAtt');
  await guest.waitForSelector('#att1');
  ok('adding a second child keeps the first child’s allergy answer (F-026)',
    (await guest.$eval('#a0_q_allergy', e => e.value)) === 'Peanuts - carries an EpiPen');
  await guest.type('#att1', 'Child Two');
  await guest.type('#a1_q_allergy', 'None');
  await guest.type('#b_q_collect', 'Parent Synthetic, Aunt Invented');
  await guest.type('#b_q_medical', 'Asthma - inhaler in bag');
  await sleep(2700);   /* the form's minimum fill time */
  await tap(guest, '#go');
  const mail = await until(() => guest.evaluate(() => (window.__egbcOutbox || []).slice(-1)[0] || null), 15000);
  const att = (mail && mail.payload && mail.payload.attachments) || [];
  const pngs = att.filter(a => a.type === 'image/png');
  ok('the confirmation email carries one QR code per person (2)', pngs.length === 2, JSON.stringify(att.map(a => a.filename)));
  ok('the calendar file is still attached', att.some(a => a.filename === 'event.ics'));
  ok('the email tells them to show the code', /show these codes at the door/i.test(mail.payload.html));
  const manageKey = (mail.payload.html.match(/my-signup\.html\?key=([a-z0-9]+)/) || [])[1];
  ok('the manage link is in the email', !!manageKey);

  /* Read each attached PNG back with an independent decoder, in Node: the
     page draws it, the pixels come back, jsQR reads them. */
  const decoded = [];
  for (const a of pngs) {
    const px = await guest.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return { w: c.width, h: c.height, d: Array.from(x.getImageData(0, 0, c.width, c.height).data) };
    }, a.content);
    const r = jsQR(Uint8ClampedArray.from(px.d), px.w, px.h);
    decoded.push(r && r.data);
  }
  const expected = [0, 1].map(i => 'EGBC1|ev_e1|' + manageKey.slice(0, 10) + '|' + i);
  ok('each attached code reads back as that person\'s code', JSON.stringify(decoded) === JSON.stringify(expected), JSON.stringify(decoded));
  ok('the code does not carry the whole manage key', decoded.every(d => d && d.indexOf(manageKey) < 0));

  /* ---------- 2. the booking page shows the same codes ---------- */
  await guest.goto(URLB + 'my-signup.html?key=' + manageKey, { waitUntil: 'networkidle2' });
  await guest.waitForSelector('[data-code]');
  const shown = await guest.$$eval('[data-code]', els => els.map(e => e.getAttribute('data-code')));
  ok('the booking page shows the same two codes', JSON.stringify(shown) === JSON.stringify(expected));
  await guest.screenshot({ path: path.join(OUT, 'e1-my-signup-375.png'), fullPage: true });

  /* F-025: the email link, opened in a brand-new tab, the way a guest does.
     The page header reloads it once for a fresh copy; the key must survive. */
  {
    const rawB = await launch('raw');
    const raw = await pageOf(rawB, 'raw', 390, true);
    await raw.goto(URLB + 'my-signup.html?key=' + manageKey, { waitUntil: 'networkidle2' });
    await until(() => raw.evaluate(() => /[?&]v=/.test(location.search)).catch(() => false), 8000);
    await raw.waitForSelector('[data-code]', { timeout: 15000 }).catch(() => {});
    const landed = await raw.evaluate(() => location.search);
    ok('F-025: a fresh tab reloads for a fresh copy and keeps the key',
      /[?&]v=/.test(landed) && landed.indexOf('key=' + manageKey) >= 0 && !!(await raw.$('[data-code]')), landed);
    await rawB.close();
  }

  /* A camera picture of Child One's code, made from the email's own PNG:
     a Y4M video Chrome plays as if it were the phone's camera. */
  const frame = await guest.evaluate(async (b64) => {
    const W = 640, H = 480;
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.imageSmoothingEnabled = false;
    const s = 400; x.drawImage(img, (W - s) / 2, (H - s) / 2, s, s);
    const d = x.getImageData(0, 0, W, H).data, y = new Array(W * H);
    for (let i = 0; i < W * H; i++) y[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    return y;
  }, pngs[0].content);
  const y4m = path.join(TMP, 'child-one.y4m');
  {
    const W = 640, H = 480, Y = Buffer.from(frame), UV = Buffer.alloc((W / 2) * (H / 2), 128);
    const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
    for (let f = 0; f < 20; f++) parts.push(Buffer.from('FRAME\n'), Y, UV, UV);
    fs.writeFileSync(y4m, Buffer.concat(parts));
  }
  await guestB.close();

  /* ---------- 3. two phones scan the same code at the same moment ---------- */
  const cam = ['--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m];
  const aB = await launch('deviceA', cam), bB = await launch('deviceB', cam);
  const A = await pageOf(aB, 'device A', 390), B = await pageOf(bB, 'device B', 390);
  await signIn(A, ADMIN1); await signIn(B, ADMIN2);
  for (const p of [A, B]) {
    await p.goto(URLB + 'checkin.html?event=ev_e1', { waitUntil: 'networkidle2' });
    await p.waitForSelector('#tiles');
  }
  ok('check-in is on the events emulator', (await A.evaluate(() => EGBCAuth.db._delegate._settings.host)) === 'localhost:8182');

  /* The settings, through the page: collectors from the question, the
     allergy answer as a flag at the door. */
  await tap(A, '#sett');
  await A.waitForSelector('#sSave');
  await tap(A, '#sReq');
  await A.select('#sColl', 'q_collect');
  await tap(A, '.sFlag[value="q_allergy"]');
  await tap(A, '#sSave');
  await until(() => readDb(db => getDoc(doc(db, 'checkinSettings', 'ev_e1')).then(s => s.exists())));
  await B.reload({ waitUntil: 'networkidle2' }); await B.waitForSelector('#tiles');
  const tiles = (p) => p.$$eval('#tiles .tile', ts => ts.map(t => t.querySelector('.k').textContent + '=' + t.querySelector('.v').textContent).join(', '));
  ok('before anyone arrives: 2 expected, none in', /In now=0, Expected=2, Not yet arrived=2/.test(await tiles(A)), await tiles(A));

  await Promise.all([tap(A, '#scan'), tap(B, '#scan')]);
  await until(async () => (await A.$eval('#scanResult', e => e.textContent)) && (await B.$eval('#scanResult', e => e.textContent)), 20000);
  await sleep(1500);
  const sa = await A.$eval('#scanResult', e => e.textContent), sb = await B.$eval('#scanResult', e => e.textContent);
  const ckOne = await readDb(db => getDocs(query(collection(db, 'checkins'), where('calEventId', '==', 'ev_e1'))));
  ok('both cameras read the code', /Child One/.test(sa) && /Child One/.test(sb), sa + ' | ' + sb);
  ok('scanned by two phones at once, Child One is checked in once', ckOne.size === 1 && ckOne.docs[0].data().state === 'in',
    ckOne.docs.map(d => d.id + ':' + d.data().state).join(','));
  await until(async () => /In now=1/.test(await tiles(A)) && /In now=1/.test(await tiles(B)));
  ok('both phones show 1 in now', /In now=1/.test(await tiles(A)) && /In now=1/.test(await tiles(B)), (await tiles(A)) + ' | ' + (await tiles(B)));
  await A.screenshot({ path: path.join(OUT, 'e1-checkin-scan-375.png'), fullPage: true });
  await tap(A, '#scan'); await tap(B, '#scan');

  /* ---------- 4. two phones press "Check in" for Child Two together ---------- */
  const twoId = 'ev_e1__' + manageKey + '__1';
  const btn = '.act[data-id="' + twoId + '"]';
  await A.waitForSelector(btn); await B.waitForSelector(btn);
  await Promise.all([tap(A, btn), tap(B, btn)]);
  await sleep(2500);
  const two = await readDb(db => getDocs(query(collection(db, 'checkins'), where('calEventId', '==', 'ev_e1'))));
  ok('pressed on two phones at once, Child Two has one record', two.docs.filter(d => d.id === twoId).length === 1 && two.size === 2);
  await until(async () => /In now=2/.test(await tiles(A)) && /In now=2/.test(await tiles(B)));
  ok('the headcount is 2, not 3', /In now=2, Expected=2, Not yet arrived=0/.test(await tiles(A)), await tiles(A));
  const who = (await readDb(db => getDoc(doc(db, 'checkins', twoId)))).data().inByName;
  ok('the record says which of the two admins checked them in', who === 'Admin One' || who === 'Admin Two', who);

  /* ---------- 5. the medical flag ---------- */
  const oneId = 'ev_e1__' + manageKey + '__0';
  ok('Child One carries the medical flag', !!(await A.$('[data-flag="' + oneId + '"]')));
  ok('Child Two ("None") does not', !(await A.$('[data-flag="' + twoId + '"]')));
  await tap(A, '[data-flag="' + oneId + '"]');
  ok('tapping the flag shows the detail', /EpiPen/.test(await A.$eval('#people', e => e.textContent)));

  /* ---------- 6. check-out to a collector ---------- */
  await tap(A, '.act[data-id="' + oneId + '"]');
  await A.waitForSelector('#doOut');
  const listed = await A.$$eval('input[name="coll"]', els => els.map(e => e.value));
  ok('check-out offers the collectors on the booking', JSON.stringify(listed) === JSON.stringify(['Parent Synthetic', 'Aunt Invented', '__other']), JSON.stringify(listed));
  await tap(A, 'input[name="coll"][value="__other"]');
  await A.type('#collName', 'Stranger Unknown');
  ok('someone not listed is flagged on screen', await A.$eval('#notListed', e => e.style.display !== 'none'));
  await tap(A, '#doOut');
  await sleep(600);
  ok('without a reason, nobody unlisted can collect', (await readDb(db => getDoc(doc(db, 'checkins', oneId)))).data().state === 'in');
  await A.type('#reason', 'Parent phoned the leader to say so');
  await tap(A, '#doOut');
  const outOne = await until(async () => { const d = (await readDb(db => getDoc(doc(db, 'checkins', oneId)))).data(); return d.state === 'out' ? d : null; });
  ok('with a reason, they are checked out and the record says not listed',
    outOne && outOne.collectedBy === 'Stranger Unknown' && outOne.collectorListed === false && /phoned/.test(outOne.overrideReason));
  await tap(A, '.act[data-id="' + twoId + '"]');
  await A.waitForSelector('#doOut');
  await tap(A, 'input[name="coll"][value="Aunt Invented"]');
  await tap(A, '#doOut');
  const outTwo = await until(async () => { const d = (await readDb(db => getDoc(doc(db, 'checkins', twoId)))).data(); return d.state === 'out' ? d : null; });
  ok('a listed collector checks a child out with no reason needed', outTwo && outTwo.collectorListed === true && outTwo.collectedBy === 'Aunt Invented');

  /* ---------- 7. walk-ins fill the event, then stop ---------- */
  async function walk(name) {
    await tap(A, '#walk'); await A.waitForSelector('#wGo');
    await A.type('#wName', name); await tap(A, '#wGo');
    await sleep(1800);
    return toastText(A);
  }
  await walk('Walk In One');
  await walk('Walk In Two');
  const third = await walk('Walk In Three');
  if (await A.$eval('#mBack', e => e.style.display === 'flex')) await tap(A, '[data-close]');
  const cap = (await readDb(db => getDoc(doc(db, 'capacity', 'ev_e1')))).data();
  const walkins = (await readDb(db => getDocs(query(collection(db, 'checkins'), where('calEventId', '==', 'ev_e1'))))).docs.filter(d => d.data().kind === 'walkin');
  ok('two walk-ins take the last two places', cap.taken === 4 && walkins.length === 2, 'taken ' + cap.taken + ', walk-ins ' + walkins.length);
  ok('the third walk-in is refused: the event is full', /full/i.test(third), third);

  /* ---------- 8. a leader, and the roll-call ---------- */
  await tap(A, '#lead'); await A.waitForSelector('#wGo');
  await A.type('#wName', 'Leader Invented'); await tap(A, '#wGo');
  await sleep(1500);
  await until(async () => /In now=2/.test(await tiles(A)));
  ok('leaders are not in the headcount (2 walk-ins in, 2 children out)', /In now=2, Expected=4, Not yet arrived=0, Checked out=2/.test(await tiles(A)), await tiles(A));
  await A.screenshot({ path: path.join(OUT, 'e1-checkin-375.png'), fullPage: true });
  await A.goto(URLB + 'checkin.html?view=rollcall', { waitUntil: 'networkidle2' });
  const rc = await until(() => A.$eval('#wrap', e => /Test Hall/.test(e.textContent) ? e.textContent : ''));
  ok('roll-call lists the room, with its leader apart', /Test Hall/.test(rc) && /Leaders\s*Leader Invented/.test(rc) && /Walk In One/.test(rc) && !/Child One/.test(rc), String(rc).slice(0, 300));
  await A.screenshot({ path: path.join(OUT, 'e1-rollcall-375.png'), fullPage: true });

  /* ---------- 9 and 10. downloads and the series ---------- */
  /* A second date in the series, for the grid: the same family booked,
     Child One came, Child Two did not. */
  const family = (await readDb(db => getDoc(doc(db, 'signups', manageKey)))).data();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore(), k2 = 'key_week_two_0000000000000000000';
    await setDoc(doc(db, 'signups', k2), { ...family, calEventId: 'ev_e1b' });
    await setDoc(doc(db, 'checkins', 'ev_e1b__' + k2 + '__0'), { calEventId: 'ev_e1b', signupKey: k2, attendeeIndex: 0,
      name: 'Child One', kind: 'booked', state: 'in', inAt: NEXTDAY + 'T10:00:00Z', day: NEXTDAY });
  });

  const W = await pageOf(aB, 'downloads', 1100);
  await W.goto(URLB + 'attendance.html?event=ev_e1', { waitUntil: 'networkidle2' });
  await W.waitForSelector('#dlCsv');
  const files = () => fs.readdirSync(aB.__dl).filter(f => !f.endsWith('.crdownload'));
  async function grab(click, match) {
    /* Same name, same folder: Chrome writes over the old file, so clear it
       first and wait for the new one. */
    files().filter(f => match.test(f)).forEach(f => fs.unlinkSync(path.join(aB.__dl, f)));
    await W.click(click);
    return until(() => files().find(f => match.test(f)), 15000);
  }
  const csv1 = await grab('#dlCsv', /who came\.csv$/);
  const text1 = csv1 ? fs.readFileSync(path.join(aB.__dl, csv1), 'utf8') : '';
  ok('CSV: one row per person, with who checked them in and out', text1 && text1.split('\r\n').length === 5 &&
    /"Name","Booked by","Came","Checked in","Checked in by","Checked out","Collected by"/.test(text1) && /Stranger Unknown \(not listed/.test(text1), text1.split('\r\n')[0]);
  ok('the medical columns are left out unless chosen', !/EpiPen|Asthma/.test(text1));
  await tap(W, '.col[value="q_q_allergy"]');
  const csv2 = await grab('#dlCsv', /who came\.csv$/);
  const text2 = fs.readFileSync(path.join(aB.__dl, csv2), 'utf8');
  ok('chosen, the medical column is there', /EpiPen/.test(text2));
  const xl = await grab('#dlXlsx', /\.xlsx$/);
  ok('Excel download is a real workbook', xl && fs.readFileSync(path.join(aB.__dl, xl)).slice(0, 2).toString() === 'PK');
  const reg = await grab('#pdfReg', /register\.pdf$/);
  ok('the printed register is a PDF', reg && fs.readFileSync(path.join(aB.__dl, reg)).slice(0, 4).toString() === '%PDF');
  const regs = await grab('#pdfSeries', /registers\.pdf$/);
  const regsText = regs ? fs.readFileSync(path.join(aB.__dl, regs)).toString('latin1') : '';
  ok('registers for the series: one page per date', (regsText.match(/\/Type \/Page[^s]/g) || []).length === 2);
  const sheet = await grab('#pdfSheet', /sign-in sheet\.pdf$/);
  ok('the walk-in sign-in sheet is a PDF', sheet && fs.readFileSync(path.join(aB.__dl, sheet)).slice(0, 4).toString() === '%PDF');
  const log = (await readDb(db => getDocs(collection(db, 'downloadsLog')))).docs.map(d => d.data());
  ok('every download was logged in the name of the person', log.length >= 6 && log.every(l => l.by === ADMIN1.uid), log.length + ' entries');
  ok('the download with the medical column is logged as sensitive, with its columns',
    log.some(l => l.sensitive === true && l.columns.includes('Allergies or medical needs')) &&
    log.some(l => l.sensitive === false && l.format === 'csv'));

  await until(() => W.$eval('#seriesBody', e => /2 dates/.test(e.textContent)));
  const grid = await W.$$eval('#seriesBody tbody tr', trs => trs.map(t => [...t.cells].map(c => c.textContent).join('|')));
  ok('series grid: people down the side, dates across', JSON.stringify(grid.slice(0, 4)) === JSON.stringify(
    ['Child One|Yes|Yes|2', 'Child Two|Yes|No|1', 'Walk In One|Yes||1', 'Walk In Two|Yes||1']), JSON.stringify(grid));
  await W.setViewport({ width: 390, height: 900 });
  await W.screenshot({ path: path.join(OUT, 'e1-attendance-375.png'), fullPage: true });

  /* ---------- 11. headcounts ---------- */
  await W.goto(URLB + 'headcounts.html', { waitUntil: 'networkidle2' });
  await W.waitForSelector('#hSave');
  await W.$eval('#hAdults', e => { e.value = ''; }); await W.type('#hAdults', '82');
  await W.$eval('#hChildren', e => { e.value = ''; }); await W.type('#hChildren', '21');
  await W.$eval('#hOnline', e => { e.value = ''; }); await W.type('#hOnline', '14');
  await tap(W, '#hSave');
  const row = await until(() => W.$eval('#list tbody', e => e.textContent).catch(() => ''));
  ok('a headcount is saved and totalled', /Sunday morning service\s*82\s*21\s*14\s*117/.test(row), row);
  await W.screenshot({ path: path.join(OUT, 'e1-headcounts-375.png'), fullPage: true });

  /* ---------- 12. events-admin.html: nothing lost ---------- */
  await W.setViewport({ width: 1100, height: 900 });
  await W.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await W.waitForSelector('.open[data-id="ev_e1"]');
  await tap(W, '.open[data-id="ev_e1"]');
  const tabs = [];
  for (const t of ['details', 'signups', 'checklist', 'people', 'history']) {
    await W.waitForSelector('.tab[data-tab="' + t + '"]');
    await tap(W, '.tab[data-tab="' + t + '"]');
    await sleep(300);
    tabs.push(t + ':' + (await W.$eval('#tabBody', e => e.textContent.length > 20)));
  }
  ok('events-admin still opens every tab', tabs.every(t => t.endsWith('true')), tabs.join(' '));
  await tap(W, '.tab[data-tab="people"]');
  await W.waitForSelector('#csv');
  const links = await W.$$eval('#tabBody a.btn', as => as.map(a => a.getAttribute('href')));
  ok('Who is coming links to check-in and registers', links.includes('checkin.html?event=ev_e1') && links.includes('attendance.html?event=ev_e1'), JSON.stringify(links));
  ok('the existing download and email buttons are still there', !!(await W.$('#csv')) && !!(await W.$('#mailAll')));

  /* F-029, Martin's decision: "Download the list" leaves medical answers
     out unless "Include medical details" is ticked, and logs it when it is. */
  const logsBefore = (await readDb(db => getDocs(collection(db, 'downloadsLog')))).size;
  const list1 = await grab('#csv', /who is coming\.csv$/);
  const lt1 = list1 ? fs.readFileSync(path.join(aB.__dl, list1), 'utf8') : '';
  ok('F-029: the list leaves medical answers out by default', lt1 && /Parent Synthetic/.test(lt1) && !/Asthma|EpiPen/.test(lt1) && /Who may collect/.test(lt1), lt1.split('\r\n')[0]);
  ok('F-029: a download without them is not logged', (await readDb(db => getDocs(collection(db, 'downloadsLog')))).size === logsBefore);
  await tap(W, '#csvMed');
  const list2 = await grab('#csv', /who is coming\.csv$/);
  const lt2 = list2 ? fs.readFileSync(path.join(aB.__dl, list2), 'utf8') : '';
  ok('F-029: ticked, the medical answers are in, for each person too', /Asthma - inhaler in bag/.test(lt2) && /Child One: Peanuts - carries an EpiPen/.test(lt2), lt2.split('\r\n')[0]);
  const medLog = (await readDb(db => getDocs(collection(db, 'downloadsLog')))).docs.map(d => d.data()).filter(l => l.what === 'who is coming');
  ok('F-029: and that download is logged as sensitive, in the admin’s name', medLog.length === 1 && medLog[0].sensitive === true &&
    medLog[0].by === ADMIN1.uid && medLog[0].columns.includes('Any medical conditions we should know about?'), JSON.stringify(medLog));

  await aB.close(); await bB.close();
} catch (e) {
  ok('the run finished', false, e.stack);
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join('\n          '));
await env.cleanup();
server.close();
const failed = results.filter(r => !r.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
