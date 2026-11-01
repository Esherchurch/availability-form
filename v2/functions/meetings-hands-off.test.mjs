/* The hub leaves the original site's meetings alone until it goes live
 * (egbc-tidying.js), on the Firestore emulator. From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/meetings-hands-off.test.mjs"
 *
 * In EGBC's top-level data, an original-style Core Team Meeting (no
 * meeting: true, a video room by its kind) that clashes with another keeps
 * its description on the row and gets no room of its own; a test church
 * treats it as before. Anywhere, a blank notes box saved on blur never
 * replaces a hub meeting's words. With the switch as shipped, as the
 * triggers use it.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { settleRoom } from './meeting-rooms.js';
import { splitOne, serviceKinds } from './meeting-split.js';
import { mayGuessMeetings } from './egbc-tidying.js';
import { scopedDb } from './church-scope.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
initializeApp({ projectId: 'demo-meetings-hands-off' });
const root = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };

ok(mayGuessMeetings(null) === false && mayGuessMeetings('st-aidans-test') === true, 'the switch ships off: EGBC\'s meetings are only the hub\'s marked ones');
for (const cid of [null, 'st-aidans-test']) {
  const D = scopedDb(root, cid), who = (cid || 'egbc') + ': ', guess = mayGuessMeetings(cid);
  await D.collection('churchSettings').doc('video').set({ byType: { 'Core Team Meeting': 'core' }, rooms: [{ key: 'core', label: 'Core Team', teams: ['Core Team'] }] });
  /* As the original site saves them: a kind with a room, words on the row. */
  const meet = (start, words) => ({ date: '2030-05-14', startTime: start, endTime: '21:00', type: 'Core Team Meeting', teams: ['Core Team'], description: words, archived: false });
  await D.collection('events').doc('orig1').set(meet('19:30', 'Budget'));
  await D.collection('events').doc('orig2').set(meet('20:00', 'Rota for Advent'));
  const key = await settleRoom({ db: D, daily: null, cid, id: 'orig2', after: meet('20:00', 'Rota for Advent'), created: Date.now(), guess });
  const ev2 = (await D.collection('events').doc('orig2').get()).data();
  const split = await splitOne(D, 'orig2', ev2, await serviceKinds(D), true, guess);
  const after = (await D.collection('events').doc('orig2').get()).data(), part = (await D.collection('meetings').doc('orig2').get()).data();
  if (cid) ok(key === 'm-orig2' && ev2.ownRoom && split && part && part.description === 'Rota for Advent' && !after.description, who + 'a clashing meeting gets its own room and its words move, as before');
  else ok(key === null && !after.videoRoom && !after.ownRoom && split === null && !part && after.description === 'Rota for Advent', who + 'an original-style clashing Core Team Meeting keeps its description and gets no room');

  /* A hub meeting, then a blur-save of a blank notes box onto its row. */
  await D.collection('events').doc('hub1').set({ date: '2030-05-21', type: 'Core Team Meeting', teams: ['Core Team'], meeting: true, videoRoom: 'm-hub1' });
  await D.collection('meetings').doc('hub1').set({ description: 'Plan the carol service', title: 'Carols', teams: ['Core Team'] });
  const blank = { date: '2030-05-21', type: 'Core Team Meeting', teams: ['Core Team'], meeting: true, videoRoom: 'm-hub1', description: '', title: '' };
  await D.collection('events').doc('hub1').set(blank);
  await splitOne(D, 'hub1', blank, await serviceKinds(D), true, guess);
  const kept = (await D.collection('meetings').doc('hub1').get()).data(), row = (await D.collection('events').doc('hub1').get()).data();
  ok(kept.description === 'Plan the carol service' && kept.title === 'Carols' && !('description' in row), who + 'a blank blur-save keeps a hub meeting\'s title and notes (and leaves nothing on the row)');
  await splitOne(D, 'hub1', Object.assign({}, blank, { description: 'Carols and mince pies' }), await serviceKinds(D), true, guess);
  ok((await D.collection('meetings').doc('hub1').get()).data().description === 'Carols and mince pies', who + 'real new words still replace them');
}
console.log(bad ? bad + ' failed' : 'all passed');
process.exit(bad ? 1 : 0);
