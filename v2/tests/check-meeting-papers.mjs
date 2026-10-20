/* A members' meeting's papers for members without a hub account
 * (functions/meeting-papers.js), against an emulator of your own and a
 * pretend Storage bucket: nothing leaves the machine.
 *
 *   node tests/check-meeting-papers.mjs        (from v2/)
 *
 * Uses the Firestore emulator in firebase.comms.json (it clears what it
 * uses). Asks: a member's own link (made as the sender makes it) opens a
 * page listing the meeting's papers, with no Storage address in it; each
 * paper comes from Storage with its own type and name; a member with an
 * account gets no token; refused: an unknown or malformed link, one 30
 * days after the meeting, someone no longer a church member (untick,
 * archived, under 18), a meeting taken away, a paper number not there, and
 * a paper stored outside that meeting's folder.
 *
 * DELIBERATE BREAKS: each loads a copy of meeting-papers.js with one line
 * changed and must turn a named check red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
const { initializeApp } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'app', 'index.js')).href);
const { getFirestore } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'firestore', 'index.js')).href);
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

async function loadCopy(from, to) {
  const src = fs.readFileSync(path.join(V2, 'functions', 'meeting-papers.js'), 'utf8').replace(/\r\n/g, '\n');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/meeting-papers.js any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-meeting-papers.js');
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now() + Math.random()); } finally { fs.unlinkSync(tmp); }
}

/* The pretend bucket: two files, in their meetings' folders. */
const PDF = Buffer.from('%PDF-1.4 synthetic agenda');
const FILES = { 'churchMeetings/cm1/papers/1-Agenda.pdf': { buf: PDF, type: 'application/pdf' }, 'churchMeetings/other/papers/9-Secret.pdf': { buf: Buffer.from('%PDF other'), type: 'application/pdf' } };
const bucket = { file: p => ({ getMetadata: async () => { if (!FILES[p]) throw new Error('No such object'); return [{ contentType: FILES[p].type }]; }, download: async () => [FILES[p].buf] }) };
const NOW = Date.parse('2026-10-22T15:00:00Z');

async function scenario(U) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  for (const c of ['addressBook', 'users', 'churchMeetings', 'meetingPaperLinks', 'churchSettings']) for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
  await db.collection('churchSettings').doc('details').set({ name: 'Synthetic Green Church' });
  await db.collection('addressBook').doc('a1').set({ name: 'Ada Noaccount', email: 'ada.mp@example.invalid', churchMember: true });
  await db.collection('addressBook').doc('a2').set({ name: 'Bea Account', email: 'bea.mp@example.invalid', churchMember: true });
  await db.collection('users').doc('u_bea').set({ memberId: 'a2', email: 'bea.mp@example.invalid', status: 'active' });
  await db.collection('churchMeetings').doc('cm1').set({ title: 'Church members’ meeting', date: '2026-11-08', time: '19:30', place: 'Synthetic church hall',
    papers: [{ name: 'Agenda.pdf', path: 'churchMeetings/cm1/papers/1-Agenda.pdf' }, { name: 'Sneaky.pdf', path: 'churchMeetings/other/papers/9-Secret.pdf' }, { name: 'Up.pdf', path: 'churchMeetings/cm1/papers/../../other/papers/9-Secret.pdf' }] });
  const ISSUE = { blocks: [{ type: 'button', url: 'https://hub.example.invalid/v2/church-meeting.html?meeting=cm1' }] };
  const HTML = '<a href="https://hub.example.invalid/v2/church-meeting.html?meeting=cm1" target="_blank">See the agenda and minutes</a>';
  /* Made as the sender makes it. */
  const links = await U.paperLinksFor(db, ISSUE, NOW);
  const adaHtml = await U.personalise(db, links, { id: 'ab_a1', email: 'ada.mp@example.invalid', member: true }, HTML, { fnBase: 'https://fn.example.invalid' });
  const beaHtml = await U.personalise(db, links, { id: 'ab_a2', email: 'bea.mp@example.invalid', member: true }, HTML, { fnBase: 'https://fn.example.invalid' });
  const tok = (/meetingPapers\?t=([A-Za-z0-9_-]+)/.exec(adaHtml) || [])[1] || '';
  t('a member with no account: their own link', !!tok && !adaHtml.includes('church-meeting.html'), adaHtml);
  t('a member with an account: no token, the hub’s page', beaHtml === HTML && (await db.collection('meetingPaperLinks').get()).size === 1);
  const P = (q, now = NOW) => U.runPapers({ db, bucket, query: q, now });

  let r = await P({ t: tok });
  t('the link opens a page of the meeting’s papers', r.status === 200 && /Agenda\.pdf/.test(r.body) && /Synthetic Green Church/.test(r.body) && /Sunday 8 November 2026, 19:30/.test(r.body) && /Synthetic church hall/.test(r.body), String(r.body).slice(0, 300));
  t('no Storage address on the page, and a "keep out" for search engines', !/churchMeetings\//.test(r.body) && /noindex/.test(r.body));
  r = await P({ t: tok, f: '0' });
  t('a paper comes from Storage, with its own type and name', r.status === 200 && r.type === 'application/pdf' && Buffer.compare(r.body, PDF) === 0 && r.filename === 'Agenda.pdf', [r.status, r.type, r.filename]);
  r = await P({ t: tok, f: '7' });
  t('a paper number not there: refused', r.status === 404);
  r = await P({ t: tok, f: '1' });
  t('a paper stored in another meeting’s folder: refused', r.status === 404 && !Buffer.isBuffer(r.body));
  r = await P({ t: tok, f: '2' });
  t('a path climbing out of the folder: refused', r.status === 404 && !Buffer.isBuffer(r.body));
  r = await P({ t: 'x'.repeat(32) });
  t('an unknown link: refused', r.status === 404);
  r = await P({ t: '<script>' });
  t('a malformed link: refused', r.status === 404 && !/<script>/.test(r.body));
  r = await P({ t: tok }, Date.parse('2026-12-08T12:00:00Z') + 86400000);
  t('30 days after the meeting: expired', r.status === 410 && /expired/.test(r.body));
  r = await P({ t: tok }, Date.parse('2026-12-08T12:00:00Z'));
  t('…but not a day before', r.status === 200);
  await db.collection('addressBook').doc('a1').update({ churchMember: false });
  r = await P({ t: tok });
  t('no longer a church member: refused', r.status === 403);
  await db.collection('addressBook').doc('a1').update({ churchMember: true, archived: true });
  r = await P({ t: tok });
  t('archived: refused', r.status === 403);
  await db.collection('addressBook').doc('a1').update({ archived: false, under18: true });
  r = await P({ t: tok });
  t('under 18: refused', r.status === 403);
  await db.collection('addressBook').doc('a1').update({ under18: false });
  await db.collection('churchMeetings').doc('cm1').update({ papers: [] });
  r = await P({ t: tok });
  t('no papers yet: it says so, and when the link ends', r.status === 200 && /No papers yet/.test(r.body) && /8 December/.test(r.body), String(r.body).slice(-300));
  await db.collection('churchMeetings').doc('cm1').delete();
  r = await P({ t: tok });
  t('a meeting taken away: refused', r.status === 404);
  return out;
}

const R = [];
(await scenario(await loadCopy())).forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
console.log('-- deliberate breaks --');
const BREAKS = [
  ['links that never expire', "if (!(now <= (+L.expires || 0))) return", 'if (false) return', 'expired'],
  ['anyone with a link, member or not', "if (!p.exists || P.churchMember !== true || P.archived === true || ", 'if (false && ', 'no longer a church member'],
  ['papers from any folder', "!String(pp.path || '').startsWith(prefix) || ", '', 'another meeting'],
  ['account holders given tokens too', 'if (!links || !person.member || links.hasAccount(person)) return html;', 'if (!links || !person.member) return html;', 'with an account']
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
