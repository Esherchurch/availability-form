/* PRESENT: a PowerPoint deck, presented to everyone at once (F-242). Events window.
   Invented people and invented decks only, events emulators only (with the
   hub's functions), network guard. The converter is the real code
   (converter/convert.mjs) with ONLY the LibreOffice step stood in for: the
   stand-in draws each slide in a browser. Say when the real one is needed.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/present.test.mjs"

   What it proves:
     1. A LEADER ADDS A POWERPOINT to a session: one file; the slides and the
        speaker notes come out of it in one step; a hidden slide is left out
     2. ...or fetches it from a OneDrive link, presented like an upload
     3. PRESENTING: the leader presses Present; the team's phones and the TV
        follow; Next moves EVERYONE, at once (timed)
     4. the presenter sees now, next, notes, timer, thumbnails; viewers never
        get the notes (the rules)
     5. browse on your own, then "Back to presenter"
     6. WEAK WI-FI: a phone that drops off keeps its slide, and catches up on
        the right one when it is back; the slides were all fetched ahead
     7. take over: another leader presents; the first sees who
     8. someone outside the group sees nothing; Storage refuses the slides
     9. before switch-over nothing is converted or fetched
     10. at their best: screenshots of the presenter and the viewer, computer
         and 375px, and the TV
     11. VIDEO IN THE SLIDES (F-251): a slide's own video comes out of the file,
         plays over the slide where it sits, IN STEP on the presenter's screen,
         the phones and the TV; only the presenter plays, pauses, starts again;
         a phone that skips ahead is put back; it streams (asked for in ranges);
         someone joining late starts at the right second; a video set to play by
         itself does; a YouTube link is kept as a link; the rules refuse a viewer */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { inventDeck, readPptx, readZip } from '../../converter/pptx.mjs';
import { handleConvert } from '../../converter/convert.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-pres-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
const BUCKET = 'egbc-worship-planner.firebasestorage.app';
if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore(), bucket = getStorage().bucket();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
const J = (x) => JSON.stringify(x);

/* ---------- the invented decks ---------- */
const DECK = [
  { title: 'Welcome to Kids Church', notes: 'Say hello to everyone by name.\nPoint out the new faces.' },
  { title: 'Born again?', notes: 'John 3: Nicodemus comes at night.' },
  { title: 'A hidden slide', hidden: true, notes: 'Never shown' },
  { title: 'What does it mean?', notes: '' },
  { title: 'Let\u2019s pray', notes: 'Keep it short: they are hungry.' }
];
const DECK_FILE = inventDeck(DECK);
const LINK_FILE = inventDeck([{ title: 'From OneDrive', notes: 'Fetched from a share link' }, { title: 'Second', notes: '' }]);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__share/deck.pptx') { res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }); res.end(LINK_FILE); return; }
  /* a church SharePoint "Can view" link, as Microsoft's behaves (20 Oct, the 729 MB deck):
     the link sets a cookie and goes to the viewer; the download is refused without it */
  if (p === '/__sp/deck') {
    const q = new URL(req.url, 'http://x').searchParams;
    if (q.get('download') === '1') {
      if (/(^|;\s*)FedAuth=invented-cookie/.test(req.headers.cookie || '')) { res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }); res.end(LINK_FILE); }
      else { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('403 FORBIDDEN'); }
      return;
    }
    res.writeHead(302, { 'Set-Cookie': 'FedAuth=invented-cookie; path=/; HttpOnly', Location: '/__sp/viewer' }); res.end(); return;
  }
  if (p === '/__sp/viewer') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<p>Microsoft viewer (invented)</p>'); return; }
  /* a deck over the limit (the test's limit is 1 MB; the real one 1 GB) */
  if (p === '/__big/deck.pptx') { const b = Buffer.alloc(2 * 1048576, 1); b.write('PK', 0); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(b.length) }); res.end(b); return; }
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

/* The converter, the real code, with LibreOffice stood in for: each shown
   slide drawn in a browser (1920 and 320 wide). */
const drawB = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
const drawP = await drawB.newPage();
const COLOURS = ['#3d6263', '#7a5f4a', '#3b4a7a', '#5b3d6a', '#2f5d3a'];
async function standInRender(buf, shown) {
  const z = readZip(buf), titles = readPptx(buf).slides.filter(s => !s.hidden).map((s, i) => ((z.text(s.file) || '').match(/<a:t>([^<]*)<\/a:t>/) || [])[1] || 'Slide ' + (i + 1));
  const out = [];
  for (let i = 0; i < shown.length; i++) {
    const pics = await drawP.evaluate((t, n, c) => {
      const mk = (w) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(w * 9 / 16); const x = cv.getContext('2d');
        const g = x.createLinearGradient(0, 0, w, cv.height); g.addColorStop(0, c); g.addColorStop(1, '#0f1a1b'); x.fillStyle = g; x.fillRect(0, 0, w, cv.height);
        x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '700 ' + Math.round(w / 60) + 'px Arial'; x.fillText('KIDS CHURCH \u00b7 INVENTED', w * 0.07, cv.height * 0.32);
        x.fillStyle = '#fff'; x.font = '800 ' + Math.round(w / 18) + 'px Arial'; x.fillText(t, w * 0.07, cv.height * 0.48);
        x.font = '600 ' + Math.round(w / 40) + 'px Arial'; x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText('Slide ' + n, w * 0.07, cv.height * 0.85);
        return cv.toDataURL('image/jpeg', 0.86).split(',')[1]; };
      return [mk(1920), mk(320)];
    }, (titles[i] || ('Slide ' + (i + 1))), i + 1, COLOURS[i % COLOURS.length]);
    out.push({ full: Buffer.from(pics[0], 'base64'), thumb: Buffer.from(pics[1], 'base64'), w: 1920, h: 1080 });
  }
  return out;
}
/* its web service, for presentConvert to call (presentSettings/test, emulator only) */
const conv = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', async () => {
    try { const { deckId, link } = JSON.parse(raw); const r = await handleConvert({ db, bucket, deckId, link, render: standInRender, allowLocal: true, kind: /\/__sp\//.test(link || '') ? 'sharepoint' : undefined, max: /\/__big\//.test(link || '') ? 1048576 : undefined }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r)); }
    catch (e) { res.writeHead(422, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
  });
});
await new Promise(r => conv.listen(5612, '127.0.0.1', r));

/* ---------- the church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  karen: { name: 'Karen Leader (invented)', mid: 'm_karen', teams: ['Kids Church'] },
  lois:  { name: 'Lois Leader (invented)', mid: 'm_lois', teams: ['Kids Church'] },
  tom:   { name: 'Tom Team (invented)', mid: 'm_tom', teams: ['Kids Church'] },
  nina:  { name: 'Nina Elsewhere (invented)', mid: 'm_nina', teams: ['Welcome'] },
  vera:  { name: 'Vera Late (invented)', mid: 'm_vera', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.pres@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
for (const name of ['Kids Church', 'Welcome']) await db.collection('teams').doc(name).set({ name, label: name, rota: true, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church' });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
await db.collection('presentSettings').doc('test').set({ converterUrl: 'http://127.0.0.1:5612' });
await db.collection('planGroups').doc('pg_kids').set({ name: 'Kids Church', kind: 'children', leaderIds: ['m_karen', 'm_lois'], teamName: 'Kids Church' });
await db.collection('planSessions').doc('ps_1').set({ groupId: 'pg_kids', date: '2026-11-01', title: 'Born again?', parts: [{ id: 'p1', title: 'Welcome', show: [] }], updatedBy: P.karen.uid });

const errors = [], browsers = [];
async function as(who, w = 375, h = 812) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: w, height: h });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const onStage = (pg) => pg.$eval('#pzStage .layer.on img', e => e.getAttribute('alt')).catch(() => '');
const SHOTS = HERE;

try {
  /* ---------- 9 first: before switch-over ---------- */
  const karen = await as('karen', 1440, 860);
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: false });
  await db.collection('presentDecks').doc('dk_held01').set({ context: { type: 'session', groupId: 'pg_kids', sessionId: 'ps_1' }, name: 'Held', status: 'uploaded', source: 'upload', by: P.karen.uid, byName: 'x', at: 'x' });
  const held = await karen.evaluate(() => EGBCAuth.call('presentConvert', { deckId: 'dk_held01' }).then(() => 'converted', e => e.message));
  ok('9. BEFORE SWITCH-OVER nothing is converted (the second guard, after the page)', /when the hub goes live/.test(held), held);
  await karen.goto(URLB + 'session-planner.html?s=ps_1', { waitUntil: 'networkidle2' });
  const hasPart = await until(() => karen.$('.part .ph'));
  if (hasPart) { await karen.evaluate(() => document.querySelector('.part .ph').click()); await until(() => karen.$('[data-addstep]')); await karen.select('[data-addstep]', 'pptx'); await until(() => karen.$('.sheet')); }
  ok('   and the planner’s PowerPoint step says so, with nothing to upload', !!hasPart && (/can be added when the hub goes live/.test(await text(karen, '.sheet')) && !(await karen.$('#stFile'))), await text(karen, '.sheet'));
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });

  /* ---------- 1. a leader adds a PowerPoint ---------- */
  /* (from a page that loads Storage: present.html, which says there is nothing to show yet) */
  await karen.goto(URLB + 'present.html?s=ps_1', { waitUntil: 'networkidle2' });
  await until(async () => /nothing to show yet/.test(await text(karen)));
  ok('   an empty session says so, kindly', /This session has nothing to show yet/.test(await text(karen)));
  const t0 = Date.now();
  const made = await karen.evaluate(async (b64) => {
    const ref = EGBCAuth.db.collection('presentDecks').doc();
    await ref.set({ context: { type: 'session', groupId: 'pg_kids', sessionId: 'ps_1' }, name: 'Born again (invented)', status: 'uploaded', source: 'upload', by: EGBCAuth.user().uid, byName: 'Karen', at: new Date().toISOString() });
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    await EGBCAuth.storage().ref('present/' + ref.id + '/source.pptx').put(u, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    const r = await EGBCAuth.call('presentConvert', { deckId: ref.id });
    return { id: ref.id, r: r && r.data !== undefined ? r.data : r };
  }, DECK_FILE.toString('base64'));
  const deck = (await db.collection('presentDecks').doc(made.id).get()).data();
  ok('1. ONE POWERPOINT FILE -> its slides, in one step: 4 shown (the hidden one left out)', deck.status === 'ready' && deck.count === 4 && made.r.count === 4, J({ deck, r: made.r }));
  const notes = (await db.collection('presentNotes').doc(made.id).get()).data();
  ok('   and the speaker notes, from the same file, slide by slide', J(notes.notes) === J(['Say hello to everyone by name.\nPoint out the new faces.', 'John 3: Nicodemus comes at night.', '', 'Keep it short: they are hungry.']), J(notes.notes));
  const [files] = await bucket.getFiles({ prefix: 'present/' + made.id + '/' });
  ok('   pictures for the screen and small previews for weak Wi-Fi', ['s1.jpg', 's4.jpg', 't1.jpg', 't4.jpg', 'source.pptx'].every(n => files.some(f => f.name.endsWith('/' + n))) && !files.some(f => f.name.endsWith('/s5.jpg')), files.map(f => f.name.split('/').pop()).join());
  console.log('        (converted in ' + (Date.now() - t0) + ' ms with the stand-in)');
  /* the session's step */
  await db.collection('planSessions').doc('ps_1').update({ parts: [{ id: 'p1', title: 'Welcome', show: [{ id: 's1', type: 'pptx', deckId: made.id, name: 'Born again (invented)', count: 4 }, { id: 's2', type: 'text', words: 'Memory verse: John 3:16 (invented slide)' }] }] });

  /* ---------- 2. from a OneDrive link ---------- */
  const fromLink = await karen.evaluate(async (url) => {
    const ref = EGBCAuth.db.collection('presentDecks').doc();
    await ref.set({ context: { type: 'session', groupId: 'pg_kids', sessionId: 'ps_1' }, name: 'From OneDrive (invented)', status: 'uploaded', source: 'onedrive', by: EGBCAuth.user().uid, byName: 'Karen', at: new Date().toISOString() });
    const r = await EGBCAuth.call('presentFromLink', { deckId: ref.id, url });
    return { id: ref.id, r: r && r.data !== undefined ? r.data : r };
  }, URLB + '__share/deck.pptx');
  const ld = (await db.collection('presentDecks').doc(fromLink.id).get()).data();
  ok('2. A ONEDRIVE LINK: the file fetched and presented like an upload (2 slides)', ld.status === 'ready' && ld.count === 2 && ld.source === 'onedrive', J(ld));
  const badLink = await karen.evaluate(() => EGBCAuth.call('presentFromLink', { deckId: 'dk_held01', url: 'https://example.com/x.pptx' }).then(() => 'ok', e => e.message));
  ok('   a link that is not OneDrive or SharePoint is refused in words', /OneDrive or SharePoint link/.test(badLink), badLink);
  const viaLink = (url, name) => karen.evaluate(async (url, name) => {
    const ref = EGBCAuth.db.collection('presentDecks').doc();
    await ref.set({ context: { type: 'session', groupId: 'pg_kids', sessionId: 'ps_1' }, name, status: 'uploaded', source: 'onedrive', by: EGBCAuth.user().uid, byName: 'Karen', at: new Date().toISOString() });
    const r = await EGBCAuth.call('presentFromLink', { deckId: ref.id, url }).then(x => 'ok', e => e.message);
    return { id: ref.id, r };
  }, url, name);
  const sp = await viaLink(URLB + '__sp/deck', 'SharePoint (invented)');
  const spd = (await db.collection('presentDecks').doc(sp.id).get()).data();
  ok('   A CHURCH SHAREPOINT "CAN VIEW" LINK: the cookie it sets is kept, so the download is allowed (403 without it)', spd.status === 'ready' && spd.count === 2, J({ r: sp.r, spd }));
  const big = await viaLink(URLB + '__big/deck.pptx', 'Too big (invented)');
  const bigd = (await db.collection('presentDecks').doc(big.id).get()).data();
  ok('   A LINK OVER THE LIMIT is refused in words, before anything is converted', bigd.status === 'failed' && /the most is 1 MB/.test(bigd.why || ''), J({ r: big.r, bigd }));

  /* ---------- 3. presenting ---------- */
  await karen.goto(URLB + 'present.html?s=ps_1', { waitUntil: 'networkidle2' });
  await until(() => karen.$('[data-start]'));
  const tom = await as('tom', 375, 812);
  await tom.goto(URLB + 'present.html?s=ps_1', { waitUntil: 'networkidle2' });
  await until(async () => /Nobody is presenting yet/.test(await text(tom)));
  ok('3. BEFORE PRESENTING: the team see "Nobody is presenting yet"; no Present button for them', !(await tom.$('[data-start]')));
  await tap(karen, '[data-start]');
  await until(() => karen.$('[data-go]'));
  await until(async () => (await onStage(tom)) === 'Slide 1');
  ok('   KAREN PRESSES PRESENT: Tom\u2019s phone shows slide 1, "Following Karen"', (await onStage(tom)) === 'Slide 1' && /Following Karen/.test(await text(tom)));
  await sleep(1500);
  const aheadAt1 = await tom.evaluate(() => performance.getEntriesByType('resource').map(r => decodeURIComponent(r.name)).filter(n => /\/present\/.*alt=media/.test(n)).map(n => n.replace(/\?.*/, '').split('/').pop()));
  const tv = await as('lois', 1280, 720);
  await tv.goto(URLB + 'present.html?s=ps_1&tv=1', { waitUntil: 'networkidle2' });
  await until(async () => (await onStage(tv)) === 'Slide 1');
  ok('   THE TV (&tv=1) shows it full screen, nothing else', (await onStage(tv)) === 'Slide 1' && !(await tv.$('.pz-top')) && !(await tv.$('[data-start]')));
  /* Next: how long until EVERYONE has it */
  const tNext = Date.now();
  await tap(karen, '[data-go]');
  await Promise.all([until(async () => (await onStage(tom)) === 'Slide 2', 5000), until(async () => (await onStage(tv)) === 'Slide 2', 5000)]);
  const lag = Date.now() - tNext;
  ok('   NEXT MOVES EVERYONE AT ONCE: Tom and the TV on slide 2 within ' + lag + ' ms', (await onStage(tom)) === 'Slide 2' && (await onStage(tv)) === 'Slide 2' && lag < 2500, lag);

  /* ---------- 4. the presenter's view; notes never for viewers ---------- */
  await until(async () => /Nicodemus/.test(await text(karen, '[data-notes]')));
  const kt = await text(karen);
  ok('4. THE PRESENTER SEES: everyone\u2019s slide, up next, her notes, the timer, the thumbnails', /Everyone sees this/i.test(kt) && /Up next/i.test(kt) && /Nicodemus comes at night/.test(kt) && !!(await karen.$('[data-timer]')) && (await karen.$$('[data-jump]')).length === 5, kt.slice(0, 300));
  ok('   VIEWERS NEVER SEE THE NOTES', !/Nicodemus/.test(await text(tom)) && !/Nicodemus/.test(await text(tv)));
  const tomNotes = await tom.evaluate((id) => EGBCAuth.db.collection('presentNotes').doc(id).get().then(() => 'read', e => e.code), made.id);
  ok('   and the rules refuse Tom the notes', tomNotes === 'permission-denied', tomNotes);
  await karen.screenshot({ path: path.join(SHOTS, 'present-real-presenter-desk.png') });
  await tom.screenshot({ path: path.join(SHOTS, 'present-real-viewer-375.png') });
  await tv.screenshot({ path: path.join(SHOTS, 'present-real-tv.png') });

  /* ---------- 5. browse on your own ---------- */
  await tap(tom, '[data-browse]'); await until(() => tom.$('[data-prev]'));
  await tap(tom, '[data-prev]');
  await until(async () => (await onStage(tom)) === 'Slide 1');
  ok('5. BROWSE ON MY OWN: Tom goes back to slide 1; the others stay on 2', (await onStage(tom)) === 'Slide 1' && (await onStage(tv)) === 'Slide 2' && /You\u2019re on 1 · Karen Leader \(invented\) is on 2/.test(await text(tom)), await text(tom, '.pz-top'));
  await tap(karen, '[data-go]');
  await until(async () => (await onStage(tv)) === 'Slide 3');
  ok('   Karen moves on; Tom stays where he chose', (await onStage(tom)) === 'Slide 1');
  await tap(tom, '[data-back]');
  await until(async () => (await onStage(tom)) === 'Slide 3');
  ok('   "BACK TO PRESENTER": straight to slide 3', (await onStage(tom)) === 'Slide 3' && /Following/.test(await text(tom)));

  /* ---------- 6. weak Wi-Fi ---------- */
  const fetched = await tom.evaluate(() => performance.getEntriesByType('resource').filter(r => /present%2F.*alt=media/.test(r.name)).length);
  ok('6. EVERY SLIDE WAS FETCHED AHEAD: on slide 1, Tom\u2019s phone already had slide 4 and every preview', ['s4.jpg', 't1.jpg', 't2.jpg', 't3.jpg', 't4.jpg'].every(n => aheadAt1.includes(n)) && fetched >= 8, J({ aheadAt1, fetched }));
  await tom.setOfflineMode(true);
  await tap(karen, '[data-go]');
  await until(async () => (await onStage(tv)) === 'Slide 4');
  await sleep(800);
  ok('   TOM\u2019S WI-FI DROPS: his phone keeps showing slide 3 (no error, no blank)', (await onStage(tom)) === 'Slide 3');
  await tom.setOfflineMode(false);
  await until(async () => (await onStage(tom)) === 'Slide 4', 15000);
  ok('   BACK ON: he catches up on the right slide (4)', (await onStage(tom)) === 'Slide 4');

  /* ---------- 7. take over ---------- */
  const lois = await as('lois', 375, 812);
  await lois.goto(URLB + 'present.html?s=ps_1', { waitUntil: 'networkidle2' });
  await until(() => lois.$('[data-take]'));
  await tap(lois, '[data-take]');
  await until(() => lois.$('[data-go]'));
  await until(async () => !(await karen.$('[data-go]')));
  ok('7. TAKE OVER: Lois presents; Karen\u2019s screen becomes a viewer\u2019s, and says who', !!(await lois.$('[data-go]')) && /Lois Leader \(invented\) presenting/.test(await text(karen)), await text(karen, '.pz-top'));
  await lois.screenshot({ path: path.join(SHOTS, 'present-real-presenter-375.png') });
  await tap(lois, '[data-backs]');
  await until(async () => (await onStage(tom)) === 'Slide 3');
  ok('   and everyone follows Lois', (await onStage(tom)) === 'Slide 3' && (await onStage(karen)) === 'Slide 3');
  await karen.screenshot({ path: path.join(SHOTS, 'present-real-viewer-desk.png') });
  await tap(lois, '[data-stop]');
  await until(async () => /Nobody is presenting yet/.test(await text(tom)));
  ok('   STOP PRESENTING: back to "Nobody is presenting yet" for everyone', /Nobody is presenting yet/.test(await text(tom)));
  const tomWrite = await tom.evaluate(() => EGBCAuth.db.collection('presentNow').doc('ps_ps_1').update({ slide: 0 }).then(() => 'moved', e => e.code));
  ok('   the team cannot move the slides (the rules)', tomWrite === 'permission-denied', tomWrite);

  /* ---------- 1b. in the planner, as Karen would ---------- */
  const deckPath = path.join(TMP, 'born-again-invented.pptx'); fs.writeFileSync(deckPath, DECK_FILE);
  const kp = await as('karen', 375, 812);
  await kp.goto(URLB + 'session-planner.html?s=ps_1', { waitUntil: 'networkidle2' });
  await until(() => kp.$('.part .ph'));
  await kp.evaluate(() => [...document.querySelectorAll('.part .ph')].find(h => /Welcome/.test(h.innerText)).click());
  await until(() => kp.$('[data-addstep]'));
  await kp.select('[data-addstep]', 'pptx');
  await until(() => kp.$('#stFile'));
  const pf = await text(kp, '.sheet');
  ok('1b. THE PLANNER’S POWERPOINT STEP: the file itself, or a OneDrive link; "Keynote or Google Slides? Save it as PowerPoint first."', /PowerPoint file \(\.pptx\)/.test(pf) && /OneDrive or SharePoint/.test(pf) && /Keynote or Google Slides\? Save it as PowerPoint first/.test(pf) && !/PDF/.test(pf), pf.slice(0, 300));
  await (await kp.$('#stFile')).uploadFile(deckPath);
  await kp.$eval('#stN', (e) => { e.value = 'Planner deck (invented)'; });
  await tap(kp, '#stAdd');
  await until(async () => /Planner deck/.test(await text(kp, '[data-steps]')), 30000);
  ok('   ADD IT: the slides are made, and the step is in the part', /Planner deck/.test(await text(kp, '[data-steps]')), await text(kp, '[data-steps]'));
  await kp.screenshot({ path: path.join(SHOTS, 'present-real-planner-step-375.png') });
  await tap(kp, '#save');
  const saved = await until(async () => { const s = (await db.collection('planSessions').doc('ps_1').get()).data(); const st = ((s.parts || []).find(p => p.title === 'Welcome') || {}).show || []; return st.find(x => x.type === 'pptx' && /Planner deck/.test(x.name)); });
  const pd = saved && (await db.collection('presentDecks').doc(saved.deckId).get()).data();
  ok('   SAVED: the step holds its deck, made into 4 slides', saved && pd && pd.status === 'ready' && pd.count === 4, JSON.stringify(saved));
  await kp.browser().close();

  /* ---------- 11. VIDEO IN THE SLIDES (F-251) ---------- */
  for (const b of browsers.splice(0)) await b.close().catch(() => {});
  const CLIP = fs.readFileSync(path.join(HERE, 'fixtures', 'invented-clip.mp4'));
  const VDECK = inventDeck([{ title: 'Before the video' }, { title: 'Watch this', video: CLIP, start: 'click', rect: [0.25, 0.3, 0.5, 0.5] }, { title: 'It plays by itself', video: CLIP, start: 'auto', rect: [0, 0, 1, 1] }, { title: 'A YouTube link', videoLink: 'https://www.youtube.com/watch?v=INVENTED01' }]);
  const vref = db.collection('presentDecks').doc('dk_video01');
  await vref.set({ context: { type: 'session', groupId: 'pg_kids', sessionId: 'ps_v' }, name: 'Video night (invented)', status: 'uploaded', source: 'upload', by: P.karen.uid, byName: 'x', at: 'x' });
  await bucket.file('present/dk_video01/source.pptx').save(VDECK, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const vk = await as('karen', 1440, 860);
  const vr = await vk.evaluate(() => EGBCAuth.call('presentConvert', { deckId: 'dk_video01' }).then(r => r.data || r, e => ({ error: e.message })));
  const vd = (await vref.get()).data() || {}, vm = vd.media || [];
  const vfile = await bucket.file('present/dk_video01/m2-0.mp4').getMetadata().then(m => m[0], () => null);
  ok('11. VIDEO: THE SLIDES\u2019 OWN VIDEOS COME OUT OF THE FILE: slide 2 (on click, where it sits), slide 3 (plays by itself)', vd.status === 'ready' && vd.count === 4
    && vm.some(m => m.shown === 1 && m.src === 'm2-0.mp4' && m.start === 'click' && J(m.rect) === J([0.25, 0.3, 0.5, 0.5]))
    && vm.some(m => m.shown === 2 && m.src === 'm3-0.mp4' && m.start === 'auto'), J({ vr, status: vd.status, why: vd.why, vm }));
  ok('   stored as it was (H.264, streams as it is), beside the slide pictures', vfile && vfile.contentType === 'video/mp4' && +vfile.size === CLIP.length, J(vfile && { t: vfile.contentType, s: vfile.size }));
  ok('   a YouTube link is kept as a link, not fetched', vm.some(m => m.shown === 3 && m.youtube === 'INVENTED01' && !m.src && /youtube\.com/.test(m.link)), J(vm));
  await db.collection('planSessions').doc('ps_v').set({ groupId: 'pg_kids', date: '2026-11-08', title: 'Video night', parts: [{ id: 'p1', title: 'Watch', show: [{ type: 'pptx', deckId: 'dk_video01', name: 'Video night (invented)', count: 4 }] }], updatedBy: P.karen.uid });

  await vk.goto(URLB + 'present.html?s=ps_v', { waitUntil: 'networkidle2' });
  await until(() => vk.$('[data-start]'));
  await tap(vk, '[data-start]');
  await until(() => vk.$('[data-go]'));
  const vt = await as('tom', 375, 812), vtRanges = [];
  vt.on('request', r => { if (/m2-0\.mp4/.test(decodeURIComponent(r.url())) && r.headers().range) vtRanges.push(r.headers().range); });
  await vt.goto(URLB + 'present.html?s=ps_v', { waitUntil: 'networkidle2' });
  const vtv = await as('lois', 1280, 720);
  await vtv.goto(URLB + 'present.html?s=ps_v&tv=1', { waitUntil: 'networkidle2' });
  await until(async () => (await onStage(vt)) === 'Slide 1' && (await onStage(vtv)) === 'Slide 1');
  await tap(vk, '[data-go]');
  await until(async () => (await onStage(vt)) === 'Slide 2' && (await onStage(vtv)) === 'Slide 2');
  await sleep(800);
  /* where is the video on each screen, against the slide picture? */
  const where = (pg) => pg.evaluate(() => {
    const v = document.querySelector('.pz-mhost video'), img = document.querySelector('#pzStage .layer.on img'); if (!v || !img) return null;
    const a = v.parentNode.getBoundingClientRect(), b = img.getBoundingClientRect(), w = b.width, h = Math.min(b.height, b.width * 9 / 16), top = b.top + (b.height - h) / 2;
    return { x: (a.left - b.left) / w, y: (a.top - top) / h, w: a.width / w, h: a.height / h, paused: v.paused, t: v.currentTime, controls: v.controls, muted: v.muted, shown: getComputedStyle(document.querySelector('.pz-mhost')).display };
  });
  const near = (p) => p && Math.abs(p.x - 0.25) < 0.02 && Math.abs(p.y - 0.3) < 0.02 && Math.abs(p.w - 0.5) < 0.02 && Math.abs(p.h - 0.5) < 0.02;
  const w1 = await where(vk), w2 = await where(vt), w3 = await where(vtv);
  ok('   ON THE VIDEO SLIDE: the video sits over the slide where PowerPoint puts it, on the presenter\u2019s screen, the phone and the TV', near(w1) && near(w2) && near(w3), J({ w1, w2, w3 }));
  ok('   it waits for the presenter (on click): nobody\u2019s is playing', w1.paused && w2.paused && w3.paused);
  ok('   viewers get no controls: no Play button, no video controls', !(await vt.$('[data-mplay]')) && !w2.controls && !(await vtv.$('[data-mplay]')) && !!(await vk.$('[data-mplay]')));
  /* play */
  await tap(vk, '[data-mplay="0"]');
  await until(async () => { const a = await where(vt), b = await where(vtv); return a && b && !a.paused && !b.paused && a.t > 0.3; }, 8000);
  await sleep(1500);
  const tk = await where(vk), tt = await where(vt), ttv = await where(vtv);
  ok('   PLAY: it plays on every screen, IN STEP (within a second of the presenter\u2019s)', !tk.paused && !tt.paused && !ttv.paused && Math.abs(tt.t - tk.t) < 1 && Math.abs(ttv.t - tk.t) < 1, J({ k: tk.t, phone: tt.t, tv: ttv.t }));
  ok('   STREAMED: the phone asked for the video in ranges, it did not download it first', vtRanges.length > 0 && /^bytes=/.test(vtRanges[0]), J(vtRanges.slice(0, 3)));
  ok('   SOUND: off on the phone (a room of phones would echo) with "Sound off here" to change it; the TV plays it, or asks for one click', tt.muted && /Sound off here/.test(await text(vt, '[data-mbar]')) && (!ttv.muted || !!(await vtv.$('.pz-tap'))), J({ phoneMuted: tt.muted, tvMuted: ttv.muted, tap: !!(await vtv.$('.pz-tap')) }));
  /* a viewer tries to skip ahead */
  await vt.evaluate(() => { const v = document.querySelector('.pz-mhost video'); v.currentTime = Math.min((v.duration || 6) - 0.2, v.currentTime + 3); });
  await sleep(2600);
  const sk = await where(vk), st2 = await where(vt);
  ok('   A PHONE THAT SKIPS AHEAD IS PUT BACK in step', Math.abs(st2.t - sk.t) < 1.5, J({ presenter: sk.t, phone: st2.t }));
  /* someone joins late */
  const vv = await as('vera', 375, 812);
  await vv.goto(URLB + 'present.html?s=ps_v', { waitUntil: 'networkidle2' });
  await until(async () => { const a = await where(vv); return a && !a.paused && a.t > 0.2; }, 10000);
  const lk = await where(vk), lv = await where(vv);
  ok('   SOMEONE JOINING LATE starts at the right second, not the beginning', lv && !lv.paused && Math.abs(lv.t - lk.t) < 1.5 && lv.t > 1, J({ presenter: lk && lk.t, late: lv && lv.t }));
  await vk.screenshot({ path: path.join(SHOTS, 'present-real-video-presenter-desk.png') });
  await vt.screenshot({ path: path.join(SHOTS, 'present-real-video-phone-375.png') });
  await vtv.screenshot({ path: path.join(SHOTS, 'present-real-video-tv.png') });
  /* pause, then start again */
  await tap(vk, '[data-mplay="0"]');
  await until(async () => { const a = await where(vt), b = await where(vtv); return a && b && a.paused && b.paused; }, 6000);
  await sleep(600);
  const pk = await where(vk), pt = await where(vt), ptv = await where(vtv);
  ok('   PAUSE: every screen stops on the same frame', pk.paused && pt.paused && ptv.paused && Math.abs(pt.t - pk.t) < 0.5 && Math.abs(ptv.t - pk.t) < 0.5, J({ k: pk.t, phone: pt.t, tv: ptv.t }));
  await tap(vk, '[data-mrestart="0"]');
  await until(async () => { const a = await where(vt); return a && !a.paused && a.t < 1.5; }, 6000);
  const rt = await where(vt), rtv = await where(vtv);
  ok('   START AGAIN: back to the beginning for everyone', rt && !rt.paused && rt.t < 1.8 && rtv && rtv.t < 1.8, J({ phone: rt && rt.t, tv: rtv && rtv.t }));
  const tomMedia = await vt.evaluate(() => EGBCAuth.db.collection('presentNow').doc('ps_ps_v').update({ media: { i: 1, k: 0, state: 'paused', at: 5, since: new Date().toISOString() } }).then(() => 'written', e => e.code));
  ok('   the rules: a viewer cannot play, pause or skip anyone else\u2019s video', tomMedia === 'permission-denied', tomMedia);
  const loisMedia = await vtv.evaluate(() => EGBCAuth.db.collection('presentNow').doc('ps_ps_v').update({ media: { i: 1, k: 0, state: 'paused', at: 5, since: new Date().toISOString() } }).then(() => 'written', e => e.code));
  ok('   nor can another leader who is not presenting (she takes over first)', loisMedia === 'permission-denied', loisMedia);
  /* a video set to play by itself */
  await tap(vk, '[data-go]');
  await until(async () => (await onStage(vt)) === 'Slide 3');
  const au = await until(async () => { const a = await where(vt), b = await where(vtv); return a && b && !a.paused && !b.paused && a.t > 0.2 ? { a, b } : null; }, 8000);
  ok('   A VIDEO SET TO PLAY BY ITSELF does, on every screen, when the slide comes', !!au, J(au));
  /* near its end: once it has finished, it stays finished (it does not start again) */
  await vk.evaluate(() => EGBCAuth.db.collection('presentNow').doc('ps_ps_v').update({ media: { i: 2, k: 0, state: 'playing', at: 19, since: new Date().toISOString() } }));
  await sleep(4000);
  const e1 = await where(vt), e2 = await where(vtv), e3 = await where(vk);
  ok('   A FINISHED VIDEO STAYS FINISHED on every screen (it does not start again)', [e1, e2, e3].every(x => x && x.t > 19 && x.paused), J({ phone: e1 && [e1.t, e1.paused], tv: e2 && [e2.t, e2.paused], presenter: e3 && [e3.t, e3.paused] }));
  ok('   and the presenter\u2019s slides show which have a video (the two, and the YouTube one)', (await vk.$$('[data-film] .vid')).length === 3);
  /* opened from the Menu, with no session */
  await vv.goto(URLB + 'present.html', { waitUntil: 'networkidle2' });
  await until(async () => /Your groups/.test(await text(vv)));
  const ch = await vv.$$eval('a[href^="present.html?s="]', (as) => as.map((a) => a.getAttribute('href') + ' ' + a.innerText.replace(/\s+/g, ' ')));
  ok('12. FROM THE MENU: Present lists the person’s groups’ sessions, the next first, each to open', ch.length >= 2 && /s=ps_1 .*Born again/.test(ch[0]) && ch.some((x) => /s=ps_v .*Video night/.test(x)), J(ch));
  await vv.screenshot({ path: path.join(SHOTS, 'present-real-chooser-375.png') });
  for (const pg of [vk, vt, vtv, vv]) await pg.browser().close().catch(() => {});

  /* ---------- 8. someone outside the group ---------- */
  const nina = await as('nina', 375, 812);
  await nina.goto(URLB + 'present.html?s=ps_1', { waitUntil: 'networkidle2' });
  await sleep(2500);
  ok('8. SOMEONE OUTSIDE THE GROUP sees no slides', !(await nina.$('#pzStage')) && !(await nina.$('[data-start]')));
  ok('   and is told so kindly, not given an error', /a group you’re not part of/.test(await text(nina)) && !/permission|denied|evaluation/i.test(await text(nina)), await text(nina));
  const ninaPic = await nina.evaluate((id) => EGBCAuth.storage().ref('present/' + id + '/s1.jpg').getDownloadURL().then(() => 'read', e => e.code), made.id);
  ok('   and Storage refuses her the pictures', /unauthorized|permission/.test(ninaPic), ninaPic);
  const ninaDeck = await nina.evaluate((id) => EGBCAuth.db.collection('presentDecks').doc(id).get().then(() => 'read', e => e.code), made.id);
  ok('   and the deck', ninaDeck === 'permission-denied', ninaDeck);

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack + ' | page errors: ' + errors.join(' | '));
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await drawB.close().catch(() => {});
  server.close(); conv.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
