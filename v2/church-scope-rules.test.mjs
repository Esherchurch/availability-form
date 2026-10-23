/* One church cannot see another's FILES (multi-church step 2's Storage
   rules: churches/{cid}/files in storage.rules). Runs the real rules
   engines with two made-up churches, mc-alpha and mc-beta. EGBC's data is
   not touched and nothing here reaches the live project.

     npx firebase emulators:exec --config firebase.spare.json --only firestore,storage \
       --project demo-egbc "node church-scope-rules.test.mjs"
     (with EGBC_FIREBASE_CONFIG=firebase.spare.json; ST_RULES points it at
     another copy of storage.rules, for a deliberate break)

   The Firestore half of this file - step 2's hand-written pilot - went on
   23 Oct 2026, with the pilot itself: every church's Firestore rules are now
   generated (firestore.churches.rules), and church-rules.test.mjs and
   `AS_CHURCH=mc-test node firestore-rules.test.mjs` test them. This half
   stays until storage.rules is ported the same way.
*/
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const cfg = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.json', 'utf8'));
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-egbc';
const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync(cfg.firestore.rules, 'utf8'), host: '127.0.0.1', port: cfg.emulators.firestore.port },
  storage: { rules: fs.readFileSync(process.env.ST_RULES || 'storage.rules', 'utf8'), host: '127.0.0.1', port: cfg.emulators.storage.port },
});

const A = 'mc-alpha', B = 'mc-beta';
/* People. claims: the churches the server put in their sign-in.
   at: their record in each church's own users collection (which the
   Storage rules read). top: a record in EGBC's top-level users. */
const PEOPLE = {
  aMaster: { claims: [A], at: { [A]: { status: 'active', masterAdmin: true, memberId: 'm_am' } } },
  aAdmin:  { claims: [A], at: { [A]: { status: 'active', adminFor: ['Kids'], memberId: 'm_aa' } } },
  aMember: { claims: [A], at: { [A]: { status: 'active', memberId: 'm_amem' } } },
  bMaster: { claims: [B], at: { [B]: { status: 'active', masterAdmin: true, memberId: 'm_bm' } } },
  // An admin in alpha who is only a member in beta: beta's record decides.
  both:    { claims: [A, B], at: { [A]: { status: 'active', masterAdmin: true }, [B]: { status: 'active', memberId: 'm_both' } } },
  // In alpha's users but the claim was taken away (left the church).
  left:    { claims: [], at: { [A]: { status: 'active', masterAdmin: true } } },
  // A master admin at EGBC who is only a member in alpha: alpha's record decides.
  mixed:   { claims: [A], at: { [A]: { status: 'active', memberId: 'm_mixed' } }, top: { status: 'active', masterAdmin: true, adminFor: ['Kids Church'], teams: ['Core Team'] } },
  // EGBC's own master admin today: a top-level users record, no church claims.
  egbc:    { claims: undefined, at: {}, top: { status: 'active', masterAdmin: true, teams: ['Core Team'] } },
};
const uid = (who) => 'u_' + who;
const stAs = (who) => env.authenticatedContext(uid(who), PEOPLE[who].claims ? { churches: PEOPLE[who].claims } : {}).storage();

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  for (const [who, p] of Object.entries(PEOPLE)) {
    for (const [cid, rec] of Object.entries(p.at)) await setDoc(doc(db, 'churches', cid, 'users', uid(who)), rec);
    if (p.top) await setDoc(doc(db, 'users', uid(who)), p.top);
  }
});
await env.withSecurityRulesDisabled(async (c) => {
  for (const cid of [A, B]) await uploadBytes(ref(c.storage(), `churches/${cid}/files/notice.pdf`), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });
});

const results = [];
async function check(name, expect, fn) {
  try { await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn())); results.push({ name, expect, ok: true }); }
  catch (e) { results.push({ name, expect, ok: false, why: String(e && e.message || e).slice(0, 160) }); }
}
const pdf = (who, cid, name) => () => uploadBytes(ref(stAs(who), `churches/${cid}/files/${name}`), new Uint8Array([1]), { contentType: 'application/pdf' });

await check('FILES: a member reads their church\'s file', 'allow', () => getBytes(ref(stAs('aMember'), `churches/${A}/files/notice.pdf`)));
await check('  not the other church\'s', 'deny', () => getBytes(ref(stAs('aMember'), `churches/${B}/files/notice.pdf`)));
await check('  nor does beta\'s master admin read alpha\'s', 'deny', () => getBytes(ref(stAs('bMaster'), `churches/${A}/files/notice.pdf`)));
await check('  a member cannot upload', 'deny', pdf('aMember', A, 'new.pdf'));
await check('  an admin uploads', 'allow', pdf('aAdmin', A, 'new.pdf'));
await check('  but not to the other church', 'deny', pdf('aAdmin', B, 'new.pdf'));
await check('  alpha\'s master admin, only a member in beta, cannot upload to beta', 'deny', pdf('both', B, 'new.pdf'));
await check('  EGBC\'s master admin who is only a member in alpha cannot upload alpha\'s files', 'deny', pdf('mixed', A, 'm.pdf'));
await check('  claim taken away: no read', 'deny', () => getBytes(ref(stAs('left'), `churches/${A}/files/notice.pdf`)));
await check('  EGBC\'s master admin today: no read', 'deny', () => getBytes(ref(stAs('egbc'), `churches/${A}/files/notice.pdf`)));
await check('  anything else under a church is shut', 'deny', () => uploadBytes(ref(stAs('aMaster'), `churches/${A}/other/x.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));

await env.cleanup();
const failed = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  (expected ' + r.expect + ')' + (r.why ? '\n          ' + r.why : ''));
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
