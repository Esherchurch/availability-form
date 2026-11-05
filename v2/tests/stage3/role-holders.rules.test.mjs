/* PEOPLE WITH A ROLE AND NO TEAM, AGAINST THE LOCKED RULES (Martin, 5 Nov 2026).
 *
 *   npx firebase emulators:exec --config firebase.events.json --only firestore --project egbc-worship-planner \
 *     "node tests/stage3/role-holders.rules.test.mjs"            (from v2/; made-up records only)
 *
 * Twice someone with a role but on no team was shut out: the F-324 register,
 * then the safeguarding lead, refused an event's leaders, so they never saw
 * "Sign it off" and the event's bookings never opened. Many churches' role
 * holders are on no team. For each kind - the safeguarding lead and deputy,
 * a trustee, the health and safety lead and fire safety lead, the office, a
 * kids lead, an event's organiser and a bookings admin - this checks the
 * reads their pages make, against firestore.build.rules (what deploys):
 *   - each one their job needs is allowed;
 *   - and the widening stops where their job does: another site's event, an
 *     event they don't run, records that are not theirs to see.
 * The page-by-page side (what each must see, and any read refused on their
 * screens) is the Stage 3 audit's (tests/stage3/states.mjs must and reads).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = await initializeTestEnvironment({ projectId: 'egbc-worship-planner',
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();

const R = [];
const ok = (name, pass, why) => { R.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 300))); };
const allowed = async (p) => { try { await assertSucceeds(p); return true; } catch (e) { return false; } };
const refused = async (p) => { try { await assertFails(p); return true; } catch (e) { return false; } };

/* the people: each on no team unless their role is a team by its nature (a trustee, the office, a kids lead) */
const P = {
  sgLead: { teams: [], adminFor: [] }, sgDeputy: { teams: [], adminFor: [] }, hsLead: { teams: [], adminFor: [] }, fireLead: { teams: [], adminFor: [] },
  organiser: { teams: [], adminFor: [] }, bookingsAdmin: { teams: [], adminFor: [] }, nobody: { teams: [], adminFor: [] },
  trustee: { teams: ['Elders'], adminFor: [] }, office: { teams: ['Church office'], adminFor: [] }, kidsLead: { teams: [], adminFor: ['Kids Church'] }
};
const A = 'site_a', B = 'site_b';
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore(), put = (p, d) => setDoc(doc(db, p), d);
  for (const k of Object.keys(P)) {
    await put('users/u_' + k, { memberId: 'm_' + k, name: k + ' (synthetic)', email: k + '@example.invalid', status: 'active', teams: P[k].teams, adminFor: P[k].adminFor, masterAdmin: false });
    await put('addressBook/m_' + k, { name: k + ' (synthetic)', email: k + '@example.invalid', markers: P[k].teams, adminFor: P[k].adminFor });
  }
  await put('bookingSettings/' + A, { safeguardingLead: 'm_sgLead', safeguardingDeputy: 'm_sgDeputy', bookingsAdmins: ['m_bookingsAdmin'] });
  await put('bookingSettings/' + B, { safeguardingLead: 'm_nobody', safeguardingDeputy: '', bookingsAdmins: [] });
  /* a building with a deputy and no lead (Martin, 5 Nov 2026) */
  await put('bookingSettings/site_c', { safeguardingLead: '', safeguardingDeputy: 'm_sgDeputy', bookingsAdmins: [] });
  await put('safeguardingSettings/defaults', { leadSiteId: A, trusteeTeam: 'Elders', ratioAll: 5 });
  await put('raSiteRoles/' + A, { hsLead: 'm_hsLead', hsDeputy: '', fireLead: 'm_fireLead' });
  await put('kidsSettings/' + A, { teams: ['Kids Church'], formId: 'form_k' });
  await put('kidsSettings/' + B, { teams: ['Kids Church'] });
  const ev = (site, team) => ({ title: 'Holiday club (synthetic)', location: { kind: 'room', siteId: site }, teamMemberIds: team, teamUids: team.map((m) => 'u_' + m.slice(2)), under18: true, status: 'confirmed' });
  await put('calEvents/ev_a', ev(A, ['m_organiser']));
  await put('calEvents/ev_b', ev(B, []));
  await put('eventLeaders/ev_a', { siteId: A, under18: true, leaders: [{ memberId: 'm_kidsLead', name: 'Kids lead (synthetic)' }], leaderIds: ['m_kidsLead'], leaderUids: ['u_kidsLead'] });
  await put('eventLeaders/ev_b', { siteId: B, under18: true, leaders: [], leaderIds: [], leaderUids: [] });
  await put('eventForms/ev_a', { forms: [{ formId: 'form_k' }] });
  await put('eventForms/ev_b', { forms: [{ formId: 'form_k' }] });
  await put('eventExceptions/ev_a__m_kidsLead', { calEventId: 'ev_a', memberId: 'm_kidsLead', siteId: A, reason: 'Synthetic' });
  await put('planGroups/pg_a', { siteId: A, name: 'Little ones (synthetic)', kind: 'children', leaderIds: [], teamName: 'Kids Church' });
  await put('planGroups/pg_b', { siteId: B, name: 'Youth (synthetic)', kind: 'youth', leaderIds: [], teamName: 'Youth' });
  await put('raAssessments/ra_a', { siteId: A, kind: 'fire', status: 'draft' });
  await put('events/rota_1', { date: '2026-12-06', type: 'Sunday (synthetic)', assignments: {} });
});
const as = (k) => env.authenticatedContext('u_' + k, { email: k + '@example.invalid', email_verified: true }).firestore();
const get = (db, p) => getDoc(doc(db, p));

try {
  /* THE SAFEGUARDING LEAD AND DEPUTY, on no team */
  for (const k of ['sgLead', 'sgDeputy']) {
    const db = as(k), who = k === 'sgLead' ? 'THE SAFEGUARDING LEAD' : 'THE DEPUTY';
    ok(who + ' (no team) reads their site\'s event\'s leaders (the stopper)', await allowed(get(db, 'eventLeaders/ev_a')));
    ok('   an event with no leaders yet: nothing to read, not refused', await allowed(get(db, 'eventLeaders/ev_none')));
    ok('   the forms the event asks for', await allowed(get(db, 'eventForms/ev_a')));
    ok('   the exceptions at the event, for their site', await allowed(getDocs(query(collection(db, 'eventExceptions'), where('calEventId', '==', 'ev_a'), where('siteId', '==', A)))));
    ok('   the safeguarding settings', await allowed(get(db, 'safeguardingSettings/defaults')));
    ok('   the hub\'s people, to name leaders', await allowed(getDocs(collection(db, 'users'))) && await allowed(get(db, 'addressBook/m_kidsLead')) && await allowed(getDocs(collection(db, 'addressBook'))));
    ok('   the children\'s teams (the register and the Menu)', await allowed(getDocs(collection(db, 'kidsSettings'))));
    ok('   the rota, for "From the rota"', await allowed(get(db, 'events/rota_1')));
    ok('   their site\'s plan groups (the risk register)', await allowed(getDocs(query(collection(db, 'planGroups'), where('siteId', '==', A)))));
    ok('   but NOT another site\'s event\'s leaders, forms or plan groups', await refused(get(db, 'eventLeaders/ev_b')) && await refused(get(db, 'eventForms/ev_b'))
      && await refused(getDocs(query(collection(db, 'planGroups'), where('siteId', '==', B)))));
  }
  /* THE HEALTH AND SAFETY LEAD AND FIRE SAFETY LEAD, on no team */
  {
    const db = as('hsLead');
    ok('THE HEALTH AND SAFETY LEAD (no team) reads their building\'s event\'s leaders (the numbers they approve)', await allowed(get(db, 'eventLeaders/ev_a')));
    ok('   their building\'s assessments and roles', await allowed(get(db, 'raAssessments/ra_a')) && await allowed(get(db, 'raSiteRoles/' + A)));
    ok('   but NOT another building\'s event\'s leaders, nor the hub\'s people or the safeguarding settings', await refused(get(db, 'eventLeaders/ev_b'))
      && await refused(getDocs(collection(db, 'users'))) && await refused(get(db, 'addressBook/m_kidsLead')) && await refused(get(db, 'safeguardingSettings/defaults')));
    const f = as('fireLead');
    ok('THE FIRE SAFETY LEAD (no team) reads their building\'s fire assessment and roles', await allowed(get(f, 'raAssessments/ra_a')) && await allowed(get(f, 'raSiteRoles/' + A)));
    ok('   and their building\'s event\'s leaders', await allowed(get(f, 'eventLeaders/ev_a')));
  }
  /* AN EVENT'S ORGANISER, on no team */
  {
    const db = as('organiser');
    ok('AN ORGANISER (no team) reads their event\'s leaders and the forms it asks for', await allowed(get(db, 'eventLeaders/ev_a')) && await allowed(get(db, 'eventForms/ev_a')));
    ok('   but NOT another event\'s, nor the hub\'s people, the safeguarding settings or the rota', await refused(get(db, 'eventLeaders/ev_b')) && await refused(get(db, 'eventForms/ev_b'))
      && await refused(getDocs(collection(db, 'users'))) && await refused(get(db, 'safeguardingSettings/defaults')) && await refused(get(db, 'events/rota_1')));
  }
  /* A BOOKINGS ADMIN, on no team */
  {
    const db = as('bookingsAdmin');
    ok('A BOOKINGS ADMIN (no team) reads their building\'s bookings and its settings', await allowed(getDocs(query(collection(db, 'bookings'), where('siteId', '==', A)))) && await allowed(get(db, 'bookingSettings/' + A)));
    ok('   but NOT another building\'s bookings', await refused(getDocs(query(collection(db, 'bookings'), where('siteId', '==', B)))));
  }
  /* ROLES THAT ARE A TEAM BY THEIR NATURE: a trustee (the trustee team), the office (its team), a kids lead
     (an admin of the children's team) - on no other team, they read what their pages need as before */
  ok('A TRUSTEE (the trustee team only) reads the safeguarding settings and an event\'s leaders', await allowed(get(as('trustee'), 'safeguardingSettings/defaults')) && await allowed(get(as('trustee'), 'eventLeaders/ev_a')));
  ok('THE OFFICE (its own team only) reads the hub\'s people and an event\'s leaders', await allowed(getDocs(collection(as('office'), 'users'))) && await allowed(get(as('office'), 'eventLeaders/ev_a')));
  ok('A KIDS LEAD (an admin of the children\'s team, on no team) reads the children\'s teams and an event\'s leaders', await allowed(getDocs(collection(as('kidsLead'), 'kidsSettings'))) && await allowed(get(as('kidsLead'), 'eventLeaders/ev_a')));
  /* A CHURCH WITH ONLY A DEPUTY: the building leadSite chooses (functions/notify.js, 55d26a8a) is the one the
     rules read (safeguardingSettings/defaults.leadSiteId, which refreshCareStatus records), and the deputy
     reads what is sent there */
  {
    const concern = (id) => ({ siteId: 'site_c', calEventId: '', about: '', concern: 'A made-up worry (synthetic)', reportedBy: 'u_office', reportedByName: 'office (synthetic)', createdAt: new Date().toISOString(), status: 'new' });
    ok('A DEPUTY-ONLY BUILDING: an adult can report a concern there (it was refused: no lead)', await allowed(setDoc(doc(as('office'), 'concerns/con_c1'), concern())));
    ok('   and the deputy reads it, and nobody else on no team does', await allowed(get(as('sgDeputy'), 'concerns/con_c1')) && await refused(get(as('sgLead'), 'concerns/con_c1')) && await refused(get(as('hsLead'), 'concerns/con_c1')));
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'safeguardingSettings/defaults'), { leadSiteId: 'site_c', trusteeTeam: 'Elders' }));
    ok('   with it as the church\'s safeguarding building (leadSiteId), the deputy is its lead for the rules (sgLeadOrDeputy)', await allowed(get(as('sgDeputy'), 'safeguardingSettings/defaults')) && await allowed(getDocs(collection(as('sgDeputy'), 'users'))));
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'safeguardingSettings/defaults'), { leadSiteId: A, trusteeTeam: 'Elders', ratioAll: 5 }));
  }
  /* and nothing widened for someone with no role */
  { const db = as('nobody');
    ok('SOMEONE WITH NO ROLE AND NO TEAM still reads none of it (a lead of another site only)', await refused(get(db, 'eventLeaders/ev_a')) && await refused(get(db, 'eventForms/ev_a'))
      && await refused(getDocs(collection(db, 'users'))) && await refused(get(db, 'safeguardingSettings/defaults')) && await refused(getDocs(collection(db, 'kidsSettings')))); }
} catch (e) { ok('the run finished', false, e.stack); }

await env.cleanup();
const failed = R.filter((x) => !x).length;
console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
process.exit(failed ? 1 : 0);
