/* Event pictures, WHOLE (F-199). Events window. Invented events only,
   events emulators only, network guard. The pictures are made here and
   served from this machine.

   Martin, 15 Oct: "the pictures are not showing against the events on the
   phone app. Just a date card." Then: the event page cropped the picture
   as a wide banner, cutting off a poster's text (the Bereavement Cafe's
   times). "It needs the full image when you open it, without making the
   page too big."

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/app-pictures.test.mjs"

   What it proves:
     1. the app's What's on list: a pictured event shows it, a 56px
        rounded square, where the icon was; one without keeps its icon
     2. the app's event view: the WHOLE picture (never cropped), no taller
        than half the screen, on a blurred copy of itself; none for an
        event without a picture
     3. tap it: full screen, the whole picture on dark; X closes it, Esc
        closes it, and the focus goes back to the picture
     4. the event page (signup.html) on a phone (375px): the whole picture
        (the wide poster AND the tall one), no taller than half the
        screen, on a blurred copy of itself; the details start straight
        underneath
     5. the event page on a computer (1440px): two columns, the picture
        on the left at its own shape (about 35%), the title, details and
        sign-up on the right
     6. the event page: click the picture for full screen; Esc closes it
        and the focus goes back to the picture
     7. no picture: the page as before
     8. whatson.html on a phone: the picture in place of the date card;
        none: the date card. On a computer: as before
     9. a picture address that is not a web address is never drawn */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-apppics-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

/* Made-up pictures. The wide "poster" has red bars at its far left and
   right ends, standing for the times a crop would cut off. */
function png(w, h, paint) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3, c = paint(x, y); raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PICS = {
  'poster.png': png(1600, 500, (x, y) => (x < 120 || x > 1480) ? [190, 40, 40] : (y > 200 && y < 300 ? [255, 255, 255] : [96, 64, 140])),
  'film.png': png(600, 900, (x, y) => (y > 380 && y < 520) ? [214, 168, 64] : [61, 98, 99])
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const m = p.match(/^\/__pic\/(.+)$/);
  if (m && PICS[m[1]]) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(PICS[m[1]]); return; }
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = { ann: { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
const day = (n, h) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; };
const EV = (title, category, when, extra) => ({ title, description: '<p>Invented, for a test. Tea, cake and a quiet space to talk.</p>', category, labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [], featured: false, allDay: false,
  startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 2 * 3600e3)), endUtc: when.getTime() + 2 * 3600e3,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 30, image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
const EVENTS = {
  ev_cafe:  EV('Bereavement Cafe (invented)', 'community', day(2, 14), { image: URLB + '__pic/poster.png' }),
  ev_film:  EV('Kids Film Club (invented)', 'kids', day(3, 16), { image: URLB + '__pic/film.png' }),
  ev_plain: EV('Coffee morning (invented)', 'social', day(4, 10)),
  ev_bad:   EV('Odd picture (invented)', 'social', day(5, 10), { image: 'javascript:alert(1)' })
};
for (const id of Object.keys(EVENTS)) { await db.collection('calEvents').doc(id).set(EVENTS[id]); await db.collection('capacity').doc(id).set({ calEventId: id, taken: 0, capacity: 30 }); }

const errors = [], browsers = [];
async function browser(who, ua, width, height) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  if (ua) await p.setUserAgent(ua);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 375, height: height || 812, isMobile: !!ua, hasTouch: !!ua });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const box = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right), fit: s.objectFit, filter: s.filter, shown: s.display !== 'none' && r.width > 0, loaded: !!(e.complete && e.naturalWidth > 0), nw: e.naturalWidth, nh: e.naturalHeight }; }).catch(() => null);
/* Whole = shown at its own shape, nothing cut off. */
const whole = (b) => b && b.loaded && Math.abs((b.w / b.h) - (b.nw / b.nh)) < 0.03 && b.fit === 'contain';
const loaded = (p, sel) => until(async () => { const b = await box(p, sel); return b && b.loaded ? b : null; });
const app = 'screenshots/events/app-harness.html?space=me&tab=whatson';
const focused = (p) => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('data-w') || a.className || a.tagName) : ''; });

try {
  /* ---------- 1. the app's list ---------- */
  const A = await browser('ann', IPHONE);
  await A.goto(URLB + app, { waitUntil: 'networkidle2' });
  await until(() => A.$('[data-wact="event:ev_film"]'));
  const t1 = await loaded(A, '[data-wact="event:ev_film"] .wo-pic img');
  ok('1. THE APP\'S LIST: Kids Film Club shows its picture, a 56px rounded square', t1 && t1.w === 56 && t1.h === 56 && t1.fit === 'cover', J(t1));
  ok('   the coffee morning (no picture) keeps its icon', !(await A.$('[data-wact="event:ev_plain"] img')) && !!(await A.$('[data-wact="event:ev_plain"] .ic')));
  ok('9. a picture address that is not a web address is never drawn (app list)', !(await A.$('[data-wact="event:ev_bad"] img')));
  await A.screenshot({ path: path.join(HERE, 'app-pictures-list-375.png'), fullPage: true });

  /* ---------- 2. the app's event view ---------- */
  await tap(A, '[data-wact="event:ev_cafe"]');
  const a2 = await loaded(A, '[data-w="banner"] img.whole');
  const bg2 = await box(A, '[data-w="banner"] img.bg');
  ok('2. THE APP\'S EVENT: the WHOLE wide poster (not cropped), on a blurred copy of itself', whole(a2) && bg2 && /blur/.test(bg2.filter), J(a2) + J(bg2));
  await tap(A, '[data-wact="list"]'); await until(() => A.$('[data-wact="event:ev_film"]'));
  await tap(A, '[data-wact="event:ev_film"]');
  const a2b = await loaded(A, '[data-w="banner"] img.whole');
  ok('   the tall picture whole too, no taller than half the screen (406px)', whole(a2b) && a2b.h <= 406 && a2b.h >= 380, J(a2b));
  await A.screenshot({ path: path.join(HERE, 'app-pictures-event-375.png'), fullPage: true });

  /* ---------- 3. full screen ---------- */
  await tap(A, '[data-w="banner"]');
  const v3 = await loaded(A, '#egbc-picview img');
  ok('3. TAP IT: full screen, the whole picture on dark', whole(v3) && (v3.w >= 340 || v3.h >= 700) && (await A.$eval('#egbc-picview', e => getComputedStyle(e).position)) === 'fixed', J(v3));
  ok('   the X has the focus', (await A.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'))) === 'Close');
  await A.screenshot({ path: path.join(HERE, 'app-pictures-full-375.png') });
  await tap(A, '#egbc-picview button');
  ok('   X closes it, and the focus goes back to the picture', !(await A.$('#egbc-picview')) && (await focused(A)) === 'banner');
  await tap(A, '[data-w="banner"]'); await until(() => A.$('#egbc-picview'));
  await A.keyboard.press('Escape');
  ok('   Esc closes it, and the focus goes back to the picture', !(await A.$('#egbc-picview')) && (await focused(A)) === 'banner' && !!(await A.$('[data-w="acts"]')));
  await tap(A, '[data-wact="list"]'); await until(() => A.$('[data-wact="event:ev_plain"]'));
  await tap(A, '[data-wact="event:ev_plain"]'); await until(() => A.$('[data-w="acts"]'));
  ok('   an event without a picture: none', !(await A.$('[data-w="banner"]')) && !(await A.$('.egbc-pic')));

  /* ---------- 4. the event page on a phone ---------- */
  const G = await browser('guest', IPHONE);
  for (const [id, name] of [['ev_cafe', 'bereavement'], ['ev_film', 'film']]) {
    await G.goto(URLB + 'signup.html?event=' + id, { waitUntil: 'networkidle2' });
    const g = await loaded(G, '#picOpen img.whole');
    const fig = await box(G, '#picOpen'), h1 = await box(G, 'h1'), wrapTop = await G.$eval('#wrap', w => Math.round(w.getBoundingClientRect().top + parseFloat(getComputedStyle(w).paddingTop)));
    ok('4. THE EVENT PAGE ON A PHONE (' + name + '): the WHOLE picture, no taller than half the screen, the details straight underneath', whole(g) && g.h <= 406 && fig && h1 && h1.y - fig.bottom >= 0 && h1.y - fig.bottom < 60 && Math.abs(fig.y - wrapTop) < 4, J({ g, fig, h1, wrapTop }));
    await G.screenshot({ path: path.join(HERE, 'signup-picture-' + name + '-375.png'), fullPage: false });
  }
  const gbg = await box(G, '#picOpen img.bg');
  ok('   on a blurred, darkened copy of itself filling the width', gbg && /blur/.test(gbg.filter) && /brightness/.test(gbg.filter), J(gbg));

  /* ---------- 5-6. the event page on a computer ---------- */
  const C = await browser('guest', null, 1440, 900);
  for (const [id, name] of [['ev_cafe', 'bereavement'], ['ev_film', 'film']]) {
    await C.goto(URLB + 'signup.html?event=' + id, { waitUntil: 'networkidle2' });
    const c = await loaded(C, '#picOpen img.whole');
    const grid = await box(C, '.evgrid'), fig = await box(C, '#picOpen'), h1 = await box(C, 'h1'), form = await box(C, '#signupCard');
    ok('5. THE EVENT PAGE ON A COMPUTER (' + name + '): the picture on the left at its own shape (about 35%), title and sign-up on the right',
      whole(c) && c.h <= 630 && Math.abs(fig.w / grid.w - 0.35) < 0.03 && h1.x > fig.right && form && form.x > fig.right && Math.abs(h1.y - fig.y) < 30, J({ c, grid: grid && grid.w, fig, h1, form }));
    ok('   no blurred copy on a computer', !(await box(C, '#picOpen img.bg')).shown);
    await C.screenshot({ path: path.join(HERE, 'signup-picture-' + name + '-1440.png'), fullPage: false });
  }
  await tap(C, '#picOpen');
  const v6 = await loaded(C, '#egbc-picview img');
  ok('6. CLICK THE PICTURE: full screen, whole', whole(v6) && v6.h > 600, J(v6));
  await C.keyboard.press('Escape');
  ok('   Esc closes it and the focus goes back to the picture', !(await C.$('#egbc-picview')) && (await focused(C)) === 'picOpen');

  /* ---------- 7. no picture ---------- */
  await C.goto(URLB + 'signup.html?event=ev_plain', { waitUntil: 'networkidle2' });
  await until(() => C.$('h1'));
  const wrapW = await C.$eval('#wrap', w => w.className);
  const p7 = { h1: await box(C, 'h1'), form: await box(C, '#signupCard') };
  ok('7. NO PICTURE: the page as before (one column: no picture, no two-column layout)', !(await C.$('.egbc-pic')) && !/has-pic/.test(wrapW) && !(await C.$('.evgrid.has-pic')) && p7.form && Math.abs(p7.form.x - (p7.h1.x - 21)) < 4, wrapW + J(p7));
  await C.goto(URLB + 'signup.html?event=ev_bad', { waitUntil: 'networkidle2' });
  await until(() => C.$('h1'));
  ok('9. a picture address that is not a web address is never drawn (event page)', !(await C.$('.egbc-pic')) && !(await C.$('img[src^="javascript"]')));

  /* ---------- 8. whatson.html ---------- */
  await G.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => G.$('.ev.has-pic img.thumb'));
  await loaded(G, '.ev.has-pic img.thumb');
  const cards = await G.$$eval('.ev', bs => bs.map(b => { const i = b.querySelector('img.thumb'); return { t: b.querySelector('.t').textContent, pic: !!i, w: i ? Math.round(i.getBoundingClientRect().width) : 0, date: getComputedStyle(b.querySelector('.when')).display !== 'none' }; }));
  ok('8. WHAT\'S ON ON A PHONE: the picture (56px) in place of the date card', cards.some(c => /Kids Film Club/.test(c.t) && c.pic && c.w === 56 && !c.date), J(cards));
  ok('   the coffee morning keeps its date card; the odd address is not drawn', cards.some(c => /Coffee morning/.test(c.t) && !c.pic && c.date) && cards.some(c => /Odd picture/.test(c.t) && !c.pic && c.date), J(cards));
  await G.screenshot({ path: path.join(HERE, 'whatson-pictures-375.png'), fullPage: true });
  await C.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => C.$('.ev.has-pic img.thumb'));
  const c8 = await box(C, '.ev.has-pic img.thumb');
  const dates = await C.$$eval('.ev .when', ws => ws.every(w => getComputedStyle(w).display !== 'none'));
  ok('   on a computer as before: the picture (88 x 62) and every date card', c8 && c8.w === 88 && c8.h === 62 && dates, J(c8));

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
