/* A TEAM ADMIN AND A PERSON'S ROLE ON A TEAM, AGAINST THE LOCKED RULES (6 Nov 2026).
 *
 *   npx firebase emulators:exec --config firebase.events.json --only firestore --project egbc-worship-planner \
 *     "node tests/stage3/team-admin-roles.rules.test.mjs"        (from v2/; made-up records only; RULES_PORT for a spare emulator)
 *
 * roles maps a team to Member, Leader or Admin. In a church, churchBookToUsers
 * copies the address book's roles onto users, and a leader on any team may book
 * rooms (leadsOrCore). Before, a team admin's change to roles was not checked
 * in the address book, so they could make anyone a leader of any team; and on
 * users it was refused outright, though the People tab offers it. Now a team
 * admin may change roles in both places, for their own teams only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = await initializeTestEnvironment({ projectId: 'egbc-worship-planner',
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: +(process.env.RULES_PORT || 8182) } });

const R = [];
const ok = (name, pass) => { R.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name); };
const allowed = async (p) => { try { await assertSucceeds(p); return true; } catch (e) { return false; } };
const refused = async (p) => { try { await assertFails(p); return true; } catch (e) { return false; } };

const KIDS = 'Kids Church', WORSHIP = 'Worship Team';
/* each check starts from the same records */
async function fresh() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore(), put = (p, d) => setDoc(doc(db, p), d);
    const person = (k, teams, adminFor, master, roles) => Promise.all([
      put('users/u_' + k, { memberId: 'm_' + k, name: k + ' (synthetic)', email: k + '@example.invalid', status: 'active', teams, adminFor, masterAdmin: master, roles }),
      put('addressBook/m_' + k, { name: k + ' (synthetic)', email: k + '@example.invalid', markers: teams, adminFor, roles })]);
    await person('kidsAdmin', [KIDS], [KIDS], false, { [KIDS]: 'admin' });
    await person('master', [], [], true, {});
    /* on both teams: a member of Kids Church, a leader on the worship team */
    await person('pat', [KIDS, WORSHIP], [], false, { [KIDS]: 'member', [WORSHIP]: 'leader' });
  });
}
const as = (k) => env.authenticatedContext('u_' + k, { email: k + '@example.invalid', email_verified: true }).firestore();

try {
  for (const where of ['addressBook/m_pat', 'users/u_pat']) {
    const what = where.startsWith('users') ? 'THEIR SIGN-IN RECORD (users)' : 'THE ADDRESS BOOK';
    await fresh();
    ok(what + ': the Kids Church admin makes Pat a Kids Church leader',
      await allowed(updateDoc(doc(as('kidsAdmin'), where), { roles: { [KIDS]: 'leader', [WORSHIP]: 'leader' } })));
    await fresh();
    ok('   and back to a member', await allowed(updateDoc(doc(as('kidsAdmin'), where), { roles: { [KIDS]: 'member', [WORSHIP]: 'leader' } })));
    await fresh();
    ok('   but cannot make Pat an admin of the worship team, which isn\'t theirs',
      await refused(updateDoc(doc(as('kidsAdmin'), where), { roles: { [KIDS]: 'member', [WORSHIP]: 'admin' } })));
    await fresh();
    ok('   nor take away Pat\'s worship team role',
      await refused(updateDoc(doc(as('kidsAdmin'), where), { roles: { [KIDS]: 'member' } })));
    await fresh();
    ok('   nor add a role on a team they don\'t run',
      await refused(updateDoc(doc(as('kidsAdmin'), where), { roles: { [KIDS]: 'member', [WORSHIP]: 'leader', 'Elders': 'leader' } })));
    await fresh();
    ok('   a master admin may change any of them',
      await allowed(updateDoc(doc(as('master'), where), { roles: { [KIDS]: 'admin', [WORSHIP]: 'member' } })));
    await fresh();
    ok('   Pat cannot make themselves a leader',
      await refused(updateDoc(doc(as('pat'), where), { roles: { [KIDS]: 'leader', [WORSHIP]: 'leader' } })));
  }
} finally {
  await env.cleanup();
}
const n = R.filter(Boolean).length;
console.log('\n' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
