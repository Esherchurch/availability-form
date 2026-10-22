/* One church cannot see another's (multi-church step 2).
   Runs the real rules engines against firestore.rules and storage.rules,
   with two made-up churches, mc-alpha and mc-beta. EGBC's data is not
   touched and nothing here reaches the live project.

     npx firebase emulators:exec --config firebase.spare.json --only firestore,storage \
       --project demo-egbc "node church-scope-rules.test.mjs"
     (with EGBC_FIREBASE_CONFIG=firebase.spare.json; FS_RULES / ST_RULES point
     it at another copy of the rules, for a deliberate break)

   For every collection name the hub has (tests/top-level-collections.json),
   a master admin, an admin and a member of mc-alpha are refused read, list
   and write of it under mc-beta. Inside their own church, a person's place
   comes from that church's users record, not from EGBC's.
*/
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const cfg = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.json', 'utf8'));
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-egbc';
const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync(process.env.FS_RULES || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: cfg.emulators.firestore.port },
  storage: { rules: fs.readFileSync(process.env.ST_RULES || 'storage.rules', 'utf8'), host: '127.0.0.1', port: cfg.emulators.storage.port },
});

const A = 'mc-alpha', B = 'mc-beta';
const LIST = JSON.parse(fs.readFileSync('tests/top-level-collections.json', 'utf8'));
const NAMES = [...new Set([...LIST.egbc, ...Object.keys(LIST.hq), 'users', 'settings', 'addressBook', 'news', 'careRouting', 'leaderChecks', 'files'])];
const PILOT = ['users', 'settings', 'addressBook', 'news', 'careRouting', 'leaderChecks'];

/* People. claims: the churches the server put in their sign-in.
   at: their record in each church's own users collection. */
const PEOPLE = {
  aMaster: { claims: [A], at: { [A]: { status: 'active', masterAdmin: true, memberId: 'm_am' } } },
  aAdmin:  { claims: [A], at: { [A]: { status: 'active', adminFor: ['Kids'], memberId: 'm_aa' } } },
  aVol:    { claims: [A], at: { [A]: { status: 'active', teams: ['Welcome'], memberId: 'm_av' } } },
  aMember: { claims: [A], at: { [A]: { status: 'active', memberId: 'm_amem' } } },
  aLead:   { claims: [A], at: { [A]: { status: 'active', memberId: 'm_lead' } } },
  aPending:{ claims: [A], at: { [A]: { status: 'pending', memberId: 'm_ap' } } },
  bMaster: { claims: [B], at: { [B]: { status: 'active', masterAdmin: true, memberId: 'm_bm' } } },
  // An admin in alpha who is only a member in beta: beta's record decides.
  both:    { claims: [A, B], at: { [A]: { status: 'active', masterAdmin: true }, [B]: { status: 'active', memberId: 'm_both' } } },
  // In alpha's users but the claim was taken away (left the church).
  left:    { claims: [], at: { [A]: { status: 'active', masterAdmin: true } } },
  // Claims beta but beta has no record of them.
  noRecord:{ claims: [B], at: {} },
  // A master admin at EGBC (top-level users) who is only a member in alpha:
  // alpha's record decides, not EGBC's.
  mixed:   { claims: [A], at: { [A]: { status: 'active', memberId: 'm_mixed' } }, top: { status: 'active', masterAdmin: true, adminFor: ['Kids Church'], teams: ['Core Team'] } },
  // EGBC's own master admin today: a top-level users record, no church claims.
  egbc:    { claims: undefined, at: {}, top: { status: 'active', masterAdmin: true, teams: ['Core Team'] } },
};
const uid = (who) => 'u_' + who;
const fsAs = (who) => env.authenticatedContext(uid(who), PEOPLE[who].claims ? { churches: PEOPLE[who].claims } : {}).firestore();
const stAs = (who) => env.authenticatedContext(uid(who), PEOPLE[who].claims ? { churches: PEOPLE[who].claims } : {}).storage();

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  for (const cid of [A, B]) {
    await setDoc(doc(db, 'churches', cid), { name: cid === A ? 'Alpha (made up)' : 'Beta (made up)' });
    await setDoc(doc(db, 'churches', cid, 'careRouting', 'status'), { leadIds: cid === A ? ['m_lead'] : ['m_bm'] });
    for (const n of NAMES) if (n !== 'careRouting' && n !== 'users') await setDoc(doc(db, 'churches', cid, n, 'x'), { made: 'up' });
    await setDoc(doc(db, 'churches', cid, 'leaderChecks', 'm_amem'), { dbs: '2026-01-01' });
    await setDoc(doc(db, 'churches', cid, 'leaderChecks', 'm_av'), { dbs: '2026-01-01' });
  }
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
const get = (who, ...p) => () => getDoc(doc(fsAs(who), ...p));
const list = (who, ...p) => () => getDocs(collection(fsAs(who), ...p));
const put = (who, ...p) => () => setDoc(doc(fsAs(who), ...p), { made: 'up', by: uid(who) });

// ---- inside their own church ----------------------------------------
await check('a member reads their church', 'allow', get('aMember', 'churches', A));
await check('a member reads the church settings', 'allow', get('aMember', 'churches', A, 'settings', 'x'));
await check('  and the news', 'allow', get('aMember', 'churches', A, 'news', 'x'));
await check('  but cannot write the news', 'deny', put('aMember', 'churches', A, 'news', 'n1'));
await check('  nor read the address book (no team)', 'deny', get('aMember', 'churches', A, 'addressBook', 'x'));
await check('a volunteer reads the address book', 'allow', get('aVol', 'churches', A, 'addressBook', 'x'));
await check('an admin writes the news', 'allow', put('aAdmin', 'churches', A, 'news', 'n1'));
await check('  but not the settings', 'deny', put('aAdmin', 'churches', A, 'settings', 'x'));
await check('a master admin writes the settings', 'allow', put('aMaster', 'churches', A, 'settings', 'x'));
await check('somebody still waiting reads nothing', 'deny', get('aPending', 'churches', A, 'settings', 'x'));
await check('each person reads their own users record', 'allow', get('aMember', 'churches', A, 'users', uid('aMember')));
await check('  not somebody else\'s', 'deny', get('aMember', 'churches', A, 'users', uid('aAdmin')));
await check('an admin reads them all', 'allow', list('aAdmin', 'churches', A, 'users'));
await check('nobody writes a users record, not even a master admin (the server does)', 'deny', () => setDoc(doc(fsAs('aMaster'), 'churches', A, 'users', uid('aMember')), { status: 'active', masterAdmin: true }));
await check('  nor their own', 'deny', () => setDoc(doc(fsAs('aMember'), 'churches', A, 'users', uid('aMember')), { status: 'active', masterAdmin: true }));
await check('care routing: a master admin reads it', 'allow', get('aMaster', 'churches', A, 'careRouting', 'status'));
await check('  an admin does not', 'deny', get('aAdmin', 'churches', A, 'careRouting', 'status'));
await check('DBS dates: the safeguarding lead reads anyone\'s', 'allow', get('aLead', 'churches', A, 'leaderChecks', 'm_av'));
await check('  each person reads their own', 'allow', get('aMember', 'churches', A, 'leaderChecks', 'm_amem'));
await check('  not somebody else\'s', 'deny', get('aMember', 'churches', A, 'leaderChecks', 'm_av'));
await check('  an admin who is not the lead does not', 'deny', get('aAdmin', 'churches', A, 'leaderChecks', 'm_av'));
await check('a collection with no rule of its own under a church is shut, even to its master admin', 'deny', get('aMaster', 'churches', A, 'rotas', 'x'));
await check('  and cannot be written', 'deny', put('aMaster', 'churches', A, 'rotas', 'x'));
await check('nobody writes the church record itself', 'deny', () => setDoc(doc(fsAs('aMaster'), 'churches', A), { name: 'x' }));

// ---- the claim, and that church's own record, decide -------------------
await check('somebody whose claim was taken away reads nothing, though alpha still lists them', 'deny', get('left', 'churches', A, 'settings', 'x'));
await check('  not even the church record', 'deny', get('left', 'churches', A));
await check('a claim with no record in that church reads no settings', 'deny', get('noRecord', 'churches', B, 'settings', 'x'));
await check('alpha\'s master admin is only a member in beta: reads beta\'s news', 'allow', get('both', 'churches', B, 'news', 'x'));
await check('  but cannot write beta\'s news', 'deny', put('both', 'churches', B, 'news', 'n2'));
await check('  nor beta\'s settings', 'deny', put('both', 'churches', B, 'settings', 'x'));
await check('  while still writing alpha\'s settings', 'allow', put('both', 'churches', A, 'settings', 'x'));
await check('EGBC\'s master admin who is only a member in alpha cannot write alpha\'s settings', 'deny', put('mixed', 'churches', A, 'settings', 'x'));
await check('  nor read its care routing', 'deny', get('mixed', 'churches', A, 'careRouting', 'status'));
await check('  nor read all its users', 'deny', list('mixed', 'churches', A, 'users'));
await check('  nor upload its files', 'deny', () => uploadBytes(ref(stAs('mixed'), `churches/${A}/files/m.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));
await check('EGBC\'s master admin today (top-level users, no claims) reads nothing in alpha', 'deny', get('egbc', 'churches', A, 'settings', 'x'));
await check('  nor alpha\'s users', 'deny', list('egbc', 'churches', A, 'users'));
await check('signed out reads nothing', 'deny', () => getDoc(doc(env.unauthenticatedContext().firestore(), 'churches', A, 'news', 'x')));

// ---- one church cannot see another's: every collection name ----------
let crossRun = 0;
for (const who of ['aMaster', 'aAdmin', 'aMember']) {
  await check(`${who} cannot read beta's church record`, 'deny', get(who, 'churches', B));
  for (const n of NAMES) {
    await check(`${who} cannot read beta's ${n}`, 'deny', get(who, 'churches', B, n, 'x'));
    await check(`${who} cannot list beta's ${n}`, 'deny', list(who, 'churches', B, n));
    await check(`${who} cannot write beta's ${n}`, 'deny', put(who, 'churches', B, n, 'x'));
    crossRun += 3;
  }
}
for (const n of NAMES) {
  await check(`beta's master admin cannot read alpha's ${n}`, 'deny', get('bMaster', 'churches', A, n, 'x'));
  crossRun++;
}
// The pilot collections, as a check on the check: alpha's own people get in.
for (const n of PILOT.filter(n => n !== 'users' && n !== 'careRouting')) {
  await check(`(control) alpha's master admin reads alpha's ${n}`, 'allow', get('aMaster', 'churches', A, n, 'x'));
}

// ---- files -----------------------------------------------------------
await check('FILES: a member reads their church\'s file', 'allow', () => getBytes(ref(stAs('aMember'), `churches/${A}/files/notice.pdf`)));
await check('  not the other church\'s', 'deny', () => getBytes(ref(stAs('aMember'), `churches/${B}/files/notice.pdf`)));
await check('  nor does beta\'s master admin read alpha\'s', 'deny', () => getBytes(ref(stAs('bMaster'), `churches/${A}/files/notice.pdf`)));
await check('  a member cannot upload', 'deny', () => uploadBytes(ref(stAs('aMember'), `churches/${A}/files/new.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));
await check('  an admin uploads', 'allow', () => uploadBytes(ref(stAs('aAdmin'), `churches/${A}/files/new.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));
await check('  but not to the other church', 'deny', () => uploadBytes(ref(stAs('aAdmin'), `churches/${B}/files/new.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));
await check('  alpha\'s master admin, only a member in beta, cannot upload to beta', 'deny', () => uploadBytes(ref(stAs('both'), `churches/${B}/files/new.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));
await check('  claim taken away: no read', 'deny', () => getBytes(ref(stAs('left'), `churches/${A}/files/notice.pdf`)));
await check('  EGBC\'s master admin today: no read', 'deny', () => getBytes(ref(stAs('egbc'), `churches/${A}/files/notice.pdf`)));
await check('  anything else under a church is shut', 'deny', () => uploadBytes(ref(stAs('aMaster'), `churches/${A}/other/x.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }));

await env.cleanup();
const failed = results.filter(r => !r.ok);
for (const r of results) if (!r.ok || !/cannot (read|list|write) beta's|cannot read alpha's/.test(r.name)) console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  (expected ' + r.expect + ')' + (r.why ? '\n          ' + r.why : ''));
console.log(`  (${crossRun} cross-church checks over ${NAMES.length} collection names; failures above, passes not printed)`);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
