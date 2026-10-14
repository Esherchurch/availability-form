/* Phone notifications, the sending side: does the right person get one,
 * on the right channel, once - and does nobody else?
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec ^
 *     --config firebase.spare.json --only firestore,auth,functions ^
 *     --project egbc-worship-planner "node tests/check-notify-send.mjs"
 *
 * (from v2/. On the SPARE ports, so it runs while the dev emulators are up.)
 *
 * FINDINGS-notify N-4. Every message at launch, through the real functions
 * on the emulator: call a parent, the test message, the day before I
 * serve, booking news, a new maintenance job (with F-129's email), an
 * urgent notice, and checks running out.
 *
 * NOTHING LEAVES THE MACHINE. On the emulator a push is written to
 * pushOutbox and an email to emailOutbox, and neither makes a request.
 * Every invented address ends .invalid.
 *
 * WHAT MATTERS MOST, in order:
 *   - calling a parent never carries the child's name, and only a leader
 *     of that child can do it;
 *   - nobody gets a message twice when a timer or a trigger runs again;
 *   - a phone that has gone is removed, and somebody with no phone is
 *     emailed instead (except booking news, which the page emails anyway);
 *   - the copies of the events window's two shared files are still the
 *     same as the originals, so the switch a person sees is the switch the
 *     sender obeys.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5191);
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8171').split(':');
const AUTH = (process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9089').split(':');
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const REGION = 'europe-west2';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (!v && x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const http1 = (host, port, method, p, body, hdr) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = http.request({ host, port: Number(port), method, path: p,
    headers: Object.assign(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, hdr || {}) },
    (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const rest = (method, p, body) => http1(FS[0], FS[1] || 8171, method, p, body, { Authorization: 'Bearer owner' });

const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => rest('PATCH', DOCS + '/' + p, { fields: fields(o) });
const value = (v) => v.stringValue !== undefined ? v.stringValue
  : v.booleanValue !== undefined ? v.booleanValue
  : v.integerValue !== undefined ? Number(v.integerValue)
  : v.timestampValue !== undefined ? v.timestampValue
  : v.arrayValue ? (v.arrayValue.values || []).map(value)
  : v.mapValue ? plain(v.mapValue.fields || {})
  : v.nullValue !== undefined ? null : undefined;
const plain = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, value(v)]));
const list = async (c) => {
  const r = await rest('GET', DOCS + '/' + c + '?pageSize=500');
  return (JSON.parse(r.body || '{}').documents || []).map((d) => ({ id: d.name.split('/').pop(), ...plain(d.fields || {}) }));
};
const exists = async (p) => (await rest('GET', DOCS + '/' + p)).status === 200;

/* list() comes back in id order, not the order written, so "new since"
   is decided by the `at` stamp instead of by position. */
let since = '';
const newSince = async () => {
  const p = (await list('pushOutbox')).filter((x) => x.at > since);
  const m = (await list('emailOutbox')).filter((x) => x.at > since);
  return { push: p, mail: m };
};
const mark = () => { since = new Date().toISOString(); };
const settle = async (want, tries = 30) => {
  let got;
  for (let i = 0; i < tries; i++) { got = await newSince(); if (want(got)) return got; await sleep(500); }
  return got;
};

/* A person: an auth account (verified or not), a users record and an
   address book record, with any phones. */
const account = async (email, verified = true) => {
  let up = JSON.parse((await http1(AUTH[0], AUTH[1], 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email, password: 'test-only-password', returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await http1(AUTH[0], AUTH[1], 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email, password: 'test-only-password', returnSecureToken: true })).body || '{}');
  if (verified) {
    await http1(AUTH[0], AUTH[1], 'POST', `/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
      { localId: up.localId, emailVerified: true }, { Authorization: 'Bearer owner' });
  }
  return { uid: up.localId, idToken: up.idToken };
};
const P = {};
const person = async (key, o) => {
  const email = key + '@example.invalid';
  const p = { key, email, member: o.member === false ? '' : 'ab_ns_' + key, ...o };
  if (p.account !== false) Object.assign(p, await account(email, p.verified !== false));
  if (p.member) await put('addressBook/' + p.member, { name: o.name || key + ' Synthetic', email,
    markers: o.teams || [], adminFor: o.adminFor || [], archived: false, isMinor: false });
  if (p.uid && p.member) await put('users/' + p.uid, { uid: p.uid, email, name: o.name || key + ' Synthetic',
    memberId: p.member, status: 'active', teams: o.teams || [], adminFor: o.adminFor || [], masterAdmin: false });
  for (const [i, t] of (o.tokens || []).entries()) {
    await put('pushTokens/' + p.uid + '_phone' + i + 'aaaaaaaa', { uid: p.uid, token: t, platform: 'android',
      createdAt: new Date(), lastSeen: new Date() });
  }
  if (o.prefs) await put('notifyPrefs/' + p.uid, o.prefs);
  P[key] = p;
  return p;
};

const call = async (name, who, data) => {
  const r = await http1('localhost', FN_PORT, 'POST', `/${PROJECT}/${REGION}/${name}`, { data: data || {} },
    who ? { Authorization: 'Bearer ' + who.idToken } : {});
  try { const j = JSON.parse(r.body || '{}'); return j.result !== undefined ? j.result : { error: (j.error || {}).status || 'HTTP ' + r.status }; }
  catch { return { error: 'HTTP ' + r.status + ' ' + r.body.slice(0, 120) }; }
};
const runSchedule = async (name) => {
  const base = `/${PROJECT}/${REGION}/${name}`;
  const a = await http1('localhost', FN_PORT, 'POST', base + '-0', {});
  if (a.status !== 404) return a;
  return http1('localhost', FN_PORT, 'POST', base, {});
};
const londonDate = (n) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
};

(async () => {
  /* ---- 0. the two copies ------------------------------------------ */
  console.log('\nthe copies of the events window\'s files are still the originals');
  const same = (a, b) => fs.readFileSync(a, 'utf8').replace(/\r\n/g, '\n') === fs.readFileSync(b, 'utf8').replace(/\r\n/g, '\n');
  ok('  functions/notify-core.cjs is egbc-notify-core.js', same('functions/notify-core.cjs', 'egbc-notify-core.js'),
    'copy egbc-notify-core.js over functions/notify-core.cjs');
  ok('  functions/safeguarding-core.cjs is egbc-events-safeguarding.js',
    same('functions/safeguarding-core.cjs', 'egbc-events-safeguarding.js'),
    'copy egbc-events-safeguarding.js over functions/safeguarding-core.cjs');

  /* ---- the Google identity token for sendEmail --------------------- */
  console.log('\nthe hub\'s emails carry the server\'s Google identity (§26 item 4b)');
  const { emailAuthHeader } = await import('../functions/id-token.js');
  const goodClient = async () => ({ getRequestHeaders: async () => new Map([['authorization', 'Bearer synthetic-id-token']]) });
  const oldClient = async () => ({ getRequestHeaders: async () => ({ Authorization: 'Bearer synthetic-old-shape' }) });
  const badClient = async () => { throw new Error('no metadata server'); };
  const h1 = await emailAuthHeader(goodClient), h2 = await emailAuthHeader(oldClient), h3 = await emailAuthHeader(badClient);
  ok('  a token is attached as Authorization', h1.Authorization === 'Bearer synthetic-id-token', JSON.stringify(h1));
  ok('  whichever shape the library hands back', h2.Authorization === 'Bearer synthetic-old-shape', JSON.stringify(h2));
  ok('  and a failure to get one sends without, rather than not at all', JSON.stringify(h3) === '{}', JSON.stringify(h3));

  /* ---- the master switch's default (A-081) ---------------------------
     With nothing set, the answer must be OFF. Asked of liveState() itself,
     with a pretend database, because the sections below always set it. */
  console.log('\nthe master switch, with nothing set');
  const { liveState } = await import('../functions/notify.js');
  const fakeDb = (docs) => ({ collection: () => ({ doc: (id) => ({ get: async () => (docs[id]
    ? { exists: true, data: () => docs[id] } : { exists: false, data: () => ({}) }) }) }) });
  const st0 = await liveState(fakeDb({}));
  ok('  no setting at all: OFF', st0.sending === false && st0.live === false, JSON.stringify(st0));
  const st1 = await liveState(fakeDb({ notifications: { live: 'true' } }));
  ok('  anything but exactly true: OFF', st1.sending === false, JSON.stringify(st1));
  const st2 = await liveState(fakeDb({ notifications: { live: true } }));
  ok('  exactly true: ON', st2.sending === true, JSON.stringify(st2));
  const st3 = await liveState(fakeDb({ notifications: { live: true }, features: { notifications: false } }));
  ok('  but a church that does not use notifications: OFF whatever the switch says', st3.sending === false, JSON.stringify(st3));

  /* ---- seed ---------------------------------------------------------- */
  const SITE = 'site_ns';
  /* SWITCHED ON for everything down to section 8, which switches it off.
     Off is the default (A-081), so these would otherwise all be dry runs. */
  await put('churchSettings/notifications', { live: true });
  await put('churchSettings/details', { name: 'Synthetic Church', enquiryEmail: 'office@example.invalid' });
  await person('mum', { tokens: ['tok-mum-phone-aaaaaaaaaaaaaaaaaaaaaaaa', 'dead-mum-old-phone-aaaaaaaaaaaaaaaa'], member: false });
  await person('dad', { member: false });
  await person('stranger', { verified: false, member: false, tokens: ['tok-stranger-aaaaaaaaaaaaaaaaaaaaaa'] });
  await person('leader', { teams: ['Kids Church'], tokens: ['tok-leader-aaaaaaaaaaaaaaaaaaaaaaaaa'] });
  await person('session', { teams: ['Worship Team'] });
  await person('lateSession', { teams: ['Worship Team'] });
  await person('nobody', { teams: ['Worship Team'] });

  await put('kidsSettings/' + SITE, { teams: ['Kids Church'] });
  await put('kidsGroups/g_ns', { name: 'Little Ones', siteId: SITE, leaderIds: [P.leader.member], ratio: 5 });
  await put('kidsFamilies/fam_a', { email: P.mum.email, email2: P.dad.email, siteId: SITE });
  await put('kidsFamilies/fam_b', { email: P.stranger.email, siteId: SITE });
  const CHILD = 'Ada Zebedee Synthetic';
  await put('checkins/ck_a', { kind: 'child', state: 'in', name: CHILD, siteId: SITE, groupId: 'g_ns', familyId: 'fam_a', pickupCode: 'K7P2' });
  await put('checkins/ck_b', { kind: 'child', state: 'in', name: 'Ben Synthetic', siteId: SITE, groupId: 'g_ns', familyId: 'fam_b', pickupCode: 'Q9W3' });
  await put('checkins/ck_out', { kind: 'child', state: 'out', name: 'Cy Synthetic', siteId: SITE, groupId: 'g_ns', familyId: 'fam_a', pickupCode: 'Z1Z1' });
  await put('checkins/ck_c', { kind: 'child', state: 'in', name: 'Di Synthetic', siteId: SITE, groupId: 'g_other', familyId: 'fam_a', pickupCode: 'M4M4' });
  const utc = new Date().toISOString().slice(0, 10);
  await put('kidsMornings/' + SITE + '_' + utc, { siteId: SITE, day: utc, leaderIds: [], sessionLeaderIds: [P.session.member],
    expiresAt: new Date(Date.now() + 3600e3) });

  /* ---- 1. call a parent ---------------------------------------------- */
  console.log('\ncalling a parent');
  mark();
  const c1 = await call('callParent', P.leader, { checkinId: 'ck_a' });
  ok('  the group\'s leader calls: one phone, and the parent with no phone is emailed',
    c1.phones === 1 && c1.emailed === 1, JSON.stringify(c1));
  const o1 = await settle((g) => g.push.length >= 1 && g.mail.length >= 1);
  const pushed = JSON.stringify(o1.push);
  ok('  it says the group and the code', /Please come to Little Ones/.test(pushed) && /Collection code K7P2/.test(pushed), pushed);
  ok('  and NEVER THE CHILD\'S NAME, on the phone or in the email',
    !/Ada|Zebedee/.test(pushed) && !/Ada|Zebedee/.test(JSON.stringify(o1.mail)), pushed + JSON.stringify(o1.mail));
  ok('  it goes as urgent', o1.push.every((x) => x.urgency === 'high'), pushed);
  ok('  only to the family: not the unverified stranger\'s phone', !/tok-stranger/.test(pushed), pushed);
  ok('  the email went to the second parent', o1.mail.length === 1 && o1.mail[0].to[0] === P.dad.email, JSON.stringify(o1.mail));
  ok('  the phone that has gone is removed', !(await exists('pushTokens/' + P.mum.uid + '_phone1aaaaaaaa')));
  ok('  and the working one is kept', await exists('pushTokens/' + P.mum.uid + '_phone0aaaaaaaa'));
  const logs = await list('notifyLog');
  const log = logs.find((l) => l.type === 'callParent');
  ok('  the log says how far it got, and holds no token or address',
    log && log.phones === 1 && log.emailed === 1 && !/tok-|@/.test(JSON.stringify(log)), JSON.stringify(log));

  const c2 = await call('callParent', P.leader, { checkinId: 'ck_a' });
  ok('  pressed again within two minutes: not sent again', c2.reason === 'too-soon', JSON.stringify(c2));
  const c3 = await call('callParent', P.leader, { checkinId: 'ck_out' });
  ok('  a child who has gone home: not sent', c3.reason === 'not-in', JSON.stringify(c3));
  const c4 = await call('callParent', P.nobody, { checkinId: 'ck_b' });
  ok('  somebody who leads nothing that morning is refused', /PERMISSION_DENIED/.test(c4.error || ''), JSON.stringify(c4));
  const c5 = await call('callParent', P.leader, { checkinId: 'ck_c' });
  ok('  nor can a leader page a child in ANOTHER group', /PERMISSION_DENIED/.test(c5.error || ''), JSON.stringify(c5));
  const c6 = await call('callParent', P.session, { checkinId: 'ck_c' });
  ok('  but that morning\'s Session Leader can, for any group', !c6.error && !c6.reason, JSON.stringify(c6));
  const c7 = await call('callParent', P.leader, { checkinId: 'ck_b' });
  ok('  a family whose only address is unverified reaches nobody, and says so',
    c7.phones === 0 && c7.emailed === 0, JSON.stringify(c7));
  const c8 = await call('callParent', null, { checkinId: 'ck_b' });
  ok('  and nobody signed in is refused', /UNAUTHENTICATED/.test(c8.error || ''), JSON.stringify(c8));
  const after1 = await settle(() => false, 4);
  ok('  the refused and too-soon calls sent nothing',
    after1.push.length === 1 + 1 && after1.mail.length === 1 + 1, JSON.stringify(after1.push.map((x) => x.data.title)));

  /* ---- 2. the test message ------------------------------------------ */
  console.log('\n"send me a test"');
  mark();
  const t1 = await call('notifyTest', P.leader, {});
  ok('  it reaches the person who asked', t1.phones === 1, JSON.stringify(t1));
  const ot = await settle((g) => g.push.length >= 1);
  ok('  and nobody else', ot.push.length === 1 && ot.push[0].tokens.join() === 'tok-leader-aaaaaaaaaaaaaaaaaaaaaaaaa', JSON.stringify(ot.push));

  /* ---- 3. the day before I serve ------------------------------------ */
  console.log('\nthe day before I serve');
  const TOM = londonDate(1);
  await person('guitar', { teams: ['Worship Team'], tokens: ['tok-guitar-aaaaaaaaaaaaaaaaaaaaaaaaa'] });
  await person('drums', { teams: ['Worship Team'] });
  await person('quiet', { teams: ['Worship Team'], tokens: ['tok-quiet-aaaaaaaaaaaaaaaaaaaaaaaaaa'],
    prefs: { types: { rota: false }, quietFrom: '21:30', quietTo: '07:30' } });
  await person('drafted', { teams: ['Worship Team'], tokens: ['tok-drafted-aaaaaaaaaaaaaaaaaaaaaaaa'] });
  const by = (k) => ({ id: P[k].member, name: P[k].key });
  await put('events/ev_ns_am', { date: TOM, type: 'Sunday Morning Worship', startTime: '10:30', archived: false, draft: false,
    assignments: { 'Guitar': by('guitar'), 'Drums': by('drums'), 'Keyboard': by('quiet') } });
  await put('events/ev_ns_pm', { date: TOM, type: 'Sunday Evening Worship', startTime: '18:30', archived: false, draft: false,
    assignments: { 'Vocals': by('guitar') } });
  await put('events/ev_ns_draft', { date: TOM, type: 'Prayer', startTime: '08:00', archived: false, draft: true,
    assignments: { 'Leader': by('drafted') } });
  mark();
  await runSchedule('rotaReminders');
  const or1 = await settle((g) => g.push.length >= 1 && g.mail.length >= 1);
  const gp = or1.push.filter((x) => x.tokens.includes('tok-guitar-aaaaaaaaaaaaaaaaaaaaaaaaa'));
  ok('  somebody on twice that day gets ONE message with both roles',
    gp.length === 1 && /Guitar/.test(gp[0].data.body) && /Vocals/.test(gp[0].data.body), JSON.stringify(gp));
  ok('  somebody with no phone is emailed instead', or1.mail.some((m) => m.to[0] === P.drums.email), JSON.stringify(or1.mail.map((m) => m.to)));
  ok('  somebody who turned it off gets nothing',
    !or1.push.some((x) => x.tokens.includes('tok-quiet-aaaaaaaaaaaaaaaaaaaaaaaaaa')) && !or1.mail.some((m) => m.to[0] === P.quiet.email));
  ok('  a draft rota is not the rota', !or1.push.some((x) => x.tokens.includes('tok-drafted-aaaaaaaaaaaaaaaaaaaaaaaa')));
  mark();
  await runSchedule('rotaReminders');
  const or2 = await settle(() => false, 6);
  ok('  RUN AGAIN, IT SENDS NOTHING', or2.push.length === 0 && or2.mail.length === 0, JSON.stringify(or2));

  /* ---- 4. booking news ---------------------------------------------- */
  console.log('\nroom bookings');
  await put('rooms/room_ns', { name: 'Synthetic Hall', siteId: SITE });
  await person('booker', { tokens: ['tok-booker-aaaaaaaaaaaaaaaaaaaaaaaaa'] });
  await person('booker2', {});
  await put('bookings/bk_a', { status: 'requested', memberUid: P.booker.uid, roomId: 'room_ns', siteId: SITE,
    day: TOM, startLocal: TOM + 'T19:00', kind: 'member' });
  await put('bookings/bk_b', { status: 'requested', memberUid: P.booker2.uid, roomId: 'room_ns', siteId: SITE,
    day: TOM, startLocal: TOM + 'T19:00', kind: 'member' });
  await sleep(1500);
  mark();
  await rest('PATCH', DOCS + '/bookings/bk_a?updateMask.fieldPaths=status', { fields: fields({ status: 'confirmed' }) });
  await rest('PATCH', DOCS + '/bookings/bk_b?updateMask.fieldPaths=status', { fields: fields({ status: 'declined' }) });
  const ob = await settle((g) => g.push.length >= 1, 30);
  ok('  requested to confirmed: "Your booking is confirmed", on their phone',
    ob.push.length === 1 && ob.push[0].data.title === 'Your booking is confirmed' && /Synthetic Hall/.test(ob.push[0].data.body),
    JSON.stringify(ob.push));
  await sleep(2000);
  const ob2 = await newSince();
  ok('  no phone: NOT emailed, because the page emails booking news already', ob2.mail.length === 0, JSON.stringify(ob2.mail));
  mark();
  await rest('PATCH', DOCS + '/bookings/bk_a?updateMask.fieldPaths=note', { fields: fields({ note: 'synthetic' }) });
  const ob3 = await settle(() => false, 6);
  ok('  a change that is not the status sends nothing', ob3.push.length === 0, JSON.stringify(ob3.push));

  /* ---- 5. a new maintenance job ------------------------------------- */
  console.log('\na new maintenance job (and F-129\'s email)');
  await person('fixer', { teams: ['Maintenance'], tokens: ['tok-fixer-aaaaaaaaaaaaaaaaaaaaaaaaaa'] });
  await person('fixer2', { teams: ['Maintenance'] });
  await person('fixer3', { teams: ['Maintenance'], account: false });
  mark();
  await put('maintJobs/job_ns_1', { siteId: SITE, roomId: 'room_ns', where: 'Synthetic Hall', what: 'Two lights out',
    details: 'Over the stage', photoPath: 'maintJobs/job_ns_1/photo', status: 'todo',
    reportedBy: P.leader.uid, reportedByName: 'Leader Synthetic', reportedAt: new Date() });
  const om = await settle((g) => g.push.length >= 1 && g.mail.length >= 2, 30);
  ok('  the team member with a phone is told on it, with a link to the job',
    om.push.length === 1 && om.push[0].tokens.join() === 'tok-fixer-aaaaaaaaaaaaaaaaaaaaaaaaaa'
      && om.push[0].data.url === 'maintenance.html#job_ns_1', JSON.stringify(om.push));
  ok('  the two without one get F-129\'s email, one each',
    om.mail.length === 2 && om.mail.every((m) => m.to.length === 1 && m.subject === 'Maintenance: Two lights out')
      && om.mail.some((m) => m.to[0] === P.fixer2.email) && om.mail.some((m) => m.to[0] === P.fixer3.email),
    JSON.stringify(om.mail.map((m) => [m.to, m.subject])));
  ok('  the email says what, where, who, and links to the job - and has NO PHOTO',
    om.mail.every((m) => /Two lights out/.test(m.html) && /Synthetic Hall/.test(m.html) && /Leader Synthetic/.test(m.html)
      && /maintenance\.html#job_ns_1/.test(m.html) && !/photo|firebasestorage|googleapis/i.test(m.html)),
    om.mail[0] && om.mail[0].html);
  mark();
  await rest('PATCH', DOCS + '/maintJobs/job_ns_1?updateMask.fieldPaths=status', { fields: fields({ status: 'done' }) });
  const om2 = await settle(() => false, 6);
  ok('  marking it done sends nothing', om2.push.length === 0 && om2.mail.length === 0, JSON.stringify(om2));
  for (const k of ['fixer', 'fixer2', 'fixer3']) {
    await rest('PATCH', DOCS + '/addressBook/' + P[k].member + '?updateMask.fieldPaths=archived', { fields: fields({ archived: true }) });
  }
  mark();
  await put('maintJobs/job_ns_2', { siteId: SITE, roomId: 'room_ns', where: 'Kitchen', what: 'Tap drips',
    details: '', photoPath: '', status: 'todo', reportedBy: P.leader.uid, reportedByName: 'Leader Synthetic', reportedAt: new Date() });
  const om3 = await settle((g) => g.mail.length >= 1, 30);
  ok('  with nobody on the team, the office is emailed, so a job is never lost',
    om3.mail.length === 1 && om3.mail[0].to[0] === 'office@example.invalid', JSON.stringify(om3.mail.map((m) => m.to)));

  /* ---- 6. an urgent notice ------------------------------------------- */
  console.log('\nan urgent notice');
  await person('kidsHelper', { teams: ['Kids Church'], tokens: ['tok-kidshelper-aaaaaaaaaaaaaaaaaaaa'] });
  mark();
  await put('news/n_ns_plain', { title: 'Synthetic ordinary', body: '<p>Nothing urgent</p>', teams: ['Kids Church'], urgent: false });
  await put('news/n_ns_urgent', { title: 'Kids Church moved', body: '<p>To the <b>hall</b> this week</p>', teams: ['Kids Church'], urgent: true });
  const on1 = await settle((g) => g.push.length >= 2, 30);
  const toks = on1.push.flatMap((x) => x.tokens);
  ok('  everyone on the team it is for is told', toks.includes('tok-kidshelper-aaaaaaaaaaaaaaaaaaaa') && toks.includes('tok-leader-aaaaaaaaaaaaaaaaaaaaaaaaa'), JSON.stringify(toks));
  ok('  and nobody on another team', !toks.includes('tok-guitar-aaaaaaaaaaaaaaaaaaaaaaaaa'), JSON.stringify(toks));
  ok('  it reads as urgent, in plain words with no HTML',
    on1.push.every((x) => x.data.title === 'Urgent: Kids Church moved' && x.data.body === 'To the hall this week' && x.urgency === 'high'),
    JSON.stringify(on1.push.map((x) => x.data)));
  ok('  a notice that is not urgent sends nothing', on1.push.length === 2, JSON.stringify(on1.push.map((x) => x.data.title)));
  mark();
  await rest('PATCH', DOCS + '/news/n_ns_urgent?updateMask.fieldPaths=title', { fields: fields({ title: 'Kids Church moved (edited)' }) });
  const on2 = await settle(() => false, 6);
  ok('  editing it afterwards does not send it again', on2.push.length === 0, JSON.stringify(on2.push));

  /* ---- 7. checks running out ----------------------------------------- */
  console.log('\nDBS checks and training running out');
  await person('helper', { teams: ['Kids Church'], tokens: ['tok-helper-aaaaaaaaaaaaaaaaaaaaaaaaa'], name: 'Helper Synthetic' });
  await person('sglead', { name: 'Lead Synthetic' });
  await put('bookingSettings/' + SITE, { safeguardingLead: P.sglead.member });
  await put('safeguardingSettings/defaults', { dbsYears: 3, trainingYears: 3 });
  const ago = new Date(); ago.setUTCFullYear(ago.getUTCFullYear() - 3); ago.setUTCDate(ago.getUTCDate() + 20);
  await put('leaderChecks/' + P.helper.member, { name: 'Helper Synthetic', dbsStatus: 'current',
    dbsSeen: new Date().toISOString().slice(0, 10), trainingDate: ago.toISOString().slice(0, 10), siteId: SITE });
  mark();
  await runSchedule('checksReminders');
  const oc = await settle((g) => g.push.length >= 1 && g.mail.length >= 1, 30);
  ok('  the person is told on their phone', oc.push.length === 1 && /training runs out soon/.test(oc.push[0].data.title), JSON.stringify(oc.push));
  ok('  and the site\'s safeguarding lead gets one email listing them',
    oc.mail.length === 1 && oc.mail[0].to[0] === P.sglead.email && /Helper Synthetic/.test(oc.mail[0].html), JSON.stringify(oc.mail));
  mark();
  await runSchedule('checksReminders');
  const oc2 = await settle(() => false, 6);
  ok('  run again the same fortnight: nothing', oc2.push.length === 0 && oc2.mail.length === 0, JSON.stringify(oc2));

  /* ---- 7b. WHO GETS TOLD (Martin, 14 Oct 2026) -----------------------
     The people the church names are told WHICH KIND has come in, and
     nothing else. Never the church office for a request for care, a
     concern or a prayer request. Never the person who raised it or the
     person it is about. Nobody named -> the safeguarding lead and deputy. */
  console.log('\nwho gets told: named people only, never the office, no details');
  await person('carer', { tokens: ['tok-carer-aaaaaaaaaaaaaaaaaaaaaaaaaa'], name: 'Carer Synthetic' });
  await person('carerAsks', { tokens: ['tok-carerasks-aaaaaaaaaaaaaaaaaaaaa'], name: 'Asking Carer Synthetic' });
  await person('carerAbout', { tokens: ['tok-carerabout-aaaaaaaaaaaaaaaaaaaa'], name: 'Named Carer Synthetic' });
  await person('carerNoPhone', { name: 'Emailed Carer Synthetic' });
  await person('teamOnly', { teams: ['Pastoral'], tokens: ['tok-teamonly-aaaaaaaaaaaaaaaaaaaaaa'], name: 'Team Only Synthetic' });
  await person('intercessor', { teams: ['Prayer Team'], tokens: ['tok-intercessor-aaaaaaaaaaaaaaaaaa'], name: 'Intercessor Synthetic' });
  await person('welcomer', { tokens: ['tok-welcomer-aaaaaaaaaaaaaaaaaaaaaa'], name: 'Welcomer Synthetic' });
  await put('pushTokens/' + P.sglead.uid + '_phone0aaaaaaaa', { uid: P.sglead.uid, token: 'tok-sglead-aaaaaaaaaaaaaaaaaaaaaaaaa',
    platform: 'android', createdAt: new Date(), lastSeen: new Date() });
  await put('safeguardingSettings/defaults', { dbsYears: 3, trainingYears: 3, leadSiteId: SITE });
  await put('prayerSettings/main', { prayerTeam: 'Prayer Team' });
  await put('welcomeSettings/main', { memberIds: [P.welcomer.member] });
  await put('churchSettings/details', { name: 'Synthetic Church', enquiryEmail: 'office@example.invalid' });
  const OFFICE = 'office@example.invalid', PASTORAL_ADDRESS = 'pastoral@example.invalid';
  const ROUTING = { care: { memberIds: [P.carer.member, P.carerAsks.member, P.carerNoPhone.member], email: PASTORAL_ADDRESS },
    pastoral: { memberIds: [P.carer.member, P.carerAbout.member], email: '' },
    prayer: { memberIds: [P.carer.member], email: '' } };
  await put('careRouting/main', ROUTING);
  const SECRET = 'Synthetic secret words that must never travel';
  const worry = (id, o) => put('worries/' + id, Object.assign({ aboutMemberId: '', aboutName: 'Subject Synthetic', noticed: SECRET,
    happyToBeContacted: true, by: P.leader.uid, byName: 'Leader Synthetic', at: new Date(), dealtWith: false }, o));
  const prayer = (id, o) => put('prayers/' + id, Object.assign({ by: P.leader.uid, byName: 'Leader Synthetic', text: SECRET,
    share: 'pastoral', at: new Date(), answered: false, answer: '' }, o));
  const tokensOf = (g) => g.push.flatMap((x) => x.tokens).sort();
  const mailTo = (g) => g.mail.map((m) => m.to[0]).sort();
  const quiet = (g) => !JSON.stringify(g).includes(SECRET) && !/Subject Synthetic|Leader Synthetic|Asking Carer|Named Carer/.test(JSON.stringify(g));
  const settled = async (want) => { await settle(want, 30); await sleep(2500); return newSince(); };

  mark();
  await worry('w_ns_care', { kind: 'care', aboutMemberId: P.carerAsks.member, aboutName: 'Asking Carer Synthetic', by: P.carerAsks.uid });
  const g1 = await settled((g) => g.push.length >= 1 && g.mail.length >= 2);
  ok('  "I\'d like some pastoral care": the people named for it - not the person who asked',
    tokensOf(g1).join() === 'tok-carer-aaaaaaaaaaaaaaaaaaaaaaaaaa', JSON.stringify(tokensOf(g1)));
  ok('  NOT the Pastoral team as such, who were not named for it', !tokensOf(g1).includes('tok-teamonly-aaaaaaaaaaaaaaaaaaaaaa'));
  ok('  the named person with no phone is emailed, and so is the dedicated address',
    mailTo(g1).join() === [P.carerNoPhone.email, PASTORAL_ADDRESS].sort().join(), JSON.stringify(mailTo(g1)));
  ok('  NEVER THE CHURCH OFFICE', !mailTo(g1).includes(OFFICE));
  ok('  "A new request for pastoral care has been raised", and a link - and no details anywhere',
    g1.push.every((x) => x.data.title === 'A new request for pastoral care has been raised' && x.data.body === 'Open it to read it.'
      && x.data.url === 'care-inbox.html') && g1.mail.every((m) => m.subject === 'A new request for pastoral care has been raised') && quiet(g1),
    JSON.stringify(g1).slice(0, 500));

  mark();
  await worry('w_ns_pastoral', { kind: 'pastoral', aboutMemberId: P.carerAbout.member, aboutName: 'Named Carer Synthetic' });
  const g2 = await settled((g) => g.push.length >= 1);
  ok('  a pastoral concern: the people named for it - NOT the person it is about, though named',
    tokensOf(g2).join() === 'tok-carer-aaaaaaaaaaaaaaaaaaaaaaaaaa', JSON.stringify(tokensOf(g2)));
  ok('  "A new concern has been raised"; never the office; no details',
    g2.push.every((x) => x.data.title === 'A new concern has been raised') && !mailTo(g2).includes(OFFICE) && quiet(g2), JSON.stringify(g2).slice(0, 300));

  mark();
  await worry('w_ns_sg', { kind: 'safeguarding' });
  const g3 = await settled((g) => g.push.length >= 1);
  ok('  a SAFEGUARDING concern: the safeguarding lead ONLY - not the people named for pastoral care',
    tokensOf(g3).join() === 'tok-sglead-aaaaaaaaaaaaaaaaaaaaaaaaa', JSON.stringify(tokensOf(g3)));
  ok('  and no address at all: not the pastoral address, not the office', g3.mail.length === 0, JSON.stringify(mailTo(g3)));

  mark();
  await prayer('p_ns_pastoral', { share: 'pastoral' });
  const g4 = await settled((g) => g.push.length >= 1);
  ok('  a prayer request: the people named for prayer, and not the prayer team when not chosen',
    tokensOf(g4).join() === 'tok-carer-aaaaaaaaaaaaaaaaaaaaaaaaaa', JSON.stringify(tokensOf(g4)));
  ok('  "A new prayer request has been raised", linking to prayer.html, no details',
    g4.push.every((x) => x.data.title === 'A new prayer request has been raised' && x.data.url === 'prayer.html') && quiet(g4) && !mailTo(g4).includes(OFFICE));
  mark();
  await prayer('p_ns_team', { share: 'prayerTeam', by: P.carer.uid, byName: 'Carer Synthetic' });
  const g5 = await settled((g) => g.push.length >= 1);
  ok('  shared with the prayer team: the prayer team too - and not the person who asked',
    tokensOf(g5).join() === 'tok-intercessor-aaaaaaaaaaaaaaaaaa', JSON.stringify(tokensOf(g5)));

  /* NOBODY NAMED: the safeguarding lead and deputy. Never the office. */
  await put('careRouting/main', { care: { memberIds: [], email: '' }, pastoral: { memberIds: [], email: '' }, prayer: { memberIds: [], email: '' } });
  mark();
  await worry('w_ns_care2', { kind: 'care', by: P.leader.uid });
  await prayer('p_ns_none', {});
  const g6 = await settled((g) => g.push.length >= 2);
  ok('  with nobody named, a request for care and a prayer request go to the safeguarding lead',
    tokensOf(g6).join() === 'tok-sglead-aaaaaaaaaaaaaaaaaaaaaaaaa,tok-sglead-aaaaaaaaaaaaaaaaaaaaaaaaa', JSON.stringify(tokensOf(g6)));
  ok('  AND STILL NEVER THE CHURCH OFFICE', !mailTo(g6).includes(OFFICE), JSON.stringify(mailTo(g6)));
  await put('careRouting/main', ROUTING);

  const clog = (await list('notifyLog')).filter((l) => l.type === 'care');
  ok('  the log holds counts only: no sender, no words', clog.length >= 6 && clog.every((l) => !l.by) && !JSON.stringify(clog).includes(SECRET),
    JSON.stringify(clog).slice(0, 300));

  /* A VISITOR'S HELLO: the welcomers are told; the copy, with the details,
     goes to the church's chosen address - or the office's, the one kind
     that may. */
  mark();
  await put('welcomeSettings/public', { notifyEmail: 'welcome@example.invalid' });
  await put('welcomes/h_ns_1', { name: 'Visitor Synthetic', email: 'visitor@example.invalid', phone: '', message: 'Hello from a synthetic visitor',
    contactMe: true, uid: '', at: new Date(), status: 'new' });
  const g7 = await settled((g) => g.push.length >= 1 && g.mail.length >= 1);
  ok('  a hello: the welcomers are told "A visitor has said hello", and nothing more',
    tokensOf(g7).join() === 'tok-welcomer-aaaaaaaaaaaaaaaaaaaaaa' && g7.push.every((x) => x.data.title === 'A visitor has said hello'
      && !/Visitor Synthetic|synthetic visitor/.test(JSON.stringify(x.data))), JSON.stringify(g7.push.map((x) => x.data)));
  ok('  and the church\'s copy, with the details, goes to its chosen address - from the server',
    g7.mail.length === 1 && g7.mail[0].to[0] === 'welcome@example.invalid' && /Visitor Synthetic/.test(g7.mail[0].html)
      && /Hello from a synthetic visitor/.test(g7.mail[0].html), JSON.stringify(g7.mail.map((m) => [m.to, m.subject])));
  await rest('DELETE', DOCS + '/welcomeSettings/public');
  mark();
  await put('welcomes/h_ns_2', { name: 'Second Visitor Synthetic', email: '', phone: '07000 000009', message: '',
    contactMe: true, uid: '', at: new Date(), status: 'new' });
  const g8 = await settled((g) => g.mail.length >= 1);
  ok('  with no address chosen, the copy falls back to the office - a hello is the one kind that may',
    mailTo(g8).join() === OFFICE, JSON.stringify(mailTo(g8)));

  /* IS A LEAD SET? careRouting/status, for the forms. */
  const status = async () => { const r = await rest('GET', DOCS + '/careRouting/status'); const f = (JSON.parse(r.body || '{}').fields || {}).leadSet; return f ? f.booleanValue : undefined; };
  const waitStatus = async (want) => { let v; for (let i = 0; i < 30; i++) { v = await status(); if (v === want) return v; await sleep(500); } return v; };
  await rest('PATCH', DOCS + '/safeguardingSettings/defaults?updateMask.fieldPaths=leadSiteId', { fields: fields({ leadSiteId: '' }) });
  ok('  with no safeguarding lead set, careRouting/status says so', (await waitStatus(false)) === false);
  await rest('PATCH', DOCS + '/safeguardingSettings/defaults?updateMask.fieldPaths=leadSiteId', { fields: fields({ leadSiteId: SITE }) });
  ok('  and changes back when one is', (await waitStatus(true)) === true);

  /* A part the church does not use sends nothing. */
  await put('churchSettings/features', { prayer: false });
  mark();
  await prayer('p_ns_off', {});
  await sleep(6000);
  const g9 = await newSince();
  ok('  with prayer switched off for the church, a prayer request alerts nobody', g9.push.length === 0 && g9.mail.length === 0, JSON.stringify(g9.push));
  await rest('DELETE', DOCS + '/churchSettings/features');

  /* ---- 8. THE MASTER SWITCH OFF (A-081) -------------------------------
     The default. Every timer and trigger works out what it WOULD send,
     logs the counts, and sends nothing - no push, no email of any kind.
     Only "Send me a test" goes, to the person who pressed it. Then the
     switch goes on and the same things DO send: the dry run used nothing
     up. Fresh fixtures for each, so nothing earlier can explain a quiet. */
  console.log('\nTHE MASTER SWITCH OFF: nothing goes out');
  await put('churchSettings/notifications', { live: false });
  const DAY2 = londonDate(1);
  await person('offRota', { teams: ['Worship Team'], tokens: ['tok-offrota-aaaaaaaaaaaaaaaaaaaaaaaa'] });
  await person('offRota2', { teams: ['Worship Team'] });
  await put('events/ev_ns_off', { date: DAY2, type: 'Evening Prayer', startTime: '19:30', archived: false, draft: false,
    assignments: { 'Leader': { id: P.offRota.member, name: 'x' }, 'Reader': { id: P.offRota2.member, name: 'y' } } });
  await put('addressBook/' + P.fixer.member, { name: 'fixer Synthetic', email: P.fixer.email, markers: ['Maintenance'], archived: false, adminFor: [], isMinor: false });
  await put('addressBook/' + P.fixer2.member, { name: 'fixer2 Synthetic', email: P.fixer2.email, markers: ['Maintenance'], archived: false, adminFor: [], isMinor: false });
  await person('offHelper', { teams: ['Kids Church'], tokens: ['tok-offhelper-aaaaaaaaaaaaaaaaaaaaaa'], name: 'Off Helper Synthetic' });
  const ago2 = new Date(); ago2.setUTCFullYear(ago2.getUTCFullYear() - 3); ago2.setUTCDate(ago2.getUTCDate() + 10);
  await put('leaderChecks/' + P.offHelper.member, { name: 'Off Helper Synthetic', dbsStatus: 'current',
    dbsSeen: new Date().toISOString().slice(0, 10), trainingDate: ago2.toISOString().slice(0, 10), siteId: SITE });
  await put('checkins/ck_off', { kind: 'child', state: 'in', name: 'Off Synthetic', siteId: SITE, groupId: 'g_ns', familyId: 'fam_a', pickupCode: 'OFF1' });
  await put('bookings/bk_off', { status: 'requested', memberUid: P.booker.uid, roomId: 'room_ns', siteId: SITE, day: DAY2, startLocal: DAY2 + 'T19:00', kind: 'member' });
  await sleep(1500);
  const logsBefore = (await list('notifyLog')).length;
  mark();

  const off1 = await call('callParent', P.leader, { checkinId: 'ck_off' });
  ok('  calling a parent is refused, in words', /FAILED_PRECONDITION/.test(off1.error || ''), JSON.stringify(off1));
  await runSchedule('rotaReminders');
  await rest('PATCH', DOCS + '/bookings/bk_off?updateMask.fieldPaths=status', { fields: fields({ status: 'confirmed' }) });
  await put('maintJobs/job_ns_off', { siteId: SITE, roomId: 'room_ns', where: 'Porch', what: 'Off switch job',
    details: '', photoPath: '', status: 'todo', reportedBy: P.leader.uid, reportedByName: 'Leader Synthetic', reportedAt: new Date() });
  await put('news/n_ns_off', { title: 'Off switch urgent', body: '<p>x</p>', teams: ['Kids Church'], urgent: true });
  await put('worries/w_ns_off', { kind: 'care', aboutMemberId: '', aboutName: 'Off Synthetic', noticed: '',
    happyToBeContacted: true, by: P.leader.uid, byName: 'Leader Synthetic', at: new Date(), dealtWith: false });
  await runSchedule('checksReminders');
  await sleep(6000);
  const offOut = await newSince();
  ok('  NO PUSH from any of them', offOut.push.length === 0, JSON.stringify(offOut.push.map((x) => x.data && x.data.title)));
  ok('  and NO EMAIL - not the fallback, not F-129\'s, not the office\'s, not the safeguarding lead\'s',
    offOut.mail.length === 0, JSON.stringify(offOut.mail.map((m) => [m.to, m.subject])));
  const dry = (await list('notifyLog')).slice(0).filter((l) => l.dryRun === true);
  const kinds = [...new Set(dry.map((l) => l.type))].sort().join(',');
  ok('  each one logged what it WOULD have sent: rota, booking, maintenance job, urgent notice, checks, a request for care',
    ['booking', 'care', 'checks', 'maintJob', 'rota', 'urgent'].every((k) => kinds.split(',').includes(k)), kinds);
  ok('  as counts, never a token or an address', !/tok-|@/.test(JSON.stringify(dry)), JSON.stringify(dry).slice(0, 300));
  ok('  and the log did grow', (await list('notifyLog')).length > logsBefore);

  mark();
  const offTest = await call('notifyTest', P.leader, {});
  ok('  but "Send me a test" still reaches the person who pressed it', offTest.phones === 1, JSON.stringify(offTest));
  const ot2 = await settle((g) => g.push.length >= 1);
  ok('  and only them', ot2.push.length === 1 && ot2.push[0].tokens.join() === 'tok-leader-aaaaaaaaaaaaaaaaaaaaaaaaa', JSON.stringify(ot2.push));

  /* The church does not use notifications at all: not even the test. */
  await put('churchSettings/features', { notifications: false });
  const offFeature = await call('notifyTest', P.leader, {});
  ok('  a church that does not use notifications does not even send the test', /FAILED_PRECONDITION/.test(offFeature.error || ''), JSON.stringify(offFeature));
  await put('churchSettings/features', { notifications: true });

  /* SWITCHED ON: the same rota and checks send now - the dry run used up
     none of their once-only markers. */
  console.log('\nswitched on again: what was held back now goes');
  await put('churchSettings/notifications', { live: true });
  mark();
  await runSchedule('rotaReminders');
  await runSchedule('checksReminders');
  const onOut = await settle((g) => g.push.length >= 2 && g.mail.length >= 2, 30);
  ok('  the rota reminder goes, to the phone and by email', onOut.push.some((x) => x.tokens.includes('tok-offrota-aaaaaaaaaaaaaaaaaaaaaaaa'))
    && onOut.mail.some((m) => m.to[0] === P.offRota2.email), JSON.stringify({ p: onOut.push.map((x) => x.tokens), m: onOut.mail.map((m) => m.to) }));
  ok('  and so does the checks reminder', onOut.push.some((x) => x.tokens.includes('tok-offhelper-aaaaaaaaaaaaaaaaaaaaaa')), JSON.stringify(onOut.push.map((x) => x.tokens)));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some((v) => !v) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
