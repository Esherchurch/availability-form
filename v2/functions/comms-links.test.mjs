/* The comms area's on-delete rules (data-map/comms.json), on the Firestore
 * emulator, for the first church's top level and for a synthetic church.
 * From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/comms-links.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { tidyChildren } from './data-links.js';
import { scopedDb } from './church-scope.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
initializeApp({ projectId: 'demo-comms-links' });
const root = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };
const has = async (ref) => (await ref.get()).exists;

for (const cid of [null, 'st-aidans-test']) {
  const D = scopedDb(root, cid), who = (cid || 'first church') + ': ';

  /* Cascade with "only": an event's unposted countdown goes, a posted one stays. */
  await D.collection('socialPosts').doc('ready').set({ eventId: 'ev1', status: 'ready', title: 'Harvest supper' });
  await D.collection('socialPosts').doc('posted').set({ eventId: 'ev1', status: 'posted', title: 'Harvest supper' });
  await tidyChildren(D, 'calEvents', 'ev1', { title: 'Harvest supper' });
  ok(!(await has(D.collection('socialPosts').doc('ready'))), who + 'an unposted countdown goes with its event');
  const posted = (await D.collection('socialPosts').doc('posted').get()).data();
  ok(!!posted && !posted.parentGone, who + 'a posted one stays, untouched');

  /* A deleted draft takes its sends and its preview; a template's issues are kept and marked. */
  await D.collection('enewsIssues').doc('i1').collection('sends').doc('sub1').set({ at: 1 });
  await D.collection('enewsPreview').doc('tok').set({ issueId: 'i1' });
  await tidyChildren(D, 'enewsIssues', 'i1', { subject: 'Draft' });
  ok((await D.collection('enewsIssues').doc('i1').collection('sends').get()).empty, who + 'a deleted draft takes its sends');
  ok(!(await has(D.collection('enewsPreview').doc('tok'))), who + 'and its preview link');
  await D.collection('enewsIssues').doc('i2').set({ subject: 'Sent', templateId: 'tp1' });
  await tidyChildren(D, 'emailTemplates', 'tp1', { name: 'Weekly' });
  const i2 = (await D.collection('enewsIssues').doc('i2').get()).data();
  ok(i2 && i2.parentGone && i2.parentGone.templateId && i2.parentGone.templateId.name === 'Weekly', who + 'an issue keeps its template\'s name when the template goes');

  /* A meeting's private part, proxies, votes and the votes' ballots all go; its paper links stop working. */
  const m = D.collection('churchMeetings').doc('m1');
  await m.collection('private').doc('join').set({ zoomUrl: 'https://example.org' });
  await m.collection('proxies').doc('p1').set({ holderId: 'p2' });
  await m.collection('votes').doc('v1').set({ question: 'Q', status: 'closed' });
  await m.collection('votes').doc('v1').collection('ballots').doc('p1').set({ choice: 0 });
  await D.collection('meetingPaperLinks').doc('h1').set({ meetingId: 'm1', personId: 'p9' });
  await tidyChildren(D, 'churchMeetings', 'm1', { title: 'AGM' });
  ok((await m.collection('private').get()).empty && (await m.collection('proxies').get()).empty, who + 'a meeting takes its private part and proxies');
  ok((await m.collection('votes').doc('v1').collection('ballots').get()).empty, who + 'and its votes, ballots and all');
  ok(!(await has(D.collection('meetingPaperLinks').doc('h1'))), who + 'and its paper links');

  /* A vote under a meeting (a subcollection parent): its ballots and count go. */
  const v = D.collection('churchMeetings').doc('m2').collection('votes').doc('v2');
  await v.collection('ballots').doc('p1').set({ choice: 1 });
  await v.collection('tally').doc('t').set({ n: 1 });
  await tidyChildren(D, 'churchMeetings/*/votes', 'v2', null, undefined, 'churchMeetings/m2/votes');
  ok((await v.collection('ballots').get()).empty && (await v.collection('tally').get()).empty, who + 'a deleted vote takes its ballots and count');

  /* Gift Aid and giving are never cascaded. */
  await D.collection('giftAid').doc('g1').set({ memberId: 'p5', firstName: 'Synthetic' });
  await D.collection('donations').doc('d1').set({ memberId: 'p5', amount: 10 });
  await tidyChildren(D, 'addressBook', 'p5', { name: 'Synthetic Person' });
  const g = (await D.collection('giftAid').doc('g1').get()).data(), d = (await D.collection('donations').doc('d1').get()).data();
  ok(!!g && !!g.parentGone && !!d && !!d.parentGone, who + 'Gift Aid and donations stay, marked, when the person goes');
}

console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
