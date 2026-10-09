/* Sermons and "Listen" (F-124, F-132): the upload page, Val's show brought
   over, and the app's player, drawn through the stand-in shell
   (screenshots/events/app-harness.html, built to A-050).
   Events window. Invented people and an invented show only, events
   emulators only, network guard, no email leaves the machine. No real
   feed is fetched: the "old show" is pasted in.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/sermons.test.mjs"

   What it proves:
     1. only master admins and the people they name can add sermons
     2. Val's show comes over with every episode's ID exactly as it was
     3. a sermon goes up: its length is read, its audio stored, it is
        published; a draft stays hidden
     4. the feed preview reads, and is "ready" only when every old episode
        has its audio
     5. the player plays, keeps playing when you leave the tab, and
        remembers your place - on another phone too
     6. search by speaker, Bible book or date
     7. a published sermon's audio is public (podcast apps); a draft's is not */

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
const PROJECT = 'egbc-worship-planner', BUCKET = PROJECT + '.firebasestorage.app';
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

/* Files to upload: two minutes of silence (a WAV the browser can measure
   and play) and a tiny picture. Nothing recorded, nobody's voice. */
function wav(seconds) {
  const rate = 8000, n = rate * seconds, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}
const AUDIO = path.join(TMP, 'sermon-silence.wav'); fs.writeFileSync(AUDIO, wav(120));
const ART = path.join(TMP, 'artwork.png'); fs.writeFileSync(ART, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

/* The "old show", invented, shaped like a Spotify for Creators feed. */
const OLD_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
<title><![CDATA[Test Green Sermons (invented)]]></title>
<description><![CDATA[<p>Invented Sunday talks.</p>]]></description>
<link>https://example.invalid/sermons</link>
<language>en-gb</language>
<itunes:author>Test Green Church</itunes:author>
<itunes:owner><itunes:name>Val Synthetic</itunes:name><itunes:email>val.synthetic@example.invalid</itunes:email></itunes:owner>
<itunes:image href="https://example.invalid/art.jpg"/>
<itunes:category text="Religion &amp; Spirituality"><itunes:category text="Christianity"/></itunes:category>
<item><title>Grace that scandalises (invented)</title><guid isPermaLink="false">old-guid-0001-invented</guid><pubDate>Sun, 07 Sep 2025 10:45:00 GMT</pubDate>
<enclosure url="https://example.invalid/ep1.mp3" length="31000000" type="audio/mpeg"/><itunes:duration>00:34:10</itunes:duration><description>Luke 15 (invented)</description></item>
<item><title>Ask and plan (invented)</title><guid isPermaLink="false"><![CDATA[old-guid-0002-invented]]></guid><pubDate>Sun, 14 Sep 2025 10:45:00 GMT</pubDate>
<enclosure url="https://example.invalid/ep2.mp3" length="29000000" type="audio/mpeg"/><itunes:duration>1980</itunes:duration></item>
</channel></rss>`;

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
const plainFetch = (p) => fetch(`http://127.0.0.1:9198/v0/b/${BUCKET}/o/${encodeURIComponent(p)}?alt=media`).then(r => r.status);

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
  /* 1. who may add sermons */
  const kB = await as('kim'); browsers.push(kB); const K = kB.page;
  await go(K, 'sermons-admin.html', '#main .card');
  await until(async () => /Only the people named can add sermons/.test(await text(K, '#main')));
  ok('1. an admin of another area is told only the people named can add sermons', /Only the people named can add sermons/.test(await text(K, '#main')) && !(await K.$('#f-go')));
  const kSneak = await K.evaluate(() => EGBCAuth.db.collection('sermons').doc('srm_sneak').set({ title: 'x' }).then(() => 'written', e => e.code));
  ok('   and the rules refuse them too', kSneak === 'permission-denied', kSneak);

  const mB = await as('mia'); browsers.push(mB); const M = mB.page;
  await go(M, 'sermons-admin.html', '#access');
  await type(M, '#ac-who', 'Pat Preacher'); await tap(M, '#ac-go');
  const access = await until(async () => { const a = await get('sermonShow', 'access'); return a && a.memberIds.includes('m_pat') ? a : null; });
  ok('   a master admin names Pat to put the sermons up', access && J(access.memberIds) === J(['m_pat']), J(access));
  await until(async () => /Pat Preacher/.test(await text(M, '#access')));

  /* 2. Val's show comes over */
  const pB = await as('pat'); browsers.push(pB); const Pp = pB.page;
  await go(Pp, 'sermons-admin.html', '#add');
  ok('   Pat now sees the upload page', !!(await Pp.$('#f-go')) && !(await Pp.$('#access')));
  await Pp.$eval('#import', e => { e.open = true; });
  await Pp.$eval('#im-text', (e, v) => { e.value = v; }, OLD_FEED);
  await type(Pp, '#im-url', 'https://example.invalid/old-feed.rss');
  await tap(Pp, '#im-go');
  const imported = await until(async () => { const l = (await list('sermons')).filter(s => s.imported); return l.length === 2 ? l : null; });
  const show1 = await get('sermonShow', 'show');
  ok('2. VAL\'S SHOW COMES OVER: both episodes, each with its ID exactly as it was', imported && J(imported.map(s => s.guid).sort()) === J(['old-guid-0001-invented', 'old-guid-0002-invented'])
    && imported.every(s => s.published === false && s.audioPath === ''), J(imported));
  ok('   with the show\'s name, owner and owner email, and the old IDs kept for the check', show1 && show1.title === 'Test Green Sermons (invented)' && show1.ownerEmail === 'val.synthetic@example.invalid'
    && show1.ownerName === 'Val Synthetic' && J(show1.oldGuids) === J(['old-guid-0001-invented', 'old-guid-0002-invented']) && show1.oldFeedUrl === 'https://example.invalid/old-feed.rss', J(show1));
  ok('   and the dates and times they had', imported.find(s => s.guid === 'old-guid-0001-invented').pubDate === 'Sun, 07 Sep 2025 10:45:00 GMT' && imported.find(s => s.guid === 'old-guid-0001-invented').date === '2025-09-07');
  await until(async () => /Not ready to repoint Spotify yet/.test(await text(Pp, '#ready')));
  const notReady = await text(Pp, '#ready');
  ok('   NOT READY: the artwork, and both episodes\' audio, are still needed', /Not ready/.test(notReady) && /the artwork/.test(notReady) && /2 episodes from Val's show still need their audio/.test(notReady), notReady);
  await Pp.$eval('#im-text', (e, v) => { e.value = v; }, OLD_FEED);
  await Pp.$eval('#import', e => { e.open = true; });
  await tap(Pp, '#im-go');
  await until(async () => /Brought over 0 of 2/.test(await text(Pp, '#im-out')));
  ok('   bringing it over twice adds nothing twice', (await list('sermons')).length === 2);

  /* 3. a series, then a sermon */
  await Pp.$eval('#series details', e => { e.open = true; });
  await type(Pp, '#ns-name', 'Nehemiah: rebuilding (invented)');
  await tap(Pp, '#ns-go');
  const series = await until(async () => { const l = await list('sermonSeries'); return l.length ? l[0] : null; });
  ok('3. Pat adds a series', series && series.name === 'Nehemiah: rebuilding (invented)');
  await until(async () => (await Pp.$$eval('#f-series option', o => o.length)) === 2);
  await (await Pp.$('#f-file')).uploadFile(AUDIO);
  await type(Pp, '#f-title', 'Ask boldly, plan wisely (invented)');
  await type(Pp, '#f-speaker', 'Ryan Synthetic');
  await Pp.$eval('#f-date', e => { e.value = '2026-10-04'; });
  await Pp.select('#f-series', series.id);
  await Pp.select('#f-book', 'Nehemiah');
  await type(Pp, '#f-passage', '2:1-8');
  await tap(Pp, '#f-go');
  const fresh = await until(async () => (await list('sermons')).find(s => s.title === 'Ask boldly, plan wisely (invented)' && s.published) || null, 30000);
  ok('   A SERMON GOES UP: published, its length read from the file (2 minutes), its own episode ID', fresh && fresh.durationSec === 120 && fresh.audioSize === fs.statSync(AUDIO).size
    && fresh.guid === 'egbc-sermon-' + fresh.id && fresh.audioPath === 'sermons/' + fresh.id + '/audio' && fresh.book === 'Nehemiah' && fresh.seriesId === series.id, J(fresh));
  ok('   its audio is stored', (await plainFetch('sermons/' + fresh.id + '/audio')) === 200);

  /* a draft */
  await until(async () => !(await Pp.$eval('#f-go', e => e.disabled)));
  await (await Pp.$('#f-file')).uploadFile(AUDIO);
  await type(Pp, '#f-title', 'Draft talk (invented)');
  await Pp.$eval('#f-date', e => { e.value = '2026-10-11'; });
  await Pp.$eval('#f-pub', e => { e.checked = false; });
  await tap(Pp, '#f-go');
  const draft = await until(async () => { const d = (await list('sermons')).find(s => s.title === 'Draft talk (invented)'); return d && d.audioSize ? d : null; }, 30000);
  ok('   a sermon saved without publishing stays unpublished', draft && draft.published === false, J(draft));

  /* 4. the old episodes get their audio; the artwork; ready */
  for (const g of ['old-guid-0001-invented', 'old-guid-0002-invented']) {
    const s = (await list('sermons')).find(x => x.guid === g);
    await until(async () => !!(await Pp.$('[data-edit="' + s.id + '"]')));
    await tap(Pp, '[data-edit="' + s.id + '"]');
    await until(async () => /Brought over from Val's show/.test(await text(Pp, '#add')));
    await (await Pp.$('#f-file')).uploadFile(AUDIO);
    await Pp.$eval('#f-pub', e => { e.checked = true; });
    await tap(Pp, '#f-go');
    await until(async () => { const d = await get('sermons', s.id); return d && d.published ? d : null; }, 30000);
  }
  const olds = (await list('sermons')).filter(s => s.imported);
  ok('4. THE OLD EPISODES, NOW WITH AUDIO AND PUBLISHED, KEEP THEIR IDs', olds.length === 2 && olds.every(s => s.published && s.audioSize > 0) && J(olds.map(s => s.guid).sort()) === J(['old-guid-0001-invented', 'old-guid-0002-invented']), J(olds.map(s => [s.guid, s.published])));
  await until(async () => !!(await Pp.$('#sh-art')));
  await (await Pp.$('#sh-art')).uploadFile(ART);
  await tap(Pp, '#sh-go');
  await until(async () => (await get('sermonShow', 'show')).artworkPath === 'podcast/artwork');
  await until(async () => /Ready\. Every episode of Val's show is here/.test(await text(Pp, '#ready')));
  ok('   READY TO REPOINT SPOTIFY once every old episode has its audio and the show has its artwork', /Ready\. Every episode/.test(await text(Pp, '#ready')));
  await tap(Pp, '#sh-preview');
  await until(async () => !!(await Pp.$('#feed-ok')));
  const feedOk = await text(Pp, '#feed-ok'), xml = await Pp.$eval('#feed-xml', e => e.textContent);
  ok('   the feed preview reads in the browser: 3 episodes, the draft left out', /reads correctly: 3 episodes/.test(feedOk) && !/Draft talk/.test(xml), feedOk);
  ok('   the feed carries the old IDs and the show\'s owner email', /<guid isPermaLink="false">old-guid-0001-invented<\/guid>/.test(xml) && /<guid isPermaLink="false">old-guid-0002-invented<\/guid>/.test(xml)
    && /<itunes:email>val\.synthetic@example\.invalid<\/itunes:email>/.test(xml) && /<guid isPermaLink="false">egbc-sermon-/.test(xml));
  await Pp.screenshot({ path: path.join(HERE, 'sermons-admin-375.png'), fullPage: true });

  /* 7. who can hear the files with no account (podcast apps) */
  ok('7. A PUBLISHED SERMON\'S AUDIO PLAYS WITH NO ACCOUNT (as Spotify fetches it)', (await plainFetch('sermons/' + fresh.id + '/audio')) === 200);
  ok('   A DRAFT\'S DOES NOT', (await plainFetch('sermons/' + draft.id + '/audio')) === 403);

  /* 5. the player */
  const lB = await as('lee', 'lee-phone1'); browsers.push(lB); const L = lB.page;
  await go(L, listen, '.hello');
  await until(async () => /Ask boldly, plan wisely/.test(await text(L, '#content')));
  const lt = await text(L, '#content');
  ok('5. Listen: the latest sermon first, the series, the recent ones; never the draft', /Listen.*Ask boldly, plan wisely \(invented\).*Nehemiah: rebuilding \(invented\) · Ryan Synthetic · 2 min/.test(lt)
    && /Series.*Nehemiah: rebuilding \(invented\) 1 sermon/.test(lt) && /Recent.*Ask and plan \(invented\).*Grace that scandalises/.test(lt) && !/Draft talk/.test(lt)
    && /search for “Test Green Sermons \(invented\)”/.test(lt), lt.slice(0, 600));
  const sneakDraft = await L.evaluate((id) => EGBCAuth.db.collection('sermons').doc(id).get().then(() => 'read', e => e.code), draft.id);
  ok('   a listener cannot read the draft, even by asking for it', sneakDraft === 'permission-denied', sneakDraft);
  await tap(L, '[data-lact="play:' + fresh.id + '"]');
  const playing = await until(() => L.evaluate(() => { const n = EGBCAppListen.nowPlaying(); return n && !n.paused && n.pos > 0 ? n : null; }), 20000);
  ok('   Play: it plays, and "Now playing" shows it', playing && playing.id === fresh.id && /Now playing Ask boldly/.test(await text(L, '[data-l="now"]')), J(playing));
  await L.screenshot({ path: path.join(HERE, 'listen-375.png'), fullPage: true });
  await tap(L, '[data-act="tab:home"]');
  await sleep(600);
  const still = await L.evaluate(() => { const a = document.getElementById('egbc-listen-audio'); return a && !a.paused && !document.getElementById('content').contains(a); });
  ok('   IT KEEPS PLAYING when you go to another tab (the player is not part of the screen)', still);
  await tap(L, '[data-act="tab:listen"]');
  await L.waitForSelector('#lis-pp');
  await L.evaluate(() => { document.getElementById('egbc-listen-audio').currentTime = 50; });
  await tap(L, '#lis-pp');
  const saved = await until(async () => { const s = await readDb(async (db) => (await getDoc(doc(db, 'listenProgress', P.lee.uid, 'sermons', fresh.id))).data()); return s && s.pos >= 49 ? s : null; });
  ok('   PAUSE: ITS PLACE IS KEPT for Lee (0:50 of 2:00)', saved && saved.pos >= 49 && saved.pos < 53 && saved.dur === 120 && saved.done === false, J(saved));
  const local = await L.evaluate((id) => (JSON.parse(localStorage.getItem('egbc.listen.v1') || '{}')[id] || {}).pos, fresh.id);
  ok('   and on this phone', local >= 49 && local < 53, local);

  /* another phone */
  const l2B = await as('lee', 'lee-phone2'); browsers.push(l2B); const L2 = l2B.page;
  await go(L2, listen, '.hello');
  await until(async () => /Carry on listening/.test(await text(L2, '#content')));
  const carry = await text(L2, '[data-l="carry"]');
  ok('   ON ANOTHER PHONE: "Carry on listening", with the time left', /Ask boldly, plan wisely \(invented\) Ryan Synthetic · 1 min left/.test(carry), carry);
  await tap(L2, '[data-l="carry"] [data-lact="play:' + fresh.id + '"]');
  const resumed = await until(() => L2.evaluate(() => { const n = EGBCAppListen.nowPlaying(); return n && !n.paused && n.pos >= 49 ? n : null; }), 20000);
  ok('   and it carries on from 0:50, not the start', resumed && resumed.pos >= 49 && resumed.pos < 60, J(resumed));
  await tap(L2, '#lis-pp');

  /* 6. search */
  await type(L2, '#lis-q', 'nehemiah');
  const s1 = await text(L2, '#lis-res');
  await type(L2, '#lis-q', 'ryan');
  const s2 = await text(L2, '#lis-res');
  await type(L2, '#lis-q', 'september 2025');
  const s3 = await text(L2, '#lis-res');
  await type(L2, '#lis-q', 'zzz');
  const s4 = await text(L2, '#lis-res');
  ok('6. search by Bible book, speaker and date', /Ask boldly/.test(s1) && !/Grace/.test(s1) && /Ask boldly/.test(s2) && /Grace that scandalises/.test(s3) && /Ask and plan/.test(s3) && !/Ask boldly/.test(s3)
    && /Nothing found for “zzz”/.test(s4), [s1, s2, s3, s4].join(' || '));
  ok('   typing does not redraw the screen (the box keeps its place)', await L2.evaluate(() => document.activeElement !== null && document.getElementById('lis-q').value === 'zzz'));
  await type(L2, '#lis-q', '');
  await tap(L2, '[data-lact="series:' + series.id + '"]');
  await until(async () => !!(await L2.$('[data-l="series-list"]')));
  const sv = await text(L2, '#content');
  ok('   a series, in order', /All sermons.*Nehemiah: rebuilding \(invented\).*1\. Ask boldly, plan wisely \(invented\)/.test(sv), sv.slice(0, 300));
  await L2.screenshot({ path: path.join(HERE, 'listen-series-375.png'), fullPage: true });

  /* nothing published yet: words, not an empty screen (a fresh church) */
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
