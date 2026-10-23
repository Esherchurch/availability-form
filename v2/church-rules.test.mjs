/* The generated church ruleset (firestore.churches.rules; multi-church
 * step 4 part 1, FINDINGS-churchhq H-6/H-7), against the real rules engine.
 * Made-up churches mc-alpha and mc-beta only; nothing live is touched.
 *
 *   npx firebase emulators:exec --config firebase.spare.json --only firestore \
 *     --project demo-egbc "node church-rules.test.mjs"
 *   (with EGBC_FIREBASE_CONFIG=firebase.spare.json; CHURCH_RULES=<file>
 *    runs it against another copy, for a deliberate break)
 *
 * A DIFFERENTIAL TEST. The same documents are put in alpha and in beta.
 * For every collection the hub has, a master admin, an admin and a member
 * of alpha read, list and write - whatever alpha's own rules let them do
 * at home, beta must refuse them every time. Somebody whose claim names no
 * church, or who has a record in alpha but no claim, gets nothing either.
 * And at home the rules really are the hub's: a master admin can read most
 * of alpha (counted), and a member cannot write what a member cannot.
 */
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const cfg = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.json', 'utf8'));
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-egbc';
const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync(process.env.CHURCH_RULES || 'firestore.churches.rules', 'utf8'), host: '127.0.0.1', port: cfg.emulators.firestore.port },
});

const A = 'mc-alpha', B = 'mc-beta';
const LIST = JSON.parse(fs.readFileSync('tests/top-level-collections.json', 'utf8'));
const NAMES = [...new Set([...LIST.egbc])].filter((n) => n !== 'users');

/* claims: the churches in the sign-in. at: their users record in a church
   (the shape EGBC's users records have). */
const REC = (o) => Object.assign({ status: 'active', teams: [], adminFor: [], masterAdmin: false, churchMember: true, memberId: 'm_x' }, o);
const PEOPLE = {
  aMaster: { claims: [A], at: { [A]: REC({ masterAdmin: true, teams: ['Core Team'], memberId: 'm_am' }) } },
  aAdmin:  { claims: [A], at: { [A]: REC({ adminFor: ['Kids Church'], teams: ['Kids Church'], memberId: 'm_aa' }) } },
  aMember: { claims: [A], at: { [A]: REC({ teams: ['Worship Team'], memberId: 'm_amem' }) } },
  noClaim: { claims: [], at: { [A]: REC({ masterAdmin: true }) } },
  none:    { claims: undefined, at: {} }
};
const uid = (who) => 'u_cr_' + who;
const as = (who) => env.authenticatedContext(uid(who), PEOPLE[who].claims ? { churches: PEOPLE[who].claims } : {}).firestore();

await env.clearFirestore();
const SAMPLE = { made: 'up', name: 'Synthetic', title: 'Synthetic', status: 'active', archived: false, audience: ['members'], teams: ['Worship Team'] };
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  for (const cid of [A, B]) {
    await setDoc(doc(db, 'churches', cid), { name: cid });
    for (const n of NAMES) await setDoc(doc(db, 'churches', cid, n, 'x'), SAMPLE);
  }
  for (const [who, p] of Object.entries(PEOPLE)) for (const [cid, rec] of Object.entries(p.at)) await setDoc(doc(db, 'churches', cid, 'users', uid(who)), rec);
});

const results = [];
async function check(name, expect, fn) {
  try { await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn())); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, expect, ok: false, why: String(e && e.message || e).slice(0, 160) }); }
}
const tries = async (fn) => { try { await fn(); return true; } catch (e) { return false; } };

/* At home first, to know the rules are really working there. */
let homeReads = 0;
for (const n of NAMES) if (await tries(() => getDoc(doc(as('aMaster'), 'churches', A, n, 'x')))) homeReads++;
await check(`(at home) alpha's master admin reads most of alpha: ${homeReads} of ${NAMES.length} collections`, 'allow', async () => { if (homeReads < NAMES.length * 0.6) throw new Error('only ' + homeReads); });
await check("(at home) alpha's member cannot write alpha's church settings", 'deny', () => setDoc(doc(as('aMember'), 'churches', A, 'churchSettings', 'x'), { made: 'up' }));
await check("(at home) nobody writes a users record, not even the master admin", 'deny', () => setDoc(doc(as('aMaster'), 'churches', A, 'users', uid('aMember')), REC({ masterAdmin: true })));
await check("(at home) a person reads their own users record", 'allow', () => getDoc(doc(as('aMember'), 'churches', A, 'users', uid('aMember'))));

/* THE PROPERTY: somebody from another church - or with no church - gets no
   more of a church than a visitor who is not signed in at all. A church's
   public things (What's on, its forms, its booking types) are public to the
   world, its own website included, so they are open to everybody; nothing
   else is. Each operation is first tried as an anonymous visitor; where
   that is refused, everybody below must be refused too. The public ones
   are listed, to be read by eye. */
const anon = () => env.unauthenticatedContext().firestore();
const OPS = {
  read: (dbx, cid, n) => getDoc(doc(dbx, 'churches', cid, n, 'x')),
  list: (dbx, cid, n) => getDocs(collection(dbx, 'churches', cid, n)),
  write: (dbx, cid, n) => setDoc(doc(dbx, 'churches', cid, n, 'x'), SAMPLE)
};
const publicOps = {};
for (const cid of [A, B]) for (const n of NAMES) for (const [op, fn] of Object.entries(OPS)) {
  if (await tries(() => fn(anon(), cid, n))) (publicOps[op] = publicOps[op] || new Set()).add(n);
}
/* A write the anonymous probe made is put back, so the rest see the same data. */
await env.withSecurityRulesDisabled(async (c) => { for (const cid of [A, B]) for (const n of publicOps.write || []) await setDoc(doc(c.firestore(), 'churches', cid, n, 'x'), SAMPLE); });
const isPublic = (op, n) => !!(publicOps[op] && publicOps[op].has(n));

let cross = 0, open = 0;
for (const who of ['aMaster', 'aAdmin', 'aMember']) {
  await check(`${who} cannot read beta's church record`, 'deny', () => getDoc(doc(as(who), 'churches', B)));
  for (const n of NAMES) for (const [op, fn] of Object.entries(OPS)) {
    if (isPublic(op, n)) { open++; continue; }
    await check(`${who} cannot ${op} beta's ${n}`, 'deny', () => fn(as(who), B, n));
    cross++;
  }
}
/* No claim: alpha's record alone opens nothing; nor does a sign-in with none. */
for (const who of ['noClaim', 'none']) {
  for (const n of NAMES) for (const op of ['read', 'write']) {
    if (isPublic(op, n)) { open++; continue; }
    await check(`${who} cannot ${op} alpha's ${n}`, 'deny', () => OPS[op](as(who), A, n));
    cross++;
  }
}
/* EGBC's top level is not in this ruleset at all. */
await check("the top level (EGBC's paths) is shut in the church ruleset", 'deny', () => getDoc(doc(as('aMaster'), 'news', 'x')));

await env.cleanup();
const failed = results.filter((r) => !r.ok);
for (const r of results) if (!r.ok || !/cannot (read|list|write) (beta|alpha)'s/.test(r.name)) console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.why ? '\n          ' + r.why : ''));
console.log(`  (${cross} cross-church checks over ${NAMES.length} collection names; failures above, passes not printed)`);
for (const op of Object.keys(OPS)) console.log(`  public to anybody (${op}): ${[...(publicOps[op] || [])].sort().join(', ') || 'none'}`);
console.log(`  (${open} checks skipped because a visitor who is not signed in may do the same)`);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
