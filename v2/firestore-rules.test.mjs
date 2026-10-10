/* Runs the real rules engine against firestore.rules.
   Nothing here touches the live project. */

import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

/* Read the port from firebase.json rather than repeating it here. They used
   to be two numbers that had to agree, and when 8080 turned out to be taken
   on a real machine only one of them moved.
   EGBC_FIREBASE_CONFIG=firebase.events.json runs them against the events
   window's emulators instead; unset, nothing changes. */
const cfg = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.json', 'utf8'));
const PORT = cfg?.emulators?.firestore?.port ?? 8080;

/* firebase.json has singleProjectMode on, so the project the tests talk to
   has to be the one the emulator was started with. emulators:exec puts it in
   the environment; the fallback matches the --project in EMULATOR.md. */
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-egbc';

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: PORT },
});

/* ---- the people we are testing as -------------------------------- */

const PEOPLE = {
  martin: { uid: 'u_martin', teams: ['Core Team', 'AV Team'], adminFor: [], masterAdmin: true },
  karen:  { uid: 'u_karen',  teams: [], adminFor: ['Kids Church'], masterAdmin: false },
  samy:   { uid: 'u_samy',   teams: ['Worship Team', 'Kids Church'], adminFor: [], masterAdmin: false },
  isla:   { uid: 'u_isla',   teams: ['Youth Worship'], adminFor: [], masterAdmin: false },
  pending:{ uid: 'u_pending', teams: [], adminFor: [], masterAdmin: false },
  /* Section 21. Neither is on a team, and that is the point: before this
     change they would both have been 'pending' and locked out of everything.
     Attender: in the address book. Member: in it, with the office's tick. */
  attender:{ uid: 'u_attender', teams: [], adminFor: [], masterAdmin: false,
             attender: true, status: 'active' },
  renuLead:   { uid: 'u_renu_lead',   teams: ['ReNu'],   adminFor: ['ReNu'],   masterAdmin: false },
  lazersLead: { uid: 'u_lazers_lead', teams: ['Lazers'], adminFor: ['Lazers'], masterAdmin: false },
  member:  { uid: 'u_member',   teams: [], adminFor: [], masterAdmin: false,
             attender: true, churchMember: true, status: 'active' },
};

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const p of Object.values(PEOPLE)) {
    await setDoc(doc(db, 'users', p.uid), {
      memberId: 'm_' + p.uid, name: p.uid,
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin,
      attender: p.attender === true, churchMember: p.churchMember === true,
      status: p.status
        || ((p.teams.length || p.adminFor.length || p.masterAdmin) ? 'active' : 'pending'),
    });
  }
  await setDoc(doc(db, 'addressBook', 'm_u_samy'), { name: 'Samy', markers: ['Worship Team'] });
  await setDoc(doc(db, 'addressBook', 'm_u_attender'), {
    name: 'Attender Synthetic', email: 'attender@example.invalid', markers: [] });
  await setDoc(doc(db, 'addressBook', 'm_u_member'), {
    name: 'Member Synthetic', email: 'member@example.invalid', markers: [], churchMember: true });
  await setDoc(doc(db, 'news', 'n1'), { title: 'A notice', body: 'x', ackedBy: [] });
  await setDoc(doc(db, 'songs', 'sg1'), { title: 'A song' });
  await setDoc(doc(db, 'kb_howto_av', 'kb1'), { title: 'How to' });
  await setDoc(doc(db, 'availability', 'a1'), { memberId: 'm_u_samy', status: 'avail' });
  await setDoc(doc(db, 'training_portal', 'tp_x'), { note: 'practice' });
  await setDoc(doc(db, 'addressBook', 'm_attender2'), {
    name: 'Fresh Synthetic', email: 'attender2@example.invalid', markers: [] });
  await setDoc(doc(db, 'addressBook', 'm_attender3'), {
    name: 'Cached Synthetic', email: 'attender3@example.invalid', markers: ['Worship Team'] });
  /* YOUTH ACCESS. Four devices, because four states have to be told apart
     and only one of them is let in. No email address anywhere in any of
     this: the church does not hold minors' addresses (YOUTH-ACCESS.md). */
  const YEAR_ON = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const WEEK_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await setDoc(doc(db, 'youthAccess', 'u_youth_ok'), {
    memberId: 'm_young', memberName: 'Young Synthetic', grantCode: 'AAAA-1111',
    redeemedAt: WEEK_AGO, expiresAt: YEAR_ON, active: true });
  await setDoc(doc(db, 'youthAccess', 'u_youth_expired'), {
    memberId: 'm_young2', memberName: 'Lapsed Synthetic', grantCode: 'BBBB-2222',
    redeemedAt: WEEK_AGO, expiresAt: WEEK_AGO, active: true });
  await setDoc(doc(db, 'youthAccess', 'u_youth_off'), {
    memberId: 'm_young3', memberName: 'Stopped Synthetic', grantCode: 'CCCC-3333',
    redeemedAt: WEEK_AGO, expiresAt: YEAR_ON, active: false });
  /* u_youth_none has no youthAccess document at all - an anonymous account
     that never redeemed anything, which is what a stranger's phone is. */

  /* A household, for the parent requirement. The rule asks about this shape
     and not about a typed address: a child flagged Under 16 whose
     householdId is the parent's record, and that record carrying an email. */
  await setDoc(doc(db, 'addressBook', 'ab_parent'), {
    name: 'Parent Synthetic', email: 'parent.synth@example.invalid', markers: [] });
  await setDoc(doc(db, 'addressBook', 'ab_child'), {
    name: 'Child Synthetic', markers: ['Youth Worship'],
    isMinor: true, householdId: 'ab_parent' });
  /* A parent with no address on file - the case the panel refuses and the
     rule now refuses too. */
  await setDoc(doc(db, 'addressBook', 'ab_parent_noemail'), {
    name: 'No Address Synthetic', markers: [] });
  await setDoc(doc(db, 'addressBook', 'ab_child_orphan'), {
    name: 'Orphan Synthetic', markers: ['Youth Worship'],
    isMinor: true, householdId: 'ab_parent_noemail' });
  /* A child with no household at all. */
  await setDoc(doc(db, 'addressBook', 'ab_child_nohome'), {
    name: 'No Household Synthetic', markers: ['Youth Worship'], isMinor: true });
  /* An adult, to prove a code is only ever for a child. */
  await setDoc(doc(db, 'addressBook', 'ab_grownup'), {
    name: 'Grown Up Synthetic', email: 'grownup@example.invalid', markers: [] });

  await setDoc(doc(db, 'youthGrants', 'DDDD-4444'), {
    memberId: 'm_young4', memberName: 'Waiting Synthetic', sentTo: 'parent@example.invalid',
    issuedBy: 'u_martin', redeemedAt: null, uid: null, active: true });
  await setDoc(doc(db, 'youthGrants', 'EEEE-5555'), {
    memberId: 'm_young5', memberName: 'Used Synthetic', sentTo: 'parent@example.invalid',
    issuedBy: 'u_martin', redeemedAt: WEEK_AGO, uid: 'u_someone', active: true });

  /* What the youth app actually reads. */
  await setDoc(doc(db, 'portal', 'dashboardContent'), { welcome: 'Hello youth' });
  await setDoc(doc(db, 'worshipBoardState', 'youth'), { notes: [], pages: [] });
  await setDoc(doc(db, 'kb_playthrough', 'kb_pub'), { title: 'Published', published: true });
  await setDoc(doc(db, 'kb_playthrough', 'kb_draft'), { title: 'A draft', published: false });
  await setDoc(doc(db, 'kb_training_worship', 'kbt_pub'), { title: 'Published', published: true });

  /* ChurchShow: one paired projection PC per site, and one switched off. */
  await setDoc(doc(db, 'devices', 'churchshow-site_main'), {
    kind: 'churchshow', siteId: 'site_main', active: true,
    pairedBy: 'u_martin', pairedAt: '2026-10-09' });
  /* site_kids is the one the events window's own R6 block pages from. Its
     five checks were written before churchShow() existed and seed only the
     screenPages documents - but the rule checks devices/{uid}.active as well
     as the claim (R4, and the reason Disconnect works at once rather than
     within the hour), so without this the device is not paired and R6's
     first check fails. Seeded here, in the main window's block, rather than
     by editing theirs. */
  await setDoc(doc(db, 'devices', 'churchshow-site_kids'), {
    kind: 'churchshow', siteId: 'site_kids', active: true,
    pairedBy: 'u_martin', pairedAt: '2026-10-09' });
  await setDoc(doc(db, 'devices', 'churchshow-site_old'), {
    kind: 'churchshow', siteId: 'site_old', active: false,
    pairedBy: 'u_martin', pairedAt: '2026-09-01' });
  await setDoc(doc(db, 'deviceCodes', 'ab'.repeat(32)), {
    uid: 'churchshow-site_main', siteId: 'site_main', usedAt: null, tries: 0 });
  await setDoc(doc(db, 'songs', 'sg_cs'), { title: 'A projected song' });
  await setDoc(doc(db, 'songSummaries', '2026-10-11'), {
    date: '2026-10-11', worshipLeader: 'Samy', items: [] });
  /* The two new boards, and children in them. groups is what the rules
     read - redeemYouthCode copies it off the child's record. */
  await setDoc(doc(db, 'worshipBoardState', 'renu'), { notes: [], pages: [] });
  await setDoc(doc(db, 'worshipBoardState', 'lazers'), { notes: [], pages: [] });
  await setDoc(doc(db, 'youthAccess', 'u_youth_renu'), {
    memberId: 'm_renu_kid', memberName: 'Ada Synthetic', firstName: 'Ada',
    groups: ['ReNu'], grantCode: 'RENU-0001',
    redeemedAt: WEEK_AGO, expiresAt: YEAR_ON, active: true });
  await setDoc(doc(db, 'youthAccess', 'u_youth_renu2'), {
    memberId: 'm_renu_kid2', memberName: 'Ben Synthetic', firstName: 'Ben',
    groups: ['ReNu'], grantCode: 'RENU-0002',
    redeemedAt: WEEK_AGO, expiresAt: YEAR_ON, active: true });
  await setDoc(doc(db, 'youthAccess', 'u_youth_lazers'), {
    memberId: 'm_laz_kid', memberName: 'Cat Synthetic', firstName: 'Cat',
    groups: ['Lazers'], grantCode: 'LAZR-0001',
    redeemedAt: WEEK_AGO, expiresAt: YEAR_ON, active: true });
  await setDoc(doc(db, 'addressBook', 'm_gone'), {
    name: 'Gone Synthetic', email: 'gone@example.invalid', markers: ['Worship Team'],
    churchMember: true, archived: true });
  /* Two invented people who have NOT signed in yet, so there is no users
     record for them. Everything above is created with the rules switched off,
     which is why nothing here ever exercised a first sign-in - and why the
     rules could refuse every member without a test noticing. */
  await setDoc(doc(db, 'addressBook', 'm_newbie'), {
    name: 'New Synthetic', email: 'newbie@example.invalid', markers: ['Worship Team'] });
  await setDoc(doc(db, 'addressBook', 'm_boss'), {
    name: 'Boss Synthetic', email: 'boss@example.invalid', markers: ['Core Team'],
    adminFor: ['Core Team'], masterAdmin: true });
  await setDoc(doc(db, 'addressBook', 'm_nobody'), {
    name: 'Nobody Synthetic', email: 'nobody@example.invalid', markers: ['Core Team'] });
  /* Already signed in once, and visiting again - the refreshFromBook() path. */
  await setDoc(doc(db, 'addressBook', 'm_samy2'), {
    name: 'Samy Two', email: 'samy2@example.invalid', markers: ['Worship Team'] });
  await setDoc(doc(db, 'users', 'u_samy2'), {
    uid: 'u_samy2', email: 'samy2@example.invalid', name: 'Samy Two', memberId: 'm_samy2',
    linkedBy: 'auto', teams: ['Worship Team'], adminFor: [], masterAdmin: false, status: 'active' });
  await setDoc(doc(db, 'events', 'e1'), { date: '2026-09-06', roles: ['Guitar'] });
  await setDoc(doc(db, 'worshipBoardState', 'state'), { notes: [] });
  await setDoc(doc(db, 'worshipBoardState', 'kids-church'), { notes: [] });
  await setDoc(doc(db, 'worshipBoardState', 'youth'), { notes: [] });
  await setDoc(doc(db, 'teamVideos', 'v_kids'), { title: 'Kids clip', team: 'Kids Church' });
  await setDoc(doc(db, 'teamVideos', 'v_worship'), { title: 'Worship clip', team: 'Worship Team' });
  await setDoc(doc(db, 'videoSections', 'kids-church'), { team: 'Kids Church', names: ['Church Show'] });
  await setDoc(doc(db, 'services', 's1'), { date: '2026-09-06' });
  await setDoc(doc(db, 'inventory', 'inv1'), { name: 'Synthetic mixing desk', where: 'Main Hall' });
  await setDoc(doc(db, 'av_schematic', 'main'), { boxes: [] });
  await setDoc(doc(db, 'resources', 'r1'), { title: 'Charter' });
  await setDoc(doc(db, 'kb_playthrough', 'k1'), { title: 'Play-through' });
  await setDoc(doc(db, 'rotaSignoff', 'Autumn 2026__Kids Church'), { by: 'Karen' });
  await setDoc(doc(db, 'hubPages', 'p1'), { title: 'Rota', url: 'view-only-rota.html' });
  /* ---- places (Chunk 1) ---------------------------------------------
     Invented site, rooms and kit. Nothing here is copied from a real EGBC
     record, and everything below refers to them by id, so the rename proof
     has something to rename. */
  await setDoc(doc(db, 'sites', 'site_test'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'sites', 'site_closed'), { name: 'Old Test Hall', active: false, order: 2 });
  await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_test', name: 'Test Hall', kind: 'room', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_attic'), { siteId: 'site_test', name: 'Test Attic', kind: 'room', active: false, order: 2 });
  await setDoc(doc(db, 'bookableResources', 'res_projector'), { name: 'Test Projector', quantity: 1, homeRoomId: 'room_hall', active: true });
  await setDoc(doc(db, 'venues', 'venue_pub'), { name: 'The Test Arms', postcode: 'KT10 0AA', active: true });
  await setDoc(doc(db, 'bookingSettings', 'site_test'), { bookingsAdmins: ['m_u_karen'], safeguardingLead: 'm_u_karen', safeguardingDeputy: '' });

  /* ---- events and sign-ups (Chunk 2) --------------------------------
     Invented events, an invented guest, and a capacity doc with one place
     left - which is the only way to test that two people cannot both have
     it. `audience` is what a reader is judged on; see the rules. */
  await setDoc(doc(db, 'contacts', 'c_guest'), { name: 'Guest Synthetic', email: 'guest@example.invalid', source: 'signup' });
  await setDoc(doc(db, 'calEvents', 'ev_public'), {
    title: 'Test Carols', visibility: 'public', status: 'confirmed', audience: ['public'],
    startLocal: '2026-12-20T18:00', startUtc: 1766253600000, createdBy: 'u_martin', teams: [], signupOn: true, capacity: 10 });
  await setDoc(doc(db, 'calEvents', 'ev_members'), {
    title: 'Test Members Night', visibility: 'members', status: 'confirmed', audience: ['members'],
    startLocal: '2026-11-01T19:00', startUtc: 1761937200000, createdBy: 'u_martin', teams: [], signupOn: true, capacity: 5 });
  await setDoc(doc(db, 'calEvents', 'ev_team'), {
    title: 'Test Kids Leaders Meeting', visibility: 'team', status: 'confirmed', audience: ['Kids Church'],
    startLocal: '2026-11-08T10:00', startUtc: 1762596000000, createdBy: 'u_karen', teams: ['Kids Church'] });
  /* Held: public when it is ready, but not yet. The audience is what keeps
     it off the public list, so this is the document that proves it. */
  await setDoc(doc(db, 'calEvents', 'ev_held'), {
    title: 'Test Held Event', visibility: 'public', status: 'pending', audience: ['members'],
    startLocal: '2026-12-01T19:00', startUtc: 1764622800000, createdBy: 'u_martin', teams: [] });
  await setDoc(doc(db, 'calEvents', 'ev_public', 'ticketTypes', 'tt_free'), { name: 'Free', price: 0, capacity: 10 });
  await setDoc(doc(db, 'calEvents', 'ev_public', 'questions', 'q_diet'), { label: 'Dietary needs', kind: 'text', required: false });
  await setDoc(doc(db, 'capacity', 'ev_public'), { calEventId: 'ev_public', taken: 9, capacity: 10 });
  await setDoc(doc(db, 'capacity', 'ev_members'), { calEventId: 'ev_members', taken: 1, capacity: 5 });
  await setDoc(doc(db, 'signups', 'key_already_here_0000000000000000'), {
    calEventId: 'ev_members', personKind: 'contacts', personId: 'c_guest', name: 'Guest Synthetic',
    email: 'guest@example.invalid', places: 1, status: 'confirmed', attendees: [], answers: {} });
  await setDoc(doc(db, 'signups', 'key_samys_own_000000000000000000'), {
    calEventId: 'ev_members', personKind: 'addressBook', personId: 'm_u_samy', name: 'Samy',
    email: 'samy@example.invalid', places: 1, status: 'confirmed', memberUid: 'u_samy', attendees: [], answers: {} });
  await setDoc(doc(db, 'eventChecklists', 'ev_public'), { tasks: [] });
  await setDoc(doc(db, 'checklistTemplates', 'tpl_service'), { name: 'Service', tasks: ['Chairs out'] });
  await setDoc(doc(db, 'eventNotes', 'ev_public'), { text: 'Invented note' });
  await setDoc(doc(db, 'eventChanges', 'ch1'), { calEventId: 'ev_public', by: 'u_martin', what: 'created' });
  await setDoc(doc(db, 'commsLog', 'log1'), { calEventId: 'ev_public', to: 1, subject: 'Test' });

  // ── EVENTS (events window) ── seed data for check-in (Chunk 3, stage 1)
  /* An invented kids' event that needs a collector at check-out, a family
     of three invented children, two of them already in, and one leader.
     Capacity has one place left, so a walk-in can take it once. */
  await setDoc(doc(db, 'calEvents', 'ev_kids'), {
    title: 'Test Kids Club', visibility: 'members', status: 'confirmed', audience: ['members'],
    startLocal: '2026-11-14T10:00', startUtc: 1763114400000, createdBy: 'u_karen', teams: [], signupOn: true, capacity: 4 });
  await setDoc(doc(db, 'capacity', 'ev_kids'), { calEventId: 'ev_kids', taken: 3, capacity: 4 });
  await setDoc(doc(db, 'signups', 'key_kids_family_0000000000000000'), {
    calEventId: 'ev_kids', personKind: 'contacts', personId: 'c_guest', name: 'Parent Synthetic',
    email: 'parent@example.invalid', places: 3, status: 'confirmed', answers: { q_collect: 'Parent Synthetic, Aunt Invented' },
    attendees: [{ name: 'Child One' }, { name: 'Child Two' }, { name: 'Child Three' }] });
  await setDoc(doc(db, 'checkinSettings', 'ev_kids'), { checkoutRequired: true, collectorsQuestionId: 'q_collect', flagQuestionIds: [] });
  const IN = (i) => ({ calEventId: 'ev_kids', signupKey: 'key_kids_family_0000000000000000', attendeeIndex: i,
    name: 'Child ' + i, kind: 'booked', state: 'in', inAt: '2026-11-14T10:01:00Z', inBy: 'u_karen', roomId: 'room_hall', day: '2026-11-14' });
  await setDoc(doc(db, 'checkins', 'ev_kids__key_kids_family_0000000000000000__1'), IN(1));
  await setDoc(doc(db, 'checkins', 'ev_kids__key_kids_family_0000000000000000__2'), IN(2));
  await setDoc(doc(db, 'checkins', 'ev_kids__l_leader_00000000000000000000000000__0'), {
    calEventId: 'ev_kids', signupKey: 'l_leader_00000000000000000000000000', attendeeIndex: 0,
    name: 'Leader Invented', kind: 'leader', state: 'in', day: '2026-11-14' });
  await setDoc(doc(db, 'downloadsLog', 'dl1'), { by: 'u_karen', at: '2026-11-14T12:00:00Z', sensitive: true });
  await setDoc(doc(db, 'headcounts', 'hc1'), { date: '2026-11-15', label: 'Sunday morning', adults: 80, children: 20, online: 12 });

  /* Forms and consent (Chunk 3, stage 2). Two more invented people: Ella
     administers the AV Team and is nobody's safeguarding lead; Lena is a
     plain member who IS the safeguarding lead of an invented kids' site.
     Between them they show that "admin" and "may read medical answers"
     are not the same thing. */
  await setDoc(doc(db, 'users', 'u_ella'), { memberId: 'm_u_ella', name: 'u_ella', teams: [], adminFor: ['AV Team'], masterAdmin: false, status: 'active' });
  await setDoc(doc(db, 'users', 'u_lena'), { memberId: 'm_u_lena', name: 'u_lena', teams: ['Kids Church'], adminFor: [], masterAdmin: false, status: 'active' });
  await setDoc(doc(db, 'bookingSettings', 'site_kids'), { bookingsAdmins: [], safeguardingLead: 'm_u_lena', safeguardingDeputy: '' });
  await setDoc(doc(db, 'forms', 'form_consent'), { title: 'Test consent', fields: [], siteId: 'site_kids', team: 'Kids Church' });
  const REQ = (status, extra) => ({ formId: 'form_consent', formTitle: 'Test consent', calEventId: 'ev_kids', eventTitle: 'Test Kids Club',
    name: 'Parent Synthetic', email: 'parent@example.invalid', siteId: 'site_kids', subjects: ['Child One'], status, ...(extra || {}) });
  for (const k of ['req_open_0', 'req_open_1', 'req_open_2', 'req_open_3']) await setDoc(doc(db, 'formRequests', k), REQ('sent'));
  await setDoc(doc(db, 'formRequests', 'req_old'), REQ('done', { responseId: 'resp_old' }));
  await setDoc(doc(db, 'formRequests', 'req_reuse_0'), REQ('reuse', { reuseOf: 'resp_old' }));
  await setDoc(doc(db, 'formRequests', 'req_reuse_1'), REQ('reuse', { reuseOf: 'resp_old' }));
  await setDoc(doc(db, 'formResponses', 'resp_old'), { formId: 'form_consent', requestKey: 'req_old', calEventId: 'ev_kids',
    email: 'parent@example.invalid', siteId: 'site_kids', answers: { collectors: 'Parent Synthetic' }, validUntil: '2027-08-31', deleteAfter: '2028-08-31' });
  await setDoc(doc(db, 'formResponses', 'resp_other'), { formId: 'form_consent', requestKey: 'req_x', siteId: 'site_kids', answers: {} });
  await setDoc(doc(db, 'sensitiveResponses', 'secret_old_00000000000000000000'), { responseId: 'resp_old', requestKey: 'req_old',
    formId: 'form_consent', siteId: 'site_kids', answers: { allergies: 'Invented nut allergy' } });
  await setDoc(doc(db, 'sensitiveResponses', 'secret_test_site_00000000000000'), { responseId: 'resp_x', requestKey: 'req_x',
    formId: 'form_consent', siteId: 'site_test', answers: {} });

  /* Safeguarding (Chunk 3, stage 3). Leo is a plain member - not an admin
     - who leads one invented event on the kids' site and not another. */
  await setDoc(doc(db, 'users', 'u_leo'), { memberId: 'm_u_leo', name: 'u_leo', teams: ['Kids Church'], adminFor: [], masterAdmin: false, status: 'active' });
  const EV = (title, siteId) => ({ title, visibility: 'members', status: 'confirmed', audience: ['members'], startLocal: '2026-11-21T10:00',
    startUtc: 1763719200000, createdBy: 'u_martin', teams: [], location: { kind: 'room', siteId, roomIds: [] } });
  await setDoc(doc(db, 'calEvents', 'ev_safe'), EV('Test Kids Holiday Club', 'site_kids'));
  await setDoc(doc(db, 'calEvents', 'ev_other'), EV('Test Other Club', 'site_kids'));
  await setDoc(doc(db, 'eventLeaders', 'ev_safe'), { leaders: [{ uid: 'u_leo', name: 'Leo' }], leaderUids: ['u_leo'], siteId: 'site_kids' });
  await setDoc(doc(db, 'eventLeaders', 'ev_other'), { leaders: [], leaderUids: [], siteId: 'site_kids' });
  await setDoc(doc(db, 'bookingSettings', 'site_nolead'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'signups', 'key_safe_family_0000000000000000'), { calEventId: 'ev_safe', personKind: 'contacts', personId: 'c_guest',
    name: 'Parent Synthetic', email: 'parent@example.invalid', places: 1, status: 'confirmed', attendees: [{ name: 'Child Safe' }], answers: {} });
  await setDoc(doc(db, 'checkinSettings', 'ev_safe'), { checkoutRequired: true, collectorsQuestionId: '', flagQuestionIds: [] });
  await setDoc(doc(db, 'formRequests', 'req_safe'), { formId: 'form_consent', calEventId: 'ev_safe', siteId: 'site_kids', email: 'parent@example.invalid', status: 'done', responseId: 'resp_safe' });
  await setDoc(doc(db, 'sensitiveResponses', 'secret_safe_000000000000000000000'), { responseId: 'resp_safe', requestKey: 'req_safe',
    formId: 'form_consent', siteId: 'site_kids', calEventId: 'ev_safe', answers: { allergies: 'Invented sesame allergy' } });
  await setDoc(doc(db, 'sensitiveResponses', 'secret_other_00000000000000000000'), { responseId: 'resp_o', requestKey: 'req_o',
    formId: 'form_consent', siteId: 'site_kids', calEventId: 'ev_other', answers: {} });
  await setDoc(doc(db, 'leaderChecks', 'm_u_leo'), { name: 'Leo', dbsStatus: 'current', dbsSeen: '2025-01-10', trainingDate: '2024-03-01', siteId: 'site_kids' });
  await setDoc(doc(db, 'incidents', 'inc_1'), { calEventId: 'ev_safe', siteId: 'site_kids', what: 'Invented grazed knee', reportedBy: 'u_leo', createdAt: '2026-11-21T11:00:00Z' });
  await setDoc(doc(db, 'concerns', 'con_1'), { siteId: 'site_kids', concern: 'Invented concern', reportedBy: 'u_leo', status: 'new', createdAt: '2026-11-21T11:00:00Z' });

  /* One-off upload links (E4): one open, one expired, one switched off,
     one full. Dates as timestamps, relative to now. */
  const LINK = (extra) => ({ calEventId: 'ev_public', eventTitle: 'Test Carols', createdBy: 'u_karen', createdAt: '2026-10-08T10:00:00Z',
    expiresAt: new Date(Date.now() + 14 * 864e5), maxFiles: 3, active: true, count: 1, ...(extra || {}) });
  await setDoc(doc(db, 'uploadLinks', 'up_open'), LINK());
  await setDoc(doc(db, 'uploadLinks', 'up_expired'), LINK({ expiresAt: new Date(Date.now() - 864e5) }));
  await setDoc(doc(db, 'uploadLinks', 'up_off'), LINK({ active: false }));
  await setDoc(doc(db, 'uploadLinks', 'up_full'), LINK({ count: 3 }));
  await setDoc(doc(db, 'menus', 'menu_tea'), { name: 'Test tea and coffee', unit: 'head', price: 1.5, minimum: 10, noticeDays: 5, active: true, order: 1 });
  await setDoc(doc(db, 'menus', 'menu_old'), { name: 'Test old buffet', unit: 'head', price: 9, active: false, order: 2 });
  await setDoc(doc(db, 'rooms', 'room_hire'), { siteId: 'site_test', name: 'Test Hireable Hall', kind: 'room', active: true, order: 3, bookableByHirers: true,
    dims: { length: 10, width: 8 }, layouts: { cabaret: 40 }, fireMax: 90, facilities: { projector: true } });
  /* Room bookings (R2). Wednesday 18 Nov 2026 and Sunday 22 Nov 2026.
     The band room has a Sunday service 08:00-12:30 in its standing pattern,
     and one confirmed booking on the Wednesday, 19:00-20:00. */
  const Z = () => Array(96).fill(0);
  const sunday = Z(); for (let i = 32; i < 50; i++) sunday[i] = 1;
  const week = { '1': Z(), '2': Z(), '3': Z(), '4': Z(), '5': Z(), '6': Z(), '7': sunday };
  await setDoc(doc(db, 'sites', 'site_bk'), { name: 'Test Booking Site', active: true, order: 3 });
  await setDoc(doc(db, 'sites', 'site_appr'), { name: 'Test Careful Site', active: true, order: 4, memberBookings: 'approval' });
  await setDoc(doc(db, 'rooms', 'room_band'), { siteId: 'site_bk', name: 'Test Band Room', kind: 'room', active: true, order: 1,
    bookableByMembers: true, bookableByHirers: true, fireMax: 30, rotaWeek: week });
  await setDoc(doc(db, 'rooms', 'room_hold'), { siteId: 'site_bk', name: 'Test Held Room', kind: 'room', active: true, order: 2,
    bookableByMembers: true, bookableByHirers: false, memberBookings: 'approval' });
  await setDoc(doc(db, 'rooms', 'room_apsite'), { siteId: 'site_appr', name: 'Test Careful Room', kind: 'room', active: true, order: 1,
    bookableByMembers: true, bookableByHirers: true, memberBookings: 'site' });
  await setDoc(doc(db, 'bookingSettings', 'site_bk'), { bookingsAdmins: ['m_u_lena'], safeguardingLead: '', safeguardingDeputy: '' });
  const wed = Z(); for (let i = 76; i < 80; i++) wed[i] = 1;
  await setDoc(doc(db, 'roomDays', 'room_band_2026-11-18'), { slots: wed, lastBooking: 'bk_existing_000000000000000000', roomId: 'room_band', day: '2026-11-18', siteId: 'site_bk' });
  await setDoc(doc(db, 'bookings', 'bk_existing_000000000000000000'), { kind: 'member', status: 'confirmed', siteId: 'site_bk', roomId: 'room_band',
    day: '2026-11-18', startMin: 1140, endMin: 1200, setupMins: 0, packdownMins: 0, slotFrom: 76, slotTo: 80, memberUid: 'u_martin', title: 'Test choir' });
  await setDoc(doc(db, 'bookings', 'bk_requested_00000000000000000'), { kind: 'hire', status: 'requested', siteId: 'site_bk', roomId: 'room_band',
    day: '2026-11-25', startMin: 600, endMin: 660, setupMins: 0, packdownMins: 0, slotFrom: 40, slotTo: 44, memberUid: '', title: 'Test party' });
  await setDoc(doc(db, 'bookings', 'bk_careful_000000000000000000'), { kind: 'member', status: 'requested', siteId: 'site_appr', roomId: 'room_apsite',
    day: '2026-11-25', startMin: 600, endMin: 660, setupMins: 0, packdownMins: 0, slotFrom: 40, slotTo: 44, memberUid: 'u_samy', title: 'Test' });
  /* R3: Samy's own bookings to cancel, one the office booked over, and
     somebody else's. Wednesdays in December 2026, 10:00-11:00 (40 to 43). */
  const held = (n) => { const a = Array(96).fill(0); for (let i = 40; i < 44; i++) a[i] = n; return a; };
  const own = (key, day, status, uid, extra) => setDoc(doc(db, 'bookings', key), { kind: 'member', status, siteId: 'site_bk', roomId: 'room_band', day,
    startMin: 600, endMin: 660, setupMins: 0, packdownMins: 0, slotFrom: 40, slotTo: 44, memberUid: uid, title: 'Test', ...(extra || {}) });
  await own('bk_samy_conf_00000000000000000', '2026-12-02', 'confirmed', 'u_samy');
  await setDoc(doc(db, 'roomDays', 'room_band_2026-12-02'), { slots: held(1).map((v, i) => i >= 56 && i < 60 ? 1 : v), lastBooking: 'bk_samy_conf_00000000000000000', roomId: 'room_band', day: '2026-12-02', siteId: 'site_bk' });
  await own('bk_samy_over_00000000000000000', '2026-12-09', 'confirmed', 'u_samy');
  await setDoc(doc(db, 'roomDays', 'room_band_2026-12-09'), { slots: held(2), lastBooking: '', roomId: 'room_band', day: '2026-12-09', siteId: 'site_bk' });
  await own('bk_samy_req_000000000000000000', '2026-12-16', 'requested', 'u_samy');
  await own('bk_mart_conf_00000000000000000', '2026-12-23', 'confirmed', 'u_martin');
  await setDoc(doc(db, 'roomDays', 'room_band_2026-12-23'), { slots: held(1), lastBooking: 'bk_mart_conf_00000000000000000', roomId: 'room_band', day: '2026-12-23', siteId: 'site_bk' });
  await setDoc(doc(db, 'uploadItems', 'up_open__0'), { linkId: 'up_open', slot: 0, calEventId: 'ev_public', path: 'uploads/up_open/0', name: 'a.jpg', status: 'pending' });
  // ── end EVENTS ──

});

const as = (who) => env.authenticatedContext(PEOPLE[who].uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
/* Signing in for the first time, with the verified email the rules check
   against the address book. */
const asNewcomer = (uid, email) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();

/* ---- the checks --------------------------------------------------- */

const results = [];
async function check(name, expect, fn) {
  try {
    await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    results.push({ ok: true, name, expect });
  } catch (e) {
    results.push({ ok: false, name, expect, why: (e.message || '').split('\n')[0].slice(0, 110) });
  }
}

/* A STRANGER GETS NOTHING. These seven used to be the other way round:
   addressBook and events were `allow read: if true` and availability had an
   open create, all so index.html could work without a sign-in. That published
   every name, email address, telephone number and household in the church,
   every service with its assignments - who is serving, by name - and let
   anyone write an answer for any member id.

   The form asks the findMe, myDates and saveAnswer functions now, which use
   the Admin SDK and so do not come through here at all.
   PRIVACY-OPEN-COLLECTIONS.md; Martin's decision, 9 October 2026. */
await check('a stranger cannot list the address book', 'deny', () => getDocs(collection(anon(), 'addressBook')));
await check('a stranger cannot read one record either', 'deny', () => getDoc(doc(anon(), 'addressBook', 'm_u_samy')));
await check('a stranger cannot read the dates', 'deny', () => getDoc(doc(anon(), 'events', 'e1')));
await check('a stranger cannot list the dates', 'deny', () => getDocs(collection(anon(), 'events')));
await check('a stranger cannot write an answer for anybody', 'deny', () => setDoc(doc(anon(), 'availability', 'a1'), { memberId: 'm_u_samy', status: 'yes' }));
await check('the form cannot read anyone\'s answers back', 'deny', () => getDoc(doc(anon(), 'availability', 'a1')));
await check('the form cannot edit the address book', 'deny', () => setDoc(doc(anon(), 'addressBook', 'm_u_samy'), { name: 'Nope' }));
await check('the form cannot edit the rota', 'deny', () => setDoc(doc(anon(), 'events', 'e1'), { date: 'x' }));
await check('nor can it read the form session store', 'deny', () => getDoc(doc(anon(), 'formSessions', 'anytoken')));
await check('nor the rate limit counter', 'deny', () => getDoc(doc(anon(), 'formRateLimit', 'anyhash')));
await check('the form cannot read the boards', 'deny', () => getDoc(doc(anon(), 'worshipBoardState', 'state')));
await check('the form cannot read the videos', 'deny', () => getDoc(doc(anon(), 'teamVideos', 'v_kids')));

// Signed in, on a team.
await check('team member reads the rota', 'allow', () => getDoc(doc(as('samy'), 'events', 'e1')));
await check('team member reads the address book', 'allow', () => getDocs(collection(as('samy'), 'addressBook')));
await check('team member cannot rewrite the registry', 'deny', () => setDoc(doc(as('samy'), 'hubPages', 'p1'), { title: 'x' }));
await check('master rewrites the registry', 'allow', () => updateDoc(doc(as('martin'), 'hubPages', 'p1'), { title: 'Rota' }));

/* ---- signing in for the first time -------------------------------
   The mirror at users/{uid} is what every other rule on this page reads, and
   egbc-auth.js writes it by matching the address book. If that write is
   refused, the person is signed in and has no access to anything, for ever -
   so these are the checks that stand between the church and a locked door.
   Each one writes exactly what provisionProfile() writes. */
await check('a first sign-in writes the membership the address book gives', 'allow',
  () => setDoc(doc(asNewcomer('u_newbie', 'newbie@example.invalid'), 'users', 'u_newbie'), {
    uid: 'u_newbie', email: 'newbie@example.invalid', name: 'New Synthetic',
    memberId: 'm_newbie', linkedBy: 'auto', teams: ['Worship Team'],
    adminFor: [], masterAdmin: false, status: 'active' }));
await check('an admin in the book comes back an admin', 'allow',
  () => setDoc(doc(asNewcomer('u_boss', 'boss@example.invalid'), 'users', 'u_boss'), {
    uid: 'u_boss', email: 'boss@example.invalid', name: 'Boss Synthetic',
    memberId: 'm_boss', linkedBy: 'auto', teams: ['Core Team'],
    adminFor: ['Core Team'], masterAdmin: true, status: 'active' }));
await check('nobody in the book at all still gets a record, as pending', 'allow',
  () => setDoc(doc(asNewcomer('u_stranger', 'stranger@example.invalid'), 'users', 'u_stranger'), {
    uid: 'u_stranger', email: 'stranger@example.invalid', memberId: null,
    teams: [], status: 'pending' }));
await check('a shared address waits for an admin to settle it', 'allow',
  () => setDoc(doc(asNewcomer('u_shared', 'shared@example.invalid'), 'users', 'u_shared'), {
    uid: 'u_shared', email: 'shared@example.invalid', memberId: null, teams: [],
    status: 'ambiguous', candidates: [{ id: 'm_newbie', name: 'New Synthetic', admin: false }] }));

/* The other half: what it must still refuse. */
await check('but not a team the book does not give', 'deny',
  () => setDoc(doc(asNewcomer('u_greedy', 'newbie@example.invalid'), 'users', 'u_greedy'), {
    uid: 'u_greedy', memberId: 'm_newbie', teams: ['Worship Team', 'Core Team'],
    adminFor: [], masterAdmin: false, status: 'active' }));
await check('and not making yourself an admin', 'deny',
  () => setDoc(doc(asNewcomer('u_climber', 'newbie@example.invalid'), 'users', 'u_climber'), {
    uid: 'u_climber', memberId: 'm_newbie', teams: ['Worship Team'],
    adminFor: ['Core Team'], masterAdmin: false, status: 'active' }));
await check('and not making yourself a master admin', 'deny',
  () => setDoc(doc(asNewcomer('u_master', 'newbie@example.invalid'), 'users', 'u_master'), {
    uid: 'u_master', memberId: 'm_newbie', teams: ['Worship Team'],
    adminFor: [], masterAdmin: true, status: 'active' }));
await check('and not claiming a record that is not yours', 'deny',
  () => setDoc(doc(asNewcomer('u_thief', 'newbie@example.invalid'), 'users', 'u_thief'), {
    uid: 'u_thief', memberId: 'm_nobody', teams: ['Core Team'],
    adminFor: [], masterAdmin: false, status: 'active' }));
await check('and not on an unverified address', 'deny',
  () => setDoc(doc(env.authenticatedContext('u_unver', { email: 'newbie@example.invalid', email_verified: false }).firestore(),
    'users', 'u_unver'), {
    uid: 'u_unver', memberId: 'm_newbie', teams: ['Worship Team'],
    adminFor: [], masterAdmin: false, status: 'active' }));
await check('and not calling yourself active with nothing behind it', 'deny',
  () => setDoc(doc(asNewcomer('u_bluff', 'stranger@example.invalid'), 'users', 'u_bluff'), {
    uid: 'u_bluff', memberId: null, teams: [], status: 'active' }));
await check('and not writing somebody else\'s record', 'deny',
  () => setDoc(doc(asNewcomer('u_newbie', 'newbie@example.invalid'), 'users', 'u_samy'), {
    teams: ['Worship Team'], status: 'active' }));

/* Picking up a change an admin made since the last visit. Samy is in the book
   on Worship Team; the stored mirror says the same, and re-writing it from the
   book has to be allowed or refreshFromBook() fails silently every load. */
await check('a member picks up what the book now says', 'allow',
  () => updateDoc(doc(asNewcomer('u_samy2', 'samy2@example.invalid'), 'users', 'u_samy2'),
    { teams: ['Worship Team'], status: 'active', name: 'Samy Two' }));
await check('but still cannot add a team to their own record', 'deny',
  () => updateDoc(doc(asNewcomer('u_samy2', 'samy2@example.invalid'), 'users', 'u_samy2'),
    { teams: ['Worship Team', 'AV Team'], status: 'active' }));

/* Someone in the book but with no teams ticked yet. The rota itself is open
   now, so this has to test something that is actually gated. */
await check('pending person is kept out', 'deny', () => getDoc(doc(as('pending'), 'worshipBoardState', 'state')));
await check('pending person cannot see the videos', 'deny', () => getDoc(doc(as('pending'), 'teamVideos', 'v_kids')));

// The pin boards, which is what the three-board split was for.
await check('worship reads the worship board', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'state')));
/* THIS USED TO BE 'allow'. Samy is on Worship Team AND Kids Church, so she
   could read the Kids Church board as a team member. Martin narrowed that
   board to Kids Church LEADERS on 9 October 2026, which takes it away from
   ordinary Kids Church members who have it today - this check failing is the
   whole of that cost, made visible rather than argued about. Karen, who
   administers Kids Church, still has it. */
await check('a Kids Church MEMBER no longer reads the kids board - leaders only now', 'deny', () => getDoc(doc(as('samy'), 'worshipBoardState', 'kids-church')));
await check('youth cannot read the kids board', 'deny', () => getDoc(doc(as('isla'), 'worshipBoardState', 'kids-church')));
await check('youth reads the youth board', 'allow', () => getDoc(doc(as('isla'), 'worshipBoardState', 'youth')));
await check('kids admin writes the kids board', 'allow', () => setDoc(doc(as('karen'), 'worshipBoardState', 'kids-church'), { notes: [] }));
await check('kids admin cannot write the worship board', 'deny', () => setDoc(doc(as('karen'), 'worshipBoardState', 'state'), { notes: [] }));

// The video library.
await check('kids admin reads a kids video', 'allow', () => getDoc(doc(as('karen'), 'teamVideos', 'v_kids')));
await check('youth cannot read a kids video', 'deny', () => getDoc(doc(as('isla'), 'teamVideos', 'v_kids')));
await check('kids admin adds a video', 'allow', () => setDoc(doc(as('karen'), 'teamVideos', 'v_new'), { title: 'New', team: 'Kids Church' }));
await check('kids admin cannot add to worship', 'deny', () => setDoc(doc(as('karen'), 'teamVideos', 'v_bad'), { title: 'No', team: 'Worship Team' }));
await check('member cannot add a video', 'deny', () => setDoc(doc(as('samy'), 'teamVideos', 'v_bad2'), { title: 'No', team: 'Worship Team' }));
await check('kids admin makes a section', 'allow', () => setDoc(doc(as('karen'), 'videoSections', 'kids-church'), { team: 'Kids Church', names: ['Tutorials'] }));

// The sign-off gate and the rest of the collections that had no rules at all.
await check('member reads the sign-offs', 'allow', () => getDoc(doc(as('samy'), 'rotaSignoff', 'Autumn 2026__Kids Church')));
await check('kids admin signs off', 'allow', () => setDoc(doc(as('karen'), 'rotaSignoff', 'Autumn 2026__Kids Church'), { by: 'Karen' }));
await check('member cannot sign off', 'deny', () => setDoc(doc(as('samy'), 'rotaSignoff', 'Autumn 2026__Worship Team'), { by: 'Samy' }));
await check('member reads the service plan', 'allow', () => getDoc(doc(as('samy'), 'services', 's1')));
await check('member reads team resources', 'allow', () => getDoc(doc(as('samy'), 'resources', 'r1')));
await check('member reads play-through', 'allow', () => getDoc(doc(as('samy'), 'kb_playthrough', 'k1')));
await check('member cannot edit play-through', 'deny', () => setDoc(doc(as('samy'), 'kb_playthrough', 'k1'), { title: 'x' }));

/* ---- places: sites, rooms, bookable kit, venues, per-site settings --
   Members read the lot; admins are the only writers; the public sees only
   what is active, because whatson.html has to draw a room list with nobody
   signed in. */
await check('member reads a site', 'allow', () => getDoc(doc(as('samy'), 'sites', 'site_test')));
await check('member reads a site that is closed', 'allow', () => getDoc(doc(as('samy'), 'sites', 'site_closed')));
await check('public reads an active site', 'allow', () => getDoc(doc(anon(), 'sites', 'site_test')));
await check('public cannot read a closed site', 'deny', () => getDoc(doc(anon(), 'sites', 'site_closed')));
await check('public reads an active room', 'allow', () => getDoc(doc(anon(), 'rooms', 'room_hall')));
await check('public cannot read a room taken out of use', 'deny', () => getDoc(doc(anon(), 'rooms', 'room_attic')));

/* The two that matter together. A public page must ask for the active rooms;
   asking for all of them is refused outright rather than quietly filtered,
   so a page written the lazy way fails loudly in development. */
await check('public lists rooms when it asks only for the active ones', 'allow', () => getDocs(query(collection(anon(), 'rooms'), where('active', '==', true))));
await check('public cannot list every room', 'deny', () => getDocs(collection(anon(), 'rooms')));

await check('public cannot read bookable kit', 'deny', () => getDoc(doc(anon(), 'bookableResources', 'res_projector')));
await check('public cannot read saved venues', 'deny', () => getDoc(doc(anon(), 'venues', 'venue_pub')));
await check('public cannot read who approves bookings', 'deny', () => getDoc(doc(anon(), 'bookingSettings', 'site_test')));
await check('member reads who approves bookings', 'allow', () => getDoc(doc(as('samy'), 'bookingSettings', 'site_test')));
await check('member reads bookable kit', 'allow', () => getDoc(doc(as('samy'), 'bookableResources', 'res_projector')));
await check('member reads a saved venue', 'allow', () => getDoc(doc(as('samy'), 'venues', 'venue_pub')));

/* Being in the book with no teams ticked is not being a member yet. An
   active room is public anyway, so the gated case is one out of use. */
await check('pending person cannot read a room out of use', 'deny', () => getDoc(doc(as('pending'), 'rooms', 'room_attic')));

await check('member cannot rename a room', 'deny', () => updateDoc(doc(as('samy'), 'rooms', 'room_hall'), { name: 'Mine now' }));
await check('member cannot add a site', 'deny', () => setDoc(doc(as('samy'), 'sites', 'site_sneak'), { name: 'Nope', active: true }));
await check('member cannot add bookable kit', 'deny', () => setDoc(doc(as('samy'), 'bookableResources', 'res_sneak'), { name: 'Nope', quantity: 1 }));
await check('member cannot save a venue', 'deny', () => setDoc(doc(as('samy'), 'venues', 'venue_sneak'), { name: 'Nope' }));
await check('member cannot change who approves bookings', 'deny', () => setDoc(doc(as('samy'), 'bookingSettings', 'site_test'), { bookingsAdmins: ['m_u_samy'] }));
await check('member cannot delete a room', 'deny', () => deleteDoc(doc(as('samy'), 'rooms', 'room_attic')));

await check('an admin renames a room', 'allow', () => updateDoc(doc(as('karen'), 'rooms', 'room_hall'), { name: 'Test Hall, renamed' }));
await check('an admin adds a site', 'allow', () => setDoc(doc(as('karen'), 'sites', 'site_two'), { name: 'Second Test Site', active: true, order: 3 }));
await check('an admin sets who approves bookings', 'allow', () => setDoc(doc(as('karen'), 'bookingSettings', 'site_two'), { bookingsAdmins: ['m_u_karen'], safeguardingLead: 'm_u_karen', safeguardingDeputy: '' }));
await check('master adds bookable kit', 'allow', () => setDoc(doc(as('martin'), 'bookableResources', 'res_urn'), { name: 'Test Urn', quantity: 2, active: true }));
await check('master saves a venue', 'allow', () => setDoc(doc(as('martin'), 'venues', 'venue_two'), { name: 'The Test Bear', active: true }));
await check('master takes a room out of use', 'allow', () => updateDoc(doc(as('martin'), 'rooms', 'room_hall'), { active: false }));

/* ---- contacts: people who are not members ---------------------------
   A guest has no account, so the only way their name reaches the database
   is a public create. It is create and nothing else: no reading, no
   listing, and nothing in the shape that grants anything. */
const GUEST = { name: 'New Guest', email: 'new.guest@example.invalid', source: 'signup' };
await check('a guest with no account creates their own contact record', 'allow', () => setDoc(doc(anon(), 'contacts', 'c_new'), GUEST));
await check('a guest cannot make themselves an admin on the way in', 'deny', () => setDoc(doc(anon(), 'contacts', 'c_sneak'), { ...GUEST, masterAdmin: true }));
await check('a guest cannot smuggle in team markers', 'deny', () => setDoc(doc(anon(), 'contacts', 'c_sneak2'), { ...GUEST, markers: ['Core Team'] }));
await check('a nameless contact is refused', 'deny', () => setDoc(doc(anon(), 'contacts', 'c_sneak3'), { name: '', email: 'x@example.invalid', source: 'signup' }));
await check('a guest cannot read a contact back', 'deny', () => getDoc(doc(anon(), 'contacts', 'c_guest')));
await check('a guest cannot list the contacts', 'deny', () => getDocs(collection(anon(), 'contacts')));
await check('a guest cannot edit an existing contact', 'deny', () => updateDoc(doc(anon(), 'contacts', 'c_guest'), { email: 'taken.over@example.invalid' }));
await check('a member reads a contact', 'allow', () => getDoc(doc(as('samy'), 'contacts', 'c_guest')));
await check('an admin edits a contact', 'allow', () => updateDoc(doc(as('karen'), 'contacts', 'c_guest'), { phone: '01234 567890' }));

/* ---- who may see an event -------------------------------------------
   The audience array is the whole test. A list query asks for the
   audiences that apply to the reader, so every document that comes back
   already passes - which is the only way a public list works at all. */
await check('the public reads a public event', 'allow', () => getDoc(doc(anon(), 'calEvents', 'ev_public')));
await check('the public cannot read a members-only event', 'deny', () => getDoc(doc(anon(), 'calEvents', 'ev_members')));
await check('the public cannot read an event that is still held', 'deny', () => getDoc(doc(anon(), 'calEvents', 'ev_held')));
await check('the public lists what is on when it asks for the public ones', 'allow', () => getDocs(query(collection(anon(), 'calEvents'), where('audience', 'array-contains', 'public'))));
await check('the public cannot list every event', 'deny', () => getDocs(collection(anon(), 'calEvents')));
await check('a member reads a members-only event', 'allow', () => getDoc(doc(as('samy'), 'calEvents', 'ev_members')));
await check('a member on that team reads its team-only event', 'allow', () => getDoc(doc(as('samy'), 'calEvents', 'ev_team')));
await check('a member on another team cannot read it', 'deny', () => getDoc(doc(as('isla'), 'calEvents', 'ev_team')));
await check('someone with no teams yet cannot read a members-only event', 'deny', () => getDoc(doc(as('pending'), 'calEvents', 'ev_members')));

/* ---- making and changing an event ---------------------------------- */
const NEW_EVENT = { title: 'Test Quiz Night', visibility: 'public', status: 'confirmed', audience: ['public'],
                    startLocal: '2026-11-20T19:30', startUtc: 1763667000000, teams: [], createdBy: 'u_karen' };
await check('a member cannot create an event', 'deny', () => setDoc(doc(as('samy'), 'calEvents', 'ev_sneak'), { ...NEW_EVENT, createdBy: 'u_samy' }));
await check('an admin creates an event', 'allow', () => setDoc(doc(as('karen'), 'calEvents', 'ev_quiz'), NEW_EVENT));
await check('an event cannot be created in someone else\'s name', 'deny', () => setDoc(doc(as('karen'), 'calEvents', 'ev_forged'), { ...NEW_EVENT, createdBy: 'u_martin' }));
/* The two that keep a held event off the public list. */
await check('a held event cannot be public to the world', 'deny', () => setDoc(doc(as('karen'), 'calEvents', 'ev_bad1'), { ...NEW_EVENT, status: 'pending' }));
await check('a public event cannot hide itself from the public list', 'deny', () => setDoc(doc(as('karen'), 'calEvents', 'ev_bad2'), { ...NEW_EVENT, audience: ['members'] }));
await check('a members-only event cannot claim a public audience', 'deny', () => setDoc(doc(as('karen'), 'calEvents', 'ev_bad3'), { ...NEW_EVENT, visibility: 'members' }));
await check('the admin of that team edits its event', 'allow', () => updateDoc(doc(as('karen'), 'calEvents', 'ev_team'), { title: 'Test Kids Leaders Meeting, moved' }));
await check('an admin of another area cannot edit it', 'deny', () => updateDoc(doc(as('isla'), 'calEvents', 'ev_team'), { title: 'Not yours' }));
await check('a master admin edits any event', 'allow', () => updateDoc(doc(as('martin'), 'calEvents', 'ev_team'), { title: 'Test Kids Leaders Meeting' }));

/* ---- the sign-up form a guest has to be able to read ---------------- */
await check('the public reads the ticket types', 'allow', () => getDoc(doc(anon(), 'calEvents', 'ev_public', 'ticketTypes', 'tt_free')));
await check('the public reads the questions', 'allow', () => getDoc(doc(anon(), 'calEvents', 'ev_public', 'questions', 'q_diet')));
await check('the public cannot change a ticket type', 'deny', () => setDoc(doc(anon(), 'calEvents', 'ev_public', 'ticketTypes', 'tt_free'), { name: 'Free', price: 0 }));
await check('an admin adds a ticket type', 'allow', () => setDoc(doc(as('karen'), 'calEvents', 'ev_public', 'ticketTypes', 'tt_paid'), { name: 'Standard', price: 5, capacity: 10 }));

/* ---- capacity: the last place ---------------------------------------
   ev_public has 9 of 10 taken. A sign-up is a batch: the sign-up document
   and the counter move together, and the rule reads the counter's state
   AFTER the batch. */
const signup = (dbx, key, over) => {
  const b = writeBatch(dbx);
  const places = (over && over.places) || 1;
  b.set(doc(dbx, 'signups', key), {
    calEventId: 'ev_public', personKind: 'contacts', personId: 'c_guest', name: 'Last Place',
    email: 'last@example.invalid', places, status: 'confirmed', attendees: [], answers: {}, ...(over || {}) });
  b.update(doc(dbx, 'capacity', 'ev_public'), { taken: 9 + ((over && over.counterBy) !== undefined ? over.counterBy : places) });
  return b.commit();
};
await check('a guest takes the last place', 'allow', () => signup(anon(), 'key_last_place_000000000000000000'));
/* The counter is now 10 of 10, so the same write a moment later cannot
   succeed - which is the whole point of counting in the database. */
await check('the next person cannot have the same last place', 'deny', () => signup(anon(), 'key_too_late_00000000000000000000'));
await check('a sign-up that leaves the counter alone is refused', 'deny', () => setDoc(doc(anon(), 'signups', 'key_no_counter_0000000000000000'), {
  calEventId: 'ev_members', personKind: 'contacts', personId: 'c_guest', name: 'Sneaky',
  email: 'sneaky@example.invalid', places: 1, status: 'confirmed', attendees: [], answers: {} }));
await check('a sign-up cannot claim more places than it counts', 'deny', () => signup(anon(), 'key_two_for_one_000000000000000', { places: 2, counterBy: 1, calEventId: 'ev_members' }));
/* The ceiling itself, which the two tests above do not touch: this one
   counts honestly and still asks for more places than are left. */
await check('a sign-up cannot take more places than are left', 'deny', () => {
  const dbx = anon(); const b = writeBatch(dbx);
  b.set(doc(dbx, 'signups', 'key_over_capacity_00000000000000'), {
    calEventId: 'ev_members', personKind: 'contacts', personId: 'c_guest', name: 'Too Many',
    email: 'toomany@example.invalid', places: 8, status: 'confirmed', attendees: [], answers: {} });
  b.update(doc(dbx, 'capacity', 'ev_members'), { taken: 9 });
  return b.commit();
});
await check('a waiting-list place takes no seat', 'allow', () => setDoc(doc(anon(), 'signups', 'key_waiting_0000000000000000000'), {
  calEventId: 'ev_public', personKind: 'contacts', personId: 'c_guest', name: 'Hopeful',
  email: 'hopeful@example.invalid', places: 1, status: 'waiting', attendees: [], answers: {} }));
await check('a sign-up cannot be written as already cancelled', 'deny', () => setDoc(doc(anon(), 'signups', 'key_weird_status_00000000000000'), {
  calEventId: 'ev_public', personKind: 'contacts', personId: 'c_guest', name: 'Odd',
  email: 'odd@example.invalid', places: 1, status: 'cancelled', attendees: [], answers: {} }));

/* ---- the manage link ------------------------------------------------
   The document id is the key. Knowing it opens one booking; nothing can
   be listed, so nothing can be swept up. */
await check('the key opens that one sign-up', 'allow', () => getDoc(doc(anon(), 'signups', 'key_already_here_0000000000000000')));
await check('nobody can list the sign-ups without an account', 'deny', () => getDocs(collection(anon(), 'signups')));
await check('an ordinary member cannot list the sign-ups either', 'deny', () => getDocs(collection(as('samy'), 'signups')));
await check('an admin lists the sign-ups', 'allow', () => getDocs(collection(as('karen'), 'signups')));
/* My events on the hub: a member asks for their own and gets them; the
   same question about somebody else is refused. */
await check('a member lists their own sign-ups', 'allow', () => getDocs(query(collection(as('samy'), 'signups'), where('memberUid', '==', 'u_samy'))));
await check('a member cannot list another person’s', 'deny', () => getDocs(query(collection(as('samy'), 'signups'), where('memberUid', '==', 'u_karen'))));
await check('the key-holder cancels their place', 'allow', () => updateDoc(doc(anon(), 'signups', 'key_already_here_0000000000000000'), { status: 'cancelled' }));
await check('the key-holder cannot give themselves more places', 'deny', () => updateDoc(doc(anon(), 'signups', 'key_already_here_0000000000000000'), { places: 9 }));
await check('the key-holder cannot move their place to another event', 'deny', () => updateDoc(doc(anon(), 'signups', 'key_already_here_0000000000000000'), { status: 'cancelled', calEventId: 'ev_public' }));
await check('the key-holder cannot delete the record', 'deny', () => deleteDoc(doc(anon(), 'signups', 'key_already_here_0000000000000000')));

/* ---- the admin's side ------------------------------------------------ */
await check('a member cannot read an internal note', 'deny', () => getDoc(doc(as('samy'), 'eventNotes', 'ev_public')));
await check('an admin reads an internal note', 'allow', () => getDoc(doc(as('karen'), 'eventNotes', 'ev_public')));
await check('a member reads the checklist', 'allow', () => getDoc(doc(as('samy'), 'eventChecklists', 'ev_public')));
await check('a member cannot tick the checklist', 'deny', () => setDoc(doc(as('samy'), 'eventChecklists', 'ev_public'), { tasks: [] }));
await check('an admin ticks the checklist', 'allow', () => setDoc(doc(as('karen'), 'eventChecklists', 'ev_public'), { tasks: [{ text: 'Chairs out', done: true }] }));
await check('an admin adds to the change history', 'allow', () => setDoc(doc(as('karen'), 'eventChanges', 'ch2'), { calEventId: 'ev_public', by: 'u_karen', what: 'edited' }));
await check('history cannot be rewritten, even by a master admin', 'deny', () => updateDoc(doc(as('martin'), 'eventChanges', 'ch1'), { what: 'never happened' }));
await check('history cannot be deleted', 'deny', () => deleteDoc(doc(as('martin'), 'eventChanges', 'ch1')));
await check('what was emailed cannot be rewritten', 'deny', () => updateDoc(doc(as('martin'), 'commsLog', 'log1'), { subject: 'changed' }));
await check('the public cannot read the change history', 'deny', () => getDoc(doc(anon(), 'eventChanges', 'ch1')));

/* The AV inventory and the schematic. Neither had a rule, so both were
   denied by the catch-all - the pages would not have read, let alone
   saved, once the rules were deployed. */
await check('a member can look up what kit there is', 'allow', () => getDoc(doc(as('samy'), 'inventory', 'inv1')));
await check('a member cannot change the inventory', 'deny', () => setDoc(doc(as('samy'), 'inventory', 'inv1'), { name: 'Mine now' }));
await check('a master admin can', 'allow', () => setDoc(doc(as('martin'), 'inventory', 'inv1'), { name: 'Synthetic mixing desk' }));
await check('a member reads the AV schematic', 'allow', () => getDoc(doc(as('samy'), 'av_schematic', 'main')));
await check('a member cannot redraw it', 'deny', () => setDoc(doc(as('samy'), 'av_schematic', 'main'), { boxes: [] }));
await check('nobody without an account can read either', 'deny', () => getDoc(doc(anon(), 'inventory', 'inv1')));

// ── EVENTS (events window) ── check-in and attendance (Chunk 3, stage 1)
{
  const FAM = 'key_kids_family_0000000000000000';
  const CK = (i) => 'ev_kids__' + FAM + '__' + i;
  const arrive = (i, extra) => ({ calEventId: 'ev_kids', signupKey: FAM, attendeeIndex: i, name: 'Child ' + i,
    kind: 'booked', state: 'in', inAt: '2026-11-14T10:02:00Z', inBy: 'u_karen', inByName: 'u_karen',
    roomId: 'room_hall', day: '2026-11-14', updatedAt: '2026-11-14T10:02:00Z', ...(extra || {}) });
  const leave = (extra) => ({ state: 'out', outAt: '2026-11-14T12:00:00Z', outBy: 'u_karen', outByName: 'u_karen', ...(extra || {}) });

  await check('the public cannot read a check-in', 'deny', () => getDoc(doc(anon(), 'checkins', CK(1))));
  await check('a member cannot read the check-ins', 'deny', () => getDoc(doc(as('samy'), 'checkins', CK(1))));
  await check('an admin reads the check-ins', 'allow', () => getDocs(query(collection(as('karen'), 'checkins'), where('calEventId', '==', 'ev_kids'))));
  await check('a member cannot check anyone in', 'deny', () => setDoc(doc(as('samy'), 'checkins', CK(0)), arrive(0)));
  await check('an admin checks a child in', 'allow', () => setDoc(doc(as('karen'), 'checkins', CK(0)), arrive(0)));
  /* The double-count test: a second phone scanning the same child a moment
     later writes the same document, and is refused. */
  await check('a second device cannot check the same child in again', 'deny', () => setDoc(doc(as('martin'), 'checkins', CK(0)), arrive(0, { inBy: 'u_martin' })));
  await check('a check-in cannot be filed under a made-up id', 'deny', () => setDoc(doc(as('karen'), 'checkins', 'ev_kids__anything'), arrive(0)));
  await check('nobody arrives already checked out', 'deny', () => setDoc(doc(as('karen'), 'checkins', 'ev_kids__w_new_0000__0'),
    { ...arrive(0), signupKey: 'w_new_0000', kind: 'walkin', state: 'out' }));
  await check('a check-in holds only its own fields', 'deny', () => setDoc(doc(as('karen'), 'checkins', 'ev_kids__w_extra_000__0'),
    { ...arrive(0), signupKey: 'w_extra_000', kind: 'walkin', medical: 'nut allergy' }));
  await check('a child cannot go home with nobody named', 'deny', () => updateDoc(doc(as('karen'), 'checkins', CK(1)), leave()));
  await check('a child goes home with a listed collector', 'allow', () => updateDoc(doc(as('karen'), 'checkins', CK(1)), leave({ collectedBy: 'Aunt Invented', collectorListed: true })));
  await check('someone not listed cannot collect without a reason', 'deny', () => updateDoc(doc(as('karen'), 'checkins', CK(2)), leave({ collectedBy: 'Stranger Unknown', collectorListed: false })));
  await check('someone not listed collects when a reason is written down', 'allow', () => updateDoc(doc(as('karen'), 'checkins', CK(2)), leave({ collectedBy: 'Grandparent Invented', collectorListed: false, overrideReason: 'Parent phoned the leader to say so' })));
  await check('a leader leaves without being collected', 'allow', () => updateDoc(doc(as('karen'), 'checkins', 'ev_kids__l_leader_00000000000000000000000000__0'), leave()));
  await check('someone checked out can come back in', 'allow', () => updateDoc(doc(as('karen'), 'checkins', CK(1)), { state: 'in', inAt: '2026-11-14T12:10:00Z' }));
  await check('a check-in cannot be moved to another event', 'deny', () => updateDoc(doc(as('karen'), 'checkins', CK(1)), { ...leave({ collectedBy: 'Parent Synthetic', collectorListed: true }), calEventId: 'ev_public' }));
  await check('a check-in cannot be deleted, even by a master admin', 'deny', () => deleteDoc(doc(as('martin'), 'checkins', CK(1))));

  /* A walk-in is a real sign-up, so the capacity rule counts it. One place
     is left: the first walk-in has it, the second is refused. */
  const walkIn = (dbx, n) => {
    const b = writeBatch(dbx), key = ('w_walkin_' + n).padEnd(32, '0');
    b.set(doc(dbx, 'contacts', 'c_walk_' + n), { name: 'Walk In ' + n, email: '', phone: '', source: 'signup', createdAt: '2026-11-14T10:05:00Z' });
    b.set(doc(dbx, 'signups', key), { calEventId: 'ev_kids', personKind: 'contacts', personId: 'c_walk_' + n, name: 'Walk In ' + n,
      email: '', phone: '', attendees: [{ name: 'Walk In ' + n }], answers: {}, places: 1, ticketTypeId: '', status: 'confirmed',
      donation: 0, notes: 'Walk-in at the door', memberUid: '', createdAt: '2026-11-14T10:05:00Z' });
    b.update(doc(dbx, 'capacity', 'ev_kids'), { taken: 3 + n });   // counts honestly every time
    b.set(doc(dbx, 'checkins', 'ev_kids__' + key + '__0'), { ...arrive(0), signupKey: key, kind: 'walkin', name: 'Walk In ' + n });
    return b.commit();
  };
  await check('a walk-in takes the last place', 'allow', () => walkIn(as('karen'), 1));
  await check('a walk-in cannot take a place that is not there', 'deny', () => walkIn(as('karen'), 2));

  await check('a member cannot read the check-in settings', 'deny', () => getDoc(doc(as('samy'), 'checkinSettings', 'ev_kids')));
  await check('an admin sets who may collect', 'allow', () => setDoc(doc(as('karen'), 'checkinSettings', 'ev_public'), { checkoutRequired: false, collectorsQuestionId: '', flagQuestionIds: ['q_diet'] }));
  await check('check-in settings hold only their own fields', 'deny', () => setDoc(doc(as('karen'), 'checkinSettings', 'ev_public'), { checkoutRequired: false, anything: 1 }));

  await check('an admin logs their own download', 'allow', () => setDoc(doc(as('karen'), 'downloadsLog', 'dl2'), { by: 'u_karen', byName: 'Karen', at: '2026-11-14T12:01:00Z', calEventId: 'ev_kids', what: 'register', format: 'pdf', columns: ['Name'], sensitive: false }));
  await check('a download cannot be logged in someone else\'s name', 'deny', () => setDoc(doc(as('karen'), 'downloadsLog', 'dl3'), { by: 'u_martin', at: '2026-11-14T12:01:00Z', sensitive: true }));
  await check('the downloads log cannot be rewritten', 'deny', () => updateDoc(doc(as('martin'), 'downloadsLog', 'dl1'), { sensitive: false }));
  await check('the downloads log cannot be deleted', 'deny', () => deleteDoc(doc(as('martin'), 'downloadsLog', 'dl1')));
  await check('a member cannot read the downloads log', 'deny', () => getDoc(doc(as('samy'), 'downloadsLog', 'dl1')));

  await check('an admin records a headcount', 'allow', () => setDoc(doc(as('karen'), 'headcounts', 'hc2'), { date: '2026-11-22', label: 'Sunday morning', calEventId: '', adults: 75, children: 18, online: 10, notes: '', by: 'u_karen', byName: 'Karen', at: '2026-11-22T12:00:00Z' }));
  await check('a headcount cannot be negative', 'deny', () => setDoc(doc(as('karen'), 'headcounts', 'hc3'), { date: '2026-11-22', label: 'Sunday morning', adults: -1, children: 0, online: 0 }));
  await check('a headcount holds numbers, not names', 'deny', () => setDoc(doc(as('karen'), 'headcounts', 'hc4'), { date: '2026-11-22', label: 'Sunday morning', adults: 1, children: 0, online: 0, names: ['Someone'] }));
  await check('a member cannot read the headcounts', 'deny', () => getDoc(doc(as('samy'), 'headcounts', 'hc1')));
}

// ── EVENTS (events window) ── forms and consent (Chunk 3, stage 2)
{
  const ella = () => env.authenticatedContext('u_ella').firestore();
  const lena = () => env.authenticatedContext('u_lena').firestore();
  const RESP = (key, extra) => ({ formId: 'form_consent', formVersion: 1, requestKey: key, calEventId: 'ev_kids',
    personKind: 'contacts', personId: 'c_guest', email: 'parent@example.invalid', name: 'Parent Synthetic',
    subjects: ['Child One'], siteId: 'site_kids', answers: { collectors: 'Parent Synthetic' }, hasSensitive: true,
    submittedAt: '2026-11-01T10:00:00Z', validUntil: '2027-08-31', deleteAfter: '2028-08-31', ...(extra || {}) });
  const SENS = (key, rid, extra) => ({ responseId: rid, requestKey: key, formId: 'form_consent', siteId: 'site_kids', calEventId: 'ev_kids',
    answers: { children: [{ allergies: 'Invented peanut allergy' }] }, submittedAt: '2026-11-01T10:00:00Z', deleteAfter: '2028-08-31', ...(extra || {}) });
  /* What form.html writes: the answer, its medical half, and the request
     marked done - all in one batch, as somebody with no account. */
  const complete = (key, rid, sid, over) => {
    const dbx = anon(), b = writeBatch(dbx);
    b.set(doc(dbx, 'formResponses', rid), RESP(key, over && over.resp));
    if (sid) b.set(doc(dbx, 'sensitiveResponses', sid), SENS(key, rid, over && over.sens));
    if (!(over && over.leaveOpen)) b.update(doc(dbx, 'formRequests', key), { status: 'done', completedAt: '2026-11-01T10:00:00Z', responseId: rid });
    return b.commit();
  };

  await check('anyone with the link can read the form itself', 'allow', () => getDoc(doc(anon(), 'forms', 'form_consent')));
  await check('the public cannot list the forms', 'deny', () => getDocs(collection(anon(), 'forms')));
  await check('a member cannot write a form', 'deny', () => setDoc(doc(as('samy'), 'forms', 'form_x'), { title: 'Mine', fields: [], siteId: '' }));
  await check('an admin builds a form for their own team', 'allow', () => setDoc(doc(as('karen'), 'forms', 'form_new'), { title: 'Test trip', fields: [], siteId: 'site_kids', team: 'Kids Church' }));
  await check('a member cannot see which forms an event asks for', 'deny', () => getDoc(doc(as('samy'), 'eventForms', 'ev_kids')));
  await check('an admin attaches forms to an event', 'allow', () => setDoc(doc(as('karen'), 'eventForms', 'ev_kids'), { forms: [{ formId: 'form_consent' }] }));

  await check('the link opens its own request', 'allow', () => getDoc(doc(anon(), 'formRequests', 'req_open_0')));
  await check('nobody without an account can list the requests', 'deny', () => getDocs(collection(anon(), 'formRequests')));
  await check('a member cannot send a form', 'deny', () => setDoc(doc(as('samy'), 'formRequests', 'req_sneak'), { formId: 'form_consent', status: 'sent' }));
  await check('an admin sends a form', 'allow', () => setDoc(doc(as('karen'), 'formRequests', 'req_sent_by_admin'), { formId: 'form_consent', status: 'sent' }));

  await check('a parent sends the form: answers, medical half, request done', 'allow', () => complete('req_open_0', 'resp_new_0', 'secret_new_0_000000000000000000'));
  await check('the same link cannot send a second answer', 'deny', () => complete('req_open_0', 'resp_new_0b', 'secret_new_0b_00000000000000000'));
  await check('nor add medical details to a form already done', 'deny', () => setDoc(doc(anon(), 'sensitiveResponses', 'secret_late_000000000000000000'), SENS('req_open_0', 'resp_new_0')));
  await check('an answer cannot claim another site', 'deny', () => complete('req_open_1', 'resp_new_1', null, { resp: { siteId: 'site_test' } }));
  await check('an answer cannot claim another person', 'deny', () => complete('req_open_1', 'resp_new_1', null, { resp: { email: 'someone.else@example.invalid' } }));
  await check('an answer is refused unless the request is marked done with it', 'deny', () => complete('req_open_1', 'resp_new_1', null, { leaveOpen: true }));
  await check('the medical half cannot point at another site', 'deny', () => complete('req_open_2', 'resp_new_2', 'secret_new_2_000000000000000000', { sens: { siteId: 'site_test' } }));
  await check('the link cannot change who or what the request is for', 'deny', () => updateDoc(doc(anon(), 'formRequests', 'req_open_3'), { email: 'me@example.invalid' }));
  await check('"still correct": the parent confirms the answer on file', 'allow', () => updateDoc(doc(anon(), 'formRequests', 'req_reuse_0'),
    { status: 'done', completedAt: '2026-11-01T10:00:00Z', responseId: 'resp_old', confirmedStillCorrect: true }));
  await check('"still correct" cannot point at somebody else\'s answer', 'deny', () => updateDoc(doc(anon(), 'formRequests', 'req_reuse_1'),
    { status: 'done', completedAt: '2026-11-01T10:00:00Z', responseId: 'resp_other', confirmedStillCorrect: true }));
  await check('an answer cannot be changed afterwards, even by a master admin', 'deny', () => updateDoc(doc(as('martin'), 'formResponses', 'resp_old'), { answers: {} }));
  await check('a medical answer cannot be changed afterwards', 'deny', () => updateDoc(doc(as('martin'), 'sensitiveResponses', 'secret_old_00000000000000000000'), { answers: {} }));

  /* Who may read the medical half. */
  await check('the parent\'s private link opens what they sent', 'allow', () => getDoc(doc(anon(), 'sensitiveResponses', 'secret_old_00000000000000000000')));
  await check('nobody without an account can list medical answers', 'deny', () => getDocs(collection(anon(), 'sensitiveResponses')));
  await check('an admin of the form\u2019s own team lists the ordinary answers', 'allow', () => getDocs(query(collection(as('karen'), 'formResponses'), where('formId', '==', 'form_consent'))));
  await check('an admin of another team (AV) does not (F-087)', 'deny', () => getDocs(query(collection(ella(), 'formResponses'), where('formId', '==', 'form_consent'))));
  await check('an ordinary admin cannot list the medical answers', 'deny', () => getDocs(query(collection(ella(), 'sensitiveResponses'), where('siteId', '==', 'site_kids'))));
  await check('the site\'s safeguarding lead lists its medical answers, without being an admin', 'allow', () => getDocs(query(collection(lena(), 'sensitiveResponses'), where('siteId', '==', 'site_kids'))));
  await check('but not another site\'s', 'deny', () => getDocs(query(collection(lena(), 'sensitiveResponses'), where('siteId', '==', 'site_test'))));
  await check('a master admin lists the medical answers', 'allow', () => getDocs(query(collection(as('martin'), 'sensitiveResponses'), where('siteId', '==', 'site_kids'))));
  await check('a member who is not a lead cannot list the answers', 'deny', () => getDocs(query(collection(as('samy'), 'formResponses'), where('siteId', '==', 'site_kids'))));
}

// ── EVENTS (events window) ── safeguarding (Chunk 3, stage 3)
{
  const leo = () => env.authenticatedContext('u_leo').firestore();
  const ella = () => env.authenticatedContext('u_ella').firestore();
  const lena = () => env.authenticatedContext('u_lena').firestore();
  const q = (dbx, c, field, v) => getDocs(query(collection(dbx, c), where(field, '==', v)));
  const KID = { calEventId: 'ev_safe', signupKey: 'key_safe_family_0000000000000000', attendeeIndex: 0, name: 'Child Safe',
    kind: 'booked', state: 'in', inAt: '2026-11-21T10:01:00Z', inBy: 'u_leo', roomId: '', day: '2026-11-21' };
  const INC = (extra) => ({ calEventId: 'ev_safe', siteId: 'site_kids', happenedAt: '2026-11-21T10:30', people: 'Child Safe',
    what: 'Invented: tripped on the stairs, grazed knee', firstAid: true, firstAidBy: 'Leo', parentInformed: true,
    informedBy: 'Leo', informedAt: '2026-11-21T12:00', followUp: '', reportedBy: 'u_leo', reportedByName: 'Leo',
    createdAt: '2026-11-21T10:40:00Z', ...(extra || {}) });
  const CONCERN = (extra) => ({ siteId: 'site_kids', calEventId: 'ev_safe', about: 'An invented child', concern: 'Invented words for a test',
    reportedBy: 'u_leo', reportedByName: 'Leo', createdAt: '2026-11-21T10:50:00Z', status: 'new', ...(extra || {}) });

  /* An event's leaders: who may set them. */
  await check('a member can see who leads an event', 'allow', () => getDoc(doc(as('samy'), 'eventLeaders', 'ev_safe')));
  await check('a member cannot make themselves a leader', 'deny', () => setDoc(doc(as('samy'), 'eventLeaders', 'ev_other'), { leaders: [], leaderUids: ['u_samy'], siteId: 'site_kids' }));
  await check('an admin names the leaders', 'allow', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_other'), { leaders: [], leaderUids: [], siteId: 'site_kids', ratioAll: 8, ratioUnder8: 4 }));
  await check('the leaders\' site has to be the event\'s site', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_other'), { leaders: [], leaderUids: [], siteId: 'site_test' }));
  await check('the site\'s safeguarding lead names leaders without being an admin', 'allow', () => setDoc(doc(lena(), 'eventLeaders', 'ev_other'), { leaders: [], leaderUids: [], siteId: 'site_kids' }));

  /* What a leader who is not an admin can do - for their event only. */
  await check('a leader lists the sign-ups of the event they lead', 'allow', () => q(leo(), 'signups', 'calEventId', 'ev_safe'));
  await check('but not another event\'s', 'deny', () => q(leo(), 'signups', 'calEventId', 'ev_kids'));
  await check('a member who is not a leader cannot list them', 'deny', () => q(as('samy'), 'signups', 'calEventId', 'ev_safe'));
  await check('the site’s safeguarding lead lists them, for the ratios', 'allow', () => q(lena(), 'signups', 'calEventId', 'ev_safe'));
  await check('but not those of an event on another site', 'deny', () => q(lena(), 'signups', 'calEventId', 'ev_kids'));
  await check('a leader checks a child in at their event', 'allow', () => setDoc(doc(leo(), 'checkins', 'ev_safe__key_safe_family_0000000000000000__0'), KID));
  await check('but not at another event', 'deny', () => setDoc(doc(leo(), 'checkins', 'ev_kids__key_safe_family_0000000000000000__0'), { ...KID, calEventId: 'ev_kids' }));
  await check('a leader reads their event\'s check-in settings', 'allow', () => getDoc(doc(leo(), 'checkinSettings', 'ev_safe')));
  await check('a leader lists the forms done for their event', 'allow', () => q(leo(), 'formRequests', 'calEventId', 'ev_safe'));
  await check('but not another event\'s', 'deny', () => q(leo(), 'formRequests', 'calEventId', 'ev_kids'));

  /* §7.4: who may read medical answers. */
  await check('a leader reads the medical answers given for their event', 'allow', () => q(leo(), 'sensitiveResponses', 'calEventId', 'ev_safe'));
  await check('a leader cannot read another event\'s medical answers', 'deny', () => q(leo(), 'sensitiveResponses', 'calEventId', 'ev_other'));
  await check('a member who is not a leader of that event cannot read them', 'deny', () => q(as('samy'), 'sensitiveResponses', 'calEventId', 'ev_safe'));
  await check('an ordinary admin cannot read them either', 'deny', () => q(ella(), 'sensitiveResponses', 'calEventId', 'ev_safe'));
  await check('a guest\'s private key opens their own record', 'allow', () => getDoc(doc(anon(), 'sensitiveResponses', 'secret_safe_000000000000000000000')));
  await check('and nothing else: a guest cannot list them', 'deny', () => q(anon(), 'sensitiveResponses', 'calEventId', 'ev_safe'));

  /* "Still correct" for a second event: the lead shares a copy. */
  const COPY = (extra) => ({ responseId: 'resp_safe', requestKey: 'req_safe', formId: 'form_consent', siteId: 'site_kids', calEventId: 'ev_other',
    answers: { allergies: 'Invented sesame allergy' }, submittedAt: '2026-11-01T10:00:00Z', deleteAfter: '2028-08-31',
    sharedFrom: 'secret_safe_000000000000000000000', sharedBy: 'u_lena', sharedAt: '2026-11-20T09:00:00Z', ...(extra || {}) });
  await check('the safeguarding lead shares a family\'s medical answers with another event\'s leaders', 'allow', () => setDoc(doc(lena(), 'sensitiveResponses', 'share_1_0000000000000000000000'), COPY()));
  await check('an ordinary admin cannot', 'deny', () => setDoc(doc(ella(), 'sensitiveResponses', 'share_2_0000000000000000000000'), COPY()));
  await check('a share must be a copy of the record it names', 'deny', () => setDoc(doc(lena(), 'sensitiveResponses', 'share_3_0000000000000000000000'), COPY({ responseId: 'resp_someone_else' })));
  await check('a leader cannot share medical answers', 'deny', () => setDoc(doc(leo(), 'sensitiveResponses', 'share_4_0000000000000000000000'), COPY()));

  /* Leader checks: dates and status, never a certificate number. */
  await check('the safeguarding lead records a leader\'s checks', 'allow', () => setDoc(doc(lena(), 'leaderChecks', 'm_u_leo'),
    { name: 'Leo', dbsStatus: 'current', dbsSeen: '2025-01-10', trainingDate: '2025-02-01', siteId: 'site_kids', updatedAt: 'x', updatedBy: 'u_lena' }));
  await check('there is no room for a DBS certificate number', 'deny', () => setDoc(doc(lena(), 'leaderChecks', 'm_u_leo'),
    { name: 'Leo', dbsStatus: 'current', dbsSeen: '2025-01-10', trainingDate: '2025-02-01', siteId: 'site_kids', certificate: '001234567890' }));
  await check('an ordinary admin cannot record checks', 'deny', () => setDoc(doc(ella(), 'leaderChecks', 'm_u_leo'), { dbsStatus: 'current', siteId: 'site_kids' }));
  await check('an admin can see a leader\'s checks, to plan', 'allow', () => getDoc(doc(ella(), 'leaderChecks', 'm_u_leo')));
  await check('a leader sees their own', 'allow', () => getDoc(doc(leo(), 'leaderChecks', 'm_u_leo')));
  await check('a member cannot see someone else\'s', 'deny', () => getDoc(doc(as('samy'), 'leaderChecks', 'm_u_leo')));

  /* The incident log. */
  await check('a leader records an incident at their event', 'allow', () => setDoc(doc(leo(), 'incidents', 'inc_2'), INC()));
  await check('not in somebody else\'s name', 'deny', () => setDoc(doc(leo(), 'incidents', 'inc_3'), INC({ reportedBy: 'u_karen' })));
  await check('not at an event they do not lead', 'deny', () => setDoc(doc(leo(), 'incidents', 'inc_4'), INC({ calEventId: 'ev_other' })));
  await check('not filed under another site', 'deny', () => setDoc(doc(lena(), 'incidents', 'inc_5'), INC({ siteId: 'site_test', reportedBy: 'u_lena' })));
  await check('the leader reads their event\'s incidents', 'allow', () => q(leo(), 'incidents', 'calEventId', 'ev_safe'));
  await check('the safeguarding lead reads the site\'s incidents', 'allow', () => q(lena(), 'incidents', 'siteId', 'site_kids'));
  await check('an ordinary admin cannot read the incident log', 'deny', () => q(ella(), 'incidents', 'siteId', 'site_kids'));
  await check('a member cannot read it', 'deny', () => getDoc(doc(as('samy'), 'incidents', 'inc_1')));
  await check('the lead adds a follow-up', 'allow', () => updateDoc(doc(lena(), 'incidents', 'inc_2'), { followUp: 'Parent spoken to the next day' }));
  await check('what was reported cannot be changed, even by the lead', 'deny', () => updateDoc(doc(lena(), 'incidents', 'inc_2'), { what: 'Something else' }));
  await check('an incident cannot be deleted, even by a master admin', 'deny', () => deleteDoc(doc(as('martin'), 'incidents', 'inc_1')));

  /* §7.4: concerns go to the safeguarding lead and nobody else. */
  await check('a leader reports a concern', 'allow', () => setDoc(doc(leo(), 'concerns', 'con_2'), CONCERN()));
  await check('not in somebody else\'s name', 'deny', () => setDoc(doc(leo(), 'concerns', 'con_3'), CONCERN({ reportedBy: 'u_karen' })));
  await check('not to a site with no safeguarding lead to read it', 'deny', () => setDoc(doc(leo(), 'concerns', 'con_4'), CONCERN({ siteId: 'site_nolead' })));
  await check('the safeguarding lead reads it', 'allow', () => getDoc(doc(lena(), 'concerns', 'con_2')));
  await check('a master admin cannot read a concern', 'deny', () => getDoc(doc(as('martin'), 'concerns', 'con_2')));
  await check('an admin cannot read a concern', 'deny', () => q(as('karen'), 'concerns', 'siteId', 'site_kids'));
  await check('the person who reported it cannot read it back', 'deny', () => getDoc(doc(leo(), 'concerns', 'con_2')));
  await check('the lead marks it seen', 'allow', () => updateDoc(doc(lena(), 'concerns', 'con_2'), { status: 'seen', seenAt: '2026-11-21T12:00:00Z' }));
  await check('the lead cannot rewrite what was reported', 'deny', () => updateDoc(doc(lena(), 'concerns', 'con_2'), { concern: 'changed' }));
  await check('a concern cannot be deleted', 'deny', () => deleteDoc(doc(lena(), 'concerns', 'con_1')));

  /* Retention: what was deleted is recorded, by master admins only. */
  await check('a master admin records what was deleted', 'allow', () => setDoc(doc(as('martin'), 'retentionLog', 'r1'), { by: 'u_martin', count: 2 }));
  await check('an ordinary admin cannot', 'deny', () => setDoc(doc(ella(), 'retentionLog', 'r2'), { by: 'u_ella', count: 2 }));
  await check('the record cannot be rewritten', 'deny', () => updateDoc(doc(as('martin'), 'retentionLog', 'r1'), { count: 0 }));
  await check('a leader logs a download in their own name', 'allow', () => setDoc(doc(leo(), 'downloadsLog', 'dl_leo'),
    { by: 'u_leo', byName: 'Leo', at: '2026-11-21T13:00:00Z', calEventId: 'ev_safe', what: 'incidents', format: 'csv', columns: [], sensitive: true }));

  /* Safeguarding settings: one place for the periods. */
  const SET = (extra) => ({ templates: { parent: { validity: { mode: 'schoolyear' }, retentionMonths: 24 } }, ratioAll: 8, ratioUnder8: 4,
    dbsYears: 3, trainingYears: 3, requireChecks: true, updatedAt: '2026-10-08T10:00:00Z', updatedBy: 'x', ...(extra || {}) });
  await check('a member can read the safeguarding settings', 'allow', () => getDoc(doc(as('samy'), 'safeguardingSettings', 'defaults')));
  await check('a member cannot change them', 'deny', () => setDoc(doc(as('samy'), 'safeguardingSettings', 'defaults'), SET()));
  await check('an admin changes them', 'allow', () => setDoc(doc(as('karen'), 'safeguardingSettings', 'defaults'), SET()));
  await check('a safeguarding lead who is not an admin changes them, naming her site', 'allow', () => setDoc(doc(lena(), 'safeguardingSettings', 'defaults'), SET({ leadSiteId: 'site_kids' })));
  await check('not by naming a site she does not lead', 'deny', () => setDoc(doc(lena(), 'safeguardingSettings', 'defaults'), SET({ leadSiteId: 'site_test' })));
  await check('years have to be whole years, 1 to 10', 'deny', () => setDoc(doc(as('karen'), 'safeguardingSettings', 'defaults'), SET({ dbsYears: 0 })));
  await check('there is only one settings document', 'deny', () => setDoc(doc(as('karen'), 'safeguardingSettings', 'other'), SET()));
  await check('the lead applies a new period to her site\u2019s forms', 'allow', () => updateDoc(doc(lena(), 'forms', 'form_consent'), { retentionMonths: 24, validity: { mode: 'schoolyear' } }));
  await check('but cannot change anything else about the form', 'deny', () => updateDoc(doc(lena(), 'forms', 'form_consent'), { title: 'Changed' }));
  await check('the lead lists her site\u2019s forms', 'allow', () => getDocs(query(collection(lena(), 'forms'), where('siteId', '==', 'site_kids'))));
  await check('an answer already given keeps its dates: it cannot be changed', 'deny', () => updateDoc(doc(as('martin'), 'formResponses', 'resp_old'), { validUntil: '2030-01-01' }));
}

// ── EVENTS (events window) ── one-off upload links (E4)
{
  const ITEM = (link, slot, extra) => ({ linkId: link, slot, calEventId: 'ev_public', path: 'uploads/' + link + '/' + slot,
    name: 'party.jpg', type: 'image/jpeg', size: 1000, uploaderName: 'A guest', at: '2026-10-08T10:00:00Z', status: 'pending', ...(extra || {}) });
  const NEWLINK = (extra) => ({ calEventId: 'ev_public', eventTitle: 'Test Carols', createdBy: 'u_karen', createdByName: 'Karen', createdAt: 'x',
    expiresAt: new Date(Date.now() + 14 * 864e5), maxFiles: 50, active: true, count: 0, ...(extra || {}) });

  await check('an admin makes an upload link', 'allow', () => setDoc(doc(as('karen'), 'uploadLinks', 'up_new'), NEWLINK()));
  await check('a member cannot', 'deny', () => setDoc(doc(as('samy'), 'uploadLinks', 'up_sneak'), NEWLINK({ createdBy: 'u_samy' })));
  await check('a link starts empty: it cannot be made with places already taken', 'deny', () => setDoc(doc(as('karen'), 'uploadLinks', 'up_bad'), NEWLINK({ count: 5 })));
  await check('anyone with the link can read it', 'allow', () => getDoc(doc(anon(), 'uploadLinks', 'up_open')));
  await check('nobody without an account can list the links', 'deny', () => getDocs(collection(anon(), 'uploadLinks')));

  await check('a guest takes the next place on an open link', 'allow', () => updateDoc(doc(anon(), 'uploadLinks', 'up_open'), { count: 2 }));
  await check('not two places at once', 'deny', () => updateDoc(doc(anon(), 'uploadLinks', 'up_open'), { count: 4 }));
  await check('not on an expired link', 'deny', () => updateDoc(doc(anon(), 'uploadLinks', 'up_expired'), { count: 2 }));
  await check('not on a link switched off', 'deny', () => updateDoc(doc(anon(), 'uploadLinks', 'up_off'), { count: 2 }));
  await check('not past the link\u2019s limit', 'deny', () => updateDoc(doc(anon(), 'uploadLinks', 'up_full'), { count: 4 }));
  await check('a guest cannot switch a link back on', 'deny', () => updateDoc(doc(anon(), 'uploadLinks', 'up_off'), { active: true }));
  await check('an admin switches a link off', 'allow', () => updateDoc(doc(as('karen'), 'uploadLinks', 'up_new'), { active: false }));

  await check('a guest records a photo in a place they took', 'allow', () => setDoc(doc(anon(), 'uploadItems', 'up_open__1'), ITEM('up_open', 1)));
  await check('not in a place nobody took', 'deny', () => setDoc(doc(anon(), 'uploadItems', 'up_open__9'), ITEM('up_open', 9)));
  await check('not already approved', 'deny', () => setDoc(doc(anon(), 'uploadItems', 'up_open__1b'), ITEM('up_open', 1, { status: 'approved' })));
  await check('not against an expired link', 'deny', () => setDoc(doc(anon(), 'uploadItems', 'up_expired__0'), ITEM('up_expired', 0)));
  await check('not against a link switched off', 'deny', () => setDoc(doc(anon(), 'uploadItems', 'up_off__0'), ITEM('up_off', 0)));
  await check('a guest cannot read the photos\u2019 records', 'deny', () => getDoc(doc(anon(), 'uploadItems', 'up_open__0')));
  await check('nor can a member', 'deny', () => getDocs(query(collection(as('samy'), 'uploadItems'), where('calEventId', '==', 'ev_public'))));
  await check('an admin reads the review queue', 'allow', () => getDocs(query(collection(as('karen'), 'uploadItems'), where('calEventId', '==', 'ev_public'))));
  await check('an admin approves a photo', 'allow', () => updateDoc(doc(as('karen'), 'uploadItems', 'up_open__0'), { status: 'approved', reviewedBy: 'u_karen', reviewedAt: 'x' }));
  await check('a guest cannot approve one', 'deny', () => updateDoc(doc(anon(), 'uploadItems', 'up_open__0'), { status: 'approved' }));
  await check('a record cannot be deleted, even by a master admin', 'deny', () => deleteDoc(doc(as('martin'), 'uploadItems', 'up_open__0')));
}

// ── EVENTS (events window) ── room bookings, R2
{
  const lena = () => env.authenticatedContext('u_lena').firestore();
  /* A booking as the pages write it, with its quarter-hours worked out. */
  const B = (day, start, end, extra) => {
    const o = { setupMins: 0, packdownMins: 0, ...(extra || {}) };
    const a = start - o.setupMins, b = end + o.packdownMins;
    return { kind: 'member', status: 'confirmed', siteId: 'site_bk', roomId: 'room_band', groupId: '', day, startMin: start, endMin: end,
      startLocal: day + 'T00:00', endLocal: day + 'T00:00', slotFrom: Math.floor(a / 15), slotTo: Math.ceil(b / 15),
      title: 'Test band practice', people: 6, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false },
      resources: [], notes: '', requester: { name: 'Samy', email: 'samy@example.invalid', phone: '', org: '' },
      memberUid: 'u_samy', memberName: 'Samy', createdAt: 'x', ...o };
  };
  /* Confirmed: the booking and its quarter-hours marked on the day, in one
     batch. `before` is the day as the page read it. */
  const book = (dbx, key, b, before, extra) => {
    const x = writeBatch(dbx);
    x.set(doc(dbx, 'bookings', key), b);
    if (!(extra && extra.noDay)) {
      const sl = (before || Array(96).fill(0)).slice();
      for (let i = b.slotFrom; i < b.slotTo; i++) sl[i] = 1;
      if (extra && extra.alsoFree) for (let i = 76; i < 80; i++) sl[i] = 0;
      x.set(doc(dbx, 'roomDays', b.roomId + '_' + b.day), { slots: sl, lastBooking: key, roomId: b.roomId, day: b.day, siteId: b.siteId });
    }
    return x.commit();
  };
  const wedBefore = () => { const w = Array(96).fill(0); for (let i = 76; i < 80; i++) w[i] = 1; return w; };
  const K = (n) => ('bk_' + n).padEnd(31, '0');
  /* The day exactly as it is now, so a refusal is about the overlap and
     not about an out-of-date copy. */
  const now = async (id) => { let sl; await env.withSecurityRulesDisabled(async (c) => { sl = (await getDoc(doc(c.firestore(), 'roomDays', id))).data().slots; }); return sl; };

  await check('a member books a free time, confirmed straight away', 'allow', () => book(as('samy'), K('band_1800'), B('2026-11-18', 1080, 1140), wedBefore()));
  await check('not over a confirmed booking', 'deny', async () => book(as('samy'), K('band_over'), B('2026-11-18', 1170, 1230), await now('room_band_2026-11-18')));
  await check('not with a setup time that runs into one', 'deny', async () => book(as('samy'), K('band_setup'), B('2026-11-18', 1200, 1260, { setupMins: 15 }), await now('room_band_2026-11-18')));
  await check('right after one, with no buffer, is fine', 'allow', () => book(as('samy'), K('band_2000'), B('2026-11-18', 1200, 1260), (() => { const w = wedBefore(); for (let i = 72; i < 76; i++) w[i] = 1; return w; })()));
  await check('not over a Sunday service on the rota', 'deny', () => book(as('samy'), K('band_sun10'), B('2026-11-22', 600, 660)));
  await check('a Sunday afternoon, after the service, is fine', 'allow', () => {
    const sun = Array(96).fill(0); for (let i = 32; i < 50; i++) sun[i] = 1;
    return book(as('samy'), K('band_sun14'), B('2026-11-22', 840, 900), sun);
  });
  await check('a booking cannot say it is confirmed without taking its time', 'deny', () => book(as('samy'), K('band_noday'), B('2026-11-23', 600, 660), null, { noDay: true }));
  await check('a day cannot be marked with no booking', 'deny', () => setDoc(doc(as('samy'), 'roomDays', 'room_band_2026-11-24'),
    { slots: Array(96).fill(1), lastBooking: K('ghost'), roomId: 'room_band', day: '2026-11-24', siteId: 'site_bk' }));
  await check('marking a day cannot free someone else\u2019s time', 'deny', () => book(as('samy'), K('band_free'), B('2026-11-18', 600, 660),
    (() => { const w = Array(96).fill(0); for (let i = 72; i < 76; i++) w[i] = 1; for (let i = 80; i < 84; i++) w[i] = 1; for (let i = 76; i < 80; i++) w[i] = 1; return w; })(), { alsoFree: true }));
  await check('the times have to add up: a booking cannot claim fewer quarter-hours', 'deny', () => book(as('samy'), K('band_lie'),
    { ...B('2026-11-19', 600, 720), slotTo: 41 }));
  await check('two people, the same time, the same moment: the second is refused', 'deny', () =>
    book(as('isla'), K('band_race'), { ...B('2026-11-18', 1080, 1140), memberUid: 'u_isla' }, wedBefore()));

  /* "Wait for approval" on the room, and as a site's default. */
  await check('a room set to "wait for approval": a member cannot confirm their own booking', 'deny', () => book(as('samy'), K('hold_conf'), { ...B('2026-11-18', 600, 660), roomId: 'room_hold' }));
  await check('they ask instead, and it waits', 'allow', () => setDoc(doc(as('samy'), 'bookings', K('hold_req')), { ...B('2026-11-18', 600, 660), roomId: 'room_hold', status: 'requested' }));
  await check('a site whose default is "wait for approval": the same', 'deny', () => book(as('samy'), K('apsite_conf'), { ...B('2026-11-18', 600, 660), roomId: 'room_apsite', siteId: 'site_appr' }));
  await check('and asking is allowed there', 'allow', () => setDoc(doc(as('samy'), 'bookings', K('apsite_req')), { ...B('2026-11-18', 600, 660), roomId: 'room_apsite', siteId: 'site_appr', status: 'requested' }));
  await check('even asking is refused over a confirmed booking', 'deny', () => setDoc(doc(as('samy'), 'bookings', K('band_req_over')), { ...B('2026-11-18', 1140, 1200), status: 'requested' }));

  /* The public: always waits. */
  const H = (extra) => ({ ...B('2026-11-26', 600, 720), kind: 'hire', status: 'requested', memberUid: '', memberName: '', people: 20,
    requester: { name: 'Hirer Synthetic', email: 'hirer@example.invalid', phone: '', org: 'Invented Club' }, ...(extra || {}) });
  await check('the public asks for a free time, and it waits', 'allow', () => setDoc(doc(anon(), 'bookings', K('pub_req')), H()));
  await check('the public cannot confirm their own booking', 'deny', () => book(anon(), K('pub_conf'), H({ status: 'confirmed' })));
  await check('the public cannot ask over a Sunday service', 'deny', () => setDoc(doc(anon(), 'bookings', K('pub_sun')), H({ day: '2026-11-22' })));
  await check('the public cannot ask for a room not open to them', 'deny', () => setDoc(doc(anon(), 'bookings', K('pub_hold')), H({ roomId: 'room_hold' })));
  await check('the public must give a real email address', 'deny', () => setDoc(doc(anon(), 'bookings', K('pub_email')), H({ requester: { name: 'X', email: 'nope', phone: '', org: '' } })));
  await check('never more people than the fire-safety maximum', 'deny', () => setDoc(doc(anon(), 'bookings', K('pub_fire')), H({ people: 31 })));

  /* Who sees and changes bookings. */
  await check('the public cannot list bookings', 'deny', () => getDocs(collection(anon(), 'bookings')));
  await check('a member lists their own', 'allow', () => getDocs(query(collection(as('samy'), 'bookings'), where('memberUid', '==', 'u_samy'))));
  await check('but not anyone else\u2019s', 'deny', () => getDocs(query(collection(as('samy'), 'bookings'), where('memberUid', '==', 'u_martin'))));
  await check('anyone reads which quarter-hours are taken, never by whom', 'allow', () => getDoc(doc(anon(), 'roomDays', 'room_band_2026-11-18')));
  await check('the site\u2019s bookings admin, not an admin, lists the site\u2019s bookings', 'allow', () => getDocs(query(collection(lena(), 'bookings'), where('siteId', '==', 'site_bk'))));
  await check('and approves one', 'allow', () => updateDoc(doc(lena(), 'bookings', 'bk_requested_00000000000000000'), { status: 'confirmed', decidedBy: 'u_lena' }));
  await check('but not at a site they do not look after', 'deny', () => updateDoc(doc(lena(), 'bookings', 'bk_careful_000000000000000000'), { status: 'confirmed' }));
  await check('a member cannot approve their own booking', 'deny', () => updateDoc(doc(as('samy'), 'bookings', 'bk_careful_000000000000000000'), { status: 'confirmed' }));
  await check('an admin moves or cancels any booking', 'allow', () => updateDoc(doc(as('karen'), 'bookings', 'bk_careful_000000000000000000'), { status: 'cancelled' }));
  await check('the office may book over something, with a reason', 'allow', () => setDoc(doc(lena(), 'roomDays', 'room_band_2026-11-18'),
    { slots: Array(96).fill(2), lastBooking: '', roomId: 'room_band', day: '2026-11-18', siteId: 'site_bk' }));
  await check('a booking is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'bookings', 'bk_existing_000000000000000000')));
}

// ── EVENTS (events window) ── room bookings, R3: repeating, members cancelling their own
{
  const Z = () => Array(96).fill(0);
  const held = (n) => { const a = Z(); for (let i = 40; i < 44; i++) a[i] = n; return a; };
  const day = (id) => ({ roomId: 'room_band', day: id.slice(-10), siteId: 'site_bk' });
  const stamp = { status: 'cancelled', cancelledAt: 'x', cancelledBy: 'u_samy' };
  /* Cancel, giving the time back: the booking and its day in one write. */
  const cancel = (who, key, dayId, slots, lastBooking, extra) => {
    const x = writeBatch(who);
    x.update(doc(who, 'bookings', key), { ...stamp, ...(extra || {}) });
    if (slots) x.set(doc(who, 'roomDays', dayId), { slots, lastBooking, ...day(dayId), lastCancel: key });
    return x.commit();
  };
  /* 2 Dec once Samy's 10:00 is given back: the 14:00 booking is still there. */
  const after2 = () => Z().map((v, i) => i >= 56 && i < 60 ? 1 : v);
  const SC = 'bk_samy_conf_00000000000000000', SO = 'bk_samy_over_00000000000000000', SR = 'bk_samy_req_000000000000000000', MC = 'bk_mart_conf_00000000000000000';

  await check('a member cannot cancel a confirmed booking without giving its time back', 'deny',
    () => updateDoc(doc(as('samy'), 'bookings', SC), stamp));
  await check('nor give the time back without cancelling', 'deny',
    () => setDoc(doc(as('samy'), 'roomDays', 'room_band_2026-12-02'), { slots: Z(), lastBooking: SC, ...day('room_band_2026-12-02'), lastCancel: SC }));
  await check('nor free more than its own quarter-hours', 'deny', () => {
    return cancel(as('samy'), SC, 'room_band_2026-12-02', Z(), SC); });
  await check('nor change anything else about it while cancelling (moving it)', 'deny',
    () => cancel(as('samy'), SC, 'room_band_2026-12-02', after2(), SC, { day: '2026-12-03' }));
  await check('a member cancels their own confirmed booking, giving its time back', 'allow',
    () => cancel(as('samy'), SC, 'room_band_2026-12-02', after2(), SC));
  await check('and cannot then bring it back', 'deny',
    () => updateDoc(doc(as('samy'), 'bookings', SC), { status: 'confirmed' }));
  await check('not one the office booked over (2 on the day): the office cancels that', 'deny',
    () => cancel(as('samy'), SO, 'room_band_2026-12-09', held(1), ''));
  await check('nor by setting it to nothing', 'deny',
    () => cancel(as('samy'), SO, 'room_band_2026-12-09', Z(), ''));
  await check('a waiting booking is cancelled on its own (it holds no time)', 'allow',
    () => updateDoc(doc(as('samy'), 'bookings', SR), stamp));
  await check('nobody cancels someone else\u2019s booking', 'deny',
    () => cancel(as('samy'), MC, 'room_band_2026-12-23', Z(), MC));

  /* A repeating booking: every date its own booking, with the series. */
  const S = (extra) => ({ kind: 'member', status: 'requested', siteId: 'site_bk', roomId: 'room_band', groupId: '', day: '2026-12-30', startMin: 600, endMin: 660,
    startLocal: 'x', endLocal: 'x', setupMins: 0, packdownMins: 0, slotFrom: 40, slotTo: 44, title: 'Test weekly', people: 4, layout: '',
    av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '', requester: { name: 'Samy', email: 'samy@example.invalid', phone: '', org: '' },
    memberUid: 'u_samy', memberName: 'Samy', createdAt: 'x', series: { id: 's_test', rule: 'week', n: 1, of: 3 }, ...(extra || {}) });
  await check('a date of a weekly series is a booking like any other', 'allow', () => setDoc(doc(as('samy'), 'bookings', 'bk_series_1_0000000000000000000'), S()));
  await check('a series says which date of how many, and never "4 of 3"', 'deny', () => setDoc(doc(as('samy'), 'bookings', 'bk_series_2_0000000000000000000'), S({ series: { id: 's_test', rule: 'week', n: 4, of: 3 } })));
  await check('only weekly, fortnightly or monthly', 'deny', () => setDoc(doc(as('samy'), 'bookings', 'bk_series_3_0000000000000000000'), S({ series: { id: 's_test', rule: 'daily', n: 1, of: 3 } })));
  await check('never more than 52 dates', 'deny', () => setDoc(doc(as('samy'), 'bookings', 'bk_series_4_0000000000000000000'), S({ series: { id: 's_test', rule: 'week', n: 1, of: 53 } })));
}

// ── EVENTS (events window) ── an event in a room books it (F-072a)
{
  const lena = () => env.authenticatedContext('u_lena').firestore();
  const Z = () => Array(96).fill(0);
  /* An event's booking, 19:00-21:00 on a January Wednesday (76 to 83). */
  const EV = (day, extra) => ({ kind: 'event', status: 'confirmed', siteId: 'site_bk', roomId: 'room_band', groupId: '', day, startMin: 1140, endMin: 1260,
    startLocal: 'x', endLocal: 'x', setupMins: 0, packdownMins: 0, slotFrom: 76, slotTo: 84, title: 'Test harvest supper', people: 20, layout: '',
    av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '', requester: { name: 'Lena', email: 'lena@example.invalid', phone: '', org: '' },
    memberUid: '', memberName: '', createdAt: 'x', calEventId: 'cev_test', ...(extra || {}) });
  const held = (sl, n) => { const a = (sl || Z()).slice(); for (let i = 76; i < 84; i++) a[i] = (a[i] || 0) + (n || 1); return a; };
  const put = (who, key, b, day) => { const x = writeBatch(who); x.set(doc(who, 'bookings', key), b); if (day) x.set(doc(who, 'roomDays', 'room_band_' + b.day), { slots: day, lastBooking: '', roomId: 'room_band', day: b.day, siteId: 'site_bk' }); return x.commit(); };
  const K = (n) => ('bk_ev_' + n).padEnd(31, '0');

  await check('the office books a free room for an event, holding its time', 'allow', () => put(lena(), K('a'), EV('2027-01-06'), held()));
  await check('but not without holding the time on the room\u2019s day', 'deny', () => put(lena(), K('b'), EV('2027-01-13')));
  await check('nor over something already there, without saying so', 'deny', () => put(lena(), K('c'), EV('2027-01-06'), held(held())));
  await check('nor saying "booked over" with no reason', 'deny', () => put(lena(), K('d'), EV('2027-01-06', { override: true, decisionNote: '' }), held(held())));
  await check('with a reason, the office books over it (both are counted)', 'allow', () => put(lena(), K('e'), EV('2027-01-06', { override: true, decisionNote: 'Test: agreed with the choir' }), held(held())));
  await check('a member cannot book for an event', 'deny', () => put(as('samy'), K('f'), EV('2027-01-20', { memberUid: 'u_samy' }), held()));
  await check('nor can the public', 'deny', () => put(anon(), K('g'), EV('2027-01-20'), held()));
  await check('a bookings admin cannot book at a site they do not look after', 'deny', () => put(lena(), K('h'), EV('2027-01-20', { siteId: 'site_appr', roomId: 'room_apsite' })));
}

// ── EVENTS (events window) ── hire prices and charges (Chunk 5, stage 1)
{
  const lena = () => env.authenticatedContext('u_lena').firestore();
  await check('anyone reads the booking types and prices (the instant quote needs them)', 'allow', () => getDoc(doc(anon(), 'rateCards', 'room_band__type_hire')));
  await check('an admin sets a booking type', 'allow', () => setDoc(doc(as('karen'), 'bookingTypes', 'type_hire'), { name: 'Private hire', forPublic: true, charged: true, active: true, order: 1 }));
  await check('a member cannot', 'deny', () => setDoc(doc(as('samy'), 'bookingTypes', 'type_x'), { name: 'Free for me', forPublic: true, charged: false }));
  await check('an admin sets a room\u2019s prices for a type, in pence', 'allow', () => setDoc(doc(as('karen'), 'rateCards', 'room_band__type_hire'), { roomId: 'room_band', typeId: 'type_hire', siteId: 'site_bk', hourly: 2000, vat: false }));
  await check('filed under the right room and type, or not at all', 'deny', () => setDoc(doc(as('karen'), 'rateCards', 'room_band__type_hire'), { roomId: 'room_hold', typeId: 'type_hire', siteId: 'site_bk', hourly: 2000 }));
  await check('not in pounds and pence (a fraction is refused)', 'deny', () => setDoc(doc(as('karen'), 'rateCards', 'room_band__type_hire'), { roomId: 'room_band', typeId: 'type_hire', siteId: 'site_bk', hourly: 20.5 }));
  await check('a bookings admin cannot change prices', 'deny', () => setDoc(doc(lena(), 'rateCards', 'room_band__type_hire'), { roomId: 'room_band', typeId: 'type_hire', siteId: 'site_bk', hourly: 1 }));
  const CH = (extra) => ({ bookingKey: 'bk_requested_00000000000000000', seriesId: '', siteId: 'site_bk', roomId: 'room_band', kind: 'hire',
    payer: { name: 'Hirer', email: 'h@example.invalid', org: '' }, lines: [{ code: 'hire', label: 'Room hire', amount: 4000 }],
    subtotal: 4000, vat: 0, vatRate: 0, total: 4000, deposit: 0, damageDeposit: 0, status: 'unpaid', payments: [], dueDate: '2026-11-25', createdAt: 'x', createdBy: 'u_lena', adjusted: false, ...(extra || {}) });
  await check('the site\u2019s bookings admin records what a hirer owes', 'allow', () => setDoc(doc(lena(), 'charges', 'ch_test_1'), CH()));
  await check('the total must be the lines\u2019 sum plus VAT', 'deny', () => setDoc(doc(lena(), 'charges', 'ch_test_2'), CH({ total: 3999 })));
  await check('only for a booking that exists, at the same site', 'deny', () => setDoc(doc(lena(), 'charges', 'ch_test_3'), CH({ bookingKey: 'bk_nothing_here_0000000000000' })));
  await check('a member cannot see what a hirer owes', 'deny', () => getDoc(doc(as('samy'), 'charges', 'ch_test_1')));
  await check('nor can the public', 'deny', () => getDoc(doc(anon(), 'charges', 'ch_test_1')));
  await check('a charge is never deleted', 'deny', () => deleteDoc(doc(as('karen'), 'charges', 'ch_test_1')));
  await check('a hire request carries its type, the charity tick and the quote it showed', 'allow', () => setDoc(doc(anon(), 'bookings', 'bk_c5_quote_000000000000000000'), {
    kind: 'hire', status: 'requested', siteId: 'site_bk', roomId: 'room_band', groupId: '', day: '2026-11-26', startMin: 840, endMin: 960, startLocal: 'x', endLocal: 'x',
    setupMins: 0, packdownMins: 0, slotFrom: 56, slotTo: 64, title: 'Test party', people: 20, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false },
    resources: [], notes: '', requester: { name: 'Hirer', email: 'h@example.invalid', phone: '', org: '' }, memberUid: '', memberName: '', createdAt: 'x',
    bookingType: 'type_hire', charity: true, quote: { lines: [{ code: 'hire', label: 'Room hire', amount: 4000 }], total: 4000 } }));
}

// ── EVENTS (events window) ── members' rate (Martin, F-077)
{
  const H = (extra) => ({ kind: 'hire', status: 'requested', siteId: 'site_bk', roomId: 'room_band', groupId: '', day: '2026-12-03', startMin: 840, endMin: 960, startLocal: 'x', endLocal: 'x',
    setupMins: 0, packdownMins: 0, slotFrom: 56, slotTo: 64, title: 'Test party', people: 20, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false },
    resources: [], notes: '', requester: { name: 'Hirer', email: 'h@example.invalid', phone: '', org: '' }, memberUid: '', memberName: '', createdAt: 'x', bookingType: 'type_hire', ...(extra || {}) });
  await check('an admin gives a kind of booking a members\u2019 rate, 25% off', 'allow', () => setDoc(doc(as('karen'), 'bookingTypes', 'type_hire'), { name: 'Private hire', forPublic: true, charged: true, active: true, order: 1, membersRate: { mode: 'percent', pct: 25 } }));
  await check('never more than 100% off', 'deny', () => setDoc(doc(as('karen'), 'bookingTypes', 'type_hire'), { name: 'Private hire', forPublic: true, charged: true, membersRate: { mode: 'percent', pct: 120 } }));
  await check('or a members\u2019 price list of its own, filed apart', 'allow', () => setDoc(doc(as('karen'), 'rateCards', 'room_band__type_hire__members'), { roomId: 'room_band', typeId: 'type_hire', siteId: 'site_bk', forMembers: true, hourly: 1000, vat: false }));
  await check('VAT at the rate set next to the tick, a whole number', 'allow', () => setDoc(doc(as('karen'), 'rateCards', 'room_band__type_hire'), { roomId: 'room_band', typeId: 'type_hire', siteId: 'site_bk', hourly: 2000, vat: true, vatRate: 5 }));
  await check('not a fraction', 'deny', () => setDoc(doc(as('karen'), 'rateCards', 'room_band__type_hire'), { roomId: 'room_band', typeId: 'type_hire', siteId: 'site_bk', hourly: 2000, vat: true, vatRate: 17.5 }));
  await check('a public request can never claim the members\u2019 rate', 'deny', () => setDoc(doc(anon(), 'bookings', 'bk_mr_public_00000000000000000'), H({ memberRate: true })));
  await check('without the claim, the same request is fine', 'allow', () => setDoc(doc(anon(), 'bookings', 'bk_mr_public_ok_00000000000000'), H()));
  await check('nor can it pretend to be a member\u2019s booking', 'deny', () => setDoc(doc(anon(), 'bookings', 'bk_mr_public_m_000000000000000'), H({ kind: 'member', memberRate: true })));
  const M = (extra) => H({ kind: 'member', memberUid: 'u_samy', memberName: 'Samy', memberRate: true, ...(extra || {}) });
  await check('a member asks for a charged kind at the members\u2019 rate: it waits', 'allow', () => setDoc(doc(as('samy'), 'bookings', 'bk_mr_member_00000000000000000'), M()));
  await check('a member cannot confirm a charged kind themselves', 'deny', () => {
    const sa = as('samy'), x = writeBatch(sa), b = M({ status: 'confirmed', day: '2026-12-10' });
    x.set(doc(sa, 'bookings', 'bk_mr_member_c_00000000000000'), b);
    x.set(doc(sa, 'roomDays', 'room_band_2026-12-10'), { slots: Array(96).fill(0).map((v, i) => i >= 56 && i < 64 ? 1 : 0), lastBooking: 'bk_mr_member_c_00000000000000', roomId: 'room_band', day: '2026-12-10', siteId: 'site_bk' });
    return x.commit();
  });
}

// ── EVENTS (events window) ── terms, and the hirer accepting online (Chunk 5, stage 2)
{
  await check('an admin saves the terms for a kind of booking, as version 1', 'allow',
    () => setDoc(doc(as('karen'), 'terms', 'type_hire_v1'), { typeId: 'type_hire', version: 1, text: 'Test terms: leave the hall tidy.', at: 'x', by: 'u_karen' }));
  await check('filed under its own number, or not at all', 'deny',
    () => setDoc(doc(as('karen'), 'terms', 'type_hire_v2'), { typeId: 'type_hire', version: 1, text: 'x', at: 'x', by: 'u_karen' }));
  await check('a version is never changed after it is saved', 'deny',
    () => setDoc(doc(as('karen'), 'terms', 'type_hire_v1'), { typeId: 'type_hire', version: 1, text: 'Changed after the event', at: 'x', by: 'u_karen' }));
  await check('nor deleted', 'deny', () => deleteDoc(doc(as('karen'), 'terms', 'type_hire_v1')));
  await check('a member cannot write terms', 'deny',
    () => setDoc(doc(as('samy'), 'terms', 'type_hire_v9'), { typeId: 'type_hire', version: 9, text: 'Mine', at: 'x', by: 'u_samy' }));
  await check('anyone can read them', 'allow', () => getDoc(doc(anon(), 'terms', 'type_hire_v1')));
  await check('the kind points at its current version', 'allow',
    () => setDoc(doc(as('karen'), 'bookingTypes', 'type_hire'), { name: 'Private hire', forPublic: true, charged: true, active: true, order: 1, membersRate: { mode: 'percent', pct: 25 }, termsVersion: 1 }));

  const base = { kind: 'hire', siteId: 'site_bk', roomId: 'room_band', groupId: '', day: '2026-12-17', startMin: 840, endMin: 960, startLocal: 'x', endLocal: 'x',
    setupMins: 0, packdownMins: 0, slotFrom: 56, slotTo: 64, title: 'Test party', people: 20, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false },
    resources: [], notes: '', requester: { name: 'Hirer', email: 'h@example.invalid', phone: '', org: '' }, memberUid: '', memberName: '', createdAt: 'x',
    bookingType: 'type_hire', quote: { lines: [{ code: 'hire', label: 'Room hire', amount: 5000 }], total: 5000 } };
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'bookings', 'bk_s2_conf_0000000000000000000'), { ...base, status: 'confirmed' });
    await setDoc(doc(c.firestore(), 'bookings', 'bk_s2_req_00000000000000000000'), { ...base, status: 'requested' });
  });
  const A = (extra) => ({ accepted: { name: 'Hirer Synthetic', at: serverTimestamp(), termsId: 'type_hire_v1', termsVersion: 1, total: 5000, ...(extra || {}) } });
  const C = 'bk_s2_conf_0000000000000000000';
  await check('the hirer cannot accept with the time their own computer says', 'deny', () => updateDoc(doc(anon(), 'bookings', C), A({ at: '2026-01-01T00:00' })));
  await check('nor a different total from the price confirmed', 'deny', () => updateDoc(doc(anon(), 'bookings', C), A({ total: 1 })));
  await check('nor terms that are not the current version', 'deny', () => updateDoc(doc(anon(), 'bookings', C), A({ termsId: 'type_hire_v0', termsVersion: 0 })));
  await check('nor with no name', 'deny', () => updateDoc(doc(anon(), 'bookings', C), A({ name: '' })));
  await check('nor change anything else while accepting', 'deny', () => updateDoc(doc(anon(), 'bookings', C), { ...A(), title: 'Free party' }));
  await check('nor accept a booking that is still waiting', 'deny', () => updateDoc(doc(anon(), 'bookings', 'bk_s2_req_00000000000000000000'), A()));
  await check('with the link, the hirer accepts the quote and the terms, timed by the server', 'allow', () => updateDoc(doc(anon(), 'bookings', C), A()));
  await check('once only', 'deny', () => updateDoc(doc(anon(), 'bookings', C), A({ name: 'Someone else' })));
  await check('the office records a payment on the booking', 'allow',
    () => updateDoc(doc(env.authenticatedContext('u_lena').firestore(), 'bookings', C), { payment: { status: 'part-paid', paid: 2000, total: 5000 } }));
  await check('the hirer cannot', 'deny', () => updateDoc(doc(anon(), 'bookings', C), { payment: { status: 'paid', paid: 5000, total: 5000 } }));
}

// ── EVENTS (events window) ── invoices, hirers, accounts, asking to cancel (Chunk 5, stage 3)
{
  const lena = () => env.authenticatedContext('u_lena').firestore();
  const INV = (seq, extra) => ({ seq, number: 'INV-' + String(seq).padStart(5, '0'), siteId: 'site_bk', chargeIds: ['ch_test_1'], payer: { name: 'Hirer', email: 'h@example.invalid' },
    lines: [{ label: 'Room hire', amount: 4000 }], subtotal: 4000, vat: 0, total: 4000, issuedAt: 'x', dueDate: 'x', status: 'unpaid', ...(extra || {}) });
  const issue = (who, seq, next, extra) => { const x = writeBatch(who); x.set(doc(who, 'invoices', 'inv_' + seq), INV(seq, extra)); if (next) x.set(doc(who, 'counters', 'invoices'), { next }); return x.commit(); };
  await check('the office issues invoice number 1, moving the counter to 2', 'allow', () => issue(lena(), 1, 2));
  await check('number 1 is never issued twice', 'deny', () => issue(lena(), 1, 2));
  await check('nor is a number skipped (3 before 2)', 'deny', () => issue(lena(), 3, 4));
  await check('nor an invoice without moving the counter', 'deny', () => issue(lena(), 2, 0));
  await check('nor the counter moved with no invoice', 'deny', () => setDoc(doc(lena(), 'counters', 'invoices'), { next: 3 }));
  await check('number 2 next, in order', 'allow', () => issue(lena(), 2, 3));
  await check('the total must be its lines plus VAT', 'deny', () => issue(lena(), 3, 4, { total: 1 }));
  await check('a member cannot issue an invoice', 'deny', () => issue(as('samy'), 3, 4));
  await check('an invoice\u2019s status changes when it is paid', 'allow', () => updateDoc(doc(lena(), 'invoices', 'inv_1'), { status: 'paid', paidAt: 'x' }));
  await check('but never its amounts', 'deny', () => updateDoc(doc(lena(), 'invoices', 'inv_1'), { total: 1, subtotal: 1 }));
  await check('nor is it deleted', 'deny', () => deleteDoc(doc(as('karen'), 'invoices', 'inv_1')));
  await check('a member cannot read invoices', 'deny', () => getDoc(doc(as('samy'), 'invoices', 'inv_1')));

  const HR = (extra) => ({ siteId: 'site_bk', name: 'Hirer Synthetic', org: 'Invented Club', email: 'h@example.invalid', phone: '', address: '', charity: true, charityNumber: '000000',
    charityChecked: true, regular: true, monthly: true, notes: '', documents: [{ kind: 'insurance', name: 'Test.pdf', path: 'x', expires: '2027-01-01' }], ...(extra || {}) });
  await check('the site\u2019s bookings admin keeps a hirer\u2019s record', 'allow', () => setDoc(doc(lena(), 'hirers', 'hr_1'), HR()));
  await check('not for a site they do not look after', 'deny', () => setDoc(doc(lena(), 'hirers', 'hr_2'), HR({ siteId: 'site_appr' })));
  await check('a member cannot read hirers\u2019 records', 'deny', () => getDoc(doc(as('samy'), 'hirers', 'hr_1')));
  await check('nor can the public', 'deny', () => getDoc(doc(anon(), 'hirers', 'hr_1')));

  await check('an admin sets the accounts mode', 'allow', () => setDoc(doc(as('karen'), 'settings', 'accounts'), { mode: 'calla', invoiceNumbersBy: 'hub' }));
  await check('only "none" or "calla"', 'deny', () => setDoc(doc(as('karen'), 'settings', 'accounts'), { mode: 'sage' }));
  await check('a bookings admin cannot change it', 'deny', () => setDoc(doc(lena(), 'settings', 'accounts'), { mode: 'none' }));
  await check('the office queues an invoice for Calla Accounts', 'allow', () => setDoc(doc(lena(), 'accountsQueue', 'q_1'), { kind: 'invoice', refId: 'inv_1', siteId: 'site_bk', status: 'waiting', tries: 0, at: 'x' }));
  await check('a member cannot', 'deny', () => setDoc(doc(as('samy'), 'accountsQueue', 'q_2'), { kind: 'invoice', refId: 'inv_1', siteId: 'site_bk', status: 'waiting' }));

  await check('the damage deposit is tracked on the charge', 'allow', () => updateDoc(doc(lena(), 'charges', 'ch_test_1'), { damage: { status: 'held', amount: 10000, method: 'Card', takenOn: '2026-11-01' } }));
  await check('as held, returned or kept, nothing else', 'deny', () => updateDoc(doc(lena(), 'charges', 'ch_test_1'), { damage: { status: 'lost', amount: 10000 } }));

  const C = 'bk_s2_conf_0000000000000000000';
  const ask = (extra) => ({ cancelRequest: { status: 'asked', at: serverTimestamp(), reason: 'Test: the party is off', ...(extra || {}) } });
  await check('the hirer cannot ask to cancel with their own clock', 'deny', () => updateDoc(doc(anon(), 'bookings', C), ask({ at: '2026-01-01' })));
  await check('nor cancel it outright', 'deny', () => updateDoc(doc(anon(), 'bookings', C), { ...ask(), status: 'cancelled' }));
  await check('with the link, the hirer asks to cancel, with a reason', 'allow', () => updateDoc(doc(anon(), 'bookings', C), ask()));
  await check('not again while the office has not answered', 'deny', () => updateDoc(doc(anon(), 'bookings', C), ask({ reason: 'Again' })));
  await check('the office answers it', 'allow', () => updateDoc(doc(lena(), 'bookings', C), { cancelRequest: { status: 'declined', at: 'x', reason: 'Test', answer: 'Kept: inside the notice period' } }));
  await check('after an answer, the hirer may ask again', 'allow', () => updateDoc(doc(anon(), 'bookings', C), ask({ reason: 'Asking again' })));
}

// ── EVENTS (events window) ── Sunday kids: need to know (Chunk 6, stage 1; Martin, F-087)
{
  /* People for these checks: Kim is an admin of Kids Church (a lead); Lou
     leads Little ones; Jo leads Juniors; Sid is on Kids Church, leading no
     group; Wes is an admin of Worship only. Lena is the safeguarding lead of
     site_bk in these tests? No - set here. */
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const U = (uid, mid, teams, adminFor) => setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor, masterAdmin: false });
    await U('u_kim', 'm_kim', ['Kids Church'], ['Kids Church']);
    await U('u_lou', 'm_lou', ['Kids Church'], []);
    await U('u_jo', 'm_jo', ['Kids Church'], []);
    await U('u_sid', 'm_sid', ['Kids Church'], []);
    await U('u_wes', 'm_wes', ['Worship Team'], ['Worship Team']);
    await U('u_sg', 'm_sg', ['Kids Church'], []);
    await setDoc(doc(db, 'bookingSettings', 'site_kids'), { bookingsAdmins: [], safeguardingLead: 'm_sg', safeguardingDeputy: '' });
    await setDoc(doc(db, 'kidsSettings', 'site_kids'), { teams: ['Kids Church'], formId: 'form_kids' });
    await setDoc(doc(db, 'forms', 'form_kids'), { title: 'Children\u2019s registration', siteId: 'site_kids', fields: [], template: 'parent', kind: 'consent', version: 1 });
    await setDoc(doc(db, 'forms', 'form_other'), { title: 'Something else', siteId: 'site_kids', fields: [], version: 1 });
    await setDoc(doc(db, 'kidsGroups', 'grp_little'), { siteId: 'site_kids', name: 'Little ones', ratio: 4, leaderIds: ['m_lou'] });
    await setDoc(doc(db, 'kidsGroups', 'grp_junior'), { siteId: 'site_kids', name: 'Juniors', ratio: 8, leaderIds: ['m_jo'] });
  });
  const FAM = { siteId: 'site_kids', parentName: 'Parent Synthetic', phone: '07700 900111', email: 'parent@example.invalid', collectors: ['Parent Synthetic'], familyCode: 'ABC123', responseIds: ['r1'] };
  const KID = (name, groupId, extra) => ({ siteId: 'site_kids', familyId: 'fam_1', name, dob: '2019-05-01', year: 'Year 1', groupId, status: 'registered', phone: '07700 900111', ...(extra || {}) });
  const MED = (groupId, allergies) => ({ siteId: 'site_kids', groupId, allergies, medical: 'none', medication: '', needs: '', responseId: 'r1' });
  /* A lead writes a child and its medical copy together. */
  const put = (who, id, kid, med) => { const x = writeBatch(who); x.set(doc(who, 'kidsChildren', id), kid); if (med) x.set(doc(who, 'kidsMedical', id), med); return x.commit(); };
  await check('a lead (an admin of Kids Church) adds a family', 'allow', () => setDoc(doc(ctx('u_kim'), 'kidsFamilies', 'fam_1'), FAM));
  await check('and Ada, in Little ones, with her medical copy', 'allow', () => put(ctx('u_kim'), 'kid_ada', KID('Ada Synthetic', 'grp_little'), MED('grp_little', 'Peanuts')));
  await check('and Ben, her brother, in Juniors', 'allow', () => put(ctx('u_kim'), 'kid_ben', KID('Ben Synthetic', 'grp_junior'), MED('grp_junior', 'Bee stings')));
  await check('a medical copy must carry the child\u2019s own group', 'deny', () => setDoc(doc(ctx('u_kim'), 'kidsMedical', 'kid_ada'), MED('grp_junior', 'Peanuts')));
  await check('a child cannot carry a pointer to the family\u2019s whole form', 'deny', () => put(ctx('u_kim'), 'kid_ada', KID('Ada Synthetic', 'grp_little', { medicalRef: { secret: 'x', index: 0 } }), MED('grp_little', 'Peanuts')));

  await check('the leader of Little ones reads Ada', 'allow', () => getDoc(doc(ctx('u_lou'), 'kidsChildren', 'kid_ada')));
  await check('and Ada\u2019s medical details', 'allow', () => getDoc(doc(ctx('u_lou'), 'kidsMedical', 'kid_ada')));
  await check('and lists Little ones', 'allow', () => getDocs(query(collection(ctx('u_lou'), 'kidsChildren'), where('groupId', '==', 'grp_little'))));
  await check('THE LEADER OF LITTLE ONES CANNOT READ A JUNIOR\u2019S MEDICAL DETAILS', 'deny', () => getDoc(doc(ctx('u_lou'), 'kidsMedical', 'kid_ben')));
  await check('nor Ben himself', 'deny', () => getDoc(doc(ctx('u_lou'), 'kidsChildren', 'kid_ben')));
  await check('nor list Juniors', 'deny', () => getDocs(query(collection(ctx('u_lou'), 'kidsChildren'), where('groupId', '==', 'grp_junior'))));
  await check('nor the family record, which points at the forms', 'deny', () => getDoc(doc(ctx('u_lou'), 'kidsFamilies', 'fam_1')));
  await check('nor list the registration forms\u2019 private halves', 'deny', () => getDocs(query(collection(ctx('u_lou'), 'sensitiveResponses'), where('siteId', '==', 'site_kids'), where('formId', '==', 'form_kids'))));
  await check('the leader of Juniors reads Ben\u2019s medical details, not Ada\u2019s', 'allow', () => getDoc(doc(ctx('u_jo'), 'kidsMedical', 'kid_ben')));
  await check('(and not Ada\u2019s)', 'deny', () => getDoc(doc(ctx('u_jo'), 'kidsMedical', 'kid_ada')));
  await check('a group leader cannot move a child or change their record', 'deny', () => put(ctx('u_lou'), 'kid_ada', KID('Ada Synthetic', 'grp_junior'), MED('grp_junior', 'Peanuts')));
  await check('someone on Kids Church who leads no group sees no child', 'deny', () => getDoc(doc(ctx('u_sid'), 'kidsChildren', 'kid_ada')));
  await check('an admin of another team (Worship) sees no child', 'deny', () => getDoc(doc(ctx('u_wes'), 'kidsMedical', 'kid_ada')));
  await check('the safeguarding lead sees every child\u2019s medical details', 'allow', () => getDoc(doc(ctx('u_sg'), 'kidsMedical', 'kid_ben')));
  await check('a master admin does too', 'allow', () => getDoc(doc(as('martin'), 'kidsMedical', 'kid_ada')));
  await check('the lead moves Ben to Little ones, with his medical copy', 'allow', () => put(ctx('u_kim'), 'kid_ben', KID('Ben Synthetic', 'grp_little'), MED('grp_little', 'Bee stings')));
  await check('but not without moving the medical copy too', 'deny', () => put(ctx('u_kim'), 'kid_ben', KID('Ben Synthetic', 'grp_junior')));
  await check('after the move, Little ones\u2019 leader reads Ben\u2019s details', 'allow', () => getDoc(doc(ctx('u_lou'), 'kidsMedical', 'kid_ben')));
  await check('and Juniors\u2019 leader no longer can', 'deny', () => getDoc(doc(ctx('u_jo'), 'kidsMedical', 'kid_ben')));
  await check('the leads are set by a master admin or the safeguarding lead, not a lead', 'deny', () => setDoc(doc(ctx('u_kim'), 'kidsSettings', 'site_kids'), { teams: ['Kids Church', 'Worship Team'], formId: 'form_kids' }));
  await check('a lead sets a group\u2019s leaders', 'allow', () => setDoc(doc(ctx('u_kim'), 'kidsGroups', 'grp_junior'), { siteId: 'site_kids', name: 'Juniors', ratio: 8, leaderIds: ['m_jo', 'm_sid'] }));
  await check('a group leader cannot add themselves to another group', 'deny', () => setDoc(doc(ctx('u_lou'), 'kidsGroups', 'grp_junior'), { siteId: 'site_kids', name: 'Juniors', ratio: 8, leaderIds: ['m_jo', 'm_lou'] }));
  const REQ = (formId) => ({ formId, formTitle: 'x', calEventId: '', eventTitle: '', eventStart: '', signupKey: '', personKind: '', personId: '', name: 'Parent Synthetic',
    email: 'parent@example.invalid', subjects: [], siteId: 'site_kids', status: 'sent', reuseOf: '', sentAt: 'x', reminders: [], createdBy: 'u_kim' });
  await check('a lead sends the registration form', 'allow', () => setDoc(doc(ctx('u_kim'), 'formRequests', 'req_kids_1_000000000000000000000'), REQ('form_kids')));
  await check('the safeguarding lead may send any form at the site (they see all forms)', 'allow', () => setDoc(doc(ctx('u_sg'), 'formRequests', 'req_kids_2_000000000000000000000'), REQ('form_other')));
  await check('a group leader cannot send it', 'deny', () => setDoc(doc(ctx('u_lou'), 'formRequests', 'req_kids_3_000000000000000000000'), REQ('form_kids')));
  await check('a lead lists that form\u2019s answers', 'allow', () => getDocs(query(collection(ctx('u_kim'), 'formResponses'), where('siteId', '==', 'site_kids'), where('formId', '==', 'form_kids'))));
  await check('a group leader cannot list the registration answers', 'deny', () => getDocs(query(collection(ctx('u_lou'), 'formResponses'), where('siteId', '==', 'site_kids'), where('formId', '==', 'form_kids'))));
  await check('a child is never deleted from a page', 'deny', () => deleteDoc(doc(as('martin'), 'kidsChildren', 'kid_ada')));
}

// ── EVENTS (events window) ── whose forms: each team its own (Martin, F-087)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'forms', 'form_worship_decl'), { title: 'Leader or volunteer declaration', siteId: 'site_kids', team: 'Worship Team', template: 'leader', fields: [], version: 1 });
    await setDoc(doc(db, 'forms', 'form_church_wide'), { title: 'Church survey', siteId: 'site_kids', team: '', fields: [], version: 1 });
    await setDoc(doc(db, 'formRequests', 'req_wdecl_0000000000000000000000'), { formId: 'form_worship_decl', siteId: 'site_kids', calEventId: '', status: 'done', email: 'leader@example.invalid', name: 'Worship Leader', responseId: 'resp_wdecl' });
    await setDoc(doc(db, 'formResponses', 'resp_wdecl'), { formId: 'form_worship_decl', siteId: 'site_kids', calEventId: '', requestKey: 'req_wdecl_0000000000000000000000',
      email: 'leader@example.invalid', name: 'Worship Leader', answers: { dbs: 'Current' }, validUntil: '2027-10-01', deleteAfter: '2028-10-01' });
  });
  const listResp = (who, formId) => getDocs(query(collection(who, 'formResponses'), where('siteId', '==', 'site_kids'), where('formId', '==', formId)));
  const listReq = (who, formId) => getDocs(query(collection(who, 'formRequests'), where('siteId', '==', 'site_kids'), where('formId', '==', formId)));
  const REQ = (formId) => ({ formId, formTitle: 'x', calEventId: '', name: 'Someone', email: 'someone@example.invalid', subjects: [], siteId: 'site_kids', status: 'sent', sentAt: 'x', reminders: [] });
  await check('A KIDS CHURCH ADMIN CANNOT READ A WORSHIP LEADER\u2019S DECLARATION', 'deny', () => listResp(ctx('u_kim'), 'form_worship_decl'));
  await check('nor the requests that point at it', 'deny', () => listReq(ctx('u_kim'), 'form_worship_decl'));
  await check('nor send a Worship form', 'deny', () => setDoc(doc(ctx('u_kim'), 'formRequests', 'req_kim_worship_00000000000000000'), REQ('form_worship_decl')));
  await check('nor list the Worship team\u2019s forms', 'deny', () => getDocs(query(collection(ctx('u_kim'), 'forms'), where('team', '==', 'Worship Team'))));
  await check('nor move a Worship form into Kids Church', 'deny', () => updateDoc(doc(ctx('u_kim'), 'forms', 'form_worship_decl'), { team: 'Kids Church' }));
  await check('a Worship admin reads their own team\u2019s declarations', 'allow', () => listResp(ctx('u_wes'), 'form_worship_decl'));
  await check('and sends their own forms', 'allow', () => setDoc(doc(ctx('u_wes'), 'formRequests', 'req_wes_worship_000000000000000000'), REQ('form_worship_decl')));
  await check('and lists them', 'allow', () => getDocs(query(collection(ctx('u_wes'), 'forms'), where('team', '==', 'Worship Team'))));
  await check('but not make a form for another team', 'deny', () => setDoc(doc(ctx('u_wes'), 'forms', 'form_wes_kids'), { title: 'x', fields: [], siteId: 'site_kids', team: 'Kids Church' }));
  await check('a Kids Church admin reads Kids Church forms', 'allow', () => listResp(ctx('u_kim'), 'form_kids'));
  await check('a master admin reads every team\u2019s', 'allow', () => listResp(as('martin'), 'form_worship_decl'));
  await check('so does the safeguarding lead', 'allow', () => listResp(ctx('u_sg'), 'form_worship_decl'));
  await check('a form with no team: not a team admin\u2019s to send', 'deny', () => setDoc(doc(ctx('u_wes'), 'formRequests', 'req_wes_church_000000000000000000'), REQ('form_church_wide')));
  await check('a master admin\u2019s', 'allow', () => setDoc(doc(as('martin'), 'formRequests', 'req_mar_church_000000000000000000'), REQ('form_church_wide')));
  await check('the medical halves are unchanged: a Worship admin still cannot list them (E3)', 'deny',
    () => getDocs(query(collection(ctx('u_wes'), 'sensitiveResponses'), where('siteId', '==', 'site_kids'), where('formId', '==', 'form_worship_decl'))));
}

// ── EVENTS (events window) ── Sunday check-in (Chunk 6, stage 2): E1's check-in, need to know
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const DAY = '2026-10-11';
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'kidsFamilies', 'fam_2'), { siteId: 'site_kids', parentName: 'Parent Two', collectors: ['Parent Two', 'Grandma Invented'], familyCode: 'FAM222' });
    await setDoc(doc(db, 'kidsChildren', 'kid_cat'), { siteId: 'site_kids', familyId: 'fam_2', name: 'Cat Synthetic', groupId: 'grp_junior', status: 'registered', collectors: ['Parent Two', 'Grandma Invented'] });
    await setDoc(doc(db, 'kidsChildren', 'kid_dan'), { siteId: 'site_kids', familyId: 'fam_2', name: 'Dan Synthetic', groupId: 'grp_little', status: 'registered', collectors: ['Parent Two', 'Grandma Invented'] });
    await setDoc(doc(db, 'kidsChildren', 'kid_gone'), { siteId: 'site_kids', familyId: 'fam_2', name: 'Gone Synthetic', groupId: 'grp_junior', status: 'left', collectors: [] });
  });
  const CK = (kid, groupId, extra) => ({ calEventId: 'kids_' + groupId + '_' + DAY, signupKey: kid, attendeeIndex: 0, name: 'Synthetic child', kind: 'child', state: 'in',
    inAt: 'x', inBy: 'x', inByName: 'x', roomId: '', day: DAY, updatedAt: 'x', groupId, siteId: 'site_kids', familyId: 'fam_2', pickupCode: 'K7P2', ...(extra || {}) });
  const id = (kid, groupId) => 'kids_' + groupId + '_' + DAY + '__' + kid + '__0';
  const put = (who, kid, groupId, extra) => setDoc(doc(who, 'checkins', id(kid, groupId)), CK(kid, groupId, extra));
  const out = (who, kid, groupId, o) => updateDoc(doc(who, 'checkins', id(kid, groupId)), { state: 'out', outAt: 'y', outBy: 'y', outByName: 'y', updatedAt: 'y', collectedBy: '', collectorListed: false, codeGiven: '', ...o });

  await check('a lead checks Cat in to Juniors at the desk', 'allow', () => put(ctx('u_kim'), 'kid_cat', 'grp_junior'));
  await check('Juniors\u2019 leader cannot check in Dan (he is in Little ones)', 'deny', () => put(ctx('u_jo'), 'kid_dan', 'grp_little'));
  await check('nor by claiming Dan is in Juniors', 'deny', () => put(ctx('u_jo'), 'kid_dan', 'grp_junior'));
  await check('Little ones\u2019 leader checks Dan in at their door', 'allow', () => put(ctx('u_lou'), 'kid_dan', 'grp_little'));
  await check('a child who has left the register cannot be checked in', 'deny', () => put(ctx('u_kim'), 'kid_gone', 'grp_junior'));
  await check('nor checked in twice', 'deny', () => put(ctx('u_kim'), 'kid_cat', 'grp_junior'));
  await check('a session must be the group\u2019s and the day\u2019s', 'deny', () => setDoc(doc(ctx('u_kim'), 'checkins', 'kids_grp_x_' + DAY + '__kid_cat__0'), CK('kid_cat', 'grp_junior', { calEventId: 'kids_grp_x_' + DAY })));
  await check('a collection code is needed at check-in', 'deny', () => setDoc(doc(ctx('u_kim'), 'checkins', id('kid_dan', 'grp_junior')), CK('kid_dan', 'grp_junior', { pickupCode: '' })));

  await check('Juniors\u2019 leader sees who is in their group today', 'allow', () => getDocs(query(collection(ctx('u_jo'), 'checkins'), where('groupId', '==', 'grp_junior'), where('day', '==', DAY))));
  await check('THE LEADER OF LITTLE ONES CANNOT SEE WHO IS IN JUNIORS', 'deny', () => getDocs(query(collection(ctx('u_lou'), 'checkins'), where('groupId', '==', 'grp_junior'), where('day', '==', DAY))));
  await check('nor open Cat\u2019s check-in (with her collection code)', 'deny', () => getDoc(doc(ctx('u_lou'), 'checkins', id('kid_cat', 'grp_junior'))));
  await check('A WORSHIP ADMIN SEES NO CHILD\u2019S CHECK-IN', 'deny', () => getDoc(doc(ctx('u_wes'), 'checkins', id('kid_cat', 'grp_junior'))));
  await check('nor lists the Sunday session', 'deny', () => getDocs(query(collection(ctx('u_wes'), 'checkins'), where('calEventId', '==', 'kids_grp_junior_' + DAY))));
  await check('nor sees children in a roll-call that asks for the whole day', 'deny', () => getDocs(query(collection(ctx('u_wes'), 'checkins'), where('day', '==', DAY))));
  await check('but the roll-call of event check-ins still works for admins (by day and kind)', 'allow', () => getDocs(query(collection(ctx('u_wes'), 'checkins'), where('day', '==', DAY), where('kind', 'in', ['booked', 'walkin', 'leader']))));
  await check('an admin cannot write a Sunday check-in as an event one', 'deny', () => setDoc(doc(ctx('u_wes'), 'checkins', id('kid_cat', 'grp_little')), CK('kid_cat', 'grp_little', { kind: 'booked' })));
  await check('someone on Kids Church who leads no group cannot check a child in', 'deny', () => put(ctx('u_sid'), 'kid_dan', 'grp_junior'));
  await check('a lead lists the whole site\u2019s day', 'allow', () => getDocs(query(collection(ctx('u_kim'), 'checkins'), where('siteId', '==', 'site_kids'), where('day', '==', DAY))));
  await check('so does the safeguarding lead', 'allow', () => getDocs(query(collection(ctx('u_sg'), 'checkins'), where('siteId', '==', 'site_kids'), where('day', '==', DAY))));

  await check('CHECK-OUT: not to someone who is not listed and has no code', 'deny', () => out(ctx('u_jo'), 'kid_cat', 'grp_junior', { collectedBy: 'A Stranger' }));
  await check('nor by ticking "listed" for someone who is not', 'deny', () => out(ctx('u_jo'), 'kid_cat', 'grp_junior', { collectedBy: 'A Stranger', collectorListed: true }));
  await check('nor with the wrong code', 'deny', () => out(ctx('u_jo'), 'kid_cat', 'grp_junior', { collectedBy: 'A Stranger', codeGiven: 'ZZZZ' }));
  await check('nor with a reason instead (no way round it at the door)', 'deny', () => out(ctx('u_jo'), 'kid_cat', 'grp_junior', { collectedBy: 'A Stranger', overrideReason: 'Says she is an aunt' }));
  await check('nor by changing the code first', 'deny', () => updateDoc(doc(ctx('u_jo'), 'checkins', id('kid_cat', 'grp_junior')), { pickupCode: 'ZZZZ' }));
  await check('to a listed collector', 'allow', () => out(ctx('u_jo'), 'kid_cat', 'grp_junior', { collectedBy: 'Grandma Invented', collectorListed: true }));
  await check('back in again later', 'allow', () => updateDoc(doc(ctx('u_kim'), 'checkins', id('kid_cat', 'grp_junior')), { state: 'in', inAt: 'z', updatedAt: 'z' }));
  await check('and out with the matching code, to someone not on the list', 'allow', () => out(ctx('u_kim'), 'kid_cat', 'grp_junior', { collectedBy: 'Uncle Synthetic', codeGiven: 'K7P2' }));
  await check('Little ones\u2019 leader cannot check a Junior back in or out', 'deny', () => updateDoc(doc(ctx('u_lou'), 'checkins', id('kid_cat', 'grp_junior')), { state: 'in', inAt: 'z', updatedAt: 'z' }));
  await check('a Sunday check-in is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'checkins', id('kid_cat', 'grp_junior'))));
}

// ── EVENTS (events window) ── the morning: fire roll-call and the Session Leader (Chunk 6, stage 3; Martin, F-094)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const TODAY = new Date().toISOString().slice(0, 10);
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { Timestamp } = await import('firebase/firestore');
  const soon = (h) => Timestamp.fromMillis(Date.now() + h * 3600000);
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const U = (uid, mid, teams, adminFor) => setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor, masterAdmin: false });
    await U('u_sam', 'm_sam', ['Kids Church'], []);
    await U('u_nat', 'm_nat', ['Kids Church'], []);
    await setDoc(doc(db, 'events', 'rota_today'), { date: TODAY, roles: ['Session Leader'], assignments: { 'Session Leader': { id: 'm_sam', name: 'Sam Session' }, 'Helper 1': [{ id: 'm_nat', name: 'Nat' }] } });
    await setDoc(doc(db, 'events', 'rota_yesterday'), { date: YESTERDAY, roles: ['Session Leader'], assignments: { 'Session Leader': { id: 'm_nat', name: 'Nat' } } });
    await setDoc(doc(db, 'kidsMedical', 'kid_cat'), { siteId: 'site_kids', groupId: 'grp_junior', allergies: 'Sesame (invented)', medical: '', medication: '', needs: '', responseId: 'r2' });
    await setDoc(doc(db, 'kidsMedical', 'kid_dan'), { siteId: 'site_kids', groupId: 'grp_little', allergies: 'None', medical: '', medication: '', needs: '', responseId: 'r2' });
    await setDoc(doc(db, 'kidsRoll', 'old_roll'), { siteId: 'site_kids', day: YESTERDAY, groupId: 'grp_junior', groupName: 'Juniors', childId: 'kid_cat', name: 'Cat Synthetic', state: 'in', inAt: 'x', outAt: '', roomId: '', updatedAt: 'x' });
  });
  const MORNING = (extra) => ({ siteId: 'site_kids', day: TODAY, rotaId: 'rota_today', leaderIds: ['m_lou', 'm_jo', 'm_sid'], sessionLeaderIds: ['m_sam'], expiresAt: soon(10), updatedAt: 'x', updatedBy: 'u_kim', ...(extra || {}) });
  const mref = (who) => doc(who, 'kidsMornings', 'site_kids_' + TODAY);
  await check('a group leader cannot open the morning', 'deny', () => setDoc(mref(ctx('u_lou')), MORNING()));
  await check('a lead cannot name a Session Leader the rota does not', 'deny', () => setDoc(mref(ctx('u_kim')), MORNING({ sessionLeaderIds: ['m_nat'] })));
  await check('nor use another day\u2019s rota', 'deny', () => setDoc(mref(ctx('u_kim')), MORNING({ rotaId: 'rota_yesterday', sessionLeaderIds: ['m_nat'] })));
  await check('nor keep a morning open for days', 'deny', () => setDoc(mref(ctx('u_kim')), MORNING({ expiresAt: soon(48) })));
  await check('a lead opens the morning, with the rota\u2019s Session Leader', 'allow', () => setDoc(mref(ctx('u_kim')), MORNING()));

  const CKID = (kid, g) => 'kids_' + g + '_' + TODAY + '__' + kid + '__0';
  const CK = (kid, g) => ({ calEventId: 'kids_' + g + '_' + TODAY, signupKey: kid, attendeeIndex: 0, name: kid === 'kid_cat' ? 'Cat Synthetic' : 'Dan Synthetic', kind: 'child', state: 'in',
    inAt: 'x', inBy: 'x', inByName: 'x', roomId: '', day: TODAY, updatedAt: 'x', groupId: g, siteId: 'site_kids', familyId: 'fam_2', pickupCode: 'Q7P2' });
  const ROLL = (kid, g, extra) => ({ siteId: 'site_kids', day: TODAY, groupId: g, groupName: 'x', childId: kid, name: CK(kid, g).name, state: 'in', inAt: 'x', outAt: '', roomId: '', updatedAt: 'x', ...(extra || {}) });
  const both = (who, kid, g, rollExtra) => { const b = writeBatch(who); b.set(doc(who, 'checkins', CKID(kid, g)), CK(kid, g)); b.set(doc(who, 'kidsRoll', CKID(kid, g)), ROLL(kid, g, rollExtra)); return b.commit(); };
  await check('a roll-call copy must say what the check-in says', 'deny', () => both(ctx('u_kim'), 'kid_cat', 'grp_junior', { name: 'Someone Else' }));
  await check('the desk checks Cat in, with her roll-call copy, in one write', 'allow', () => both(ctx('u_kim'), 'kid_cat', 'grp_junior'));
  const roll = (who, day) => getDocs(query(collection(who, 'kidsRoll'), where('siteId', '==', 'site_kids'), where('day', '==', day || TODAY)));
  await check('FIRE ROLL-CALL: the leader of Little ones sees every child checked in this morning, Cat included', 'allow', () => roll(ctx('u_lou')));
  await check('but still not Cat\u2019s check-in itself (her collection code)', 'deny', () => getDoc(doc(ctx('u_lou'), 'checkins', CKID('kid_cat', 'grp_junior'))));
  await check('nor her medical details, nor her record (phone numbers)', 'deny', () => Promise.all([getDoc(doc(ctx('u_lou'), 'kidsMedical', 'kid_cat')).catch(e => { throw e; }), getDoc(doc(ctx('u_lou'), 'kidsChildren', 'kid_cat'))]));
  await check('nor last week\u2019s roll-call', 'deny', () => roll(ctx('u_lou'), YESTERDAY));
  await check('the rota\u2019s Session Leader sees the roll-call', 'allow', () => roll(ctx('u_sam')));
  await check('THE SESSION LEADER SEES THE MEDICAL DETAILS OF A CHILD CHECKED IN THIS MORNING', 'allow', () => getDoc(doc(ctx('u_sam'), 'kidsMedical', 'kid_cat')));
  await check('but not of a child who has not come this morning', 'deny', () => getDoc(doc(ctx('u_sam'), 'kidsMedical', 'kid_dan')));
  await check('nor a child\u2019s record (names and groups come from the roll-call)', 'deny', () => getDoc(doc(ctx('u_sam'), 'kidsChildren', 'kid_cat')));
  await check('someone on Kids Church not leading this morning sees no roll-call', 'deny', () => roll(ctx('u_nat')));
  await check('nor an admin of another team', 'deny', () => roll(ctx('u_wes')));
  await check('a roll-call copy is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'kidsRoll', CKID('kid_cat', 'grp_junior'))));
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), 'kidsMornings', 'site_kids_' + TODAY), { expiresAt: Timestamp.fromMillis(Date.now() - 60000) }); });
  await check('WHEN THE MORNING CLOSES: the Session Leader no longer sees the medical details', 'deny', () => getDoc(doc(ctx('u_sam'), 'kidsMedical', 'kid_cat')));
  await check('nor the leader of Little ones the roll-call', 'deny', () => roll(ctx('u_lou')));
  await check('the leads still do', 'allow', () => roll(ctx('u_kim')));
}

// ── EVENTS (events window) ── F-098: the Session Leader opens the morning; term dates; paging on the screen (ChurchShow)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const TODAY = new Date().toISOString().slice(0, 10);
  const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { Timestamp } = await import('firebase/firestore');
  const soon = (h) => Timestamp.fromMillis(Date.now() + h * 3600000);
  const M = (extra) => ({ siteId: 'site_kids', day: TODAY, rotaId: 'rota_today', leaderIds: ['m_lou', 'm_jo', 'm_sid'], sessionLeaderIds: ['m_sam'], expiresAt: soon(8), updatedAt: 'x', updatedBy: 'u_sam', ...(extra || {}) });
  await check('someone not the Session Leader on the rota cannot open the morning', 'deny', () => setDoc(doc(ctx('u_nat'), 'kidsMornings', 'site_kids_' + TODAY), M({ sessionLeaderIds: ['m_nat'] })));
  await check('nor by naming the real Session Leader', 'deny', () => setDoc(doc(ctx('u_nat'), 'kidsMornings', 'site_kids_' + TODAY), M()));
  await check('THE ROTA\u2019S SESSION LEADER OPENS THE MORNING THEMSELVES', 'allow', () => setDoc(doc(ctx('u_sam'), 'kidsMornings', 'site_kids_' + TODAY), M()));
  await check('but only today\u2019s', 'deny', () => setDoc(doc(ctx('u_sam'), 'kidsMornings', 'site_kids_' + TOMORROW), M({ day: TOMORROW })));

  const T = (a, b, c) => ({ terms: [{ name: 'Autumn', from: a[0], to: a[1] }, { name: 'Spring', from: b[0], to: b[1] }, { name: 'Summer', from: c[0], to: c[1] }], updatedAt: 'x', updatedBy: 'x' });
  const YEAR = T(['2026-09-03', '2026-12-18'], ['2027-01-05', '2027-03-26'], ['2027-04-12', '2027-07-21']);
  await check('a lead sets the year\u2019s three terms', 'allow', () => setDoc(doc(ctx('u_kim'), 'kidsTerms', 'site_kids'), YEAR));
  await check('terms that overlap are refused', 'deny', () => setDoc(doc(ctx('u_kim'), 'kidsTerms', 'site_kids'), T(['2026-09-03', '2027-01-10'], ['2027-01-05', '2027-03-26'], ['2027-04-12', '2027-07-21'])));
  await check('a term that ends before it starts is refused', 'deny', () => setDoc(doc(ctx('u_kim'), 'kidsTerms', 'site_kids'), T(['2026-12-18', '2026-09-03'], ['2027-01-05', '2027-03-26'], ['2027-04-12', '2027-07-21'])));
  await check('a group leader cannot set them', 'deny', () => setDoc(doc(ctx('u_lou'), 'kidsTerms', 'site_kids'), YEAR));

  const PID = 'kids_grp_junior_' + TODAY + '__kid_cat__0';   /* Cat, checked in to Juniors this morning (code Q7P2) */
  const PAGE = (who, extra) => ({ siteId: 'site_kids', code: 'Q7P2', room: 'Junior Room', message: 'Q7P2, please come to Juniors', createdBy: who, createdAt: serverTimestamp(), clearedAt: null, ...(extra || {}) });
  await check('THE PAGE MAY NOT NAME THE CHILD', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { message: 'Cat Synthetic, please come to Juniors' })));
  await check('nor carry a code that is not the family\u2019s', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { code: 'ZZZZ', message: 'ZZZZ, please come to Juniors' })));
  await check('nor anything else', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { childName: 'Cat Synthetic' })));
  await check('the leader of Little ones cannot page for a Junior', 'deny', () => setDoc(doc(ctx('u_lou'), 'screenPages', PID), PAGE('u_lou')));
  await check('an admin of another team cannot page', 'deny', () => setDoc(doc(ctx('u_wes'), 'screenPages', PID), PAGE('u_wes')));
  await check('Juniors\u2019 leader pages Cat\u2019s parent: "Q7P2, please come to Juniors"', 'allow', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo')));
  await check('THE CONTRACT: the projection computer (a worship admin) reads the active pages for the site, exactly these fields, a code and no name', 'allow', async () => {
    const snap = await getDocs(query(collection(ctx('u_wes'), 'screenPages'), where('siteId', '==', 'site_kids'), where('clearedAt', '==', null)));
    const d = snap.docs[0] && snap.docs[0].data();
    if (snap.size !== 1) throw new Error('expected one page, got ' + snap.size);
    if (Object.keys(d).sort().join(',') !== 'clearedAt,code,createdAt,createdBy,message,room,siteId') throw new Error('fields: ' + Object.keys(d).sort());
    if (d.message !== 'Q7P2, please come to Juniors' || d.code !== 'Q7P2' || d.room !== 'Junior Room' || d.siteId !== 'site_kids' || d.clearedAt !== null) throw new Error(JSON.stringify(d));
    if (typeof d.createdAt.toMillis !== 'function' || Math.abs(d.createdAt.toMillis() - Date.now()) > 120000) throw new Error('createdAt is not server time');
    if (/Cat|Synthetic/.test(JSON.stringify(d))) throw new Error('a name on the screen');
  });
  await check('a list that does not ask for uncleared pages is refused', 'deny', () => getDocs(query(collection(ctx('u_wes'), 'screenPages'), where('siteId', '==', 'site_kids'))));
  await check('nobody signed out reads them', 'deny', () => getDocs(query(collection(env.unauthenticatedContext().firestore(), 'screenPages'), where('siteId', '==', 'site_kids'), where('clearedAt', '==', null))));
  await check('the Session Leader pages too, this morning', 'allow', () => setDoc(doc(ctx('u_sam'), 'screenPages', PID), PAGE('u_sam')));
  await check('"Done" may not change anything but clearedAt', 'deny', () => updateDoc(doc(ctx('u_jo'), 'screenPages', PID), { clearedAt: serverTimestamp(), code: 'ZZZZ' }));
  await check('the leader presses "Done": it is cleared, at server time', 'allow', () => updateDoc(doc(ctx('u_jo'), 'screenPages', PID), { clearedAt: serverTimestamp() }));
  await check('once cleared, the projection computer no longer reads it', 'deny', () => getDoc(doc(ctx('u_wes'), 'screenPages', PID)));
  await check('a page is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'screenPages', PID)));
}

// ── EVENTS (events window) ── small groups (Chunk 7, stage 1)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const U = (uid, mid, teams, adminFor) => Promise.all([setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor, masterAdmin: false }),
      setDoc(doc(db, 'addressBook', mid), { name: uid, email: uid + '@example.invalid', markers: teams })]);
    await U('u_gina', 'm_gina', ['Core Team'], ['Core Team']);
    await U('u_lena', 'm_lena', ['Small Groups'], []);
    await U('u_mo', 'm_mo', [], []);
    await U('u_ned', 'm_ned', [], []);
  });
  const GRP = (extra) => ({ name: 'Tuesday home group', type: 'Home group', description: 'Bible and supper', day: 2, time: '19:30', frequency: 'weekly', locationKind: 'home', area: 'Esher',
    audience: 'Adults', open: true, capacity: 2, memberCount: 0, visibility: 'public', canCome: ['public', 'members'], active: true, leaderIds: ['m_lena'], leaderNames: ['Lena'], ...(extra || {}) });
  await check('before a groups team is named, a Core Team admin cannot add a group', 'deny', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_tue'), GRP()));
  await check('a master admin names the groups admins (Core Team)', 'allow', () => setDoc(doc(as('martin'), 'groupsSettings', 'main'), { teams: ['Core Team'] }));
  await check('a groups admin (Core Team) adds a group, with Lena leading', 'allow', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_tue'), GRP()));
  await check('and its private half: the address', 'allow', () => setDoc(doc(ctx('u_gina'), 'smallGroupPrivate', 'sg_tue'), { address: '1 Invented Road, Esher', meetingLink: '', notes: '' }));
  await check('a members-only group too', 'allow', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_mem'), GRP({ name: 'Members prayer', visibility: 'members', canCome: ['members'], capacity: 0 })));
  await check('an admin of another team cannot add a group', 'deny', () => setDoc(doc(ctx('u_wes'), 'smallGroups', 'sg_x'), GRP()));
  await check('a home address may not go on the public card', 'deny', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_z'), GRP({ address: '1 Invented Road' })));
  await check('nor can a group start with members already counted', 'deny', () => setDoc(doc(as('martin'), 'smallGroups', 'sg_y'), GRP({ memberCount: 3 })));

  await check('the public see public groups that are running', 'allow', () => getDocs(query(collection(guest(), 'smallGroups'), where('visibility', '==', 'public'), where('active', '==', true))));
  await check('but not members-only groups', 'deny', () => getDoc(doc(guest(), 'smallGroups', 'sg_mem')));
  await check('members see them', 'allow', () => getDocs(query(collection(ctx('u_ned'), 'smallGroups'), where('active', '==', true))));
  await check('A HOME GROUP\u2019S ADDRESS IS NOT PUBLIC', 'deny', () => getDoc(doc(guest(), 'smallGroupPrivate', 'sg_tue')));
  await check('nor open to a member who is not in the group', 'deny', () => getDoc(doc(ctx('u_ned'), 'smallGroupPrivate', 'sg_tue')));
  await check('the leader reads it', 'allow', () => getDoc(doc(ctx('u_lena'), 'smallGroupPrivate', 'sg_tue')));

  /* Asking to join: a guest as a contact written in the same batch; a member as themselves. */
  const REQ = (extra) => ({ groupId: 'sg_tue', groupName: 'Tuesday home group', name: 'Guest Synthetic', email: 'guest@example.invalid', phone: '', message: 'Hello',
    personKind: 'contacts', personId: 'c_guest1', status: 'asked', createdAt: serverTimestamp(), ...(extra || {}) });
  const guestAsk = (id, extra) => { const g = guest(), b = writeBatch(g);
    b.set(doc(g, 'contacts', 'c_guest1'), { name: 'Guest Synthetic', email: 'guest@example.invalid', phone: '', source: 'signup', createdAt: 'x' });
    b.set(doc(g, 'smallGroupRequests', id), REQ(extra)); return b.commit(); };
  await check('a guest asks to join a public group', 'allow', () => guestAsk('rq_guest'));
  await check('a guest cannot ask to join a members-only group', 'deny', () => guestAsk('rq_guest2', { groupId: 'sg_mem' }));
  await check('nor ask as someone already accepted', 'deny', () => guestAsk('rq_guest3', { status: 'accepted' }));
  await check('a member asks as themselves', 'allow', () => setDoc(doc(ctx('u_mo'), 'smallGroupRequests', 'rq_mo'), REQ({ name: 'Mo', email: 'mo@example.invalid', personKind: 'addressBook', personId: 'm_mo' })));
  await check('but not as another member', 'deny', () => setDoc(doc(ctx('u_mo'), 'smallGroupRequests', 'rq_mo2'), REQ({ personKind: 'addressBook', personId: 'm_ned' })));
  await check('requests are not public', 'deny', () => getDoc(doc(guest(), 'smallGroupRequests', 'rq_guest')));
  await check('nor seen by another member', 'deny', () => getDocs(query(collection(ctx('u_ned'), 'smallGroupRequests'), where('groupId', '==', 'sg_tue'))));
  await check('the leader sees the group\u2019s requests', 'allow', () => getDocs(query(collection(ctx('u_lena'), 'smallGroupRequests'), where('groupId', '==', 'sg_tue'), where('status', '==', 'asked'))));

  /* Accepting: the request, the member and the count, in one write. */
  const accept = (who, rq, kind, pid, name, count) => { const b = writeBatch(who), key = 'sg_tue__' + (kind === 'contacts' ? 'c' : 'a') + '_' + pid;
    b.update(doc(who, 'smallGroupRequests', rq), { status: 'accepted', decidedAt: serverTimestamp(), decidedBy: who === undefined ? '' : whoUid });
    b.set(doc(who, 'smallGroupMembers', key), { groupId: 'sg_tue', personKind: kind, personId: pid, name, email: '', phone: '', joinedAt: 'x', addedBy: 'x' });
    b.update(doc(who, 'smallGroups', 'sg_tue'), { memberCount: count, lastMemberKey: key }); return b.commit(); };
  let whoUid = 'u_lena';
  await check('accepting without counting is refused', 'deny', () => { const w = ctx('u_lena'), b = writeBatch(w);
    b.update(doc(w, 'smallGroupRequests', 'rq_mo'), { status: 'accepted', decidedAt: serverTimestamp(), decidedBy: 'u_lena' });
    b.set(doc(w, 'smallGroupMembers', 'sg_tue__a_m_mo'), { groupId: 'sg_tue', personKind: 'addressBook', personId: 'm_mo', name: 'Mo', email: '', phone: '', joinedAt: 'x', addedBy: 'x' }); return b.commit(); });
  await check('a member of another group cannot accept', 'deny', () => { whoUid = 'u_ned'; return accept(ctx('u_ned'), 'rq_mo', 'addressBook', 'm_mo', 'Mo', 1); });
  await check('the leader accepts Mo: request, member and count together', 'allow', () => { whoUid = 'u_lena'; return accept(ctx('u_lena'), 'rq_mo', 'addressBook', 'm_mo', 'Mo', 1); });
  await check('Mo now reads the address', 'allow', () => getDoc(doc(ctx('u_mo'), 'smallGroupPrivate', 'sg_tue')));
  await check('and who else is in the group', 'allow', () => getDocs(query(collection(ctx('u_mo'), 'smallGroupMembers'), where('groupId', '==', 'sg_tue'))));
  await check('and finds their own groups', 'allow', () => getDocs(query(collection(ctx('u_mo'), 'smallGroupMembers'), where('personKind', '==', 'addressBook'), where('personId', '==', 'm_mo'))));
  await check('Ned, in no group, does not see who is in it', 'deny', () => getDocs(query(collection(ctx('u_ned'), 'smallGroupMembers'), where('groupId', '==', 'sg_tue'))));
  await check('the leader accepts the guest (the second of two places)', 'allow', () => accept(ctx('u_lena'), 'rq_guest', 'contacts', 'c_guest1', 'Guest Synthetic', 2));
  await check('THE GROUP IS FULL: nobody can be added past its limit', 'deny', () => { const w = ctx('u_lena'), b = writeBatch(w), key = 'sg_tue__a_m_ned';
    b.set(doc(w, 'smallGroupMembers', key), { groupId: 'sg_tue', personKind: 'addressBook', personId: 'm_ned', name: 'Ned', email: '', phone: '', joinedAt: 'x', addedBy: 'x' });
    b.update(doc(w, 'smallGroups', 'sg_tue'), { memberCount: 3, lastMemberKey: key }); return b.commit(); });
  await check('and nobody can ask to join a full group', 'deny', () => setDoc(doc(ctx('u_ned'), 'smallGroupRequests', 'rq_ned'), REQ({ name: 'Ned', personKind: 'addressBook', personId: 'm_ned' })));
  await check('the count cannot be moved by hand', 'deny', () => updateDoc(doc(ctx('u_lena'), 'smallGroups', 'sg_tue'), { memberCount: 0 }));
  await check('the leader edits the group\u2019s details', 'allow', () => updateDoc(doc(ctx('u_lena'), 'smallGroups', 'sg_tue'), { time: '20:00', capacity: 3 }));
  await check('but not its leaders', 'deny', () => updateDoc(doc(ctx('u_lena'), 'smallGroups', 'sg_tue'), { leaderIds: ['m_lena', 'm_ned'] }));
  await check('nor whether it is public', 'deny', () => updateDoc(doc(ctx('u_lena'), 'smallGroups', 'sg_tue'), { visibility: 'members' }));
  await check('the leader takes the guest out: member and count together', 'allow', () => { const w = ctx('u_lena'), b = writeBatch(w);
    b.delete(doc(w, 'smallGroupMembers', 'sg_tue__c_c_guest1')); b.update(doc(w, 'smallGroups', 'sg_tue'), { memberCount: 1, lastMemberKey: 'sg_tue__c_c_guest1' }); return b.commit(); });
  await check('a member cannot add themselves', 'deny', () => { const w = ctx('u_ned'), b = writeBatch(w), key = 'sg_tue__a_m_ned';
    b.set(doc(w, 'smallGroupMembers', key), { groupId: 'sg_tue', personKind: 'addressBook', personId: 'm_ned', name: 'Ned', email: '', phone: '', joinedAt: 'x', addedBy: 'x' });
    b.update(doc(w, 'smallGroups', 'sg_tue'), { memberCount: 2, lastMemberKey: key }); return b.commit(); });
  await check('a group is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'smallGroups', 'sg_tue')));
}

// ── EVENTS (events window) ── small groups, stage 2: meetings, the register, messages, leaving
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  /* After stage 1's checks: Lena leads sg_tue; Mo is its one member; Ned is in no group. */
  const MEET = (extra) => ({ groupId: 'sg_tue', date: '2026-10-13', time: '20:00', cancelled: false, notes: 'Study plan: Mark 4 (invented)', updatedAt: 'x', updatedBy: 'x', ...(extra || {}) });
  await check('the leader writes a meeting\u2019s notes', 'allow', () => setDoc(doc(ctx('u_lena'), 'smallGroupMeetings', 'sg_tue__2026-10-13'), MEET()));
  await check('under its own date only', 'deny', () => setDoc(doc(ctx('u_lena'), 'smallGroupMeetings', 'sg_tue__2026-10-20'), MEET()));
  await check('a member cannot write them', 'deny', () => setDoc(doc(ctx('u_mo'), 'smallGroupMeetings', 'sg_tue__2026-10-13'), MEET({ notes: 'changed' })));
  await check('the group\u2019s members read the study plan', 'allow', () => getDocs(query(collection(ctx('u_mo'), 'smallGroupMeetings'), where('groupId', '==', 'sg_tue'))));
  await check('someone not in the group does not', 'deny', () => getDocs(query(collection(ctx('u_ned'), 'smallGroupMeetings'), where('groupId', '==', 'sg_tue'))));
  const REG = (extra) => ({ groupId: 'sg_tue', date: '2026-10-13', present: ['sg_tue__a_m_mo'], guests: 1, count: 2, updatedAt: 'x', updatedBy: 'x', ...(extra || {}) });
  await check('the leader takes the register', 'allow', () => setDoc(doc(ctx('u_lena'), 'smallGroupAttendance', 'sg_tue__2026-10-13'), REG()));
  await check('the count must be who came plus guests', 'deny', () => setDoc(doc(ctx('u_lena'), 'smallGroupAttendance', 'sg_tue__2026-10-13'), REG({ count: 9 })));
  await check('WHO CAME IS NOT FOR THE MEMBERS: Mo cannot read the register', 'deny', () => getDocs(query(collection(ctx('u_mo'), 'smallGroupAttendance'), where('groupId', '==', 'sg_tue'))));
  await check('the groups admins read every register (oversight)', 'allow', () => getDocs(collection(ctx('u_gina'), 'smallGroupAttendance')));
  await check('a leader of no group cannot list them all', 'deny', () => getDocs(collection(ctx('u_lena'), 'smallGroupAttendance')));
  const MSG = (who, extra) => ({ groupId: 'sg_tue', subject: 'This week', body: 'We meet at 8 (invented).', sentBy: who, sentByName: 'x', sentAt: serverTimestamp(), recipients: 1, ...(extra || {}) });
  await check('the leader messages the group, and it is kept', 'allow', () => setDoc(doc(ctx('u_lena'), 'smallGroupMessages', 'msg_1'), MSG('u_lena')));
  await check('a member cannot send as the group', 'deny', () => setDoc(doc(ctx('u_mo'), 'smallGroupMessages', 'msg_2'), MSG('u_mo')));
  await check('members read their group\u2019s messages', 'allow', () => getDocs(query(collection(ctx('u_mo'), 'smallGroupMessages'), where('groupId', '==', 'sg_tue'))));
  await check('a message is never changed afterwards', 'deny', () => updateDoc(doc(ctx('u_lena'), 'smallGroupMessages', 'msg_1'), { body: 'rewritten' }));
  await check('a leader changes the group\u2019s picture', 'allow', () => updateDoc(doc(ctx('u_lena'), 'smallGroups', 'sg_tue'), { image: 'https://example.invalid/new.jpg' }));
  /* Leaving. */
  const leave = (who, key, count, extraGroup) => { const w = ctx(who), b = writeBatch(w);
    b.delete(doc(w, 'smallGroupMembers', key)); b.update(doc(w, 'smallGroups', 'sg_tue'), { memberCount: count, lastMemberKey: key, ...(extraGroup || {}) }); return b.commit(); };
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'smallGroupMembers', 'sg_tue__a_m_ned2'), { groupId: 'sg_tue', personKind: 'addressBook', personId: 'm_ned2', name: 'Other', email: '', phone: '', joinedAt: 'x', addedBy: 'x' });
    await updateDoc(doc(db, 'smallGroups', 'sg_tue'), { memberCount: 2 });
  });
  await check('a member cannot take someone else out', 'deny', () => leave('u_mo', 'sg_tue__a_m_ned2', 1));
  await check('nor change anything else on the way out', 'deny', () => leave('u_mo', 'sg_tue__a_m_mo', 1, { open: false }));
  await check('MO LEAVES THE GROUP HIMSELF: his place and the count, together', 'allow', () => leave('u_mo', 'sg_tue__a_m_mo', 1));
  await check('and no longer reads its study plan', 'deny', () => getDocs(query(collection(ctx('u_mo'), 'smallGroupMeetings'), where('groupId', '==', 'sg_tue'))));
}

// ── EVENTS (events window) ── R6 (ChurchShow): the paired device reads its own site's pages
// They run once the main window's churchShow() helper (ChurchShow pairing,
// R1-R5) is in the rules, and the R6 clause is added to screenPages. Until
// then they are skipped, and say so.
// (The main window's churchShow() helper is in, so these always run now:
// if the device clause is ever taken out, they fail rather than skip.)
{
  const device = (siteId) => env.authenticatedContext('churchshow-' + siteId, { device: 'churchshow', siteId }).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const PG = (siteId, cleared) => ({ siteId, code: 'Q7P2', room: 'Junior Room', message: 'Q7P2, please come to Juniors', createdBy: 'u_jo', createdAt: new Date(), clearedAt: cleared ? new Date() : null });
    await setDoc(doc(db, 'screenPages', 'pg_r6_open'), PG('site_kids', false));
    await setDoc(doc(db, 'screenPages', 'pg_r6_other'), PG('site_other', false));
    await setDoc(doc(db, 'screenPages', 'pg_r6_cleared'), PG('site_kids', true));
  });
  await check('R6: the paired ChurchShow device reads its own site\u2019s uncleared pages', 'allow',
    () => getDocs(query(collection(device('site_kids'), 'screenPages'), where('siteId', '==', 'site_kids'), where('clearedAt', '==', null))));
  await check('R6: but not another site\u2019s page', 'deny', () => getDoc(doc(device('site_kids'), 'screenPages', 'pg_r6_other')));
  await check('R6: nor a cleared page', 'deny', () => getDoc(doc(device('site_kids'), 'screenPages', 'pg_r6_cleared')));
  await check('R6: nor a list that does not ask for clearedAt == null', 'deny', () => getDocs(query(collection(device('site_kids'), 'screenPages'), where('siteId', '==', 'site_kids'))));
  await check('R6: and it writes nothing (no page, no Done)', 'deny', async () => {
    const d = device('site_kids');
    await updateDoc(doc(d, 'screenPages', 'pg_r6_open'), { clearedAt: serverTimestamp() });
  });
}

// ── EVENTS (events window) ── F-109 (Martin): under-18s groups refuse an uncleared leader; F-108: accounts setting is the office's
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const ago = (y, extraDays) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() + (extraDays || 0)); return d.toISOString().slice(0, 10); };
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'leaderChecks', 'm_lena'), { name: 'Lena', dbsStatus: 'current', dbsSeen: ago(1), trainingDate: ago(1), siteId: '' });
    await setDoc(doc(db, 'leaderChecks', 'm_mo'), { name: 'Mo', dbsStatus: 'current', dbsSeen: ago(4), trainingDate: ago(1), siteId: '' });
  });
  const YG = (leaders, extra) => ({ name: 'Youth group', type: 'Youth', open: true, capacity: 0, memberCount: 0, visibility: 'public', canCome: ['public', 'members'], active: true, under18: true,
    leaderIds: leaders, leaderNames: leaders, locationKind: 'home', area: 'Esher', ...(extra || {}) });
  await check('UNDER-18s: A LEADER WITH NO DBS CHECK OR TRAINING CANNOT BE NAMED', 'deny', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_y18'), YG(['m_ned'])));
  await check('nor one whose DBS check is out of date (seen four years ago)', 'deny', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_y18'), YG(['m_mo'])));
  await check('a leader with both in date can', 'allow', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_y18'), YG(['m_lena'])));
  await check('adding an uncleared leader later is refused', 'deny', () => updateDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_y18'), { leaderIds: ['m_lena', 'm_ned'], lastLeaderAdded: 'm_ned' }));
  await check('nor slipped in by naming someone else as the one added', 'deny', () => updateDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_y18'), { leaderIds: ['m_lena', 'm_ned'], lastLeaderAdded: 'm_lena' }));
  const EX = (who, extra) => ({ groupId: 'sg_y18', memberId: 'm_ned', name: 'Ned', reason: 'DBS applied for; always with Lena (invented)', siteId: 'site_kids', by: who, byName: 'x', at: serverTimestamp(), ...(extra || {}) });
  await check('a groups admin cannot record an exception', 'deny', () => setDoc(doc(ctx('u_gina'), 'smallGroupExceptions', 'sg_y18__m_ned'), EX('u_gina')));
  await check('an exception needs a real reason', 'deny', () => setDoc(doc(as('martin'), 'smallGroupExceptions', 'sg_y18__m_ned'), EX('u_martin', { reason: 'ok' })));
  await check('the safeguarding lead records an exception, with a reason', 'allow', () => setDoc(doc(ctx('u_sg'), 'smallGroupExceptions', 'sg_y18__m_ned'), EX('u_sg')));
  await check('then the leader may be added', 'allow', () => updateDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_y18'), { leaderIds: ['m_lena', 'm_ned'], lastLeaderAdded: 'm_ned' }));
  await check('the exception is for that group only', 'deny', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_y18b'), YG(['m_ned'])));
  await check('marking an existing group under-18s with an uncleared leader is refused', 'deny', () => updateDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_mem'), { under18: true, leaderIds: ['m_ned'] }));
  await check('a group that is not for under-18s takes any leader, as before', 'allow', () => updateDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_mem'), { leaderIds: ['m_ned'] }));

  /* §24 (Martin): "Works with under-18s" on an event or club - Kids Film Club.
     F-146: cleared in turn, three at a time, so any number can be ticked. */
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const id of ['ev_film', 'ev_puppet', 'ev_five']) await setDoc(doc(db, 'calEvents', id), { title: id + ' (invented)', location: { kind: 'room', siteId: 'site_kids' }, status: 'confirmed', audience: ['public'] });
    await setDoc(doc(db, 'leaderChecks', 'm_tia'), { name: 'Tia', dbsStatus: 'current', dbsSeen: ago(1), trainingDate: ago(4), siteId: '' });
    for (const m of ['m_c1', 'm_c2', 'm_c3', 'm_c4']) await setDoc(doc(db, 'leaderChecks', m), { name: m, dbsStatus: 'current', dbsSeen: ago(1), trainingDate: ago(1), siteId: '' });
  });
  const P_ = (id, role) => ({ uid: '', memberId: id, name: id, role: role || 'helper' });
  /* Everyone named, these cleared so far, these cleared in this save. */
  const U18 = (people, cleared, last, extra) => ({ leaders: people.map(x => P_(x)), leaderUids: [], leaderIds: people, siteId: 'site_kids', under18: true,
    clearedIds: cleared, lastCleared: last, ...(extra || {}) });
  const FILM = (people, extra) => U18(people, people, people, extra);
  const film = (who, d) => setDoc(doc(who, 'eventLeaders', 'ev_film'), d);
  await check('§24: KIDS FILM CLUB, TICKED, WITH A LEADER WHOSE CHECKS ARE IN DATE', 'allow', () => film(as('karen'), FILM(['m_lena'])));
  await check('§24: A KIDS FILM CLUB HELPER WITH EXPIRED TRAINING CANNOT BE ADDED', 'deny', () => film(as('karen'), U18(['m_lena', 'm_tia'], ['m_lena', 'm_tia'], ['m_tia'])));
  await check('§24: nor added without being cleared at all', 'deny', () => film(as('karen'), U18(['m_lena', 'm_tia'], ['m_lena'], [])));
  await check('§24: nor one with no checks at all', 'deny', () => film(as('karen'), U18(['m_lena', 'm_ned'], ['m_lena', 'm_ned'], ['m_ned'])));
  await check('§24: nor marked cleared without being checked in this save', 'deny', () => film(as('karen'), U18(['m_lena', 'm_tia'], ['m_lena', 'm_tia'], ['m_lena'])));
  await check('§24: nor by a member id list that says someone else', 'deny', () => film(as('karen'), { ...U18(['m_lena', 'm_lena'], ['m_lena'], []), leaders: [P_('m_lena'), P_('m_tia')] }));
  await check('§24: nor by unticking it, adding them, and ticking it again (ticking checks everyone afresh)', 'deny', async () => {
    await setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), { ...U18(['m_tia'], [], []), under18: false });
    return setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), FILM(['m_tia']));
  });
  await check('§24: unticking forgets who was cleared', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), { ...U18(['m_lena'], ['m_lena'], []), under18: false }));
  /* Five already named, one of them not cleared: no dead end. */
  const five = ['m_c1', 'm_c2', 'm_c3', 'm_c4', 'm_ned'];
  const FIVE = (who, cleared, last) => setDoc(doc(who, 'eventLeaders', 'ev_five'), U18(five, cleared, last));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'eventLeaders', 'ev_five'), { ...U18(five, [], []), under18: false }); });
  await check('§24 FIVE NAMED: TICKING THE BOX IS ACCEPTED (nobody cleared yet)', 'allow', () => FIVE(as('karen'), [], []));
  await check('§24 five: the first two are cleared in one save', 'allow', () => FIVE(as('karen'), ['m_c1', 'm_c2'], ['m_c1', 'm_c2']));
  await check('§24 five: not three in one save (the rules can only look up so much)', 'deny', () => FIVE(as('karen'), ['m_c1', 'm_c2', 'm_c3'], ['m_c1', 'm_c2', 'm_c3']));
  await check('§24 five: the next two in the next', 'allow', () => FIVE(as('karen'), ['m_c1', 'm_c2', 'm_c3', 'm_c4'], ['m_c3', 'm_c4']));
  await check('§24 five: Ned, with no checks, CANNOT be cleared', 'deny', () => FIVE(as('karen'), ['m_c1', 'm_c2', 'm_c3', 'm_c4', 'm_ned'], ['m_ned']));
  await check('§24 five: and nobody new can be named while it is ticked unless cleared', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_five'),
    U18(five.concat(['m_tia']), ['m_c1', 'm_c2', 'm_c3', 'm_c4'], [])));
  await check('§24 five: the way forward - Ned is removed', 'allow', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_five'),
    U18(['m_c1', 'm_c2', 'm_c3', 'm_c4'], ['m_c1', 'm_c2', 'm_c3', 'm_c4'], [])));
  const EEX = (who, extra) => ({ calEventId: 'ev_film', memberId: 'm_tia', name: 'Tia', reason: 'Training booked for next week; always with Lena (invented)', siteId: 'site_kids', by: who, byName: 'x', at: serverTimestamp(), ...(extra || {}) });
  await check('§24: an ordinary admin cannot record an exception', 'deny', () => setDoc(doc(as('karen'), 'eventExceptions', 'ev_film__m_tia'), EEX('u_karen')));
  await check('§24: an exception needs a real reason', 'deny', () => setDoc(doc(as('martin'), 'eventExceptions', 'ev_film__m_tia'), EEX('u_martin', { reason: 'ok' })));
  await check('§24: the safeguarding lead records an exception, with a reason (the F-109 route)', 'allow', () => setDoc(doc(ctx('u_sg'), 'eventExceptions', 'ev_film__m_tia'), EEX('u_sg')));
  await check('§24: then the helper may be added', 'allow', () => film(as('karen'), U18(['m_lena', 'm_tia'], ['m_lena', 'm_tia'], ['m_tia'])));
  await check('§24: the exception is for that event only', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), FILM(['m_tia'])));
  await check('§24: an event not ticked takes any helper, as before', 'allow', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), { ...U18(['m_tia', 'm_ned'], [], []), under18: false }));

  /* F-108 */
  await env.withSecurityRulesDisabled(async (c) => { const db = c.firestore();
    await setDoc(doc(db, 'users', 'u_office'), { memberId: 'm_office', status: 'active', teams: ['Welcome Team'], adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'bookingSettings', 'site_off'), { bookingsAdmins: ['m_office'], safeguardingLead: '', safeguardingDeputy: '' });
    await setDoc(doc(db, 'settings', 'accounts'), { mode: 'none', invoiceNumbersBy: 'hub', payText: 'Bank: invented', payDays: 14, officeSites: ['site_off'] }); });
  await check('F-108: an admin reads the accounts setting', 'allow', () => getDoc(doc(as('karen'), 'settings', 'accounts')));
  await check('F-108: so does the office (a bookings admin of a site it names)', 'allow', () => getDoc(doc(ctx('u_office'), 'settings', 'accounts')));
  await check('F-108: A MEMBER WHO IS NOT THE OFFICE DOES NOT', 'deny', () => getDoc(doc(as('samy'), 'settings', 'accounts')));
}

// ── EVENTS (events window) ── WHO CAN COME (Martin, NEXT-BRIEF §21): events, forms, small groups
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  const U = (db, uid, mid, o) => setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams: o.teams || [], adminFor: [], masterAdmin: false,
    attender: true, churchMember: !!o.churchMember });
  const EV = (audience, visibility) => ({ title: 'Who can come test', visibility, status: 'confirmed', audience, teams: visibility === 'team' ? audience : [],
    startUtc: Date.now() + 864e5 * 10, endUtc: Date.now() + 864e5 * 10 + 3600e3, createdBy: 'x' });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await U(db, 'u_att', 'm_att', {});
    await U(db, 'u_cm', 'm_cm', { churchMember: true });
    await U(db, 'u_vol', 'm_vol', { teams: ['Worship Team'] });
    await setDoc(doc(db, 'calEvents', 'ev_w_pub'), EV(['public', 'members'], 'public'));
    await setDoc(doc(db, 'calEvents', 'ev_w_att'), EV(['members'], 'members'));
    await setDoc(doc(db, 'calEvents', 'ev_w_cm'), EV(['churchMembers'], 'churchMembers'));
    await setDoc(doc(db, 'calEvents', 'ev_w_team'), EV(['Worship Team'], 'team'));
  });
  const list = (who, aud) => getDocs(query(collection(who, 'calEvents'), where('audience', 'array-contains-any', aud)));
  /* events */
  await check('Everyone: a public event is open to someone not signed in', 'allow', () => getDoc(doc(guest(), 'calEvents', 'ev_w_pub')));
  await check('an Attenders event is not', 'deny', () => getDoc(doc(guest(), 'calEvents', 'ev_w_att')));
  await check('an Attender sees the Attenders event', 'allow', () => getDoc(doc(ctx('u_att'), 'calEvents', 'ev_w_att')));
  await check('AN ATTENDER CANNOT SEE A CHURCH-MEMBERS-ONLY EVENT', 'deny', () => getDoc(doc(ctx('u_att'), 'calEvents', 'ev_w_cm')));
  await check('nor list Church-members-only events', 'deny', () => list(ctx('u_att'), ['churchMembers']));
  await check('an Attender\u2019s own list (public and Attenders) is allowed, and holds no members-only event', 'allow', async () => {
    const snap = await list(ctx('u_att'), ['public', 'members']);
    if (snap.docs.some(d => d.id === 'ev_w_cm')) throw new Error('a members-only event came back');
  });
  await check('a Church member sees it', 'allow', () => getDoc(doc(ctx('u_cm'), 'calEvents', 'ev_w_cm')));
  await check('and lists it with everything else they may come to', 'allow', async () => {
    const snap = await list(ctx('u_cm'), ['public', 'members', 'churchMembers']);
    if (!snap.docs.some(d => d.id === 'ev_w_cm')) throw new Error('the members-only event did not come back');
  });
  await check('a team event: not for an Attender on no team', 'deny', () => getDoc(doc(ctx('u_att'), 'calEvents', 'ev_w_team')));
  await check('but for that team', 'allow', () => getDoc(doc(ctx('u_vol'), 'calEvents', 'ev_w_team')));
  await check('a Church member on no team does not see a team event', 'deny', () => getDoc(doc(ctx('u_cm'), 'calEvents', 'ev_w_team')));
  await check('an admin makes a Church-members-only event', 'allow', () => setDoc(doc(as('karen'), 'calEvents', 'ev_w_cm2'), { ...EV(['churchMembers'], 'churchMembers'), createdBy: 'u_karen' }));
  await check('and cannot make it public by its audience while saying members only', 'deny', () => setDoc(doc(as('karen'), 'calEvents', 'ev_w_cm3'), { ...EV(['churchMembers', 'public'], 'churchMembers'), createdBy: 'u_karen' }));

  /* signing up: the sign-up rule is the main window's, and since F-115 it
     uses canSignUpTo(). These always run now: if the clause is ever taken
     out, they fail (they no longer skip). */
  {
    const SU = (calEventId, uid) => ({ calEventId, personKind: 'addressBook', personId: 'm_x', name: 'Test person', email: 'x@example.invalid', phone: '',
      attendees: [], answers: {}, places: 1, ticketTypeId: '', status: 'waiting', donation: 0, createdAt: 'x', memberUid: uid || '' });
    await check('SIGN-UP: AN ATTENDER CANNOT SIGN UP TO A CHURCH-MEMBERS-ONLY EVENT', 'deny', () => setDoc(doc(ctx('u_att'), 'signups', 'su_w_att_cm'.padEnd(32, '0')), SU('ev_w_cm', 'u_att')));
    await check('SIGN-UP: a Church member can', 'allow', () => setDoc(doc(ctx('u_cm'), 'signups', 'su_w_cm_cm'.padEnd(32, '0')), SU('ev_w_cm', 'u_cm')));
    await check('SIGN-UP: someone not signed in cannot sign up to an Attenders event', 'deny', () => setDoc(doc(guest(), 'signups', 'su_w_g_att'.padEnd(32, '0')), SU('ev_w_att')));
  }

  /* small groups */
  const SG = (canCome, visibility, extra) => ({ name: 'Members group', type: 'Prayer', open: true, capacity: 0, memberCount: 0, visibility, canCome, active: true,
    leaderIds: ['m_lena'], leaderNames: ['Lena'], locationKind: 'home', area: 'Esher', ...(extra || {}) });
  await check('a groups admin makes a Church-members-only group', 'allow', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_w_cm'), SG(['churchMembers'], 'churchMembers')));
  await check('its "who can come" must agree with its setting', 'deny', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_w_bad'), SG(['members'], 'churchMembers')));
  await check('a team group', 'allow', () => setDoc(doc(ctx('u_gina'), 'smallGroups', 'sg_w_team'), SG(['Worship Team'], 'team', { teams: ['Worship Team'] })));
  await check('AN ATTENDER DOES NOT SEE A CHURCH-MEMBERS-ONLY GROUP', 'deny', () => getDoc(doc(ctx('u_att'), 'smallGroups', 'sg_w_cm')));
  await check('nor can they ask to join it', 'deny', () => setDoc(doc(ctx('u_att'), 'smallGroupRequests', 'rq_w_att'), { groupId: 'sg_w_cm', groupName: 'x', name: 'Att', email: 'a@example.invalid',
    phone: '', message: '', personKind: 'addressBook', personId: 'm_att', status: 'asked', createdAt: serverTimestamp() }));
  await check('a Church member sees it, and asks to join', 'allow', async () => {
    await getDoc(doc(ctx('u_cm'), 'smallGroups', 'sg_w_cm'));
    await setDoc(doc(ctx('u_cm'), 'smallGroupRequests', 'rq_w_cm'), { groupId: 'sg_w_cm', groupName: 'x', name: 'Cm', email: 'c@example.invalid',
      phone: '', message: '', personKind: 'addressBook', personId: 'm_cm', status: 'asked', createdAt: serverTimestamp() });
  });
  await check('the group\u2019s leader always sees it', 'allow', () => getDoc(doc(ctx('u_lena'), 'smallGroups', 'sg_w_cm')));
  await check('a team group: not for an Attender on no team', 'deny', () => getDoc(doc(ctx('u_att'), 'smallGroups', 'sg_w_team')));
  await check('a Church member\u2019s list of groups they may come to', 'allow', () => getDocs(query(collection(ctx('u_cm'), 'smallGroups'), where('canCome', 'array-contains-any', ['public', 'members', 'churchMembers']))));

  /* forms */
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'forms', 'form_w_cm'), { title: 'Members\u2019 meeting reply', fields: [], siteId: '', team: '', canCome: ['churchMembers'] });
    for (const k of ['req_w_cm_a', 'req_w_cm_b', 'req_w_cm_c']) await setDoc(doc(db, 'formRequests', k.padEnd(32, '0')), { formId: 'form_w_cm', calEventId: '', siteId: '', email: 'cm@example.invalid', status: 'sent' });
  });
  const answer = (dbx, key, rid) => { const b = writeBatch(dbx);
    b.set(doc(dbx, 'formResponses', rid), { formId: 'form_w_cm', requestKey: key, calEventId: '', email: 'cm@example.invalid', name: 'Cm', siteId: '', answers: {},
      submittedAt: 'x', validUntil: '2027-10-09', deleteAfter: '2028-10-09' });
    b.update(doc(dbx, 'formRequests', key), { status: 'done', completedAt: 'x', responseId: rid }); return b.commit(); };
  await check('A CHURCH-MEMBERS-ONLY FORM CANNOT BE FILLED IN BY SOMEONE NOT SIGNED IN, even with the link', 'deny', () => answer(guest(), 'req_w_cm_a'.padEnd(32, '0'), 'resp_w_cm_a'));
  await check('nor by an Attender', 'deny', () => answer(ctx('u_att'), 'req_w_cm_b'.padEnd(32, '0'), 'resp_w_cm_b'));
  await check('a Church member fills it in', 'allow', () => answer(ctx('u_cm'), 'req_w_cm_c'.padEnd(32, '0'), 'resp_w_cm_c'));
}

// ── EVENTS (events window) ── maintenance jobs (the app's Maintenance space; F-123, A-M1)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', 'u_mt'), { uid: 'u_mt', memberId: 'm_mt', status: 'active', name: 'Mo Maintenance', teams: ['Maintenance'], adminFor: [], masterAdmin: false, attender: true });
  });
  const JOB = (who, extra) => ({ siteId: 'site_off', roomId: 'room_hall', where: 'Hall', what: 'Two lights out', details: 'Back of the hall (invented)', photoPath: '',
    status: 'todo', reportedBy: who, reportedByName: 'x', reportedAt: serverTimestamp(), ...(extra || {}) });
  await check('ANYONE SIGNED IN REPORTS A JOB (an Attender)', 'allow', () => setDoc(doc(ctx('u_att'), 'maintJobs', 'job_1'), JOB('u_att')));
  await check('with its photo\u2019s place named', 'allow', () => setDoc(doc(ctx('u_att'), 'maintJobs', 'job_2'), JOB('u_att', { photoPath: 'maintJobs/job_2/photo' })));
  await check('but not pointing at another job\u2019s photo', 'deny', () => setDoc(doc(ctx('u_att'), 'maintJobs', 'job_3'), JOB('u_att', { photoPath: 'maintJobs/job_1/photo' })));
  await check('nobody signed out reports one', 'deny', () => setDoc(doc(guest(), 'maintJobs', 'job_4'), JOB('')));
  await check('nor in someone else\u2019s name', 'deny', () => setDoc(doc(ctx('u_att'), 'maintJobs', 'job_5'), JOB('u_cm')));
  await check('nor already done', 'deny', () => setDoc(doc(ctx('u_att'), 'maintJobs', 'job_6'), JOB('u_att', { status: 'done' })));
  await check('everyone signed in sees the list', 'allow', () => getDocs(collection(ctx('u_cm'), 'maintJobs')));
  await check('the public do not', 'deny', () => getDocs(collection(guest(), 'maintJobs')));
  await check('the reporter adds detail while it is to do', 'allow', () => updateDoc(doc(ctx('u_att'), 'maintJobs', 'job_1'), { details: 'Both tubes (invented)', photoPath: 'maintJobs/job_1/photo' }));
  await check('AN ATTENDER CANNOT MARK A JOB DONE', 'deny', () => updateDoc(doc(ctx('u_att'), 'maintJobs', 'job_1'), { status: 'done', doneBy: 'u_att', doneByName: 'x', doneAt: serverTimestamp() }));
  await check('nor can someone else change the reporter\u2019s job', 'deny', () => updateDoc(doc(ctx('u_cm'), 'maintJobs', 'job_1'), { what: 'Something else' }));
  await check('the Maintenance team marks it done, in their own name', 'allow', () => updateDoc(doc(ctx('u_mt'), 'maintJobs', 'job_1'), { status: 'done', doneBy: 'u_mt', doneByName: 'Mo', doneAt: serverTimestamp(), doneNote: 'New tubes (invented)' }));
  await check('not in someone else\u2019s name', 'deny', () => updateDoc(doc(ctx('u_mt'), 'maintJobs', 'job_2'), { status: 'done', doneBy: 'u_att', doneByName: 'x', doneAt: serverTimestamp() }));
  await check('the office (a bookings admin of the job\u2019s site) marks one done too', 'allow', () => updateDoc(doc(ctx('u_office'), 'maintJobs', 'job_2'), { status: 'done', doneBy: 'u_office', doneByName: 'x', doneAt: serverTimestamp() }));
  await check('and the team opens one again', 'allow', () => updateDoc(doc(ctx('u_mt'), 'maintJobs', 'job_2'), { status: 'todo', doneNote: 'Still flickering' }));
  await check('a job is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'maintJobs', 'job_1')));
}

// ── EVENTS (events window) ── Close a room (the app's Maintenance "Rooms"; F-123, F-135, Martin A-M2)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  /* The office here is an admin: a later block re-makes u_lena with another member number. */
  const office_ = () => as('karen');
  const DAYS = ['2027-01-11', '2027-01-12', '2027-01-13'];
  const C = (who, extra) => ({ siteId: 'site_bk', roomId: 'room_band', roomName: 'Test Band Room', from: DAYS[0], to: DAYS[2], days: DAYS,
    reason: 'Repainting (invented)', status: 'on', by: who, byName: 'x', at: serverTimestamp(), ...(extra || {}) });
  const M = (cid, day, on, extra) => ({ closureId: cid, roomId: 'room_band', siteId: 'site_bk', day, on, ...(extra || {}) });
  const close = (dbx, cid, c, days) => { const x = writeBatch(dbx); x.set(doc(dbx, 'roomClosures', cid), c);
    (days || c.days).forEach(d => x.set(doc(dbx, 'roomClosedDays', 'room_band_' + d), M(cid, d, true))); return x.commit(); };
  await check('AN ATTENDER CANNOT CLOSE A ROOM', 'deny', () => close(ctx('u_att'), 'cl_att', C('u_att')));
  await check('THE MAINTENANCE TEAM CLOSES A ROOM for three days, with a reason', 'allow', () => close(ctx('u_mt'), 'cl_1', C('u_mt')));
  await check('not without a reason', 'deny', () => close(ctx('u_mt'), 'cl_2', C('u_mt', { reason: '' })));
  await check('nor for more than a month at once', 'deny', () => close(ctx('u_mt'), 'cl_3', C('u_mt', { to: '2027-03-01',
    days: Array.from({ length: 32 }, (_, i) => new Date(Date.UTC(2027, 0, 11 + i)).toISOString().slice(0, 10)).concat(['2027-03-01']) })));
  await check('a day’s marker only for a day the closure names', 'deny', () => setDoc(doc(ctx('u_mt'), 'roomClosedDays', 'room_band_2027-01-20'), M('cl_1', '2027-01-20', true)));
  await check('nor for another room', 'deny', () => setDoc(doc(ctx('u_mt'), 'roomClosedDays', 'room_hold_2027-01-12'), M('cl_1', '2027-01-12', true, { roomId: 'room_hold' })));
  const B = (day, extra) => ({ kind: 'member', status: 'requested', siteId: 'site_bk', roomId: 'room_band', groupId: '', day, startMin: 1080, endMin: 1140,
    startLocal: day + 'T18:00', endLocal: day + 'T19:00', setupMins: 0, packdownMins: 0, slotFrom: 72, slotTo: 76, title: 'Test band practice', people: 6, layout: '', av: { needed: false, what: '' },
    refreshments: { needed: false }, resources: [], notes: '', requester: { name: 'Samy', email: 'samy@example.invalid', phone: '', org: '' },
    memberUid: 'u_samy', memberName: 'Samy', createdAt: 'x', ...(extra || {}) });
  const K = (n) => ('bk_cl_' + n).padEnd(31, '0');
  const confirmed = (dbx, key, b) => { const x = writeBatch(dbx); x.set(doc(dbx, 'bookings', key), b);
    const sl = Array(96).fill(0); for (let i = b.slotFrom; i < b.slotTo; i++) sl[i] = 1;
    x.set(doc(dbx, 'roomDays', b.roomId + '_' + b.day), { slots: sl, lastBooking: key, roomId: b.roomId, day: b.day, siteId: b.siteId }); return x.commit(); };
  await check('A MEMBER CANNOT BOOK A CLOSED ROOM (it disappears from Book a room)', 'deny', () => confirmed(as('samy'), K('m_conf'), B('2027-01-12', { status: 'confirmed' })));
  await check('nor ask for it', 'deny', () => setDoc(doc(as('samy'), 'bookings', K('m_req')), B('2027-01-12')));
  await check('nor can the public', 'deny', () => setDoc(doc(anon(), 'bookings', K('p_req')), B('2027-01-12', { kind: 'hire', memberUid: '', memberName: '', people: 10,
    requester: { name: 'Hirer Synthetic', email: 'hirer@example.invalid', phone: '', org: '' } })));
  await check('the day after it opens again, it books as usual', 'allow', () => confirmed(as('samy'), K('m_after'), B('2027-01-14', { status: 'confirmed' })));
  const office = (key, extra) => confirmed(office_(), key, B('2027-01-13', { kind: 'office', status: 'confirmed', memberUid: '', ...(extra || {}) }));
  await check('the office cannot book a closed room without saying why', 'deny', () => office(K('o_plain')));
  await check('it may, as booking over something, with a reason', 'allow', () => office(K('o_over'), { override: true, decisionNote: 'Painters finish at noon (invented)' }));
  await check('anyone reads that a room is closed on a day (the public booking page)', 'allow', () => getDoc(doc(anon(), 'roomClosedDays', 'room_band_2027-01-12')));
  await check('but not why: the public cannot read the closure', 'deny', () => getDoc(doc(anon(), 'roomClosures', 'cl_1')));
  await check('anyone in the address book can', 'allow', () => getDoc(doc(ctx('u_att'), 'roomClosures', 'cl_1')));
  await check('a day cannot be opened again without lifting the closure', 'deny', () => setDoc(doc(ctx('u_mt'), 'roomClosedDays', 'room_band_2027-01-12'), M('cl_1', '2027-01-12', false)));
  const lift = (dbx, who) => { const x = writeBatch(dbx);
    x.update(doc(dbx, 'roomClosures', 'cl_1'), { status: 'lifted', liftedBy: who, liftedByName: 'x', liftedAt: serverTimestamp() });
    DAYS.forEach(d => x.set(doc(dbx, 'roomClosedDays', 'room_band_' + d), M('cl_1', d, false))); return x.commit(); };
  await check('an Attender cannot lift it', 'deny', () => lift(ctx('u_att'), 'u_att'));
  await check('THE OFFICE RECORDS THAT IT WARNED THE PEOPLE BOOKED', 'allow', () => updateDoc(doc(office_(), 'roomClosures', 'cl_1'), { warnedAt: serverTimestamp(), warnedBy: 'u_karen', warnedCount: 2 }));
  await check('the Maintenance team cannot say the office did', 'deny', () => updateDoc(doc(ctx('u_mt'), 'roomClosures', 'cl_1'), { warnedAt: serverTimestamp(), warnedBy: 'u_mt', warnedCount: 0 }));
  await check('the Maintenance team lifts it, and its days open', 'allow', () => lift(ctx('u_mt'), 'u_mt'));
  await check('then a member books it again', 'allow', () => confirmed(as('samy'), K('m_again'), B('2027-01-12', { status: 'confirmed' })));
  await check('a closure is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'roomClosures', 'cl_1')));
  await check('nor a day’s marker', 'deny', () => deleteDoc(doc(as('martin'), 'roomClosedDays', 'room_band_2027-01-12')));
}

// ── EVENTS (events window) ── leaders check themselves in on a Sunday (the app's Kids Church Today; F-120)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const TODAY = new Date().toISOString().slice(0, 10);
  const { Timestamp } = await import('firebase/firestore');
  /* The morning at site_kids: open it again for these checks (Lou and Jo lead groups; Sam is the rota's Session Leader). */
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'kidsMornings', 'site_kids_' + TODAY), { siteId: 'site_kids', day: TODAY, rotaId: 'rota_today', leaderIds: ['m_lou', 'm_jo', 'm_sid'],
      sessionLeaderIds: ['m_sam'], expiresAt: Timestamp.fromMillis(Date.now() + 8 * 3600e3), updatedAt: 'x', updatedBy: 'x' });
  });
  const IN = (mid, groupId, extra) => ({ siteId: 'site_kids', day: TODAY, memberId: mid, name: mid, groupId: groupId || '', state: 'in', inAt: serverTimestamp(), outAt: null, ...(extra || {}) });
  const ref = (who, mid) => doc(ctx(who), 'kidsLeaderIns', 'site_kids_' + TODAY + '_' + mid);
  await check('a group leader checks themselves in for the morning', 'allow', () => setDoc(ref('u_lou', 'm_lou'), IN('m_lou', 'grp_little')));
  await check('A LEADER CANNOT CHECK SOMEONE ELSE IN', 'deny', () => setDoc(ref('u_lou', 'm_jo'), IN('m_jo', 'grp_junior')));
  await check('a leader of this morning checks in without naming a group', 'allow', () => setDoc(ref('u_jo', 'm_jo'), IN('m_jo', '')));
  await check('the rota\u2019s Session Leader checks in', 'allow', () => setDoc(ref('u_sam', 'm_sam'), IN('m_sam')));
  await check('someone on Kids Church who leads nothing this morning cannot', 'deny', () => setDoc(ref('u_nat', 'm_nat'), IN('m_nat')));
  await check('nor with a time that is not now', 'deny', () => setDoc(ref('u_kim', 'm_kim'), IN('m_kim', '', { inAt: Timestamp.fromMillis(Date.now() - 3600e3) })));
  await check('a lead checks in', 'allow', () => setDoc(ref('u_kim', 'm_kim'), IN('m_kim')));
  const list = (who) => getDocs(query(collection(ctx(who), 'kidsLeaderIns'), where('siteId', '==', 'site_kids'), where('day', '==', TODAY)));
  await check('the leads see who is leading this morning', 'allow', () => list('u_kim'));
  await check('so does everyone leading this morning (for the count and the roll-call)', 'allow', () => list('u_lou'));
  await check('an admin of another team does not', 'deny', () => list('u_wes'));
  await check('a leader checks out', 'allow', () => updateDoc(ref('u_lou', 'm_lou'), { state: 'out', outAt: serverTimestamp() }));
  await check('but cannot check someone else out', 'deny', () => updateDoc(ref('u_lou', 'm_kim'), { state: 'out', outAt: serverTimestamp() }));
  await check('a leader\u2019s check-in is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'kidsLeaderIns', 'site_kids_' + TODAY + '_m_lou')));
}

// ── EVENTS (events window) ── church details (F-058)
{
  const D = (extra) => ({ name: 'Test Church', enquiryEmail: 'enquiries@example.invalid', logoUrl: '', logoPath: '', updatedAt: 'x', updatedBy: 'u_karen', ...(extra || {}) });
  await check('an admin sets the church details', 'allow', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D()));
  await check('anyone reads them, for the public pages', 'allow', () => getDoc(doc(anon(), 'churchSettings', 'details')));
  await check('a member cannot change them', 'deny', () => setDoc(doc(as('samy'), 'churchSettings', 'details'), D({ updatedBy: 'u_samy' })));
  await check('the enquiry address has to look like one', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ enquiryEmail: 'not an address' })));
  await check('there is one church details document', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'other'), D()));
}

// ── EVENTS (events window) ── room hire, R1
{
  await check('anyone reads a room’s profile when it is in use', 'allow', () => getDoc(doc(anon(), 'rooms', 'room_hire')));
  await check('the public lists the rooms in use, asking for them', 'allow', () => getDocs(query(collection(anon(), 'rooms'), where('active', '==', true))));
  await check('nobody without an account can change a room’s profile', 'deny', () => updateDoc(doc(anon(), 'rooms', 'room_hire'), { fireMax: 500 }));
  await check('a member cannot either', 'deny', () => updateDoc(doc(as('samy'), 'rooms', 'room_hire'), { fireMax: 500 }));
  await check('an admin changes a room’s profile', 'allow', () => updateDoc(doc(as('karen'), 'rooms', 'room_hire'), { fireMax: 85, layouts: { cabaret: 40, theatre: 80 } }));
  await check('anyone reads what is on the menu', 'allow', () => getDocs(query(collection(anon(), 'menus'), where('active', '==', true))));
  await check('but not what is off it', 'deny', () => getDoc(doc(anon(), 'menus', 'menu_old')));
  await check('the public cannot list the whole menu', 'deny', () => getDocs(collection(anon(), 'menus')));
  await check('an admin adds to the menu', 'allow', () => setDoc(doc(as('karen'), 'menus', 'menu_new'), { name: 'Test biscuits', unit: 'item', price: 2, active: true }));
  await check('a price cannot be below nothing', 'deny', () => setDoc(doc(as('karen'), 'menus', 'menu_bad'), { name: 'Test free money', unit: 'head', price: -5, active: true }));
  await check('a member cannot change the menu', 'deny', () => setDoc(doc(as('samy'), 'menus', 'menu_tea'), { name: 'Mine', unit: 'head', price: 0, active: true }));
}

// ── EVENTS (events window) ── sermons and "Listen" (F-124, F-132, F-138; Martin's option 3: read Val's feed)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  /* A feed episode exactly as the function (Admin SDK) writes it. */
  const FEEDEP = { title: 'Grace that scandalises (invented)', description: 'Invented notes.', date: '2025-09-07', pubDate: 'Sun, 07 Sep 2025 10:45:00 GMT',
    audioUrl: 'https://example.invalid/ep1.mp3', audioType: 'audio/mpeg', audioSize: 31000000, durationSec: 2050, imageUrl: '', guid: 'a1b2c3d4-0001-invented',
    source: 'feed', speaker: '', seriesId: '', book: '', passage: '', published: true, audioPath: '', feedSeenAt: 'x', createdAt: 'x', createdBy: 'feed', updatedAt: 'x', updatedBy: 'feed' };
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', 'u_preach'), { uid: 'u_preach', memberId: 'm_preach', status: 'active', name: 'Pat Preacher', teams: [], adminFor: [], masterAdmin: false, attender: true });
    await setDoc(doc(db, 'users', 'u_listen'), { uid: 'u_listen', memberId: 'm_listen', status: 'active', name: 'Lee Listener', teams: [], adminFor: [], masterAdmin: false, attender: true });
    await setDoc(doc(db, 'sermons', 'srm_draft'), { title: 'Draft (invented)', published: false, guid: 'egbc-sermon-srm_draft', source: 'upload' });
    await setDoc(doc(db, 'sermons', 'feed_ep1'), FEEDEP);
    await setDoc(doc(db, 'sermonShow', 'feedStatus'), { lastReadAt: 'x', ok: true, episodes: 1 });
  });
  const S = (id, who, extra) => ({ title: 'Ask boldly (invented)', speaker: 'Test Speaker', date: '2026-10-04', seriesId: '', book: 'Nehemiah', passage: '1:1-11',
    description: '', audioPath: '', audioType: '', audioSize: 0, durationSec: 0, audioUrl: '', published: false, guid: 'egbc-sermon-' + id, source: 'upload',
    createdAt: serverTimestamp(), createdBy: who, updatedAt: serverTimestamp(), updatedBy: who, ...(extra || {}) });
  const UP = (who, extra) => ({ updatedAt: serverTimestamp(), updatedBy: who, ...(extra || {}) });
  await check('a master admin uploads a sermon (the backup way)', 'allow', () => setDoc(doc(as('martin'), 'sermons', 'srm_1'), S('srm_1', 'u_martin')));
  await check('SOMEONE NOT NAMED CANNOT, not even an admin of another area', 'deny', () => setDoc(doc(as('karen'), 'sermons', 'srm_2'), S('srm_2', 'u_karen')));
  await check('a master admin names who may look after sermons', 'allow', () => setDoc(doc(as('martin'), 'sermonShow', 'access'), { memberIds: ['m_preach'], updatedAt: serverTimestamp(), updatedBy: 'u_martin' }));
  await check('nobody else can name themselves', 'deny', () => setDoc(doc(ctx('u_preach'), 'sermonShow', 'access'), { memberIds: ['m_preach', 'm_listen'], updatedAt: serverTimestamp(), updatedBy: 'u_preach' }));
  await check('the person named uploads one', 'allow', () => setDoc(doc(ctx('u_preach'), 'sermons', 'srm_2'), S('srm_2', 'u_preach')));
  await check('an upload’s episode id is its own', 'deny', () => setDoc(doc(ctx('u_preach'), 'sermons', 'srm_3'), S('srm_3', 'u_preach', { guid: 'egbc-sermon-srm_1' })));
  await check('NO PAGE CAN MAKE A FEED EPISODE (only the function reads the feed)', 'deny', () => setDoc(doc(ctx('u_preach'), 'sermons', 'feed_fake'), { ...FEEDEP, guid: 'fake-guid',
    createdAt: serverTimestamp(), createdBy: 'u_preach', updatedAt: serverTimestamp(), updatedBy: 'u_preach' }));
  await check('nor an upload that plays from somewhere else', 'deny', () => setDoc(doc(ctx('u_preach'), 'sermons', 'srm_4'), S('srm_4', 'u_preach', { audioUrl: 'https://example.invalid/x.mp3' })));
  await check('an upload is not shown without its audio', 'deny', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'srm_2'), UP('u_preach', { published: true })));
  await check('it is, once the audio is up and measured', 'allow', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'srm_2'),
    UP('u_preach', { published: true, audioPath: 'sermons/srm_2/audio', audioType: 'audio/mpeg', audioSize: 31000000, durationSec: 2040 })));
  await check('VAL OR AN ADMIN ADDS THE SERIES, PASSAGE AND SPEAKER TO A FEED EPISODE', 'allow', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'feed_ep1'),
    UP('u_preach', { seriesId: 'ser_luke', book: 'Luke', passage: '15:1-32', speaker: 'Jeanette (invented)' })));
  await check('and can hide one', 'allow', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'feed_ep1'), UP('u_preach', { published: false })));
  await check('BUT NOT CHANGE WHAT THE FEED OWNS: its title', 'deny', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'feed_ep1'), UP('u_preach', { title: 'Something else' })));
  await check('or its audio', 'deny', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'feed_ep1'), UP('u_preach', { audioUrl: 'https://example.invalid/other.mp3' })));
  await check('THE EPISODE ID NEVER CHANGES', 'deny', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'feed_ep1'), UP('u_preach', { guid: 'something-new' })));
  await check('nor can a feed episode be turned into an upload', 'deny', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'feed_ep1'), UP('u_preach', { source: 'upload' })));
  await check('shown again', 'allow', () => updateDoc(doc(ctx('u_preach'), 'sermons', 'feed_ep1'), UP('u_preach', { published: true })));
  await check('ANYONE, SIGNED IN OR NOT, READS A SHOWN SERMON', 'allow', () => getDoc(doc(guest(), 'sermons', 'feed_ep1')));
  await check('and lists the shown ones, asking for them', 'allow', () => getDocs(query(collection(ctx('u_listen'), 'sermons'), where('published', '==', true))));
  await check('A SERMON NOT SHOWN IS NOT SEEN by a listener', 'deny', () => getDoc(doc(ctx('u_listen'), 'sermons', 'srm_draft')));
  await check('nor by the public', 'deny', () => getDoc(doc(guest(), 'sermons', 'srm_draft')));
  await check('the person named sees it', 'allow', () => getDoc(doc(ctx('u_preach'), 'sermons', 'srm_draft')));
  await check('a listener cannot change a sermon', 'deny', () => updateDoc(doc(ctx('u_listen'), 'sermons', 'feed_ep1'), UP('u_listen', { seriesId: 'x' })));
  await check('a sermon is never deleted', 'deny', () => deleteDoc(doc(as('martin'), 'sermons', 'feed_ep1')));
  const FEEDSET = (who, url) => ({ url, updatedAt: serverTimestamp(), updatedBy: who });
  await check('the person named sets the feed address (from Val’s Spotify for Creators settings)', 'allow', () => setDoc(doc(ctx('u_preach'), 'sermonShow', 'feed'), FEEDSET('u_preach', 'https://anchor.example.invalid/s/abc123/podcast/rss')));
  await check('only a secure web address', 'deny', () => setDoc(doc(ctx('u_preach'), 'sermonShow', 'feed'), FEEDSET('u_preach', 'http://anchor.example.invalid/rss')));
  await check('a listener cannot change it', 'deny', () => setDoc(doc(ctx('u_listen'), 'sermonShow', 'feed'), FEEDSET('u_listen', 'https://elsewhere.example.invalid/rss')));
  await check('the last read is shown to the uploaders', 'allow', () => getDoc(doc(ctx('u_preach'), 'sermonShow', 'feedStatus')));
  await check('but only the function writes it', 'deny', () => setDoc(doc(ctx('u_preach'), 'sermonShow', 'feedStatus'), { ok: true }));
  await check('the person named adds a series', 'allow', () => setDoc(doc(ctx('u_preach'), 'sermonSeries', 'ser_luke'), { name: 'Luke (invented)', description: '', artworkPath: '', order: 1, updatedAt: serverTimestamp(), updatedBy: 'u_preach' }));
  await check('anyone reads the series', 'allow', () => getDocs(collection(guest(), 'sermonSeries')));
  const P = (extra) => ({ pos: 812.4, dur: 2040, done: false, at: serverTimestamp(), ...(extra || {}) });
  await check('A LISTENER’S PLACE IS KEPT for them', 'allow', () => setDoc(doc(ctx('u_listen'), 'listenProgress', 'u_listen', 'sermons', 'feed_ep1'), P()));
  await check('and read back on another phone', 'allow', () => getDoc(doc(ctx('u_listen'), 'listenProgress', 'u_listen', 'sermons', 'feed_ep1')));
  await check('NOBODY ELSE READS WHAT SOMEONE LISTENS TO, not even a master admin', 'deny', () => getDoc(doc(as('martin'), 'listenProgress', 'u_listen', 'sermons', 'feed_ep1')));
  await check('nor writes it', 'deny', () => setDoc(doc(ctx('u_preach'), 'listenProgress', 'u_listen', 'sermons', 'feed_ep1'), P()));
  await check('the place has its own shape', 'deny', () => setDoc(doc(ctx('u_listen'), 'listenProgress', 'u_listen', 'sermons', 'srm_1'), P({ pos: -3 })));
}

// ── EVENTS (events window) ── phone notifications (NEXT-BRIEF §23; F-144)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  const pend = () => asNewcomer('u_newparent', 'newparent@example.invalid');
  const TOK = 'fcm-invented-token-' + 'x'.repeat(120);
  const PT = (uid, extra) => ({ uid, token: TOK, platform: 'android', createdAt: serverTimestamp(), lastSeen: serverTimestamp(), ...(extra || {}) });
  await check('A PERSON REGISTERS THEIR OWN PHONE', 'allow', () => setDoc(doc(as('samy'), 'pushTokens', 'u_samy_abcdef1234'), PT('u_samy')));
  await check('NOBODY READS A PHONE’S TOKEN, not even its owner', 'deny', () => getDoc(doc(as('samy'), 'pushTokens', 'u_samy_abcdef1234')));
  await check('   not a master admin either', 'deny', () => getDoc(doc(as('martin'), 'pushTokens', 'u_samy_abcdef1234')));
  await check('   and nobody lists them', 'deny', () => getDocs(collection(as('martin'), 'pushTokens')));
  await check('NOBODY REGISTERS A PHONE IN SOMEONE ELSE’S NAME', 'deny', () => setDoc(doc(as('isla'), 'pushTokens', 'u_samy_zzzzzz9999'), PT('u_samy')));
  await check('   nor under someone else’s id with their own name', 'deny', () => setDoc(doc(as('isla'), 'pushTokens', 'u_samy_yyyyyy8888'), PT('u_isla')));
  /* The one that would let Isla's phone receive Samy's messages: her own record, his name. */
  await check('   NOR HER OWN PHONE RECORD IN SAMY’S NAME (to get his messages)', 'deny', () => setDoc(doc(as('isla'), 'pushTokens', 'u_isla_eeeeee5555'), PT('u_samy')));
  await check('   nor take over someone else’s phone record', 'deny', () => setDoc(doc(as('isla'), 'pushTokens', 'u_samy_abcdef1234'), PT('u_isla')));
  await check('a person refreshes their own phone (last seen now)', 'allow', () => updateDoc(doc(as('samy'), 'pushTokens', 'u_samy_abcdef1234'), { lastSeen: serverTimestamp() }));
  await check('the record has its own shape', 'deny', () => setDoc(doc(as('samy'), 'pushTokens', 'u_samy_bbbbbb2222'), PT('u_samy', { platform: 'fridge' })));
  await check('someone else cannot remove it', 'deny', () => deleteDoc(doc(as('isla'), 'pushTokens', 'u_samy_abcdef1234')));
  await check('the person turns it off (removes it)', 'allow', () => deleteDoc(doc(as('samy'), 'pushTokens', 'u_samy_abcdef1234')));
  await check('A PARENT NOT IN THE ADDRESS BOOK MAY STILL TURN ON A PHONE (Martin, N-6b)', 'allow', () => setDoc(doc(pend(), 'pushTokens', 'u_newparent_cccccc3333'), PT('u_newparent', { platform: 'iphone' })));
  await check('nobody signed out does', 'deny', () => setDoc(doc(guest(), 'pushTokens', 'x_dddddddd4444'), PT('x')));
  const PR = (extra) => ({ types: { callParent: true, rota: false }, quietFrom: '21:30', quietTo: '07:30', updatedAt: serverTimestamp(), ...(extra || {}) });
  await check('a person keeps their own switches', 'allow', () => setDoc(doc(as('samy'), 'notifyPrefs', 'u_samy'), PR()));
  await check('and reads them back', 'allow', () => getDoc(doc(as('samy'), 'notifyPrefs', 'u_samy')));
  await check('nobody else reads them', 'deny', () => getDoc(doc(as('martin'), 'notifyPrefs', 'u_samy')));
  await check('nor changes them', 'deny', () => setDoc(doc(as('isla'), 'notifyPrefs', 'u_samy'), PR()));
  await check('quiet hours must be times', 'deny', () => setDoc(doc(as('samy'), 'notifyPrefs', 'u_samy'), PR({ quietFrom: 'late' })));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'notifyLog', 'nl_1'), { type: 'callParent', siteId: 'site_kids', by: 'u_lena', phones: 2, at: 'x' }); });
  await check('the site’s safeguarding lead reads what was sent', 'allow', () => getDoc(doc(env.authenticatedContext('u_sg').firestore(), 'notifyLog', 'nl_1')));
  await check('a member does not', 'deny', () => getDoc(doc(as('samy'), 'notifyLog', 'nl_1')));
  await check('nobody writes the log from a page', 'deny', () => setDoc(doc(as('martin'), 'notifyLog', 'nl_2'), { type: 'test' }));
}

// ── EVENTS (events window) ── Parents' Sunday: a parent sees their own family on their phone (F-121, A-K1, N-6)
{
  const TODAY = new Date().toISOString().slice(0, 10);
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'kidsFamilies', 'fam_p'), { siteId: 'site_kids', parentName: 'Pat Parent', email: 'pat.parent@example.invalid', email2: 'sam.carer@example.invalid', familyCode: 'ABC234', collectors: ['Pat Parent'] });
    await setDoc(doc(db, 'kidsFamilies', 'fam_o'), { siteId: 'site_kids', parentName: 'Other Parent', email: 'other.parent@example.invalid', familyCode: 'XYZ789', collectors: [] });
    await setDoc(doc(db, 'kidsChildren', 'kc_p1'), { siteId: 'site_kids', familyId: 'fam_p', name: 'Ada Synthetic', groupId: 'kg_par', status: 'registered' });
    await setDoc(doc(db, 'kidsChildren', 'kc_o1'), { siteId: 'site_kids', familyId: 'fam_o', name: 'Otto Synthetic', groupId: 'kg_par', status: 'registered' });
    await setDoc(doc(db, 'checkins', 'ck_p1'), { kind: 'child', familyId: 'fam_p', siteId: 'site_kids', groupId: 'kg_par', day: TODAY, state: 'in', pickupCode: 'K7P2', name: 'Ada Synthetic' });
    await setDoc(doc(db, 'checkins', 'ck_o1'), { kind: 'child', familyId: 'fam_o', siteId: 'site_kids', groupId: 'kg_par', day: TODAY, state: 'in', pickupCode: 'Q9R3', name: 'Otto Synthetic' });
    await setDoc(doc(db, 'kidsMedical', 'kc_p1'), { siteId: 'site_kids', groupId: 'kg_par', allergies: 'invented' });
    await setDoc(doc(db, 'kidsGroups', 'kg_par'), { siteId: 'site_kids', name: 'Little ones', years: ['Year 1'], ratio: 5, leaderIds: ['m_x'] });
  });
  /* The sign-in email may carry capitals; the form's is kept in lower case. */
  const as_ = (uid, email, verified) => env.authenticatedContext(uid, { email, email_verified: verified !== false }).firestore();
  const pat = () => as_('u_pat', 'Pat.Parent@example.invalid');
  const sam = () => as_('u_samc', 'sam.carer@example.invalid');
  const fake = () => as_('u_fake', 'pat.parent@example.invalid', false);
  const stranger = () => as_('u_str', 'stranger@example.invalid');
  await check('A PARENT FINDS THEIR OWN FAMILY BY THEIR SIGN-IN EMAIL', 'allow', () => getDocs(query(collection(pat(), 'kidsFamilies'), where('email', '==', 'pat.parent@example.invalid'))));
  await check('and reads it', 'allow', () => getDoc(doc(pat(), 'kidsFamilies', 'fam_p')));
  await check('THE SECOND PARENT TOO, by the second email (N-6c)', 'allow', () => getDocs(query(collection(sam(), 'kidsFamilies'), where('email2', '==', 'sam.carer@example.invalid'))));
  await check('NOT ANOTHER FAMILY', 'deny', () => getDoc(doc(pat(), 'kidsFamilies', 'fam_o')));
  await check('   nor every family', 'deny', () => getDocs(collection(pat(), 'kidsFamilies')));
  await check('AN UNVERIFIED SIGN-IN WITH THE SAME ADDRESS GETS NOTHING', 'deny', () => getDoc(doc(fake(), 'kidsFamilies', 'fam_p')));
  await check('a stranger gets nothing', 'deny', () => getDoc(doc(stranger(), 'kidsFamilies', 'fam_p')));
  await check('the parent lists their own children', 'allow', () => getDocs(query(collection(pat(), 'kidsChildren'), where('familyId', '==', 'fam_p'))));
  await check('NOT ANOTHER FAMILY’S CHILD', 'deny', () => getDoc(doc(pat(), 'kidsChildren', 'kc_o1')));
  await check('this morning’s check-ins for their family, with the collection code', 'allow', () => getDocs(query(collection(pat(), 'checkins'), where('kind', '==', 'child'), where('familyId', '==', 'fam_p'), where('day', '==', TODAY))));
  await check('NOT ANOTHER FAMILY’S COLLECTION CODE', 'deny', () => getDoc(doc(pat(), 'checkins', 'ck_o1')));
  await check('   nor the whole morning', 'deny', () => getDocs(query(collection(pat(), 'checkins'), where('kind', '==', 'child'), where('day', '==', TODAY))));
  await check('the medical copy stays with the leaders', 'deny', () => getDoc(doc(pat(), 'kidsMedical', 'kc_p1')));
  await check('a parent changes nothing here', 'deny', () => updateDoc(doc(pat(), 'kidsFamilies', 'fam_p'), { familyCode: 'AAAAAA' }));
  await check('a verified parent reads a group’s name', 'allow', () => getDoc(doc(pat(), 'kidsGroups', 'kg_par')));
  await check('an unverified sign-in does not', 'deny', () => getDoc(doc(fake(), 'kidsGroups', 'kg_par')));
}
// ── end EVENTS ──
// ── end EVENTS ──

/* ---- the four levels (NEXT-BRIEF 21) -------------------------------
   The thing to prove is not that an Attender can do the new things. It is
   that widening status 'active' from "on a team" to "in the address book"
   did NOT hand the volunteers' material to the whole church - which is what
   it would have done, at 72 call sites, had they not been changed to
   volunteer() in the same commit. */

await check('an Attender is let in at all', 'allow', () => getDoc(doc(as('attender'), 'users', 'u_attender')));
await check('an Attender reads the hub page registry', 'allow', () => getDoc(doc(as('attender'), 'hubPages', 'p1')));
await check('an Attender reads the news', 'allow', () => getDoc(doc(as('attender'), 'news', 'n1')));
/* bookIsMine checks the verified address on the record, so the context has
   to carry one - as() alone has no email in its token. */
await check('an Attender reads their OWN address book record', 'allow',
  () => getDoc(doc(asNewcomer('u_attender', 'attender@example.invalid'), 'addressBook', 'm_u_attender')));

await check('an Attender cannot list the address book', 'deny', () => getDocs(collection(as('attender'), 'addressBook')));
await check('an Attender cannot read somebody else\'s record', 'deny', () => getDoc(doc(as('attender'), 'addressBook', 'm_u_samy')));
await check('an Attender cannot read the rota', 'deny', () => getDoc(doc(as('attender'), 'events', 'e1')));
await check('an Attender cannot read who can serve when', 'deny', () => getDoc(doc(as('attender'), 'availability', 'a1')));
await check('an Attender cannot read the song library', 'deny', () => getDoc(doc(as('attender'), 'songs', 'sg1')));
await check('an Attender cannot read a service plan', 'deny', () => getDoc(doc(as('attender'), 'services', 's1')));
await check('an Attender cannot read the AV knowledge base', 'deny', () => getDoc(doc(as('attender'), 'kb_howto_av', 'kb1')));
await check('an Attender cannot read the hirer contacts', 'deny', () => getDoc(doc(as('attender'), 'contacts', 'c_guest')));
await check('an Attender cannot read another person\'s user record', 'deny', () => getDoc(doc(as('attender'), 'users', 'u_samy')));
await check('an Attender cannot scribble on the practice copies', 'deny', () => setDoc(doc(as('attender'), 'training_portal', 'tp_x'), { note: 'hello' }));

await check('a volunteer still lists the address book', 'allow', () => getDocs(collection(as('samy'), 'addressBook')));
await check('a volunteer still reads the rota', 'allow', () => getDoc(doc(as('samy'), 'events', 'e1')));
await check('an admin who is on no team still reads the rota', 'allow', () => getDoc(doc(as('karen'), 'events', 'e1')));

/* The tick itself. Nothing in the rules turns on isChurchMember() yet - the
   CMM room is a page, not a collection - so what is proved here is that the
   mirror cannot be forged, which is the part that would matter. */
/* BOTH CLIENT SHAPES. The new egbc-auth.js writes attender and
   churchMember; a browser still holding the old one writes neither, and
   must not be locked out for it. Both are proved, because only one of them
   was, and the two that broke were the old shape. */
await check('a new sign-in with the new shape is allowed', 'allow',
  () => setDoc(doc(asNewcomer('u_fresh', 'attender2@example.invalid'), 'users', 'u_fresh'), {
    uid: 'u_fresh', email: 'attender2@example.invalid', name: 'Fresh Synthetic',
    memberId: 'm_attender2', teams: [], adminFor: [], masterAdmin: false,
    attender: true, churchMember: false, status: 'active', linkedBy: 'auto' }));
await check('a CACHED client, writing neither field, is still allowed in', 'allow',
  () => setDoc(doc(asNewcomer('u_cached', 'attender3@example.invalid'), 'users', 'u_cached'), {
    uid: 'u_cached', email: 'attender3@example.invalid', name: 'Cached Synthetic',
    memberId: 'm_attender3', teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    status: 'active', linkedBy: 'auto' }));
await check('but it cannot smuggle a wrong tick in while it is there', 'deny',
  () => setDoc(doc(asNewcomer('u_cached2', 'attender3@example.invalid'), 'users', 'u_cached2'), {
    uid: 'u_cached2', email: 'attender3@example.invalid', name: 'Cached Synthetic',
    memberId: 'm_attender3', teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    churchMember: true, status: 'active', linkedBy: 'auto' }));

await check('an Attender cannot award themselves the Church member tick', 'deny',
  () => setDoc(doc(as('attender'), 'users', 'u_attender'), {
    uid: 'u_attender', email: 'attender@example.invalid', name: 'Attender Synthetic',
    memberId: 'm_u_attender', teams: [], adminFor: [], masterAdmin: false,
    attender: true, churchMember: true, status: 'active', linkedBy: 'auto' }));
await check('nor claim to be an Attender on an archived record', 'deny',
  () => setDoc(doc(asNewcomer('u_gone', 'gone@example.invalid'), 'users', 'u_gone'), {
    uid: 'u_gone', email: 'gone@example.invalid', name: 'Gone Synthetic',
    memberId: 'm_gone', teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    attender: true, churchMember: true, status: 'active', linkedBy: 'auto' }));
await check('an archived person mirrors as pending, not Attender', 'allow',
  () => setDoc(doc(asNewcomer('u_gone', 'gone@example.invalid'), 'users', 'u_gone'), {
    uid: 'u_gone', email: 'gone@example.invalid', name: 'Gone Synthetic',
    memberId: 'm_gone', teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    attender: false, churchMember: false, status: 'active', linkedBy: 'auto' }));

/* ---- the projection PC (ChurchShow, R4 of FINDINGS-churchshow.md) ----
   The claim is set by the pairing function with the Admin SDK, so it cannot
   be forged from a page - but that is a statement about the Admin SDK, not
   about these rules, so what is proved here is the rest: the device reads
   the three things it needs, writes nothing anywhere, and stops the moment
   somebody presses Disconnect on the hub. */

const device = (uid, siteId) => env.authenticatedContext(uid,
  { device: 'churchshow', siteId }).firestore();
const csMain = () => device('churchshow-site_main', 'site_main');
const csOff = () => device('churchshow-site_old', 'site_old');

await check('the projection PC reads a service plan', 'allow', () => getDoc(doc(csMain(), 'services', 's1')));
/* songSummaries HAD NO RULE AT ALL, so the catch-all refused it - and three
   pages use it: SundayServicePlanner writes it, youthserviceplanner writes
   it, song-summary reads it. All three would have stopped the day the rules
   were deployed. Found while answering ChurchShow's question about whether
   anything still writes it. A-047. */
await check('and the song list for a Sunday, which is its fallback', 'allow', () => getDoc(doc(csMain(), 'songSummaries', '2026-10-11')));
await check('and the songs', 'allow', () => getDoc(doc(csMain(), 'songs', 'sg_cs')));
await check('and the rota, which this commit shut to everyone else', 'allow', () => getDoc(doc(csMain(), 'events', 'e1')));

await check('but NOT the address book - rules cannot hide fields', 'deny', () => getDoc(doc(csMain(), 'addressBook', 'm_u_samy')));
await check('nor who can serve when', 'deny', () => getDoc(doc(csMain(), 'availability', 'a1')));
await check('nor anybody’s account', 'deny', () => getDoc(doc(csMain(), 'users', 'u_samy')));
await check('nor the pairing codes', 'deny', () => getDoc(doc(csMain(), 'deviceCodes', 'ab'.repeat(32))));
await check('nor its own device record', 'deny', () => getDoc(doc(csMain(), 'devices', 'churchshow-site_main')));

await check('IT MAY WRITE NOTHING: not a song', 'deny', () => setDoc(doc(csMain(), 'songs', 'sg_cs'), { title: 'Changed' }));
await check('not a service plan', 'deny', () => setDoc(doc(csMain(), 'services', 's1'), { date: 'x' }));
await check('not the rota', 'deny', () => setDoc(doc(csMain(), 'events', 'e1'), { date: 'x' }));
await check('not its own device record, to switch itself back on', 'deny',
  () => setDoc(doc(csMain(), 'devices', 'churchshow-site_main'), { active: true }));

/* Disconnect on the hub sets active:false. An ID token already issued stays
   valid for up to an hour, so if the rules trusted the claim alone this
   would still be reading on Sunday evening. */
await check('DISCONNECTED: a switched-off device reads nothing', 'deny', () => getDoc(doc(csOff(), 'services', 's1')));
await check('nor the songs', 'deny', () => getDoc(doc(csOff(), 'songs', 'sg_cs')));
await check('nor the rota', 'deny', () => getDoc(doc(csOff(), 'events', 'e1')));

/* A device uid with no device document at all - a token from before the
   record was written, or a uid somebody guessed. */
await check('a device with no record at all reads nothing', 'deny',
  () => getDoc(doc(device('churchshow-site_ghost', 'site_ghost'), 'services', 's1')));

/* And the other way round: the claim is what grants this, not being signed
   in - so an ordinary member without it gains nothing from the new clause,
   and an Attender still cannot read the service plan. */
await check('a signed-in member without the claim gains nothing new', 'deny', () => getDoc(doc(as('attender'), 'services', 's1')));
await check('a volunteer reads the song list for a Sunday', 'allow', () => getDoc(doc(as('samy'), 'songSummaries', '2026-10-11')));
await check('an Attender does not', 'deny', () => getDoc(doc(as('attender'), 'songSummaries', '2026-10-11')));
await check('nor a stranger', 'deny', () => getDoc(doc(anon(), 'songSummaries', '2026-10-11')));
await check('a worship admin writes it, which is what the planner does', 'allow',
  () => setDoc(doc(as('martin'), 'songSummaries', '2026-10-18'), { date: '2026-10-18', items: [] }));
await check('an ordinary volunteer cannot', 'deny',
  () => setDoc(doc(as('isla'), 'songSummaries', '2026-10-25'), { date: '2026-10-25', items: [] }));
await check('an admin can see what is paired', 'allow', () => getDoc(doc(as('martin'), 'devices', 'churchshow-site_main')));
await check('a volunteer cannot', 'deny', () => getDoc(doc(as('samy'), 'devices', 'churchshow-site_main')));
await check('and nobody reads a pairing code, ever', 'deny', () => getDoc(doc(as('martin'), 'deviceCodes', 'ab'.repeat(32))));

/* ---- youth access (the reviewing window's launch blocker) ----------
   youthGranted() was defined in these rules and used by nothing, so a young
   person's phone - an anonymous account plus a youthAccess document - was
   refused every collection youthapp2.html reads. The app would have opened
   and shown an empty shell.

   Four states, and only one of them is let in. YOUTH-ACCESS.md. */

const youth = (uid) => env.authenticatedContext(uid, { provider_id: 'anonymous' }).firestore();
const youthOk = () => youth('u_youth_ok');
const youthExpired = () => youth('u_youth_expired');
const youthOff = () => youth('u_youth_off');
const youthNone = () => youth('u_youth_none');

await check('a young person with a live code reads the song library', 'allow', () => getDocs(collection(youthOk(), 'songs')));
await check('and one song', 'allow', () => getDoc(doc(youthOk(), 'songs', 'sg1')));
await check('and the service plans', 'allow', () => getDocs(collection(youthOk(), 'services')));
await check('and which services there are, to pick one', 'allow', () => getDocs(collection(youthOk(), 'events')));
await check('and the welcome panel', 'allow', () => getDoc(doc(youthOk(), 'portal', 'dashboardContent')));
await check('and the YOUTH pin board', 'allow', () => getDoc(doc(youthOk(), 'worshipBoardState', 'youth')));
await check('and a published article', 'allow',
  () => getDocs(query(collection(youthOk(), 'kb_playthrough'), where('published', '==', true))));
await check('and the training one', 'allow',
  () => getDocs(query(collection(youthOk(), 'kb_training_worship'), where('published', '==', true))));
await check('and their own access record, so the app can greet them', 'allow',
  () => getDoc(doc(youthOk(), 'youthAccess', 'u_youth_ok')));

/* THE ONE THAT MATTERS MOST. */
await check('BUT NEVER THE ADDRESS BOOK - not one record', 'deny', () => getDoc(doc(youthOk(), 'addressBook', 'm_u_samy')));
await check('nor a list of it', 'deny', () => getDocs(collection(youthOk(), 'addressBook')));
await check('nor the worship team\'s board', 'deny', () => getDoc(doc(youthOk(), 'worshipBoardState', 'state')));
await check('nor the Kids Church board', 'deny', () => getDoc(doc(youthOk(), 'worshipBoardState', 'kids-church')));
await check('nor an unpublished article', 'deny', () => getDoc(doc(youthOk(), 'kb_playthrough', 'kb_draft')));
await check('nor a list that does not ask for published == true', 'deny', () => getDocs(collection(youthOk(), 'kb_playthrough')));
await check('nor the rest of the older shared content', 'deny', () => getDoc(doc(youthOk(), 'portal', 'p_other')));
await check('nor who can serve when', 'deny', () => getDoc(doc(youthOk(), 'availability', 'a1')));
await check('nor anybody\'s account', 'deny', () => getDoc(doc(youthOk(), 'users', 'u_samy')));
await check('nor another young person\'s access record', 'deny', () => getDoc(doc(youthOk(), 'youthAccess', 'u_youth_expired')));
await check('nor the news', 'deny', () => getDoc(doc(youthOk(), 'news', 'n1')));
await check('nor the Sunday song list, which the youth app does not use', 'deny', () => getDoc(doc(youthOk(), 'songSummaries', '2026-10-11')));
await check('nor the resource shelf', 'deny', () => getDoc(doc(youthOk(), 'resources', 'r1')));

/* READ ONLY, everywhere. Saving a plan has always needed
   canAct('Youth Worship'), so this takes nothing away - it says so. */
await check('IT WRITES NOTHING: not a service plan', 'deny', () => setDoc(doc(youthOk(), 'services', 's1'), { date: '2026-01-01' }));
await check('not a new service plan either', 'deny', () => setDoc(doc(youthOk(), 'services', 's_new_youth'), { date: '2026-01-01' }));
await check('not a song', 'deny', () => setDoc(doc(youthOk(), 'songs', 'sg1'), { title: 'Mine now' }));
await check('not the youth board it can read', 'deny', () => setDoc(doc(youthOk(), 'worshipBoardState', 'youth'), { notes: [] }));
await check('not its own access record, to extend itself', 'deny',
  () => updateDoc(doc(youthOk(), 'youthAccess', 'u_youth_ok'), { expiresAt: new Date(Date.now() + 1e11) }));
await check('and not the rota', 'deny', () => setDoc(doc(youthOk(), 'events', 'e1'), { date: 'x' }));

/* THE OTHER THREE STATES. */
await check('AN EXPIRED CODE gets nothing', 'deny', () => getDocs(collection(youthExpired(), 'songs')));
await check('and nothing from the services', 'deny', () => getDocs(collection(youthExpired(), 'services')));
await check('A CANCELLED CODE gets nothing', 'deny', () => getDocs(collection(youthOff(), 'songs')));
await check('and nothing from the youth board', 'deny', () => getDoc(doc(youthOff(), 'worshipBoardState', 'youth')));
await check('NO CODE AT ALL gets nothing', 'deny', () => getDocs(collection(youthNone(), 'songs')));
await check('and cannot read the board', 'deny', () => getDoc(doc(youthNone(), 'worshipBoardState', 'youth')));
await check('nor write itself an access record', 'deny',
  () => setDoc(doc(youthNone(), 'youthAccess', 'u_youth_none'), {
    grantCode: 'EEEE-5555', active: true, expiresAt: new Date(Date.now() + 1e11) }));

/* ---- the parent requirement, now in the rules (Martin) -------------
   "No young person gets in without a parent receiving the code" was held by
   hub-app.js alone: it looks up the household head and refuses to send
   without an address. The rule was `allow create: if isAdmin()`, so an admin
   could write a grant by hand for a child with nobody behind them - A-045.

   Every one of these is written DIRECTLY, as a master admin, which is the
   only way the old rule could be got round. */

const aGrant = (over) => Object.assign({
  memberId: 'ab_child', parentId: 'ab_parent', memberName: 'Child Synthetic',
  sentTo: 'parent.synth@example.invalid', issuedBy: 'u_martin',
  redeemedAt: null, uid: null, active: true
}, over || {});

await check('a code for a child, sent to their household, is allowed', 'allow',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0001'), aGrant()));

/* THE BREAK MARTIN NAMED. */
await check('A CODE WITH NO PARENT IS REFUSED, written directly by an admin', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0002'), aGrant({ parentId: '' })));
await check('and so is one with the parent left out altogether', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0003'), {
    memberId: 'ab_child', memberName: 'Child Synthetic',
    sentTo: 'parent.synth@example.invalid', issuedBy: 'u_martin',
    redeemedAt: null, uid: null, active: true }));

await check('a parent who is not in the address book is refused', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0004'),
    aGrant({ parentId: 'ab_not_a_record' })));
await check('a parent with no email address on file is refused', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0005'),
    aGrant({ memberId: 'ab_child_orphan', parentId: 'ab_parent_noemail', sentTo: '' })));
await check('a child with no household is refused', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0006'),
    aGrant({ memberId: 'ab_child_nohome' })));

/* The one that matters most after "no parent": naming a real parent who is
   not THIS child's, which is how a code could be sent to the wrong house. */
await check('somebody else\'s parent is refused', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0007'),
    aGrant({ parentId: 'ab_grownup', sentTo: 'grownup@example.invalid' })));

/* And the address has to be the one the church holds, not one typed in. */
await check('sending it anywhere but the parent\'s own address is refused', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0008'),
    aGrant({ sentTo: 'somewhere.else@example.invalid' })));

await check('and a code for a grown-up is refused - codes are for children', 'deny',
  () => setDoc(doc(as('martin'), 'youthGrants', 'PAR1-0009'),
    aGrant({ memberId: 'ab_grownup', parentId: 'ab_parent' })));

await check('a volunteer cannot write a grant at all', 'deny',
  () => setDoc(doc(as('samy'), 'youthGrants', 'PAR1-0010'), aGrant()));
await check('nor can a young person with a code', 'deny',
  () => setDoc(doc(youthOk(), 'youthGrants', 'PAR1-0011'), aGrant()));

/* REDEEMING. The code is the document id, so a direct get is the redemption
   and listing is shut - nobody can fish for a live one. */
/* REDEEMING IS A FUNCTION NOW (Martin's second follow-up), so these say the
   opposite of what they used to. The grant holds `sentTo` - the parent's
   email address - and was `allow get: if true` because the page looked a
   code up before anybody was signed in, so anybody holding a code could
   read a parent's address off it (A-045). redeemYouthCode does the lookup
   with the Admin SDK, which does not come through these rules. */
await check('A CODE CANNOT BE READ BY SOMEBODY HOLDING IT ANY MORE', 'deny', () => getDoc(doc(anon(), 'youthGrants', 'DDDD-4444')));
await check('nor by a young person signed in with another code', 'deny', () => getDoc(doc(youthOk(), 'youthGrants', 'DDDD-4444')));
await check('nor by a volunteer', 'deny', () => getDoc(doc(as('samy'), 'youthGrants', 'DDDD-4444')));
await check('an admin reads one, for the hub\u2019s youth panel', 'allow', () => getDoc(doc(as('martin'), 'youthGrants', 'DDDD-4444')));
await check('but the grants cannot be listed', 'deny', () => getDocs(collection(anon(), 'youthGrants')));
await check('an admin lists them', 'allow', () => getDocs(collection(as('martin'), 'youthGrants')));
/* The phone used to do this in three steps - read the grant, write this,
   burn the grant. The middle one is refused outright now; one function
   does all three in a transaction. */
await check('A PHONE CANNOT WRITE ITSELF AN ACCESS RECORD, even with a live code', 'deny',
  () => setDoc(doc(youthNone(), 'youthAccess', 'u_youth_none'), {
    memberId: 'm_young4', memberName: 'Waiting Synthetic', grantCode: 'DDDD-4444',
    redeemedAt: serverTimestamp(), expiresAt: new Date(Date.now() + 1e11), active: true }));
await check('a code already used cannot be redeemed again', 'deny',
  () => setDoc(doc(youth('u_youth_second'), 'youthAccess', 'u_youth_second'), {
    memberId: 'm_young5', memberName: 'Used Synthetic', grantCode: 'EEEE-5555',
    redeemedAt: serverTimestamp(), expiresAt: new Date(Date.now() + 1e11), active: true }));
await check('and a phone cannot burn a code either', 'deny',
  () => updateDoc(doc(youthNone(), 'youthGrants', 'DDDD-4444'), {
    redeemedAt: serverTimestamp(), uid: 'u_youth_none' }));
await check('nor can an access record be written for somebody else\'s uid', 'deny',
  () => setDoc(doc(youth('u_youth_third'), 'youthAccess', 'u_youth_ok'), {
    memberId: 'm_young4', grantCode: 'DDDD-4444', active: true,
    expiresAt: new Date(Date.now() + 1e11) }));

/* And the other way round: a youth code is not a back door to anything a
   volunteer has, and a volunteer does not become a young person. */
await check('a volunteer still reads the worship board', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'state')));
await check('an Attender cannot read the youth board', 'deny', () => getDoc(doc(as('attender'), 'worshipBoardState', 'youth')));

/* ---- the pin boards: who sees, who posts (Martin, 9 Oct 2026) ------
   Five boards now. Three were there; Kids Church has been narrowed to its
   leaders, and ReNu and Lazers are new and moderated.

   A board is ONE document holding every note (stickynotes.html does
   `BOARD_DOC.set({ pages, notes })`), so a young person cannot be allowed to
   write one - they would be rewriting everybody else's notes. Their posts go
   in boardSuggestions, one document each, which only the group's adults can
   read. "Waits for a leader before others see it" is therefore true by
   construction: until a leader copies it onto the board, it is not on the
   board. */

const renuYouth = () => youth('u_youth_renu');
const lazersYouth = () => youth('u_youth_lazers');

/* WHO SEES WHAT. Five boards, and every one of them is somebody's. */
await check('the worship team sees the worship board', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'state')));
await check('and writes it', 'allow', () => setDoc(doc(as('samy'), 'worshipBoardState', 'state'), { notes: [], pages: [] }));

await check('KIDS CHURCH IS LEADERS ONLY NOW: its admin sees it', 'allow', () => getDoc(doc(as('karen'), 'worshipBoardState', 'kids-church')));
await check('and an ordinary Kids Church member does NOT', 'deny', () => getDoc(doc(as('samy'), 'worshipBoardState', 'kids-church')));
await check('nor writes it', 'deny', () => setDoc(doc(as('samy'), 'worshipBoardState', 'kids-church'), { notes: [] }));

await check('a ReNu leader sees the ReNu board', 'allow', () => getDoc(doc(as('renuLead'), 'worshipBoardState', 'renu')));
await check('and writes it, so they can put a post up', 'allow', () => setDoc(doc(as('renuLead'), 'worshipBoardState', 'renu'), { notes: [], pages: [] }));
await check('a ReNu child sees it', 'allow', () => getDoc(doc(renuYouth(), 'worshipBoardState', 'renu')));
await check('AND CANNOT WRITE IT - that is the whole reason for the queue', 'deny', () => setDoc(doc(renuYouth(), 'worshipBoardState', 'renu'), { notes: [] }));
await check('a Lazers child cannot see the ReNu board', 'deny', () => getDoc(doc(lazersYouth(), 'worshipBoardState', 'renu')));
await check('nor the worship team’s', 'deny', () => getDoc(doc(lazersYouth(), 'worshipBoardState', 'state')));
await check('nor Kids Church’s', 'deny', () => getDoc(doc(lazersYouth(), 'worshipBoardState', 'kids-church')));
await check('a Lazers child sees the Lazers board', 'allow', () => getDoc(doc(lazersYouth(), 'worshipBoardState', 'lazers')));
await check('and a young person in no group sees neither', 'deny', () => getDoc(doc(youthOk(), 'worshipBoardState', 'lazers')));
await check('an Attender sees none of them', 'deny', () => getDoc(doc(as('attender'), 'worshipBoardState', 'renu')));
await check('and a stranger certainly not', 'deny', () => getDoc(doc(anon(), 'worshipBoardState', 'renu')));

/* WHO POSTS. A post is a suggestion until a leader puts it up. */
const aPost = (over) => Object.assign({
  boardId: 'renu', text: 'Can we do the bake sale again?',
  firstName: 'Ada', byUid: 'u_youth_renu', createdAt: new Date()
}, over || {});

await check('a ReNu child posts a suggestion', 'allow',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p1'), aPost()));
await check('and sees their own back, so the app can say it is waiting', 'allow',
  () => getDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p1')));
await check('A LEADER SEES THE QUEUE', 'allow',
  () => getDocs(query(collection(as('renuLead'), 'boardSuggestions'), where('boardId', '==', 'renu'))));
await check('ANOTHER CHILD DOES NOT SEE IT until a leader puts it up', 'deny',
  () => getDoc(doc(youth('u_youth_renu2'), 'boardSuggestions', 'renu__p1')));
await check('nor can a child list the queue', 'deny',
  () => getDocs(query(collection(renuYouth(), 'boardSuggestions'), where('boardId', '==', 'renu'))));
await check('a Lazers child cannot post to ReNu', 'deny',
  () => setDoc(doc(lazersYouth(), 'boardSuggestions', 'renu__p2'), aPost({ byUid: 'u_youth_lazers' })));
await check('a young person in no group cannot post at all', 'deny',
  () => setDoc(doc(youthOk(), 'boardSuggestions', 'renu__p3'), aPost({ byUid: 'u_youth_ok' })));
await check('an expired code cannot post', 'deny',
  () => setDoc(doc(youthExpired(), 'boardSuggestions', 'renu__p4'), aPost({ byUid: 'u_youth_expired' })));
await check('nor a cancelled one', 'deny',
  () => setDoc(doc(youthOff(), 'boardSuggestions', 'renu__p5'), aPost({ byUid: 'u_youth_off' })));
await check('nor a stranger', 'deny',
  () => setDoc(doc(anon(), 'boardSuggestions', 'renu__p6'), aPost({ byUid: 'nobody' })));

/* NO SURNAMES, NO CONTACT DETAILS. The rules hold the shape; the moderation
   holds the free text, which is what moderation is for. */
await check('a post cannot carry a surname', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p7'), aPost({ firstName: 'Ada Smith' })));
await check('nor an email address field', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p8'), aPost({ email: 'ada@example.invalid' })));
await check('nor a telephone number field', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p9'), aPost({ phone: '01234 567890' })));
await check('nor be posted in somebody else’s name', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p10'), aPost({ byUid: 'u_youth_renu2' })));
await check('nor be empty', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p11'), aPost({ text: '' })));
await check('nor an essay', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__p12'), aPost({ text: 'x'.repeat(501) })));
await check('and the youth board is not a queue - no suggestions for it', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'youth__p1'), aPost({ boardId: 'youth' })));

/* LEADERS CAN REMOVE ANYTHING. */
await check('A LEADER REMOVES A POST', 'allow',
  () => deleteDoc(doc(as('renuLead'), 'boardSuggestions', 'renu__p1')));
await check('a child may withdraw their own', 'allow', async () => {
  await setDoc(doc(renuYouth(), 'boardSuggestions', 'renu__mine'), aPost());
  await deleteDoc(doc(renuYouth(), 'boardSuggestions', 'renu__mine'));
});
await check('but not another child’s', 'deny', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'boardSuggestions', 'renu__theirs'),
      { boardId: 'renu', text: 'theirs', firstName: 'Ben', byUid: 'u_youth_renu2', createdAt: new Date() });
  });
  await deleteDoc(doc(renuYouth(), 'boardSuggestions', 'renu__theirs'));
});
await check('nobody edits a post - approving means putting it up and deleting it', 'deny',
  () => updateDoc(doc(as('renuLead'), 'boardSuggestions', 'renu__theirs'), { text: 'changed' }));
await check('and a Lazers leader cannot touch a ReNu post', 'deny',
  () => deleteDoc(doc(as('lazersLead'), 'boardSuggestions', 'renu__theirs')));


/* ---- safeguarding: nobody uncleared on an under-18s team's rota -----
   NEXT-BRIEF §24, Martin, 10 October 2026. The teams ticked at launch are
   Kids Church, Youth Worship, Lazers and ReNu. Creche is not among them
   because it is not a team: the address book holds it as roles inside Kids
   Church, so ticking Kids Church covers every creche worker.

   "Cleared" is the events window's definition (F-109, checksInDate):
   dbsStatus current, dbsSeen within dbsYears, trainingDate within
   trainingYears. Reused rather than written again, so the rota and the
   under-18s groups cannot drift apart about who is cleared.

   HOW THE RULE KNOWS WHICH SLOT CHANGED, proved on the emulator before it
   was written: assignments.diff(...).affectedKeys() returns a SET, which
   cannot be indexed, and indexing a map by an absent key is an evaluation
   error - so it fails closed. The page names the slot it changed in
   `lastSlot` and cannot lie about it, because affectedKeys() must be
   exactly that slot. */

const TODAY = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);
const yearsBack = (n) => ymd(new Date(TODAY.getFullYear() - n, TODAY.getMonth(), TODAY.getDate()));

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'safeguardingSettings', 'defaults'), {
    dbsYears: 3, trainingYears: 3, leadSiteId: 'site_main', requireChecks: true });
  await setDoc(doc(db, 'bookingSettings', 'site_main'), {
    safeguardingLead: 'm_u_karen', safeguardingDeputy: '' });

  /* Three people, one of each kind. */
  await setDoc(doc(db, 'leaderChecks', 'm_cleared'), {
    dbsStatus: 'current', dbsSeen: yearsBack(1), trainingDate: yearsBack(1) });
  await setDoc(doc(db, 'leaderChecks', 'm_expired'), {
    dbsStatus: 'current', dbsSeen: yearsBack(9), trainingDate: yearsBack(1) });
  /* m_nodbs has NO leaderChecks record at all - the commonest case, and the
     one Martin named: a Youth Worship leader with no DBS. */

  /* A youth rota slot and a worship one, so the same write can be shown to
     be refused on the first and allowed on the second. */
  await setDoc(doc(db, 'events', 'ev_youth'), {
    date: '2026-11-01', teams: ['Youth Worship'], assignments: {}, lastSlot: '' });
  await setDoc(doc(db, 'events', 'ev_youth2'), {
    date: '2026-11-08', teams: ['Youth Worship'], assignments: {}, lastSlot: '' });
  await setDoc(doc(db, 'events', 'ev_youth3'), {
    date: '2026-11-15', teams: ['Youth Worship'],
    assignments: { Guitar: { id: 'm_cleared', name: 'Cleared Person' } }, lastSlot: 'Guitar' });
  await setDoc(doc(db, 'events', 'ev_youth4'), {
    date: '2026-11-22', teams: ['Youth Worship'], assignments: {}, lastSlot: '' });
  await setDoc(doc(db, 'events', 'ev_youth5'), {
    date: '2026-11-29', teams: ['Youth Worship'], assignments: {}, lastSlot: '' });
  await setDoc(doc(db, 'events', 'ev_kids'), {
    date: '2026-11-01', teams: ['Kids Church'], assignments: {}, lastSlot: '' });
  await setDoc(doc(db, 'events', 'ev_worship'), {
    date: '2026-11-01', teams: ['Worship Team'], assignments: {}, lastSlot: '' });
  await setDoc(doc(db, 'events', 'ev_except'), {
    date: '2026-12-06', teams: ['Youth Worship'], assignments: {}, lastSlot: '' });
});

/* THE ONE MARTIN NAMED. */
await check('a Youth Worship leader with NO DBS cannot be put on the youth rota', 'deny',
  () => updateDoc(doc(as('isla'), 'events', 'ev_youth'),
    { assignments: { Guitar: { id: 'm_nodbs', name: 'No DBS' } }, lastSlot: 'Guitar' }));

await check('nor can one whose DBS has run out', 'deny',
  () => updateDoc(doc(as('isla'), 'events', 'ev_youth2'),
    { assignments: { Guitar: { id: 'm_expired', name: 'Expired' } }, lastSlot: 'Guitar' }));

await check('a cleared person goes on it', 'allow',
  () => updateDoc(doc(as('isla'), 'events', 'ev_youth4'),
    { assignments: { Guitar: { id: 'm_cleared', name: 'Cleared Person' } }, lastSlot: 'Guitar' }));

await check('taking somebody off a youth slot is always allowed', 'allow',
  () => updateDoc(doc(as('isla'), 'events', 'ev_youth3'), { assignments: {}, lastSlot: 'Guitar' }));

await check('a master admin is NOT exempt - the exception route is', 'deny',
  () => updateDoc(doc(as('martin'), 'events', 'ev_youth5'),
    { assignments: { Guitar: { id: 'm_nodbs', name: 'No DBS' } }, lastSlot: 'Guitar' }));

await check('Kids Church is ticked too', 'deny',
  () => updateDoc(doc(as('samy'), 'events', 'ev_kids'),
    { assignments: { Helper: { id: 'm_nodbs', name: 'No DBS' } }, lastSlot: 'Helper' }));

/* A team that is NOT ticked is untouched by any of this. */
await check('a team that works with adults is not affected', 'allow',
  () => updateDoc(doc(as('samy'), 'events', 'ev_worship'),
    { assignments: { Guitar: { id: 'm_nodbs', name: 'No DBS' } }, lastSlot: 'Guitar' }));

/* THE SLOT CANNOT BE LIED ABOUT. Filling one slot while naming another is
   how a shadow field would have been walked around; affectedKeys() has to
   be exactly the named slot. */
await check('naming one slot while filling another is refused', 'deny',
  () => updateDoc(doc(as('isla'), 'events', 'ev_youth'),
    { assignments: { Drums: { id: 'm_nodbs', name: 'No DBS' } }, lastSlot: 'Guitar' }));

await check('two slots at once is refused, even if one is cleared', 'deny',
  () => updateDoc(doc(as('isla'), 'events', 'ev_youth'),
    { assignments: { Guitar: { id: 'm_cleared', name: 'Cleared' }, Drums: { id: 'm_nodbs', name: 'No DBS' } },
      lastSlot: 'Guitar' }));

/* THE EXCEPTION, and who may record one. */
await check('a team leader cannot record a safeguarding exception', 'deny',
  () => setDoc(doc(as('isla'), 'rotaExceptions', 'm_nodbs'),
    { memberId: 'm_nodbs', name: 'No DBS', reason: 'He is very nice and we are short handed',
      by: 'u_isla', byName: 'Isla', at: serverTimestamp() }));

await check('an exception with no real reason is refused', 'deny',
  () => setDoc(doc(as('martin'), 'rotaExceptions', 'm_nodbs'),
    { memberId: 'm_nodbs', name: 'No DBS', reason: 'ok',
      by: 'u_martin', byName: 'Martin', at: serverTimestamp() }));

await check('a master admin records one with a reason', 'allow',
  () => setDoc(doc(as('martin'), 'rotaExceptions', 'm_nodbs'),
    { memberId: 'm_nodbs', name: 'No DBS',
      reason: 'DBS applied for on 1 October, certificate expected within the month',
      by: 'u_martin', byName: 'Martin', at: serverTimestamp() }));

await check('the safeguarding lead records one too', 'allow',
  () => setDoc(doc(as('karen'), 'rotaExceptions', 'm_expired'),
    { memberId: 'm_expired', name: 'Expired',
      reason: 'Renewal booked for the fourteenth, covering until then with another leader present',
      by: 'u_karen', byName: 'Karen', at: serverTimestamp() }));

/* ...and with the exception recorded, the same write now goes through. */
await check('after the exception, that person CAN go on the youth rota', 'allow',
  () => updateDoc(doc(as('isla'), 'events', 'ev_except'),
    { assignments: { Guitar: { id: 'm_nodbs', name: 'No DBS' } }, lastSlot: 'Guitar' }));

await check('the person can see their own exception', 'allow',
  () => getDoc(doc(as('isla'), 'rotaExceptions', 'm_nodbs')));

/* ---- teams as data, and who runs things (NEXT-BRIEF §25) ------------
   The teams collection is read by every page for labels and colours, and
   written only by a master admin - adding a team gives access to whoever is
   ticked into it, and `runs` decides who runs things.

   THE RULES NEVER READ IT, which is the point: a team appearing in `teams`
   grants nothing by itself. `markers` on an address book record is still
   the only switch, so the last test here is the one that matters. */

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'teams', 'Church office'), {
    name: 'Church office', label: 'Church office', colour: '#111827',
    rota: false, runs: ['today', 'people', 'bookings', 'send'], archived: false });
  /* A person whose mirror and record AGREE, which the shared fixtures above
     do not: Isla's users doc says attender:false while her address book
     record would make her one, so mirrorsBook refuses her heartbeat for a
     reason that has nothing to do with `runs`. A test that cannot pass for
     an unrelated reason proves nothing about the thing it names. */
  await setDoc(doc(db, 'users', 'u_runs'), {
    memberId: 'm_u_runs', name: 'Runs Tester', teams: [], adminFor: [],
    masterAdmin: false, attender: true, churchMember: false, status: 'active', runs: [] });
  await setDoc(doc(db, 'addressBook', 'm_u_runs'), {
    name: 'Runs Tester', email: 'runs@example.invalid', markers: [],
    adminFor: [], churchMember: false, archived: false, isMinor: false });
});

await check('anyone active reads the teams data', 'allow',
  () => getDoc(doc(as('samy'), 'teams', 'Church office')));
await check('and lists it, for the labels every page needs', 'allow',
  () => getDocs(collection(as('attender'), 'teams')));
await check('a stranger does not', 'deny',
  () => getDoc(doc(anon(), 'teams', 'Church office')));

await check('a team admin cannot make a group', 'deny',
  () => setDoc(doc(as('karen'), 'teams', 'Finance'),
    { name: 'Finance', label: 'Finance', rota: false, runs: ['today'] }));
await check('nor give an existing one more tabs', 'deny',
  () => updateDoc(doc(as('karen'), 'teams', 'Church office'),
    { runs: ['today', 'people', 'bookings', 'send'] }));
await check('a master admin makes one', 'allow',
  () => setDoc(doc(as('martin'), 'teams', 'Bookings'),
    { name: 'Bookings', label: 'Bookings', colour: '#111827', rota: false,
      runs: ['bookings'], archived: false }));
await check('  but the id has to be the name, or two names mean one group', 'deny',
  () => setDoc(doc(as('martin'), 'teams', 'bookings'),
    { name: 'Bookings', label: 'Bookings', rota: false, runs: ['bookings'] }));
await check('  and a made-up tab is refused', 'deny',
  () => setDoc(doc(as('martin'), 'teams', 'Elders'),
    { name: 'Elders', label: 'Elders', rota: false, runs: ['everything'] }));

/* THE ONE THAT MATTERS. `runs` is mirrored onto users/{uid} so the app and
   the Menu can read it without a second query - and a mirror is only safe
   if the person cannot write their own. */
/* WITH THE VERIFIED EMAIL, which is what a real page has. as('isla')
   carries no email claim, so bookIsMine() is false and every one of these
   would be refused for the wrong reason - a gate that says no because the
   set-up is wrong proves nothing about the gate. */
const runsReal = asNewcomer('u_runs', 'runs@example.invalid');

await check('SOMEBODY CANNOT GIVE THEMSELVES A RUNNING THINGS TAB', 'deny',
  () => updateDoc(doc(runsReal, 'users', 'u_runs'),
    { runs: ['people', 'send'], lastSeen: serverTimestamp() }));
await check('  nor one tab', 'deny',
  () => updateDoc(doc(runsReal, 'users', 'u_runs'),
    { runs: ['bookings'], lastSeen: serverTimestamp() }));
/* ...and the heartbeat still goes through, so adding `runs` to the mirror
   has not quietly refused every page load (A-062 was exactly that, found
   in the emulator's log rather than by anything failing). */
await check('  and the heartbeat still works, claiming none', 'allow',
  () => updateDoc(doc(runsReal, 'users', 'u_runs'),
    { runs: [], lastSeen: serverTimestamp() }));

// Nothing else is open.
await check('unknown collection stays shut', 'deny', () => getDoc(doc(as('samy'), 'somethingElse', 'x')));

await env.cleanup();

const failed = results.filter(r => !r.ok);
for (const r of results) {
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  (expected ' + r.expect + ')' + (r.why ? '\n          ' + r.why : ''));
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
