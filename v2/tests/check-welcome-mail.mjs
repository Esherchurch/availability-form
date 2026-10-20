/* The two welcome emails the hub sends by itself (functions/welcome-mail.js),
 * against an emulator of your own, with a pretend sender that writes down
 * what it was given: nothing leaves the machine.
 *
 *   node tests/check-welcome-mail.mjs        (from v2/)
 *
 * Uses the Firestore emulator in firebase.comms.json (it clears what it
 * uses). Asks:
 *   New subscriber welcome - sent when a sign-up is confirmed by email, with
 *   their first name, their own unsubscribe link and the one-click header;
 *   not when it is switched off, not while the words are unfinished, not
 *   for any other change (the office's edits, an unsubscribe), not twice,
 *   never to an under-18.
 *   Newcomer welcome (reviewing window, 21 Oct) - only to the address the
 *   person gave, to nobody else; never an under-18; a welcome, never a care
 *   referral: their message and phone number are never in it, nothing is
 *   written to the hello or to any care, pastoral or safeguarding record;
 *   nothing when no address was given, when "I'm new here" is off, when
 *   switched off; once.
 *
 * DELIBERATE BREAKS: each loads a copy of welcome-mail.js with one line
 * changed and must turn a named check red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
process.env.FUNCTIONS_EMULATOR = 'true';   /* the e-news gate: open on an emulator */
const { initializeApp } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'app', 'index.js')).href);
const { getFirestore } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'firestore', 'index.js')).href);
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

async function loadCopy(from, to) {
  const src = fs.readFileSync(path.join(V2, 'functions', 'welcome-mail.js'), 'utf8').replace(/\r\n/g, '\n');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/welcome-mail.js any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-welcome-mail.js');
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now() + Math.random()); } finally { fs.unlinkSync(tmp); }
}
const CARE = ['careRouting', 'worries', 'prayers', 'pastoralNotes', 'careNotes', 'safeguardingConcerns', 'concerns'];
const snapshot = async () => { const o = {}; for (const c of CARE.concat(['welcomes'])) o[c] = JSON.stringify((await db.collection(c).get()).docs.map(d => [d.id, d.data()])); return o; };

async function scenario(U) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  for (const c of ['enewsSettings', 'enewsIssues', 'welcomeSent', 'addressBook', 'churchSettings', 'welcomes', 'enewsSubscribers'].concat(CARE)) for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
  await db.collection('churchSettings').doc('details').set({ name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid' });
  await db.collection('churchSettings').doc('features').set({ newHere: true });
  await db.collection('addressBook').doc('kid').set({ name: 'Kit Young', email: 'kit.w@example.invalid', under18: true });
  await db.collection('careRouting').doc('status').set({ leadSet: true });
  const WORDS = '<p>Dear {{first_name}},</p><p>Welcome!</p><a href="{{unsubscribe_url}}">Unsubscribe</a>';
  await db.collection('enewsIssues').doc('auto_subscriber').set({ subject: 'Welcome, {{first_name}}', kind: 'oneoff', status: 'draft', blocks: [], htmlEveryone: WORDS, htmlMembers: '' });
  await db.collection('enewsIssues').doc('auto_newcomer').set({ subject: 'Lovely to meet you', kind: 'oneoff', status: 'draft', blocks: [], htmlEveryone: WORDS, htmlMembers: '' });
  const got = [];
  const send = async (m, meta) => { got.push(Object.assign({}, m, { meta })); return { ok: true }; };
  const sub = (o) => Object.assign({ email: 'sam.w@example.invalid', firstName: 'Sam', token: 'tok123', status: 'subscribed', consent: { how: 'web form (confirmed by email)' }, lists: { weekly: true } }, o);
  const S = (id, before, after) => U.runSubscriberWelcome({ db, send, id, before, after });
  const N = (id, hello) => U.runNewcomerWelcome({ db, send, id, hello });

  /* Switched off: nothing. */
  await S('s1', { status: 'pending' }, sub());
  await N('h0', { name: 'Nia New', email: 'nia.w@example.invalid', message: 'x', phone: '', contactMe: false });
  t('switched off: neither is sent', got.length === 0, got.map(g => g.to));
  await db.collection('enewsSettings').doc('welcomes').set({ subscriber: true, newcomer: true });

  /* New subscriber welcome. */
  await S('s1', { status: 'pending' }, sub());
  const w = got[0] || {};
  t('a confirmed sign-up gets the welcome, with their first name', got.length === 1 && w.to === 'sam.w@example.invalid' && /Dear Sam,/.test(w.html) && w.subject === 'Welcome, Sam', got.map(g => g.to));
  t('…with their own unsubscribe link and the one-click header', /enews-unsubscribe\.html\?t=tok123/.test(w.html || '') && (w.headers || {})['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
  t('…from the church, replies to the church', w.fromName === 'Synthetic Green Church' && w.replyTo === 'office@example.invalid' && (w.meta || {}).kind === 'subscriber welcome');
  await S('s1', { status: 'pending' }, sub());
  t('the same confirmation again: not sent twice', got.length === 1);
  await S('s2', { status: 'subscribed' }, sub({ email: 'sue.w@example.invalid', firstName: 'Sue' }));
  t('the office editing a subscriber: no welcome', got.length === 1);
  await S('s3', { status: 'pending' }, sub({ email: 'tim.w@example.invalid', status: 'unsubscribed' }));
  t('an unsubscribe: no welcome', got.length === 1);
  await S('s4', { status: 'pending' }, sub({ email: 'ola.w@example.invalid', consent: { how: 'added by the office' } }));
  t('added by the office, not confirmed by email: no welcome', got.length === 1);
  await S('s5', { status: 'pending' }, sub({ email: 'kit.w@example.invalid', firstName: 'Kit' }));
  t('a subscriber who is under 18: never', got.length === 1);
  await db.collection('enewsIssues').doc('auto_subscriber').update({ htmlEveryone: '' });
  await S('s6', { status: 'pending' }, sub({ email: 'una.w@example.invalid' }));
  t('the words unfinished: nothing sent', got.length === 1);
  await db.collection('enewsIssues').doc('auto_subscriber').update({ htmlEveryone: WORDS });

  /* Newcomer welcome. */
  got.length = 0;
  const before = await snapshot();
  const SECRET = 'Worry4417private';
  await db.collection('welcomes').doc('h1').set({ name: 'Nia New', email: 'Nia.W@example.invalid', phone: '07700 900123', message: SECRET, contactMe: true, status: 'new' });
  await N('h1', { name: 'Nia New', email: 'Nia.W@example.invalid', phone: '07700 900123', message: SECRET, contactMe: true, uid: '', status: 'new' });
  const n = got[0] || {};
  t('a hello with an address: the welcome goes to that address only', got.length === 1 && n.to === 'nia.w@example.invalid' && /Dear Nia,/.test(n.html || ''), got.map(g => g.to));
  t('nobody else is sent it, and no copy', got.every(g => g.to === 'nia.w@example.invalid') && !n.cc && !n.bcc);
  t('a welcome, never a referral: their message and phone number are not in it', !JSON.stringify(n).includes(SECRET) && !JSON.stringify(n).includes('900123'));
  t('…and nothing is written to the hello or to any care, pastoral or safeguarding record', JSON.stringify(await snapshot()) === JSON.stringify(Object.assign({}, before, { welcomes: (await snapshot()).welcomes })) && JSON.stringify((await db.collection('welcomes').doc('h1').get()).data()) === JSON.stringify({ name: 'Nia New', email: 'Nia.W@example.invalid', phone: '07700 900123', message: SECRET, contactMe: true, status: 'new' }));
  t('…no unsubscribe token (not a subscriber): a "leave me out" email to the church', /mailto:office@example\.invalid\?subject=/.test(n.html || '') && (n.meta || {}).kind === 'newcomer welcome');
  await N('h1', { name: 'Nia New', email: 'nia.w@example.invalid', message: '', phone: '', contactMe: false });
  t('the same hello again: once', got.length === 1);
  await N('h2', { name: 'Pat Phone', email: '', phone: '07700 900456', message: '', contactMe: true });
  t('no address given: nothing (never to a number or anyone else)', got.length === 1);
  await N('h3', { name: 'Kit Young', email: 'kit.w@example.invalid', message: '', phone: '', contactMe: false });
  t('an under-18: never', got.length === 1);
  await db.collection('churchSettings').doc('features').set({ newHere: false });
  await N('h4', { name: 'Ann Other', email: 'ann.w@example.invalid', message: '', phone: '', contactMe: false });
  t('"I’m new here" switched off: nothing', got.length === 1);
  await db.collection('churchSettings').doc('features').set({ newHere: true });
  await db.collection('enewsSettings').doc('welcomes').set({ subscriber: true, newcomer: false });
  await N('h5', { name: 'Ann Other', email: 'ann.w@example.invalid', message: '', phone: '', contactMe: false });
  t('the newcomer welcome switched off: nothing', got.length === 1);
  return out;
}

const R = [];
(await scenario(await loadCopy())).forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
console.log('-- deliberate breaks --');
const BREAKS = [
  ['the message put in the welcome', "firstName: String(hello.name || '').trim().split(/\\s+/)[0], token: '' }", "firstName: String(hello.message || hello.name || ''), token: '' }", 'never a referral'],
  ['a copy to the church', "Object.assign(letter, { fromName: church.name || '', replyTo: church.enquiryEmail || '' })", "Object.assign(letter, { fromName: church.name || '', replyTo: church.enquiryEmail || '', cc: church.enquiryEmail })", 'no copy'],
  ['an under-18 welcomed', "if ((await under18Emails(db)).has(person.email)) return { skipped: 'under 18' };", '', 'under 18'],
  ['sent twice', "if (!(await once(db, kind + '_' + ref))) return { skipped: 'already sent' };", '', 'not sent twice'],
  ['every change to a subscriber welcomed', "if (!after || after.status !== 'subscribed' || (before && before.status === 'subscribed')) return { skipped: 'not a new subscriber' };", "if (!after || after.status !== 'subscribed') return { skipped: 'not a new subscriber' };", 'office editing'],
  ['sent though switched off', "if (!(set.exists && set.data()[kind] === true)) return { skipped: 'switched off' };", '', 'switched off']
];
for (const [what, from, to, expect] of BREAKS) {
  let red = [];
  try { red = (await scenario(await loadCopy(from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { red = ['(threw) ' + e.message]; }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT ' + JSON.stringify(red)));
}
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
