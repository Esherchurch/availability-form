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
         and 375px, and the TV */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { inventDeck, readPptx } from '../../converter/pptx.mjs';
import { convertDeck } from '../../converter/convert.mjs';
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
  const titles = readPptx(buf).slides.filter(s => !s.hidden).map((s, i) => DECK.concat([]).filter(x => !x.hidden)[i] ? DECK.filter(x => !x.hidden)[i].title : 'Slide ' + (i + 1));
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
    try { const { deckId } = JSON.parse(raw); const r = await convertDeck({ db, bucket, deckId, render: standInRender }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r)); }
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
  nina:  { name: 'Nina Elsewhere (invented)', mid: 'm_nina', teams: ['Welcome'] }
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
  ok('9. BEFORE SWITCH-OVER nothing is converted (the second guard, after the page)', /switches over/.test(held), held);
  await karen.goto(URLB + 'session-planner.html?s=ps_1', { waitUntil: 'networkidle2' });
  const hasPart = await until(() => karen.$('.part .ph'));
  if (hasPart) { await karen.evaluate(() => document.querySelector('.part .ph').click()); await until(() => karen.$('[data-addstep]')); await karen.select('[data-addstep]', 'pptx'); await until(() => karen.$('.sheet')); }
  ok('   and the planner’s PowerPoint step says so, with nothing to upload', !!hasPart && (/can be added when the church switches over/.test(await text(karen, '.sheet')) && !(await karen.$('#stFile'))), await text(karen, '.sheet'));
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
