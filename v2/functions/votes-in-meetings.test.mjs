/* Votes inside meetings, on the Firestore emulator: a members' meeting
 * keeps its matching meeting, and a quick vote's normal case and refusals.
 * From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/votes-in-meetings.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { cast, close, startQuick, invitedTo } from './meetings.js';
import { syncMembersMeeting } from './members-meeting.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
initializeApp({ projectId: 'demo-votes-in-meetings' });
const db = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };
const refused = (p) => p.then(() => '', (e) => e.code || 'error');

/* A members' meeting: its meeting is made, then goes when it is cancelled. */
await syncMembersMeeting({ db, mid: 'm1', after: { title: 'Annual meeting', date: '2030-03-01', time: '19:45', createdBy: 'chair' } });
const ev = (await db.collection('events').doc('cm-m1').get()).data();
const part = (await db.collection('meetings').doc('cm-m1').get()).data();
ok(ev && ev.membersMeeting === true && ev.videoRoom === 'm-cm-m1' && ev.endTime === '21:45', 'a members\' meeting has a meeting in its own room');
ok(part && part.description === 'Annual meeting' && part.membersMeeting === true && !('description' in ev), 'its title is on the private part only');
await syncMembersMeeting({ db, mid: 'm1', after: { title: 'Annual meeting', date: '2030-03-01', status: 'cancelled' } });
ok(!(await db.collection('events').doc('cm-m1').get()).exists, 'cancelled: its meeting goes');

/* A quick vote in an ordinary meeting. */
await db.collection('users').doc('host').set({ status: 'active', name: 'Host', teams: [] });
await db.collection('users').doc('guest').set({ status: 'active', name: 'Invited', memberId: 'p1', teams: [] });
await db.collection('users').doc('other').set({ status: 'active', name: 'Not invited', memberId: 'p2', teams: [] });
await db.collection('events').doc('e1').set({ meeting: true, teams: [], date: '2030-03-02' });
await db.collection('meetings').doc('e1').set({ organiserUid: 'host', invitees: ['p1'], teams: [] });

ok((await refused(startQuick({ db, uid: 'guest', data: { meeting: 'e1', question: 'Q', choices: ['Yes', 'No'] } }))) === 'permission-denied', 'only the host starts one');
const { vote } = await startQuick({ db, uid: 'host', data: { meeting: 'e1', question: 'Lunch at one?', choices: ['Yes', 'No'], secret: true } });
await cast({ db, uid: 'guest', data: { meeting: 'e1', vote, choice: 'Yes', quick: true } });
ok((await refused(cast({ db, uid: 'guest', data: { meeting: 'e1', vote, choice: 'No', quick: true } }))) === 'already-exists', 'one vote each');
ok((await refused(cast({ db, uid: 'other', data: { meeting: 'e1', vote, choice: 'No', quick: true } }))) === 'permission-denied', 'only the invited vote');
const ballot = (await db.collection('meetings').doc('e1').collection('quickVotes').doc(vote).collection('ballots').doc('guest').get()).data();
ok(ballot && !('choice' in ballot), 'a secret ballot holds no choice');
await close({ db, uid: 'host', data: { meeting: 'e1', vote, quick: true } });
const v = (await db.collection('meetings').doc('e1').collection('quickVotes').doc(vote).get()).data();
ok(v.status === 'closed' && v.results.Yes === 1 && v.results.No === 0, 'closing shows the count');

ok(invitedTo({ status: 'active', churchMember: true }, { membersMeeting: true }, 'x'), 'a member is invited to a members\' meeting');
ok(!invitedTo({ status: 'active' }, { membersMeeting: true }, 'x'), 'a non-member is not');

console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
