/* The ChurchSuite import (Martin, 14 Oct 2026). Events window. INVENTED
   files of the same shape as a church's real ones (never the real ones:
   those are private and stay out of the repo), events emulators only.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/churchsuite-import.test.mjs"

   What it proves, running the real tool (tools/import-churchsuite.mjs):
     1. THE DRY RUN writes nothing, and says what it would make
     2. the building first: ChurchShow's page then lists it
     3. the rooms, one made of two others (bookable whole or in halves)
     4. events: public and members-only as ChurchSuite had them; London
        times right in summer and winter; a series; sign-ups; their
        pictures put in the library once and every date pointing to it
     5. an event in a room takes the room (the whole hall: both halves)
     6. room hires: hirer's name only, no contact details; a place given on
        the command line
     7. small groups with their dates; a home is never named in anything
        public ("Off site")
     8. a maintenance job; Sunday services left for the rota
     9. NEVER PEOPLE: no sign-ups, contacts or members made
    10. RUN TWICE: nothing made twice, no room's time taken twice
    11. it is ordinary data: the public What's on shows the public event and
        not the members' one, and an admin edits an imported event */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { execFileSync, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { londonUtc } from '../../tools/churchsuite-plan.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
if (!/:8182$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Not run under the events emulators.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-csimp-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);

/* ---------- the pages and a picture, served here ---------- */
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
const PNG = (() => { const w = 40, h = 30, ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; const raw = Buffer.alloc((w + 1) * h, 120); for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); })();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/cs-pictures/')) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(PNG); return; }
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

/* ---------- the invented ChurchSuite files ---------- */
const TODAY = new Date().toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(TODAY + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const words = (d) => +d.slice(8, 10) + ' ' + MON[+d.slice(5, 7) - 1];
const dow = (d) => DOW[new Date(d + 'T12:00:00Z').getUTCDay()];
const YEAR_END = TODAY.slice(0, 4) + '-12-31';
/* A summer date and a winter date for the London clock check. */
const SUMMER = (+TODAY.slice(0, 4) + 1) + '-07-01', WINTER = (+TODAY.slice(0, 4) + 1) + '-01-14';
const DIR = path.join(TMP, 'cs');
fs.mkdirSync(DIR);
fs.writeFileSync(path.join(DIR, 'rooms.md'), [
  '# Test rooms (invented)', '', 'Site: Test Green Chapel (invented), 1 Invented Lane, Testbury TE5 7AA', '',
  '| Hub room | Floor | Capacity | Was in ChurchSuite |', '|---|---|---|---|',
  '| Main Hall | Ground | 120 | Old Hall |',
  '| Big Room (East + West together) | First | 40 | Big Room |',
  '| Big Room – East | First | 20 | Big East |',
  '| Big Room – West | First | 18 | — |',
  '| Back Room | First | 12 | Back Room / Room, at the back |',
  '', '- "everywhere" and "Chapel" mean the whole site.', '- The tiny cupboard is included with the upstairs rooms. It is not a room.',
  '- Off-site places (Zoom, people\'s homes, the Crown Inn, "Various") are event locations, not rooms.', ''].join('\n'));
let n = 0;
const ev = (name, cat, day, start, end, place, extra) => Object.assign({ id: 9000 + (++n), identifier: 'tst' + String(n).padStart(5, '0'), name, datetime_start: day + ' ' + start + ':00', datetime_end: day + ' ' + end + ':00',
  description: '<p>' + name + ' (invented)</p>', category: { name: cat }, capacity: null, images: [], location: { name: place },
  signup_options: { signup_enabled: '0', signup_cancel: '0' }, public_visible: true }, extra || {});
const pic = (k) => ({ images: { lg: { url: 'http://localhost:5601/cs-pictures/' + k + '.png' }, sm: {} } });
const EMBED = [
  ev('Test Coffee Morning', 'General', plus(10), '10:00', '12:00', 'Test Green Chapel (invented)', pic('coffee-1')),
  ev('Test Coffee Morning', 'General', plus(24), '10:00', '12:00', 'Test Green Chapel (invented)', pic('coffee-2')),
  ev('Test Coffee Morning', 'General', plus(38), '10:00', '12:00', 'Test Green Chapel (invented)', pic('coffee-3')),
  ev('Test Art Group', 'Art Club', plus(11), '10:00', '12:00', 'Big Room'),
  ev('Test Summer Picnic', 'General', SUMMER, '19:30', '21:00', 'Old Hall'),
  ev('Test Winter Social', 'General', WINTER, '19:30', '21:00', 'Old Hall'),
  ev('Test Youth Night', 'Lazers', plus(12), '18:00', '19:30', 'Smith\'s House'),
  ev('Test Online Prayer', 'Prayer', plus(13), '20:00', '21:00', 'Zoom'),
  ev('Test Carols at the Crown', 'Admin', plus(14), '19:00', '21:00', 'The Crown Inn'),
  ev('Test Film Night', 'Film Club', plus(15), '18:00', '20:00', 'Chapel', Object.assign({ capacity: 60, signup_options: { signup_enabled: '1', signup_cancel: '1' } }, pic('film'))),
  ev('Morning Worship - speaker Test Speaker', 'Sundays', plus(16), '10:00', '11:30', 'Old Hall'),
  ev('Test House Group Meeting', 'Small Groups', plus(17), '20:00', '21:30', 'Various'),
  ev('Test House Group Meeting', 'Small Groups', plus(31), '20:00', '21:30', 'Various'),
  /* Sign-ups with no limit in ChurchSuite: a limit given on the command line. */
  ev('Test Choir Practice', 'Worship', plus(18), '17:30', '19:00', 'Old Hall', { signup_options: { signup_enabled: '1', signup_cancel: '1' } })
];
fs.writeFileSync(path.join(DIR, 'cs-embed.json'), JSON.stringify(EMBED));
const H = [plus(1), plus(29)];
fs.writeFileSync(path.join(DIR, 'cs-nonpublic.md'), [
  'ChurchSuite non-public upcoming events (read ' + words(TODAY) + ' ' + TODAY.slice(0, 4) + ', invented)',
  '- Test Club Room Hire x5 (' + dow(H[0]) + ' 7-9pm, ' + words(H[0]) + '..' + words(H[1]) + ') — Big East, Room, at the back, tiny cupboard — Room Hire External — My ChurchSuite only (Full View)',
  '- Test Clean x1 (' + dow(plus(3)) + ' ' + words(plus(3)) + ' 10am-12pm) — everywhere — Admin — members only',
  '- Test Kit Check x1 (' + dow(plus(4)) + ' ' + words(plus(4)) + ', all day) — Admin — members only (Full View)',
  '- Test Residents Meeting x1 (' + dow(plus(5)) + ' ' + words(plus(5)) + ' 7:30-10pm) — Admin — members only (Full View)',
  '- Test Home Group x2 (' + dow(plus(6)) + ' 7:30-9pm, ' + words(plus(6)) + '..' + words(plus(20)) + ') — Lounge (TE5 7AA) [a home] — Small Groups — members only', ''].join('\n'));
const RUN = ['tools/import-churchsuite.mjs', '--from', DIR, '--rota-category', 'Sundays', '--as-booking', 'Test Residents Meeting', '--as-maintenance', 'Test Kit Check',
  '--place', 'Test Residents Meeting=Main Hall', '--capacity', 'Test Choir Practice=30', '--until', YEAR_END.slice(0, 4) + 1 + '-12-31'];
/* Not execFileSync: the tool fetches its pictures from this test's own server, which must keep answering. */
const tool = (extra) => new Promise((res, rej) => execFile(process.execPath, RUN.concat(extra || []), { cwd: V2, encoding: 'utf8', env: process.env, maxBuffer: 1 << 24 },
  (e, out, err) => (e ? rej(Object.assign(e, { stderr: err })) : res(out))));

/* ---------- the emulator ---------- */
const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = { ava: { email: 'ava.av@example.invalid', name: 'Ava AV (invented)', mid: 'm_ava', teams: ['AV Team'], adminFor: ['AV Team'] },
  martin: { email: 'martin.import@example.invalid', name: 'Martin Import (invented)', mid: 'm_martin', teams: [], adminFor: [], master: true },
  mo: { email: 'mo.member@example.invalid', name: 'Mo Member (invented)', mid: 'm_mo', teams: [], adminFor: [] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Chapel (invented)', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const all = (c) => readDb(db => getDocs(collection(db, c))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const COLS = ['importKeys', 'sites', 'rooms', 'venues', 'pictureLibrary', 'calEvents', 'capacity', 'bookings', 'roomDays', 'smallGroups', 'smallGroupPrivate', 'smallGroupMeetings', 'maintJobs', 'signups', 'contacts', 'addressBook'];
/* What the import made, without what changes from run to run (random
   keys, times, picture links): records by id, bookings by what they are,
   room days by their quarter-hours. */
const snapshot = async () => {
  const o = {};
  for (const c of COLS.filter(c => ['signups', 'contacts', 'addressBook'].indexOf(c) < 0)) {
    const l = await all(c);
    o[c] = c === 'bookings' ? l.map(b => [b.title, b.day, b.roomId, b.startMin, b.endMin, b.kind, b.calEventId || '', J(b.requester)].join('|')).sort()
      : c === 'roomDays' ? l.map(d => d.id + ':' + d.slots.join('')).sort()
      : c === 'importKeys' ? l.map(k => k.id).sort()
      : l.map(d => d.id).sort();
  }
  return o;
};
const counts = async () => { const o = {}; for (const c of COLS) o[c] = (await all(c)).length; return o; };

const errors = [], browsers = [];
async function page(who, width = 1280) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, (who || 'guest') + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who || 'guest');
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width, height: 900 });
  p.on('pageerror', e => errors.push((who || 'guest') + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (who) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}

try {
  /* ---------- 1. the dry run ---------- */
  const before = await counts();
  const dry = await tool();
  ok('1. THE DRY RUN writes nothing at all', J(await counts()) === J(before), J(await counts()));
  ok('   and says what it would make: the building first, rooms, events, bookings, groups, a job, and the Sunday for the rota',
    /1\. THE BUILDING \(made first\): Test Green Chapel \(invented\)/.test(dry) && /Big Room - holds 40 - MADE OF Big Room – East \+ Big Room – West/.test(dry) &&
    /Test Club Room Hire - Big Room – East x5/.test(dry) && /Test House Group - Everyone/.test(dry) && /Test Kit Check/.test(dry) && /Morning Worship\s+- speaker Test Speaker/.test(dry), dry.slice(0, 600));
  ok('   it says what to look at: the home, the cupboard', /"Smith's House" looks like someone's home, so it is shown only as "Off site"/.test(dry) && /"tiny cupboard" is not a room/.test(dry));
  ok('   it refuses the real database without --live', (() => { try { execFileSync(process.execPath, RUN.concat(['--write']), { cwd: V2, encoding: 'utf8', env: Object.assign({}, process.env, { FIRESTORE_EMULATOR_HOST: '' }), stdio: ['ignore', 'pipe', 'pipe'] }); return false; } catch (e) { return /Refusing: this would write the REAL database/.test(String(e.stderr)); } })());

  /* ---------- 2..9: the import ---------- */
  const out1 = await tool(['--write']);
  ok('2. IT WRITES (on the emulator) and reports what it made', /WRITING to the emulator/.test(out1) && /DONE\./.test(out1), out1.slice(-600));
  const sites = await all('sites');
  ok('   the building, once', sites.length === 1 && sites[0].name === 'Test Green Chapel (invented)' && sites[0].postcode === 'TE5 7AA' && sites[0].active === true, J(sites));
  const A = await page('ava');
  await A.goto(URLB + 'churchshow.html', { waitUntil: 'networkidle2' });
  const csText = await until(() => A.$eval('body', e => /Test Green Chapel/.test(e.innerText) ? e.innerText : '').catch(() => ''), 15000);
  ok('   CHURCHSHOW\'S PAGE LISTS THE BUILDING (it said "No buildings on file yet")', !!csText && !/No buildings on file yet/.test(csText), (await A.$eval('body', e => e.innerText.slice(0, 300))));
  const rooms = await all('rooms'), R = (nm) => rooms.find(r => r.name === nm) || {};
  ok('3. the rooms, with their capacities', rooms.length === 5 && R('Main Hall').capacity === 120 && R('Back Room').capacity === 12 && rooms.every(r => r.siteId === sites[0].id), J(rooms.map(r => r.name)));
  ok('   "Big Room" is made of its two halves (bookable whole or in halves)', J(R('Big Room').parts) === J([R('Big Room – East').id, R('Big Room – West').id].filter(Boolean)) && R('Big Room').parts.length === 2);
  const evs = await all('calEvents'), E = (t) => evs.filter(e => e.title === t);
  ok('4. events: public ones for Everyone', E('Test Art Group')[0] && E('Test Art Group')[0].visibility === 'public' && J(E('Test Art Group')[0].audience) === J(['public', 'members']));
  ok('   the members-only ones for members', E('Test Clean')[0] && E('Test Clean')[0].visibility === 'members' && J(E('Test Clean')[0].audience) === J(['members']));
  ok('   LONDON TIME: 19:30 in summer is 18:30 UTC, in winter 19:30 UTC', E('Test Summer Picnic')[0].startUtc === Date.UTC(+SUMMER.slice(0, 4), 6, 1, 18, 30) && E('Test Winter Social')[0].startUtc === Date.UTC(+WINTER.slice(0, 4), 0, 14, 19, 30),
    J([E('Test Summer Picnic')[0].startUtc, E('Test Winter Social')[0].startUtc]));
  const coffee = E('Test Coffee Morning');
  ok('   a series: three dates joined', coffee.length === 3 && coffee.every(e => e.seriesId && e.seriesId === coffee[0].seriesId));
  const lib = await all('pictureLibrary');
  ok('   PICTURES: put in the library once each (two, though ChurchSuite had three for the coffee mornings)', lib.length === 2 && lib.every(p => /^library\/pic_cs_/.test(p.path)), J(lib.map(p => p.name)));
  ok('   and every date of the series points to the same library picture', coffee.every(e => e.imageLibId && e.imageLibId === coffee[0].imageLibId && e.image === lib.find(p => p.id === e.imageLibId).url));
  const film = E('Test Film Night')[0];
  ok('   sign-ups as ChurchSuite had them, with the counter', film && film.signupOn === true && film.capacity === 60 && (await get('capacity', Object.keys(evs).length ? evs.find(e => e.title === 'Test Film Night').id : '')).capacity === 60);
  ok('   a youth event linked to its team', E('Test Youth Night')[0] && J(E('Test Youth Night')[0].labels) === J(['Lazers']) && E('Test Youth Night')[0].category === 'youth');
  ok('   online and an outside place, as text', E('Test Online Prayer')[0].location.kind === 'online' && E('Test Carols at the Crown')[0].location.venueName === 'The Crown Inn');
  const days = await all('roomDays'), slot = (roomId, day, hh) => ((days.find(d => d.id === roomId + '_' + day) || {}).slots || [])[hh * 4] || 0;
  const art = E('Test Art Group')[0];
  ok('5. AN EVENT IN THE WHOLE "Big Room" TAKES BOTH HALVES', slot(R('Big Room – East').id, art.startLocal.slice(0, 10), 10) === 1 && slot(R('Big Room – West').id, art.startLocal.slice(0, 10), 10) === 1);
  const bks = await all('bookings'), hire = bks.filter(b => b.title === 'Test Club Room Hire');
  ok('6. ROOM HIRES: five dates, in both rooms ChurchSuite named (the cupboard left out)', hire.length === 10 && new Set(hire.map(b => b.roomId)).size === 2, J(hire.map(b => b.day + ' ' + b.roomId)));
  ok('   the hirer\'s name only: no email, no phone, nobody\'s account', hire.every(b => J(b.requester) === J({ name: 'Test Club', email: '', phone: '', org: '' }) && b.memberUid === '' && b.kind === 'office' && b.status === 'confirmed'));
  ok('   and each took its time on its room\'s day', hire.every(b => slot(b.roomId, b.day, 19) >= 1));
  ok('   a booking ChurchSuite gave no place for goes where the command line said', bks.some(b => b.title === 'Test Residents Meeting' && b.roomId === R('Main Hall').id));
  const groups = await all('smallGroups'), G = (nm) => groups.find(g => g.name === nm) || {};
  ok('7. SMALL GROUPS, with their dates', groups.length === 2 && (await all('smallGroupMeetings')).length === 4, J(groups.map(g => g.name)));
  ok('   the members-only one stays members only', G('Test Home Group').visibility === 'members' && J(G('Test Home Group').canCome) === J(['members']));
  const pub = J(await all('calEvents')) + J(groups) + J(await all('venues')) + J(bks);
  ok('   A HOME IS NEVER NAMED in events, groups, places or bookings ("Off site")', !/Smith's House|Lounge \(TE5/.test(pub) && E('Test Youth Night')[0].location.venueName === 'Off site');
  const jobs = await all('maintJobs');
  ok('8. a maintenance job', jobs.length === 1 && jobs[0].what === 'Test Kit Check' && jobs[0].status === 'todo');
  ok('   and no event made of the Sunday service (it is for the rota)', !evs.some(e => /Morning Worship/.test(e.title)));
  const c1 = await counts();
  ok('9. NEVER PEOPLE: no sign-ups or contacts, and the address book untouched', c1.signups === 0 && c1.contacts === 0 && c1.addressBook === 3, J(c1));
  const choir = E('Test Choir Practice')[0];
  ok('   --capacity: sign-ups ON with the limit given on the command line', choir && choir.signupOn === true && choir.capacity === 30 && ((await get('capacity', choir.id)) || {}).capacity === 30, J(choir && [choir.signupOn, choir.capacity]));

  /* ---------- KEYS: nothing private can be read by working out its id ---------- */
  const allBk = await all('bookings'), keys = await all('importKeys');
  const daysOf = allBk.map(b => b.day.replace(/-/g, '')), roomSlugs = rooms.map(r => r.id.replace(/^room_cs_/, ''));
  ok('A. EVERY IMPORTED BOOKING HAS A RANDOM KEY, like a real one ("bk_" + 28)', allBk.length > 0 && allBk.every(b => /^bk_[a-z0-9]{28}$/.test(b.id)), J(allBk.slice(0, 3).map(b => b.id)));
  /* Its own name, date and room are not in it, nor its readable import name;
     and no two runs of the same plan would give the same key (they are random). */
  const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const wrong = allBk.filter(b => { const k = keys.find(x => x.bookingId === b.id) || {};
    return b.id.indexOf(b.day.replace(/-/g, '')) >= 0 || b.id.indexOf(slugOf(b.title)) >= 0 || b.id.indexOf(b.roomId.replace(/^room_cs_/, '')) >= 0 || (k.id && b.id.indexOf(k.id) >= 0); });
  ok('   none can be worked out from its name, date or room', !wrong.length && new Set(allBk.map(b => b.id)).size === allBk.length, J(wrong.slice(0, 2).map(b => b.id)));
  ok('   each one\'s readable name is kept apart, pointing to it', keys.length === allBk.length && allBk.every(b => keys.some(k => k.collection === 'bookings' && k.bookingId === b.id)), J(keys.slice(0, 2)));
  const anon = env.unauthenticatedContext().firestore(), member = env.authenticatedContext(P.mo.uid).firestore();
  const tryGet = (dbx, c, id) => getDoc(doc(dbx, c, id)).then(s => (s.exists() ? 'read' : 'missing'), e => e.code);
  const oldStyle = 'bk_cs_test-club-room-hire_' + hire[0].day.replace(/-/g, '') + '_1900_big-east';
  ok('   the old readable key finds nothing', (await tryGet(anon, 'bookings', oldStyle)) === 'missing');
  ok('   the list of import names: not signed out, not a member, only an admin', /permission/.test(await tryGet(anon, 'importKeys', keys[0].id)) && /permission/.test(await tryGet(member, 'importKeys', keys[0].id)));
  const clean = E('Test Clean')[0], job = jobs[0], homeGid = groups.find(g => g.name === 'Test Home Group').id;
  const meet = (await all('smallGroupMeetings')).find(m => m.groupId === homeGid);
  const signedOut = {
    'a members-only event': await tryGet(anon, 'calEvents', clean.id),
    'a members-only small group': await tryGet(anon, 'smallGroups', homeGid),
    'a small group\'s private part': await tryGet(anon, 'smallGroupPrivate', homeGid),
    'a small group\'s dates': await tryGet(anon, 'smallGroupMeetings', meet.id),
    'a maintenance job': await tryGet(anon, 'maintJobs', job.id),
    'a place that is not a room': await tryGet(anon, 'venues', 'venue_cs_off-site'),
    'the picture library': await tryGet(anon, 'pictureLibrary', lib[0].id)
  };
  ok('B. SIGNED OUT, NONE OF THE PRIVATE ONES CAN BE READ, even knowing the id', Object.values(signedOut).every(v => /permission/.test(v)), J(signedOut));
  ok('   while the public ones can (that is what public means)', (await tryGet(anon, 'calEvents', art.id)) === 'read');

  /* ---------- 10. twice ---------- */
  const daysBefore = J((await all('roomDays')).map(d => [d.id, d.slots]));
  const out2 = await tool(['--write']);
  ok('10. RUN TWICE: nothing is made twice', J(await counts()) === J(c1) && !/: [1-9]\d* made/.test(out2), out2.slice(-500));
  ok('    and no room\'s time is taken twice', J((await all('roomDays')).map(d => [d.id, d.slots])) === daysBefore);

  /* What one whole run made, to compare the two parts with (section 12). */
  const FULL = await snapshot();

  /* ---------- 11. ordinary data ---------- */
  const G1 = await page(null, 375);
  await G1.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  const seen = await until(() => G1.$eval('body', e => /Test Art Group/.test(e.innerText) ? e.innerText : '').catch(() => ''), 15000);
  ok('11. the public What\'s on shows an imported public event, and not a members-only one', !!seen && !/Test Clean/.test(seen), (seen || '').slice(0, 300));
  const M = await page('martin');
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector(`button.open[data-id="${art.id}"]`, { timeout: 20000 });
  await M.$eval(`button.open[data-id="${art.id}"]`, b => b.click());
  await M.waitForSelector('#f_title');
  await M.$eval('#f_title', e => { e.value = 'Test Art Group (renamed)'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await M.$eval('#save', b => b.click());
  ok('    an admin edits an imported event like any other', (await until(async () => ((await get('calEvents', art.id)) || {}).title === 'Test Art Group (renamed)' ? 'y' : null)) === 'y');

  /* ---------- 12. in two parts (Martin, 14 Oct: the live database can be read signed out until switch-over) ---------- */
  const refuse = async (extra, re) => { try { await new Promise((res, rej) => execFile(process.execPath, RUN.concat(extra), { cwd: V2, encoding: 'utf8', env: Object.assign({}, process.env, { FIRESTORE_EMULATOR_HOST: '' }) },
    (e, out, err) => (e ? rej(Object.assign(e, { stderr: err })) : res(out)))); return false; } catch (e) { return re.test(String(e.stderr)); } };
  ok('12. LIVE, ONE PART MUST BE NAMED', await refuse(['--write', '--live'], /Refusing: live, name one part/));
  ok('    and the private part goes live only with --rules-locked', await refuse(['--write', '--live', '--part', 'private'], /Refusing: the private part .* only once the rules are locked/));
  await env.clearFirestore();
  const outPub = await tool(['--write', '--part', 'public']);
  const evPub = await all('calEvents'), bkPub = await all('bookings'), kPub = await all('importKeys');
  const publicIds = new Set(evPub.filter(e => e.visibility === 'public').map(e => e.id));
  ok('    THE PUBLIC PART: public events only, nothing members-only', evPub.length > 0 && evPub.every(e => e.visibility === 'public'), J(evPub.map(e => e.visibility)));
  ok('    bookings only to hold those events\' rooms, titled with the event\'s name (no hires)', bkPub.length > 0 && bkPub.every(b => b.kind === 'event' && publicIds.has(b.calEventId) && evPub.find(e => e.id === b.calEventId).title === b.title));
  ok('    no small groups, private parts, dates or jobs; import names only for those bookings', (await all('smallGroups')).length === 0 && (await all('smallGroupPrivate')).length === 0 &&
    (await all('smallGroupMeetings')).length === 0 && (await all('maintJobs')).length === 0 && kPub.length === bkPub.length && kPub.every(k => /^cs_ev_/.test(k.id)));
  ok('    the building, the rooms and the pictures are there', (await all('sites')).length === 1 && (await all('rooms')).length === 5 && (await all('pictureLibrary')).length === 2, outPub.slice(-300));
  await tool(['--write', '--part', 'private']);
  const SPLIT = await snapshot();
  ok('    THEN THE PRIVATE PART: the two together make exactly what one whole run made', J(SPLIT) === J(FULL), J(Object.keys(FULL).filter(k => J(FULL[k]) !== J(SPLIT[k]))));
  const again1 = await tool(['--write', '--part', 'public']), again2 = await tool(['--write', '--part', 'private']), again3 = await tool(['--write']);
  ok('    and either part, or the whole, run again makes nothing new', J(await snapshot()) === J(FULL) && ![again1, again2, again3].some(o => /: [1-9]\d* made/.test(o)));

  ok('no page threw an error', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, (e.stderr ? String(e.stderr).slice(-800) + '\n' : '') + (e.stack || e.message));
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
