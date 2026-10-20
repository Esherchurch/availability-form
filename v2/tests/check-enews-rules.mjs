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
    await setDoc(doc(db, 'integrationSecrets', 'canva'), { access: 'x', refresh: 'y' });
    await setDoc(doc(db, 'enewsWeb', 'w1'), { subject: 'Weekly news', html: '<p>Hi</p>', sentAt: 'x' });
    await setDoc(doc(db, 'enewsIssues', 'sent1', 'sends', 'a'), { ok: true });
    await setDoc(doc(db, 'enewsSubscribers', 's1'), { email: 'sub@example.invalid', status: 'subscribed', token: 'x'.repeat(32) });
    /* Under 18 (C-36): a 16-year-old and an under-16, both on Kids Church. */
    await setDoc(doc(db, 'addressBook', 'ab_teen'), { name: 'Teen Synthetic', email: 'teen@example.invalid', markers: ['Kids Church'], isMinor: false });
    await setDoc(doc(db, 'addressBook', 'ab_kid'), { name: 'Kid Synthetic', email: '', markers: ['Kids Church'], isMinor: true });
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
  await t('scheduling needs both finished copies', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'o5'), issue('en_office', { status: 'scheduled', sendAt: '2026-10-22T16:00' }))));
  await t('scheduled with both copies is fine', assertSucceeds(setDoc(doc(as('office'), 'enewsIssues', 'o6'), issue('en_office', { status: 'scheduled', sendAt: '2026-10-22T16:00', htmlMembers: '<p>m</p>', htmlEveryone: '<p>e</p>' }))));
  await t('anyone can read the web version (no sign-in)', assertSucceeds(getDoc(doc(anon, 'enewsWeb', 'w1'))));
  await t('nobody writes the web version from a page', assertFails(setDoc(doc(as('master'), 'enewsWeb', 'w2'), { subject: 'x', html: 'x', sentAt: 'x' })));
  await t('the office can see who an issue went to', assertSucceeds(getDocs(collection(as('office'), 'enewsIssues', 'sent1', 'sends'))));
  await t('a church member cannot', assertFails(getDocs(collection(as('member'), 'enewsIssues', 'sent1', 'sends'))));
  await t('Canva’s tokens: not even a master admin reads them from a page', assertFails(getDoc(doc(as('master'), 'integrationSecrets', 'canva'))));
  await t('Canva’s tokens: nobody writes them from a page', assertFails(setDoc(doc(as('office'), 'integrationSecrets', 'canva'), { access: 'mine' })));
  await t('office can read the subscriber list', assertSucceeds(getDocs(collection(as('office'), 'enewsSubscribers'))));
  await t('a church member cannot read subscribers', assertFails(getDoc(doc(as('member'), 'enewsSubscribers', 's1'))));
  await t('nobody signed out reads subscribers', assertFails(getDoc(doc(anon, 'enewsSubscribers', 's1'))));
  await t('not even the office writes a subscriber from a page (functions only)', assertFails(setDoc(doc(as('office'), 'enewsSubscribers', 's2'), { email: 'x@example.invalid', status: 'subscribed' })));
  await t('nobody signed out can add themselves directly', assertFails(setDoc(doc(anon, 'enewsSubscribers', 's3'), { email: 'x@example.invalid', status: 'pending' })));
  await t('Resend receipts are the server’s alone', assertFails(getDocs(collection(as('master'), 'hqMailEvents'))));
  /* The footer's social links and diary button (stage 1, plan B5). */
  const look = (church) => ({ template: 'classic', colours: {}, church, updatedAt: 'x', updatedBy: 'en_office' });
  await t('office can save social links and the diary button', assertSucceeds(setDoc(doc(as('office'), 'enewsSettings', 'main'), look({ diaryButton: true, social: [{ kind: 'facebook', url: 'https://facebook.com/x' }] }))));
  await t('no more than 12 social links', assertFails(setDoc(doc(as('office'), 'enewsSettings', 'main'), look({ social: Array.from({ length: 13 }, (_, i) => ({ kind: 'website', url: 'https://x.invalid/' + i })) }))));
  await t('the diary button is yes or no', assertFails(setDoc(doc(as('office'), 'enewsSettings', 'main'), look({ diaryButton: 'https://evil.invalid' }))));
  /* Social posts (plan H): the office's alone. */
  const post = (o) => Object.assign({ date: '2026-10-27', kind: 'countdown', eventId: 'e1', title: 'Film club', opening: 'TOMORROW!', caption: 'TOMORROW!', status: 'ready', mode: 'event', size: 'portrait', createdBy: 'en_office', createdAt: 'x' }, o);
  await t('office can save a countdown’s post', assertSucceeds(setDoc(doc(as('office'), 'socialPosts', 'p1'), post())));
  await t('a church member cannot read the posts', assertFails(getDocs(collection(as('member'), 'socialPosts'))));
  await t('a post cannot carry other things', assertFails(setDoc(doc(as('office'), 'socialPosts', 'p2'), post({ recipients: ['x'] }))));
  await t('the office can save the hashtags and the verse of the day', assertSucceeds(setDoc(doc(as('office'), 'socialSettings', 'main'), { usual: '#esherchurch', sets: {}, vod: { on: true }, remind: ['en_office'], updatedAt: 'x', updatedBy: 'en_office' })));
  await t('a church member cannot change them', assertFails(setDoc(doc(as('member'), 'socialSettings', 'main'), { usual: '#x', updatedAt: 'x', updatedBy: 'en_member' })));
  /* One-off emails and templates (plan F and G). */
  await t('office can save a one-off email to a team', assertSucceeds(setDoc(doc(as('office'), 'enewsIssues', 'one1'), issue('en_office', { kind: 'oneoff', audience: 'team', team: 'Welcome team', picked: [], templateId: 'invite' }))));
  await t('office can save one to people picked', assertSucceeds(setDoc(doc(as('office'), 'enewsIssues', 'one2'), issue('en_office', { kind: 'oneoff', audience: 'picked', picked: ['p1', 'p2'] }))));
  await t('an email goes only to a known kind of audience', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'one3'), issue('en_office', { kind: 'oneoff', audience: 'everyone@example.invalid' }))));
  await t('picked is a list of people, never one string', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'one4'), issue('en_office', { kind: 'oneoff', audience: 'picked', picked: 'p1,p2' }))));
  await t('no more than 300 picked', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'one5'), issue('en_office', { kind: 'oneoff', audience: 'picked', picked: Array.from({ length: 301 }, (_, i) => 'p' + i) }))));
  await t('the kind is an e-news or a one-off email', assertFails(setDoc(doc(as('office'), 'enewsIssues', 'one6'), issue('en_office', { kind: 'bulk' }))));
  const tpl = (o) => Object.assign({ name: 'Our letter', about: '', group: 'Ours', subject: 'A letter', preheader: '', template: 'classic', audience: 'subscribers', blocks: [{ type: 'text', html: '<p>Hi</p>' }], archived: false, createdAt: 'x', createdBy: 'en_office', updatedAt: 'x', updatedBy: 'en_office' }, o);
  await t('office can save a template', assertSucceeds(setDoc(doc(as('office'), 'emailTemplates', 't1'), tpl())));
  await t('office can read the templates', assertSucceeds(getDocs(collection(as('office'), 'emailTemplates'))));
  await t('a church member cannot read the templates', assertFails(getDocs(collection(as('member'), 'emailTemplates'))));
  await t('a church member cannot save one', assertFails(setDoc(doc(as('member'), 'emailTemplates', 't2'), tpl({ updatedBy: 'en_member' }))));
  await t('a template cannot carry other things', assertFails(setDoc(doc(as('office'), 'emailTemplates', 't3'), tpl({ recipients: ['x@example.invalid'] }))));
  await t('a template needs a name', assertFails(setDoc(doc(as('office'), 'emailTemplates', 't4'), tpl({ name: '' }))));
  await t('a template is saved as yourself', assertFails(setDoc(doc(as('office'), 'emailTemplates', 't5'), tpl({ updatedBy: 'en_master' }))));
  await t('the Unsplash cache is the server’s: not even a master admin reads it', assertFails(getDoc(doc(as('master'), 'unsplashCache', '_hour'))));
  await t('nobody writes the Unsplash cache from a page', assertFails(setDoc(doc(as('office'), 'unsplashCache', '_hour'), { hour: 'x', used: 0 })));
  await t('a member’s link to the papers is the server’s: not even a master admin reads them', assertFails(getDocs(collection(as('master'), 'meetingPaperLinks'))));
  await t('nobody makes a link to the papers from a page', assertFails(setDoc(doc(as('office'), 'meetingPaperLinks', 'x'), { meetingId: 'm', personId: 'p', expires: 1 })));
  /* The welcome emails' switches (plan G). */
  const welc = (o) => Object.assign({ subscriber: true, newcomer: false, updatedAt: 'x', updatedBy: 'en_office' }, o);
  await t('the office can switch the welcome emails on and off', assertSucceeds(setDoc(doc(as('office'), 'enewsSettings', 'welcomes'), welc())));
  await t('a church member cannot switch the welcome emails', assertFails(setDoc(doc(as('member'), 'enewsSettings', 'welcomes'), welc({ updatedBy: 'en_member' }))));
  await t('a welcome switch is yes or no, nothing else', assertFails(setDoc(doc(as('office'), 'enewsSettings', 'welcomes'), welc({ newcomer: 'everyone@example.invalid' }))));
  await t('the welcome switches carry nothing else (no extra recipients)', assertFails(setDoc(doc(as('office'), 'enewsSettings', 'welcomes'), welc({ cc: 'x@example.invalid' }))));
  await t('who has had a welcome is the server’s alone', assertFails(getDocs(collection(as('master'), 'welcomeSent'))));
  /* Under 18 is the office's to tick, like Under 16 (C-36). */
  await t('a team leader cannot tick Under 18 on their team’s person', assertFails(setDoc(doc(as('admin'), 'addressBook', 'ab_teen'), { name: 'Teen Synthetic', email: 'teen@example.invalid', markers: ['Kids Church'], isMinor: false, under18: true })));
  await t('the office can tick Under 18', assertSucceeds(setDoc(doc(as('office'), 'addressBook', 'ab_teen'), { name: 'Teen Synthetic', email: 'teen@example.invalid', markers: ['Kids Church'], isMinor: false, under18: true })));
  await t('a team leader cannot untick it either', assertFails(setDoc(doc(as('admin'), 'addressBook', 'ab_teen'), { name: 'Teen Synthetic', email: 'teen@example.invalid', markers: ['Kids Church'], isMinor: false, under18: false })));
  await t('a team leader can still save an under-16 they lead, as the page saves it', assertSucceeds(setDoc(doc(as('admin'), 'addressBook', 'ab_kid'), { name: 'Kid Synthetic', email: '', markers: ['Kids Church'], isMinor: true, under18: false })));
  await env.cleanup();
  return R;
}

const report = R => R.forEach(r => console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v ? '' : '\n          ' + String(r.x || '').slice(0, 200))));
const R = await run(RULES);
report(R);

const BREAKS = [
  ['master admins may read Canva’s tokens', 'allow read, write: if false;    // integration secrets: the server only', 'allow read, write: if isMaster(); // integration secrets: the server only', 'not even a master admin'],
  ['scheduled without copies', "&& (d.status != 'scheduled' ||", "&& (true ||", 'scheduling needs both finished copies'],
  ['anybody may write the web version', 'allow write: if false;          // web version: the sender only', 'allow write: if true;           // web version: the sender only', 'nobody writes the web version'],
  ['the office may write subscribers from a page', 'allow write: if false;          // subscribers: functions only', 'allow write: if enewsOffice(); // subscribers: functions only', 'not even the office writes'],
  ['church members may read subscribers', 'allow read: if enewsOffice();   // subscribers: the office', 'allow read: if active();        // subscribers: the office', 'a church member cannot read subscribers'],
  ['any admin may read issues', 'function enewsOffice() { return isMaster() || onTeam(\'Church office\'); }', 'function enewsOffice() { return isMaster() || onTeam(\'Church office\') || isAdmin(); }', 'an admin of a team'],
  ['a sent issue may be changed', "&& resource.data.status in ['draft', 'scheduled']", '', 'a sent issue cannot be changed'],
  ['the office may mark an issue sent', "&& d.status in ['draft', 'scheduled']", "&& d.status in ['draft', 'scheduled', 'sent']", 'the office cannot mark an issue sent'],
  ['any number of social links', "                   && (request.resource.data.church.get('social', []) is list && request.resource.data.church.get('social', []).size() <= 12)", '', 'no more than 12 social links'],
  ['anyone may read the social posts', 'allow read: if enewsOffice();   // social posts: the office', 'allow read: if true;   // social posts: the office', 'a church member cannot read the posts'],
  ['team leaders may set Under 18', "                 && request.resource.data.get('under18', false) == (resource == null ? false : resource.data.get('under18', false))));", '));', 'cannot tick Under 18'],
  ['any audience allowed on an email', "&& d.get('audience', 'subscribers') in ['subscribers', 'members', 'team', 'picked']", "&& true", 'known kind of audience'],
  ['church members may read the templates', 'allow read: if enewsOffice();   // email templates: the office', 'allow read: if active();   // email templates: the office', 'cannot read the templates'],
  ['the office may read the Unsplash cache', 'allow read, write: if false;   // unsplash cache: the server only', 'allow read, write: if enewsOffice();   // unsplash cache: the server only', 'Unsplash cache'],
  ['the office may read the links to the papers', 'allow read, write: if false;   // paper links: the server only', 'allow read, write: if enewsOffice();   // paper links: the server only', 'link to the papers'],
  ['anything on the welcome switches', "&& request.resource.data.keys().hasOnly(['subscriber', 'newcomer', 'updatedAt', 'updatedBy'])", '', 'carry nothing else'],
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
