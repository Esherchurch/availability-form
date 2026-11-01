/* A SAFEGUARDING CONCERN ALWAYS REACHES THE LEAD AND DEPUTY, whatever the
 * church has switched off (going-live test, stage 1). Care and prayer off -
 * as a whole part, or its own switch - stops the pastoral kinds only.
 *
 *   node --test functions/care-off.test.mjs     (Firestore emulator on FIRESTORE_EMULATOR_HOST, default 127.0.0.1:8181)
 *
 * onWorry runs as worryNotify does, in dry run: it says whom it would reach
 * and sends nothing.
 */
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onWorry } from './notify.js';
import { scopedDb } from './church-scope.js';

initializeApp({ projectId: 'demo-care-off' });
const db = scopedDb(getFirestore(), 'careoff');
const auth = { getUser: async () => { throw new Error('no such account'); } };
const deps = { db, auth, dryRun: true };

async function church(features) {
  await db.doc('churchSettings/features').set(features);
  await db.doc('safeguardingSettings/defaults').set({ leadSiteId: 'site1' });
  await db.doc('bookingSettings/site1').set({ safeguardingLead: 'm_lead', safeguardingDeputy: 'm_deputy' });
  for (const [uid, m] of [['u_lead', 'm_lead'], ['u_deputy', 'm_deputy'], ['u_office', 'm_office']]) {
    await db.doc('users/' + uid).set({ memberId: m, status: 'active', teams: uid === 'u_office' ? ['Church office'] : [] });
    await db.doc('addressBook/' + m).set({ name: uid, email: uid + '@example.invalid' });
  }
}
let n = 0;
const worry = (kind) => onWorry(deps, 'w' + (++n) + '_' + Date.now(), { kind, by: 'u_someone', aboutName: 'Someone' });

for (const [how, features] of [['the whole Care and prayer part off', { parts: { care: false } }], ['Care & support\'s own switch off', { care: false }]]) {
  test('with ' + how + ': a safeguarding concern reaches the lead and the deputy, and nobody else', async () => {
    await church(features);
    const r = await worry('safeguarding');
    assert.ok(r, 'it was not sent at all');
    assert.equal(r.wouldEmail, 2, 'the lead and the deputy: ' + JSON.stringify(r));
  });
  test('with ' + how + ': a pastoral concern is not sent', async () => {
    await church(features);
    assert.equal(await worry('pastoral'), null);
  });
}

test('with everything on: a safeguarding concern reaches the lead and the deputy', async () => {
  await church({});
  const r = await worry('safeguarding');
  assert.equal(r.wouldEmail, 2);
});
