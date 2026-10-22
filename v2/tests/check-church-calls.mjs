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
import { churchIdOf, scopedDb, claimedChurches } from '../functions/church-scope.js';

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
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
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
