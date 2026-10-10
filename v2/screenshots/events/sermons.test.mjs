/* Sermons and "Listen" (F-124, F-132, F-138; Martin's option 3): Val keeps
   uploading to Spotify for Creators, the hub reads the show's feed, and the
   app's player plays from the feed's own addresses.
   Events window. Invented people and an invented feed only, events
   emulators only, network guard, no email leaves the machine. No real feed
   is fetched: the "podcast" is a feed written below, its audio two minutes
   of silence served from this machine.

   THE FUNCTION IS PLAYED HERE. The hourly read (sermonFeedSync) is the
   main window's to build (F-138); it hands the feed to
   EGBCSermonsFeed.sync() with a store. This test does exactly that, with
   a store on the emulator, so what the function will do is what is tested.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/sermons.test.mjs"

   What it proves:
     1. only master admins and the people they name look after sermons
     2. the feed's address is a setting; each read is reported
     3. READING THE FEED AGAIN NEVER MAKES A SECOND COPY
     4. the series, passage and speaker added in the hub, and a hidden
        episode, survive every read; the feed's own fields can't be changed
        in the hub
     5. the backup: a sermon uploaded by hand
     6. the player plays from the feed, keeps playing when you leave the
        tab, remembers your place on another phone; the Now playing bar is
        told; search by speaker, book or date; a series */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098 || cfg.emulators.storage.port !== 9198) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-srm-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);

/* Two minutes of silence (a WAV the browser can measure and play). */
function wav(seconds) {
  const rate = 8000, n = rate * seconds, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}
const AUDIO_BYTES = wav(120);
const AUDIO = path.join(TMP, 'sermon-silence.wav'); fs.writeFileSync(AUDIO, AUDIO_BYTES);

/* The podcast, invented, shaped like a Spotify for Creators feed. Its
   audio is served from this machine (/__audio/...), with byte ranges, as a
   podcast host serves it, so the player can skip about. */
const A = (n) => 'http://localhost:5601/__audio/ep' + n + '.wav';
const ITEM = (o) => `<item><title><![CDATA[${o.title}]]></title><description><![CDATA[<p>${o.words || 'Invented notes.'}</p>]]></description>` +
  `<guid isPermaLink="false">${o.guid}</guid><pubDate>${o.date}</pubDate><enclosure url="${o.audio}" length="${AUDIO_BYTES.length}" type="audio/wav"/>` +
  `<itunes:duration>00:02:00</itunes:duration></item>`;
const FEED = (items) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title><![CDATA[Test Green Sermons (invented)]]></title><itunes:image href="https://example.invalid/art.jpg"/>${items.map(ITEM).join('')}</channel></rss>`;
const EP1 = { title: 'Grace that scandalises (invented)', guid: 'anchor-ep-0001-invented', date: 'Sun, 07 Sep 2025 10:45:00 GMT', audio: A(1), words: 'Luke 15 (invented).' };
const EP2 = { title: 'Ask and plan (invented)', guid: 'anchor-ep-0002-invented', date: 'Sun, 14 Sep 2025 10:45:00 GMT', audio: A(2) };
const EP3 = { title: 'Rebuilding the walls (invented)', guid: 'anchor-ep-0003-invented', date: 'Sun, 04 Oct 2026 10:45:00 GMT', audio: A(3) };
const EP4 = { title: 'A new one (invented)', guid: 'anchor-ep-0004-invented', date: 'Sun, 05 Oct 2026 18:30:00 GMT', audio: A(4) };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (/^\/__audio\/ep\d+\.wav$/.test(p)) {
    const size = AUDIO_BYTES.length, m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
      res.writeHead(206, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      res.end(AUDIO_BYTES.subarray(start, end + 1)); return;
    }
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': size }); res.end(AUDIO_BYTES); return;
  }
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
  mia: { email: 'mia.master@example.invalid', name: 'Mia Master', mid: 'm_mia', teams: ['Core Team'], master: true },
  pat: { email: 'pat.preacher@example.invalid', name: 'Pat Preacher', mid: 'm_pat', teams: [] },
  kim: { email: 'kim.kids@example.invalid', name: 'Kim Kids', mid: 'm_kim', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  lee: { email: 'lee.listener@example.invalid', name: 'Lee Listener', mid: 'm_lee', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (col, id) => readDb(async (db) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? s.data() : null; });
const list = (col) => readDb(async (db) => (await getDocs(collection(db, col))).docs.map(d => ({ id: d.id, ...d.data() })));

/* The function's part: the shared builder, and a store on the emulator
   with the Admin SDK's powers (rules off), as sermonFeedSync will have. */
const fctx = { window: {}, btoa: globalThis.btoa, unescape: globalThis.unescape, encodeURIComponent, Promise }; fctx.self = fctx.window; vm.createContext(fctx);
vm.runInContext(fs.readFileSync(path.join(V2, 'egbc-sermons-feed.js'), 'utf8'), fctx);
const FEEDJS = fctx.window.EGBCSermonsFeed;
/* (Objects from the sandbox are copied into plain ones for the library.) */
const plain = (d) => JSON.parse(JSON.stringify(d));
const store = {
  get: (id) => get('sermons', id),
  create: (id, d) => readDb((db) => setDoc(doc(db, 'sermons', id), plain(d))),
  update: (id, d) => readDb((db) => updateDoc(doc(db, 'sermons', id), plain(d))),
  status: (d) => readDb((db) => setDoc(doc(db, 'sermonShow', 'feedStatus'), plain(d)))
};
const readFeed = (items) => FEEDJS.sync(store, FEED(items), new Date());
const sermonsNow = async () => (await list('sermons')).filter(s => s.source === 'feed');

const errors = [], PAGES = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')),
    args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  GUARD.watchBrowser(b); return b;
}
async function pageOf(b, label) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 390, height: 844 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  PAGES.push([label, p]);
  return p;
}
async function as(who, label) {
  const b = await launch(label || who), p = await pageOf(b, label || who);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p; return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const type = async (p, sel, v) => { await p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v); };
const listen = 'screenshots/events/app-harness.html?space=me&tab=listen';
const browsers = [];

try {
  /* 1. who looks after sermons */
  const kB = await as('kim'); browsers.push(kB); const K = kB.page;
  await go(K, 'sermons-admin.html', '#main .card');
  await until(async () => /Only the people named can look after sermons/.test(await text(K, '#main')));
  ok('1. an admin of another area is told only the people named look after sermons', /Only the people named/.test(await text(K, '#main')) && !(await K.$('#f-go')));
  const mB = await as('mia'); browsers.push(mB); const M = mB.page;
  await go(M, 'sermons-admin.html', '#access');
  await type(M, '#ac-who', 'Pat Preacher'); await tap(M, '#ac-go');
  const access = await until(async () => { const a = await get('sermonShow', 'access'); return a && a.memberIds.includes('m_pat') ? a : null; });
  ok('   a master admin names Pat (as Val would be)', access && J(access.memberIds) === J(['m_pat']), J(access));

  /* 2. the feed's address */
  const pB = await as('pat'); browsers.push(pB); const Pp = pB.page;
  await go(Pp, 'sermons-admin.html', '#feed');
  ok('2. with no address yet, the page says nothing comes in, and where to find it', /No address yet.*Spotify for Creators, under Settings/.test(await text(Pp, '#feed')));
  ok('   NOTHING ABOUT REPOINTING SPOTIFY IS LEFT ON THE PAGE', !/repoint|Bring over|Preview the feed|owner email/i.test(await text(Pp, 'body')));
  await type(Pp, '#fd-url', 'https://anchor.example.invalid/s/test/podcast/rss');
  await tap(Pp, '#fd-go');
  const fs1 = await until(async () => { const f = await get('sermonShow', 'feed'); return f && f.url ? f : null; });
  ok('   Pat sets the podcast\'s RSS address', fs1 && fs1.url === 'https://anchor.example.invalid/s/test/podcast/rss' && fs1.updatedBy === P.pat.uid, J(fs1));
  await until(async () => /first read has not happened yet/.test(await text(Pp, '#feed')));

  /* 3. the hourly read, twice */
  const r1 = await readFeed([EP2, EP1, EP3]);
  const after1 = await sermonsNow();
  ok('3. THE FIRST READ BRINGS IN EACH EPISODE ONCE, shown, playing from the feed\'s own address', r1.created === 3 && after1.length === 3
    && after1.every(s => s.published === true && /^http:\/\/localhost:5601\/__audio\/ep\d\.wav$/.test(s.audioUrl) && s.audioPath === '' && s.durationSec === 120), J(r1));
  const r2 = await readFeed([EP2, EP1, EP3]);
  ok('   READ AGAIN: STILL THREE, NOTHING WRITTEN TWICE', (await sermonsNow()).length === 3 && r2.created === 0 && r2.updated === 0, J(r2));
  await go(Pp, 'sermons-admin.html', '#feed');
  await until(async () => /Last read .*3 episodes of “Test Green Sermons \(invented\)”/.test(await text(Pp, '#feed')));
  ok('   the page says what the last read found', /Last read .*: 3 episodes of “Test Green Sermons \(invented\)”/.test(await text(Pp, '#feed')), await text(Pp, '#feed'));
  ok('   each episode is listed "From Spotify", and asks for its series or passage', ((await text(Pp, '#list')).match(/From Spotify/g) || []).length === 3 && /add its series or passage/.test(await text(Pp, '#list')));

  /* 4. the hub adds its part; the feed changes; the hub's part stays */
  await Pp.$eval('#series details', e => { e.open = true; });
  await type(Pp, '#ns-name', 'Luke: the lost found (invented)');
  await tap(Pp, '#ns-go');
  const series = await until(async () => { const l = await list('sermonSeries'); return l.length ? l[0] : null; });
  const id1 = FEEDJS.idForGuid(EP1.guid), id2 = FEEDJS.idForGuid(EP2.guid), id3 = FEEDJS.idForGuid(EP3.guid);
  await until(async () => (await Pp.$$eval('#f-series option', o => o.length)) === 2 || !!(await Pp.$('[data-edit="' + id1 + '"]')));
  await tap(Pp, '[data-edit="' + id1 + '"]');
  await until(async () => /From Val's podcast/.test(await text(Pp, '#add')));
  ok('4. a feed episode\'s form offers only what the hub adds (no title, words or file)', !(await Pp.$('#f-title')) && !(await Pp.$('#f-file')) && !(await Pp.$('#f-notes')) && !!(await Pp.$('#f-passage')));
  await type(Pp, '#f-speaker', 'Jeanette (invented)');
  await Pp.select('#f-series', series.id);
  await Pp.select('#f-book', 'Luke');
  await type(Pp, '#f-passage', '15:1-32');
  await tap(Pp, '#f-go');
  await until(async () => { const s = await get('sermons', id1); return s && s.book === 'Luke' ? s : null; });
  await until(() => Pp.$('[data-unpub="' + id2 + '"]'));
  await tap(Pp, '[data-unpub="' + id2 + '"]');
  await until(async () => (await get('sermons', id2)).published === false);
  const sneak = await Pp.evaluate((id) => EGBCAuth.db.collection('sermons').doc(id).update({ title: 'Changed in the hub', updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: EGBCAuth.user().uid })
    .then(() => 'written', e => e.code), id1);
  ok('   THE FEED\'S OWN TITLE CANNOT BE CHANGED IN THE HUB (the rules)', sneak === 'permission-denied', sneak);
  const fake = await Pp.evaluate(() => EGBCAuth.db.collection('sermons').doc('feed_fake').set({ title: 'x', speaker: '', date: '2026-10-01', seriesId: '', book: '', passage: '', description: '', audioPath: '',
    audioType: '', audioSize: 0, durationSec: 0, audioUrl: 'https://example.invalid/x.mp3', published: true, guid: 'fake', source: 'feed', createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: EGBCAuth.user().uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: EGBCAuth.user().uid }).then(() => 'written', e => e.code));
  ok('   nor can a page make up a feed episode', fake === 'permission-denied', fake);
  const r3 = await readFeed([EP4, { ...EP1, title: 'Grace that scandalises (corrected, invented)' }, EP2, EP3]);
  const s1 = await get('sermons', id1), s2 = await get('sermons', id2);
  ok('   the next read: the new episode comes in once, the corrected title comes through', r3.created === 1 && (await sermonsNow()).length === 4 && s1.title === 'Grace that scandalises (corrected, invented)', J(r3));
  ok('   THE SERIES, PASSAGE AND SPEAKER ADDED IN THE HUB ARE KEPT', s1.seriesId === series.id && s1.book === 'Luke' && s1.passage === '15:1-32' && s1.speaker === 'Jeanette (invented)', J(s1));
  ok('   AND THE EPISODE PAT HID STAYS HIDDEN', s2.published === false);
  await readFeed([EP4, { ...EP1, title: 'Grace that scandalises (corrected, invented)' }, EP2, EP3]);
  ok('   and one more read changes nothing: still four', (await sermonsNow()).length === 4);

  /* 5. the backup: one uploaded by hand */
  await go(Pp, 'sermons-admin.html', '#add');
  await Pp.$eval('#add', e => { e.open = true; });
  await (await Pp.$('#f-file')).uploadFile(AUDIO);
  await type(Pp, '#f-title', 'A talk not on the podcast (invented)');
  await Pp.$eval('#f-date', e => { e.value = '2026-09-27'; });
  await tap(Pp, '#f-go');
  const up = await until(async () => (await list('sermons')).find(s => s.source === 'upload' && s.published) || null, 30000);
  ok('5. THE BACKUP: a sermon uploaded by hand is shown, with its own audio', up && up.durationSec === 120 && up.audioPath === 'sermons/' + up.id + '/audio' && up.guid === 'egbc-sermon-' + up.id && up.audioUrl === '', J(up));
  await Pp.screenshot({ path: path.join(HERE, 'sermons-admin-375.png'), fullPage: true });

  /* 6. the player */
  const lB = await as('lee', 'lee-phone1'); browsers.push(lB); const L = lB.page;
  await go(L, listen, '.hello');
  await until(async () => /A new one \(invented\)/.test(await text(L, '#egbc-content')));
  const lt = await text(L, '#egbc-content');
  ok('6. Listen: the newest from the podcast first, the series, the recent ones; never the hidden one', /Listen.*A new one \(invented\)/.test(lt)
    && /Series.*Luke: the lost found \(invented\) 1 sermon/.test(lt) && /Recent.*Rebuilding the walls/.test(lt) && /A talk not on the podcast/.test(lt) && !/Ask and plan/.test(lt)
    && /search for “Test Green Sermons \(invented\)”/.test(lt), lt.slice(0, 700));
  await L.evaluate(() => { window.__np = []; EGBCAppListen.onChange((n) => window.__np.push(n)); });
  await tap(L, '[data-lact="series:' + series.id + '"]');
  await until(() => L.$('[data-l="series-list"]'));
  await tap(L, '[data-lact="play:' + id1 + '"]');
  const playing = await until(() => L.evaluate(() => { const n = EGBCAppListen.nowPlaying(); return n && !n.paused && n.pos > 0 ? n : null; }), 20000);
  const src = await L.evaluate(() => document.getElementById('egbc-listen-audio').src);
  ok('   PLAY: IT PLAYS FROM THE PODCAST\'S OWN ADDRESS', playing && playing.id === id1 && src === 'http://localhost:5601/__audio/ep1.wav', src);
  const told = await until(() => L.evaluate(() => (window.__np || []).filter((n) => n && n.title === 'Grace that scandalises (corrected, invented)' && n.speaker === 'Jeanette (invented)' && n.series === 'Luke: the lost found (invented)' && !n.paused).length));
  ok('   the shell\'s "Now playing" bar is told what is playing (F-137)', told > 0, String(told));
  await L.screenshot({ path: path.join(HERE, 'listen-series-375.png'), fullPage: true });
  await tap(L, '[data-tab="whatson"]');
  await sleep(600);
  const still = await L.evaluate(() => { const a = document.getElementById('egbc-listen-audio'); return a && !a.paused && !document.getElementById('egbc-content').contains(a); });
  ok('   IT KEEPS PLAYING when you go to another tab', still);
  await tap(L, '[data-tab="listen"]');
  await L.waitForSelector('#lis-pp');
  await L.evaluate(() => { document.getElementById('egbc-listen-audio').currentTime = 50; });
  await tap(L, '#lis-pp');
  const saved = await until(async () => { const s = await readDb(async (db) => (await getDoc(doc(db, 'listenProgress', P.lee.uid, 'sermons', id1))).data()); return s && s.pos >= 49 ? s : null; });
  ok('   PAUSE: ITS PLACE IS KEPT (0:50 of 2:00)', saved && saved.pos >= 49 && saved.pos < 53 && saved.dur === 120 && saved.done === false, J(saved));
  await L.screenshot({ path: path.join(HERE, 'listen-375.png'), fullPage: true });

  const l2B = await as('lee', 'lee-phone2'); browsers.push(l2B); const L2 = l2B.page;
  await go(L2, listen, '.hello');
  await until(async () => /Carry on listening/.test(await text(L2, '#egbc-content')));
  const carry = await text(L2, '[data-l="carry"]');
  ok('   ON ANOTHER PHONE: "Carry on listening", with the time left', /Grace that scandalises \(corrected, invented\) Jeanette \(invented\) · 1 min left/.test(carry), carry);
  await tap(L2, '[data-l="carry"] [data-lact="play:' + id1 + '"]');
  const resumed = await until(() => L2.evaluate(() => { const n = EGBCAppListen.nowPlaying(); return n && !n.paused && n.pos >= 49 ? n : null; }), 20000);
  ok('   and it carries on from 0:50, not the start', resumed && resumed.pos >= 49 && resumed.pos < 60, J(resumed));
  await tap(L2, '#lis-pp');
  await type(L2, '#lis-q', 'luke');
  const q1 = await text(L2, '#lis-res');
  await type(L2, '#lis-q', 'jeanette');
  const q2 = await text(L2, '#lis-res');
  await type(L2, '#lis-q', 'october 2026');
  const q3 = await text(L2, '#lis-res');
  await type(L2, '#lis-q', 'zzz');
  const q4 = await text(L2, '#lis-res');
  ok('   search by Bible book, speaker and date (what the hub added is searchable)', /Grace that scandalises/.test(q1) && !/Rebuilding/.test(q1) && /Grace that scandalises/.test(q2)
    && /Rebuilding the walls/.test(q3) && /A new one/.test(q3) && !/Grace/.test(q3) && /Nothing found for “zzz”/.test(q4), [q1, q2, q3, q4].join(' || '));

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
