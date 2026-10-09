/* The public availability form, now that it goes through functions.
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec ^
 *     --config firebase.spare.json --only firestore,auth,functions ^
 *     --project egbc-worship-planner "node tests/check-availability-form.mjs"
 *
 * (from v2/. Spare ports, so it runs while the dev emulators are up.)
 *
 * WHAT IT IS FOR. addressBook and events were `allow read: if true` and
 * availability had an open create, so that index.html could work with no
 * sign-in. That gave anyone on the internet every name, email address,
 * telephone number and household in the church, every service with its
 * assignments - who is serving, by name - and the ability to write an answer
 * for any member id. Martin chose Option A of PRIVACY-OPEN-COLLECTIONS.md on
 * 9 October 2026: three functions, and the rules shut.
 *
 * The four things Martin asked to be proved, each by making it fail:
 *
 *   1. a stranger gets nothing from addressBook or events
 *        - in firestore-rules.test.mjs, where the rules engine runs
 *   2. findMe gives only the asker's own record            <- here
 *   3. the rate limit trips                                <- here
 *   4. an answer cannot be written for someone else        <- here
 *
 * Synthetic people throughout. Nothing here resembles a real member, and
 * every address ends .invalid, which can never be a real domain.
 */
import http from 'node:http';

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const REGION = 'europe-west2';
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181').split(':');
const FS_HOST = FS[0], FS_PORT = Number(FS[1] || 8181);

/* Seeded over the emulator's REST interface with the owner token, which skips
   the rules - right here, because the point is to test the FUNCTIONS. The
   rules are tested on their own in firestore-rules.test.mjs. */
const rest = (method, path, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: FS_HOST, port: FS_PORT, method, path,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej);
  req.end(data);
});
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;

const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (path, obj) => rest('PATCH', DOCS + '/' + path, { fields: fields(obj) });
const getDoc = async (path) => {
  const r = await rest('GET', DOCS + '/' + path);
  return r.status === 200 ? JSON.parse(r.body) : null;
};
const listDocs = async (coll) => {
  const r = await rest('GET', DOCS + '/' + coll + '?pageSize=300');
  return r.status === 200 ? (JSON.parse(r.body).documents || []) : [];
};

/* Plain values back out of Firestore's REST shape, so an assertion can read
   like an assertion. */
const plain = (f) => {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('timestampValue' in f) return f.timestampValue;
  if ('nullValue' in f) return null;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(plain);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, plain(v)]));
  return undefined;
};
const doc2obj = (d) => Object.fromEntries(Object.entries((d && d.fields) || {}).map(([k, v]) => [k, plain(v)]));

const R = [];
const ok = (n, v, x) => {
  R.push({ n, v });
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')));
};

/* A callable, over HTTP, with no Authorization header at all - which is the
   whole point: the form has no sign-in. */
const call = (name, data) => new Promise((res, rej) => {
  const payload = JSON.stringify({ data: data || {} });
  const r = http.request({ host: 'localhost', port: FN_PORT, method: 'POST',
    path: `/${PROJECT}/${REGION}/${name}`,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => { try { res(JSON.parse(d || '{}')); } catch { res({ raw: d }); } }); });
  r.on('error', rej);
  r.end(payload);
});

/* ---- invented people ------------------------------------------------- */

/* Two records on ONE address: a household, which the form has always had to
   cope with - it offers a "which of you is this?" dropdown. */
const HOUSE_EMAIL = 'house@example.invalid';
const ALEX = 'ab_alex_form';       /* Worship Team */
const BEA = 'ab_bea_form';         /* Kids Church - same email as Alex */
const CARL = 'ab_carl_form';       /* a different address entirely */
const GONE = 'ab_gone_form';       /* archived: has left the church */

const PHONE = '01111 222333';
const ADDRESS = '7 Nowhere Lane, Invalidtown';

async function seed() {
  await put('addressBook/' + ALEX, { name: 'Alex Form', email: HOUSE_EMAIL,
    markers: ['Worship Team'], phone: PHONE, address: ADDRESS, householdId: 'hh_form' });
  await put('addressBook/' + BEA, { name: 'Bea Form', email: HOUSE_EMAIL,
    markers: ['Kids Church'], phone: PHONE, address: ADDRESS, householdId: 'hh_form' });
  await put('addressBook/' + CARL, { name: 'Carl Form', email: 'carl@example.invalid',
    markers: ['AV Team'], phone: PHONE, address: ADDRESS });
  await put('addressBook/' + GONE, { name: 'Gone Form', email: 'gone@example.invalid',
    markers: ['Worship Team'], archived: true });

  /* Every event carries the three things the open rule used to publish and
     the form never needed: who is serving, the service leader, the speaker. */
  const extras = {
    assignments: { Guitar: { id: ALEX, name: 'Alex Form' }, Keyboard: { id: CARL, name: 'Carl Form' } },
    serviceLeader: 'Dee Secret', speaker: 'Eve Secret'
  };
  await put('events/ev_form_worship', { ...extras, date: '2026-11-01', startTime: '08:00',
    endTime: '11:30', type: 'Sunday Morning Worship', description: 'Communion',
    termLabel: 'Autumn 2026', teams: ['Worship Team'], archived: false });
  await put('events/ev_form_kids', { ...extras, date: '2026-11-08', startTime: '09:30',
    endTime: '11:00', type: 'Kids Church', description: '', termLabel: 'Autumn 2026',
    teams: ['Kids Church'], archived: false });
  await put('events/ev_form_all', { ...extras, date: '2026-11-15', startTime: '10:00',
    endTime: '11:00', type: 'All Age Service', description: '', termLabel: 'Autumn 2026',
    teams: [], archived: false });
  await put('events/ev_form_archived', { ...extras, date: '2026-11-22', type: 'Sunday Morning Worship',
    description: '', termLabel: 'Autumn 2026', teams: ['Worship Team'], archived: true });

  /* An answer Alex gave last time, which the form has never been able to show
     him and now can. */
  await put('availability/' + ALEX + '_ev_form_worship', { memberId: ALEX,
    memberName: 'Alex Form', eventId: 'ev_form_worship', dateKey: '2026-11-01', status: 'avail' });
}

/* The limit is per connection, and every call in this file comes from the
   same one - so the counter is cleared between sections or the earlier
   sections quietly spend the budget the rate-limit section is measuring. */
async function clearRate() {
  for (const d of await listDocs('formRateLimit')) {
    await rest('DELETE', '/v1/' + d.name.split('/v1/').pop().replace(/^.*?(projects\/)/, '$1'));
  }
  /* The line above is fiddly, so prove it worked rather than assuming. */
  return (await listDocs('formRateLimit')).length;
}

/* ---- the run ---------------------------------------------------------- */

await seed();
const left = await clearRate();
if (left !== 0) { console.error('could not clear the rate limit counter (' + left + ' left)'); process.exit(1); }

console.log('\nfindMe');

const house = (await call('findMe', { email: HOUSE_EMAIL })).result || {};
ok('a household address finds both of them', Array.isArray(house.people) && house.people.length === 2,
  JSON.stringify(house));
ok('and gives a form token', typeof house.token === 'string' && house.token.length >= 16, house.token);

const names = (house.people || []).map(p => p.name).sort().join(' | ');
ok('with their names', names === 'Alex Form | Bea Form', names);

const keys = [...new Set((house.people || []).flatMap(p => Object.keys(p)))].sort().join(',');
ok('and NOTHING but id, name and markers', keys === 'id,markers,name', keys);

const asText = JSON.stringify(house);
ok('no telephone number anywhere in the reply', !asText.includes(PHONE));
ok('no address anywhere in the reply', !asText.includes('Nowhere Lane'));
ok('not even the email address it was asked about', !asText.includes(HOUSE_EMAIL));

/* BREAK 2: findMe gives only the asker's own record. */
ok('findMe does not leak the person on the OTHER address', !asText.includes('Carl Form'), asText.slice(0, 200));

const unknown = (await call('findMe', { email: 'nobody-at-all@example.invalid' })).result || {};
ok('an address the church does not hold finds nobody', Array.isArray(unknown.people) && unknown.people.length === 0,
  JSON.stringify(unknown));
ok('and is given no token to try the other calls with', !unknown.token, JSON.stringify(unknown));

const archived = (await call('findMe', { email: 'gone@example.invalid' })).result || {};
ok('somebody who has left is not asked when they can serve',
  Array.isArray(archived.people) && archived.people.length === 0, JSON.stringify(archived));

const junk = await call('findMe', { email: 'not-an-email' });
ok('a lookup that is not an address is refused', !!(junk.error && junk.error.status === 'INVALID_ARGUMENT'),
  JSON.stringify(junk).slice(0, 200));

console.log('\nmyDates');

const alexDates = (await call('myDates', { token: house.token, memberId: ALEX })).result || {};
/* Named, not counted. Other checks in the suite seed their own events, and
   this one shared an emulator with three of them the first time it ran - so
   an exact list failed on dates that were never anything to do with it. What
   matters is which of OUR dates are there and which are not. */
const mine = (alexDates.events || []).map(e => e.id);
const has = id => mine.indexOf(id) !== -1;
ok('Alex gets his Sunday', has('ev_form_worship'), mine.join(','));
ok('and the all-age service, which is for no particular team', has('ev_form_all'), mine.join(','));
ok('not the archived date', !has('ev_form_archived'), mine.join(','));
ok('not Bea’s Kids Church date', !has('ev_form_kids'), mine.join(','));

const evKeys = [...new Set((alexDates.events || []).flatMap(e => Object.keys(e)))].sort().join(',');
ok('a date carries only what the form draws',
  evKeys === 'date,description,endTime,id,startTime,termLabel,type', evKeys);

const datesText = JSON.stringify(alexDates);
ok('NOBODY’S NAME is in the dates - no assignments', !datesText.includes('Alex Form') && !datesText.includes('Carl Form'), datesText.slice(0, 200));
ok('no service leader', !datesText.includes('Dee Secret'));
ok('no speaker', !datesText.includes('Eve Secret'));

ok('and his own answer from last time comes back',
  alexDates.answers && alexDates.answers.ev_form_worship === 'avail', JSON.stringify(alexDates.answers));

const beaDates = (await call('myDates', { token: house.token, memberId: BEA })).result || {};
const hers = (beaDates.events || []).map(e => e.id);
ok('the same household token works for Bea too, and gives HER dates',
  hers.indexOf('ev_form_kids') !== -1 && hers.indexOf('ev_form_worship') === -1, hers.join(','));

/* BREAK 4, first half: a token is for the people that address matched. */
const notMine = await call('myDates', { token: house.token, memberId: CARL });
ok('BREAK: that token cannot read Carl’s dates',
  !!(notMine.error && notMine.error.status === 'PERMISSION_DENIED'), JSON.stringify(notMine).slice(0, 200));

const noToken = await call('myDates', { memberId: ALEX });
ok('and no token at all gets nothing', !!noToken.error, JSON.stringify(noToken).slice(0, 160));

const madeUp = await call('myDates', { token: 'x'.repeat(32), memberId: ALEX });
ok('nor does an invented one', !!(madeUp.error && madeUp.error.status === 'PERMISSION_DENIED'),
  JSON.stringify(madeUp).slice(0, 160));

/* An expired one, written straight into the store. */
await put('formSessions/expiredtoken0000000000000000', {
  memberIds: [ALEX], createdAt: 0, expiresAt: new Date(Date.now() - 60 * 1000) });
const stale = await call('myDates', { token: 'expiredtoken0000000000000000', memberId: ALEX });
ok('an expired session is refused', !!(stale.error && stale.error.status === 'PERMISSION_DENIED'),
  JSON.stringify(stale).slice(0, 160));

console.log('\nsaveAnswer');

const saved = await call('saveAnswer', { token: house.token, memberId: ALEX, eventId: 'ev_form_all', status: 'not-avail' });
ok('Alex answers a date', !!(saved.result && saved.result.ok), JSON.stringify(saved).slice(0, 200));

const written = doc2obj(await getDoc('availability/' + ALEX + '_ev_form_all'));
ok('the answer is stored under his id and the event id', written.memberId === ALEX && written.eventId === 'ev_form_all',
  JSON.stringify(written));
ok('with the status he chose', written.status === 'not-avail', written.status);
ok('and the name and date taken off the records, not off the request',
  written.memberName === 'Alex Form' && written.dateKey === '2026-11-15', JSON.stringify(written));

/* BREAK 4, second half, and the one Martin named: an answer cannot be
   written for someone else. */
const forCarl = await call('saveAnswer', { token: house.token, memberId: CARL, eventId: 'ev_form_all', status: 'avail' });
ok('BREAK: Alex cannot answer as Carl',
  !!(forCarl.error && forCarl.error.status === 'PERMISSION_DENIED'), JSON.stringify(forCarl).slice(0, 200));
ok('and nothing was written for Carl', (await getDoc('availability/' + CARL + '_ev_form_all')) === null);

const badStatus = await call('saveAnswer', { token: house.token, memberId: ALEX, eventId: 'ev_form_all', status: 'maybe-later' });
ok('an answer that is not one of the two is refused',
  !!(badStatus.error && badStatus.error.status === 'INVALID_ARGUMENT'), JSON.stringify(badStatus).slice(0, 160));

const noSuchDate = await call('saveAnswer', { token: house.token, memberId: ALEX, eventId: 'ev_not_a_thing', status: 'avail' });
ok('an answer about a date that does not exist is refused',
  !!(noSuchDate.error && noSuchDate.error.status === 'NOT_FOUND'), JSON.stringify(noSuchDate).slice(0, 160));
ok('so the collection cannot be used as free storage',
  (await getDoc('availability/' + ALEX + '_ev_not_a_thing')) === null);

console.log('\nthe rate limit');

/* BREAK 3. Cleared first, because everything above came from this same
   connection and would otherwise have spent some of the twenty. */
const leftAgain = await clearRate();
if (leftAgain !== 0) { console.error('counter not clear'); process.exit(1); }

let allowed = 0, refused = 0, firstRefusalAt = 0;
for (let i = 1; i <= 22; i++) {
  const r = await call('findMe', { email: HOUSE_EMAIL });
  if (r.result) allowed++;
  else {
    refused++;
    if (!firstRefusalAt) firstRefusalAt = i;
    if (refused === 1) {
      ok('the refusal says what it is', !!(r.error && r.error.status === 'RESOURCE_EXHAUSTED'),
        JSON.stringify(r.error).slice(0, 200));
      ok('and tells them what to do about it',
        /try again|office/i.test((r.error && r.error.message) || ''), (r.error || {}).message);
    }
  }
}
ok('BREAK: twenty lookups are allowed from one connection', allowed === 20, 'allowed ' + allowed);
ok('BREAK: the twenty-first trips the limit', firstRefusalAt === 21, 'first refusal at ' + firstRefusalAt);
ok('and it stays tripped', refused === 2, 'refused ' + refused);

/* The limit must not strand somebody halfway through the form. */
const stillWorks = (await call('myDates', { token: house.token, memberId: ALEX })).result || {};
ok('somebody already filling the form is not thrown out by the limit',
  (stillWorks.events || []).some(e => e.id === 'ev_form_worship'),
  JSON.stringify((stillWorks.events || []).map(e => e.id)));

/* And the counter holds no address, only a hash of one. */
const counters = await listDocs('formRateLimit');
const counterText = JSON.stringify(counters.map(doc2obj));
ok('the counter records a hash, never an address or a name',
  counters.length === 1 && !/@|\./.test(Object.keys(counters[0].fields || {}).join('')) && !counterText.includes('example.invalid'),
  counterText.slice(0, 200));
const cid = counters.length ? counters[0].name.split('/').pop() : '';
ok('and its id is a hash, not an address', /^[0-9a-f]{32}$/.test(cid), cid);

console.log('\nwhoAmI - which record is mine');

/* Not part of the form, but the same lookup, and the reason the hub can
   still sign anybody in with the address book shut. A-036.

   The property that matters: IT TAKES NO ARGUMENTS THAT MEAN ANYTHING. The
   address comes out of the verified token, so a caller who puts somebody
   else's address in the body gets their own record back, not that person's. */

const AUTH = (process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9089').split(':');
const authPost = (path, body, asOwner) => new Promise((res, rej) => {
  const d = JSON.stringify(body);
  const r = http.request({ host: AUTH[0], port: Number(AUTH[1]), method: 'POST', path,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) },
      asOwner ? { Authorization: 'Bearer owner' } : {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res(JSON.parse(x || '{}'))); });
  r.on('error', rej); r.end(d);
});

/* accounts:update with the user's own idToken does NOT set emailVerified in
   the emulator; the project-scoped endpoint, as the owner, does. */
async function signedInAs(email, verify) {
  let up = await authPost('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email, password: 'test-only-password', returnSecureToken: true });
  if (!up.localId) up = await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email, password: 'test-only-password', returnSecureToken: true });
  if (verify) {
    await authPost('/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:update',
      { localId: up.localId, emailVerified: true }, true);
    up = await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email, password: 'test-only-password', returnSecureToken: true });
  }
  return up.idToken;
}

const callAs = (idToken, name, data) => new Promise((res, rej) => {
  const payload = JSON.stringify({ data: data || {} });
  const r = http.request({ host: 'localhost', port: FN_PORT, method: 'POST',
    path: '/' + PROJECT + '/' + REGION + '/' + name,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
               Authorization: 'Bearer ' + idToken } },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => { try { res(JSON.parse(d || '{}')); } catch { res({ raw: d }); } }); });
  r.on('error', rej); r.end(payload);
});

const nobody = await call('whoAmI', {});
ok('nobody signed in gets nothing from whoAmI',
  !!(nobody.error && nobody.error.status === 'UNAUTHENTICATED'), JSON.stringify(nobody).slice(0, 160));

const alexToken = await signedInAs(HOUSE_EMAIL, true);
const whoami = (await callAs(alexToken, 'whoAmI', {})).result || {};
const ids = (whoami.people || []).map(x => x.id).sort();
ok('a verified address finds both records on it', ids.join(',') === [ALEX, BEA].sort().join(','), ids.join(','));
const wkeys = [...new Set((whoami.people || []).flatMap(x => Object.keys(x)))].sort().join(',');
ok('with what the mirror needs and nothing more',
  wkeys === 'adminFor,churchMember,id,markers,masterAdmin,name', wkeys);
const wtext = JSON.stringify(whoami);
ok('no telephone number', !wtext.includes(PHONE));
ok('no address', !wtext.includes('Nowhere Lane'));

/* The one that matters. */
const asked = (await callAs(alexToken, 'whoAmI', { email: 'carl@example.invalid' })).result || {};
ok('BREAK: asking about somebody ELSE returns your own record, not theirs',
  !JSON.stringify(asked).includes('Carl Form')
  && (asked.people || []).map(x => x.id).sort().join(',') === [ALEX, BEA].sort().join(','),
  JSON.stringify(asked).slice(0, 200));

const unverified = await signedInAs('unverified.form@example.invalid', false);
const uv = (await callAs(unverified, 'whoAmI', {})).result || {};
ok('an unverified address can claim nothing', (uv.people || []).length === 0, JSON.stringify(uv));

const strangerToken = await signedInAs('not.in.the.book@example.invalid', true);
const st = (await callAs(strangerToken, 'whoAmI', {})).result || {};
ok('and an address the church does not hold finds nobody', (st.people || []).length === 0, JSON.stringify(st));

const goneToken = await signedInAs('gone@example.invalid', true);
const gn = (await callAs(goneToken, 'whoAmI', {})).result || {};
ok('somebody archived cannot sign in as themselves', (gn.people || []).length === 0, JSON.stringify(gn));

const failed = R.filter(r => !r.v);
console.log('\n' + (R.length - failed.length) + '/' + R.length + ' passed');
process.exit(failed.length ? 1 : 0);
