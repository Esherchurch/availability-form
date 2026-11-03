/* THE KIDS CHURCH SUNDAY'S SERVER FUNCTIONS THAT NO OTHER CHECK RUNS (the
 * going-live test, Stage 3): each one's normal case and its refusals, at
 * the top level and in a made-up parish, "St Aidan's with St Hild, Testbury
 * (synthetic)" (st-aidans-s3). Run in-process against the Firestore emulator.
 *
 *   npx firebase emulators:exec --config firebase.events.json --only firestore \
 *     --project egbc-worship-planner "node tests/stage3/functions-stage3.mjs"
 *
 *   formAnswers              a parent's link: the answers given on that request,
 *                            the medical half only with the email's secret;
 *                            nothing for a wrong key; the church is the address's
 *   churchShowServicesToday  a paired ChurchShow computer: today's services in its
 *   churchShowWords          building, and the church's own words; nobody else
 *   careStatusFromSettings   the safeguarding lead and deputy, kept for the rules
 *   youthGrantIndex          a church's youth code, indexed to that church only
 */
import { createRequire } from 'node:module';
import { formAnswers, careStatusFromSettings, careStatusFromSettingsChurch, youthGrantIndex, churchShowServicesToday, churchShowWords } from '../../functions/index.js';
import { churchForCode, codeHash } from '../../functions/hq-codes.js';

const fnRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'egbc-worship-planner' });
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Not on the emulator - refusing to run.');
const root = getFirestore();

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const J = (x) => JSON.stringify(x);
const refusal = async (f) => { try { await f(); return 'answered'; } catch (e) { return e.code || e.message; } };
const PARISH = 'st-aidans-s3', P = (path) => 'churches/' + PARISH + '/' + path;
const put = (path, o) => root.doc(path).set(o);
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/* ---- the made-up records ---- */
const KEY = 'k_s3_top_000000000000', SECRET = 's_s3_top_000000000000';
const PKEY = 'k_s3_parish_0000000000', PSECRET = 's_s3_parish_0000000000';
await put('hqSlugs/st-aidans-s3', { churchId: PARISH });
await put('churches/' + PARISH, { name: "St Aidan's with St Hild, Testbury (synthetic)", status: 'active' });
for (const [pre, key, secret, words] of [['', KEY, SECRET, 'Top'], [P(''), PKEY, PSECRET, 'Parish']]) {
  await put(pre + 'formRequests/' + key, { status: 'done', responseId: 'r_s3', formId: 'f_s3' });
  await put(pre + 'formResponses/r_s3', { requestKey: key, formId: 'f_s3', answers: { child: words + ' child (synthetic)' } });
  await put(pre + 'sensitiveResponses/' + secret, { responseId: 'r_s3', formId: 'f_s3', answers: { allergies: words + ' allergy (synthetic)' } });
  /* an answer given on another request, which this key must not open */
  await put(pre + 'formRequests/k_s3_other_00000000000', { status: 'done', responseId: 'r_s3_x', formId: 'f_s3' });
  await put(pre + 'formResponses/r_s3_x', { requestKey: 'k_s3_someone_else_0000', formId: 'f_s3', answers: { child: 'Someone else (synthetic)' } });
}
const call = (data, origin) => formAnswers.run({ data, rawRequest: { headers: { origin: origin || 'http://localhost:5601' } } });

/* ---- formAnswers ---- */
let a = await call({ key: KEY, secret: SECRET });
ok('formAnswers: the link with its secret gives the answers and the medical half', /Top child/.test(J(a.response)) && /Top allergy/.test(J(a.sensitive)), J(a));
a = await call({ key: KEY, secret: 's_s3_wrong_00000000000' });
ok('   a wrong secret: the answers, never the medical half', /Top child/.test(J(a.response)) && a.sensitive === null, J(a));
a = await call({ key: 'k_s3_nobody_0000000000', secret: SECRET });
ok('   a key nobody was sent: nothing', a.response === null && a.sensitive === null && a.reuse === null, J(a));
a = await call({ key: 'r_s3', secret: SECRET });
ok('   the record’s own id in place of the key: nothing', a.response === null && a.sensitive === null, J(a));
a = await call({ key: 'k_s3_other_00000000000', secret: '' });
ok('   a request pointing at an answer given on another request: nothing', a.response === null, J(a));
a = await call({ key: PKEY, secret: PSECRET }, 'https://st-aidans-s3.churchhq.co.uk');
ok('   THE PARISH: its own address gives its own answers', /Parish child/.test(J(a.response)) && /Parish allergy/.test(J(a.sensitive)), J(a));
a = await call({ key: PKEY, secret: PSECRET });
ok('   the parish’s key from another address: nothing', a.response === null && a.sensitive === null, J(a));
ok('   an address no church has: refused', (await refusal(() => call({ key: KEY }, 'https://nobody-s3.churchhq.co.uk'))) === 'not-found');

/* ---- ChurchShow: today's services and the church's words ---- */
const today = londonDay(new Date());
await put('churchSettings/details', { name: 'Top church (synthetic)', serviceDay: 'Sunday', mainSiteId: 'site_s3' });
await put('sites/site_s3', { name: 'St Hild (synthetic)', active: true });
await put('events/ev_s3_today', { date: today, type: 'Sunday Morning Worship', siteId: 'site_s3', startTime: '09:00', serviceTime: '10:30', archived: false });
await put('events/ev_s3_elsewhere', { date: today, type: 'Sunday Morning Worship', siteId: 'site_other', startTime: '09:00', serviceTime: '10:30', archived: false });
await put('devices/dev_s3', { jobs: { lessonGroups: ['Kids Church'] } });
await put('teams/Kids Church', { label: 'Kids Church' });
await put(P('churchSettings/details'), { name: "St Aidan's with St Hild, Testbury (synthetic)", serviceDay: 'Sunday', mainSiteId: 'site_p' });
await put(P('devices/dev_s3p'), { jobs: { lessonGroups: ['Sunday Club'] } });
await put(P('teams/Sunday Club'), { label: 'Sunday Club (synthetic)' });
const dev = { uid: 'dev_s3', token: { device: 'churchshow', siteId: 'site_s3' } };
const s = await churchShowServicesToday.run({ auth: dev, data: {} });
ok('churchShowServicesToday: a paired computer gets today’s services in its own building only', s.services.length === 1 && s.services[0].eventId === 'ev_s3_today' && s.next === 'ev_s3_today', J(s));
ok('   signed out: refused', (await refusal(() => churchShowServicesToday.run({ data: {} }))) === 'unauthenticated');
ok('   a person, not a ChurchShow computer: refused', (await refusal(() => churchShowServicesToday.run({ auth: { uid: 'u_s3', token: {} }, data: {} }))) === 'permission-denied');
const w = await churchShowWords.run({ auth: dev, data: {} });
ok('churchShowWords: the church’s name, day and the computer’s lesson groups', w.churchName === 'Top church (synthetic)' && w.groups['Kids Church'] === 'Kids Church', J(w));
const wp = await churchShowWords.run({ auth: { uid: 'dev_s3p', token: { device: 'churchshow', siteId: 'site_p', churches: [PARISH] } }, data: {} });
ok('   THE PARISH’s computer: the parish’s own name and groups', /St Aidan/.test(wp.churchName) && wp.groups['Sunday Club'] === 'Sunday Club (synthetic)', J(wp));
ok('   a person: refused', (await refusal(() => churchShowWords.run({ auth: { uid: 'u_s3', token: {} }, data: {} }))) === 'permission-denied');

/* ---- careStatusFromSettings ---- */
await put('bookingSettings/site_s3', { safeguardingLead: 'm_s3_lead', safeguardingDeputy: 'm_s3_dep' });
await put('safeguardingSettings/defaults', { leadSiteId: 'site_s3' });
await put(P('bookingSettings/site_p'), { safeguardingLead: 'm_p_lead', safeguardingDeputy: '' });
await put(P('safeguardingSettings/defaults'), { leadSiteId: 'site_p' });
await careStatusFromSettings.run({ params: { id: 'defaults' }, data: {} });
const st = (await root.doc('careRouting/status').get()).data();
ok('careStatusFromSettings: the lead and deputy are kept for the rules', st.leadSet === true && J(st.leadIds) === J(['m_s3_lead', 'm_s3_dep']), J(st));
await careStatusFromSettingsChurch.run({ params: { cid: PARISH, id: 'defaults' }, data: {} });
const sp = (await root.doc(P('careRouting/status')).get()).data();
ok('   THE PARISH: its own lead, in its own data; the top level is untouched', sp.leadSet === true && J(sp.leadIds) === J(['m_p_lead'])
  && J((await root.doc('careRouting/status').get()).data().leadIds) === J(['m_s3_lead', 'm_s3_dep']), J(sp));
ok('   a church id that is not one: refused before anything is read', (await refusal(() => careStatusFromSettingsChurch.run({ params: { cid: 'Not A Church!', id: 'defaults' }, data: {} }))) !== 'answered');

/* ---- youthGrantIndex ---- */
await youthGrantIndex.run({ params: { cid: PARISH, id: 'YS3CODE1' }, data: {} });
ok('youthGrantIndex: a parish’s youth code leads to that parish', (await churchForCode(root, 'youth', codeHash('YS3CODE1'))) === PARISH);
await youthGrantIndex.run({ params: { cid: 'Bad Church!', id: 'YS3CODE2' }, data: {} });
ok('   a path that is not a church: nothing indexed', (await churchForCode(root, 'youth', codeHash('YS3CODE2'))) === null);

const failed = R.filter((x) => !x).length;
console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
process.exit(failed ? 1 : 0);
