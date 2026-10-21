/* Church HQ for more than one church, step 1: the directory and the claims
 * (design-mocks/multi-church/PLAN.md; Martin chose B, 22 Oct 2026).
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec ^
 *     --config firebase.spare.json --only firestore,auth,functions ^
 *     --project egbc-worship-planner "node tests/check-hq-claims.mjs"
 *
 * Made-up churches only; nothing of EGBC's is touched or moved.
 * - A membership written puts the church in the person's sign-in
 *   (churches: [ids]); a second church adds to it; one removed takes it out.
 * - Claims the person already had are KEPT (a ChurchShow computer's device
 *   and siteId must survive).
 * - The rules: a person reads only the directory entries of their own
 *   churches and their own memberships; no page writes either.
 * - hqMyChurches answers with the person's own churches only.
 */
import http from 'node:http';
import { mergedClaims, validChurchId } from '../functions/hq-directory.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181').split(':');
const AUTH = (process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099').split(':');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (host, port, method, path, body, headers) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host, port, method, path,
    headers: Object.assign(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
  r.on('error', rej); r.end(data);
});
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' };
const fsReq = (method, path, body, h) => req(FS[0], Number(FS[1]), method, path, body, h || OWNER);
const str = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { stringValue: String(v) }])) });
const authPost = (path, body, owner) => req(AUTH[0], Number(AUTH[1]), 'POST', path, body, owner ? OWNER : {});
const PW = 'test-only-password';

async function account(email) {
  let up = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  return { uid: up.localId, email };
}
const token = async (p) => JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}').idToken;
const claims = async (p) => {
  const r = JSON.parse((await authPost(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { localId: [p.uid] }, true)).body || '{}');
  return JSON.parse(((r.users || [])[0] || {}).customAttributes || '{}');
};
/* Wait for the trigger: until the claims say what we expect, up to 15 s. */
const waitClaims = async (p, test) => { let c = {}; for (let i = 0; i < 60; i++) { c = await claims(p); if (test(c)) return c; await sleep(250); } return c; };
const asRead = async (idToken, path) => (await fsReq('GET', DOCS + '/' + path, undefined, { Authorization: 'Bearer ' + idToken })).status;
const call = async (idToken, name, data) => JSON.parse((await req('localhost', FN_PORT, 'POST', `/${PROJECT}/europe-west2/${name}`, { data: data || {} }, { Authorization: 'Bearer ' + idToken })).body || '{}');

console.log('The pure parts');
ok('  claims are merged: what a person had is kept', JSON.stringify(mergedClaims({ device: 'churchshow', siteId: 's1' }, ['mc-a'])) === JSON.stringify({ device: 'churchshow', siteId: 's1', churches: ['mc-a'] }));
ok('  no churches left: the key goes, the rest stays', JSON.stringify(mergedClaims({ device: 'churchshow', churches: ['x'] }, [])) === JSON.stringify({ device: 'churchshow' }));
ok('  a church id is lower case letters, digits and dashes', validChurchId('mc-alpha') && !validChurchId('MC Alpha') && !validChurchId('a/b'));

const A = await account('hq.a@example.invalid'), B = await account('hq.b@example.invalid');
const ALPHA = 'mc-alpha', BETA = 'mc-beta';
await fsReq('PATCH', DOCS + '/hqChurches/' + ALPHA, str({ name: 'Made-up Alpha Church', domain: 'alpha.example.invalid', group: 'main', status: 'active' }));
await fsReq('PATCH', DOCS + '/hqChurches/' + BETA, str({ name: 'Made-up Beta Church', domain: 'beta.example.invalid', group: 'main', status: 'active' }));
for (const id of [ALPHA + '_' + A.uid, BETA + '_' + A.uid, BETA + '_' + B.uid]) await fsReq('DELETE', DOCS + '/hqMemberships/' + id);
/* A claim A already has, which nothing here may drop. */
await authPost(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { localId: A.uid, customAttributes: JSON.stringify({ keep: 'yes' }) }, true);

try {
  console.log('\nMemberships make the claims');
  await fsReq('PATCH', DOCS + '/hqMemberships/' + ALPHA + '_' + A.uid, str({ churchId: ALPHA, uid: A.uid, at: new Date().toISOString() }));
  let c = await waitClaims(A, x => JSON.stringify(x.churches) === JSON.stringify([ALPHA]));
  ok('  joining Alpha puts it in the sign-in', JSON.stringify(c.churches) === JSON.stringify([ALPHA]), JSON.stringify(c));
  ok('  and keeps the claim that was there', c.keep === 'yes', JSON.stringify(c));
  await fsReq('PATCH', DOCS + '/hqMemberships/' + BETA + '_' + A.uid, str({ churchId: BETA, uid: A.uid, at: new Date().toISOString() }));
  await fsReq('PATCH', DOCS + '/hqMemberships/' + BETA + '_' + B.uid, str({ churchId: BETA, uid: B.uid, at: new Date().toISOString() }));
  c = await waitClaims(A, x => (x.churches || []).length === 2);
  ok('  a second church is added, both listed', JSON.stringify(c.churches) === JSON.stringify([ALPHA, BETA]) && c.keep === 'yes', JSON.stringify(c));
  const cb = await waitClaims(B, x => (x.churches || []).length === 1);
  ok('  somebody else has only their own', JSON.stringify(cb.churches) === JSON.stringify([BETA]), JSON.stringify(cb));
  await fsReq('DELETE', DOCS + '/hqMemberships/' + BETA + '_' + A.uid);
  c = await waitClaims(A, x => JSON.stringify(x.churches) === JSON.stringify([ALPHA]));
  ok('  a membership removed takes that church out', JSON.stringify(c.churches) === JSON.stringify([ALPHA]) && c.keep === 'yes', JSON.stringify(c));

  console.log('\nThe rules');
  const tA = await token(A), tB = await token(B);
  ok('  a member reads their own church’s directory entry', await asRead(tA, 'hqChurches/' + ALPHA) === 200);
  ok('  not another church’s', await asRead(tA, 'hqChurches/' + BETA) === 403);
  ok('  and that other church’s member cannot read theirs', await asRead(tB, 'hqChurches/' + ALPHA) === 403);
  ok('  a person reads their own membership', await asRead(tA, 'hqMemberships/' + ALPHA + '_' + A.uid) === 200);
  ok('  not somebody else’s', await asRead(tA, 'hqMemberships/' + BETA + '_' + B.uid) === 403);
  const w1 = await fsReq('PATCH', DOCS + '/hqMemberships/' + BETA + '_' + A.uid, str({ churchId: BETA, uid: A.uid }), { Authorization: 'Bearer ' + tA });
  ok('  nobody joins a church from a page', w1.status === 403, String(w1.status));
  const w2 = await fsReq('PATCH', DOCS + '/hqChurches/' + ALPHA, str({ name: 'Renamed' }), { Authorization: 'Bearer ' + tA });
  ok('  nor changes the directory', w2.status === 403, String(w2.status));

  console.log('\nhqMyChurches');
  const mine = await call(tA, 'hqMyChurches');
  ok('  answers with the person’s own churches only', JSON.stringify((mine.result || {}).churches) === JSON.stringify([{ id: ALPHA, name: 'Made-up Alpha Church', domain: 'alpha.example.invalid' }]), JSON.stringify(mine));
  const none = JSON.parse((await req('localhost', FN_PORT, 'POST', `/${PROJECT}/europe-west2/hqMyChurches`, { data: {} })).body || '{}');
  ok('  and nothing to somebody signed out', !!(none.error && none.error.status === 'UNAUTHENTICATED'), JSON.stringify(none));
} finally {
  for (const id of [ALPHA + '_' + A.uid, BETA + '_' + A.uid, BETA + '_' + B.uid]) await fsReq('DELETE', DOCS + '/hqMemberships/' + id);
  await fsReq('DELETE', DOCS + '/hqChurches/' + ALPHA); await fsReq('DELETE', DOCS + '/hqChurches/' + BETA);
}
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
