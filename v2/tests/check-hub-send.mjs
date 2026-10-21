/* Every v2 email through one callable, hubSend, on Church HQ's Resend
 * (Martin, 21 Oct 2026: "v2 doesn't use Calla at all"; PLAN-hub-send.md).
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec ^
 *     --config firebase.spare.json --only firestore,auth,functions ^
 *     --project egbc-worship-planner "node tests/check-hub-send.mjs"
 *
 * Through the real callable on the emulator, with real sign-ins:
 *   - signed out is refused;
 *   - who may send, per source, is the server's answer, not the page's;
 *   - each source reaches only its own people; unknown addresses and
 *     under-18s are refused; the hourly cap holds;
 *   - one email per recipient (nobody sees anyone else's address);
 *   - attachments (the rota PDFs) arrive, by name, in the outbox;
 *   - a safeguarding concern keeps no body.
 * On the emulator nothing is sent: emailOutbox is the whole of it.
 * Synthetic people only.
 */
import http from 'node:http';

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const REGION = 'europe-west2';
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
const fsReq = (method, path, body) => req(FS[0], Number(FS[1] || 8181), method, path, body, { Authorization: 'Bearer owner' });
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => fsReq('PATCH', DOCS + '/' + p, { fields: fields(obj) });
const del = (p) => fsReq('DELETE', DOCS + '/' + p);
const authPost = (path, body, asOwner) => req(AUTH[0], Number(AUTH[1] || 9099), 'POST', path, body, asOwner ? { Authorization: 'Bearer owner' } : {});
const plainOf = (f) => {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(plainOf);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, plainOf(v)]));
  return null;
};
/* The outbox rows for one subject. */
const outbox = async (subject) => {
  const r = await fsReq('POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'emailOutbox' }],
    where: { fieldFilter: { field: { fieldPath: 'subject' }, op: 'EQUAL', value: { stringValue: subject } } } } });
  return JSON.parse(r.body || '[]').filter(x => x.document).map(x => Object.fromEntries(Object.entries(x.document.fields).map(([k, v]) => [k, plainOf(v)])));
};

const PEOPLE = {
  master:  { email: 'hs.master@example.invalid',  teams: [], adminFor: [], masterAdmin: true },
  leader:  { email: 'hs.leader@example.invalid',  teams: ['Worship Team'], adminFor: ['Worship Team'] },
  member:  { email: 'hs.member@example.invalid',  teams: [], adminFor: [] },
  runner:  { email: 'hs.runner@example.invalid',  teams: ['Hospitality'], adminFor: [] },
  youth:   { email: 'hs.youth@example.invalid',   teams: [], adminFor: ['Youth Worship'] }
};
async function account(key) {
  const p = PEOPLE[key];
  let up = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: 'test-only-password', returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await authPost('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: 'test-only-password', returnSecureToken: true })).body || '{}');
  p.uid = up.localId; p.idToken = up.idToken; p.member = 'ab_hs_' + key;
  await put('addressBook/' + p.member, { name: 'HS ' + key + ' Synthetic', email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: !!p.masterAdmin, archived: false });
  await put('users/' + p.uid, { uid: p.uid, email: p.email, name: 'HS ' + key + ' Synthetic', memberId: p.member, status: 'active',
    teams: p.teams, adminFor: p.adminFor, masterAdmin: !!p.masterAdmin });
}
const call = async (who, data) => {
  const h = who ? { Authorization: 'Bearer ' + PEOPLE[who].idToken } : {};
  const r = await req('localhost', FN_PORT, 'POST', `/${PROJECT}/${REGION}/hubSend`, { data }, h);
  let j = {}; try { j = JSON.parse(r.body || '{}'); } catch { j = { raw: r.body }; }
  return j.error ? { refused: String(j.error.status || ''), why: String(j.error.message || '') } : (j.result || {});
};
const RUN = 'hs' + Date.now().toString(36);
const S = (n) => 'Synthetic ' + n + ' ' + RUN;
const hour = new Date().toISOString().slice(0, 13);

/* ---- the invented church ---- */
for (const k of Object.keys(PEOPLE)) await account(k);
const KNOWN = 'hs.known@example.invalid', KNOWN2 = 'hs.known2@example.invalid', KID = 'hs.kid@example.invalid',
  PARENT = 'hs.parent@example.invalid', SIGNUP = 'hs.signup@example.invalid', LEAD = 'hs.lead@example.invalid';
await put('addressBook/ab_hs_known', { name: 'Known Synthetic', email: KNOWN, markers: ['Worship Team'], archived: false });
await put('addressBook/ab_hs_known2', { name: 'Known Two Synthetic', email: KNOWN2, markers: ['Kids Church'], archived: false });
await put('addressBook/ab_hs_kid', { name: 'Kid Synthetic', email: KID, isMinor: true, householdId: 'hh_hs', archived: false });
await put('addressBook/ab_hs_parent', { name: 'Parent Synthetic', email: PARENT, householdId: 'hh_hs', archived: false });
await put('addressBook/ab_hs_lead', { name: 'Lead Synthetic', email: LEAD, archived: false });
await put('calEvents/ev_hs', { title: 'Synthetic event', teamMemberIds: [PEOPLE.runner.member], teamUids: [] });
await put('signups/su_hs', { calEventId: 'ev_hs', email: SIGNUP, name: 'Signup Synthetic' });
await put('bookingSettings/site_hs', { safeguardingLead: 'ab_hs_lead' });
await del('mailRouteHours/' + hour);

try {
  console.log('Signed in only');
  let r = await call(null, { source: 'compiler', to: [KNOWN], subject: S('signed out'), html: '<p>x</p>' });
  ok('a call with nobody signed in is refused', r.refused === 'UNAUTHENTICATED', JSON.stringify(r));
  ok('  and nothing is in the outbox', (await outbox(S('signed out'))).length === 0);
  r = await call('master', { to: [KNOWN], subject: S('no source'), html: '<p>x</p>' });
  ok('a call that does not say what kind of email it is, is refused', r.refused === 'INVALID_ARGUMENT', JSON.stringify(r));

  console.log('\nThe Email Compiler (who may email whom)');
  r = await call('master', { source: 'compiler', to: [KNOWN, KNOWN2], subject: S('compiler'), html: '<p>Hello</p>', replyTo: PEOPLE.master.email });
  let rows = await outbox(S('compiler'));
  ok('a master admin emails two people: both sent', r.ok === true && r.sent === 2, JSON.stringify(r));
  ok('  as two emails, one person each - nobody sees the other', rows.length === 2 && rows.every(x => x.to.length === 1), JSON.stringify(rows.map(x => x.to)));
  ok('  through Church HQ’s Resend, marked as the hub’s', rows.every(x => x.via === 'churchhq' && x.source === 'hub:compiler' && x.by === PEOPLE.master.uid), JSON.stringify(rows.map(x => [x.via, x.source])));
  r = await call('leader', { source: 'compiler', to: [KNOWN], subject: S('leader own'), html: '<p>x</p>' });
  ok('a Worship Team leader emails someone on their team', r.ok === true, JSON.stringify(r));
  r = await call('leader', { source: 'compiler', to: [KNOWN2], subject: S('leader other'), html: '<p>x</p>' });
  ok('  but not someone on another team', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));
  r = await call('member', { source: 'compiler', to: [KNOWN], subject: S('member'), html: '<p>x</p>' });
  ok('somebody who leads nothing sends nothing', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));
  r = await call('leader', { source: 'compilerTest', to: [KNOWN], subject: S('test other'), html: '<p>x</p>' });
  ok('"Send test" to somebody else is refused', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));
  r = await call('leader', { source: 'compilerTest', to: [PEOPLE.leader.email], subject: S('test self'), html: '<p>x</p>' });
  ok('  to yourself it goes', r.ok === true, JSON.stringify(r));

  console.log('\nKnown recipients, no under-18s, the cap');
  r = await call('master', { source: 'compiler', to: ['stranger.hs@example.invalid'], subject: S('stranger'), html: '<p>x</p>' });
  ok('an address the church does not hold is refused', r.refused === 'PERMISSION_DENIED' && /not known/i.test(r.why), JSON.stringify(r));
  r = await call('master', { source: 'compiler', to: [KID], subject: S('kid'), html: '<p>x</p>' });
  ok('an under-18’s address is refused, even for a master admin', r.refused === 'PERMISSION_DENIED' && /under-18/i.test(r.why), JSON.stringify(r));
  await put('mailRouteHours/' + hour, { recipients: 2000, hour });
  r = await call('master', { source: 'compiler', to: [KNOWN], subject: S('cap'), html: '<p>x</p>' });
  ok('the hourly cap holds', r.refused === 'RESOURCE_EXHAUSTED', JSON.stringify(r));
  await del('mailRouteHours/' + hour);

  console.log('\nRotas, with their PDFs');
  const pdf = Buffer.from('%PDF-1.4 synthetic rota').toString('base64');
  r = await call('leader', { source: 'rota', to: [KNOWN], subject: S('rota'), html: '<p>Your rota</p>',
    attachments: [{ filename: 'Individual_Rota.pdf', content: pdf }, { filename: 'Full_Church_Rota.pdf', content: pdf }, { filename: 'rota.ics', content: Buffer.from('BEGIN:VCALENDAR').toString('base64'), type: 'text/calendar' }] });
  rows = await outbox(S('rota'));
  ok('a rota leader sends a rota with three attachments', r.ok === true && rows.length === 1
    && JSON.stringify(rows[0].attachments.map(a => a.filename)) === '["Individual_Rota.pdf","Full_Church_Rota.pdf","rota.ics"]', JSON.stringify(rows.map(x => x.attachments)));
  r = await call('member', { source: 'rota', to: [KNOWN], subject: S('rota member'), html: '<p>x</p>' });
  ok('  somebody who leads no rota cannot', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));
  r = await call('leader', { source: 'rota', to: [KNOWN], subject: S('rota bad'), html: '<p>x</p>', attachments: [{ filename: 'x.pdf', content: 'not base64 at all!' }] });
  ok('  an attachment that is not readable is refused', r.refused === 'INVALID_ARGUMENT', JSON.stringify(r));

  console.log('\nYouth Hub codes go to the parent, never the young person');
  r = await call('youth', { source: 'youthCode', to: [PARENT], subject: S('code'), html: '<p>code</p>' });
  ok('a youth leader sends the code to the household head', r.ok === true, JSON.stringify(r));
  r = await call('youth', { source: 'youthCode', to: [KNOWN], subject: S('code other'), html: '<p>code</p>' });
  ok('  not to an adult outside that household', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));
  r = await call('member', { source: 'youthCode', to: [PARENT], subject: S('code member'), html: '<p>code</p>' });
  ok('  and nobody else sends codes', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));

  console.log('\nAn event');
  r = await call('runner', { source: 'event', ref: 'ev_hs', to: [SIGNUP], subject: S('event'), html: '<p>x</p>' });
  ok('somebody on the event’s team emails its sign-ups', r.ok === true, JSON.stringify(r));
  r = await call('member', { source: 'event', ref: 'ev_hs', to: [SIGNUP], subject: S('event member'), html: '<p>x</p>' });
  ok('  somebody not running it cannot', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));

  console.log('\nA safeguarding concern');
  r = await call('member', { source: 'safeguarding', to: [LEAD], subject: S('concern'), html: '<p>A concern has been reported.</p>' });
  rows = await outbox(S('concern'));
  ok('anyone signed in tells the safeguarding lead', r.ok === true, JSON.stringify(r));
  ok('  and the outbox keeps no body', rows.length === 1 && rows[0].html === '', JSON.stringify(rows.map(x => x.html)));
  r = await call('member', { source: 'safeguarding', to: [KNOWN], subject: S('concern other'), html: '<p>x</p>' });
  ok('  it cannot go to anyone else', r.refused === 'PERMISSION_DENIED', JSON.stringify(r));
} finally {
  await del('mailRouteHours/' + hour);
}
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
