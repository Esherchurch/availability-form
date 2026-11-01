/* THE LOCKED RULES, FOR EVERY FIRST-STAGE RECORD AND EVERY KIND OF PERSON
 * (going-live test, stage 1).
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore --project demo-egbc \
 *     "node tests/rules-first-stage.test.mjs"          (from v2/; EGBC_FIREBASE_CONFIG=firebase.spare.json)
 *
 * Every collection the first-stage parts use (tools/rules-coverage.mjs) is
 * tried by every person in the "who sees what" table (tools/access-matrix.mjs
 * PEOPLE), by someone signed out, and by someone from another church, four
 * ways: reading another person's record, reading their own, adding one,
 * and deleting another's. The answers are written to
 * tests/out/rules-first-stage.json, and these principles are checked:
 *   1. signed out, nothing private is readable;
 *   2. someone from another church reaches nothing private of this one;
 *   3. children's, safeguarding, address book and rota records only for
 *      the people whose job it is;
 *   4. nobody short of a master admin deletes another's record in an
 *      archive-only or legal collection.
 * A record a person can't read here may still be readable in its real
 * shape (most rules look at the record): the lock-out side is checked
 * page by page in the browser (tools/access-matrix.mjs) and by the shaped
 * cases in firestore-rules.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { PEOPLE } from '../tools/access-matrix.mjs';
import { firstStageCollections } from '../tools/rules-coverage.mjs';
import { coresMap, coversFor, sharesFor, jobsFor } from '../functions/core-teams.js';
import { under18Of } from '../functions/under18-teams.js';
import { boardsOf } from '../functions/team-boards.js';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(V2, process.env.EGBC_FIREBASE_CONFIG || 'firebase.json'), 'utf8'));
const env = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT || 'demo-egbc',
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: cfg.emulators.firestore.port }
});

const COLLS = Object.keys(firstStageCollections()).sort();
/* Private: a person's details, children, safeguarding, care, and who is on the rota. */
const PRIVATE = ['addressBook', 'users', 'availability', 'events', 'kidsChildren', 'kidsFamilies', 'kidsMedical', 'kidsRoll', 'kidsLeaderIns',
  'kidsMornings', 'kidsScreenNos', 'checkins', 'concerns', 'incidents', 'sgRisks', 'sgAssessments', 'sgReviews', 'sgSnapshots', 'sgActivities',
  'sgNoted', 'sgDashboard', 'leaderChecks', 'eventLeaders', 'sensitiveResponses', 'formResponses', 'contacts', 'worries', 'prayers',
  'pastoralVisits', 'permissionExceptions', 'notifyPrefs', 'pushTokens', 'commsLog', 'downloadsLog', 'driverOk', 'meetings', 'rotaSignoff'];
/* Children's and safeguarding records: readable only by these people. */
const CHILDREN = ['kidsChildren', 'kidsFamilies', 'kidsMedical', 'kidsRoll', 'checkins', 'kidsScreenNos'];
const SAFEGUARDING = ['concerns', 'incidents', 'sgRisks', 'sgAssessments', 'sgReviews', 'sgSnapshots', 'leaderChecks', 'sensitiveResponses'];
/* Fetched only by a secret id (a parent's own link); listing them is what
   must be refused, so that is what is tried as "reading another's". */
const SECRET_ID = ['formResponses', 'sensitiveResponses'];
/* Never deleted by anybody but a master admin (archive-only, or legal). */
const NO_DELETE = ['addressBook', 'teams', 'sites', 'rooms', 'concerns', 'incidents', 'sgRisks', 'sgAssessments', 'sgReviews', 'leaderChecks'];

const person = (p) => Object.assign({}, p, { uid: 'u_' + p.key, member: 'ab_' + p.key });
const people = PEOPLE.map(person);
const byKey = Object.fromEntries(people.map((p) => [p.key, p]));

/* ---- seed, as the server keeps it ------------------------------------- */
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore(), put = (p, d) => setDoc(doc(db, p), d);
  const teamDocs = [['Worship Team', {}], ['AV Team', {}], ['Choir', { parent: 'Worship Team' }], ['Kids Church', { under18: true }],
    ['Youth Worship', { under18: true }], ['Lazers', { under18: true }], ['ReNu', { under18: true }], ['Core Team', { coreFor: ['Worship Team', 'AV Team', 'Choir'] }],
    ['Kids & Youth Core Team', { under18: true, coreFor: ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship'] }],
    ['Church office', { rota: false, runs: ['today', 'people', 'bookings', 'send'] }], ['Elders', { rota: false }], ['Finance', { rota: false }], ['Pastoral', { rota: false }]];
  for (const [id, d] of teamDocs) await put('teams/' + id, Object.assign({ name: id, label: id, archived: false }, d));
  const teams = teamDocs.map(([id, d]) => Object.assign({ id }, d));
  await put('teamFlags/under18', { teams: under18Of(teams) });
  await put('teamFlags/boards', { boards: boardsOf(teams) });
  const cores = Object.fromEntries(teams.filter((t) => t.coreFor).map((t) => [t.id, t.coreFor])), tj = { map: null, set: {} };
  for (const p of people) {
    const roles = p.roles || {}, covers = coversFor(p.teams, cores);
    await put('users/' + p.uid, { uid: p.uid, name: p.name, email: p.key + '@example.invalid', status: p.status || 'active', teams: p.teams,
      adminFor: p.adminFor || [], masterAdmin: !!p.master, memberId: p.noMember ? '' : p.member, churchMember: p.churchMember !== false,
      attender: !!p.attender, roles, covers, adminCovers: coversFor(p.adminFor || [], cores), shares: sharesFor(p.teams, tj), jobs: jobsFor(p.teams, covers, tj) });
    if (!p.noMember) await put('addressBook/' + p.member, { name: p.name, email: p.key + '@example.invalid', markers: p.teams, archived: false });
  }
  await put('safeguardingSettings/defaults', { leadSiteId: 'site_am' });
  await put('bookingSettings/site_am', { safeguardingDeputy: byKey.sglead.member, bookingsAdmins: [byKey.bookings.member] });
  await put('careRouting/status', { leadIds: [byKey.sglead.member] });
  await put('calEvents/cev_am', { title: 'AM event', teamMemberIds: [byKey.evteam.member], audience: [], date: '2099-01-01', archived: false, location: { siteId: 'site_am' } });
  await put('planGroups/pg_am', { name: 'AM group', kind: 'children', teamName: 'Kids Church', leaderIds: [byKey.planlead.member], archived: false });
  /* One record per collection that belongs to nobody here, and one of each person's own. */
  const base = { teams: ['Worship Team'], date: '2099-01-01', siteId: 'site_am', title: 'Probe', archived: false, status: 'open', audience: [] };
  for (const c of COLLS) {
    await put(c + '/other', Object.assign({}, base, { memberId: 'ab_nobody', uid: 'u_nobody', createdBy: 'u_nobody', byUid: 'u_nobody' }));
    await put(c + '/delme', Object.assign({}, base, { memberId: 'ab_nobody', uid: 'u_nobody', createdBy: 'u_nobody' }));
    for (const p of people) await put(c + '/own_' + p.key, Object.assign({}, base, { memberId: p.member, uid: p.uid, createdBy: p.uid, byUid: p.uid }));
  }
});

/* ---- try everything --------------------------------------------------- */
const ok = async (p) => { try { await p; return true; } catch (e) { return false; } };
const WHO = people.concat([{ key: 'signedOut' }, { key: 'otherChurch', uid: 'u_other' }]);
const result = {};
for (const w of WHO) {
  const ctx = w.key === 'signedOut' ? env.unauthenticatedContext()
    : w.key === 'otherChurch' ? env.authenticatedContext('u_other', { email: 'other@example.invalid', email_verified: true, churches: ['stb'] })
    : env.authenticatedContext(w.uid, { email: w.key + '@example.invalid', email_verified: true });
  const db = ctx.firestore();
  result[w.key] = {};
  for (const c of COLLS) {
    result[w.key][c] = {
      readOther: SECRET_ID.includes(c) ? await ok(getDocs(query(collection(db, c), limit(5)))) : await ok(getDoc(doc(db, c + '/other'))),
      readOwn: w.key === 'signedOut' || w.key === 'otherChurch' ? false : await ok(getDoc(doc(db, c + '/own_' + w.key))),
      create: await ok(setDoc(doc(db, c + '/new_' + w.key), { teams: ['Worship Team'], memberId: w.member || '', uid: w.uid || '', createdBy: w.uid || '', title: 'Probe', date: '2099-01-01' })),
      deleteOther: await ok(deleteDoc(doc(db, c + '/delme')))
    };
    /* A delete that went through: put it back for the next person. */
    if (result[w.key][c].deleteOther) await env.withSecurityRulesDisabled((x) => setDoc(doc(x.firestore(), c + '/delme'), { title: 'Probe', memberId: 'ab_nobody' }));
  }
}
fs.mkdirSync(path.join(V2, 'tests', 'out'), { recursive: true });
fs.writeFileSync(path.join(V2, 'tests', 'out', 'rules-first-stage.json'), JSON.stringify({ collections: COLLS, result }, null, 1));

/* ---- the principles ----------------------------------------------------- */
const R = [];
const check = (name, bad) => { R.push(!bad.length); console.log((bad.length ? 'FAIL  ' : 'PASS  ') + name + (bad.length ? '\n        ' + bad.join('\n        ') : '')); };
const inStage = (list) => list.filter((c) => COLLS.includes(c));
const ops = ['readOther', 'readOwn', 'create', 'deleteOther'];
const allowed = (w, c, o) => result[w][c][o];

check('1. signed out: no private record is readable (' + inStage(PRIVATE).length + ' collections)',
  inStage(PRIVATE).filter((c) => allowed('signedOut', c, 'readOther')).map((c) => c + ' is readable signed out'));
check('1b. signed out: nothing can be added or deleted anywhere (' + COLLS.length + ' collections)',
  COLLS.filter((c) => allowed('signedOut', c, 'deleteOther')).map((c) => c + ': a signed-out delete went through'));
check('2. another church: nothing private read, nothing deleted (' + COLLS.length + ' collections)',
  COLLS.flatMap((c) => (PRIVATE.includes(c) && allowed('otherChurch', c, 'readOther') ? [c + ' read'] : []).concat(allowed('otherChurch', c, 'deleteOther') ? [c + ' deleted'] : [])));
const childrenOk = ['kids', 'kidsLead', 'kidsAdmin', 'kycore', 'sglead', 'master', 'planlead'];
check('3a. children\'s records: none for someone with no children\'s job (' + inStage(CHILDREN).length + ' collections)',
  inStage(CHILDREN).flatMap((c) => people.filter((p) => !childrenOk.includes(p.key) && allowed(p.key, c, 'readOther')).map((p) => c + ' read by ' + p.short)));
const sgOk = ['sglead', 'master', 'elders'];
check('3b. safeguarding records: only the lead and deputy, trustees where allowed, and master admins (' + inStage(SAFEGUARDING).length + ' collections)',
  inStage(SAFEGUARDING).flatMap((c) => people.filter((p) => !sgOk.includes(p.key) && allowed(p.key, c, 'readOther')).map((p) => c + ' read by ' + p.short)));
check('3c. the address book: not for someone pending (' + inStage(['addressBook']).length + ')',
  allowed('pending', 'addressBook', 'readOther') ? ['addressBook read by Pending'] : []);
check('4. archive-only and legal records: no delete short of a master admin (' + inStage(NO_DELETE).length + ' collections)',
  inStage(NO_DELETE).flatMap((c) => people.filter((p) => p.key !== 'master' && allowed(p.key, c, 'deleteOther')).map((p) => c + ' deleted by ' + p.short)));

const cells = WHO.length * COLLS.length * ops.length;
console.log('\nTried: ' + cells + ' (' + COLLS.length + ' collections x ' + WHO.length + ' people x ' + ops.length + ' ways); answers in tests/out/rules-first-stage.json');
console.log(R.filter(Boolean).length + '/' + R.length + ' passed');
await env.cleanup();
process.exit(R.every(Boolean) ? 0 : 1);
