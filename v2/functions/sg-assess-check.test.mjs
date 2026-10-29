/* A signed assessment with the cover given as an amount and nothing more
 * loses its sign-off; a complete one keeps it. EGBC's top level and a
 * synthetic church. From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/sg-assess-check.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { coverProblems, checkSignedCover } from './sg-assess-check.js';
import { scopedDb } from './church-scope.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
initializeApp({ projectId: 'demo-sg-assess-check' });
const root = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };

ok(coverProblems({ insurance: '£5,000,000: ' }).join() === 'insurance', 'an amount with nothing after it is found');
ok(coverProblems({ insurance: '£: ' }).join() === 'insurance', 'no amount and nothing after it is found');
ok(!coverProblems({ insurance: '£5,000,000: Synthetic Insurers, checked by the treasurer' }).length, 'a full answer is fine');
ok(!coverProblems({ insurance: 'N/A: not our event' }).length && !coverProblems({}).length, 'not applicable, or not answered yet, is left to the rules');

for (const cid of [null, 'st-aidans-test']) {
  const D = scopedDb(root, cid), who = (cid || 'egbc') + ': ';
  const signed = { status: 'signed', version: 2, signedBy: 'lead', signedByName: 'Synthetic Lead', signedAt: new Date(), signedVersion: 2, answers: { insurance: '£5,000,000: ' } };
  await D.collection('sgAssessments').doc('ev1').set(signed);
  await D.collection('sgGate').doc('ev1').set({ needed: true, open: true });
  await checkSignedCover(D, 'ev1', signed);
  await checkSignedCover(D, 'ev1', (await D.collection('sgAssessments').doc('ev1').get()).data());
  const a = (await D.collection('sgAssessments').doc('ev1').get()).data(), g = (await D.collection('sgGate').doc('ev1').get()).data();
  ok(a.status === 'waiting' && a.version === 3 && !a.signedBy && !a.signedAt && g.open === false, who + 'its sign-off is undone once, and bookings close');

  const good = Object.assign({}, signed, { answers: { insurance: '£5,000,000: Synthetic Insurers, checked 1 Nov' } });
  await D.collection('sgAssessments').doc('ev2').set(good);
  ok((await checkSignedCover(D, 'ev2', good)) === null && (await D.collection('sgAssessments').doc('ev2').get()).data().status === 'signed', who + 'a complete answer keeps its sign-off');
}
console.log(bad ? bad + ' failed' : 'all passed');
process.exit(bad ? 1 : 0);
