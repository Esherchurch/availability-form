/* The data map's on-delete rules, on the Firestore emulator, for EGBC's top
 * level and for a synthetic church. From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/data-links.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { tidyChildren, holdParents, blockersOf, londonDay } from './data-links.js';
import { scopedDb } from './church-scope.js';
import { sweepLink, sweepChurch } from './orphan-sweep.js';
import { EGBC_TIDYING_ON, mayTidy } from './egbc-tidying.js';
import { readFileSync } from 'node:fs';

const MAP = JSON.parse(readFileSync(new URL('./data-map.json', import.meta.url), 'utf8')).collections;

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
  await D.collection('checklistReminders').doc('ev10_task_due').set({ at: 1 });
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
  ok((await D.collection('checklistReminders').doc('ev10_task_due').get()).exists, who + '$idPrefix: another event\'s marks stay');

  /* A pastoral visit's follow-up reminder goes with the visit. */
  await D.collection('pastoralReminded').doc('v1_2026-11-20').set({ at: 1 });
  await D.collection('pastoralVisits').doc('v1').delete();
  await tidyChildren(D, 'pastoralVisits', 'v1', { name: 'A visit' });
  ok(!(await D.collection('pastoralReminded').doc('v1_2026-11-20').get()).exists, who + '$idPrefix: a visit\'s reminder goes with it');
  const s1 = (await D.collection('signups').doc('s1').get()).data();
  ok(s1 && s1.parentGone && s1.parentGone.calEventId.name === 'Harvest supper', who + 'keep-history: the sign-up stays, with the event\'s name');
  const b1 = (await D.collection('bookings').doc('b1').get()).data(), b0 = (await D.collection('bookings').doc('b0').get()).data();
  ok(b1.status === 'cancelled' && b0.status === 'confirmed', who + 'the booking to come is cancelled; the past one stays');
  const day = (await D.collection('roomDays').doc('hallA_' + future).get()).data().slots;
  ok(day[40] === 0 && day[43] === 0, who + 'its quarter-hours are given back once (run twice)');

  /* Availability answers outlive their rota date, deleted by the page or found by the nightly sweep. */
  await D.collection('availability').doc('a1').set({ eventId: 'r1', memberId: 'm1', status: 'available' });
  await D.collection('availability').doc('a2').set({ eventId: 'r2', memberId: 'm1', status: 'unavailable' });
  await tidyChildren(D, 'events', 'r1', { title: 'Sunday 9 November' });
  const a1 = (await D.collection('availability').doc('a1').get()).data();
  ok(a1 && a1.status === 'available' && a1.parentGone.eventId.name === 'Sunday 9 November', who + 'keep-history: an availability answer stays when its rota date is deleted, marked with the date');
  const link = MAP.availability.links.find((l) => l.field === 'eventId');
  const swept = await sweepLink({ db: D, child: 'availability', link, known: new Map() });
  const a2 = (await D.collection('availability').doc('a2').get()).data();
  ok(swept.orphans >= 1 && a2 && a2.parentGone && a2.parentGone.eventId, who + 'orphanSweep marks an answer whose date is gone, and keeps it');
}
/* Until the hub goes live, EGBC's top level is the original site's: the
   tidying only counts there, and a test church is tidied as normal. Run with
   the switch as shipped, as the triggers and the nightly sweep use it. */
ok(EGBC_TIDYING_ON === false && mayTidy(null) === false && mayTidy('st-aidans-test') === true, 'the switch ships off: EGBC is not tidied, a church is');
for (const cid of [null, 'st-aidans-test']) {
  const D = scopedDb(root, cid), who = (cid || 'egbc') + ': ', tidy = mayTidy(cid);
  await D.collection('meetingSends').doc('rm1').set({ to: ['x'] });
  await D.collection('availability').doc('h1').set({ eventId: 'rm1', memberId: 'm1', status: 'maybe' });
  const done = await tidyChildren(D, 'events', 'rm1', { title: 'Removed date' }, MAP, 'events', tidy);
  const sends = (await D.collection('meetingSends').doc('rm1').get()).exists, h1 = (await D.collection('availability').doc('h1').get()).data();
  if (cid) ok(!sends && h1.parentGone && /^deleted/.test(done.meetingSends), who + 'tidyAfterDelete tidies: the cascade deletes, keep-history marks');
  else ok(sends && !h1.parentGone && /^would have deleted 1/.test(done.meetingSends) && /^would have kept 1/.test(done.availability), who + 'tidyAfterDelete changes nothing, and says what it would have done: ' + JSON.stringify(done));

  /* The nightly sweep, on a night after its first. */
  await D.collection('orphanSweeps').doc('2020-01-01').set({ at: 'earlier' });
  await D.collection('meetingSends').doc('rm2').set({ to: ['y'] });
  await D.collection('availability').doc('h2').set({ eventId: 'rm2', memberId: 'm1', status: 'maybe' });
  const sum = await sweepChurch({ db: D, tidy, now: new Date('2026-11-02T03:15:00Z') });
  const sends2 = (await D.collection('meetingSends').doc('rm2').get()).exists, h2 = (await D.collection('availability').doc('h2').get()).data();
  if (cid) ok(!sum.reportOnly && sum.fixed > 0 && !sends2 && h2.parentGone, who + 'orphanSweep fixes: ' + sum.fixed + ' of ' + sum.orphans);
  else ok(sum.reportOnly && sum.dryRun && sum.fixed === 0 && sum.orphans > 0 && sends2 && !h2.parentGone, who + 'orphanSweep only counts (' + sum.orphans + ' orphans, 0 changed) and keeps its report');
  ok((await D.collection('orphanSweeps').doc('2026-11-02').get()).exists, who + 'the night\'s counts are logged');
}

console.log(bad ? bad + ' failed' : 'all passed');
process.exit(bad ? 1 : 0);
