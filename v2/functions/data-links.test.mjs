/* The data map's on-delete rules, on the Firestore emulator, for EGBC's top
 * level and for a synthetic church. From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/data-links.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { tidyChildren, holdParents, blockersOf, londonDay } from './data-links.js';
import { scopedDb } from './church-scope.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
initializeApp({ projectId: 'demo-data-links' });
const root = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };
const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), past = '2020-01-05';

for (const cid of [null, 'st-aidans-test']) {
  const D = scopedDb(root, cid), who = (cid || 'egbc') + ': ';
  const ev = D.collection('calEvents').doc('ev1');
  await ev.set({ title: 'Harvest supper' });
  await ev.collection('ticketTypes').doc('t1').set({ name: 'Adult' });
  await D.collection('eventNotes').doc('ev1').set({ text: 'x' });
  await D.collection('checklistReminders').doc('ev1_task_due').set({ at: 1 });
  await D.collection('signups').doc('s1').set({ calEventId: 'ev1', name: 'Synthetic Person' });
  await D.collection('rooms').doc('hall').set({ name: 'Hall', parts: ['hallA', 'hallB'] });
  const slots = new Array(96).fill(0); for (let i = 40; i < 44; i++) slots[i] = 1;
  for (const r of ['hallA', 'hallB']) await D.collection('roomDays').doc(r + '_' + future).set({ slots });
  await D.collection('bookings').doc('b1').set({ calEventId: 'ev1', roomId: 'hall', day: future, slotFrom: 40, slotTo: 44, status: 'confirmed' });
  await D.collection('bookings').doc('b0').set({ calEventId: 'ev1', roomId: 'hall', day: past, slotFrom: 40, slotTo: 44, status: 'confirmed' });

  /* A paid payment and a safeguarding assessment hold the event. */
  await holdParents(D, 'signupPayments', { __id: 's1', calEventId: 'ev1', paid: true });
  await holdParents(D, 'sgAssessments', { __id: 'ev1' });
  await holdParents(D, 'signupPayments', { __id: 's2', calEventId: 'ev1', paid: false });
  ok(JSON.stringify(((await ev.get()).data().heldBy || []).sort()) === '["payments","safeguarding"]', who + 'a paid payment and a safeguarding record hold the event');

  /* The rooms: a future booking blocks taking the hall out of use. */
  ok((await blockersOf(D, 'rooms', 'hall')).some((b) => b.collection === 'bookings' && b.count === 1), who + 'a booking to come blocks the room (the past one does not)');

  /* The event deleted anyway (as an admin tool could): tidy, twice. */
  const before = (await ev.get()).data();
  await ev.delete();
  await tidyChildren(D, 'calEvents', 'ev1', before);
  await tidyChildren(D, 'calEvents', 'ev1', before);
  ok(!(await ev.collection('ticketTypes').doc('t1').get()).exists, who + 'cascade: ticket types gone');
  ok(!(await D.collection('eventNotes').doc('ev1').get()).exists, who + 'cascade ($id): notes gone');
  ok(!(await D.collection('checklistReminders').doc('ev1_task_due').get()).exists, who + 'cascade ($idPrefix): reminder marks gone');
  const s1 = (await D.collection('signups').doc('s1').get()).data();
  ok(s1 && s1.parentGone && s1.parentGone.calEventId.name === 'Harvest supper', who + 'keep-history: the sign-up stays, with the event\'s name');
  const b1 = (await D.collection('bookings').doc('b1').get()).data(), b0 = (await D.collection('bookings').doc('b0').get()).data();
  ok(b1.status === 'cancelled' && b0.status === 'confirmed', who + 'the booking to come is cancelled; the past one stays');
  const day = (await D.collection('roomDays').doc('hallA_' + future).get()).data().slots;
  ok(day[40] === 0 && day[43] === 0, who + 'its quarter-hours are given back once (run twice)');
}
console.log(bad ? bad + ' failed' : 'all passed');
process.exit(bad ? 1 : 0);
