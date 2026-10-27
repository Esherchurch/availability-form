/* "Preview web version" (functions/enews-preview.js), against an emulator
 * of your own: nothing leaves the machine.
 *
 *   node tests/check-enews-preview.mjs        (from v2/)
 *
 * Uses the Firestore emulator in firebase.comms.json (it clears what it
 * uses). The copies are made by the real egbc-mailblocks.js, as the page
 * makes them. Asks: the church office gets an unguessable link to the
 * draft's public copy, its sign-up link and "friend" filled in; the same
 * link again when pressed again, showing the draft as it is now; never a
 * copy with a members-only block or members-only words in it; never for an
 * email to members, a team or people picked, nor one already sent; nobody
 * else; once sent, the link points at the web version.
 *
 * DELIBERATE BREAKS: each loads a copy of enews-preview.js with one line
 * changed and must turn a named check red.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
process.env.FUNCTIONS_EMULATOR = 'true';
const { initializeApp } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'app', 'index.js')).href);
const { getFirestore } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'firestore', 'index.js')).href);
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();
const MB = (() => { const module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-mailblocks.js'), 'utf8'), { module, exports: module.exports, Intl, Date }); return module.exports; })();

async function loadCopy(file, from, to) {
  const src = fs.readFileSync(path.join(V2, 'functions', file), 'utf8').replace(/\r\n/g, '\n');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/' + file + ' any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-' + Math.random().toString(36).slice(2, 7) + '-' + file);
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href); } finally { fs.unlinkSync(tmp); }
}
const ZOOM = 'Meeting ID 831 2345 6789, passcode 314159';
const church = { name: 'Synthetic Green Church' };
const BLOCKS = [
  { type: 'text', title: 'Harvest supper', html: '<p>All welcome to the synthetic harvest supper on Saturday.</p>' },
  { type: 'text', title: 'Prayer on Zoom', html: '<p>Join the members prayer evening online, Thursday at eight.</p>', members: true },
  { type: 'event', title: 'Zoom coffee', html: '<p>Coffee together on Zoom, Tuesday at ten.</p>' },
  { type: 'event', title: 'Zoom chat', html: '<p>A chat on Zoom, Friday at two.</p><p><span data-members="1">Chat ID 555 0101 2020, passcode 777999</span></p>' },
  { type: 'text', title: 'Zoom details', html: '<p>' + ZOOM + '</p><p><a href="https://zoom.example.invalid/j/8312345">Join on Zoom</a></p>', members: true }
];
const copy = (issue, version) => MB.render(issue, { version, church, unsubscribeUrl: MB.PLACEHOLDER, webUrl: 'https://hub.example.invalid/v2/enews-web.html?issue=i1' });

async function scenario(U) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  for (const c of ['enewsIssues', 'enewsPreview', 'users', 'churchSettings']) for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
  await db.collection('users').doc('u_off').set({ status: 'active', teams: ['Church office'] });
  await db.collection('users').doc('u_mem').set({ status: 'active', teams: [] });
  const issue = { subject: 'Synthetic news', template: 'classic', kind: 'enews', status: 'draft', blocks: BLOCKS };
  await db.collection('enewsIssues').doc('i1').set(issue);
  const P = (uid, data) => U.runPreview({ db, uid, data, hub: 'https://hub.example.invalid/v2' });
  const pub = copy(issue, 'everyone');

  t('the everyone copy itself never has the members-only block or words (egbc-mailblocks.js)', !pub.includes('members prayer evening') && !pub.includes('314159') && !pub.includes('777999') && pub.includes('A chat on Zoom') && !pub.includes('zoom.example.invalid') && pub.includes('Coffee together on Zoom'));
  let r = await P('u_off', { issueId: 'i1', html: pub });
  const tok = r.token || '';
  t('the office gets an unguessable link to the public copy', /^[A-Za-z0-9_-]{24}$/.test(tok) && r.url === 'https://hub.example.invalid/v2/enews-web.html?preview=' + tok, r);
  let d = ((await db.collection('enewsPreview').doc(tok || 'x').get()).data()) || {};
  t('its "View this email in your browser" is the preview itself until it is sent', d.html.includes('enews-web.html?preview=' + tok) && !d.html.includes('enews-web.html?issue=i1'));
  t('kept as a preview of that issue, the sign-up link and "friend" filled in', d.preview === true && d.issueId === 'i1' && d.html.includes('https://hub.example.invalid/v2/enews-signup.html') && !d.html.includes('{{unsubscribe_url}}') && !d.sentIssueId);
  await db.collection('enewsIssues').doc('i1').update({ subject: 'Synthetic news, changed' });
  const pub2 = copy(Object.assign({}, issue, { subject: 'Synthetic news, changed', blocks: BLOCKS.concat([{ type: 'text', html: '<p>A late synthetic addition to the week.</p>' }]) }), 'everyone');
  r = await P('u_off', { issueId: 'i1', html: pub2 });
  d = ((await db.collection('enewsPreview').doc(tok || 'x').get()).data()) || {};
  t('pressed again: the same link, showing the draft as it is now', r.token === tok && d.html.includes('A late synthetic addition') && (await db.collection('enewsPreview').get()).size === 1);
  r = await P('u_off', { issueId: 'i1', html: copy(issue, 'members') });
  t('the members’ copy is refused: a members-only block', r.error === 'failed-precondition' && /members-only/.test(r.message), r);
  const wordsOnly = pub.replace('Coffee together on Zoom, Tuesday at ten.', 'Coffee together on Zoom, Tuesday at ten. ' + ZOOM);
  r = await P('u_off', { issueId: 'i1', html: wordsOnly });
  t('a copy with a members-only block’s words is refused', r.error === 'failed-precondition', r);
  r = await P('u_off', { issueId: 'i1', html: pub.replace('</body>', '<a href="https://zoom.example.invalid/j/8312345">x</a></body>') });
  t('…and so is one with a members-only link', r.error === 'failed-precondition', r);
  r = await P('u_off', { issueId: 'i1', html: pub.replace('A chat on Zoom, Friday at two.', 'A chat on Zoom, Friday at two. Chat ID 555 0101 2020, passcode 777999') });
  t('a copy with members-only WORDS from inside a card is refused', r.error === 'failed-precondition', r);
  r = await P('u_mem', { issueId: 'i1', html: pub });
  t('a church member who is not the office cannot make one', r.error === 'permission-denied');
  r = await P('', { issueId: 'i1', html: pub });
  t('nobody signed out can', r.error === 'unauthenticated');
  await db.collection('enewsIssues').doc('o1').set(Object.assign({}, issue, { kind: 'oneoff', audience: 'members' }));
  r = await P('u_off', { issueId: 'o1', html: pub });
  t('an email to church members has no public preview', r.error === 'failed-precondition' && /no public web version/.test(r.message));
  await db.collection('enewsIssues').doc('s1').set(Object.assign({}, issue, { status: 'sent' }));
  r = await P('u_off', { issueId: 's1', html: pub });
  t('an issue already sent: share its web version instead', r.error === 'failed-precondition' && /sent/.test(r.message));
  /* Sent: the link points at the web version (enews-send.js). */
  const S = await import(pathToFileURL(path.join(V2, 'functions', 'enews-send.js')).href);
  await db.collection('enewsIssues').doc('i1').update({ status: 'scheduled', sendAt: '2026-10-22T16:00', htmlMembers: copy(issue, 'members'), htmlEveryone: pub });
  await S.runEnewsSend({ db, send: async () => ({ ok: true }), now: new Date('2026-10-22T15:05:00Z'), gap: 0 });
  d = ((await db.collection('enewsPreview').doc(tok || 'x').get()).data()) || {};
  t('once sent, the preview link points at the web version', d.sentIssueId === 'i1' && d.preview === false && !d.html, d);
  return out;
}

const R = [];
(await scenario(await loadCopy('enews-preview.js'))).forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
console.log('-- deliberate breaks --');
const BREAKS = [
  ['members-only blocks let through', '  if (bad.length) return', '  if (false) return', 'members’ copy is refused'],
  ['members-only words let through', "    if (bits.some(w => text.includes(w)) ||", "    if (false && bits.some(w => text.includes(w)) ||", 'members-only WORDS'],
  ['an email to members previewed', "  if (x.kind === 'oneoff' && (x.audience || 'subscribers') !== 'subscribers') return", '  if (false) return', 'no public preview'],
  ['anyone may make one', '  if (!(await isOffice(db, p))) return', '  if (false) return', 'not the office']
];
for (const [what, from, to, expect] of BREAKS) {
  let red = [];
  try { red = (await scenario(await loadCopy('enews-preview.js', from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { red = ['(threw) ' + e.message]; }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT ' + JSON.stringify(red)));
}
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
