/* Form answers and screen numbers are read only by those who need them
 * (Stage 1's findings, F-323). Synthetic data. From v2, on the emulator:
 *
 *   npx firebase emulators:exec --config firebase.events.json --only firestore "node screenshots/events/form-privacy.check.mjs"
 */
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, query, collection, where } from 'firebase/firestore';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-x';
const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync('firestore.build.rules', 'utf8'), host: '127.0.0.1', port: 8182 } });
let bad = 0;
const ok = async (p, want, what) => { try { await (want ? assertSucceeds(p) : assertFails(p)); console.log('PASS ' + what); } catch (e) { bad++; console.log('FAIL ' + what + ' :: ' + e.message); } };

await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore(), set = (p, v) => import('firebase/firestore').then((m) => m.setDoc(doc(d, p), v));
  await set('users/u_lead', { status: 'active', memberId: 'm_lead', teams: [], adminFor: ['Kids Church'] });
  await set('users/u_member', { status: 'active', memberId: 'm_member', teams: ['Welcome team'], adminFor: [] });
  await set('users/u_parent', { status: 'active', memberId: 'm_parent', teams: [], adminFor: [] });
  await set('users/u_gl', { status: 'active', memberId: 'm_gl', teams: [], adminFor: [] });
  await set('kidsSettings/hild', { teams: ['Kids Church'], formId: 'reg' });
  await set('kidsGroups/g1', { siteId: 'hild', leaderIds: ['m_gl'] });
  await set('forms/reg', { title: 'Registration', team: 'Kids Church', fields: [] });
  await set('formResponses/r1', { formId: 'reg', siteId: 'hild', requestKey: 'k1', personKind: 'addressBook', personId: 'm_parent', answers: { child: 'Synthetic Child' } });
  await set('sensitiveResponses/sec1', { responseId: 'r1', formId: 'reg', siteId: 'hild', answers: { allergy: 'Synthetic' } });
  await set('kidsScreenNos/hild_2026-11-08_123', { siteId: 'hild', day: '2026-11-08', n: '123', familyId: 'f1', groupId: 'g1' });
  await set('kidsScreenNos/hild_2026-11-08_456', { siteId: 'hild', day: '2026-11-08', n: '456', familyId: 'f2', groupId: '' });
});
const as = (uid) => env.authenticatedContext(uid).firestore(), out = env.unauthenticatedContext().firestore();

await ok(getDoc(doc(out, 'formResponses/r1')), false, 'signed out, holding the id: a form answer is refused');
await ok(getDoc(doc(out, 'sensitiveResponses/sec1')), false, 'signed out, holding the secret: the medical half is refused');
await ok(getDoc(doc(as('u_member'), 'formResponses/r1')), false, 'another member is refused');
await ok(getDoc(doc(as('u_lead'), 'formResponses/r1')), true, 'the children\'s lead reads it');
await ok(getDoc(doc(as('u_lead'), 'sensitiveResponses/sec1')), true, 'the children\'s lead reads the medical half');
await ok(getDoc(doc(as('u_parent'), 'formResponses/r1')), true, 'the signed-in parent it is about reads it');

await ok(getDocs(query(collection(as('u_member'), 'kidsScreenNos'), where('siteId', '==', 'hild'), where('day', '==', '2026-11-08'))), false, 'a member can no longer read the screen numbers');
await ok(getDocs(query(collection(as('u_lead'), 'kidsScreenNos'), where('siteId', '==', 'hild'), where('day', '==', '2026-11-08'))), true, 'the children\'s lead reads the site\'s numbers');
await ok(getDocs(query(collection(as('u_gl'), 'kidsScreenNos'), where('siteId', '==', 'hild'), where('day', '==', '2026-11-08'), where('groupId', '==', 'g1'))), true, 'a group leader reads their own group\'s numbers');
await ok(getDoc(doc(as('u_gl'), 'kidsScreenNos/hild_2026-11-08_456')), false, 'but not another family\'s outside their group');
await ok(getDoc(doc(as('u_gl'), 'kidsScreenNos/hild_2026-11-08_789')), true, 'and may see that a number nobody holds is free');

await env.cleanup();
console.log(bad ? bad + ' failed' : 'all passed');
process.exit(bad ? 1 : 0);
