/* Functions take the church from the sign-in, never the page (multi-church
 * step 3, FINDINGS-churchhq H-5). Grows a batch at a time.
 *
 *   FUNCTIONS_EMULATOR_PORT=5191 firebase emulators:exec --config firebase.spare.json \
 *     --only firestore,auth,functions --project egbc-worship-planner "node tests/check-church-calls.mjs"
 *
 * Made-up churches mc-alpha and mc-beta, and made-up people. The same
 * member id (m_cc) is in alpha, in beta and in EGBC's top-level address
 * book, each with a different household, so an answer shows whose data it
 * came from.
 *   - Ann is in mc-alpha (claim churches: ['mc-alpha']).
 *   - Eve has no claim: EGBC, as everyone is today.
 *   - Dot is in both churches.
 * Batch 1: whoAmI, myFamily, myYouthHub. Batch 2: hubSend, compilerSend,
 * callParent, notifyTest.
 * Every callable: Ann gets alpha's answer; Ann naming beta is refused;
 * Eve gets EGBC's top-level answer, as before; Dot must say which.
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { churchIdOf, scopedDb, claimedChurches } from '../functions/church-scope.js';
import { hashCode as churchShowHash } from '../functions/churchshow.js';
import { codeHash } from '../functions/hq-codes.js';
import { personalise } from '../functions/meeting-papers.js';
/* The server's own library, from functions/, for calling personalise() as
   the e-news send does. On the emulator only (emulators:exec sets the host). */
const fnRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'egbc-worship-planner' });

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181').split(':');
const AUTH = (process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099').split(':');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (host, port, method, path, body, headers) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host, port, method, path,
    headers: Object.assign(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
  r.on('error', rej); r.end(data);
});
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' };
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
const put = (p, o) => req(FS[0], Number(FS[1]), 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
const del = (p) => req(FS[0], Number(FS[1]), 'DELETE', DOCS + '/' + p, undefined, OWNER);
const authPost = (path, body, owner) => req(AUTH[0], Number(AUTH[1]), 'POST', path, body, owner ? OWNER : {});
const PW = 'test-only-password';

async function person(email, claims) {
  let up = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  await authPost(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { localId: up.localId, emailVerified: true, customAttributes: JSON.stringify(claims || {}) }, true);
  const t = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  return { uid: up.localId, email, idToken: t.idToken };
}
/* -> { result } or { error: { status, message } } */
const call = async (p, name, data) => JSON.parse((await req('localhost', FN_PORT, 'POST', `/${PROJECT}/europe-west2/${name}`, { data: data || {} }, { Authorization: 'Bearer ' + p.idToken })).body || '{}');
const refused = (r, status) => !!(r && r.error && (!status || r.error.status === status));

/* ---- the helper itself, without the emulator --------------------- */
console.log('The helper');
const rq = (churches, data) => ({ auth: { uid: 'u', token: churches === undefined ? {} : { churches } }, data: data || {} });
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.code || e.message; } };
ok('  no claim: EGBC (null), as today', churchIdOf(rq(undefined)) === null);
ok('  one church in the claim: that church', churchIdOf(rq(['mc-alpha'])) === 'mc-alpha');
ok('  naming their own church: that church', churchIdOf(rq(['mc-alpha', 'mc-beta'], { churchId: 'mc-beta' })) === 'mc-beta');
ok('  naming a church not in the claim: refused', threw(() => churchIdOf(rq(['mc-alpha'], { churchId: 'mc-beta' }))) === 'permission-denied');
ok('  no claim and naming a church: refused (the page cannot pick one)', threw(() => churchIdOf(rq(undefined, { churchId: 'mc-alpha' }))) === 'permission-denied');
ok('  two churches, none named: refused, say which', threw(() => churchIdOf(rq(['mc-alpha', 'mc-beta']))) === 'invalid-argument');
ok('  a claim entry that is not a church id is ignored', JSON.stringify(claimedChurches({ token: { churches: ['mc-alpha', '../x', 5] } })) === '["mc-alpha"]');
const fake = { collection: (n) => ({ doc: (d) => ({ collection: (m) => ({ path: n + '/' + d + '/' + m }) }) }), doc: (p) => ({ path: p }) };
const sd = scopedDb(fake, 'mc-alpha');
ok('  a church\'s collection is under churches/{id}', sd.collection('news').path === 'churches/mc-alpha/news');
ok('  and so is a document path', sd.doc('users/u1').path === 'churches/mc-alpha/users/u1');
ok('  EGBC\'s is the database itself', scopedDb(fake, null) === fake);
ok('  a collection group (every church) is refused', !!threw(() => sd.collectionGroup('news')));

/* ---- the seed ----------------------------------------------------- */
const A = 'mc-alpha', B = 'mc-beta', MID = 'm_cc';
const ann = await person('cc.ann@example.invalid', { churches: [A] });
const eve = await person('cc.eve@example.invalid', {});
const dot = await person('cc.dot@example.invalid', { churches: [A, B] });
const seeded = [];
const seed = async (p, o) => { seeded.push(p); await put(p, o); };
const household = async (root, first, kin) => {
  await seed(root + 'addressBook/' + MID, { name: first + ' Synthetic', email: '', householdId: MID + '_k', markers: ['Youth Worship'] });
  await seed(root + 'addressBook/' + MID + '_k', { name: kin + ' Synthetic', householdId: MID });
};
for (const [root, first, kin] of [['churches/' + A + '/', 'Ann', 'Alfie'], ['churches/' + B + '/', 'Bea', 'Bertie'], ['', 'Eve', 'Egg']]) await household(root, first, kin);
for (const p of [ann, dot]) for (const cid of [A, B]) await seed(`churches/${cid}/users/${p.uid}`, { status: 'active', memberId: MID, name: (cid === A ? 'Ann' : 'Bea') + ' Synthetic' });
await seed('users/' + eve.uid, { status: 'active', memberId: MID, name: 'Eve Synthetic' });
/* whoAmI goes by the sign-in address: each person has a record with it in
   alpha, beta and at EGBC, with different ids. */
for (const p of [ann, eve, dot]) for (const [root, tag] of [['churches/' + A + '/', 'alpha'], ['churches/' + B + '/', 'beta'], ['', 'egbc']]) {
  await seed(root + 'addressBook/who_' + tag + '_' + p.uid.slice(0, 6), { name: tag + ' record', email: p.email });
}
/* Batch 2, messages: one address only each church knows, and the senders
   are master admins where they are (Ann in alpha, Eve at EGBC). Alpha has
   phone notifications switched on; beta has a child checked in. */
for (const [root, tag] of [['churches/' + A + '/', 'alpha'], ['churches/' + B + '/', 'beta'], ['', 'egbc']]) {
  await seed(root + 'addressBook/only_' + tag, { name: tag + ' only', email: tag + '.only@example.invalid' });
}
await seed('churches/' + A + '/users/' + ann.uid, { status: 'active', memberId: MID, name: 'Ann Synthetic', masterAdmin: true, email: ann.email });
await seed('users/' + eve.uid, { status: 'active', memberId: MID, name: 'Eve Synthetic', masterAdmin: true, email: eve.email });
await seed('churches/' + A + '/churchSettings/features', { notifications: true });
await seed('churches/' + A + '/churchSettings/notifications', { live: true });
/* EGBC's (the spare emulator's top level, made up) has them off. */
await seed('churchSettings/features', { notifications: false });
await seed('churches/' + B + '/checkins/ck_cc_b', { kind: 'child', state: 'in', memberId: 'm_child_b' });
/* Batch 3, meetings and video. Ann and Eve are church members (voters);
   each place has an open vote and its own rooms. Gil's church, mc-gamma,
   has no rooms yet. */
await seed('churches/' + A + '/users/' + ann.uid, { status: 'active', memberId: MID, name: 'Ann Synthetic', masterAdmin: true, email: ann.email, churchMember: true });
await seed('users/' + eve.uid, { status: 'active', memberId: MID, name: 'Eve Synthetic', masterAdmin: true, email: eve.email, churchMember: true });
for (const [root, tag] of [['churches/' + A + '/', 'a'], ['churches/' + B + '/', 'b'], ['', 'e']]) {
  await seed(root + 'churchMeetings/mt_' + tag + '/votes/v_' + tag, { status: 'open', choices: ['Yes', 'No'], title: 'CC synthetic vote' });
  await seed(root + 'addressBook/voter_' + tag, { name: 'Voter ' + tag.toUpperCase() + ' Synthetic', churchMember: true });
}
await seed('churches/' + A + '/churchSettings/video', { rooms: [{ key: 'Prayer', label: 'Prayer (made up)', teams: ['Prayer Team'], hostTeams: [] }] });
await seed('churches/' + B + '/churchSettings/video', { churchId: B, rooms: [{ key: 'BetaRoom', label: 'Beta room (made up)', teams: [], hostTeams: [] }] });
const gil = await person('cc.gil@example.invalid', { churches: ['mc-gamma'] });
await seed('churches/mc-gamma/users/' + gil.uid, { status: 'active', memberId: 'm_gil', name: 'Gil Synthetic' });
seeded.push('churches/mc-gamma/churchSettings/video', 'churchSettings/video');
/* Batch 4, codes and links with no sign-in. A site, a rota date for m_cc,
   and a members' meeting in each place; a youth code in alpha and at EGBC. */
const FUTURE = '2026-12-06';
for (const [root, tag, label] of [['churches/' + A + '/', 'a', 'Alpha'], ['churches/' + B + '/', 'b', 'Beta'], ['', 'e', 'EGBC']]) {
  await seed(root + 'sites/site_' + tag, { name: label + ' hall (made up)' });
  await seed(root + 'events/ev_cc_' + tag, { date: FUTURE, startTime: '10:00', endTime: '11:00', type: label + ' Synthetic Service', roles: ['Drums'], assignments: { Drums: { id: MID, name: 'Synthetic' } }, teams: ['Worship Team'] });
  await seed(root + 'churchMeetings/mt_p' + tag, { date: FUTURE, title: label + ' Synthetic AGM', papers: [] });
  await seed(root + 'addressBook/pp_' + tag, { name: label + ' Paper Synthetic', email: 'pp.' + tag + '@example.invalid', churchMember: true });
}
const fnUrl = (name) => `/${PROJECT}/europe-west2/${name}`;
const getUrl = (path) => req('localhost', FN_PORT, 'GET', path);
const postJson = (name, body) => req('localhost', FN_PORT, 'POST', fnUrl(name), body);
const lookupClaims = async (uid) => {
  const r = JSON.parse((await authPost(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { localId: [uid] }, true)).body || '{}');
  return JSON.parse(((r.users || [])[0] || {}).customAttributes || '{}');
};
const getDoc = async (p) => { const r = await req(FS[0], Number(FS[1]), 'GET', DOCS + '/' + p, undefined, OWNER); return r.status === 200 ? JSON.parse(r.body).fields || {} : null; };
const outboxTo = async (root, addr) => {
  const q = await req(FS[0], Number(FS[1]), 'POST', DOCS + (root ? '/' + root : '') + ':runQuery',
    { structuredQuery: { from: [{ collectionId: 'emailOutbox' }] } }, OWNER);
  return JSON.parse(q.body).filter(x => x.document && JSON.stringify(x.document.fields).includes(addr)).length;
};
const whoIds = (r) => ((r.result || {}).people || []).map(x => x.id.split('_')[1]);

try {
  console.log('\nwhoAmI');
  ok('  Ann (alpha) gets alpha\'s record only', JSON.stringify(whoIds(await call(ann, 'whoAmI'))) === '["alpha"]');
  ok('  Ann naming beta is refused', refused(await call(ann, 'whoAmI', { churchId: B }), 'PERMISSION_DENIED'));
  ok('  Eve (no claim) gets EGBC\'s top-level record, as today', JSON.stringify(whoIds(await call(eve, 'whoAmI'))) === '["egbc"]');
  ok('  Eve naming alpha is refused', refused(await call(eve, 'whoAmI', { churchId: A }), 'PERMISSION_DENIED'));
  ok('  Dot (both) must say which', refused(await call(dot, 'whoAmI'), 'INVALID_ARGUMENT'));
  ok('  Dot naming beta gets beta\'s', JSON.stringify(whoIds(await call(dot, 'whoAmI', { churchId: B }))) === '["beta"]');

  console.log('\nmyFamily');
  const fam = (r) => ((r.result || {}).members || []).map(m => m.firstName).join(',');
  let r = await call(ann, 'myFamily');
  ok('  Ann gets alpha\'s household (Alfie)', fam(r) === 'Alfie', JSON.stringify(r));
  ok('  Ann naming beta is refused', refused(await call(ann, 'myFamily', { churchId: B }), 'PERMISSION_DENIED'));
  r = await call(eve, 'myFamily');
  ok('  Eve gets EGBC\'s household (Egg), as today', fam(r) === 'Egg', JSON.stringify(r));
  ok('  Dot naming beta gets beta\'s (Bertie)', fam(await call(dot, 'myFamily', { churchId: B })) === 'Bertie');

  console.log('\nmyYouthHub');
  r = await call(ann, 'myYouthHub');
  ok('  Ann is known by alpha\'s record (Ann)', (r.result || {}).firstName === 'Ann', JSON.stringify(r));
  ok('  Ann naming beta is refused', refused(await call(ann, 'myYouthHub', { churchId: B }), 'PERMISSION_DENIED'));
  r = await call(eve, 'myYouthHub');
  ok('  Eve is known by EGBC\'s record (Eve), as today', (r.result || {}).firstName === 'Eve', JSON.stringify(r));
  ok('  Dot naming beta is known by beta\'s (Bea)', ((await call(dot, 'myYouthHub', { churchId: B })).result || {}).firstName === 'Bea');

  console.log('\nhubSend (batch 2)');
  const mail = (to, extra) => Object.assign({ source: 'compiler', to: [to], subject: 'CC synthetic', html: '<p>made up</p>' }, extra || {});
  r = await call(ann, 'hubSend', mail('alpha.only@example.invalid'));
  ok('  Ann emails somebody alpha knows', (r.result || {}).sent === 1, JSON.stringify(r));
  ok("  it is in alpha's outbox, not EGBC's", await outboxTo('churches/' + A, 'alpha.only@example.invalid') === 1 && await outboxTo('', 'alpha.only@example.invalid') === 0);
  ok('  Ann cannot email somebody only beta knows', refused(await call(ann, 'hubSend', mail('beta.only@example.invalid'))));
  ok('  nor somebody only EGBC knows', refused(await call(ann, 'hubSend', mail('egbc.only@example.invalid'))));
  ok('  Ann naming beta is refused', refused(await call(ann, 'hubSend', mail('beta.only@example.invalid', { churchId: B })), 'PERMISSION_DENIED'));
  ok("  nothing went into beta's outbox", await outboxTo('churches/' + B, 'beta.only@example.invalid') === 0);
  r = await call(eve, 'hubSend', mail('egbc.only@example.invalid'));
  ok('  Eve (no claim) emails somebody EGBC knows, as today', (r.result || {}).sent === 1, JSON.stringify(r));
  ok('  Eve cannot email somebody only alpha knows', refused(await call(eve, 'hubSend', mail('alpha.only@example.invalid'))));

  console.log('\ncompilerSend (batch 2)');
  r = await call(ann, 'compilerSend', { to: ['alpha.only@example.invalid'], subject: 'CC compiler', html: '<p>x</p>' });
  ok('  Ann sends to somebody alpha knows', (r.result || {}).ok === true, JSON.stringify(r));
  ok('  Ann cannot send to somebody only beta knows', refused(await call(ann, 'compilerSend', { to: ['beta.only@example.invalid'], subject: 'CC compiler', html: '<p>x</p>' })));
  ok('  Ann naming beta is refused', refused(await call(ann, 'compilerSend', { churchId: B, to: ['beta.only@example.invalid'], subject: 'x', html: 'x' }), 'PERMISSION_DENIED'));
  r = await call(eve, 'compilerSend', { to: ['egbc.only@example.invalid'], subject: 'CC compiler', html: '<p>x</p>' });
  ok('  Eve sends to somebody EGBC knows, as today', (r.result || {}).ok === true, JSON.stringify(r));

  console.log('\ncallParent and notifyTest (batch 2)');
  r = await call(ann, 'callParent', { checkinId: 'ck_cc_b' });
  ok("  Ann giving beta's child's check-in finds no such child in alpha", (r.result || {}).reason === 'not-in', JSON.stringify(r));
  ok('  Ann naming beta is refused', refused(await call(ann, 'callParent', { churchId: B, checkinId: 'ck_cc_b' }), 'PERMISSION_DENIED'));
  r = await call(ann, 'notifyTest');
  ok("  Ann's test goes by alpha's switch (on)", !r.error, JSON.stringify(r));
  ok('  Ann naming beta is refused', refused(await call(ann, 'notifyTest', { churchId: B }), 'PERMISSION_DENIED'));
  ok("  Eve's goes by EGBC's switch (off): refused, as today", refused(await call(eve, 'notifyTest'), 'FAILED_PRECONDITION'));

  console.log('\nVotes (batch 3)');
  r = await call(ann, 'castVote', { meeting: 'mt_a', vote: 'v_a', choice: 'Yes' });
  ok("  Ann votes in alpha's vote", (r.result || {}).ok === true, JSON.stringify(r));
  r = await call(ann, 'castVote', { meeting: 'mt_b', vote: 'v_b', choice: 'Yes' });
  ok("  Ann giving beta's vote ids: there is no such vote (in alpha)", refused(r, 'NOT_FOUND'), JSON.stringify(r));
  ok("  and beta's tally is untouched", (await getDoc('churches/' + B + '/churchMeetings/mt_b/votes/v_b/tally/count')) === null);
  ok('  Ann naming beta is refused', refused(await call(ann, 'castVote', { churchId: B, meeting: 'mt_b', vote: 'v_b', choice: 'Yes' }), 'PERMISSION_DENIED'));
  ok("  Ann cannot close beta's vote either", refused(await call(ann, 'voteClose', { meeting: 'mt_b', vote: 'v_b' }), 'NOT_FOUND'));
  r = await call(ann, 'proxyPeople', { meeting: 'mt_a' });
  const names = ((r.result || {}).people || []).map(p => p.name).join(',');
  ok("  Ann's proxy list is alpha's members only", names.includes('Voter A') && !names.includes('Voter B') && !names.includes('Voter E'), names || JSON.stringify(r));
  r = await call(eve, 'castVote', { meeting: 'mt_e', vote: 'v_e', choice: 'No' });
  ok("  Eve (no claim) votes in EGBC's vote, as today", (r.result || {}).ok === true, JSON.stringify(r));
  ok("  Eve giving alpha's vote ids: no such vote", refused(await call(eve, 'castVote', { meeting: 'mt_a', vote: 'v_a', choice: 'No' }), 'NOT_FOUND'));
  seeded.push(...['a', 'b', 'e'].flatMap(t => { const root = t === 'a' ? 'churches/' + A + '/' : t === 'b' ? 'churches/' + B + '/' : ''; return [root + 'churchMeetings/mt_' + t + '/votes/v_' + t + '/tally/count', root + 'churchMeetings/mt_' + t + '/votes/v_' + t + '/ballots/' + MID]; }));

  console.log('\nVideo rooms (batch 3)');
  r = await call(ann, 'videoRoomsEnsure');
  const rooms = ((r.result || {}).rooms || []);
  ok("  Ann gets alpha's rooms only", rooms.map(x => x.key).join(',') === 'Prayer', JSON.stringify(r));
  ok("  made in Daily under alpha's name", /\/mc-alpha-prayer$/.test((rooms[0] || {}).url || ''), (rooms[0] || {}).url);
  const av = await getDoc('churches/' + A + '/churchSettings/video');
  ok("  and alpha's video settings say they are alpha's", av && av.churchId && av.churchId.stringValue === A, JSON.stringify(av && av.churchId));
  ok('  Ann naming beta is refused', refused(await call(ann, 'videoRoomsEnsure', { churchId: B }), 'PERMISSION_DENIED'));
  r = await call(gil, 'videoRoomsEnsure');
  ok("  a church with no rooms yet has none - not EGBC's seven", JSON.stringify(((r.result || {}).rooms || [])) === '[]', JSON.stringify(r));
  r = await call(eve, 'videoRoomsEnsure');
  const erooms = ((r.result || {}).rooms || []);
  ok("  Eve (no claim) gets EGBC's rooms, named egbc-, as today", erooms.length >= 5 && erooms.every(x => /\/egbc-/.test(x.url || '')), JSON.stringify(erooms.map(x => x.url)));
  r = await call(ann, 'meetingHostToken', { room: 'Prayer' });
  ok("  Ann hosts alpha's room: the token is for alpha's Daily room", /^test-owner\.mc-alpha-prayer\./.test((r.result || {}).token || ''), JSON.stringify(r));
  ok("  Ann asking to host beta's room: no such room (in alpha)", refused(await call(ann, 'meetingHostToken', { room: 'BetaRoom' }), 'NOT_FOUND'));
  ok('  Ann naming beta is refused', refused(await call(ann, 'meetingHostToken', { churchId: B, room: 'BetaRoom' }), 'PERMISSION_DENIED'));

  console.log('\nChurchShow (batch 4)');
  r = await call(ann, 'churchShowPairingCode', { siteId: 'site_a', name: 'CC Alpha PC' });
  const pa = r.result || {};
  ok('  Ann pairs a computer in an alpha hall', !!pa.code && !!pa.deviceId, JSON.stringify(r));
  const ix = pa.code ? await getDoc('hqCodes/churchshow_' + churchShowHash(pa.code)) : null;
  ok("  the code's index entry says alpha (a hash, not the code)", !!ix && ix.churchId.stringValue === A && !JSON.stringify(ix).includes(pa.code));
  ok("  Ann giving beta's hall: no such site (in alpha)", refused(await call(ann, 'churchShowPairingCode', { siteId: 'site_b', name: 'x' }), 'NOT_FOUND'));
  ok('  Ann naming beta is refused', refused(await call(ann, 'churchShowPairingCode', { churchId: B, siteId: 'site_b', name: 'x' }), 'PERMISSION_DENIED'));
  let red = pa.code ? await postJson('churchShowRedeem', { code: pa.code }) : { status: 0 };
  ok('  the computer redeems the code with no sign-in', red.status === 200 && JSON.parse(red.body).siteId === 'site_a', red.status + ' ' + red.body);
  ok("  and its sign-in carries alpha", JSON.stringify((await lookupClaims(pa.deviceId)).churches) === JSON.stringify([A]), JSON.stringify(await lookupClaims(pa.deviceId)));
  ok("  Ann cannot rename a computer that is not alpha's", refused(await call(ann, 'churchShowRename', { deviceId: 'churchshow-site_b-xxxxxxxxxx', name: 'x' }), 'NOT_FOUND'));
  r = await call(ann, 'churchShowSetJob', { deviceId: pa.deviceId, services: true, lessonGroups: [] });
  ok("  setting its job keeps alpha in its sign-in", (r.result || {}).ok === true && JSON.stringify((await lookupClaims(pa.deviceId)).churches) === JSON.stringify([A]), JSON.stringify(r));
  r = await call(eve, 'churchShowPairingCode', { siteId: 'site_e', name: 'CC EGBC PC' });
  const pe = r.result || {};
  ok("  Eve (no claim) pairs in EGBC's hall, as today, with no index entry", !!pe.code && (await getDoc('hqCodes/churchshow_' + churchShowHash(pe.code))) === null, JSON.stringify(r));
  red = pe.code ? await postJson('churchShowRedeem', { code: pe.code }) : { status: 0 };
  ok("  and the computer redeems it, with no church in its sign-in", red.status === 200 && !(await lookupClaims(pe.deviceId)).churches, red.status + ' ' + red.body);
  seeded.push(...[pa, pe].filter(p => p.deviceId).flatMap(p => [(p === pa ? 'churches/' + A + '/' : '') + 'devices/' + p.deviceId]));
  if (pa.code) seeded.push('hqCodes/churchshow_' + churchShowHash(pa.code), 'churches/' + A + '/deviceCodes/' + churchShowHash(pa.code));
  if (pe.code) seeded.push('deviceCodes/' + churchShowHash(pe.code));

  console.log('\nYouth codes (batch 4)');
  await seed('churches/' + A + '/youthGrants/CCAA-2345', { memberId: MID, memberName: 'Kid Alpha', active: true });
  await seed('youthGrants/CCEE-2345', { memberId: MID, memberName: 'Kid Egbc', active: true });
  let yix = null; for (let i = 0; i < 40 && !yix; i++) { yix = await getDoc('hqCodes/youth_' + codeHash('CCAA-2345')); if (!yix) await new Promise(r2 => setTimeout(r2, 250)); }
  ok("  a church's new youth code is indexed by the server", !!yix && yix.churchId.stringValue === A);
  seeded.push('hqCodes/youth_' + codeHash('CCAA-2345'));
  red = await postJson('redeemYouthCode', { code: 'ccaa2345' });
  const ya = red.status === 200 ? JSON.parse(red.body) : {};
  ok('  the young person redeems it with no sign-in', red.status === 200 && ya.firstName === 'Kid', red.status + ' ' + red.body);
  const yq = JSON.parse((await req(FS[0], Number(FS[1]), 'POST', DOCS + '/churches/' + A + ':runQuery', { structuredQuery: { from: [{ collectionId: 'youthAccess' }] } }, OWNER)).body).filter(x => x.document);
  const youthUid = yq.length ? yq[0].document.name.split('/').pop() : '';
  ok("  their access is recorded in alpha", !!youthUid);
  ok("  and their sign-in carries alpha", !!youthUid && JSON.stringify((await lookupClaims(youthUid)).churches) === JSON.stringify([A]));
  red = await postJson('redeemYouthCode', { code: 'CCEE-2345' });
  ok("  EGBC's youth code redeems as today", red.status === 200 && JSON.parse(red.body).firstName === 'Kid', red.status + ' ' + red.body);
  yq.forEach(x => seeded.push(x.document.name.split('/documents/')[1]));
  const eq = JSON.parse((await req(FS[0], Number(FS[1]), 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'youthAccess' }] } }, OWNER)).body).filter(x => x.document && JSON.stringify(x.document.fields).includes('CCEE-2345'));
  ok("  with their access at EGBC's top level and no church in their sign-in", eq.length === 1 && !(await lookupClaims(eq[0].document.name.split('/').pop())).churches);
  eq.forEach(x => seeded.push(x.document.name.split('/documents/')[1]));

  console.log('\nCalendar feeds (batch 4)');
  r = await call(ann, 'myCalendarLink', { feed: 'me' });
  const akey = (r.result || {}).key || '';
  ok('  Ann makes her rota link', !!akey, JSON.stringify(r));
  let feed = akey ? await getUrl(fnUrl('rotaFeed') + '?k=' + akey) : { status: 0, body: '' };
  ok("  it shows alpha's rota date, and not beta's or EGBC's", feed.status === 200 && feed.body.includes('Alpha Synthetic Service') && !feed.body.includes('Beta Synthetic') && !feed.body.includes('EGBC Synthetic'), feed.status + ' ' + feed.body.slice(0, 200));
  ok("  Ann's list of links is alpha's", ((await call(ann, 'myCalendarLinks')).result || {}).feeds.me === akey);
  r = await call(ann, 'myCalendarLink', { feed: 'me', reset: true });
  const akey2 = (r.result || {}).key || '';
  ok("  resetting it: the old link stops working", akey2 && akey2 !== akey && (await getUrl(fnUrl('rotaFeed') + '?k=' + akey)).status === 404);
  ok("  and its index entry is gone", (await getDoc('hqCodes/feed_' + codeHash(akey))) === null);
  ok('  Ann naming beta is refused', refused(await call(ann, 'myCalendarLink', { churchId: B, feed: 'me' }), 'PERMISSION_DENIED'));
  r = await call(eve, 'myCalendarLink', { feed: 'me' });
  const ekey = (r.result || {}).key || '';
  feed = ekey ? await getUrl(fnUrl('rotaFeed') + '?k=' + ekey) : { status: 0, body: '' };
  ok("  Eve's link (no claim) shows EGBC's rota date, as today", feed.status === 200 && feed.body.includes('EGBC Synthetic Service') && !feed.body.includes('Alpha Synthetic'), feed.status + ' ' + feed.body.slice(0, 200));
  seeded.push('churches/' + A + '/calendarKeys/' + ann.uid, 'churches/' + A + '/calendarFeeds/' + akey2, 'hqCodes/feed_' + codeHash(akey2), 'calendarKeys/' + eve.uid, 'calendarFeeds/' + ekey);

  console.log('\nMeeting papers links (batch 4)');
  const adb = getFirestore();
  const html = (tag) => '<a href="https://example.invalid/church-meeting.html?meeting=mt_p' + tag + '">Papers</a>';
  const links = (tag) => ({ meetingId: 'mt_p' + tag, expires: Date.parse(FUTURE) + 30 * 86400000, hasAccount: () => false });
  const base = 'http://localhost:' + FN_PORT + fnUrl('').replace(/\/$/, '');
  const pageOf = async (out) => { const m = /\/meetingPapers\?t=([A-Za-z0-9_-]+)/.exec(out); return m ? { t: m[1], page: await getUrl(fnUrl('meetingPapers') + '?t=' + m[1]) } : { t: '', page: { status: 0, body: '' } }; };
  let pp = await pageOf(await personalise(scopedDb(adb, A), links('a'), { member: true, id: 'ab_pp_a', email: 'pp.a@example.invalid' }, html('a'), { fnBase: base }));
  ok("  an alpha member's own link opens alpha's meeting", pp.page.status === 200 && pp.page.body.includes('Alpha Synthetic AGM'), pp.page.status + ' ' + pp.page.body.slice(0, 160));
  if (pp.t) seeded.push('hqCodes/papers_' + codeHash(pp.t));
  const ep = await pageOf(await personalise(adb, links('e'), { member: true, id: 'ab_pp_e', email: 'pp.e@example.invalid' }, html('e'), { fnBase: base }));
  ok("  an EGBC member's link opens EGBC's, as today, with no index entry", ep.page.status === 200 && ep.page.body.includes('EGBC Synthetic AGM') && (await getDoc('hqCodes/papers_' + codeHash(ep.t))) === null, ep.page.status + ' ' + ep.page.body.slice(0, 160));
} finally {
  for (const p of seeded) await del(p).catch(() => {});
  /* The outbox rows the sends made, in each place. */
  for (const root of ['churches/' + A, 'churches/' + B, '']) {
    const q = await req(FS[0], Number(FS[1]), 'POST', DOCS + (root ? '/' + root : '') + ':runQuery', { structuredQuery: { from: [{ collectionId: 'emailOutbox' }] } }, OWNER);
    for (const x of JSON.parse(q.body)) if (x.document && /only@example.invalid/.test(JSON.stringify(x.document.fields))) await req(FS[0], Number(FS[1]), 'DELETE', '/v1/' + x.document.name, undefined, OWNER);
  }
}
const failed = R.filter(v => !v).length;
console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
process.exit(failed ? 1 : 0);
