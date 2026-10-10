/* The app's Maintenance "Jobs" and Running things "Bookings" (F-140), on
   the REAL shell (egbc-app.js, through screenshots/events/app-harness.html),
   and the Home helpers myGroupsNext() and officeToday().
   Events window. Invented people, rooms and groups only, events emulators
   only, network guard, no email leaves the machine (egbc-email's outbox).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/app-jobs-office.test.mjs"

   What it proves:
     1. Jobs: the Maintenance team sees what needs fixing, reports one with
        a photo, sees a photo, marks one done with a note, opens it again
     2. what people type is shown as text, never as page code, through the
        shell's own helpers (F-130)
     3. Bookings: the office sees what is waiting at ITS sites only; a free
        booking is approved or declined on the phone, and the person is
        emailed; one with a price or a series goes to Room bookings; a
        closed room is not approved from the phone
     4. officeToday() counts the same; myGroupsNext() gives the next meeting,
        skipping one the leader called off */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-jo-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const D5 = fwd(5), D6 = fwd(6), D12 = fwd(12), D19 = fwd(19);
const PIC = path.join(TMP, 'leak.png'); fs.writeFileSync(PIC, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

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
  mo:   { email: 'mo.maint@example.invalid', name: 'Mo Maintenance', mid: 'm_mo', teams: ['Maintenance'] },
  ann:  { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] },
  lena: { email: 'lena.office@example.invalid', name: 'Lena Office', mid: 'm_lena', teams: ['Core Team'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const ROOM = (siteId, name, extra) => ({ siteId, name, kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
  bookableByMembers: true, bookableByHirers: true, description: '', photoUrl: '', ...(extra || {}) });
const BK = (key, extra) => ({ kind: 'member', status: 'requested', siteId: 'site_t', roomId: 'room_hall', groupId: '', day: D5, startMin: 1140, endMin: 1260,
  startLocal: D5 + 'T19:00', endLocal: D5 + 'T21:00', setupMins: 0, packdownMins: 0, slotFrom: 76, slotTo: 84, title: 'Band practice (invented)', people: 6, layout: '',
  av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: 'Drums and two guitars (invented).',
  requester: { name: 'Samy Member', email: 'samy.member@example.invalid', phone: '', org: '' }, memberUid: 'u_samy_x', memberName: 'Samy Member', createdAt: 'x', ...(extra || {}) });
const TOMORROW = new Date(); TOMORROW.setDate(TOMORROW.getDate() + 1);
const GDAY = TOMORROW.getDay() || 7, D1 = ymd(TOMORROW), D8 = fwd(8);
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1, bookingsEmail: 'bookings@example.invalid' });
  await setDoc(doc(db, 'sites', 'site_o'), { name: 'Other Site', active: true, order: 2 });
  await setDoc(doc(db, 'rooms', 'room_hall'), ROOM('site_t', 'Test Hall', { order: 1 }));
  await setDoc(doc(db, 'rooms', 'room_vestry'), ROOM('site_t', 'Test Vestry', { order: 2 }));
  await setDoc(doc(db, 'rooms', 'room_far'), ROOM('site_o', 'Far Room'));
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: ['m_lena'], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'bookingSettings', 'site_o'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'bookingTypes', 'type_hire'), { name: 'Private hire', forPublic: true, charged: true, termsVersion: 0 });
  /* Waiting at Lena's site: a free member booking, one more to decline, a priced hire, a series of two; and one at another site. */
  await setDoc(doc(db, 'bookings', 'bk_free_000000000000000000000000'), BK('a'));
  await setDoc(doc(db, 'bookings', 'bk_decl_000000000000000000000000'), BK('b', { roomId: 'room_vestry', title: '<script>window.__pwned=1</script>Choir & friends', day: D6, startLocal: D6 + 'T19:00', endLocal: D6 + 'T21:00' }));
  await setDoc(doc(db, 'bookings', 'bk_hire_000000000000000000000000'), BK('c', { kind: 'hire', bookingType: 'type_hire', title: 'Birthday party (invented)', memberUid: '', day: D12, startLocal: D12 + 'T19:00', endLocal: D12 + 'T21:00' }));
  for (const [n, d] of [[1, D12], [2, D19]]) await setDoc(doc(db, 'bookings', ('bk_ser' + n).padEnd(32, '0')), BK('s', { roomId: 'room_vestry', title: 'Yoga (invented)', day: d, startLocal: d + 'T10:00', endLocal: d + 'T11:00',
    startMin: 600, endMin: 660, slotFrom: 40, slotTo: 44, series: { id: 'ser_yoga', rule: 'week', n, of: 2 } }));
  await setDoc(doc(db, 'bookings', 'bk_far_0000000000000000000000000'), BK('d', { siteId: 'site_o', roomId: 'room_far', title: 'NOT LENA\u2019S SITE' }));
  /* A job Ann reported, with a photo; and one with page code in it. */
  await setDoc(doc(db, 'maintJobs', 'job_ann'), { siteId: 'site_t', roomId: 'room_hall', where: 'Test Hall', what: 'Radiator dripping (invented)', details: 'Under the window.', photoPath: 'maintJobs/job_ann/photo',
    status: 'todo', reportedBy: P.ann.uid, reportedByName: 'Ann Attender', reportedAt: new Date(Date.now() - 864e5) });
  await setDoc(doc(db, 'maintJobs', 'job_code'), { siteId: '', roomId: '', where: 'Car park', what: '<img src=x onerror="window.__pwned=2">Gate & latch', details: '', photoPath: '',
    status: 'todo', reportedBy: P.ann.uid, reportedByName: 'Ann <b>Attender</b>', reportedAt: new Date(Date.now() - 2 * 864e5) });
  /* Mo's small group: weekly on tomorrow's weekday; tomorrow's meeting called off. */
  await setDoc(doc(db, 'smallGroups', 'sg_tue'), { name: 'Test Home Group', type: 'Home group', day: GDAY, time: '19:30', frequency: 'weekly', locationKind: 'home', area: 'Esher',
    address: '1 Invented Road', open: true, capacity: 0, memberCount: 1, visibility: 'public', canCome: ['public', 'members'], active: true, leaderIds: ['m_lead'], leaderNames: ['Lee'] });
  await setDoc(doc(db, 'smallGroupMembers', 'sg_tue__a_m_mo'), { groupId: 'sg_tue', personKind: 'addressBook', personId: 'm_mo', name: 'Mo', email: P.mo.email, phone: '', joinedAt: 'x', addedBy: 'x' });
  await setDoc(doc(db, 'smallGroupMeetings', 'sg_tue__' + D1), { groupId: 'sg_tue', date: D1, time: '19:30', cancelled: true, notes: '', updatedAt: 'x', updatedBy: 'x' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (col, id) => readDb(async (db) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? s.data() : null; });
const list = (col) => readDb(async (db) => (await getDocs(collection(db, col))).docs.map(d => ({ id: d.id, ...d.data() })));
/* Ann's photo, put up as the rules would let her. */
await fetch(`http://127.0.0.1:9198/v0/b/${BUCKET}/o?name=${encodeURIComponent('maintJobs/job_ann/photo')}`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'image/png' }, body: fs.readFileSync(PIC) });

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 390, height: 844 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const app = (space, tab) => 'screenshots/events/app-harness.html?space=' + space + '&tab=' + tab;

try {
  /* 1. Jobs */
  const M = await as('mo');
  await go(M, app('maint', 'jobs'), '.hello');
  await until(() => M.$('[data-m="todo"]'));
  const jt = await text(M, '#egbc-content');
  ok('1. Jobs: what needs fixing, newest first, with who reported it', /Maintenance.*Test Hall: Radiator dripping \(invented\) Reported by Ann Attender .* · photo To do.*Car park:/.test(jt), jt.slice(0, 400));
  ok('   the shell shows Jobs as a real tab now, not the interim link', await M.evaluate(() => EGBCApp.state().tab === 'jobs' && !!document.querySelector('[data-tab="jobs"]') && !!document.querySelector('[data-tab="rooms"]')));
  ok('2. PAGE CODE IN A JOB IS SHOWN AS TEXT, never run (the shell\'s helpers escape)', /<img src=x onerror="window.__pwned=2">Gate & latch/.test(jt) && /Ann <b>Attender<\/b>/.test(jt)
    && !(await M.evaluate(() => window.__pwned)) && !(await M.$('#egbc-content img')) && !(await M.$('#egbc-content b b')));
  await tap(M, '[data-mact="report"]');
  await M.waitForSelector('#jb-room');
  await tap(M, '[data-mact="doreport"]');
  ok('   reporting asks where and what', !!(await until(async () => /Say where, and what is wrong/.test(await text(M, '#egbc-content')))));
  await M.select('#jb-room', 'room_vestry');
  await val(M, '#jb-what', 'Door sticks (invented)');
  await val(M, '#jb-details', 'The one to the kitchen.');
  await (await M.$('#jb-photo')).uploadFile(PIC);
  await tap(M, '[data-mact="doreport"]');
  const nj = await until(async () => (await list('maintJobs')).find(j => j.what === 'Door sticks (invented)') || null);
  ok('   MO REPORTS ONE FROM THE APP, with its photo', nj && nj.roomId === 'room_vestry' && nj.where === 'Test Vestry' && nj.reportedBy === P.mo.uid && nj.status === 'todo' && nj.photoPath === 'maintJobs/' + nj.id + '/photo', J(nj));
  const files = await until(async () => { const r = await (await fetch(`http://127.0.0.1:9198/v0/b/${BUCKET}/o?prefix=${encodeURIComponent('maintJobs/' + nj.id + '/')}`, { headers: { Authorization: 'Bearer owner' } })).json(); return (r.items || []).length ? r.items : null; });
  ok('   its photo is stored', !!files);
  await until(async () => /Reported, with the photo/.test(await text(M, '#egbc-content')));
  await tap(M, '[data-mact="job:job_ann"]');
  await until(() => M.$('[data-m="job"]'));
  await tap(M, '[data-mact="photo:job_ann"]');
  await until(() => M.$('[data-m="photo"]'));
  ok('   THE TEAM SEES A JOB\'S PHOTO', !!(await M.$('[data-m="photo"]')));
  await val(M, '#jb-note', 'Bled it (invented)');
  await tap(M, '[data-mact="done:job_ann"]');
  const dj = await until(async () => { const j = await get('maintJobs', 'job_ann'); return j && j.status === 'done' ? j : null; });
  ok('   marks it done, in Mo\'s name, with the note', dj && dj.doneBy === P.mo.uid && dj.doneNote === 'Bled it (invented)', J(dj));
  await until(async () => /Marked done/.test(await text(M, '#egbc-content')));
  await M.screenshot({ path: path.join(HERE, 'app-jobs-375.png'), fullPage: true });
  await tap(M, '[data-mact="job:job_ann"]');
  await until(() => M.$('[data-mact="reopen:job_ann"]'));
  await tap(M, '[data-mact="reopen:job_ann"]');
  ok('   and opens it again', !!(await until(async () => (await get('maintJobs', 'job_ann')).status === 'todo')));

  /* 4b. myGroupsNext for Mo */
  const groups = await M.evaluate(() => EGBCEventsHome.myGroupsNext());
  ok('4. myGroupsNext(): Mo\'s group, its next meeting a week on because tomorrow\'s was called off; the area, never the address', groups.length === 1 && groups[0].name === 'Test Home Group'
    && groups[0].date === D8 && groups[0].cancelled === true && groups[0].time === '19:30' && groups[0].where === 'In a home in Esher' && !/Invented Road/.test(J(groups)), J(groups));

  /* 3. Bookings */
  const L = await as('lena');
  await go(L, app('office', 'bookings'), '.hello');
  await until(() => L.$('[data-o="requests"]'));
  const bt = await text(L, '#egbc-content');
  ok('3. Bookings: what is waiting at Lena\'s site, each "Approve?"', /Band practice \(invented\) · Test Hall .*Samy Member Approve\?/.test(bt) && /Birthday party/.test(bt) && /Yoga \(invented\) · Test Vestry Every week, 2 dates from/.test(bt), bt.slice(0, 600));
  ok('   NEVER ANOTHER SITE\'S', !/NOT LENA/.test(bt));
  ok('   page code in a booking\'s title is shown as text', /<script>window.__pwned=1<\/script>Choir & friends/.test(bt) && !(await L.evaluate(() => window.__pwned)));
  const counts = await L.evaluate(() => EGBCEventsHome.officeToday());
  ok('   officeToday() counts the same: 5 waiting (the yoga series is two), 3 jobs to do', counts.roomRequests === 5 && counts.jobsToDo === 3, J(counts));
  await tap(L, '[data-oact="req:bk_hire_000000000000000000000000"]');
  await until(() => L.$('[data-o="full"]'));
  ok('   a hire, with a price to confirm, goes to Room bookings', /a price to confirm, so it is decided in Room bookings/.test(await text(L, '[data-o="full"]')) && !(await L.$('[data-oact^="approve:"]')));
  await tap(L, '[data-oact="list"]');
  await until(() => L.$('[data-o="requests"]'));
  await L.evaluate(() => EGBCEmail.clearOutbox());
  await tap(L, '[data-oact="req:bk_free_000000000000000000000000"]');
  await until(() => L.$('[data-oact="approve:bk_free_000000000000000000000000"]'));
  await L.screenshot({ path: path.join(HERE, 'app-office-booking-375.png'), fullPage: true });
  await tap(L, '[data-oact="approve:bk_free_000000000000000000000000"]');
  const ap = await until(async () => { const b = await get('bookings', 'bk_free_000000000000000000000000'); return b && b.status === 'confirmed' ? b : null; });
  const day = await get('roomDays', 'room_hall_' + D5);
  ok('   A FREE ONE IS APPROVED ON THE PHONE: confirmed, its time taken, in Lena\'s name', ap && ap.decidedBy === P.lena.uid && day && day.slots.slice(76, 84).every(x => x === 1), J(ap && ap.status));
  const am = await until(async () => (await outbox(L)).find(m => /Your booking is confirmed/.test(m.subject)));
  ok('   and Samy is emailed', am && am.to[0] === 'samy.member@example.invalid', J(am && am.to));
  await until(async () => /Approved: Band practice/.test(await text(L, '#egbc-content')));
  await tap(L, '[data-oact="req:bk_decl_000000000000000000000000"]');
  await until(() => L.$('[data-oact="decline:bk_decl_000000000000000000000000"]'));
  await tap(L, '[data-oact="decline:bk_decl_000000000000000000000000"]');
  ok('   declining asks why', !!(await until(async () => /Say why, in a few words/.test(await text(L, '#egbc-content')))));
  await val(L, '#of-note', 'The Vestry is being painted (invented).');
  await tap(L, '[data-oact="decline:bk_decl_000000000000000000000000"]');
  const dc = await until(async () => { const b = await get('bookings', 'bk_decl_000000000000000000000000'); return b && b.status === 'declined' ? b : null; });
  const dm = await until(async () => (await outbox(L)).find(m => /could not go ahead/.test(m.subject)));
  ok('   DECLINED, with the reason, and they are told it', dc && dc.decisionNote === 'The Vestry is being painted (invented).' && dm && /being painted/.test(dm.html), J(dc && dc.decisionNote));
  /* A closed room is not approved from the phone. */
  await readDb(async (db) => {
    await setDoc(doc(db, 'bookings', 'bk_shut_000000000000000000000000'), BK('e', { title: 'In a closed room (invented)', day: D6, startLocal: D6 + 'T19:00', endLocal: D6 + 'T21:00' }));
    await setDoc(doc(db, 'roomClosures', 'cl_x'), { siteId: 'site_t', roomId: 'room_hall', roomName: 'Test Hall', from: D6, to: D6, days: [D6], reason: 'Repainting (invented)', status: 'on', by: 'x', byName: 'x', at: new Date() });
    await setDoc(doc(db, 'roomClosedDays', 'room_hall_' + D6), { closureId: 'cl_x', roomId: 'room_hall', siteId: 'site_t', day: D6, on: true });
  });
  await go(L, app('office', 'bookings'), '.hello');
  await until(() => L.$('[data-oact="req:bk_shut_000000000000000000000000"]'));
  ok('   a closure with someone booked then is listed to warn', /Rooms closed Test Hall closed .* 1 booked then: warn them/.test(await text(L, '#egbc-content')), await text(L, '#egbc-content'));
  await tap(L, '[data-oact="req:bk_shut_000000000000000000000000"]');
  await until(() => L.$('[data-oact="approve:bk_shut_000000000000000000000000"]'));
  await tap(L, '[data-oact="approve:bk_shut_000000000000000000000000"]');
  await until(async () => /closed that day/.test(await text(L, '#egbc-content')));
  ok('   A ROOM CLOSED THAT DAY IS NOT APPROVED FROM THE PHONE', /The Test Hall is closed that day/.test(await text(L, '#egbc-content')) && (await get('bookings', 'bk_shut_000000000000000000000000')).status === 'requested');

  /* Someone who is not the office */
  const A = await as('ann');
  await go(A, app('office', 'bookings'), '.hello');
  await until(() => A.evaluate(() => window.__harnessReady === true));
  ok('   an Attender has no Running things at all', (await A.evaluate(() => EGBCApp.state().space)) !== 'office' && !(await A.$('[data-o="requests"]')));

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
