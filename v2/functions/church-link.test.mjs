/* A CHURCH'S PEOPLE TAB (the People-tab finding, 6 Nov 2026: a stopper for
 * any church). A church's users records are the server's to write, so the
 * hub's link, unlink, "Wrong person?" and "Which of you is this?" go
 * through churchLinkSignIn, and teams and roles ticked on the People tab
 * reach the sign-in through the address book mirror.
 *
 *   node --test functions/church-link.test.mjs   (Firestore emulator on FIRESTORE_EMULATOR_HOST, default 127.0.0.1:8181)
 *
 * A made-up church 'linktest' and made-up people. Who may do what is EGBC's
 * users rules, field for field (church-join.js linkSignIn).
 */
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { linkSignIn, membershipFrom, standDownShared } from './church-join.js';

initializeApp({ projectId: 'demo-church-link' });
const root = getFirestore().collection('churches').doc('linktest');
const U = (id) => root.collection('users').doc(id);
const B = (id) => root.collection('addressBook').doc(id);
const get = async (r) => (await r.get()).data();

async function church() {
  for (const c of ['users', 'addressBook']) {
    const all = await root.collection(c).get();
    await Promise.all(all.docs.map((d) => d.ref.delete()));
  }
  await B('m_mo').set({ name: 'Mo Master', email: 'mo@example.invalid', masterAdmin: true, markers: [] });
  await B('m_ty').set({ name: 'Ty Teamadmin', email: 'ty@example.invalid', adminFor: ['Worship Team'], markers: ['Worship Team'] });
  await B('m_wo').set({ name: 'Wo Worship', email: 'wo@example.invalid', markers: ['Worship Team'], roles: { 'Worship Team': 'leader', 'AV Team': 'leader' } });
  await B('m_av').set({ name: 'Av Only', email: 'av@example.invalid', markers: ['AV Team'] });
  await B('m_boss').set({ name: 'Boss Admin', email: 'boss@example.invalid', adminFor: ['Worship Team'], markers: ['Worship Team'] });
  await U('u_mo').set(Object.assign({ uid: 'u_mo', email: 'mo@example.invalid', memberId: 'm_mo', linkedBy: 'auto' }, membershipFrom(await get(B('m_mo')))));
  await U('u_ty').set(Object.assign({ uid: 'u_ty', email: 'ty@example.invalid', memberId: 'm_ty', linkedBy: 'auto' }, membershipFrom(await get(B('m_ty')))));
  await U('u_new').set({ uid: 'u_new', email: 'new@example.invalid', memberId: null, teams: [], status: 'pending' });
}

test('roles come across with the teams, and only for the record\'s own teams', () => {
  const m = membershipFrom({ markers: ['Worship Team'], roles: { 'Worship Team': 'leader', 'AV Team': 'leader' } });
  assert.deepEqual(m.roles, { 'Worship Team': 'leader' });
  assert.deepEqual(membershipFrom({ markers: ['AV Team'] }).roles, {});
});

test('a master admin links a sign-in: the record\'s teams and roles, linked by an admin, on the record\'s sign-in list', async () => {
  await church();
  const r = await linkSignIn(root, { caller: 'u_mo', uid: 'u_new', memberId: 'm_wo' });
  assert.equal(r.status, 200, JSON.stringify(r));
  const u = await get(U('u_new'));
  assert.equal(u.memberId, 'm_wo'); assert.equal(u.linkedBy, 'admin'); assert.equal(u.status, 'active');
  assert.deepEqual(u.teams, ['Worship Team']); assert.deepEqual(u.roles, { 'Worship Team': 'leader' });
  assert.deepEqual((await get(B('m_wo'))).signInEmails, ['new@example.invalid']);
});

test('a master admin unlinks: every access field cleared, and off the record\'s sign-in list', async () => {
  await church();
  await linkSignIn(root, { caller: 'u_mo', uid: 'u_new', memberId: 'm_boss' });
  assert.deepEqual((await get(U('u_new'))).adminFor, ['Worship Team']);
  const r = await linkSignIn(root, { caller: 'u_mo', uid: 'u_new', memberId: null });
  assert.equal(r.status, 200);
  const u = await get(U('u_new'));
  assert.equal(u.memberId, null); assert.equal(u.status, 'pending'); assert.equal(u.linkedBy, undefined);
  assert.deepEqual(u.teams, []); assert.deepEqual(u.adminFor, []); assert.equal(u.masterAdmin, false); assert.deepEqual(u.roles, {});
  assert.deepEqual((await get(B('m_boss'))).signInEmails, []);
});

test('a team admin links to someone on their own team', async () => {
  await church();
  assert.equal((await linkSignIn(root, { caller: 'u_ty', uid: 'u_new', memberId: 'm_wo' })).status, 200);
});

test('a team admin may not link to another team\'s person, to an admin\'s record, or unlink', async () => {
  await church();
  assert.equal((await linkSignIn(root, { caller: 'u_ty', uid: 'u_new', memberId: 'm_av' })).status, 403);
  assert.equal((await linkSignIn(root, { caller: 'u_ty', uid: 'u_new', memberId: 'm_boss' })).status, 403);
  assert.equal((await linkSignIn(root, { caller: 'u_ty', uid: 'u_new', memberId: 'm_mo' })).status, 403);
  assert.equal((await linkSignIn(root, { caller: 'u_ty', uid: 'u_mo', memberId: null })).status, 403);
  assert.equal((await get(U('u_new'))).memberId, null, 'nothing written');
});

test('someone on no team, or pending, may link nobody', async () => {
  await church();
  assert.equal((await linkSignIn(root, { caller: 'u_new', uid: 'u_new', memberId: 'm_wo' })).status, 403);
  assert.equal((await linkSignIn(root, { caller: 'u_nobody', uid: 'u_new', memberId: 'm_wo' })).status, 403);
});

test('"Which of you is this?": the person picks one of their own candidates, linked by themselves', async () => {
  await church();
  await U('u_new').set({ status: 'ambiguous', candidates: [{ id: 'm_wo', name: 'Wo', admin: false }, { id: 'm_av', name: 'Av', admin: false }] }, { merge: true });
  assert.equal((await linkSignIn(root, { caller: 'u_new', uid: 'u_new', memberId: 'm_mo', choose: true })).status, 403, 'not a candidate');
  assert.equal((await linkSignIn(root, { caller: 'u_ty', uid: 'u_new', memberId: 'm_wo', choose: true })).status, 403, 'only for themselves');
  const r = await linkSignIn(root, { caller: 'u_new', uid: 'u_new', memberId: 'm_av', choose: true });
  assert.equal(r.status, 200, JSON.stringify(r));
  const u = await get(U('u_new'));
  assert.equal(u.memberId, 'm_av'); assert.equal(u.linkedBy, 'self'); assert.equal(u.candidates, undefined);
  assert.deepEqual(u.teams, ['AV Team']);
});

test('"Which of you is this?": an admin\'s record needs an administrator, unless the church has none yet', async () => {
  await church();
  await U('u_new').set({ status: 'ambiguous', candidates: [{ id: 'm_boss', name: 'Boss', admin: true }] }, { merge: true });
  assert.equal((await linkSignIn(root, { caller: 'u_new', uid: 'u_new', memberId: 'm_boss', choose: true })).status, 403);
  await U('u_mo').delete(); await U('u_ty').delete();
  const r = await linkSignIn(root, { caller: 'u_new', uid: 'u_new', memberId: 'm_boss', choose: true });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal((await get(U('u_new'))).linkedBy, 'admin');
});

test('a second record on an auto-linked person\'s address stands them down to "ambiguous"; an admin\'s link is left', async () => {
  await church();
  await U('u_wo').set(Object.assign({ uid: 'u_wo', email: 'wo@example.invalid', memberId: 'm_wo', linkedBy: 'auto' }, membershipFrom(await get(B('m_wo')))));
  await U('u_wo2').set(Object.assign({ uid: 'u_wo2', email: 'wo@example.invalid', memberId: 'm_wo', linkedBy: 'admin' }, membershipFrom(await get(B('m_wo')))));
  const child = { name: 'Wo Junior', email: 'wo@example.invalid', markers: [] };
  await B('m_wo_jr').set(child);
  await standDownShared(root, 'm_wo_jr', child);
  const u = await get(U('u_wo'));
  assert.equal(u.status, 'ambiguous'); assert.equal(u.memberId, null); assert.deepEqual(u.teams, []);
  assert.deepEqual(u.candidates.map((c) => c.id).sort(), ['m_wo', 'm_wo_jr']);
  assert.equal((await get(U('u_wo2'))).memberId, 'm_wo', 'the admin\'s link is left');
});
