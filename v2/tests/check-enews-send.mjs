/* Sending the e-news (FINDINGS-comms C-7, C-11, C-18): who gets which
 * copy, each person's own unsubscribe link and header, once only, and the
 * web version without the members-only parts.
 *
 *   node tests/check-enews-send.mjs        (from v2/)
 *
 * Runs functions/enews-send.js's runEnewsSend against the Firestore
 * emulator in firebase.comms.json (an emulator of your own: this clears
 * it), with a pretend Resend that writes down what it was given - nothing
 * leaves the machine. Synthetic people only.
 *
 * DELIBERATE BREAKS: each loads a copy of enews-send.js with one line
 * changed (members' copy to everyone; the web version from the members'
 * copy; already-sent people sent again) and must turn a named check red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
const { initializeApp } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'app', 'index.js')).href);
const { getFirestore } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'firestore', 'index.js')).href);
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();
const MB = (() => { const module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-mailblocks.js'), 'utf8'), { module, exports: module.exports, Intl, Date }); return module.exports; })();

async function loadCopy(from, to) {
  const src = fs.readFileSync(path.join(V2, 'functions', 'enews-send.js'), 'utf8');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/enews-send.js any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-enews-send.js');
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now() + Math.random()); } finally { fs.unlinkSync(tmp); }
}

const ZOOM = 'Passcode 314159';
const ISSUE = {
  subject: 'Weekly news', template: 'classic',
  blocks: [{ type: 'header', title: 'Weekly news' }, { type: 'text', title: 'Prayer on Zoom', html: '<p>' + ZOOM + '</p>', members: true }, { type: 'text', title: 'Harvest', html: '<p>All welcome</p>' }]
};
const church = { name: 'Synthetic Green Church', email: 'office@example.invalid', address: '1 Test Lane', charityNo: '0000001' };
const copies = {
  htmlMembers: MB.render(ISSUE, { version: 'members', church, unsubscribeUrl: MB.PLACEHOLDER }),
  htmlEveryone: MB.render(ISSUE, { version: 'everyone', church, unsubscribeUrl: MB.PLACEHOLDER })
};
const SUBS = {
  s_mem: { email: 'mem.send@example.invalid', status: 'subscribed', lists: { weekly: true }, token: 'tokmem0000000000000000000000000000' },
  s_pub: { email: 'pub.send@example.invalid', status: 'subscribed', lists: { weekly: true }, token: 'tokpub0000000000000000000000000000' },
  s_spec: { email: 'spec.send@example.invalid', status: 'subscribed', lists: { weekly: false, special: true }, token: 'tokspec000000000000000000000000000' },
  s_pend: { email: 'pend.send@example.invalid', status: 'pending', lists: { weekly: true }, token: 'tokpend000000000000000000000000000' },
  s_uns: { email: 'uns.send@example.invalid', status: 'unsubscribed', lists: { weekly: false }, token: 'tokuns0000000000000000000000000000' },
  s_bnc: { email: 'bnc.send@example.invalid', status: 'bounced', lists: { weekly: false }, token: 'tokbnc0000000000000000000000000000' },
  s_team: { email: 'team.send@example.invalid', status: 'subscribed', lists: { weekly: true }, token: 'tokteam000000000000000000000000000' },
  s_old: { email: 'old.send@example.invalid', status: 'subscribed', lists: { weekly: true }, token: 'tokold0000000000000000000000000000' },
  /* A 17-year-old who got on the list before being ticked Under 18. */
  s_sev: { email: 'sev.send@example.invalid', status: 'subscribed', lists: { weekly: true }, token: 'toksev0000000000000000000000000000' }
};

async function scenario(S) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  /* clean slate */
  for (const c of ['enewsIssues', 'enewsSubscribers', 'enewsWeb', 'addressBook', 'emailOutbox']) {
    const s = await db.collection(c).get();
    for (const d of s.docs) { const k = await d.ref.collection('sends').get(); for (const x of k.docs) await x.ref.delete(); await d.ref.delete(); }
  }
  await db.collection('churchSettings').doc('details').set({ name: church.name, enquiryEmail: church.email });
  for (const [id, x] of Object.entries(SUBS)) await db.collection('enewsSubscribers').doc(id).set(x);
  await db.collection('addressBook').doc('ab_mem').set({ name: 'Mem Synthetic', email: 'MEM.send@example.invalid', churchMember: true });
  await db.collection('addressBook').doc('ab_pub').set({ name: 'Pub Synthetic', email: 'pub.send@example.invalid', churchMember: false, markers: [] });
  await db.collection('addressBook').doc('ab_team').set({ name: 'Team Synthetic', email: 'team.send@example.invalid', churchMember: false, markers: ['Welcome team'] });
  await db.collection('addressBook').doc('ab_sev').set({ name: 'Sev Synthetic', email: 'Sev.Send@example.invalid', under18: true, isMinor: false });
  await db.collection('addressBook').doc('ab_old').set({ name: 'Old Synthetic', email: 'old.send@example.invalid', churchMember: true, markers: ['Worship Team'], archived: true });
  const now = new Date('2026-10-22T15:05:00Z');                                  /* 16:05 in London */
  await db.collection('enewsIssues').doc('due').set(Object.assign({}, ISSUE, copies, { status: 'scheduled', sendAt: '2026-10-22T16:00' }));
  await db.collection('enewsIssues').doc('later').set(Object.assign({}, ISSUE, copies, { status: 'scheduled', sendAt: '2026-10-22T17:00' }));
  await db.collection('enewsIssues').doc('draft').set(Object.assign({}, ISSUE, { status: 'draft', sendAt: '2026-10-22T09:00' }));
  /* A dead timer got as far as the members' person: already sent. */
  await db.collection('enewsIssues').doc('due').collection('sends').doc('s_mem').set({ at: 'earlier', ok: true, copy: 'members' });

  const got = [];
  const send = async (m, meta) => { got.push(Object.assign({}, m, { meta })); return { ok: true }; };
  await S.runEnewsSend({ db, send, now, hub: 'https://hub.example.invalid/v2', fnBase: 'https://fn.example.invalid', gap: 0 });
  const to = got.map(g => g.to);
  t('a confirmed weekly subscriber is sent it', to.includes('pub.send@example.invalid'), to);
  t('nobody pending, unsubscribed, bounced or special-only is sent it', !to.some(e => /pend|uns|bnc|spec/.test(e)), to);
  t('someone already sent by a timer that died is not sent it again', !to.includes('mem.send@example.invalid'), to);
  const pub = got.find(g => g.to === 'pub.send@example.invalid') || {};
  t('everyone else’s copy has no members-only words', pub.html && !pub.html.includes(ZOOM) && pub.html.includes('All welcome'));
  t('their own unsubscribe link is in the email, the placeholder is gone', pub.html && pub.html.includes('https://hub.example.invalid/v2/enews-unsubscribe.html?t=tokpub') && !pub.html.includes(MB.PLACEHOLDER));
  t('the one-click header, for Gmail and Apple Mail (RFC 8058)', pub.headers && pub.headers['List-Unsubscribe'] === '<https://fn.example.invalid/enewsUnsubscribe?t=tokpub0000000000000000000000000000>' && pub.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', pub.headers);
  t('one Idempotency-Key per person per issue', pub.idempotencyKey === 'enews-due-s_pub');
  t('from the church’s name, replies to the church', pub.fromName === church.name && pub.replyTo === church.email);
  const due = (await db.collection('enewsIssues').doc('due').get()).data();
  t('the issue is marked sent, with counts', due.status === 'sent' && due.counts && due.counts.sent === 4, due.counts);
  t('never sent to a 17-year-old (ticked Under 18), even one on the list', !to.includes('sev.send@example.invalid') && due.counts && due.counts.under18 === 1, due.counts);
  t('a later issue waits', (await db.collection('enewsIssues').doc('later').get()).data().status === 'scheduled');
  t('a draft is never sent', (await db.collection('enewsIssues').doc('draft').get()).data().status === 'draft' && got.every(g => g.meta.issueId !== 'draft'));
  const web = (await db.collection('enewsWeb').doc('due').get()).data() || {};
  t('the web version has no members-only words', web.html && !web.html.includes(ZOOM) && web.html.includes('All welcome'));
  t('the web version’s "unsubscribe" leads to the sign-up page, not anyone’s link', web.html && web.html.includes('https://hub.example.invalid/v2/enews-signup.html') && !/tokpub|tokmem/.test(web.html));

  /* The members' copy goes to a member: clear the dead timer's record and send again. */
  await db.collection('enewsIssues').doc('again').set(Object.assign({}, ISSUE, copies, { status: 'scheduled', sendAt: '2026-10-22T16:00' }));
  got.length = 0;
  await S.runEnewsSend({ db, send, now, hub: 'https://hub.example.invalid/v2', fnBase: 'https://fn.example.invalid', gap: 0 });
  const mem = got.find(g => g.to === 'mem.send@example.invalid' && g.meta.issueId === 'again') || {};
  t('a church member (the address book’s tick, any capitals) gets the members’ copy', mem.html && mem.html.includes(ZOOM) && mem.meta.copy === 'members');
  const pub2 = got.find(g => g.to === 'pub.send@example.invalid' && g.meta.issueId === 'again') || {};
  t('an Attender (in the address book, no tick, no team) does not', pub2.html && !pub2.html.includes(ZOOM));
  const team = got.find(g => g.to === 'team.send@example.invalid' && g.meta.issueId === 'again') || {};
  t('someone on a team without the tick DOES (Martin, 19 Oct)', team.html && team.html.includes(ZOOM) && team.meta.copy === 'members');
  const old = got.find(g => g.to === 'old.send@example.invalid' && g.meta.issueId === 'again') || {};
  t('someone archived in the address book does not', old.html && !old.html.includes(ZOOM));
  t('a second run sends nothing more', got.every(g => g.meta.issueId === 'again'));
  got.length = 0;
  await S.runEnewsSend({ db, send, now, gap: 0 });
  t('and a third run sends nothing at all', got.length === 0, got.map(g => g.to));

  /* The pure parts. */
  t('London time decides when (sendAt as typed)', S.londonNow(new Date('2026-10-22T15:05:00Z')) === '2026-10-22T16:05' && S.londonNow(new Date('2026-12-01T09:00:00Z')) === '2026-12-01T09:00');
  t('a scheduled issue with no time is never due', !S.isDue({ status: 'scheduled', sendAt: '' }, '2026-10-22T16:05'));
  return out;
}

const R = [];
const report = (rows) => rows.forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
try { await db.collection('churchSettings').doc('ping').get(); } catch (e) { console.log('  FAIL  no Firestore emulator on ' + process.env.FIRESTORE_EMULATOR_HOST); process.exit(1); }
report(await scenario(await loadCopy()));

console.log('-- deliberate breaks --');
const BREAKS = [
  ['the members’ copy sent to everyone', "const html = String(isMember ? issue.htmlMembers : issue.htmlEveryone || '')", "const html = String(issue.htmlMembers || '')", 'everyone else’s copy has no members-only words'],
  ['the web version made from the members’ copy', "html: String(issue.htmlEveryone).split(PLACEHOLDER)", "html: String(issue.htmlMembers).split(PLACEHOLDER)", 'the web version has no members-only words'],
  ['team members left out', "(x.churchMember === true || (Array.isArray(x.markers) && x.markers.filter(Boolean).length > 0))", "(x.churchMember === true)", 'on a team without the tick DOES'],
  ['archived people let in', "return !!x && x.archived !== true &&", "return !!x &&", 'archived in the address book does not'],
  ['already-sent people sent again', "if (already.has(s.id)) { sent++; continue; }", '', 'not sent it again'],
  ['an under-18 sent the e-news', "if (minors.has(String(sub.email || '').toLowerCase())) { under18++; continue; }", '', 'never sent to a 17-year-old'],
  ['the one-click header left off', "'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'", "'X-Nothing': ''", 'the one-click header']
];
for (const [what, from, to, expect] of BREAKS) {
  let red = [];
  try { red = (await scenario(await loadCopy(from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { red = []; console.log('          ' + e.message); }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT'));
}
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
