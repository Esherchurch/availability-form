/* The Compiler's groups, notification and Sent list, and the e-news's
 * unconfirmed sign-ups, on the Firestore emulator. From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/comms-extras.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { decide, groupsFor, groupEmailsFor, sentBy, uidsForEmails } from './compiler-send.js';
import { tidyPending } from './enews.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
initializeApp({ projectId: 'demo-comms-extras' });
const db = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };

/* A leader of one small group, on no team. */
const leader = { status: 'active', name: 'Leader', email: 'lead@example.invalid', memberId: 'pL', adminFor: [] };
await db.collection('addressBook').doc('p1').set({ name: 'In group', email: 'in@example.invalid' });
await db.collection('addressBook').doc('p2').set({ name: 'Child', email: 'kid@example.invalid', under18: true });
await db.collection('addressBook').doc('p3').set({ name: 'Elsewhere', email: 'out@example.invalid' });
await db.collection('smallGroups').doc('g1').set({ name: 'Tuesday group', leaderIds: ['pL'] });
await db.collection('smallGroups').doc('g2').set({ name: 'Other group', leaderIds: ['pX'] });
for (const [g, p] of [['g1', 'p1'], ['g1', 'p2'], ['g2', 'p3']]) await db.collection('smallGroupMembers').doc(g + '__a_' + p).set({ groupId: g, personKind: 'addressBook', personId: p, name: p });

const mine = await groupsFor(db, leader, false);
ok(mine.length === 1 && mine[0].people.length === 1 && mine[0].people[0].email === 'in@example.invalid', 'a leader gets their own group, never an under-18');
ok((await groupsFor(db, leader, true)).length === 2, 'the office gets every group');
const extra = await groupEmailsFor(db, leader);
ok(decide(leader, [], ['in@example.invalid'], [], extra, 500).ok, 'a group leader may email their group');
ok(!decide(leader, [], ['out@example.invalid'], [], extra, 500).ok, 'and nobody else');

await db.collection('users').doc('u1').set({ status: 'active', memberId: 'p1' });
ok((await uidsForEmails(db, ['IN@example.invalid', 'kid@example.invalid'])).join() === 'u1', 'the hub accounts behind the addresses, never an under-18');

await db.collection('emailOutbox').add({ source: 'hub:compiler', by: 'u9', byName: 'Val', subject: 'Supper', to: ['a@x.invalid'], ok: true, at: '2030-01-01T10:00:01Z' });
await db.collection('emailOutbox').add({ source: 'hub:compiler', by: 'u9', byName: 'Val', subject: 'Supper', to: ['b@x.invalid'], ok: false, at: '2030-01-01T10:00:05Z' });
await db.collection('emailOutbox').add({ source: 'hub:compiler', by: 'u8', subject: 'Other', to: ['c@x.invalid'], ok: true, at: '2030-01-02T10:00:00Z' });
const s9 = await sentBy(db, 'u9');
ok(s9.length === 1 && s9[0].sent === 1 && s9[0].failed === 1 && s9[0].to.length === 2, 'one press of Send is one row, with who it reached');
ok((await sentBy(db, null)).length === 2, 'the office sees everyone\'s');

/* Sign-ups: an old one never confirmed goes; a once-subscribed one stays. */
const old = '2020-01-01T00:00:00.000Z';
await db.collection('enewsSubscribers').doc('s1').set({ status: 'pending', createdAt: old, history: [{ what: 'asked to join (web form)' }] });
await db.collection('enewsSubscribers').doc('s2').set({ status: 'pending', createdAt: old, history: [{ what: 'asked to join (web form)' }, { what: 'unsubscribed' }] });
await db.collection('enewsSubscribers').doc('s3').set({ status: 'pending', createdAt: new Date().toISOString(), history: [{ what: 'asked to join (web form)' }] });
ok((await tidyPending(db)) === 1, 'one unconfirmed sign-up removed');
ok(!(await db.collection('enewsSubscribers').doc('s1').get()).exists && (await db.collection('enewsSubscribers').doc('s2').get()).exists
  && (await db.collection('enewsSubscribers').doc('s3').get()).exists, 'someone who left the list, and a new sign-up, stay');

console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
