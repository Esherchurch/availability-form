/* The What's on calendar people subscribe to (R7; F-182). Events window.
   Invented events only, events emulators only (with the hub's functions),
   network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/events-feed.test.mjs"

   What it proves:
     1. THE PUBLIC FEED: text/calendar; every line ends CRLF and is at most
        75 bytes, folded without splitting a letter (an accented title
        survives); a VTIMEZONE for Europe/London; one VEVENT per date with a
        UID that is the event's own; times in London wall time, the night
        the clocks change included; all-day dates end the day after
     2. NEVER a not-listed, not-yet-public, members', church members' or
        team event; a cancelled date stays, marked STATUS:CANCELLED
     3. &cat= gives just those categories, and says so in its name
     4. A PERSON'S OWN LINK (What's on › Subscribe › Everything I can see):
        what they may see (attenders' and their team's), not what they may
        not (church members only); Reset makes a new link and the old one
        stops at once
     5. a wrong key, or no key, gives nothing
     6. the Subscribe card gives Google, Apple/Outlook (webcal:) and Copy */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-feed-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const FEED = 'http://127.0.0.1:5102/' + PROJECT + '/europe-west2/eventsFeed';

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);

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
await db.collection('sites').doc('site_t').set({ name: 'Test Green', active: true });
await db.collection('rooms').doc('room_hall').set({ name: 'Test Hall', siteId: 'site_t', active: true });
await db.collection('eventCategories').doc('music').set({ name: 'Music', colour: '#ec4899', order: 1, retired: false });
await db.collection('eventCategories').doc('social').set({ name: 'Social', colour: '#b07d2e', order: 2, retired: false });
const D = new Date(); const yr = D.getMonth() >= 9 ? D.getFullYear() + 1 : D.getFullYear();
/* London wall time as the events store it, and its UTC moment. */
const at = (ymd, hm, mins) => { const iso = ymd + 'T' + hm; const utc = Date.parse(iso + ':00Z') - (londonOffset(iso) * 60000); return { startLocal: iso, startUtc: utc, endLocal: ymd + 'T' + addMin(hm, mins || 90), endUtc: utc + (mins || 90) * 60000 }; };
function londonOffset(iso) { const d = new Date(iso + ':00Z'); const y = d.getUTCFullYear(); const lastSun = (m) => { const t = new Date(Date.UTC(y, m + 1, 0)); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t; }; const s = lastSun(2), e = lastSun(9); s.setUTCHours(1); e.setUTCHours(1); return d >= s && d < e ? 60 : 0; }
function addMin(hm, m) { const [h, mi] = hm.split(':').map(Number); const t = h * 60 + mi + m; return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
const EV = (title, when, extra) => ({ title, description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [], featured: false, allDay: false,
  location: { kind: 'room', siteId: 'site_t', roomIds: ['room_hall'] }, organiserName: 'Karen', signupOn: false, image: '', createdBy: 'x', updatedAt: '2026-10-01T10:00:00.000Z', ...when, ...(extra || {}) });
const soon = (n) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const ev = {
  e_pub:   EV('Café Ünïcode evening with a very long title that will certainly need folding across lines (invented)', at(soon(5), '19:30'), { description: '<p>Bring a plate &amp; a friend.</p>' }),
  e_music: EV('Organ recital (invented)', at(soon(6), '15:00'), { category: 'music' }),
  e_off:   EV('CANCELLED quiz (invented)', at(soon(7), '20:00'), { status: 'cancelled' }),
  e_day:   EV('Harvest Sunday (invented)', { startLocal: soon(8) + 'T00:00', startUtc: Date.parse(soon(8) + 'T00:00:00Z'), endLocal: soon(8) + 'T23:59', endUtc: Date.parse(soon(8) + 'T23:59:00Z') }, { allDay: true }),
  e_clock: EV('Clocks change night vigil (invented)', at(yr + '-10-25', '01:30', 30)),
  e_held:  EV('HELD not announced (invented)', at(soon(9), '19:00'), { status: 'pending', audience: ['members'] }),
  e_unl:   EV('NOT LISTED room hire (invented)', at(soon(9), '20:00'), { visibility: 'unlisted', audience: ['unlisted'] }),
  e_mem:   EV('MEMBERS bring and share (invented)', at(soon(10), '12:30'), { visibility: 'members', audience: ['members'] }),
  e_cm:    EV('CHURCH MEMBERS meeting (invented)', at(soon(10), '19:30'), { visibility: 'churchMembers', audience: ['churchMembers'] }),
  e_team:  EV('WELCOME TEAM briefing (invented)', at(soon(11), '09:00'), { visibility: 'team', audience: ['Welcome'], teams: ['Welcome'] }),
  e_other: EV('OTHER TEAM practice (invented)', at(soon(11), '10:00'), { visibility: 'team', audience: ['Choir'], teams: ['Choir'] })
};
for (const id of Object.keys(ev)) await db.collection('calEvents').doc(id).set(ev[id]);

/* An iCal reader of our own, strict: what Outlook would drop, this drops. */
async function getFeed(q) {
  const r = await fetch(FEED + q);
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type') || '', cache: r.headers.get('cache-control') || '', buf, text: buf.toString('utf8') };
}
function read(text) {
  const physical = text.split('\r\n');
  const unfolded = text.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);
  const events = []; let cur = null;
  unfolded.forEach((l) => {
    if (l === 'BEGIN:VEVENT') cur = {};
    else if (l === 'END:VEVENT') { events.push(cur); cur = null; }
    else if (cur) { const i = l.indexOf(':'); const k = l.slice(0, i); cur[k.split(';')[0]] = { params: k, value: l.slice(i + 1) }; }
  });
  return { physical, unfolded, events };
}
const unesc = (s) => String(s || '').replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const titles = (f) => f.events.map(e => unesc(e.SUMMARY && e.SUMMARY.value));

try {
  /* ---------- 1. the public feed, to the letter ---------- */
  const f = await getFeed('?church=1');
  const c = read(f.text);
  ok('1. THE PUBLIC FEED: text/calendar, kept 15 minutes', f.status === 200 && /^text\/calendar/.test(f.type) && /max-age=900/.test(f.cache), f.status + ' ' + f.type);
  ok('   EVERY LINE ENDS CRLF, and none is over 75 bytes', f.text.endsWith('\r\n') && !/[^\r]\n/.test(f.text) && c.physical.every(l => Buffer.byteLength(l, 'utf8') <= 75), c.physical.filter(l => Buffer.byteLength(l, 'utf8') > 75).slice(0, 2).join(' | '));
  ok('   FOLDED WITHOUT SPLITTING A LETTER: the accented title comes back whole', !f.text.includes('\ufffd') && titles(c).includes('Café Ünïcode evening with a very long title that will certainly need folding across lines (invented)'), J(titles(c)));
  ok('   a VTIMEZONE for Europe/London, as Outlook needs', f.text.includes('BEGIN:VTIMEZONE\r\nTZID:Europe/London') && f.text.includes('TZNAME:BST') && f.text.includes('TZNAME:GMT'));
  const pub = c.events.find(e => /Café/.test(unesc(e.SUMMARY.value)));
  ok('   one date: its own UID, London wall time, where, words and the link', pub && pub.UID.value === 'e_pub@' + new URL(pub.URL.value).host && pub.DTSTART.params === 'DTSTART;TZID=Europe/London' && pub.DTSTART.value === ev.e_pub.startLocal.replace(/[-:]/g, '') + '00' &&
    unesc(pub.LOCATION.value) === 'Test Hall, Test Green' && /Bring a plate & a friend\./.test(unesc(pub.DESCRIPTION.value)) && pub.URL.value.endsWith('/signup.html?event=e_pub') && /^\d+$/.test(pub.SEQUENCE.value), J(pub));
  const clock = c.events.find(e => /Clocks change/.test(unesc(e.SUMMARY.value)));
  ok('   THE NIGHT THE CLOCKS CHANGE: 01:30 London time, as written', clock && clock.DTSTART.value === yr + '1025T013000' && clock.DTSTART.params === 'DTSTART;TZID=Europe/London', J(clock));
  const day = c.events.find(e => /Harvest Sunday/.test(unesc(e.SUMMARY.value)));
  ok('   an ALL-DAY date ends the day after', day && day.DTSTART.params === 'DTSTART;VALUE=DATE' && day.DTEND.value === new Date(Date.parse(soon(8)) + 864e5).toISOString().slice(0, 10).replace(/-/g, ''), J(day));

  /* ---------- 2. what the public never gets ---------- */
  ok('2. NEVER not-listed, held, members\', church members\' or any team\'s', !titles(c).some(t => /NOT LISTED|HELD|MEMBERS|WELCOME TEAM|OTHER TEAM/.test(t)), J(titles(c)));
  const off = c.events.find(e => /CANCELLED quiz/.test(unesc(e.SUMMARY.value)));
  ok('   a cancelled date stays, STATUS:CANCELLED, so calendars cross it out', off && off.STATUS.value === 'CANCELLED' && pub.STATUS.value === 'CONFIRMED');

  /* ---------- 3. categories ---------- */
  const m = read((await getFeed('?church=1&cat=music')).text);
  ok('3. &cat=music: just the music, and the calendar says so', J(titles(m)) === '["Organ recital (invented)"]' && m.unfolded.includes('X-WR-CALNAME:Test Green Church – What\'s on - Music'), J(titles(m)) + ' ' + m.unfolded.find(l => /CALNAME/.test(l)));

  /* ---------- 5. wrong keys ---------- */
  const nokey = await getFeed(''), badkey = await getFeed('?k=' + 'A'.repeat(32));
  ok('5. NO KEY, OR A WRONG ONE: nothing', nokey.status === 404 && badkey.status === 404 && !/BEGIN:VCALENDAR/.test(nokey.text + badkey.text));

  /* ---------- 4. a person's own link, from What's on ---------- */
  const W = await browser('wendy');
  await W.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => W.$('#subBtn'));
  await until(async () => /Café/.test(await W.$eval('#list', e => e.innerText)));
  await W.$eval('#subBtn', b => b.click());
  await until(() => W.$('input[name="subWho"][value="mine"]'));
  const g0 = await W.$eval('#subGoogle', a => a.href), a0 = await W.$eval('#subApple', a => a.href);
  ok('6. SUBSCRIBE: Google, Apple/Outlook (webcal:) and Copy, for the public feed', g0.startsWith('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent('webcal://localhost:5102/')) && a0.startsWith('webcal://localhost:5102/') && /church=1/.test(a0) && !!(await W.$('#subCopy')), g0 + ' ' + a0);
  await W.$eval('input[name="subWho"][value="mine"]', r => { r.click(); });
  await until(() => W.$('#subReset'));
  const mineUrl = await W.$eval('#subUrl', e => e.textContent);
  const key = (mineUrl.match(/[?&]k=([A-Za-z0-9]+)/) || [])[1];
  await W.screenshot({ path: path.join(HERE, 'events-feed-subscribe.png'), fullPage: false });
  const mf = read((await getFeed('?k=' + key)).text);
  ok('4. MY OWN LINK: the attenders\' event and my team\'s, as well as the public ones', titles(mf).some(t => /MEMBERS bring/.test(t)) && titles(mf).some(t => /WELCOME TEAM/.test(t)) && titles(mf).some(t => /Café/.test(t)), J(titles(mf)));
  ok('   NOT a church members\' meeting (I am not one), another team\'s, held or not-listed', !titles(mf).some(t => /CHURCH MEMBERS|OTHER TEAM|HELD|NOT LISTED/.test(t)), J(titles(mf)));
  await W.$eval('#subReset', b => b.click());
  await until(async () => { const u = await W.$eval('#subUrl', e => e.textContent); return !u.includes(key) && /k=/.test(u); });
  const newKey = ((await W.$eval('#subUrl', e => e.textContent)).match(/[?&]k=([A-Za-z0-9]+)/) || [])[1];
  ok('   RESET: a new link works, and the old one stops at once', (await getFeed('?k=' + key)).status === 404 && (await getFeed('?k=' + newKey)).status === 200);
  await db.collection('users').doc(P.wendy.uid).update({ status: 'left' });
  ok('   someone whose account has gone: their link gives nothing', (await getFeed('?k=' + newKey)).status === 404);

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
