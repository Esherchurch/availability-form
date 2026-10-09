/* Pairing the projection PC: make a code, redeem it, disconnect.
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec ^
 *     --config firebase.spare.json --only firestore,auth,functions ^
 *     --project egbc-worship-planner "node tests/check-churchshow-pairing.mjs"
 *
 * WHY. ChurchShow reads the plans and the songs with no sign-in at all, which
 * worked only while those collections were open. They are shut now, so the
 * projection PC needs an identity - and if this does not work, Sunday
 * morning's screens are blank. R1-R3 of FINDINGS-churchshow.md.
 *
 * The ChurchShow side is already built to the wire contract, so the shapes
 * are not ours to choose: 200 { customToken, siteId, siteName }, or 400
 * { error } with one plain sentence that the operator is shown as it arrives.
 * Several assertions below are about that contract exactly, because the other
 * window cannot change if we drift.
 *
 * THE ONE THING ONLY THIS CHECK CAN DO is prove the custom token works -
 * sign in with it and read the claims back. firestore-rules.test.mjs proves
 * what a device with those claims may read, by handing them to the rules
 * engine directly; it cannot prove the function issues them.
 *
 * Synthetic throughout: one invented site, one invented admin.
 */
import http from 'node:http';

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const REGION = 'europe-west2';
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181').split(':');
const AUTH = (process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099').split(':');

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

/* ---- the emulators, over REST ---------------------------------------- */

const req = (host, port, method, path, body, headers) => new Promise((res, rej) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host, port, method, path,
    headers: Object.assign(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
  r.on('error', rej); r.end(data);
});
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const fsReq = (method, path, body) => req(FS[0], Number(FS[1] || 8181), method, path, body, { Authorization: 'Bearer owner' });
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => fsReq('PATCH', DOCS + '/' + p, { fields: fields(obj) });
const getOne = async (p) => { const r = await fsReq('GET', DOCS + '/' + p); return r.status === 200 ? JSON.parse(r.body) : null; };
const listDocs = async (c) => {
  const r = await fsReq('GET', DOCS + '/' + c + '?pageSize=300');
  return r.status === 200 ? (JSON.parse(r.body).documents || []) : [];
};
const plain = (f) => !f ? undefined
  : ('stringValue' in f ? f.stringValue
  : 'booleanValue' in f ? f.booleanValue
  : 'nullValue' in f ? null
  : 'timestampValue' in f ? f.timestampValue : undefined);

const authPost = (path, body, asOwner) =>
  req(AUTH[0], Number(AUTH[1] || 9099), 'POST', path, body, asOwner ? { Authorization: 'Bearer owner' } : {});

/* ---- the invented church -------------------------------------------- */

const SITE = 'site_cs_synth';
const SITE_NAME = 'Synthetic Church Hall';
const DEVICE_UID = 'churchshow-' + SITE;

async function account(email, { master, adminFor }) {
  let up = await authPost('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email, password: 'test-only-password', returnSecureToken: true });
  up = JSON.parse(up.body || '{}');
  if (!up.localId) {
    up = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email, password: 'test-only-password', returnSecureToken: true })).body || '{}');
  }
  await put('users/' + up.localId, {
    uid: up.localId, email, name: email.split('@')[0],
    memberId: 'ab_' + up.localId, status: 'active',
    teams: [], adminFor: adminFor || [], masterAdmin: !!master,
    attender: true, churchMember: false
  });
  return { uid: up.localId, idToken: up.idToken };
}

/* A callable, as the hub's page calls it: signed in, with the ID token. */
const call = async (idToken, name, data) => {
  const r = await req('localhost', FN_PORT, 'POST', `/${PROJECT}/${REGION}/${name}`,
    { data: data || {} }, { Authorization: 'Bearer ' + idToken });
  try { return JSON.parse(r.body || '{}'); } catch { return { raw: r.body }; }
};

/* The redeem endpoint, as ChurchShow calls it: plain HTTP, no account. */
const redeemCall = async (body, method) => {
  const r = await req('localhost', FN_PORT, method || 'POST',
    `/${PROJECT}/${REGION}/churchShowRedeem`, body === undefined ? {} : body);
  let parsed = null; try { parsed = JSON.parse(r.body || '{}'); } catch {}
  return { status: r.status, body: parsed, raw: r.body };
};

/* ---- the run --------------------------------------------------------- */

await put('sites/' + SITE, { name: SITE_NAME, active: true });
/* Clear anything a previous run left: codes are burnt once, so they have to
   be fresh, and the device has to start unpaired for the first assertion. */
await fsReq('DELETE', DOCS + '/devices/' + DEVICE_UID);
for (const d of await listDocs('deviceCodes')) {
  if (plain((d.fields || {}).uid) === DEVICE_UID)
    await fsReq('DELETE', DOCS + '/deviceCodes/' + d.name.split('/').pop());
}

const av = await account('cs.av.admin@example.invalid', { adminFor: ['AV Team'] });
const nobody = await account('cs.nobody@example.invalid', {});

console.log('\nwho may connect it');
const refused = await call(nobody.idToken, 'churchShowPairingCode', { siteId: SITE });
ok('somebody who administers nothing cannot make a code',
  !!(refused.error && refused.error.status === 'PERMISSION_DENIED'), JSON.stringify(refused).slice(0, 200));
const noAuth = await req('localhost', FN_PORT, 'POST',
  `/${PROJECT}/${REGION}/churchShowPairingCode`, { data: { siteId: SITE } });
ok('and nobody signed in certainly cannot', /UNAUTHENTICATED/.test(noAuth.body), noAuth.body.slice(0, 160));

const badSite = await call(av.idToken, 'churchShowPairingCode', { siteId: 'site_does_not_exist' });
ok('a site that does not exist is refused',
  !!(badSite.error && badSite.error.status === 'NOT_FOUND'), JSON.stringify(badSite).slice(0, 200));

console.log('\nmaking a code');
const made = (await call(av.idToken, 'churchShowPairingCode', { siteId: SITE })).result || {};
const CODE = made.code;
ok('an AV admin gets a code', typeof CODE === 'string' && CODE.length === 8, JSON.stringify(made));
ok('from the alphabet ChurchShow expects, with no I, L, O, 0 or 1',
  /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(String(CODE)), CODE);
ok('and it says when it runs out', typeof made.expiresAt === 'string' && !isNaN(Date.parse(made.expiresAt)), made.expiresAt);
ok('and which site it is for, to show on screen', made.siteName === SITE_NAME, made.siteName);

/* THE PLAIN CODE IS NEVER STORED. */
const codeDocs = await listDocs('deviceCodes');
const mine = codeDocs.filter(d => plain((d.fields || {}).uid) === DEVICE_UID);
ok('exactly one code is on file for that site', mine.length === 1, 'found ' + mine.length);
const codeId = mine.length ? mine[0].name.split('/').pop() : '';
ok('stored under a sha256, not the code itself', /^[0-9a-f]{64}$/.test(codeId) && codeId !== CODE, codeId);
ok('and the plain code appears nowhere in the document',
  mine.length === 1 && !JSON.stringify(mine[0].fields).includes(CODE),
  mine.length === 1 ? JSON.stringify(mine[0].fields).slice(0, 200) : '');
ok('it starts unused, with no tries against it',
  mine.length === 1 && plain(mine[0].fields.usedAt) === null, mine.length === 1 ? JSON.stringify(plain(mine[0].fields.usedAt)) : '');

const dev = await getOne('devices/' + DEVICE_UID);
ok('the device is on file for the site, and switched on',
  dev && plain(dev.fields.active) === true && plain(dev.fields.siteId) === SITE, dev && JSON.stringify(dev.fields));
ok('and records who paired it', dev && plain(dev.fields.pairedBy) === av.uid, dev && plain(dev.fields.pairedBy));

/* The Auth user, which only the admin REST interface can show us. */
const who = await req(AUTH[0], Number(AUTH[1] || 9099), 'POST',
  '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup',
  { localId: [DEVICE_UID] }, { Authorization: 'Bearer owner' });
const user = (JSON.parse(who.body || '{}').users || [])[0] || {};
ok('an account exists for the projection PC', user.localId === DEVICE_UID, JSON.stringify(user).slice(0, 200));
ok('named so somebody can recognise it in the console',
  /ChurchShow/.test(String(user.displayName || '')), user.displayName);
ok('with NO email address and NO password - it is a computer',
  !user.email && !user.passwordHash, JSON.stringify({ email: user.email, pw: !!user.passwordHash }));
const claims = JSON.parse(user.customAttributes || '{}');
ok('and the claims the rules read', claims.device === 'churchshow' && claims.siteId === SITE,
  user.customAttributes);

console.log('\nredeeming it, as ChurchShow does');
const wrong = await redeemCall({ code: 'ZZZZ2345' });
ok('a code nobody made is refused with 400', wrong.status === 400, wrong.status + ' ' + wrong.raw);
ok('and ONE plain sentence, which ChurchShow shows as it is',
  wrong.body && wrong.body.error === "That code isn't valid or has run out — make a new one on the hub.",
  JSON.stringify(wrong.body));
ok('and nothing else - no hint about which way it was wrong',
  wrong.body && Object.keys(wrong.body).join(',') === 'error', JSON.stringify(wrong.body));

const getIt = await redeemCall({ code: CODE }, 'GET');
ok('a GET is refused, so a code never reaches a proxy log', getIt.status === 405, getIt.status + ' ' + getIt.raw);

const good = await redeemCall({ code: CODE });
ok('THE REAL CODE WORKS: 200', good.status === 200, good.status + ' ' + good.raw);
ok('with a custom token', good.body && typeof good.body.customToken === 'string' && good.body.customToken.length > 40,
  JSON.stringify(good.body).slice(0, 160));
ok('the site id', good.body && good.body.siteId === SITE, good.body && good.body.siteId);
ok('and the site name, to show on the projection PC', good.body && good.body.siteName === SITE_NAME,
  good.body && good.body.siteName);
ok('and nothing more than the three the contract names',
  good.body && Object.keys(good.body).sort().join(',') === 'customToken,siteId,siteName',
  good.body && Object.keys(good.body).join(','));

/* THE THING ONLY THIS CHECK CAN PROVE. */
const signedIn = JSON.parse((await authPost(
  '/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key',
  { token: good.body.customToken, returnSecureToken: true })).body || '{}');
/* signInWithCustomToken answers with an idToken and a refreshToken and NO
   localId - the uid is inside the token. The first version of this read
   signedIn.localId, got undefined, and reported a working sign-in as broken. */
const tok = signedIn.idToken ? JSON.parse(Buffer.from(String(signedIn.idToken).split('.')[1], 'base64').toString('utf8')) : {};
ok('the token signs the projection PC in, as that device', tok.user_id === DEVICE_UID,
  JSON.stringify({ user_id: tok.user_id, got: Object.keys(signedIn).join(',') }));
ok('and the ID token it gets back carries device=churchshow',
  tok.device === 'churchshow', JSON.stringify({ device: tok.device, siteId: tok.siteId }));
ok('and its own siteId, which is what keeps it off another site’s screen pages',
  tok.siteId === SITE, JSON.stringify(tok.siteId));

console.log('\nthe code is worth nothing twice');
const again = await redeemCall({ code: CODE });
ok('a second use is refused', again.status === 400, again.status + ' ' + again.raw);
ok('with the same sentence', again.body && again.body.error === wrong.body.error, JSON.stringify(again.body));
const burnt = await getOne('deviceCodes/' + codeId);
ok('and the code records when it was used', burnt && plain(burnt.fields.usedAt) !== null,
  burnt && JSON.stringify(plain(burnt.fields.usedAt)));

console.log('\na code that has run out');
const stale = (await call(av.idToken, 'churchShowPairingCode', { siteId: SITE })).result || {};
const staleDocs = (await listDocs('deviceCodes')).filter(d =>
  plain((d.fields || {}).uid) === DEVICE_UID && plain((d.fields || {}).usedAt) === null);
ok('a fresh code was made to expire', staleDocs.length === 1, 'found ' + staleDocs.length);
if (staleDocs.length === 1) {
  await fsReq('PATCH', DOCS + '/deviceCodes/' + staleDocs[0].name.split('/').pop()
    + '?updateMask.fieldPaths=expiresAt', { fields: fields({ expiresAt: new Date(Date.now() - 60000) }) });
}
const expired = await redeemCall({ code: stale.code });
ok('an expired code is refused', expired.status === 400, expired.status + ' ' + expired.raw);

console.log('\ndisconnecting');
const dRefused = await call(nobody.idToken, 'churchShowDisconnect', { siteId: SITE });
ok('somebody who administers nothing cannot disconnect it',
  !!(dRefused.error && dRefused.error.status === 'PERMISSION_DENIED'), JSON.stringify(dRefused).slice(0, 200));

/* A live, unused code, to prove Disconnect clears it. */
const live = (await call(av.idToken, 'churchShowPairingCode', { siteId: SITE })).result || {};
const off = (await call(av.idToken, 'churchShowDisconnect', { siteId: SITE })).result || {};
ok('an AV admin disconnects it', off.ok === true, JSON.stringify(off));
const devOff = await getOne('devices/' + DEVICE_UID);
ok('AND THE DEVICE DOCUMENT SAYS SO AT ONCE, which is what the rules read',
  devOff && plain(devOff.fields.active) === false, devOff && JSON.stringify(plain(devOff.fields.active)));
ok('recording who switched it off', devOff && plain(devOff.fields.disconnectedBy) === av.uid,
  devOff && plain(devOff.fields.disconnectedBy));
const leftOver = (await listDocs('deviceCodes')).filter(d =>
  plain((d.fields || {}).uid) === DEVICE_UID && plain((d.fields || {}).usedAt) === null);
ok('and any code not yet used is thrown away', leftOver.length === 0, 'still ' + leftOver.length);
const deadCode = await redeemCall({ code: live.code });
ok('so a code written down before the disconnect is worthless', deadCode.status === 400,
  deadCode.status + ' ' + deadCode.raw);

/* AND THE DEVICE CHECK ON ITS OWN. The assertion above cannot tell "the
   device is switched off" from "the code was deleted", because Disconnect
   does both - a deliberate break that removed the device check failed
   nothing. So: make a code, switch the device off by hand WITHOUT clearing
   the codes, and the code must still be refused. */
const liveAgain = (await call(av.idToken, 'churchShowPairingCode', { siteId: SITE })).result || {};
await fsReq('PATCH', DOCS + '/devices/' + DEVICE_UID + '?updateMask.fieldPaths=active',
  { fields: fields({ active: false }) });
const codeStillThere = (await listDocs('deviceCodes')).filter(d =>
  plain((d.fields || {}).uid) === DEVICE_UID && plain((d.fields || {}).usedAt) === null);
ok('a good code still on file, with the device switched off', codeStillThere.length === 1,
  'found ' + codeStillThere.length);
const offRefused = await redeemCall({ code: liveAgain.code });
ok('is refused BECAUSE THE DEVICE IS OFF, not because the code went',
  offRefused.status === 400, offRefused.status + ' ' + offRefused.raw);

console.log('\nand connecting it again');
const back = (await call(av.idToken, 'churchShowPairingCode', { siteId: SITE })).result || {};
ok('pairing again gives a new code', typeof back.code === 'string' && back.code !== CODE, back.code);
const devBack = await getOne('devices/' + DEVICE_UID);
ok('and switches the device back on', devBack && plain(devBack.fields.active) === true,
  devBack && JSON.stringify(plain(devBack.fields.active)));
ok('keeping the date it was first connected',
  devBack && plain(devBack.fields.firstPairedAt) === plain(dev.fields.firstPairedAt),
  JSON.stringify({ now: devBack && plain(devBack.fields.firstPairedAt), then: plain(dev.fields.firstPairedAt) }));
const backOk = await redeemCall({ code: back.code });
ok('and the new code works', backOk.status === 200, backOk.status + ' ' + backOk.raw);

const failed = R.filter(v => !v).length;
console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
process.exit(failed ? 1 : 0);
