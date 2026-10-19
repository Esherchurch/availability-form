/* The e-news's rules: only the church office and master admins see or
 * write issues and settings; a sent issue is the record and never
 * changes (FINDINGS-comms; firestore.rules "THE E-NEWS").
 *
 *   node tests/check-enews-rules.mjs                 (from v2/)
 *   EGBC_FIREBASE_CONFIG=firebase.comms.json node tests/check-enews-rules.mjs
 *
 * LOADS firestore.rules INTO THE EMULATOR IT TALKS TO, as
 * firestore-rules.test.mjs does - so point it at an emulator of your own
 * (the config's Firestore port), never one another window is using.
 *
 * Then THE DELIBERATE BREAKS: each loads a copy of the rules with one line
 * loosened and must see a named check go red. The real rules are loaded
 * again at the end. Synthetic people only.
 */
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const cfg = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.json', 'utf8'));
const PORT = cfg?.emulators?.firestore?.port ?? 8080;
const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const RULES = fs.readFileSync('firestore.rules', 'utf8');

const PEOPLE = {
  master: { uid: 'en_master', teams: [], masterAdmin: true },
  office: { uid: 'en_office', teams: ['Church office'], masterAdmin: false },
  admin:  { uid: 'en_admin', teams: ['Kids Church'], adminFor: ['Kids Church'], masterAdmin: false },
  member: { uid: 'en_member', teams: [], masterAdmin: false, churchMember: true, attender: true },
  worship:{ uid: 'en_worship', teams: ['Worship Team'], masterAdmin: false }
};
const issue = (uid, o) => Object.assign({ subject: 'Weekly news', preheader: '', template: 'classic', blocks: [{ type: 'text', html: '<p>Hi</p>' }],
  status: 'draft', sendAt: '', createdAt: '2026-10-19T10:00:00Z', createdBy: uid, updatedAt: '2026-10-19T10:00:00Z', updatedBy: uid }, o);

async function run(rules) {
  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules, host: '127.0.0.1', port: PORT } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const p of Object.values(PEOPLE)) {
      await setDoc(doc(db, 'users', p.uid), { memberId: 'm_' + p.uid, name: p.uid, teams: p.teams, adminFor: p.adminFor || [], masterAdmin: p.masterAdmin,
        attender: p.attender === true, churchMember: p.churchMember === true, status: 'active' });
    }
    await setDoc(doc(db, 'enewsIssues', 'sent1'), issue('en_office', { status: 'sent' }));
    await setDoc(doc(db, 'enewsIssues', 'draft1'), issue('en_office'));
    await setDoc(doc(db, 'enewsSubscribers', 's1'), { email: 'sub@example.invalid', status: 'subscribed', token: 'x'.repeat(32) });
    await setDoc(doc(db, 'enewsSettings', 'main'), { template: 'classic', colours: {}, church: {}, updatedAt: 'x', updatedBy: 'en_office' });
  });
  const as = w => env.authenticatedContext(PEOPLE[w].uid).firestore();
  const anon = env.unauthenticatedContext().firestore();
  const R = [];
  const t = async (n, p) => { try { await p; R.push({ n, v: true }); } catch (e) { R.push({ n, v: false, x: e.message }); } };

  await t('office can draft an e-news', assertSucceeds(setDoc(doc(as('office'), 'enewsIssues', 'o1'), issue('en_office'))));
  await t('master admin can draft an e-news', assertSucceeds(setDoc(doc(as('master'), 'enewsIssues', 'm1'), issue('en_master'))));
  await t('office can read the list', assertSucceeds(getDocs(collection(as('office'), 'enewsIssues'))));
  await t('an admin of a team who is not the office cannot read issues', assertFails(getDocs(collection(as('admin'), 'enewsIssues'))));
  await t('a church member cannot read an issue', assertFails(getDoc(doc(as('member'), 'enewsIssues', 'draft1'))));
  await t('a worship team member cannot write one', assertFails(setDoc(doc(as('worship'), 'enewsIssues', 'w1'), issue('en_worship'))));
  await t('nobody signed out reads issues', assertFails(getDoc(doc(anon, 'enewsIssues', 'draft1'))));
  await t('the office cannot mark an issue sent (only the server does)', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'o2'), issue('en_office', { status: 'sent' }))));
  await t('a sent issue cannot be changed', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'sent1'), issue('en_office', { subject: 'Changed' }))));
  await t('a sent issue cannot be deleted', assertFails(deleteDoc(doc(as('master'), 'enewsIssues', 'sent1'))));
  await t('a draft can be deleted by the office', assertSucceeds(deleteDoc(doc(as('office'), 'enewsIssues', 'draft1'))));
  await t('an issue cannot carry extra fields', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'o3'), issue('en_office', { recipients: ['x@example.invalid'] }))));
  await t('nobody writes as somebody else', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'o4'), issue('en_master'))));
  await t('office can save the look and footer', assertSucceeds(setDoc(doc(as('office'), 'enewsSettings', 'main'), { template: 'green', colours: { bar: '#123456' }, church: { address: '1 Test Lane' }, updatedAt: 'x', updatedBy: 'en_office' })));
  await t('a church member cannot change the look', assertFails(setDoc(doc(as('member'), 'enewsSettings', 'main'), { template: 'green', colours: {}, church: {}, updatedAt: 'x', updatedBy: 'en_member' })));
  await t('settings only take the known footer fields', assertFails(setDoc(doc(as('office'), 'enewsSettings', 'main'), { template: 'green', colours: {}, church: { apiKey: 'x' }, updatedAt: 'x', updatedBy: 'en_office' })));
  await t('office can read the subscriber list', assertSucceeds(getDocs(collection(as('office'), 'enewsSubscribers'))));
  await t('a church member cannot read subscribers', assertFails(getDoc(doc(as('member'), 'enewsSubscribers', 's1'))));
  await t('nobody signed out reads subscribers', assertFails(getDoc(doc(anon, 'enewsSubscribers', 's1'))));
  await t('not even the office writes a subscriber from a page (functions only)', assertFails(setDoc(doc(as('office'), 'enewsSubscribers', 's2'), { email: 'x@example.invalid', status: 'subscribed' })));
  await t('nobody signed out can add themselves directly', assertFails(setDoc(doc(anon, 'enewsSubscribers', 's3'), { email: 'x@example.invalid', status: 'pending' })));
  await t('Resend receipts are the server’s alone', assertFails(getDocs(collection(as('master'), 'hqMailEvents'))));
  await env.cleanup();
  return R;
}

const report = R => R.forEach(r => console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v ? '' : '\n          ' + String(r.x || '').slice(0, 200))));
const R = await run(RULES);
report(R);

const BREAKS = [
  ['the office may write subscribers from a page', 'allow write: if false;          // subscribers: functions only', 'allow write: if enewsOffice(); // subscribers: functions only', 'not even the office writes'],
  ['church members may read subscribers', 'allow read: if enewsOffice();   // subscribers: the office', 'allow read: if active();        // subscribers: the office', 'a church member cannot read subscribers'],
  ['any admin may read issues', 'function enewsOffice() { return isMaster() || onTeam(\'Church office\'); }', 'function enewsOffice() { return isMaster() || onTeam(\'Church office\') || isAdmin(); }', 'an admin of a team'],
  ['a sent issue may be changed', "&& resource.data.status in ['draft', 'scheduled']", '', 'a sent issue cannot be changed'],
  ['the office may mark an issue sent', "&& d.status in ['draft', 'scheduled']", "&& d.status in ['draft', 'scheduled', 'sent']", 'the office cannot mark an issue sent'],
  ['a recipients list allowed on an issue', "'blocks', 'status', 'sendAt',", "'blocks', 'status', 'sendAt', 'recipients',", 'extra fields']
];
let caught = 0;
for (const [what, from, to, expect] of BREAKS) {
  if (!RULES.includes(from)) { console.log('  FAIL  break "' + what + '": that line is not in firestore.rules any more - update the break'); R.push({ v: false }); continue; }
  const red = (await run(RULES.replace(from, to))).filter(r => !r.v).map(r => r.n);
  const hit = red.some(n => n.includes(expect));
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '  (red: ' + red.filter(n => n.includes(expect)).join('; ') + ')' : '  - NOTHING CAUGHT IT'));
  if (hit) caught++; else R.push({ v: false });
}
/* Leave the real rules in the emulator. */
const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: RULES, host: '127.0.0.1', port: PORT } });
await env.cleanup();
const fails = R.filter(r => !r.v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' checks, ' + caught + '/' + BREAKS.length + ' breaks caught');
process.exit(fails ? 1 : 0);
