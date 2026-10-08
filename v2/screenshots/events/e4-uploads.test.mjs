/* E4 — one-off upload links (NEXT-BRIEF §11), driven through the real pages.
   Events window. Invented people only, events emulators only, network guard.
   The "photos" are the repo's own app icon, copied: nobody is in them.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/e4-uploads.test.mjs"

   What it proves:
     1. an admin makes a link for an event (up to 3 photos) and gets its QR code
     2. a guest, no account, picks two photos and a PDF on a phone: the PDF is
        refused before anything is sent, the two photos go, each into its own
        numbered place, waiting for review
     3. the link's limit holds: one more is allowed, then the link is full
     4. a guest cannot read a photo back, not even one they sent
     5. the admin sees all three waiting, approves two, rejects one; the zip
        holds the two approved; the rejected one is NOT deleted
     6. a switched-off link and an expired link turn people away */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
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
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098 || cfg.emulators.storage.port !== 9198) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-e4-'));

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 300))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

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
const ADMIN = { email: 'admin.photos@example.invalid', name: 'Photo Admin' };
ADMIN.uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN.email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'addressBook', 'm_admin'), { name: ADMIN.name, email: ADMIN.email, markers: ['Core Team'], adminFor: [], masterAdmin: true });
  await setDoc(doc(db, 'users', ADMIN.uid), { memberId: 'm_admin', linkedBy: 'admin', name: ADMIN.name, email: ADMIN.email, teams: ['Core Team'], adminFor: [], masterAdmin: true, status: 'active' });
  const t = Date.now() - 864e5;
  await setDoc(doc(db, 'calEvents', 'ev_p'), { title: 'Test Harvest Party', visibility: 'members', status: 'confirmed', audience: ['members'],
    startLocal: '2026-10-04T15:00', startUtc: t, endUtc: t, location: { kind: 'room', siteId: '', roomIds: [] }, teams: [], createdBy: ADMIN.uid, signupOn: false });
  await setDoc(doc(db, 'uploadLinks', 'up_old_link'), { calEventId: 'ev_p', eventTitle: 'Test Harvest Party', createdBy: ADMIN.uid, createdAt: '2026-09-01',
    expiresAt: new Date(Date.now() - 864e5), maxFiles: 50, active: true, count: 0 });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const storageList = async (prefix) => (await (await fetch(`http://127.0.0.1:9198/v0/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: { Authorization: 'Bearer owner' } })).json()).items || [];

/* The photos: copies of the app icon. And a PDF that is not a photo. */
const ICON = fs.readFileSync(path.join(V2, 'icon-192.png'));
const F = (n) => { const p = path.join(TMP, n); fs.writeFileSync(p, n.endsWith('.pdf') ? '%PDF-1.4 invented\n%%EOF\n' : ICON); return p; };
const p1 = F('party-1.png'), p2 = F('party-2.png'), p3 = F('party-3.png'), p4 = F('party-4.png'), pdf = F('notes.pdf');

const errors = [];
async function browser(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b);
  b.__dl = fs.mkdtempSync(path.join(TMP, label + '-dl-'));
  const s = await b.target().createCDPSession();
  await s.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: b.__dl, eventsEnabled: true });
  return b;
}
async function page(b, label, width) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const text = (p) => p.$eval('body', e => e.innerText);

try {
  /* ---------- 1. the admin makes a link ---------- */
  const aB = await browser('admin'); const A = await page(aB, 'admin');
  await A.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await A.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await A.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await A.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), ADMIN.email);
  await A.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await A.waitForSelector('#showPast');
  await tap(A, '#showPast');
  await A.waitForSelector('.open[data-id="ev_p"]');
  await tap(A, '.open[data-id="ev_p"]');
  await A.waitForSelector('.tab[data-tab="photos"]');
  ok('the event has a Photos tab', !!(await A.$('.tab[data-tab="photos"]')));
  await tap(A, '.tab[data-tab="photos"]');
  await A.waitForSelector('#lMake');
  await val(A, '#lMax', '3');
  await tap(A, '#lMake');
  const link = await until(() => readDb(db => getDocs(query(collection(db, 'uploadLinks'), where('calEventId', '==', 'ev_p')))
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).find(l => l.id !== 'up_old_link'))));
  ok('a link is made: on, empty, up to 3 photos, for 14 days', link && link.active === true && link.count === 0 && link.maxFiles === 3 &&
    Math.round((link.expiresAt.toMillis() - Date.now()) / 864e5) === 14, JSON.stringify(link && { m: link.maxFiles, c: link.count }));
  const box = '.lnk[data-id="' + link.id + '"]';
  await A.waitForSelector(box);
  const url = await A.$eval(box + ' .lurl', e => e.value);
  ok('its address is the upload page with the link\'s key', url === URLB + 'upload.html?k=' + link.id);
  await tap(A, box + ' .lqr');
  ok('it has a QR code to show', !!(await A.$(box + ' .lqrbox svg')));
  ok('and a Copy link button, where Share to WhatsApp will go', !!(await A.$(box + ' .lcopy')));

  /* ---------- 2. a guest sends photos from a phone ---------- */
  const gB = await browser('guest'); const G = await page(gB, 'guest', 390);
  await G.goto(url, { waitUntil: 'networkidle2' });
  await G.waitForSelector('#files');
  ok('the page says nothing is shown until it has been looked at', /Nothing you send is shown anywhere until/.test(await text(G)));
  await (await G.$('#files')).uploadFile(p1, p2, pdf);
  await until(() => G.$eval('#list', e => e.children.length === 3));
  const listed = await G.$eval('#list', e => e.innerText);
  ok('the PDF is refused before anything is sent', /notes\.pdf\s*not a photo/.test(listed), listed);
  ok('the two photos are ready, and the button says two', /Send 2 photos/.test(await G.$eval('#go', e => e.innerText)));
  await val(G, '#nm', 'Guest Synthetic');
  await G.screenshot({ path: path.join(HERE, 'e4-upload-375.png'), fullPage: true });
  await tap(G, '#go');
  await until(() => G.$('#thanks'), 20000);
  ok('the guest is thanked, and told the photos will be looked at', /2 photos sent/.test(await text(G)) && /look at them before they are used/.test(await text(G)));
  await G.screenshot({ path: path.join(HERE, 'e4-upload-thanks-375.png'), fullPage: true });
  const items = (await readDb(db => getDocs(query(collection(db, 'uploadItems'), where('linkId', '==', link.id))))).docs.map(d => d.data());
  ok('each photo has its own numbered place, waiting for review, with the name given',
    items.length === 2 && items.every(i => i.status === 'pending' && i.uploaderName === 'Guest Synthetic') &&
    JSON.stringify(items.map(i => i.slot).sort()) === '[0,1]', JSON.stringify(items));
  ok('and the files are in storage under those numbers', (await storageList('uploads/' + link.id + '/')).map(i => i.name).sort().join() ===
    ['uploads/' + link.id + '/0', 'uploads/' + link.id + '/1'].join());

  /* ---------- 3. the limit ---------- */
  await G.goto(url, { waitUntil: 'networkidle2' });
  await G.waitForSelector('#files');
  await (await G.$('#files')).uploadFile(p3, p4);
  await until(() => G.$eval('#msg', e => /can take 1 more/.test(e.innerText)));
  ok('two more on a link with room for one: asked to choose fewer, and Send is off', /can take 1 more/.test(await G.$eval('#msg', e => e.innerText)) && await G.$eval('#go', e => e.disabled));
  await G.goto(url, { waitUntil: 'networkidle2' });
  await G.waitForSelector('#files');
  await (await G.$('#files')).uploadFile(p3);
  await until(() => G.$eval('#go', e => !e.disabled));
  await tap(G, '#go');
  await until(() => G.$('#thanks'), 20000);
  await G.goto(url, { waitUntil: 'networkidle2' });
  await G.waitForSelector('#closed');
  ok('then the link is full and says so', /taken all the photos it can/.test(await G.$eval('#closed', e => e.innerText)));
  ok('three places taken, no more', (await readDb(db => getDoc(doc(db, 'uploadLinks', link.id)))).data().count === 3);

  /* ---------- 4. a guest cannot read a photo back ---------- */
  const back = await G.evaluate((p) => EGBCAuth.storage().ref(p).getDownloadURL().then(() => 'read').catch(e => e.code || 'refused'), 'uploads/' + link.id + '/0');
  ok('a guest cannot read a photo, not even their own', back !== 'read', back);

  /* ---------- 5. review ---------- */
  await tap(A, '.tab[data-tab="history"]');
  await tap(A, '.tab[data-tab="photos"]');
  await until(() => A.$eval('#nPending', e => e.textContent === '3'));
  ok('all three are waiting', (await A.$eval('#nPending', e => e.textContent)) === '3');
  await until(() => A.$$eval('#photosBody img[data-path]', is => is.length === 3 && is.every(i => i.complete && i.naturalWidth > 0)));
  ok('the admin sees each one', await A.$$eval('#photosBody img[data-path]', is => is.length === 3 && is.every(i => i.naturalWidth > 0)));
  await A.setViewport({ width: 390, height: 900 });
  await A.screenshot({ path: path.join(HERE, 'e4-review-375.png'), fullPage: true });
  await A.setViewport({ width: 1100, height: 900 });
  const ids = items.map(i => i.linkId + '__' + i.slot).sort().concat([link.id + '__2']);
  await tap(A, '.pok[data-id="' + ids[0] + '"]');
  await until(() => A.$eval('#nPending', e => e.textContent === '2'));
  await tap(A, '.pok[data-id="' + ids[1] + '"]');
  await until(() => A.$eval('#nPending', e => e.textContent === '1'));
  await tap(A, '.pno[data-id="' + ids[2] + '"]');
  await until(() => A.$('#nRejected'));
  const st = (await readDb(db => getDocs(query(collection(db, 'uploadItems'), where('linkId', '==', link.id))))).docs.map(d => d.data());
  ok('two approved and one rejected, each with who looked at it',
    st.filter(i => i.status === 'approved').length === 2 && st.filter(i => i.status === 'rejected').length === 1 && st.every(i => i.reviewedBy === ADMIN.uid));
  const left3 = (await storageList('uploads/' + link.id + '/')).map(i => i.name);
  ok('the rejected photo is not deleted', left3.includes('uploads/' + link.id + '/2') && left3.length === 3, JSON.stringify(left3));
  await tap(A, '#zip');
  const zip = await until(() => fs.readdirSync(aB.__dl).find(f => /photos\.zip$/.test(f)), 20000);
  const zbuf = zip ? fs.readFileSync(path.join(aB.__dl, zip)) : Buffer.alloc(0);
  const entries = zbuf.toString('latin1').split('PK\u0001\u0002').length - 1;
  ok('the zip holds the two approved photos, and only those', zbuf.slice(0, 2).toString() === 'PK' && entries === 2, 'entries ' + entries);

  /* ---------- 6. switched off, and expired ---------- */
  await val(A, '#lMax', '50');
  await tap(A, '#lMake');
  const link2 = await until(() => readDb(db => getDocs(query(collection(db, 'uploadLinks'), where('calEventId', '==', 'ev_p')))
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).find(l => l.id !== 'up_old_link' && l.id !== link.id))));
  await A.waitForSelector('.lnk[data-id="' + link2.id + '"] .loff');
  await tap(A, '.lnk[data-id="' + link2.id + '"] .loff');
  await until(async () => (await readDb(db => getDoc(doc(db, 'uploadLinks', link2.id)))).data().active === false);
  await G.goto(URLB + 'upload.html?k=' + link2.id, { waitUntil: 'networkidle2' });
  await G.waitForSelector('#closed');
  ok('a link switched off turns people away', /switched off/.test(await G.$eval('#closed', e => e.innerText)));
  await G.goto(URLB + 'upload.html?k=up_old_link', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#closed');
  ok('an expired link turns people away', /run out/.test(await G.$eval('#closed', e => e.innerText)));
  await aB.close(); await gB.close();
} catch (e) { ok('the run finished', false, e.stack); }

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
