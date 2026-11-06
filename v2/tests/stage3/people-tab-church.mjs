/* THE HUB'S PEOPLE TAB IN A CHURCH (the People-tab finding, 6 Nov 2026: a
 * stopper for any church). A church's users records are the server's to
 * write, so the tab saves teams and roles to the address book (the server's
 * mirror carries them across) and links, unlinks and "Which of you is
 * this?" through churchLinkSignIn. Run in a made-up parish, "St Bede's,
 * Sampleton (synthetic)", on the spare emulators with the church rules:
 *
 *   firebase emulators:exec --config firebase.churches-spare.json \
 *     --only firestore,auth,functions --project egbc-worship-planner \
 *     "node tests/stage3/people-tab-church.mjs"
 *
 * It drives the tab's own functions (openAdmin, toggleTeam, setRole,
 * linkPerson, unlinkPerson, repoint; EGBCAuth.chooseIdentity), as the
 * buttons do, and reads what the server wrote. Each step: no "Could not"
 * alert, and no refused write in the console.
 */
import { serve, browser, person, signIn, put, get, wipe, inChurch, sleep } from '../stage2/harness.mjs';

const PARISH = 'st-bedes-ppl';
const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const J = (x) => JSON.stringify(x);
/* The server's mirror and callable run on the functions emulator: wait for it. */
const until = async (f, ms = 20000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await f(); if (v) return v; await sleep(400); } return v; };

await wipe();
inChurch(PARISH);
await put('teams/Worship Team', { name: 'Worship Team', label: 'Worship Team', colour: '#3d6263', rota: true, runs: [], archived: false });
await put('teams/AV Team', { name: 'AV Team', label: 'AV Team', colour: '#6b4a7a', rota: true, runs: [], archived: false });
/* Master on the address book record too: in a church the server copies the
   record onto the sign-in (churchBookToUsers), so a master only on users
   would be undone - as it should be. */
const mo = await person({ key: 'ppl_mo', name: 'Mo Master (synthetic)', teams: [], master: true, book: { masterAdmin: true } });
const ty = await person({ key: 'ppl_ty', name: 'Ty Teamadmin (synthetic)', teams: ['Worship Team'], adminFor: ['Worship Team'] });
const wo = await person({ key: 'ppl_wo', name: 'Wo Worship (synthetic)', teams: ['Worship Team'] });
const nu = await person({ key: 'ppl_nu', name: 'Nu Newcomer (synthetic)', teams: ['Worship Team'] });
await put('addressBook/ab_ppl_other', { name: 'Other Person (synthetic)', email: 'ppl_nu@example.invalid', markers: ['AV Team'], churchMember: true, archived: false, isMinor: false });
/* Nu signed in but is not linked yet: the record as hqJoinChurch leaves an unmatched one. */
const unlinked = { uid: nu.uid, email: nu.email, name: '', memberId: null, teams: [], roles: {}, adminFor: [], masterAdmin: false, attender: false, churchMember: false, runs: [], status: 'pending' };
await put('users/' + nu.uid, unlinked);

const PORT = 8973;
const server = await serve(PORT);
const base = 'http://localhost:' + PORT;
const b = await browser();
const page = await b.newPage();
const refused = [];
page.on('console', (m) => { if (m.type() === 'error' && /permission|insufficient/i.test(m.text())) refused.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => refused.push('pageerror: ' + String(e.message).slice(0, 200)));
const asked = () => page.evaluate(() => (window.__asked || []).splice(0));
const failed = (a) => a.filter((x) => x[0] === 'alert' && /Could not|refused|denied/i.test(x[1]));

async function hubAs(p) {
  await signIn(page, base, p, 'hub.html');
  await page.waitForFunction(() => window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile() && typeof openAdmin === 'function', { timeout: 30000 });
  await page.evaluate(() => { openAdmin(); });
  await page.waitForFunction(() => typeof PEOPLE !== 'undefined' && PEOPLE.length > 0, { timeout: 20000 });
  await asked();
}

try {
  /* ---- a master admin ---- */
  await hubAs(mo);
  const listed = await page.evaluate(() => document.getElementById('peopleList').innerText);
  ok('1. A MASTER ADMIN opens People: every sign-in is listed, the unlinked one marked', /Wo Worship/.test(listed) && /Needs linking/i.test(listed), listed.slice(0, 300));

  await page.evaluate((u) => toggleTeam(u, 'AV Team', true), wo.uid);
  let a = await asked();
  const bookAV = await until(async () => ((await get('addressBook/' + wo.member)) || {}).markers?.includes('AV Team'));
  const userAV = await until(async () => ((await get('users/' + wo.uid)) || {}).teams?.includes('AV Team'));
  ok('2. ticks a team: saved to the address book, and the server carries it to the sign-in', !failed(a).length && bookAV && userAV, J(a) + ' book=' + bookAV + ' user=' + userAV);

  await page.evaluate((u) => setRole(u, 'Worship Team', 'leader'), wo.uid);
  a = await asked();
  const roleIn = await until(async () => (((await get('users/' + wo.uid)) || {}).roles || {})['Worship Team'] === 'leader');
  ok('3. makes them a Worship Team leader: the role reaches the sign-in', !failed(a).length && roleIn, J(a) + ' ' + J(await get('users/' + wo.uid)));

  await page.evaluate((u) => linkPerson(u, 'ab_ppl_nu'), nu.uid);
  a = await asked();
  let u = await until(async () => { const x = await get('users/' + nu.uid); return x && x.memberId === 'ab_ppl_nu' ? x : null; });
  const onList = ((await get('addressBook/ab_ppl_nu')) || {}).signInEmails || [];
  ok('4. links the unlinked sign-in: linked by an admin, the record\'s teams, on its sign-in list',
    !failed(a).length && u && u.linkedBy === 'admin' && J(u.teams) === J(['Worship Team']) && u.status === 'active' && onList.includes(nu.email), J(a) + ' ' + J(u) + ' ' + J(onList));

  await page.evaluate((x) => unlinkPerson(x), nu.uid);
  a = await asked();
  u = await until(async () => { const x = await get('users/' + nu.uid); return x && x.memberId === null ? x : null; });
  ok('5. unlinks it: pending, no teams, no access left', !failed(a).length && u && u.status === 'pending' && J(u.teams) === '[]' && J(u.adminFor) === '[]' && u.masterAdmin === false, J(a) + ' ' + J(u));

  await page.evaluate((x) => linkPerson(x, 'ab_ppl_nu'), nu.uid);
  await until(async () => ((await get('users/' + nu.uid)) || {}).memberId === 'ab_ppl_nu');
  await asked();
  await page.evaluate(() => loadPeople());
  await page.evaluate((x) => repoint(x), nu.uid);
  a = await asked();
  u = await until(async () => { const x = await get('users/' + nu.uid); return x && x.memberId === null ? x : null; });
  ok('6. "Wrong person?" detaches it the same way', !failed(a).length && u && u.status === 'pending', J(a) + ' ' + J(u));
  ok('   and nothing the master admin did was refused in the console', refused.length === 0, J(refused));

  /* ---- a team admin ---- */
  refused.length = 0;
  await hubAs(ty);
  await page.evaluate((x) => linkPerson(x, 'ab_ppl_nu'), nu.uid);
  a = await asked();
  u = await until(async () => { const x = await get('users/' + nu.uid); return x && x.memberId === 'ab_ppl_nu' ? x : null; });
  ok('7. A TEAM ADMIN links someone on their own team', !failed(a).length && !!u, J(a) + ' ' + J(await get('users/' + nu.uid)));

  await page.evaluate(() => loadPeople());
  await page.evaluate((x) => setRole(x, 'Worship Team', 'member'), wo.uid);
  a = await asked();
  const back = await until(async () => (((await get('users/' + wo.uid)) || {}).roles || {})['Worship Team'] === 'member');
  ok('8. sets a role on their own team', !failed(a).length && back, J(a) + ' ' + J(await get('users/' + wo.uid)));

  await page.evaluate((x) => toggleTeam(x, 'AV Team', false), wo.uid);
  a = await asked();
  await sleep(1500);
  ok('9. is stopped from changing a team they do not run, and told why', a.some((x) => /only change teams you administer/i.test(x[1]))
    && ((await get('addressBook/' + wo.member)) || {}).markers?.includes('AV Team'), J(a));

  await page.evaluate((x) => unlinkPerson(x), nu.uid);
  a = await asked();
  await sleep(1500);
  ok('10. is told only a master admin can unlink, and the link stays', a.some((x) => /Only a master admin/i.test(x[1])) && ((await get('users/' + nu.uid)) || {}).memberId === 'ab_ppl_nu', J(a));

  /* ---- the person themselves ---- */
  await put('users/' + nu.uid, Object.assign({}, unlinked, { status: 'ambiguous',
    candidates: [{ id: 'ab_ppl_nu', name: 'Nu Newcomer (synthetic)', admin: false }, { id: 'ab_ppl_other', name: 'Other Person (synthetic)', admin: false }] }));
  refused.length = 0;
  await signIn(page, base, nu, 'hub.html');
  await page.waitForFunction(() => /Which of you is this\?/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
  const card = await page.evaluate(() => document.body.innerText);
  ok('11. A SHARED ADDRESS: the person is asked "Which of you is this?"', /Which of you is this\?/.test(card), card.slice(0, 300));
  await page.evaluate(() => EGBCAuth.chooseIdentity('ab_ppl_other'));
  u = await until(async () => { const x = await get('users/' + nu.uid); return x && x.memberId === 'ab_ppl_other' ? x : null; });
  ok('    picks themselves: linked by themselves, with that record\'s teams', u && u.linkedBy === 'self' && J(u.teams) === J(['AV Team']) && u.candidates === undefined, J(u));

  /* ---- an unlinked person opening a page ---- */
  await put('users/' + nu.uid, unlinked);
  refused.length = 0;
  await signIn(page, base, nu, 'hub.html');
  await sleep(4000);
  const seen = await page.evaluate(() => document.body.innerText);
  ok('12. AN UNLINKED PERSON opens the hub: no "Something went wrong", no raw error, nothing refused',
    !/Something went wrong|insufficient permissions|permission-denied/i.test(seen) && refused.length === 0, seen.slice(0, 300) + ' ' + J(refused));
} catch (e) {
  ok('the run finished', false, e.stack);
}
await b.close().catch(() => {});
server.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
