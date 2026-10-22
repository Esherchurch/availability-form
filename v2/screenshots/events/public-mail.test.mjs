/* The public pages' emails, sent by the hub's server (F-168, NEXT-BRIEF
   §26 item 14). Events window. Invented people only, events emulators
   only. NOTHING LEAVES THE MACHINE: on the emulator every message goes to
   emailOutbox, and the one "real" send below goes to a stand-in on this
   machine.

     node screenshots/events/public-mail.test.mjs

   It runs on UTC, as Google's servers do, so the England clock is really
   tested: on a computer in England any clock would look right.

   It starts its own emulators. The main window adds one line to
   functions/index.js to switch these on:
       export * from './public-mail.js';
   Until then this runs the functions from a scratch copy of functions/
   with that line added, so the main window's files are never edited.

   What it proves:
     A. the server's words are the pages' own, up to date, and right in
        England in summer and winter; the check-in code it draws reads back
     B. with sendEmail's open path OFF (a stand-in that refuses anything
        without a Google identity token), the server's send still goes,
        attachments and all; without the token it is refused, and recorded
     C. each of the seven, as a trigger in the functions emulator, sends
        the right email when what the page saves is saved; a walk-in and
        the later dates of a series send nothing; each one's feature
        switch stops it; a trigger run twice sends once
     D. none of the seven pages can send these emails itself any more
        (each page's own check proves it sends none, in a browser) */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import jsQR from 'jsqr';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const LINE = "export * from './public-mail.js';";

/* ------------------------------------------------ outside: start it all */
if (!process.env.PM_INNER) {
  const ev = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-pm-'));
  const FN = path.join(TMP, 'functions');
  fs.cpSync(path.join(V2, 'functions'), FN, { recursive: true, filter: (s) => !/[\\/]node_modules([\\/]|$)/.test(s) });
  fs.symlinkSync(path.join(V2, 'functions', 'node_modules'), path.join(FN, 'node_modules'), 'junction');
  /* Since ecf5dc50 index.js has the line itself: add it only if missing. */
  if (!fs.readFileSync(path.join(FN, 'index.js'), 'utf8').includes(LINE)) fs.appendFileSync(path.join(FN, 'index.js'), '\n' + LINE + '\n');
  for (const f of ['firestore.build.rules', 'firestore.indexes.json']) fs.copyFileSync(path.join(V2, f), path.join(TMP, f));
  fs.writeFileSync(path.join(TMP, 'firebase.json'), JSON.stringify({
    firestore: { rules: 'firestore.build.rules', indexes: 'firestore.indexes.json' },
    emulators: { firestore: ev.emulators.firestore, functions: ev.emulators.functions, hub: ev.emulators.hub,
      logging: ev.emulators.logging, ui: { enabled: false }, singleProjectMode: true },
    functions: [{ source: 'functions', codebase: 'hub', ignore: ['node_modules', '.git', '*.local'] }]
  }, null, 2));
  const r = spawnSync('npx', ['firebase', 'emulators:exec', '--config', path.join(TMP, 'firebase.json'), '--only', 'firestore,functions',
    '--project', PROJECT, JSON.stringify('node ' + fileURLToPath(import.meta.url).replace(/\\/g, '/'))],
    { cwd: V2, stdio: 'inherit', shell: true, env: { ...process.env, PM_INNER: '1', FN_DIR: FN, TZ: 'UTC' } });
  /* The junction first, and only then the folder: never through it. */
  let gone = false;
  try { fs.unlinkSync(path.join(FN, 'node_modules')); gone = !fs.existsSync(path.join(FN, 'node_modules')); } catch (e) {}
  if (gone) fs.rmSync(TMP, { recursive: true, force: true });
  else console.log('left ' + TMP + ' (could not unlink its node_modules link safely)');
  process.exit(r.status == null ? 1 : r.status);
}

/* ------------------------------------------------- inside: the checks */
if (new Date(2026, 5, 20, 12).getTimezoneOffset() !== 0) throw new Error('Not running on UTC - the England clock would not be tested.');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not on the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const FN = process.env.FN_DIR;
const fnRequire = createRequire(path.join(FN, 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore, Timestamp } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const PM = await import(pathToFileURL(path.join(FN, 'public-mail.js')).href);
const { build } = await import(pathToFileURL(path.join(HERE, 'public-mail-pages.mjs')).href);

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 25000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(400); } return last; }
const J = (x) => JSON.stringify(x);
const rows = async (ref) => (await db.collection('emailOutbox').where('ref', '==', ref).get()).docs.map(d => d.data());
const b64 = (s) => Buffer.from(s, 'base64').toString('utf8');

/* My own grey PNG, read back to pixels for jsQR: one filter byte per row. */
function pngPixels(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  let p = 8, idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8); if (type === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len)); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = raw[y * (w + 1) + 1 + x], i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255; }
  return { w, h, rgba };
}

try {
  /* ---------- A. the words ---------- */
  console.log('\nA. the words are the pages\' own');
  ok('A1. the server\'s copy of the pages\' files is up to date', fs.readFileSync(path.join(V2, 'functions', 'public-mail-pages.cjs'), 'utf8').replace(/\r\n/g, '\n') === build());
  const idx = fs.readFileSync(path.join(V2, 'functions', 'index.js'), 'utf8');
  ok('A2. it sends to the same sendEmail as index.js', (idx.match(/const SEND_EMAIL_URL = '([^']+)'/) || [])[1] === PM.SEND_EMAIL_URL);
  const P = PM.pages({ hub: 'https://example.invalid/hub/', church: { name: 'Test Church (invented)', enquiryEmail: 'office@example.invalid' } });
  const EV = { id: 'ev_a', title: 'Test summer evening', startLocal: '2026-06-20T19:30', endLocal: '2026-06-20T21:00', description: '<p>Bring a <b>chair</b> &amp; a cup</p>', location: {} };
  const KEY = 'k'.repeat(32);
  const summer = P.E.confirmationEmail({ ev: EV, where: 'Test hall', email: 'a@example.invalid', places: 2, attendees: [{ name: 'Ann Invented' }, { name: 'Bob Invented' }], manageKey: KEY, status: 'confirmed' });
  const sIcs = b64(summer.attachments[0].content);
  ok('A3. IN ENGLAND IN JUNE: the email says 19:30, the calendar file 18:30 UTC', /Sat 20 Jun 2026, 19:30 – 21:00/.test(summer.html) && /DTSTART:20260620T183000Z/.test(sIcs) && /DTEND:20260620T200000Z/.test(sIcs), sIcs.match(/DTSTART:\S+/));
  const winter = P.E.confirmationEmail({ ev: { ...EV, startLocal: '2026-12-19T19:30', endLocal: '2026-12-19T21:00' }, email: 'a@example.invalid', manageKey: KEY, status: 'confirmed' });
  ok('    and in December, 19:30 is 19:30 UTC', /Sat 19 Dec 2026, 19:30/.test(winter.html) && /DTSTART:20261219T193000Z/.test(b64(winter.attachments[0].content)));
  ok('    the calendar\'s words are plain text, and its link is the church\'s hub', /DESCRIPTION:Bring a chair & a cup/.test(sIcs) && /URL:https:\/\/example.invalid\/hub\/signup.html\?event=ev_a/.test(sIcs.replace(/\r\n /g, '')));
  ok('    the manage link is the hub\'s, with the sign-up\'s key', summer.html.includes('https://example.invalid/hub/my-signup.html?key=' + KEY));
  ok('    the church\'s name is in the footer', /Test Church \(invented\)/.test(summer.html));
  const codes = summer.attachments.filter(a => a.type === 'image/png').map(a => { const px = pngPixels(Buffer.from(a.content, 'base64')); const r = jsQR(px.rgba, px.w, px.h); return r && r.data; });
  ok('A4. one check-in code per person, and each reads back as theirs', J(codes) === J(['EGBC1|ev_a|' + KEY.slice(0, 10) + '|0', 'EGBC1|ev_a|' + KEY.slice(0, 10) + '|1']), J(codes));
  ok('    a waiting-list place has no code', P.E.confirmationEmail({ ev: EV, email: 'a@example.invalid', manageKey: KEY, status: 'waiting' }).attachments.length === 1);

  /* ---------- B. the open path OFF ---------- */
  console.log('\nB. sendEmail with its open path OFF');
  const got = [];
  const stand = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      const a = req.headers.authorization || '';
      got.push({ a, body: JSON.parse(body || '{}') });
      res.setHeader('Content-Type', 'application/json');
      if (!/^Bearer \S+/.test(a)) { res.statusCode = 401; res.end(J({ ok: false, error: 'a Google identity is required' })); return; }
      res.end(J({ ok: true }));
    });
  });
  await new Promise(r => stand.listen(0, '127.0.0.1', r));
  const URL_ = 'http://127.0.0.1:' + stand.address().port + '/';
  const secretMail = { to: ['a@example.invalid'], subject: 'Test received', html: '<a href="https://example.invalid/hub/form.html?k=RK&s=SECRETKEY123">See</a>', attachments: summer.attachments };
  const withToken = PM.makeSender({ db, url: URL_, emulator: () => false, auth: async () => ({ Authorization: 'Bearer test-identity-token' }) });
  const r1 = await withToken(secretMail, { source: 'public-mail', kind: 'test', ref: 'open-off-1' });
  ok('B1. WITH THE SERVER\'S IDENTITY, IT GOES', r1.ok === true && got[0] && got[0].a === 'Bearer test-identity-token', J(r1));
  ok('    with its calendar file and both check-in codes', got[0] && (got[0].body.attachments || []).map(a => a.filename).join() === 'event.ics,check-in Ann Invented.png,check-in Bob Invented.png');
  ok('    and the private link, to the person', got[0] && /s=SECRETKEY123/.test(got[0].body.html));
  const o1 = (await rows('open-off-1'))[0] || {};
  ok('    recorded: sent, with the identity, attachments by name only', o1.ok === true && o1.auth === 'google' && o1.stubbed === false && J(o1.attachments) === J([{ filename: 'event.ics', type: 'text/calendar' }, { filename: 'check-in Ann Invented.png', type: 'image/png' }, { filename: 'check-in Bob Invented.png', type: 'image/png' }]), J(o1).slice(0, 300));
  ok('    THE RECORD DOES NOT HOLD THE PRIVATE LINK', !/SECRETKEY123/.test(J(o1)) && /s=\(hidden\)/.test(o1.html));
  const noToken = PM.makeSender({ db, url: URL_, emulator: () => false, auth: async () => ({}) });
  const r2 = await noToken(secretMail, { source: 'public-mail', kind: 'test', ref: 'open-off-2' });
  const o2 = (await rows('open-off-2'))[0] || {};
  ok('B2. without it, refused, and the refusal is recorded where someone can see it', r2.ok === false && o2.ok === false && /Google identity/.test(o2.error) && o2.auth === 'none', J(o2).slice(0, 200));
  stand.close();

  /* ---------- C. the seven, as triggers ---------- */
  console.log('\nC. the seven, as triggers in the functions emulator');
  const seed = db.batch(), set = (c, id, d) => seed.set(db.collection(c).doc(id), d);
  set('churchSettings', 'details', { name: 'Test Church (invented)', enquiryEmail: 'office@example.invalid', hubUrl: 'https://example.invalid/hub/' });
  set('welcomeSettings', 'public', { notifyEmail: 'welcome@example.invalid' });
  set('sites', 'site_pm', { name: 'Test site', active: true, bookingsEmail: 'bookings@example.invalid' });
  set('rooms', 'room_pm', { name: 'Test hall', siteId: 'site_pm', active: true });
  set('calEvents', 'ev_pm', { title: 'Test barbecue', startLocal: '2026-06-20T19:30', endLocal: '2026-06-20T21:00', startUtc: Date.UTC(2026, 5, 20, 18, 30), allDay: false, status: 'published',
    location: { kind: 'room', siteId: 'site_pm', roomIds: ['room_pm'] }, description: '<p>Invented.</p>' });
  /* F-184: a second date of the barbecue, for a whole-series booking. */
  set('calEvents', 'ev_pm2', { title: 'Test barbecue', startLocal: '2026-06-27T19:30', endLocal: '2026-06-27T21:00', startUtc: Date.UTC(2026, 5, 27, 18, 30), allDay: false, status: 'published', seriesId: 'ser_pm',
    location: { kind: 'room', siteId: 'site_pm', roomIds: ['room_pm'] }, description: '<p>Invented.</p>' });
  set('smallGroups', 'grp_pm', { name: 'Test home group', day: 2, time: '19:30', leaderIds: ['m_lena'], memberCount: 0 });
  set('addressBook', 'm_lena', { name: 'Lena Leader (invented)', email: 'lena.leader@example.invalid' });
  set('formRequests', 'fr_pm', { formTitle: 'Test consent', name: 'Pam Parent (invented)', email: 'pam@example.invalid', status: 'sent', formId: 'f_pm' });
  set('formRequests', 'fr_pm2', { formTitle: 'Test consent', name: 'Pat Parent (invented)', email: 'pat@example.invalid', status: 'sent', formId: 'f_pm' });
  set('sensitiveResponses', 'SENSITIVEKEY123', { requestKey: 'fr_pm', responseId: 'resp_pm', answers: {} });
  /* F-183: a priced ticket, so the email says what to pay on the day. */
  seed.set(db.collection('calEvents').doc('ev_pm').collection('ticketTypes').doc('tt_pm'), { name: 'Adult', price: 6, capacity: 0, order: 1 });
  await seed.commit();
  await sleep(1500);

  const SK = 'signupkey' + 'a'.repeat(23), WK = 'w_' + 'b'.repeat(30);
  const hire = { kind: 'hire', roomId: 'room_pm', siteId: 'site_pm', startMin: 600, endMin: 660, title: 'Test toddler group', status: 'requested', requester: { name: 'Hal Hirer (invented)', email: 'hirer@example.invalid', org: 'Invented Tots' } };
  const w = db.batch();
  w.set(db.collection('signups').doc(SK), { calEventId: 'ev_pm', personKind: 'contacts', personId: 'c_x', name: 'Sue Signup (invented)', email: 'sue@example.invalid', phone: '', attendees: [{ name: 'Sue Signup (invented)' }, { name: 'Sam Signup (invented)' }], answers: {}, places: 2, ticketTypeId: 'tt_pm', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: new Date().toISOString() });
  w.set(db.collection('signups').doc(WK), { calEventId: 'ev_pm', personKind: 'contacts', personId: 'c_y', name: 'Walter Walkin (invented)', email: 'walter@example.invalid', phone: '', attendees: [{ name: 'Walter Walkin (invented)' }], answers: {}, places: 1, ticketTypeId: '', status: 'confirmed', donation: 0, notes: 'Walk-in at the door', memberUid: '', createdAt: new Date().toISOString() });
  w.set(db.collection('checkins').doc('ev_pm__' + WK + '__0'), { calEventId: 'ev_pm', signupKey: WK, attendeeIndex: 0, name: 'Walter Walkin (invented)' });
  w.set(db.collection('bookings').doc('bk_pmone'), { ...hire, day: '2026-11-03' });
  ['2026-11-10', '2026-11-17', '2026-11-24'].forEach((d, i) => w.set(db.collection('bookings').doc('bk_pmser' + (i + 1)), { ...hire, day: d, series: { id: 's_pm', rule: 'week', n: i + 1, of: 3 } }));
  w.set(db.collection('smallGroupRequests').doc('sgr_pm'), { groupId: 'grp_pm', groupName: 'Test home group', name: 'Gail Guest (invented)', email: 'gail@example.invalid', phone: '', message: 'New here (invented).', personKind: 'contacts', personId: 'c_z', status: 'asked', createdAt: Timestamp.now() });
  w.set(db.collection('welcomes').doc('wel_pm'), { name: 'Vera Visitor (invented)', email: 'vera@example.invalid', phone: '', message: 'Hello (invented).', contactMe: true, uid: '', at: Timestamp.now(), status: 'new' });
  /* F-184: one booking for both dates: two sign-ups, one email. */
  const S1 = 'seriesone' + 'd'.repeat(23), S2 = 'seriestwo' + 'e'.repeat(23);
  const SSU = (ev, status) => ({ calEventId: ev, personKind: 'contacts', personId: 'c_s', name: 'Sid Series (invented)', email: 'sid@example.invalid', phone: '', attendees: [{ name: 'Sid Series (invented)' }], answers: {}, places: 1, ticketTypeId: 'tt_pm', status, donation: 0, notes: '', createdAt: '2026-06-01T10:00:00Z' });
  w.set(db.collection('signups').doc(S1), SSU('ev_pm', 'confirmed'));
  w.set(db.collection('signups').doc(S2), SSU('ev_pm2', 'waiting'));
  const GRP = { seriesId: 'ser_pm', keys: [S1, S2], calEventIds: ['ev_pm', 'ev_pm2'], email: 'sid@example.invalid', createdAt: '2026-06-01T10:00:00Z' };
  w.set(db.collection('seriesSignups').doc(S1), GRP);
  w.set(db.collection('seriesSignups').doc(S2), GRP);
  await w.commit();
  await db.collection('bookings').doc('bk_pmone').update({ cancelRequest: { status: 'asked', at: Timestamp.now(), reason: 'Test: half term (invented)' } });
  await db.collection('formRequests').doc('fr_pm').update({ status: 'done', completedAt: new Date().toISOString(), responseId: 'resp_pm' });

  const su = await until(async () => (await rows(SK))[0]);
  ok('1. SIGN-UP: confirmed, to them, with the calendar file and two check-in codes', su && su.to[0] === 'sue@example.invalid' && su.subject === 'You are signed up: Test barbecue' && su.attachments.length === 3 && su.source === 'public-mail', J(su).slice(0, 300));
  ok('   and what to pay on the day: 2 places at £6 (F-183)', su && su.html.includes('To pay on the day:</strong> £12.00'), su && su.html.slice(0, 600));
  ok('   saying where and when, as the page did', su && /Test hall, Test site/.test(su.html) && /Sat 20 Jun 2026, 19:30 – 21:00/.test(su.html) && su.html.includes('https://example.invalid/hub/my-signup.html?key=' + SK));
  const one = await until(async () => { const r = await rows('bk_pmone'); return r.length >= 2 ? r : null; });
  const asked = (one || []).find(r => r.kind === 'booking waiting'), office = (one || []).find(r => r.kind === 'booking request');
  ok('2. BOOKING: the hirer is told it waits, with no calendar file', asked && asked.to[0] === 'hirer@example.invalid' && /^Your booking is waiting for approval: Test hall, Tue 3 Nov 2026, 10:00 to 11:00$/.test(asked.subject) && asked.attachments.length === 0, J(one));
  ok('3.   and the site\'s bookings address is told', office && office.to[0] === 'bookings@example.invalid' && /^Booking request: Test hall/.test(office.subject) && /Invented Tots/.test(office.html));
  const ser = await until(async () => { const r = await rows('bk_pmser1'); return r.length >= 2 ? r : null; });
  ok('   a repeating one: ONE email each, listing the three dates', ser && ser.length === 2 && /3 dates from Tue 10 Nov 2026/.test(ser.find(r => r.kind === 'booking waiting').subject) && /24 Nov/.test(ser.find(r => r.kind === 'booking request').html), J(ser && ser.map(r => r.subject)));
  const ask = await until(async () => (await rows('bk_pmone')).find(r => r.kind === 'cancel ask'));
  ok('4. ASK TO CANCEL: the office is told, with the reason', ask && ask.to[0] === 'bookings@example.invalid' && /^Asking to cancel: Test hall, Tue 3 Nov 2026/.test(ask.subject) && /half term/.test(ask.html), J(ask).slice(0, 200));
  const fr = await until(async () => (await rows('fr_pm'))[0]);
  ok('5. FORM: "Received", to them', fr && fr.to[0] === 'pam@example.invalid' && fr.subject === 'Received: Test consent');
  ok('   its private link is in what is sent, and NOT in the record', fr && /form\.html\?k=fr_pm&amp;s=\(hidden\)|form\.html\?k=fr_pm&s=\(hidden\)/.test(fr.html) && !/SENSITIVEKEY123/.test(J(fr)), fr && fr.html.match(/form\.html[^"]*/));
  /* What the person is sent (not the record): asked of the same code again,
     once its "sent" marker is cleared. */
  const toPam = [];
  await db.collection('publicMailSent').doc('formDone_fr_pm').delete();
  await PM.handlers.formDone({ db, send: async (m) => { toPam.push(m); return { ok: true }; }, key: 'fr_pm', before: { status: 'sent' },
    after: (await db.collection('formRequests').doc('fr_pm').get()).data() });
  ok('   the link THE PERSON gets carries the medical answers\' key', toPam[0] && /form\.html\?k=fr_pm&s=SENSITIVEKEY123/.test(toPam[0].html), toPam[0] && toPam[0].html.match(/form\.html[^"]*/));
  const grp = await until(async () => { const r = await rows('sgr_pm'); return r.length >= 2 ? r : null; });
  ok('6. SMALL GROUP: the person gets a copy', grp && grp.some(r => r.to[0] === 'gail@example.invalid' && r.subject === 'Your request to join Test home group' && /Tuesdays/.test(r.html)), J(grp && grp.map(r => r.subject)));
  ok('   AND THE LEADER IS TOLD, though nobody was signed in', grp && grp.some(r => r.to[0] === 'lena.leader@example.invalid' && /Gail Guest \(invented\) would like to join Test home group/.test(r.subject) && /New here/.test(r.html)));
  const wel = await until(async () => (await rows('wel_pm'))[0]);
  ok('7. I\'M NEW HERE: to the address the church chose', wel && wel.to[0] === 'welcome@example.invalid' && /^Someone new said hello: Vera Visitor/.test(wel.subject) && /would like someone to get in touch/.test(wel.html));

  /* ---------- the things that must send nothing ---------- */
  await sleep(4000);
  ok('   a walk-in at the door is not emailed (it never was)', (await rows(WK)).length === 0);
  const serMail = await until(async () => (await rows(S1))[0]);
  ok('   THE WHOLE SERIES (F-184): ONE email, from its first date, listing both dates', serMail && serMail.subject.endsWith('(2 dates)') && serMail.html.includes('The 2 dates:') &&
    serMail.html.includes('Sat 27 Jun 2026, 19:30 – 21:00 - on the waiting list'), serMail && (serMail.subject + ' | ' + serMail.html.slice(0, 500)));
  ok('   and the second date sends nothing of its own', (await rows(S2)).length === 0);
  ok('   what to pay counts only the date with a place: £6.00', serMail && serMail.html.includes('To pay on the day:</strong> £6.00'), serMail && serMail.html.slice(0, 600));
  ok('   the second and third dates of the series send nothing of their own', (await rows('bk_pmser2')).length === 0 && (await rows('bk_pmser3')).length === 0);
  const again = [], twice = await PM.handlers.signup({ db, send: async (m) => { again.push(m); return { ok: true }; }, key: SK, doc: (await db.collection('signups').doc(SK).get()).data() });
  ok('   A TRIGGER RUN TWICE SENDS ONCE', twice && twice.skipped === 'already sent' && again.length === 0, J(twice));

  /* ---------- the switches ---------- */
  await db.collection('churchSettings').doc('features').set({ events: false, roomBookings: false, forms: false, smallGroups: false, newHere: false });
  const off = db.batch();
  off.set(db.collection('signups').doc('signupoff' + 'c'.repeat(23)), { calEventId: 'ev_pm', personKind: 'contacts', personId: 'c_o', name: 'Otto Off (invented)', email: 'otto@example.invalid', attendees: [], answers: {}, places: 1, status: 'confirmed', createdAt: new Date().toISOString() });
  off.set(db.collection('bookings').doc('bk_pmoff'), { ...hire, day: '2026-12-01' });
  off.set(db.collection('smallGroupRequests').doc('sgr_off'), { groupId: 'grp_pm', name: 'Otto Off (invented)', email: 'otto@example.invalid', status: 'asked' });
  off.set(db.collection('welcomes').doc('wel_off'), { name: 'Otto Off (invented)', email: 'otto@example.invalid', contactMe: true, status: 'new' });
  await off.commit();
  await db.collection('formRequests').doc('fr_pm2').update({ status: 'done', responseId: 'r2' });
  await db.collection('bookings').doc('bk_pmser2').update({ cancelRequest: { status: 'asked', at: Timestamp.now(), reason: 'off' } });
  await sleep(9000);
  const offRows = (await db.collection('emailOutbox').where('to', 'array-contains', 'otto@example.invalid').get()).size +
    (await rows('bk_pmoff')).length + (await rows('fr_pm2')).length + (await rows('bk_pmser2')).length;
  ok('SWITCHED OFF, each of the seven sends nothing', offRows === 0, offRows + ' sent');
  const why = await PM.handlers.newHere({ db, send: async () => ({ ok: true }), id: 'x', doc: { name: 'x' } });
  ok('   and says so', why.skipped === 'switched off', J(why));
  await db.collection('churchSettings').doc('features').delete();

  /* ---------- nothing left the machine ---------- */
  const all = (await db.collection('emailOutbox').where('source', '==', 'public-mail').get()).docs.map(d => d.data());
  ok('NOTHING LEFT THE MACHINE: every trigger email was stubbed, to invented addresses',
    all.filter(r => r.kind !== 'test').every(r => r.stubbed === true && r.to.every(t => /@example\.invalid$/.test(t))), J(all.map(r => [r.kind, r.stubbed])));

  /* ---------- D. the pages ---------- */
  console.log('\nD. the pages cannot send these themselves');
  const src = (f) => fs.readFileSync(path.join(V2, f), 'utf8');
  const sends = /EGBCChurch\.send\(|EGBCEmail\.send\(|confirmationEmail\(|doneEmail\(|B\.tellOffice\(|B\.emailMany\(/;
  for (const f of ['signup.html', 'book.html', 'my-booking.html', 'form.html', 'groups.html', 'newhere.html'])
    ok('   ' + f + ' has no email send left in it', !sends.test(src(f)));
  ok('   rooms.html sends only the "confirmed" email itself (a signed-in member); its waiting ones are the server\'s',
    !/emailMany\([^)]*'waiting'\)/.test(src('rooms.html')) && /B\.emailMany\(these, name, 'confirmed'\) : null/.test(src('rooms.html')));
  ok('   each says the email is ON ITS WAY, not that it has gone', /A confirmation is on its way to you by email/.test(src('signup.html')) && /A copy of your request is on its way/.test(src('book.html')) &&
    /on its way to you by email\. Keep it/.test(src('form.html')) && /A copy is on its way to you by email/.test(src('groups.html')) && !/We have emailed you a (confirmation|copy)/.test(src('signup.html') + src('form.html') + src('groups.html')));
} catch (e) {
  console.log('  FAIL  the run stopped: ' + (e && e.stack || e));
  results.push(false);
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
