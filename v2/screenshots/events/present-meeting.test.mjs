/* "PRESENT SLIDES" IN A VIDEO MEETING (F-242 section 6, F-247). Events window.
   Invented people and decks only, events emulators only (with the hub's
   functions), network guard. meeting.html is the main window's page and has
   Daily in it, so this drives a stand-in (screenshots/events/meeting-harness.html)
   with meeting.html's layout and the hook exactly as agreed. The converter is
   the real code with only LibreOffice stood in for (as present.test.mjs).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/present-meeting.test.mjs"

   What it proves:
     1. before the hub goes live the host's "Present slides" says so and
        uploads nothing
     2. THE HOST adds a PowerPoint in the meeting; it is made into slides and
        presented at once
     3. EVERYONE ELSE in the meeting sees the slides large, the moment the
        host moves on; no notes, no "Present slides"
     4. the call becomes a strip: beside the slides on a computer, below
        them on a phone; back to the faces when the host stops
     5. the host presents again from "This meeting's slides"
     6. another host takes over; leaving the meeting while presenting stops
     7. an invitee (an Elder) follows; someone not invited keeps the call, no errors
     9-13. THE HOST LETS ONE OTHER PERSON PRESENT (Martin, 21 Oct): refused without
        it (the server and the rules, not only the button); take it back; it
        ends when the host leaves, or when the host's say-so is not renewed
     8. THE SERVER: who may add slides to a meeting is the main window's own
        "may host" test (mayHost) */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-pmeet-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
const BUCKET = 'egbc-worship-planner.firebasestorage.app';
if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore(), bucket = getStorage().bucket();
const { mayPresent } = await import('../../functions/present.js');

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
const J = (x) => JSON.stringify(x);

const DECK_FILE = inventDeck([
  { title: 'Building fund update', notes: 'Thank everyone first.' },
  { title: 'Where the money went', notes: '' },
  { title: 'What comes next', notes: 'Ask for questions.' }
]);
const PPTX = path.join(TMP, 'Building fund update.pptx'); fs.writeFileSync(PPTX, DECK_FILE);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

/* The converter, the real code, with LibreOffice stood in for */
const drawB = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
const drawP = await drawB.newPage();
async function standInRender(buf, shown) {
  const z = readZip(buf), titles = readPptx(buf).slides.filter(s => !s.hidden).map((s, i) => ((z.text(s.file) || '').match(/<a:t>([^<]*)<\/a:t>/) || [])[1] || 'Slide ' + (i + 1));
  const out = [];
  for (let i = 0; i < shown.length; i++) {
    const pics = await drawP.evaluate((t, n) => {
      const mk = (w) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = Math.round(w * 9 / 16); const x = cv.getContext('2d');
        x.fillStyle = '#3b4a7a'; x.fillRect(0, 0, w, cv.height); x.fillStyle = '#fff'; x.font = '800 ' + Math.round(w / 18) + 'px Arial'; x.fillText(t, w * 0.07, cv.height * 0.48);
        x.font = '600 ' + Math.round(w / 40) + 'px Arial'; x.fillText('ELDERSHIP (INVENTED) \u00b7 ' + n, w * 0.07, cv.height * 0.85);
        return cv.toDataURL('image/jpeg', 0.86).split(',')[1]; };
      return [mk(1920), mk(320)];
    }, titles[i] || ('Slide ' + (i + 1)), i + 1);
    out.push({ full: Buffer.from(pics[0], 'base64'), thumb: Buffer.from(pics[1], 'base64'), w: 1920, h: 1080 });
  }
  return out;
}
const conv = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', async () => {
    try { const { deckId, link } = JSON.parse(raw); const r = await handleConvert({ db, bucket, deckId, link, render: standInRender, allowLocal: true }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r)); }
    catch (e) { res.writeHead(422, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
  });
});
await new Promise(r => conv.listen(5612, '127.0.0.1', r));

/* ---------- the church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  max:  { name: 'Max Master (invented)', mid: 'm_max', teams: ['Core Team'], master: true },
  mia:  { name: 'Mia Master (invented)', mid: 'm_mia', teams: ['Core Team'], master: true },
  sam:  { name: 'Sam Elder (invented)', mid: 'm_sam', teams: ['Elders'] },
  olly: { name: 'Olly Lead Elder (invented)', mid: 'm_olly', teams: ['Elders'], adminFor: ['Elders'] },
  hana: { name: 'Hana Office (invented)', mid: 'm_hana', teams: ['Church office'] },
  orla: { name: 'Orla Organiser (invented)', mid: 'm_orla', teams: ['Welcome'] },
  pip:  { name: 'Pip Pending (invented)', mid: 'm_pip', teams: ['Elders'], adminFor: ['Elders'], status: 'pending' }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.meet@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master, attender: true, status: x.status || 'active' });
}
for (const name of ['Core Team', 'Elders', 'Church office', 'Welcome']) await db.collection('teams').doc(name).set({ name, label: name, rota: true, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church' });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: false });
await db.collection('presentSettings').doc('test').set({ converterUrl: 'http://127.0.0.1:5612' });
await db.collection('churchSettings').doc('video').set({ churchId: 'test', rooms: [
  { key: 'Eldership', label: 'Eldership', teams: ['Elders'], hostTeams: [], url: 'https://invented.daily.co/test-eldership' },
  { key: 'CMM', label: 'CMM', teams: ['Church office'], hostTeams: ['Church office', 'Elders'], members: true, url: 'https://invented.daily.co/test-cmm' },
  { key: 'Prayer', label: 'Prayer', teams: ['Core Team'], hostTeams: [], url: 'https://invented.daily.co/test-prayer' }], byType: {},
  /* what the main window's rules read (ensureRooms keeps it beside rooms) */
  roomsByKey: { Eldership: { teams: ['Elders'], hostTeams: [], members: false }, CMM: { teams: ['Church office'], hostTeams: ['Church office', 'Elders'], members: true }, Prayer: { teams: ['Core Team'], hostTeams: [], members: false } } });
await db.collection('events').doc('ev_e1').set({ title: 'Eldership meeting (invented)', date: '2026-11-05', startTime: '19:30', videoRoom: 'Eldership', organiserUid: P.orla.uid });
await db.collection('events').doc('ev_p1').set({ title: 'Prayer (invented)', date: '2026-11-05', startTime: '07:00', videoRoom: 'Prayer', organiserUid: P.orla.uid });

const errors = [], browsers = [], warns = [];
async function as(who, w = 1440, h = 860) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: w, height: h });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('console', m => { if (m.type() === 'warn' || m.type() === 'warning') warns.push(who + ': ' + m.text()); });
  pg.on('dialog', d => { errors.push(who + ' was shown: ' + d.message()); d.accept(); });
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  pg.browserRef = b;
  return pg;
}
const MEET = (host) => URLB + 'screenshots/events/meeting-harness.html?room=Eldership&event=ev_e1' + (host ? '&host=1' : '');
const join = async (pg, host) => { await pg.goto(MEET(host), { waitUntil: 'networkidle2' }); await until(() => pg.evaluate(() => window.__ready === true)); };
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const presenting = (pg) => pg.evaluate(() => document.body.classList.contains('presenting'));
const onStage = (pg) => pg.$eval('#present #pzStage .layer.on img', e => e.getAttribute('alt')).catch(() => '');
const now = async () => (await db.collection('presentNow').doc('mtg_Eldership_ev_e1').get()).data() || null;
/* how the "Present slides" sheet looks, on whatever page hosts it */
const look = (pg) => pg.evaluate(() => {
  const cs = (e) => getComputedStyle(e), p = document.querySelector('.pz-msheet .pz-sin'), r = p.getBoundingClientRect(), close = document.querySelector('.pz-msheet [data-mclose]');
  const msg = document.querySelector('.pz-msheet .pz-smsg');
  return { panel: cs(p).backgroundColor, inView: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
    closeBg: cs(close).backgroundColor, closeColor: cs(close).color, closeOpacity: cs(close).opacity, closeH: Math.round(close.getBoundingClientRect().height),
    rows: [...new Set([...document.querySelectorAll('.pz-msheet .pz-srow'), close.parentElement])].map(e => cs(e).backgroundColor + ' ' + cs(e).borderTopWidth),
    msgPos: msg ? cs(msg).position : 'none', sideways: document.scrollingElement.scrollWidth - innerWidth,
    /* nothing inside sticks out past the panel's edge (a text box 100% wide plus its padding did, on a phone) */
    spill: [...p.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > r.right + 1).map(e => e.tagName + '#' + (e.id || '')).slice(0, 4) };
});
const lookOk = (x) => x.panel === 'rgb(18, 26, 33)' && x.inView && !/255, 255, 255/.test(x.closeBg) && x.closeColor === 'rgb(226, 232, 240)' && +x.closeOpacity === 1 && x.closeH >= 44
  && x.rows.every(c => c === 'rgba(0, 0, 0, 0) 0px') && x.msgPos !== 'absolute' && x.sideways <= 0 && x.spill.length === 0;

try {
  /* ---------- 8 first: the server's answer (no browser) ---------- */
  const ctxE = { type: 'meeting', room: 'Eldership', eventId: 'ev_e1', day: '2026-11-05' };
  const may = async (who, ctx) => mayPresent(db, P[who].uid, ctx || ctxE);
  ok('8. THE SERVER: a master admin may add slides to a meeting', await may('max'));
  ok('   an admin of the room\u2019s team may (Elders\u2019 admin, the Eldership room)', await may('olly'));
  ok('   someone on a room\u2019s host teams may (the office, the members\u2019 meeting)', await may('hana', { type: 'meeting', room: 'CMM', eventId: '', day: '2026-11-05' }));
  ok('   the meeting\u2019s organiser may, in that meeting\u2019s room', await may('orla'));
  ok('   but not in another room with that event', !(await may('orla', { type: 'meeting', room: 'CMM', eventId: 'ev_e1', day: '2026-11-05' })));
  ok('   AN INVITEE WHO IS NOT A HOST may not (Sam, on the Elders)', !(await may('sam')));
  ok('   nor anyone not yet let in (pending), nor anyone in a room that does not exist', !(await may('pip')) && !(await may('olly', { type: 'meeting', room: 'Nowhere', eventId: '', day: '2026-11-05' })));

  /* ---------- 1. before the hub goes live ---------- */
  const max = await as('max');
  await join(max, true);
  ok('1. THE HOST has "Present slides" over the call', await max.$eval('#stage [data-mpresent]', e => e.offsetParent !== null).catch(() => false));
  await tap(max, '[data-mpresent]');
  await until(() => max.$('.pz-msheet [data-mheld]'));
  ok('   BEFORE THE HUB GOES LIVE it says so, and offers nothing to upload', /You can add slides when the hub goes live\./.test(await text(max, '.pz-msheet')) && !/storage|private/.test(await text(max, '.pz-msheet')) && !(await max.$('#mFile')), await text(max, '.pz-msheet'));
  /* THE SHEET LOOKS RIGHT ON meeting.html (its own CSS is in the stand-in; 22 Oct: Close sat faded in a white bar) */
  ok('   THE SHEET, ON A COMPUTER: dark, Close clear (not faded, not in a white bar), all on screen', lookOk(await look(max)), J(await look(max)));
  await max.screenshot({ path: path.join(HERE, 'meeting-sheet-held-desk.png') });
  await max.setViewport({ width: 375, height: 812 }); await sleep(300);
  ok('   ON A PHONE: the same', lookOk(await look(max)), J(await look(max)));
  await max.screenshot({ path: path.join(HERE, 'meeting-sheet-held-375.png') });
  await max.setViewport({ width: 1440, height: 860 }); await sleep(300);
  await tap(max, '[data-mclose]');
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });

  /* ---------- 2. the host adds a PowerPoint, and presents ---------- */
  await join(max, true);
  await tap(max, '[data-mpresent]');
  await until(() => max.$('#mFile'));
  await max.$eval('#mName', e => { e.value = 'Building fund update'; });
  await (await max.$('#mFile')).uploadFile(PPTX);
  await tap(max, '[data-mgo]');
  const live = await until(async () => { const s = await now(); return s && s.presenterUid === P.max.uid && s.deckId ? s : null; }, 60000);
  ok('2. THE HOST ADDS A POWERPOINT in the meeting: made into slides and presented at once', !!live && live.slide === 0 && live.context.type === 'meeting' && live.context.room === 'Eldership', J(live));
  const deck = live && (await db.collection('presentDecks').doc(live.deckId).get()).data();
  ok('   a deck of THIS meeting (its room, its event, its day), 3 slides, by the host', deck && deck.context.room === 'Eldership' && deck.context.eventId === 'ev_e1' && /^\d{4}-\d{2}-\d{2}$/.test(deck.context.day) && deck.count === 3 && deck.by === P.max.uid, J(deck));
  await until(() => max.$('#present [data-go]'));
  await until(async () => /Thank everyone first/.test(await text(max, '#present [data-notes]')));
  ok('   the host gets the presenter\u2019s view: now, next, notes', !!(await max.$('#present [data-go]')) && !!(await max.$('#present #pzNext')) && /Thank everyone first/.test(await text(max, '#present [data-notes]')), await text(max, '#present'));
  ok('   the slides’ pictures came from the Storage emulator (the page loads Storage before egbc-auth.js)', await max.$eval('#present #pzStage .layer.on img', e => /^http:\/\/(localhost|127\.0\.0\.1):9198\//.test(e.src)).catch(() => false), await max.$eval('#present #pzStage .layer.on img', e => e.src).catch(() => ''));

  /* ---------- 3. everyone else follows ---------- */
  const mia = await as('mia');
  await join(mia, false);
  await until(() => presenting(mia));
  await until(async () => /Slide 1/.test(await onStage(mia)));
  ok('3. SOMEONE ELSE IN THE MEETING sees the slides, large', await presenting(mia) && /Slide 1/.test(await onStage(mia)), await onStage(mia));
  ok('   with no notes and no "Present slides"', !(await mia.$('#present [data-notes]')) && !(await mia.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false)) && !/Thank everyone/.test(await text(mia)));
  const t0 = Date.now();
  await tap(max, '#present [data-go]');
  await until(async () => /Slide 2/.test(await onStage(mia)), 5000);
  const lag = Date.now() - t0;
  ok('   the host moves on and they move with him (under 2 s): ' + lag + ' ms', /Slide 2/.test(await onStage(mia)) && lag < 2000, await onStage(mia));

  /* ---------- 4. the layout ---------- */
  const box = (pg, s) => pg.$eval(s, e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; });
  const ds = await box(mia, '#present'), dc = await box(mia, '#stage');
  ok('4. ON A COMPUTER the call is a strip beside the slides (300 wide, on the right)', dc.w >= 290 && dc.w <= 310 && dc.l >= ds.r && ds.w > 900, J({ slides: ds, call: dc }));
  await mia.setViewport({ width: 375, height: 812 });
  await sleep(400);
  const ps = await box(mia, '#present'), pc = await box(mia, '#stage');
  ok('   ON A PHONE the slides are on top and the faces below', pc.t >= ps.b - 1 && pc.h >= 150 && pc.h <= 230 && ps.w >= 340, J({ slides: ps, call: pc }));
  ok('   nothing scrolls sideways at 375px', (await mia.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await mia.screenshot({ path: path.join(HERE, 'meeting-present-viewer-375.png') });
  await max.screenshot({ path: path.join(HERE, 'meeting-present-host-desk.png') });
  await mia.setViewport({ width: 1440, height: 860 });
  await tap(max, '#present [data-stop]');
  await until(async () => !(await presenting(mia)));
  ok('   when the host stops, everyone is back to the faces', !(await presenting(mia)) && !(await presenting(max)) && await mia.$eval('#present', e => getComputedStyle(e).display === 'none'));
  ok('   and the host has "Present slides" again', await max.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false));

  /* ---------- 5. again, from this meeting's slides ---------- */
  await tap(max, '[data-mpresent]');
  await until(() => max.$('.pz-msheet [data-mdeck]'));
  ok('5. "This meeting\u2019s slides": the deck is there to present again', /Building fund update/.test(await text(max, '.pz-msheet [data-mdeck]')));
  await tap(max, '.pz-msheet [data-mdeck]');
  await until(async () => { const s = await now(); return s && s.presenterUid === P.max.uid; });
  await until(async () => /Slide 1/.test(await onStage(mia)));
  ok('   presented again, from the first slide, and the others follow', (await now()).slide === 0 && await presenting(mia) && /Slide 1/.test(await onStage(mia)));

  /* ---------- 6. another host takes over; leaving while presenting stops ---------- */
  await join(mia, true);
  await until(() => mia.$('#present [data-take]'));
  await tap(mia, '#present [data-take]');
  await until(async () => (await now()).presenterUid === P.mia.uid);
  await until(async () => /Mia Master/.test(await max.evaluate(() => document.getElementById('present').dataset.handed || '')));
  ok('6. ANOTHER HOST TAKES OVER, on the same slide, and the first host is told', (await now()).presenterUid === P.mia.uid && (await now()).slide === 0 && /Mia Master \(invented\) is presenting now/.test(await max.evaluate(() => document.getElementById('present').dataset.handed || '')));
  await mia.goto('about:blank');
  await until(async () => !(await now()).presenterUid);
  ok('   SHE LEAVES THE MEETING while presenting: it stops, nobody is left on a slide', !(await now()).presenterUid, J({ now: await now(), warns }));
  await until(async () => !(await presenting(max)));
  ok('   and the host is back to the faces', !(await presenting(max)));

  /* ---------- 7. someone the rules do not let see the slides ---------- */
  await tap(max, '[data-mpresent]');
  await until(() => max.$('.pz-msheet [data-mdeck]'));
  await tap(max, '.pz-msheet [data-mdeck]');
  await until(async () => (await now()).presenterUid === P.max.uid);
  /* the main window's meetingInvitee() (4326c633): an Elder is invited to the Eldership meeting */
  const sam = await as('sam');
  await join(sam, false);
  await until(async () => await presenting(sam) && /Slide 1/.test(await onStage(sam)));
  ok('7. AN ELDER (invited, not a host) follows the slides', await presenting(sam) && /Slide 1/.test(await onStage(sam)), await onStage(sam));
  const hana = await as('hana');
  const before = errors.length;
  await join(hana, false);
  await sleep(2500);
  ok('   SOMEONE NOT INVITED (the office, in the Eldership room) keeps the call: no slides', !(await presenting(hana)) && await hana.$eval('#stage', e => e.offsetParent !== null && e.getBoundingClientRect().height > 300), J(await box(hana, '#stage')));
  ok('   and sees no error', errors.length === before, errors.slice(before).join(' | '));
  const hanaRead = await hana.evaluate((k) => EGBCAuth.db.collection('presentNow').doc(k).get().then(() => 'read', e => e.code), 'mtg_Eldership_ev_e1');
  ok('   (the rules refuse her the shared state)', /permission/.test(hanaRead), hanaRead);
  await hana.browserRef.close(); browsers.splice(browsers.indexOf(hana.browserRef), 1);

  /* ---------- 9. LETTING SOMEONE ELSE PRESENT (Martin, 21 Oct): not without the host's say-so ---------- */
  const KEY = 'mtg_Eldership_ev_e1';
  const allowDoc = async (who) => (await db.collection('presentAllow').doc(KEY + '_' + P[who].uid).get()).data() || null;
  /* a deck Sam might try to convert, made directly (the rules would not even let him make it) */
  await db.collection('presentDecks').doc('dk_samtry').set({ context: { type: 'meeting', room: 'Eldership', eventId: 'ev_e1', day: (await now()).context.day }, name: 'Sam try', status: 'uploaded', source: 'upload', by: P.sam.uid, byName: 'x', at: 'x' });
  ok('9. AN INVITEE NOT LET PRESENT has no "Present slides"', !(await sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false)));
  const samConv0 = await sam.evaluate(() => EGBCAuth.call('presentConvert', { deckId: 'dk_samtry' }).then(() => 'converted', e => e.message || e.code));
  ok('   and THE SERVER REFUSES him (not only a hidden button): no slides made', /Only the people who may present/.test(samConv0), samConv0);
  const samNow0 = await sam.evaluate((k) => EGBCAuth.db.collection('presentNow').doc(k).update({ slide: 2, slideAt: 'x' }).then(() => 'moved', e => e.code), KEY);
  ok('   THE RULES REFUSE him moving the slides', /permission/.test(samNow0), samNow0);
  const samSelf = await sam.evaluate((k, u) => EGBCAuth.db.collection('presentAllow').doc(k + '_' + u).set({ context: { type: 'meeting', room: 'Eldership', eventId: 'ev_e1', day: '2026-11-05' }, key: k, uid: u, name: 'Sam', by: u, at: firebase.firestore.FieldValue.serverTimestamp(), aliveAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => 'allowed himself', e => e.code), KEY, P.sam.uid);
  ok('   nor can he let himself present', /permission/.test(samSelf), samSelf);

  /* ---------- 10. the host lets Sam present ---------- */
  await tap(max, '#present [data-stop]');
  await until(async () => !(await now()).presenterUid);
  await tap(max, '[data-mpresent]');
  await until(() => max.$('.pz-msheet [data-mlet="' + P.sam.uid + '"]'));
  ok('10. THE HOST SEES WHO IS HERE: "Let Sam present"', /Let Sam Elder \(invented\) present/.test(await text(max, '.pz-msheet [data-mpeople]')), await text(max, '.pz-msheet [data-mpeople]'));
  await until(() => max.$('.pz-msheet [data-mmsg]'));
  ok('    THE FULL SHEET (slides, add, people) looks right on a computer', lookOk(await look(max)), J(await look(max)));
  await max.screenshot({ path: path.join(HERE, 'meeting-sheet-host-desk.png') });
  await max.setViewport({ width: 375, height: 812 }); await sleep(300);
  ok('    and on a phone', lookOk(await look(max)), J(await look(max)));
  await max.screenshot({ path: path.join(HERE, 'meeting-sheet-host-375.png') });
  await max.setViewport({ width: 1440, height: 860 }); await sleep(300);
  await tap(max, '.pz-msheet [data-mlet="' + P.sam.uid + '"]');
  await until(async () => (await allowDoc('sam')) && /Take it back/.test(await text(max, '.pz-msheet [data-mpeople]')));
  const a1 = await allowDoc('sam');
  ok('   the say-so is saved: who, by which host, renewed by the server clock', a1 && a1.uid === P.sam.uid && a1.by === P.max.uid && a1.aliveAt && a1.aliveAt.toMillis && a1.key === KEY, J(a1 && { uid: a1.uid, by: a1.by, key: a1.key }));
  await tap(max, '[data-mclose]');
  await until(() => sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false));
  ok('   SAM NOW HAS "Present slides"', await sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false));
  await tap(sam, '[data-mpresent]');
  await until(() => sam.$('#mFile'));
  ok('   and can add slides, or pick this meeting’s', !!(await sam.$('#mFile')) && !!(await sam.$('.pz-msheet [data-mdeck]')) && !(await sam.$('.pz-msheet [data-mpeople]')));
  const PPTX2 = path.join(TMP, 'Elders update.pptx'); fs.writeFileSync(PPTX2, inventDeck([{ title: 'Sam’s update', notes: 'Sam’s own notes' }, { title: 'Sam two', notes: '' }]));
  await (await sam.$('#mFile')).uploadFile(PPTX2);
  await tap(sam, '[data-mgo]');
  const samLive = await until(async () => { const s = await now(); return s && s.presenterUid === P.sam.uid ? s : null; }, 60000);
  ok('   SAM PRESENTS his own PowerPoint: the server made it (his say-so counted)', !!samLive && (await db.collection('presentDecks').doc(samLive.deckId).get()).data().count === 2, J(samLive));
  await until(async () => /Slide 1/.test(await onStage(max)) && await presenting(max));
  ok('   the host and the others follow him', await presenting(max) && /Slide 1/.test(await onStage(max)));
  await until(() => sam.$('#present [data-go]'));
  await tap(sam, '#present [data-go]');
  await until(async () => (await now()).slide === 1);
  ok('   he moves the slides on', (await now()).slide === 1);

  /* ---------- 11. the host takes it back ---------- */
  await tap(max, '[data-mpresent]').catch(() => {});
  if (!(await max.$('.pz-msheet'))) await max.evaluate(() => window.MEET.open());
  await until(() => max.$('.pz-msheet [data-mtakeback]'));
  await tap(max, '.pz-msheet [data-mtakeback]');
  await until(async () => !(await allowDoc('sam')) && !(await now()).presenterUid);
  ok('11. THE HOST TAKES IT BACK: Sam’s presenting stops at once', !(await allowDoc('sam')) && !(await now()).presenterUid, J(await now()));
  await until(async () => !(await sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false)));
  ok('   his "Present slides" goes', !(await sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false)));
  const samNow1 = await sam.evaluate((k, u) => EGBCAuth.db.collection('presentNow').doc(k).update({ presenterUid: u, presenterName: 'Sam', blank: false, updatedBy: u }).then(() => 'presenting', e => e.code), KEY, P.sam.uid);
  ok('   and the rules refuse him starting again', /permission/.test(samNow1), samNow1);
  await db.collection('presentDecks').doc('dk_samtry').set({ status: 'uploaded' }, { merge: true });
  const samConv1 = await sam.evaluate(() => EGBCAuth.call('presentConvert', { deckId: 'dk_samtry' }).then(() => 'converted', e => e.message || e.code));
  ok('   and so does the server', /Only the people who may present/.test(samConv1), samConv1);
  await tap(max, '[data-mclose]').catch(() => {});

  /* ---------- 12. the host leaves: the say-so ends ---------- */
  await max.evaluate((u) => window.MEET.letPresent(u, 'Sam Elder (invented)'), P.sam.uid);
  await until(() => sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false));
  await tap(sam, '[data-mpresent]');
  await until(() => sam.$('.pz-msheet [data-mdeck]'));
  await tap(sam, '.pz-msheet [data-mdeck]');
  await until(async () => (await now()).presenterUid === P.sam.uid);
  ok('12. (Sam presenting again, let by the host)', (await now()).presenterUid === P.sam.uid, J({ now: await now(), sam: await text(sam, '#present'), sheet: await text(sam, '.pz-msheet'), allow: !!(await allowDoc('sam')) }));
  await max.goto('about:blank');
  await until(async () => !(await allowDoc('sam')) && !(await now()).presenterUid);
  ok('    THE HOST LEAVES THE MEETING: the say-so ends, and Sam’s presenting with it', !(await allowDoc('sam')) && !(await now()).presenterUid, J(await now()));
  await until(async () => !(await sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false)));
  ok('    his "Present slides" goes', !(await sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false)));

  /* ---------- 13. a host whose connection is lost: the say-so runs out ---------- */
  await db.collection('presentAllow').doc(KEY + '_' + P.sam.uid).set({ context: { type: 'meeting', room: 'Eldership', eventId: 'ev_e1', day: (await now()).context.day }, key: KEY, uid: P.sam.uid, name: 'Sam', by: P.max.uid,
    at: new Date(Date.now() - 6 * 60000), aliveAt: new Date(Date.now() - 4 * 60000) });
  const samStale = await sam.evaluate((k, u) => EGBCAuth.db.collection('presentNow').doc(k).update({ presenterUid: u, presenterName: 'Sam', blank: false, updatedBy: u }).then(() => 'presenting', e => e.code), KEY, P.sam.uid);
  ok('13. A SAY-SO NOT RENEWED FOR 4 MINUTES (the host lost): the rules refuse it', /permission/.test(samStale), samStale);
  const samConv2 = await sam.evaluate(() => EGBCAuth.call('presentConvert', { deckId: 'dk_samtry' }).then(() => 'converted', e => e.message || e.code));
  ok('    and the server', /Only the people who may present/.test(samConv2), samConv2);
  await sam.reload({ waitUntil: 'networkidle2' }); await until(() => sam.evaluate(() => window.__ready === true));
  await sleep(1500);
  ok('    and Sam’s page offers nothing', !(await sam.$eval('[data-mpresent]', e => e.offsetParent !== null).catch(() => false)));
  const mayStale = await mayPresent(db, P.sam.uid, { type: 'meeting', room: 'Eldership', eventId: 'ev_e1', day: '2026-11-05' });
  await db.collection('presentAllow').doc(KEY + '_' + P.sam.uid).set({ aliveAt: new Date() }, { merge: true });
  const mayFresh = await mayPresent(db, P.sam.uid, { type: 'meeting', room: 'Eldership', eventId: 'ev_e1', day: '2026-11-05' });
  const mayOther = await mayPresent(db, P.hana.uid, { type: 'meeting', room: 'Eldership', eventId: 'ev_e1', day: '2026-11-05' });
  ok('    THE SERVER’S TEST: stale no, fresh yes, someone else’s say-so no', !mayStale && mayFresh && !mayOther, J({ mayStale, mayFresh, mayOther }));

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
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
