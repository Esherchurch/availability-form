/* The picture library (Martin, 14 Oct 2026). Events window. Invented
   pictures and people only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/picture-library.test.mjs"

   What it proves:
     1. a new picture in the event editor is saved to the library (the tick
        is on by default), and every date of a repeating event, and a copy,
        uses the same picture: ONE file, never uploaded twice
     2. "Choose from library" puts it on another event, with no new file;
        with the tick off, a picture is the event's own and not in the library
     3. the library page: how many events use each picture; rename and tags;
        REPLACE updates every event that uses it; DELETE says first how many
        events use it, and they then show no picture
     4. switched off (pictureLibrary): no library in the editor, and the
        page says so
     5. only an admin adds to the library (the rules)
     6. 375px */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner', BUCKET = PROJECT + '.firebasestorage.app';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-pics-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);

/* Two invented pictures: plain grey squares of different shades. */
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function png(shade) {
  const w = 120, h = 90, ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 0;
  const raw = Buffer.alloc((w + 1) * h, shade); for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PIC_A = path.join(TMP, 'film-club.png'), PIC_B = path.join(TMP, 'film-club-new.png'), PIC_C = path.join(TMP, 'own.png');
fs.writeFileSync(PIC_A, png(90)); fs.writeFileSync(PIC_B, png(170)); fs.writeFileSync(PIC_C, png(220));

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
const P = {
  martin: { email: 'martin.pictures@example.invalid', name: 'Martin Pictures (invented)', mid: 'm_martin', master: true },
  samy: { email: 'samy.member@example.invalid', name: 'Samy Member (invented)', mid: 'm_samy' }
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
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Church (invented)', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const evs = (field, value) => readDb(db => getDocs(query(collection(db, 'calEvents'), where(field, '==', value)))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
const library = () => readDb(db => getDocs(collection(db, 'pictureLibrary'))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
const files = async (prefix) => ((await (await fetch(`http://127.0.0.1:9198/v0/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: { Authorization: 'Bearer owner' } })).json()).items || []).map(i => i.name);

const errors = [], browsers = [];
async function as(who, width = 1280, before) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  if (before) await p.evaluateOnNewDocument(before);
  await p.setViewport({ width, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const tap = (p, sel) => p.$eval(sel, e => e.click());
const local = (days, hh) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hh, 0, 0, 0); const z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(hh) + ':00'; };
const ymdAhead = (days) => local(days, 12).slice(0, 10);

async function newEvent(M, title) {
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newEv', { timeout: 20000 });
  await tap(M, '#newEv');
  await M.waitForSelector('#f_title');
  await val(M, '#f_title', title);
  await val(M, '#f_start', local(7, 18)); await val(M, '#f_end', local(7, 20));
}

try {
  /* ---------- 1. a new picture, saved to the library; a series and a copy ---------- */
  const M = await as('martin');
  await newEvent(M, 'Test film club (invented)');
  await M.select('#f_repeat', '7'); await val(M, '#f_until', ymdAhead(7 + 21));
  ok('1. the editor has "Upload picture" and, next to it, "Choose from library"', !!(await M.$('#f_img')) && /Choose from library/.test(await text(M, '#f_picture')));
  const up = await M.$('#f_img'); await up.uploadFile(PIC_A);
  await M.waitForFunction(() => getComputedStyle(document.getElementById('f_libsave')).display !== 'none');
  ok('   choosing a new picture offers "Save to library", ticked, named after the event', await M.$eval('#f_tolib', e => e.checked) && (await M.$eval('#f_libname', e => e.value)) === 'Test film club (invented)');
  await M.setViewport({ width: 375, height: 900 }); await sleep(300);
  await M.$eval('#f_picture', e => e.scrollIntoView({ block: 'center' }));
  await M.screenshot({ path: path.join(HERE, 'picture-library-editor-375.png') });
  await M.setViewport({ width: 1280, height: 900 });
  await tap(M, '#save');
  const series = await until(async () => { const l = await evs('title', 'Test film club (invented)'); return l.length === 4 && l.every(e => e.imageLibId) ? l : null; }, 25000);
  const lib1 = await library();
  ok('   saved: the picture is in the library, once', lib1.length === 1 && lib1[0].name === 'Test film club (invented)' && /^library\/pic_/.test(lib1[0].path), J(lib1));
  ok('   EVERY DATE OF THE REPEATING EVENT points to it, with the same picture', !!series && series.every(e => e.imageLibId === lib1[0].id && e.image === lib1[0].url), J(series && series.map(e => e.imageLibId)));
  ok('   ONE FILE: nothing uploaded twice', (await files('library/')).length === 1 && (await files('events/')).length === 0, J(await files('library/')));
  /* A copy of one date. */
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector(`button.open[data-id="${series[0].id}"]`, { timeout: 20000 });
  await tap(M, `button.open[data-id="${series[0].id}"]`);
  await M.waitForSelector('#dup'); await tap(M, '#dup');
  await M.waitForSelector('#f_title'); await tap(M, '#save');
  const copy = await until(async () => (await evs('title', 'Test film club (invented) (copy)'))[0]);
  ok('   a COPY of the event keeps the same library picture, no new file', copy && copy.imageLibId === lib1[0].id && copy.image === lib1[0].url && (await files('library/')).length === 1, J(copy && copy.imageLibId));

  /* ---------- 2. choose from the library; the tick off ---------- */
  await newEvent(M, 'Test cafe club (invented)');
  await tap(M, '#f_lib');
  await M.waitForSelector('#pl-picker [data-pick]');
  await M.setViewport({ width: 375, height: 900 }); await sleep(300);
  await M.screenshot({ path: path.join(HERE, 'picture-library-picker-375.png') });
  await M.setViewport({ width: 1280, height: 900 });
  await val(M, '#pl-q', 'film');
  ok('2. "Choose from library": the pictures, searched by name', (await M.$$eval('#pl-picker [data-pick]', b => b.length)) === 1);
  await tap(M, `#pl-picker [data-pick="${lib1[0].id}"]`);
  await M.waitForSelector('#f_fromlib');
  await tap(M, '#save');
  const cafe = await until(async () => (await evs('title', 'Test cafe club (invented)'))[0]);
  ok('   the event points to the library picture, and no file is added', cafe && cafe.imageLibId === lib1[0].id && cafe.image === lib1[0].url && (await files('library/')).length === 1);
  await newEvent(M, 'Test one-off (invented)');
  const up2 = await M.$('#f_img'); await up2.uploadFile(PIC_C);
  await M.waitForSelector('#f_tolib'); await M.$eval('#f_tolib', e => { e.checked = false; });
  await tap(M, '#save');
  const own = await until(async () => { const e = (await evs('title', 'Test one-off (invented)'))[0]; return e && e.image ? e : null; });
  ok('   with the tick off, the picture is the event\'s own, not in the library', own && !own.imageLibId && /events%2F/.test(own.image) && (await library()).length === 1, J(own && own.image));

  /* ---------- 3. the library page ---------- */
  await M.goto(URLB + 'picture-library.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector(`[data-pic="${lib1[0].id}"]`, { timeout: 20000 });
  const usesShown = await text(M, `[data-pic="${lib1[0].id}"] [data-uses]`);
  ok('3. THE LIBRARY PAGE: each picture, and how many events use it (4 dates + a copy + the cafe = 6)', usesShown === 'Used by 6 events', usesShown);
  await val(M, '#n-' + lib1[0].id, 'Film Club (invented)'); await val(M, '#t-' + lib1[0].id, 'film, children');
  await tap(M, `[data-save="${lib1[0].id}"]`);
  const renamed = await until(async () => { const l = await library(); return l[0] && l[0].name === 'Film Club (invented)' ? l[0] : null; });
  ok('   rename it and give it tags', renamed && J(renamed.tags) === J(['film', 'children']), J(renamed));
  await M.setViewport({ width: 375, height: 900 }); await sleep(400);
  await M.screenshot({ path: path.join(HERE, 'picture-library-page-375.png'), fullPage: true });
  ok('6. the library page at 375px does not scroll sideways', (await M.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await M.setViewport({ width: 1280, height: 900 });
  const oldUrl = renamed.url, oldPath = renamed.path;
  const rep = await M.$(`[data-replace="${lib1[0].id}"]`); await rep.uploadFile(PIC_B);
  const replaced = await until(async () => { const l = await library(); return l[0] && l[0].url !== oldUrl ? l[0] : null; }, 20000);
  const users = await until(async () => { const l = await evs('imageLibId', lib1[0].id); return l.length === 6 && l.every(e => e.image === (replaced || {}).url) ? l : null; }, 20000);
  ok('   REPLACE: every event that uses it now shows the new picture', !!replaced && !!users, J({ replaced: !!replaced }));
  ok('   and the old file is gone (still one file)', J(await until(async () => { const f = await files('library/'); return f.length === 1 && f[0] !== oldPath ? f : null; })) !== 'null');
  /* Delete: the page says first how many use it. */
  await M.waitForSelector(`[data-del="${lib1[0].id}"]`);
  await tap(M, `[data-del="${lib1[0].id}"]`);
  await M.waitForSelector('#del-ask');
  ok('   DELETE asks first, on the page, saying how many events use it', /used by 6 events\. They will show no picture until someone picks another one\./.test(await text(M, '#del-ask')) && (await library()).length === 1);
  await tap(M, `[data-delno="${lib1[0].id}"]`);
  ok('   Cancel deletes nothing', !(await M.$('#del-ask')) && (await library()).length === 1);
  await tap(M, `[data-del="${lib1[0].id}"]`); await M.waitForSelector(`[data-delyes="${lib1[0].id}"]`); await tap(M, `[data-delyes="${lib1[0].id}"]`);
  const gone = await until(async () => (await library()).length === 0 ? 'gone' : null);
  const plain = await until(async () => { const l = (await evs('title', 'Test cafe club (invented)')).concat(await evs('title', 'Test film club (invented)')); return l.length === 5 && l.every(e => !e.image && !e.imageLibId) ? l : null; });
  ok('   deleted: the events that used it show no picture (the plain card)', gone === 'gone' && !!plain);
  ok('   and its file is gone', (await until(async () => (await files('library/')).length === 0 ? 'none' : null)) === 'none');
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector(`button.open[data-id="${cafe.id}"]`, { timeout: 20000 }); await tap(M, `button.open[data-id="${cafe.id}"]`);
  await M.waitForSelector('#f_picture');
  ok('   the cafe\'s editor: no picture shown, "Upload picture" and "Choose from library" ready', !(await M.$('#f_imgprev img')) && /Choose from library/.test(await text(M, '#f_picture')));

  /* ---------- 4. switched off ---------- */
  const OFF = () => { Object.defineProperty(window, 'EGBCChurch', { configurable: true, get() { return undefined; },
    set(v) { v.uses = (n) => n !== 'pictureLibrary'; Object.defineProperty(window, 'EGBCChurch', { value: v, writable: true, configurable: true }); } }); };
  const O = await as('martin', 1280, OFF);
  await O.goto(URLB + 'picture-library.html', { waitUntil: 'networkidle2' });
  await O.waitForSelector('#pl-off', { timeout: 20000 });
  ok('4. SWITCHED OFF (pictureLibrary): the library page says so', /switched off/.test(await text(O, '#pl-off')));
  await O.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await O.waitForSelector('#newEv', { timeout: 20000 }); await tap(O, '#newEv'); await O.waitForSelector('#f_picture');
  ok('   and the editor has "Upload picture" only: no "Choose from library", no tick', !(await O.$('#f_lib')) && !(await O.$('#f_tolib')) && !!(await O.$('#f_img')));

  /* ---------- 5. the rules ---------- */
  const S = await as('samy');
  const memberTry = await S.evaluate((uid) => EGBCAuth.db.collection('pictureLibrary').doc('pic_sneak').set({ name: 'x', tags: [], url: 'https://example.invalid/x.jpg', path: 'library/pic_sneak/x.jpg',
    width: 1, height: 1, createdAt: 'x', createdBy: uid, updatedAt: 'x', updatedBy: uid }).then(() => 'written', e => e.code), P.samy.uid);
  ok('5. a member cannot add to the library', /permission/.test(memberTry), memberTry);
  const pathTry = await M.evaluate((uid) => EGBCAuth.db.collection('pictureLibrary').doc('pic_x').set({ name: 'x', tags: [], url: 'https://example.invalid/x.jpg', path: 'library/pic_other/x.jpg',
    width: 1, height: 1, createdAt: 'x', createdBy: uid, updatedAt: 'x', updatedBy: uid }).then(() => 'written', e => e.code), P.martin.uid);
  ok('   nor can an admin file it under another picture\'s folder', /permission/.test(pathTry), pathTry);

  ok('no page threw an error', errors.length === 0, errors.join(' | '));
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
