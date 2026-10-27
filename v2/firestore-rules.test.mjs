/* Runs the real rules engine against firestore.rules.
   Nothing here touches the live project. */

import fs from 'node:fs';
import { FEATURES as SERVER_FEATURES } from './functions/features.js';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc as fsDoc, getDoc, setDoc, updateDoc, deleteDoc, collection as fsCollection, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

/* AS ONE CHURCH (multi-church step 4 part 1, batch B; FINDINGS-churchhq
   H-6): AS_CHURCH=mc-test runs every case below against the generated
   church ruleset (firestore.churches.rules), as one made-up church - every
   path under churches/mc-test, every sign-in carrying that church in its
   claims. The cases themselves are untouched: the church copy must give
   the same answers inside a church as EGBC's rules give at the top level,
   apart from the differences the church ruleset makes on purpose (listed
   where this is run). Unset, nothing changes. */
const AS_CHURCH = process.env.AS_CHURCH || '';
/* The database itself (not a reference, which carries its own path). */
const inChurch = (args) => (AS_CHURCH && args[0] && typeof args[0] === 'object' && !('path' in args[0]))
  ? [args[0], ['churches', AS_CHURCH, ...args.slice(1)].join('/')] : args;
const doc = (...args) => fsDoc(...inChurch(args));
const collection = (...args) => fsCollection(...inChurch(args));

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
  firestore: { rules: fs.readFileSync(AS_CHURCH ? 'firestore.churches.rules' : cfg.firestore.rules, 'utf8'), host: '127.0.0.1', port: PORT },
});
if (AS_CHURCH) {
  const signIn = env.authenticatedContext.bind(env);
  env.authenticatedContext = (uid, claims) => signIn(uid, Object.assign({}, claims || {}, { churches: [AS_CHURCH] }));
}

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
  /* 6c: a parent on no team whose child is in Lazers. familyGroups is put
     on their record below, as the server would. */
  parent:  { uid: 'u_parent', teams: [], adminFor: [], masterAdmin: false,
             attender: true, status: 'active' },
  renuLead:   { uid: 'u_renu_lead',   teams: ['ReNu'],   adminFor: ['ReNu'],   masterAdmin: false },
  lazersLead: { uid: 'u_lazers_lead', teams: ['Lazers'], adminFor: ['Lazers'], masterAdmin: false },
  member:  { uid: 'u_member',   teams: [], adminFor: [], masterAdmin: false,
             attender: true, churchMember: true, status: 'active' },
  /* CORE TEAM AND NOTHING ELSE (Martin, 11 Oct 2026: "core team cant see
     worship and AV"). martin is Core Team too, but he is also on AV Team
     AND a master admin, so he would pass every check below for two other
     reasons and prove nothing about the cover. */
  core:    { uid: 'u_core',     teams: ['Core Team'], adminFor: [], masterAdmin: false },
  /* WORSHIP, AV AND CHOIR, one each and nothing else (Martin, 12 Oct
     2026: "if worship team want to turn on the sound desk they should be
     able to see how"). Three separate people, because the claim is that
     each of the three sees the other two's things - samy would not do,
     being on Worship AND Kids Church, and martin would not either, being
     a master admin who passes everything for another reason entirely. */
  worship: { uid: 'u_worship', teams: ['Worship Team'], adminFor: [], masterAdmin: false },
  av:      { uid: 'u_av',      teams: ['AV Team'],      adminFor: [], masterAdmin: false },
  choir:   { uid: 'u_choir',   teams: ['Choir'],        adminFor: [], masterAdmin: false },
  /* A LEADER of AV and of nothing else, to show that seeing more did not
     become changing more. */
  avLead:  { uid: 'u_av_lead',  teams: ['AV Team'], adminFor: ['AV Team'], masterAdmin: false },

  /* THE CHURCH OFFICE, and nothing else. They are the other people who
     may set the church's bank details, so they have to be somebody who
     is not a master admin and not an admin of anything - otherwise an
     allow proves only that admins can write, which is not the rule. */
  /* u_office IS ALREADY TAKEN, by a bookings admin on the Welcome Team
     seeded further down for the accounts and maintenance tests. Reusing
     that uid here put their teams on this person by the time these tests
     ran, and the Church office write was refused for a reason that had
     nothing to do with the rule being tested. Hence a uid of its own. */
  churchOffice: { uid: 'u_church_office', teams: ['Church office'], adminFor: [], masterAdmin: false },
  /* In the Church office group AND an admin: the person who may mark a
     notice urgent (N-4, Martin 13 Oct 2026). */
  officeAdmin: { uid: 'u_office_admin', teams: ['Church office'], adminFor: ['Kids Church'], masterAdmin: false },
  /* CORE TEAMS (H-15, 26 Oct 2026): what they cover is kept on the record
     by the server (functions/core-teams.js); one not yet written has none. */
  wcore: { uid: 'u_wcore', teams: ['Core Team'], adminFor: [], masterAdmin: false, covers: ['AV Team', 'Choir', 'Worship Team'] },
  kycore: { uid: 'u_kycore', teams: ['Kids & Youth Core Team'], adminFor: [], masterAdmin: false, covers: ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship'] },
  kyfresh: { uid: 'u_kyfresh', teams: ['Kids & Youth Core Team'], adminFor: [], masterAdmin: false },
  kyadmin: { uid: 'u_kyadmin', teams: [], adminFor: ['Kids & Youth Core Team'], masterAdmin: false, adminCovers: ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship'] },
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
      ...(p.covers ? { covers: p.covers } : {}), ...(p.adminCovers ? { adminCovers: p.adminCovers } : {}),
    });
  }
  await setDoc(doc(db, 'addressBook', 'm_u_samy'), { name: 'Samy', markers: ['Worship Team'] });
  await setDoc(doc(db, 'addressBook', 'm_u_attender'), {
    name: 'Attender Synthetic', email: 'attender@example.invalid', markers: [] });
  await setDoc(doc(db, 'addressBook', 'm_u_member'), {
    name: 'Member Synthetic', email: 'member@example.invalid', markers: [], churchMember: true });
  await setDoc(doc(db, 'news', 'n1'), { title: 'A notice', body: 'x', ackedBy: [] });
  await setDoc(doc(db, 'songs', 'sg1'), { title: 'A song' });
  /* A church email half written, for the Core Team tests below. */
  await setDoc(doc(db, 'emailDrafts', 'd1'),
    { subject: 'A draft', updatedBy: 'u_martin', updatedAt: 'then' });
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
  /* A young person on the YOUTH BAND, for the youth board's queue (Martin,
     10 Oct 2026). The youth board used to let them read and suggest
     nothing, which "cuts off exactly the people we want ideas from". */
  await setDoc(doc(db, 'worshipBoardState', 'youth'), { notes: [], pages: [] });
  await setDoc(doc(db, 'youthAccess', 'u_youth_yw'), {
    memberId: 'm_yw_kid', memberName: 'Cara Synthetic', firstName: 'Cara',
    groups: ['Youth Worship'], grantCode: 'YWOR-0001',
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
  /* Core Team's own board (Martin, 10 Oct 2026). */
  await setDoc(doc(db, 'worshipBoardState', 'core-team'), { notes: [], pages: [] });
  await setDoc(doc(db, 'worshipBoardState', 'youth'), { notes: [] });
  /* A comment already on a youth note, so "a young person READS the
     comments and writes none" can be tested as two separate questions.
     Written by a leader, which is who may write them. */
  await setDoc(doc(db, 'boardComments', 'bc_youth'), {
    boardId: 'youth', noteId: 'n1', text: 'Good idea, lets try it',
    byUid: 'u_isla', byName: 'Isla', createdAt: 'x' });
  await setDoc(doc(db, 'teamVideos', 'v_kids'), { title: 'Kids clip', team: 'Kids Church' });
  await setDoc(doc(db, 'teamVideos', 'v_worship'), { title: 'Worship clip', team: 'Worship Team' });
  await setDoc(doc(db, 'teamVideos', 'v_av'), { title: 'AV clip', team: 'AV Team' });
  await setDoc(doc(db, 'teamVideos', 'v_choir'), { title: 'Choir clip', team: 'Choir' });
  await setDoc(doc(db, 'videoSections', 'kids-church'), { team: 'Kids Church', names: ['Church Show'] });
  await setDoc(doc(db, 'services', 's1'), { date: '2026-09-06' });
  /* THE SUNDAY PLAN AND ITS AUDIENCE (Martin, 12 Oct 2026). Two
     Sundays, so "can read their own" and "cannot read another" are
     different questions and not the same one asked twice. u_preach is
     on NO team, which is the whole point: a preacher locked out of an
     email that was sent to them. */
  await setDoc(doc(db, 'services', 'sv_their_sunday'), {
    date: '2026-11-08', audience: ['u_preach'], audienceUnresolved: [] });
  await setDoc(doc(db, 'services', 'sv_other_sunday'), {
    date: '2026-11-15', audience: ['u_someone_else'], audienceUnresolved: [] });
  await setDoc(doc(db, 'songSummaries', '2026-11-08'), {
    date: '2026-11-08', items: [], audience: ['u_preach'], audienceUnresolved: [] });
  await setDoc(doc(db, 'songSummaries', '2026-11-15'), {
    date: '2026-11-15', items: [], audience: ['u_someone_else'], audienceUnresolved: [] });
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
    startLocal: '2026-12-20T18:00', startUtc: 1766253600000, createdBy: 'u_martin', teams: [], signupOn: true, capacity: 10,
    /* F-212: Karen is on this event's team. */ teamUids: ['u_karen'], teamMemberIds: [] });
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
/* CORE TEAMS COVER CHOSEN TEAMS, INDEPENDENTLY (H-15, Martin, 26 Oct 2026). */
await check('CORE TEAMS: the Worship Core Team reads the worship board', 'allow', () => getDoc(doc(as('wcore'), 'worshipBoardState', 'state')));
await check('  and its own board', 'allow', () => getDoc(doc(as('wcore'), 'worshipBoardState', 'core-team')));
await check('  not the Kids Church board', 'deny', () => getDoc(doc(as('wcore'), 'worshipBoardState', 'kids-church')));
await check('  nor Youth\'s', 'deny', () => getDoc(doc(as('wcore'), 'worshipBoardState', 'youth')));
await check('the Kids & Youth Core Team reads the Kids Church board', 'allow', () => getDoc(doc(as('kycore'), 'worshipBoardState', 'kids-church')));
await check('  and Youth\'s', 'allow', () => getDoc(doc(as('kycore'), 'worshipBoardState', 'youth')));
await check('  not the worship board', 'deny', () => getDoc(doc(as('kycore'), 'worshipBoardState', 'state')));
await check('  nor the Worship Core Team\'s', 'deny', () => getDoc(doc(as('kycore'), 'worshipBoardState', 'core-team')));
await check('a member whose covers are not written yet gets only their own team', 'deny', () => getDoc(doc(as('kyfresh'), 'worshipBoardState', 'kids-church')));
await check('an admin of the Kids & Youth Core Team administers Kids Church', 'allow', () => getDoc(doc(as('kyadmin'), 'worshipBoardState', 'kids-church')));
await check('  and nothing of worship', 'deny', () => getDoc(doc(as('kyadmin'), 'worshipBoardState', 'state')));
await check('a page cannot give itself covers when it makes its record', 'deny', () => setDoc(doc(asNewcomer('u_cov_new', 'cov.new@example.invalid'), 'users', 'u_cov_new'),
  { status: 'pending', teams: [], adminFor: [], masterAdmin: false, covers: ['Kids Church'] }));
await check('  nor afterwards', 'deny', () => updateDoc(doc(as('kyfresh'), 'users', 'u_kyfresh'), { covers: ['Kids Church'], lastSeen: 'now' }));
await check('  nor adminCovers', 'deny', () => updateDoc(doc(as('kyfresh'), 'users', 'u_kyfresh'), { adminCovers: ['Kids Church'], lastSeen: 'now' }));
await check('pending person cannot see the videos', 'deny', () => getDoc(doc(as('pending'), 'teamVideos', 'v_kids')));

// The pin boards, which is what the three-board split was for.
await check('worship reads the worship board', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'state')));
/* BACK TO 'allow', and this is the corrected one. It was narrowed to Kids
   Church leaders on the 9 October note and Martin put it back on the 10th:
   "Its an ideas board. Its pointless chopping off the people we want ideas
   from." Samy is on Worship Team and Kids Church, and reads it as a member
   of the team - exactly as Youth works. */
await check('a Kids Church member reads the kids board', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'kids-church')));
await check('and writes it, because that is what an ideas board is for', 'allow', () => setDoc(doc(as('samy'), 'worshipBoardState', 'kids-church'), { notes: [] }));
await check('youth cannot read the kids board', 'deny', () => getDoc(doc(as('isla'), 'worshipBoardState', 'kids-church')));
await check('youth reads the youth board', 'allow', () => getDoc(doc(as('isla'), 'worshipBoardState', 'youth')));
await check('kids admin writes the kids board', 'allow', () => setDoc(doc(as('karen'), 'worshipBoardState', 'kids-church'), { notes: [] }));
await check('kids admin cannot write the worship board', 'deny', () => setDoc(doc(as('karen'), 'worshipBoardState', 'state'), { notes: [] }));

/* ── COMMENTS ON A PIN BOARD NOTE (APP-DESIGN-BRIEF 7f) ──────────────
   A separate collection, one document per comment, because the board is a
   single document: anyone allowed to add a comment INSIDE it would be
   allowed to rewrite every note on it.

   Read follows the board. Create follows who may WRITE the board, which
   is how "young people don't comment at launch" is true by construction
   rather than by a flag - a youth-code account fails boardIsMine(). */
{
  const C = (extra) => ({
    boardId: 'state', noteId: 'n1', text: 'We could do this in Bb',
    byUid: 'u_samy', byName: 'Samy', createdAt: 'x', ...(extra || {}),
  });
  const kids = (extra) => C({ boardId: 'kids-church', byUid: 'u_samy', ...(extra || {}) });

  await check('somebody on the worship team comments on a worship note', 'allow',
    () => setDoc(doc(as('samy'), 'boardComments', 'bc_1'), C()));
  await check('and reads it back', 'allow',
    () => getDoc(doc(as('samy'), 'boardComments', 'bc_1')));
  await check('a master admin reads it too', 'allow',
    () => getDoc(doc(as('martin'), 'boardComments', 'bc_1')));
  /* Off that board entirely: isla is Youth Worship, not Worship Team. */
  await check('somebody off that board cannot read its comments', 'deny',
    () => getDoc(doc(as('isla'), 'boardComments', 'bc_1')));
  await check('nor comment on it', 'deny',
    () => setDoc(doc(as('isla'), 'boardComments', 'bc_2'), C({ byUid: 'u_isla' })));
  await check('nor can somebody who has not signed in', 'deny',
    () => getDoc(doc(anon(), 'boardComments', 'bc_1')));

  /* The author is whoever is signed in, not whoever the page claims. */
  await check('a comment cannot be signed with somebody else’s name', 'deny',
    () => setDoc(doc(as('samy'), 'boardComments', 'bc_3'), C({ byUid: 'u_martin' })));
  await check('500 characters is the limit', 'deny',
    () => setDoc(doc(as('samy'), 'boardComments', 'bc_4'), C({ text: 'x'.repeat(501) })));
  await check('an empty comment is not a comment', 'deny',
    () => setDoc(doc(as('samy'), 'boardComments', 'bc_5'), C({ text: '' })));
  await check('and no unexpected field rides along', 'deny',
    () => setDoc(doc(as('samy'), 'boardComments', 'bc_6'), C({ email: 'a@b.invalid' })));

  /* NOBODY EDITS ONE. An edited comment still carrying its original name
     and date is a quiet way to put words in somebody's mouth. */
  await check('nobody edits a comment, not even the person who wrote it', 'deny',
    () => updateDoc(doc(as('samy'), 'boardComments', 'bc_1'), { text: 'changed' }));

  /* Taking one down: the author, or a LEADER of that board - narrower
     than who may write it. Everyone on Kids Church may pin a note and
     comment; removing another person's words is a leader's job. */
  await check('somebody on Kids Church comments on the kids board', 'allow',
    () => setDoc(doc(as('samy'), 'boardComments', 'bc_k1'), kids()));
  const lena = () => env.authenticatedContext('u_lena').firestore();
  await check('another member of that team reads it', 'allow',
    () => getDoc(doc(lena(), 'boardComments', 'bc_k1')));
  await check('but cannot take somebody else’s comment down', 'deny',
    () => deleteDoc(doc(lena(), 'boardComments', 'bc_k1')));
  await check('the Kids Church admin can, being a leader of that board', 'allow',
    () => deleteDoc(doc(as('karen'), 'boardComments', 'bc_k1')));
  await check('and the author can take their own down', 'allow',
    () => deleteDoc(doc(as('samy'), 'boardComments', 'bc_1')));
}

// The video library.
/* ── WORSHIP, AV AND CHOIR ARE ONE TEAM FOR SEEING THINGS ────────────
   Martin, 12 Oct 2026: "if worship team want to turn on the sound desk
   they should be able to see how." egbc-auth.js already says this for
   the pages (WORSHIP_AV, 8c9dba43); these are the rules saying the same,
   or a page opens and the data behind it is refused.

   BOTH DIRECTIONS, and the third team as well - "Worship can read AV"
   on its own would pass with a rule that simply let everybody read
   everything. */
{
  await check('Worship reads the AV team’s video', 'allow',
    () => getDoc(doc(as('worship'), 'teamVideos', 'v_av')));
  await check('AV reads the worship team’s', 'allow',
    () => getDoc(doc(as('av'), 'teamVideos', 'v_worship')));
  await check('Choir reads both', 'allow',
    () => getDoc(doc(as('choir'), 'teamVideos', 'v_av')));
  await check('and Worship reads the choir’s', 'allow',
    () => getDoc(doc(as('worship'), 'teamVideos', 'v_choir')));
  /* AND IT STOPS THERE. Kids Church is not part of this. */
  await check('but Kids Church still cannot read the AV team’s', 'deny',
    () => getDoc(doc(as('karen'), 'teamVideos', 'v_av')));
  await check('nor can AV read the Kids Church one', 'deny',
    () => getDoc(doc(as('av'), 'teamVideos', 'v_kids')));

  /* SEEING MORE IS NOT CHANGING MORE. Every leader-only write goes
     through adminOf(), which reads adminFor and never myTeams() - so
     widening what the three can read must not have widened what they can
     write. This is the half that would be silently wrong if the cover
     had been added to the wrong helper. */
  await check('being on AV does not let somebody change an AV video', 'deny',
    () => setDoc(doc(as('av'), 'teamVideos', 'v_av2'), { title: 'No', team: 'AV Team' }));
  await check('nor does being on Worship let them change the AV team’s', 'deny',
    () => setDoc(doc(as('worship'), 'teamVideos', 'v_av3'), { title: 'No', team: 'AV Team' }));
  await check('the AV leader changes the AV team’s', 'allow',
    () => setDoc(doc(as('avLead'), 'teamVideos', 'v_av4'), { title: 'Yes', team: 'AV Team' }));
  /* AND A LEADER OF ONE IS NOT A LEADER OF THE OTHER TWO. The cover is
     about seeing; leading a team is still leading that team. */
  await check('but not the worship team’s', 'deny',
    () => setDoc(doc(as('avLead'), 'teamVideos', 'v_w2'), { title: 'No', team: 'Worship Team' }));

  /* The worship board is the other thing the three share. */
  await check('AV reads the worship board', 'allow',
    () => getDoc(doc(as('av'), 'worshipBoardState', 'state')));
  await check('Choir reads it too', 'allow',
    () => getDoc(doc(as('choir'), 'worshipBoardState', 'state')));
  await check('and Kids Church does not', 'deny',
    () => getDoc(doc(as('karen'), 'worshipBoardState', 'state')));
}

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
await check('the event team adds a ticket type (F-212)', 'allow', () => setDoc(doc(as('karen'), 'calEvents', 'ev_public', 'ticketTypes', 'tt_paid'), { name: 'Standard', price: 5, capacity: 10 }));
await check('AN ADMIN NOT ON THE EVENT\'S TEAM cannot (F-212)', 'deny', () => setDoc(doc(as('karen'), 'calEvents', 'ev_members', 'ticketTypes', 'tt_x'), { name: 'Standard', price: 5, capacity: 10 }));

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
await check('NOT EVERY ADMIN LISTS EVERY SIGN-UP any more (F-212)', 'deny', () => getDocs(collection(as('karen'), 'signups')));
await check('the event team lists its own event\'s sign-ups', 'allow', () => getDocs(query(collection(as('karen'), 'signups'), where('calEventId', '==', 'ev_public'))));
await check('but not another event\'s, though an admin (F-212)', 'deny', () => getDocs(query(collection(as('karen'), 'signups'), where('calEventId', '==', 'ev_members'))));
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
  await check('the event team sets who may collect', 'allow', () => setDoc(doc(as('karen'), 'checkinSettings', 'ev_public'), { checkoutRequired: false, collectorsQuestionId: '', flagQuestionIds: ['q_diet'] }));
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
  /* S3 (F-280 (a), 10.3): the level of the check, a church leader's reference, the confidential declaration */
  await check('S3: the lead records the DBS level (Enhanced with the barred list), the reference and the declaration', 'allow', () => setDoc(doc(lena(), 'leaderChecks', 'm_u_leo'),
    { name: 'Leo', dbsStatus: 'current', dbsSeen: '2025-01-10', trainingDate: '2025-02-01', siteId: 'site_kids', updatedAt: 'x', updatedBy: 'u_lena', dbsLevel: 'enhancedBarred', referenceDate: '2025-03-01', declarationDate: '2025-03-02' }));
  await check('S3: not a level that isn’t one of the DBS levels', 'deny', () => setDoc(doc(lena(), 'leaderChecks', 'm_u_leo'),
    { name: 'Leo', dbsStatus: 'current', dbsSeen: '2025-01-10', trainingDate: '2025-02-01', siteId: 'site_kids', dbsLevel: 'superEnhanced' }));
  await check('S3: nor a reference date that isn’t a date', 'deny', () => setDoc(doc(lena(), 'leaderChecks', 'm_u_leo'),
    { name: 'Leo', dbsStatus: 'current', dbsSeen: '2025-01-10', trainingDate: '2025-02-01', siteId: 'site_kids', referenceDate: 'Mr Jones vouched' }));
  await check('there is no room for a DBS certificate number', 'deny', () => setDoc(doc(lena(), 'leaderChecks', 'm_u_leo'),
    { name: 'Leo', dbsStatus: 'current', dbsSeen: '2025-01-10', trainingDate: '2025-02-01', siteId: 'site_kids', certificate: '001234567890' }));
  await check('an ordinary admin cannot record checks', 'deny', () => setDoc(doc(ella(), 'leaderChecks', 'm_u_leo'), { dbsStatus: 'current', siteId: 'site_kids' }));
  /* Martin's rule (22 Oct 2026): DBS dates are the lead and deputy's, not every team admin's. */
  await check('an ordinary team admin cannot see a leader\'s checks', 'deny', () => getDoc(doc(ella(), 'leaderChecks', 'm_u_leo')));
  await check('the safeguarding lead sees them', 'allow', () => getDoc(doc(lena(), 'leaderChecks', 'm_u_leo')));
  await check('  and a master admin', 'allow', () => getDoc(doc(as('martin'), 'leaderChecks', 'm_u_leo')));
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
  /* S5: the lead links an incident to one of the register's activities, so its risks are looked at again */
  await env.withSecurityRulesDisabled(async (c) => { const d = c.firestore();
    await setDoc(doc(d, 'sgActivities', 'act_kids_s5'), { siteId: 'site_kids', kind: 'sunday', name: 'Juniors (invented)', link: {}, active: true });
    await setDoc(doc(d, 'sgActivities', 'act_test_s5'), { siteId: 'site_test', kind: 'sunday', name: 'Elsewhere (invented)', link: {}, active: true }); });
  await check('S5: THE LEAD LINKS AN INCIDENT TO THE ACTIVITY IT HAPPENED IN', 'allow', () => updateDoc(doc(lena(), 'incidents', 'inc_2'), { activityId: 'act_kids_s5' }));
  await check('  not to another site’s activity', 'deny', () => updateDoc(doc(lena(), 'incidents', 'inc_2'), { activityId: 'act_test_s5' }));
  await check('  nor to one that doesn’t exist', 'deny', () => updateDoc(doc(lena(), 'incidents', 'inc_2'), { activityId: 'act_none' }));
  await check('  the event’s leader can’t link it', 'deny', () => updateDoc(doc(leo(), 'incidents', 'inc_2'), { activityId: 'act_kids_s5' }));
  await check('  and what was reported still can’t change', 'deny', () => updateDoc(doc(lena(), 'incidents', 'inc_2'), { activityId: 'act_kids_s5', what: 'Something else' }));
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

  /* BOOK A ROOM IS FOR TEAM LEADERS AND CORE TEAMS (Martin, 26 Oct; H-16) */
  await check('BOOK A ROOM: A PLAIN MEMBER (no team led, no core team) IS REFUSED', 'deny', () => book(as('samy'), K('band_1800'), B('2026-11-18', 1080, 1140), wedBefore()));
  await check('  nor may they ask', 'deny', () => setDoc(doc(as('samy'), 'bookings', K('plain_req')), { ...B('2026-11-25', 600, 660), status: 'requested' }));
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), 'users', 'u_samy'), { covers: ['Worship Team'] }); });
  await check('  on a core team (it covers teams), they may ask', 'allow', () => setDoc(doc(as('samy'), 'bookings', K('core_req')), { ...B('2026-11-25', 600, 660), status: 'requested' }));
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), 'users', 'u_samy'), { covers: [], roles: { 'Kids Church': 'leader' } }); });
  /* From here Samy leads Kids Church: the bookings below are a leader's. */
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
  /* A week ago, never today (F-153). This section checks Cat and Dan in and
     out under the same record names the morning and paging sections below
     use for TODAY. It was fixed at '2026-10-11', and on that day the two
     collided: Cat was already checked out, and Dan really was checked in
     "this morning", so the rules rightly let the Session Leader see his
     medical details while the test said they should not. */
  const DAY = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  if (DAY === new Date().toISOString().slice(0, 10)) throw new Error('the check-in section must not use today');
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
  await check('AND AN AREA ADMIN NO LONGER SEES EVERY EVENT\'S CHECK-INS for the day (F-212: only the events they run)', 'deny', () => getDocs(query(collection(ctx('u_wes'), 'checkins'), where('day', '==', DAY), where('kind', 'in', ['booked', 'walkin', 'leader']))));
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

  /* Screen numbers are reserved, one family each, per site per day (Martin, 14 Oct 2026). */
  const SNO = (n, fam) => ({ siteId: 'site_kids', day: TODAY, n, familyId: fam, groupId: '', at: 'x' });
  const SREF = (who, n) => doc(who, 'kidsScreenNos', 'site_kids_' + TODAY + '_' + n);
  await check('a lead reserves screen number 427 for a family this morning', 'allow', () => setDoc(SREF(ctx('u_kim'), '427'), SNO('427', 'fam_2')));
  await check('ANOTHER FAMILY CANNOT HAVE 427 TOO', 'deny', () => setDoc(SREF(ctx('u_kim'), '427'), SNO('427', 'fam_9')));
  await check('  nor can it be given back and used again today', 'deny', () => deleteDoc(SREF(ctx('u_kim'), '427')));
  await check('someone outside the children\u2019s team cannot reserve one', 'deny', () => setDoc(SREF(ctx('u_wes'), '555'), SNO('555', 'fam_9')));
  await check('  nor under another number than its own name says', 'deny', () => setDoc(SREF(ctx('u_kim'), '556'), SNO('557', 'fam_9')));

  const CKID = (kid, g) => 'kids_' + g + '_' + TODAY + '__' + kid + '__0';
  const CK = (kid, g) => ({ calEventId: 'kids_' + g + '_' + TODAY, signupKey: kid, attendeeIndex: 0, name: kid === 'kid_cat' ? 'Cat Synthetic' : 'Dan Synthetic', kind: 'child', state: 'in',
    inAt: 'x', inBy: 'x', inByName: 'x', roomId: '', day: TODAY, updatedAt: 'x', groupId: g, siteId: 'site_kids', familyId: 'fam_2', pickupCode: 'Q7P2', screenNo: '427' });
  const ROLL = (kid, g, extra) => ({ siteId: 'site_kids', day: TODAY, groupId: g, groupName: 'x', childId: kid, name: CK(kid, g).name, state: 'in', inAt: 'x', outAt: '', roomId: '', updatedAt: 'x', ...(extra || {}) });
  const both = (who, kid, g, rollExtra) => { const b = writeBatch(who); b.set(doc(who, 'checkins', CKID(kid, g)), CK(kid, g)); b.set(doc(who, 'kidsRoll', CKID(kid, g)), ROLL(kid, g, rollExtra)); return b.commit(); };
  await check('a check-in may not carry a screen number nobody reserved for its family', 'deny', () => {
    const k = ctx('u_kim'), b = writeBatch(k); b.set(doc(k, 'checkins', CKID('kid_cat', 'grp_junior')), { ...CK('kid_cat', 'grp_junior'), screenNo: '558' });
    b.set(doc(k, 'kidsRoll', CKID('kid_cat', 'grp_junior')), ROLL('kid_cat', 'grp_junior')); return b.commit(); });
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

  const PID = 'kids_grp_junior_' + TODAY + '__kid_cat__0';   /* Cat, checked in to Juniors this morning (code Q7P2, screen number 427) */
  /* Martin, 14 Oct 2026: the screen shows the SCREEN NUMBER, never the collection code. */
  const PAGE = (who, extra) => ({ siteId: 'site_kids', code: '427', room: 'Junior Room', message: 'Screen number 427: please come to Juniors', createdBy: who, createdAt: serverTimestamp(), clearedAt: null, ...(extra || {}) });
  await check('THE COLLECTION CODE NEVER GOES ON THE SCREEN', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { code: 'Q7P2', message: 'Screen number Q7P2: please come to Juniors' })));
  await check('  not in the old words either', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { code: 'Q7P2', message: 'Q7P2, please come to Juniors' })));
  await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), 'kidsSettings', 'site_kids'), { screenPaging: false }); });
  await check('WITH SCREEN NUMBERS SWITCHED OFF (Kids Church settings), nothing goes on the screen', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo')));
  await check('a Kids Church lead switches them back on', 'allow', () => updateDoc(doc(ctx('u_kim'), 'kidsSettings', 'site_kids'), { screenPaging: true }));
  await check('  but a lead may not change the settings’ other parts with it', 'deny', () => updateDoc(doc(ctx('u_kim'), 'kidsSettings', 'site_kids'), { screenPaging: false, teams: ['Kids Church', 'Worship Team'] }));
  await check('  nor may a group leader switch them', 'deny', () => updateDoc(doc(ctx('u_lou'), 'kidsSettings', 'site_kids'), { screenPaging: false }));
  await check('THE PAGE MAY NOT NAME THE CHILD', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { message: 'Cat Synthetic, please come to Juniors' })));
  await check('nor carry a number that is not the family\u2019s', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { code: '999', message: 'Screen number 999: please come to Juniors' })));
  await check('nor anything else', 'deny', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo', { childName: 'Cat Synthetic' })));
  await check('the leader of Little ones cannot page for a Junior', 'deny', () => setDoc(doc(ctx('u_lou'), 'screenPages', PID), PAGE('u_lou')));
  await check('an admin of another team cannot page', 'deny', () => setDoc(doc(ctx('u_wes'), 'screenPages', PID), PAGE('u_wes')));
  await check('Juniors\u2019 leader pages Cat\u2019s parent: "Screen number 427: please come to Juniors"', 'allow', () => setDoc(doc(ctx('u_jo'), 'screenPages', PID), PAGE('u_jo')));
  await check('THE CONTRACT: the projection computer (a worship admin) reads the active pages for the site, exactly these fields, a code and no name', 'allow', async () => {
    const snap = await getDocs(query(collection(ctx('u_wes'), 'screenPages'), where('siteId', '==', 'site_kids'), where('clearedAt', '==', null)));
    const d = snap.docs[0] && snap.docs[0].data();
    if (snap.size !== 1) throw new Error('expected one page, got ' + snap.size);
    if (Object.keys(d).sort().join(',') !== 'clearedAt,code,createdAt,createdBy,message,room,siteId') throw new Error('fields: ' + Object.keys(d).sort());
    if (d.message !== 'Screen number 427: please come to Juniors' || d.code !== '427' || d.room !== 'Junior Room' || d.siteId !== 'site_kids' || d.clearedAt !== null) throw new Error(JSON.stringify(d));
    if (typeof d.createdAt.toMillis !== 'function' || Math.abs(d.createdAt.toMillis() - Date.now()) > 120000) throw new Error('createdAt is not server time');
    if (/Cat|Synthetic/.test(JSON.stringify(d))) throw new Error('a name on the screen');
  });
  await check('a list that does not ask for uncleared pages is refused', 'deny', () => getDocs(query(collection(ctx('u_wes'), 'screenPages'), where('siteId', '==', 'site_kids'))));
  await check('nobody signed out reads them', 'deny', () => getDocs(query(collection(env.unauthenticatedContext().firestore(), 'screenPages'), where('siteId', '==', 'site_kids'), where('clearedAt', '==', null))));
  await check('the Session Leader pages too, this morning', 'allow', () => setDoc(doc(ctx('u_sam'), 'screenPages', PID), PAGE('u_sam')));
  await check('"Done" may not change anything but clearedAt', 'deny', () => updateDoc(doc(ctx('u_jo'), 'screenPages', PID), { clearedAt: serverTimestamp(), code: 'Q7P2' }));
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
  /* leaderInfo: each named leader's details by member id (the spoofed-name fix, F-287) */
  const INFO = (people) => Object.fromEntries([...new Set(people.filter(Boolean))].map((p) => [p, { name: p, role: 'helper', uid: '' }]));
  const U18 = (people, cleared, last, extra) => ({ leaders: people.map(x => P_(x)), leaderUids: [], leaderIds: people, leaderInfo: INFO(people), siteId: 'site_kids', under18: true,
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
  /* S3: no limit of 20 leaders (it was checked one by one); what a record holds, 500 */
  const many = (n) => Array.from({ length: n }, (x, i) => 'm_many' + i);
  await check('S3 MANY: 25 LEADERS NAMED ON AN UNDER-18s EVENT (the old limit was 20)', 'allow', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), U18(many(25), [], [])));
  await check('S3 many: not 501', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), U18(many(501), [], [])));
  await check('F-287 LEADER INFO: a record naming members without each one’s details by member id is refused', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), { ...U18(['m_tia', 'm_ned'], [], []), under18: false, leaderInfo: {} }));
  await check('F-287: nor details for someone not named (so a name can’t be kept beside another member’s checks)', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), { ...U18(['m_tia'], [], []), under18: false, leaderInfo: { m_tia: { name: 'Tia', role: 'helper', uid: '' }, m_ned: { name: 'Ned', role: 'helper', uid: '' } } }));
  await check('F-287: nor one named member’s details missing', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), { ...U18(['m_tia', 'm_ned'], [], []), under18: false, leaderInfo: { m_tia: { name: 'Tia', role: 'helper', uid: '' } } }));
  await check('F-287: someone not in the address book stays in leaders only, with no details kept', 'allow', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), { ...U18(['m_tia', ''], [], []), under18: false }));
  await check('S3 many: nor one person twice', 'deny', () => setDoc(doc(as('karen'), 'eventLeaders', 'ev_puppet'), U18(['m_many1', 'm_many2', 'm_many1'], [], [])));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'eventLeaders', 'ev_puppet'), { ...U18(['m_tia', 'm_ned'], [], []), under18: false }); });
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
    await setDoc(doc(db, 'settings', 'accounts'), { mode: 'none', invoiceNumbersBy: 'hub', payText: 'Bank: invented', payDays: 14 });
    /* a fourth site, where three were all that were checked before (H&S step 2b) */
    await setDoc(doc(db, 'bookingSettings', 'site_off4'), { bookingsAdmins: ['m_office'], safeguardingLead: '', safeguardingDeputy: '' });
    for (const s of ['site_off', 'site_off4', 'site_notmine']) await setDoc(doc(db, 'accountsFor', s), { mode: 'none', invoiceNumbersBy: 'hub', payText: 'Bank: invented', payDays: 14, updatedAt: 'x' }); });
  const ACC = (extra) => ({ mode: 'calla', invoiceNumbersBy: 'hub', payText: 'Bank: invented', payDays: 14, updatedAt: 'x', ...(extra || {}) });
  await check('F-108: an admin reads the accounts setting', 'allow', () => getDoc(doc(as('karen'), 'settings', 'accounts')));
  await check('F-108: the office reads its own site’s copy', 'allow', () => getDoc(doc(ctx('u_office'), 'accountsFor', 'site_off')));
  await check('  ANY NUMBER OF SITES: a fourth site’s bookings admin reads that site’s copy', 'allow', () => getDoc(doc(ctx('u_office'), 'accountsFor', 'site_off4')));
  await check('  not a site it is not the office of', 'deny', () => getDoc(doc(ctx('u_office'), 'accountsFor', 'site_notmine')));
  await check('  nor the church-wide setting itself (admins only)', 'deny', () => getDoc(doc(ctx('u_office'), 'settings', 'accounts')));
  await check('F-108: A MEMBER WHO IS NOT THE OFFICE DOES NOT', 'deny', () => getDoc(doc(as('samy'), 'accountsFor', 'site_off')));
  await check('  an admin writes a site’s copy', 'allow', () => setDoc(doc(as('karen'), 'accountsFor', 'site_off'), ACC()));
  await check('  a bookings admin cannot', 'deny', () => setDoc(doc(ctx('u_office'), 'accountsFor', 'site_off'), ACC({ mode: 'none' })));
  await check('  only the setting’s own fields', 'deny', () => setDoc(doc(as('karen'), 'accountsFor', 'site_off'), ACC({ officeSites: ['x'] })));
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
    await setDoc(doc(db, 'calEvents', 'ev_w_cm'), { ...EV(['churchMembers'], 'churchMembers'), signupOn: true });   // taking sign-ups (F-265's gap: the rules now ask)
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
  /* THE HUB'S ADDRESS IS MADE, NEVER TYPED (Martin, 26 Oct 2026;
     functions/hub-address.js). No page sets it, not even a master admin;
     one typed in on 25 Oct is kept as it is. */
  await check('HUB ADDRESS: not even a master admin types one in', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'details'), D({ hubUrl: 'https://hub.example.invalid/', updatedBy: 'u_martin' })));
  await check('  nor an admin', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ hubUrl: 'https://hub.example.invalid/' })));
  await check('  saving the rest without it is fine', 'allow', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D()));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'churchSettings', 'details'), D({ hubUrl: 'https://typed-on-25-oct.example.invalid/' })); });
  await check('  one typed in before is kept: saving with it as it is', 'allow', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ hubUrl: 'https://typed-on-25-oct.example.invalid/' })));
  await check('  but a master admin cannot change it', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'details'), D({ hubUrl: 'https://elsewhere.example.invalid/', updatedBy: 'u_martin' })));
  await check('  nor clear it', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'details'), D({ hubUrl: '', updatedBy: 'u_martin' })));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'churchSettings', 'details'), D()); });
  /* The minister's title (Comms' C-53): any admin; a word for a sentence. */
  await check('MINISTER\'S TITLE: an admin sets it', 'allow', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ ministerTitle: 'vicar' })));
  await check('  or leaves it empty ("minister")', 'allow', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ ministerTitle: '' })));
  await check('  never longer than 40', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ ministerTitle: 'x'.repeat(41) })));
  await check('  never markup', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ ministerTitle: '<b>vicar</b>' })));
  await check('  nor a list', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'details'), D({ ministerTitle: ['vicar'] })));
  /* Team jobs (H-9): which teams do each job. A master admin's. */
  const TJ = (extra) => ({ office: ['Church office'], trustees: ['Elders', 'Deacons'], welcome: [], updatedAt: 'x', updatedBy: 'u_martin', ...(extra || {}) });
  await check('TEAM JOBS: a master admin says which teams do each job', 'allow', () => setDoc(doc(as('martin'), 'churchSettings', 'teamJobs'), TJ()));
  await check('  anyone reads them (team ids only)', 'allow', () => getDoc(doc(anon(), 'churchSettings', 'teamJobs')));
  await check('  an admin who is not a master cannot', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'teamJobs'), TJ({ updatedBy: 'u_karen' })));
  await check('  only the 15 jobs', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'teamJobs'), TJ({ bellringing: ['Ringers'] })));
  await check('  each a list of teams', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'teamJobs'), TJ({ office: 'Church office' })));
  await check('  up to 500 teams for one job', 'allow', () => setDoc(doc(as('martin'), 'churchSettings', 'teamJobs'), TJ({ buildings: Array.from({ length: 500 }, (_, i) => 'Site team ' + i) })));
  await check('  never more', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'teamJobs'), TJ({ buildings: Array.from({ length: 501 }, (_, i) => 'Site team ' + i) })));
  /* APPS AND DOWNLOADS (hubresources.html, 26 Oct 2026): read by anybody signed in, changed by master admins only. */
  await check('APPS AND DOWNLOADS: a member reads the list', 'allow', () => getDoc(doc(as('samy'), 'hub_resources', 'r1')));
  await check('  nobody signed out does', 'deny', () => getDoc(doc(anon(), 'hub_resources', 'r1')));
  await check('  a member cannot change it', 'deny', () => setDoc(doc(as('samy'), 'hub_resources', 'r1'), { name: 'x', type: 'link', url: 'https://example.invalid' }));
  await check('  nor an admin who is not a master', 'deny', () => setDoc(doc(as('karen'), 'hub_resources', 'r1'), { name: 'x', type: 'link', url: 'https://example.invalid' }));
  await check('  a master admin can', 'allow', () => setDoc(doc(as('martin'), 'hub_resources', 'r1'), { name: 'x', type: 'link', url: 'https://example.invalid' }));
  /* PERMISSIONS (H-14): the ticks, one exception, the history. */
  const PM = (a) => ({ actions: { kbUpload: Object.assign({ jobs: [], coresOf: ['worship'], adminJobs: ['av', 'worship'], teams: [], leaders: false }, a || {}) }, updatedAt: 'x', updatedBy: 'u_martin' });
  await check('PERMISSIONS: a master admin ticks who may upload', 'allow', () => setDoc(doc(as('martin'), 'churchSettings', 'permissions'), PM()));
  await check('  anyone signed in reads the ticks (no names in them)', 'allow', () => getDoc(doc(as('samy'), 'churchSettings', 'permissions')));
  await check('  an admin who is not a master cannot change them (answer 5)', 'deny', () => setDoc(doc(as('karen'), 'churchSettings', 'permissions'), PM({ teams: ['Kids Church'] })));
  await check('  only the actions the hub knows', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'permissions'), { actions: { launchRockets: {} }, updatedAt: 'x', updatedBy: 'u_martin' }));
  await check('  "leaders" is yes or no', 'deny', () => setDoc(doc(as('martin'), 'churchSettings', 'permissions'), PM({ leaders: 'yes' })));
  const PX = (extra) => Object.assign({ action: 'kbUpload', memberId: 'm_u_samy', uid: 'u_samy', name: 'Samy', by: 'u_martin', byName: 'Martin', at: 'now', until: '2026-12-31', why: 'Runs the AV desk on Sundays' }, extra || {});
  await check('  a master admin gives one person one action (an exception)', 'allow', () => setDoc(doc(as('martin'), 'permissionExceptions', 'kbUpload_m_u_samy'), PX()));
  await check('  the person reads their own', 'allow', () => getDoc(doc(as('samy'), 'permissionExceptions', 'kbUpload_m_u_samy')));
  await check('  nobody else does', 'deny', () => getDoc(doc(as('karen'), 'permissionExceptions', 'kbUpload_m_u_samy')));
  await check('  nor gives one', 'deny', () => setDoc(doc(as('karen'), 'permissionExceptions', 'kbUpload_m_u_karen'), PX({ memberId: 'm_u_karen', by: 'u_karen' })));
  await check('  one per person per action: the id says which', 'deny', () => setDoc(doc(as('martin'), 'permissionExceptions', 'something_else'), PX()));
  await check('  an end date is a date, or none', 'deny', () => setDoc(doc(as('martin'), 'permissionExceptions', 'kbUpload_m_u_samy'), PX({ until: 'Easter' })));
  await check('  none is fine (answer 3)', 'allow', () => setDoc(doc(as('martin'), 'permissionExceptions', 'kbUpload_m_u_samy'), PX({ until: '' })));
  await check('  every change is kept, by a master admin', 'allow', () => setDoc(doc(as('martin'), 'permissionsLog', 'l1'), { at: 'now', by: 'u_martin', byName: 'Martin', action: 'kbUpload', change: 'added', memberId: 'm_u_samy', name: 'Samy', before: null, after: 'until 2026-12-31' }));
  await check('  and never altered', 'deny', () => setDoc(doc(as('martin'), 'permissionsLog', 'l1'), { at: 'now', by: 'u_martin', byName: 'Martin', action: 'kbUpload', change: 'removed', memberId: 'm_u_samy', name: 'Samy', before: null, after: null }));
  await check('  nor read by anyone but master admins', 'deny', () => getDoc(doc(as('karen'), 'permissionsLog', 'l1')));
  /* MEETINGS (27 Oct 2026): "See and join every video meeting", never on
     by default. Whoever has it reads the rota, though on no team. */
  const KEY = AS_CHURCH || 'egbc';
  const withPerms = (list) => env.authenticatedContext('u_member', { perms: { [KEY]: list } }).firestore();
  await check('MEETINGS: a master admin ticks who may see every meeting', 'allow', () => setDoc(doc(as('martin'), 'churchSettings', 'permissions'), { actions: { meetingsAll: { jobs: [], coresOf: [], adminJobs: [], teams: [], leaders: false } }, updatedAt: 'x', updatedBy: 'u_martin' }));
  await check('  or gives it to one person', 'allow', () => setDoc(doc(as('martin'), 'permissionExceptions', 'meetingsAll_m_u_member'), PX({ action: 'meetingsAll', memberId: 'm_u_member', uid: 'u_member', name: 'Member', until: '' })));
  await check('  a member on no team does not read the rota', 'deny', () => getDoc(doc(as('member'), 'events', 'e1')));
  await check('  with it on their sign-in, they do', 'allow', () => getDoc(doc(withPerms(['meetingsAll']), 'events', 'e1')));
  await check('  another action on their sign-in is not it', 'deny', () => getDoc(doc(withPerms(['kbUpload']), 'events', 'e1')));
}

// ── GIVING ── the church's bank details (Martin, 12 Oct 2026)
//
// THESE NUMBERS ARE NOT THE CHURCH'S. They are nonsense on purpose, and
// they must stay nonsense: the repository is public, and a sort code in
// a test file is a sort code on the internet. Martin or Val type the
// real ones into the settings page once it is live.
//
// What the rules have to guarantee is the pair: `details` stays readable
// by people who have not signed in, because the login page and the
// public hire pages draw the church's name from it, while `giving` is
// not. Both live on the same path, and one `match` block decides both.
{
  const G = (extra) => ({
    accountName: 'Test Church Account', sortCode: '00-00-00', accountNumber: '00000000',
    reference: 'YOUR NAME', giftAid: true, giftAidUrl: 'https://example.invalid/giftaid',
    note: '', updatedAt: 'x', updatedBy: 'u_church_office', ...(extra || {}),
  });
  await check('the church office sets the bank details', 'allow',
    () => setDoc(doc(as('churchOffice'), 'churchSettings', 'giving'), G()));
  await check('so does a master admin', 'allow',
    () => setDoc(doc(as('martin'), 'churchSettings', 'giving'), G({ updatedBy: 'u_martin' })));
  /* THE ONE THAT MATTERS. An account number on a world-readable document
     is an invitation to a convincing fake, and nobody needs it before
     signing in. If a second match block is ever added on this path they
     are ORed, `details` says `if true`, and this check is what notices. */
  await check('nobody who has not signed in can read them', 'deny',
    () => getDoc(doc(anon(), 'churchSettings', 'giving')));
  await check('but anyone signed in can, which is the point of them', 'allow',
    () => getDoc(doc(as('samy'), 'churchSettings', 'giving')));
  await check('and the church details are still public, alongside them', 'allow',
    () => getDoc(doc(anon(), 'churchSettings', 'details')));
  /* Deliberately not every admin: a Kids Church admin has no business
     changing where the church's money goes. */
  await check('an admin of a team cannot change where the money goes', 'deny',
    () => setDoc(doc(as('karen'), 'churchSettings', 'giving'), G({ updatedBy: 'u_karen' })));
  await check('nor can a member', 'deny',
    () => setDoc(doc(as('samy'), 'churchSettings', 'giving'), G({ updatedBy: 'u_samy' })));
  await check('nor can Core Team, who are not the office', 'deny',
    () => setDoc(doc(as('core'), 'churchSettings', 'giving'), G({ updatedBy: 'u_core' })));
  await check('an unexpected field is refused', 'deny',
    () => setDoc(doc(as('churchOffice'), 'churchSettings', 'giving'), G({ password: 'x' })));
  await check('the account number has to be a string, not a number', 'deny',
    () => setDoc(doc(as('churchOffice'), 'churchSettings', 'giving'), G({ accountNumber: 12345678 })));
  await check('a reference nobody could type is refused', 'deny',
    () => setDoc(doc(as('churchOffice'), 'churchSettings', 'giving'), G({ reference: 'x'.repeat(61) })));
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

// ── EVENTS (events window) ── Watch: the YouTube channel, members-only services, the live link (NEXT-BRIEF §24 item 5; F-163)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', 'u_watcher'), { uid: 'u_watcher', memberId: 'm_watcher', status: 'active', name: 'Wes Watcher', teams: [], adminFor: [], masterAdmin: false, attender: true });
    await setDoc(doc(db, 'users', 'u_cmember'), { uid: 'u_cmember', memberId: 'm_cmember', status: 'active', name: 'Cam Member', teams: [], adminFor: [], masterAdmin: false, attender: true, churchMember: true });
    /* A channel video exactly as the hub function writes it. */
    await setDoc(doc(db, 'videos', 'yt_aaaaaaaaaa1'), { source: 'feed', videoId: 'aaaaaaaaaa1', title: 'Harvest (invented)', published: '2026-10-04T10:30:00Z', thumb: '', description: '', hidden: false, createdAt: 'x', updatedAt: 'x' });
  });
  const MV = (vid, extra) => ({ source: 'members', videoId: vid, url: 'https://youtu.be/' + vid, title: 'Full service, 11 Oct (invented)', date: '2026-10-11', audience: 'signedIn',
    note: '', hidden: false, addedBy: 'u_preach', addedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...(extra || {}) });
  const NOW = Date.now();
  const LIVE = (who, extra) => ({ url: 'https://www.youtube.com/live/llllllllll1', videoId: 'llllllllll1', title: 'Sunday morning', showFrom: NOW, showUntil: NOW + 6 * 3600e3,
    after: 'disappear', againUntil: 0, updatedAt: serverTimestamp(), updatedBy: who, ...(extra || {}) });
  const SET = (who, extra) => ({ channelId: 'UCf7lMnb24HfNJKGpMeYdQXQ', untilDay: 0, untilTime: '16:00', after: 'disappear', againDays: 7, updatedAt: serverTimestamp(), updatedBy: who, ...(extra || {}) });

  /* who looks after it: the sermon people (Pat, named above) */
  await check('WATCH: the person who looks after sermons adds a members-only full service (an unlisted link)', 'allow', () => setDoc(doc(ctx('u_preach'), 'videos', 'mv_mmmmmmmmmm1'), MV('mmmmmmmmmm1')));
  await check('SOMEONE NOT NAMED CANNOT, not even an admin of another area', 'deny', () => setDoc(doc(as('karen'), 'videos', 'mv_mmmmmmmmmm2'), MV('mmmmmmmmmm2', { addedBy: 'u_karen' })));
  await check('its document is its video\'s own (no second copy under another id)', 'deny', () => setDoc(doc(ctx('u_preach'), 'videos', 'mv_other'), MV('mmmmmmmmmm3')));
  await check('only a YouTube link', 'deny', () => setDoc(doc(ctx('u_preach'), 'videos', 'mv_mmmmmmmmmm4'), MV('mmmmmmmmmm4', { url: 'https://example.invalid/mmmmmmmmmm4' })));
  await check('NO PAGE CAN MAKE A CHANNEL VIDEO (only the function reads the feed)', 'deny', () => setDoc(doc(ctx('u_preach'), 'videos', 'yt_zzzzzzzzzz9'),
    { source: 'feed', videoId: 'zzzzzzzzzz9', title: 'Fake', published: 'x', thumb: '', description: '', hidden: false, createdAt: 'x', updatedAt: 'x' }));
  await check('the office may hide a channel video', 'allow', () => updateDoc(doc(ctx('u_preach'), 'videos', 'yt_aaaaaaaaaa1'), { hidden: true }));
  await check('but not rename it (the feed owns that)', 'deny', () => updateDoc(doc(ctx('u_preach'), 'videos', 'yt_aaaaaaaaaa1'), { title: 'Renamed' }));
  await check('nor delete it', 'deny', () => deleteDoc(doc(ctx('u_preach'), 'videos', 'yt_aaaaaaaaaa1')));

  /* who reads */
  await check('a channel video is public (it is on YouTube already)', 'allow', () => getDoc(doc(guest(), 'videos', 'yt_aaaaaaaaaa1')));
  await check('THE MEMBERS\' FULL SERVICE: NOT SIGNED OUT', 'deny', () => getDoc(doc(guest(), 'videos', 'mv_mmmmmmmmmm1')));
  await check('nor a list of them', 'deny', () => getDocs(query(collection(guest(), 'videos'), where('source', '==', 'members'))));
  await check('everyone signed in sees it (the default)', 'allow', () => getDoc(doc(ctx('u_watcher'), 'videos', 'mv_mmmmmmmmmm1')));
  await check('and lists them', 'allow', () => getDocs(query(collection(ctx('u_watcher'), 'videos'), where('source', '==', 'members'), where('audience', '==', 'signedIn'))));
  await check('one for church members only', 'allow', () => setDoc(doc(ctx('u_preach'), 'videos', 'mv_cccccccccc1'), MV('cccccccccc1', { audience: 'churchMembers' })));
  await check('is not seen by an attender', 'deny', () => getDoc(doc(ctx('u_watcher'), 'videos', 'mv_cccccccccc1')));
  await check('is seen by a church member', 'allow', () => getDoc(doc(ctx('u_cmember'), 'videos', 'mv_cccccccccc1')));
  await check('the office may take one away', 'allow', () => deleteDoc(doc(ctx('u_preach'), 'videos', 'mv_cccccccccc1')));

  /* the live link */
  await check('THE LIVE LINK: the office sets this week\'s', 'allow', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'live'), LIVE('u_preach')));
  await check('IT IS NEVER READ SIGNED OUT', 'deny', () => getDoc(doc(guest(), 'watchShow', 'live')));
  await check('everyone signed in reads it', 'allow', () => getDoc(doc(ctx('u_watcher'), 'watchShow', 'live')));
  await check('someone not named cannot set it', 'deny', () => setDoc(doc(as('karen'), 'watchShow', 'live'), LIVE('u_karen')));
  await check('it ends after it starts', 'deny', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'live'), LIVE('u_preach', { showUntil: NOW - 1 })));
  await check('"Watch again" needs its own end, after the card\'s', 'deny', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'live'), LIVE('u_preach', { after: 'again', againUntil: NOW })));
  await check('with one, it is fine', 'allow', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'live'), LIVE('u_preach', { after: 'again', againUntil: NOW + 7 * 864e5 })));
  await check('only a YouTube link', 'deny', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'live'), LIVE('u_preach', { url: 'https://example.invalid/live' })));
  await check('taken away: an empty link', 'allow', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'live'), { url: '', updatedAt: serverTimestamp(), updatedBy: 'u_preach' }));

  /* the church's choices */
  await check('THE CHURCH\'S SETTINGS: the channel and the live card\'s defaults', 'allow', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'settings'), SET('u_preach')));
  await check('a channel id is a channel id', 'deny', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'settings'), SET('u_preach', { channelId: 'https://youtube.com/@x' })));
  await check('shown from the start of the day of the service', 'allow', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'settings'), SET('u_preach', { fromTime: '00:00' })));
  await check('but never from after it ends', 'deny', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'settings'), SET('u_preach', { fromTime: '17:00' })));
  await check('a day of the week is 0 to 6', 'deny', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'settings'), SET('u_preach', { untilDay: 7 })));
  await check('read signed in only', 'deny', () => getDoc(doc(guest(), 'watchShow', 'settings')));
  await check('the feed\'s status is the function\'s alone', 'deny', () => setDoc(doc(ctx('u_preach'), 'watchShow', 'feedStatus'), { ok: true }));
}

// ── EVENTS (events window) ── the public What's on: public / members only / NOT LISTED (NEXT-BRIEF §24 item 13; F-165)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  const T = Date.now() + 5 * 864e5;
  const EV = (title, visibility, audience, extra) => ({ title, visibility, audience, status: 'confirmed', startUtc: T, endUtc: T + 3600e3, createdBy: 'u_martin', teams: [], ...(extra || {}) });
  /* A master admin makes them, as events-admin does. */
  await check('NOT LISTED: an admin makes a not-listed event (a church meeting)', 'allow', () => setDoc(doc(as('martin'), 'calEvents', 'ev_unl'), EV('Church meeting (invented)', 'unlisted', ['unlisted'])));
  await check('one marked not listed cannot also be public', 'deny', () => setDoc(doc(as('martin'), 'calEvents', 'ev_unl2'), EV('AA (invented)', 'unlisted', ['unlisted', 'public'])));
  await check('a public one', 'allow', () => setDoc(doc(as('martin'), 'calEvents', 'ev_pubw'), EV('Harvest supper (invented)', 'public', ['public', 'members'])));
  // A Sunday service from the rota is the server's (rotaWhatsOn; F-218 from the main window).
  await check('ROTA SERVICE: not even a master admin makes one by hand (rota_...)', 'deny', () => setDoc(doc(as('martin'), 'calEvents', 'rota_svc1'), EV('Morning service (invented)', 'public', ['public', 'members'])));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'calEvents', 'rota_svc2'), { ...EV('Morning service (invented)', 'public', ['public', 'members']), source: 'rota', createdBy: 'rota' }); });
  await check('  nor changes one', 'deny', () => updateDoc(doc(as('martin'), 'calEvents', 'rota_svc2'), { title: 'Changed' }));
  await check('  nor deletes one', 'deny', () => deleteDoc(doc(as('martin'), 'calEvents', 'rota_svc2')));
  await check('  but everyone reads it (it is public)', 'allow', () => getDoc(doc(as('martin'), 'calEvents', 'rota_svc2')));
  await check('NOBODY SIGNED OUT READS THE NOT-LISTED ONE', 'deny', () => getDoc(doc(guest(), 'calEvents', 'ev_unl')));
  await check('nor an attender', 'deny', () => getDoc(doc(ctx('u_watcher'), 'calEvents', 'ev_unl')));
  await check('the admins read it (events-admin)', 'allow', () => getDoc(doc(as('karen'), 'calEvents', 'ev_unl')));
  await check('the public list (the website\'s embeds) is allowed signed out', 'allow', () => getDocs(query(collection(guest(), 'calEvents'), where('audience', 'array-contains', 'public'))));
  let pub = [];
  await env.withSecurityRulesDisabled(async (c) => { pub = (await getDocs(query(collection(c.firestore(), 'calEvents'), where('audience', 'array-contains', 'public')))).docs.map(d => d.id); });
  await check('AND IT NEVER HOLDS A NOT-LISTED EVENT', 'allow', async () => { if (pub.includes('ev_unl') || !pub.includes('ev_pubw')) throw new Error('wrong list: ' + pub.join()); });
  await check('nor can anyone signed out ask for the not-listed ones', 'deny', () => getDocs(query(collection(guest(), 'calEvents'), where('audience', 'array-contains', 'unlisted'))));
  await check('nor an attender', 'deny', () => getDocs(query(collection(ctx('u_watcher'), 'calEvents'), where('audience', 'array-contains', 'unlisted'))));
}

// ── EVENTS (events window) ── prayer requests and answers to prayer (NEXT-BRIEF §24 item 11; F-166)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const U = (uid, mid, teams) => setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor: [], masterAdmin: false, attender: true });
    await U('u_asker', 'm_asker', []);
    await U('u_other', 'm_other', []);
    await U('u_pasto', 'm_pasto', ['Pastoral']);
    await U('u_prayt', 'm_prayt', ['Prayer Team']);
  });
  const PR = (who, share, extra) => ({ by: who, byName: 'Asker (invented)', text: 'Please pray for my mum’s operation (invented).', share, at: serverTimestamp(), answered: false, answer: '', answeredAt: null, ...(extra || {}) });
  await check('PRAYER: anyone in the address book asks for prayer, pastoral team only', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_1'), PR('u_asker', 'pastoral')));
  await check('and one for the prayer team too', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_2'), PR('u_asker', 'prayerTeam')));
  await check('not in someone else’s name', 'deny', () => setDoc(doc(ctx('u_other'), 'prayers', 'pr_3'), PR('u_asker', 'pastoral')));
  await check('not signed out', 'deny', () => setDoc(doc(guest(), 'prayers', 'pr_4'), PR('nobody', 'pastoral')));
  await check('the person reads their own', 'allow', () => getDoc(doc(ctx('u_asker'), 'prayers', 'pr_1')));
  await check('the pastoral team reads it', 'allow', () => getDoc(doc(ctx('u_pasto'), 'prayers', 'pr_1')));
  await check('and lists them all', 'allow', () => getDocs(collection(ctx('u_pasto'), 'prayers')));
  await check('A PASTORAL-ONLY REQUEST: NOT ANYONE ELSE', 'deny', () => getDoc(doc(ctx('u_other'), 'prayers', 'pr_1')));
  await check('NOT A MASTER ADMIN', 'deny', () => getDoc(doc(as('martin'), 'prayers', 'pr_1')));
  await check('not the prayer team before the church names one', 'deny', () => getDoc(doc(ctx('u_prayt'), 'prayers', 'pr_2')));
  await check('a master admin names the prayer team', 'allow', () => setDoc(doc(as('martin'), 'prayerSettings', 'main'), { prayerTeam: 'Prayer Team', updatedAt: serverTimestamp(), updatedBy: 'u_martin' }));
  await check('nobody else can', 'deny', () => setDoc(doc(ctx('u_pasto'), 'prayerSettings', 'main'), { prayerTeam: 'Pastoral', updatedAt: serverTimestamp(), updatedBy: 'u_pasto' }));
  await check('now the prayer team reads one shared with it', 'allow', () => getDoc(doc(ctx('u_prayt'), 'prayers', 'pr_2')));
  await check('and lists those', 'allow', () => getDocs(query(collection(ctx('u_prayt'), 'prayers'), where('share', '==', 'prayerTeam'))));
  await check('BUT NEVER ONE FOR THE PASTORAL TEAM ONLY', 'deny', () => getDoc(doc(ctx('u_prayt'), 'prayers', 'pr_1')));
  await check('nor all of them', 'deny', () => getDocs(collection(ctx('u_prayt'), 'prayers')));
  await check('the person marks it answered', 'allow', () => updateDoc(doc(ctx('u_asker'), 'prayers', 'pr_1'), { answered: true, answer: 'Went well (invented).', answeredAt: serverTimestamp() }));
  await check('but cannot change what was asked, or who sees it', 'deny', () => updateDoc(doc(ctx('u_asker'), 'prayers', 'pr_1'), { share: 'prayerTeam' }));
  await check('the pastoral team cannot change it', 'deny', () => updateDoc(doc(ctx('u_pasto'), 'prayers', 'pr_1'), { answered: false, answer: '', answeredAt: serverTimestamp() }));
  // Sunday (Martin, 15 Oct)
  await check('PRAYER, SUNDAY: a request may say yes, with the name', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_sun1'), PR('u_asker', 'pastoral', { sunday: 'named' })));
  await check('  or without it', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_sun2'), PR('u_asker', 'pastoral', { sunday: 'anon' })));
  await check('  or no', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_sun3'), PR('u_asker', 'pastoral', { sunday: 'no' })));
  await check('  but nothing else', 'deny', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_sun4'), PR('u_asker', 'pastoral', { sunday: 'everyone' })));
  await check('  the person changes their mind', 'allow', () => updateDoc(doc(ctx('u_asker'), 'prayers', 'pr_sun1'), { sunday: 'no' }));
  await check('  THE PASTORAL TEAM CANNOT MARK ONE FOR SUNDAY', 'deny', () => updateDoc(doc(ctx('u_pasto'), 'prayers', 'pr_sun3'), { sunday: 'named' }));
  await check('  nor change the person’s choice of name', 'deny', () => updateDoc(doc(ctx('u_pasto'), 'prayers', 'pr_sun2'), { sunday: 'named' }));
  // For Sunday (F-222): the service leader and the Pastor read the list, never the requests.
  {
    const { Timestamp } = await import('firebase/firestore');
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore();
      await setDoc(doc(d, 'users', 'u_sally'), { uid: 'u_sally', memberId: 'm_sally', status: 'active', name: 'Sally', teams: [], adminFor: [], masterAdmin: false });
      await setDoc(doc(d, 'users', 'u_lou'), { uid: 'u_lou', memberId: 'm_lou', status: 'active', name: 'Lou', teams: [], adminFor: [], masterAdmin: false });
      await setDoc(doc(d, 'users', 'u_pat'), { uid: 'u_pat', memberId: 'm_pat', status: 'active', name: 'Pat', teams: [], adminFor: [], masterAdmin: false });
      await setDoc(doc(d, 'teamMailSettings', 'main'), { pastor: 'm_pat', officeAdmin: '' });
      await setDoc(doc(d, 'prayerSundayList', 'now'), { sunday: 'x', from: Timestamp.fromMillis(Date.now() - 864e5), until: Timestamp.fromMillis(Date.now() + 864e5), leaderMemberIds: ['m_sally'], items: [], updatedAt: 'x' });
      await setDoc(doc(d, 'prayerSundayList', 'last'), { sunday: 'y', from: Timestamp.fromMillis(Date.now() - 9 * 864e5), until: Timestamp.fromMillis(Date.now() - 4 * 864e5), leaderMemberIds: ['m_lou'], items: [], updatedAt: 'x' });
      await setDoc(doc(d, 'prayerSundayList', 'next'), { sunday: 'z', from: Timestamp.fromMillis(Date.now() + 2 * 864e5), until: Timestamp.fromMillis(Date.now() + 6 * 864e5), leaderMemberIds: ['m_sally'], items: [], updatedAt: 'x' });
    });
    await check('FOR SUNDAY: this Sunday’s service leader reads its list, in its window', 'allow', () => getDoc(doc(ctx('u_sally'), 'prayerSundayList', 'now')));
    await check('  but not before the Wednesday', 'deny', () => getDoc(doc(ctx('u_sally'), 'prayerSundayList', 'next')));
    await check('  LAST WEEK’S SERVICE LEADER IS REFUSED', 'deny', () => getDoc(doc(ctx('u_lou'), 'prayerSundayList', 'last')));
    await check('  nor this Sunday’s list, not being its leader', 'deny', () => getDoc(doc(ctx('u_lou'), 'prayerSundayList', 'now')));
    await check('  the service leader reads no prayer request', 'deny', () => getDoc(doc(ctx('u_sally'), 'prayers', 'pr_sun3')));
    await check('  THE PASTOR reads For Sunday, any week', 'allow', () => getDoc(doc(ctx('u_pat'), 'prayerSundayList', 'last')));
    await check('  and next week’s', 'allow', () => getDoc(doc(ctx('u_pat'), 'prayerSundayList', 'next')));
    await check('  the Pastor reads no prayer request either', 'deny', () => getDoc(doc(ctx('u_pat'), 'prayers', 'pr_sun3')));
    await check('  someone else reads none', 'deny', () => getDoc(doc(ctx('u_other'), 'prayerSundayList', 'now')));
    await check('  a master admin as such reads none', 'deny', () => getDoc(doc(as('martin'), 'prayerSundayList', 'now')));
    await check('  nobody writes one (only the server)', 'deny', () => setDoc(doc(ctx('u_pat'), 'prayerSundayList', 'now'), { sunday: 'x', items: [] }));
  }
  await check('  and Sunday is not a way to change the words', 'deny', () => updateDoc(doc(ctx('u_asker'), 'prayers', 'pr_sun2'), { sunday: 'named', text: 'changed' }));
  await check('nor delete it', 'deny', () => deleteDoc(doc(ctx('u_pasto'), 'prayers', 'pr_1')));
  await check('the person takes it back', 'allow', () => deleteDoc(doc(ctx('u_asker'), 'prayers', 'pr_2')));

  const AN = (who, extra) => ({ by: who, byName: 'Asker (invented)', text: 'The operation went well. Thank you for praying (invented).', at: serverTimestamp(), hidden: false, ...(extra || {}) });
  await check('ANSWERS: the person shares an answer with the church', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayerAnswers', 'pa_1'), AN('u_asker')));
  await check('without a name too', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayerAnswers', 'pa_2'), AN('u_asker', { byName: '' })));
  await check('not in someone else’s name', 'deny', () => setDoc(doc(ctx('u_other'), 'prayerAnswers', 'pa_3'), AN('u_asker')));
  await check('everyone signed in reads the shared answers', 'allow', () => getDocs(query(collection(ctx('u_other'), 'prayerAnswers'), where('hidden', '==', false))));
  await check('NOT SIGNED OUT', 'deny', () => getDocs(query(collection(guest(), 'prayerAnswers'), where('hidden', '==', false))));
  await check('the pastoral team hides one', 'allow', () => updateDoc(doc(ctx('u_pasto'), 'prayerAnswers', 'pa_2'), { hidden: true }));
  await check('nobody else can', 'deny', () => updateDoc(doc(ctx('u_other'), 'prayerAnswers', 'pa_1'), { hidden: true }));
  await check('a hidden one is no longer read by others', 'deny', () => getDoc(doc(ctx('u_other'), 'prayerAnswers', 'pa_2')));

  /* F-178: who gets told may read; no safeguarding lead, no request. */
  let sgWas = null;
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const s = await getDoc(doc(db, 'safeguardingSettings', 'defaults')); sgWas = s.exists() ? s.data() : null;
    await setDoc(doc(db, 'safeguardingSettings', 'defaults'), { ...(sgWas || {}), leadSiteId: 'site_f178' });
    await setDoc(doc(db, 'bookingSettings', 'site_f178'), { bookingsAdmins: [], safeguardingLead: 'm_sglead', safeguardingDeputy: '' });
    await setDoc(doc(db, 'users', 'u_sglead'), { uid: 'u_sglead', memberId: 'm_sglead', status: 'active', name: 'Sian', teams: [], adminFor: [], masterAdmin: false, attender: true });
    await setDoc(doc(db, 'users', 'u_named'), { uid: 'u_named', memberId: 'm_named', status: 'active', name: 'Nadia', teams: [], adminFor: [], masterAdmin: false, attender: true });
    await setDoc(doc(db, 'prayers', 'pr_9'), PR('u_asker', 'pastoral', { at: new Date() }));
  });
  await check('WHO GETS TOLD: someone not named cannot read a request', 'deny', () => getDoc(doc(ctx('u_named'), 'prayers', 'pr_9')));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'careRouting', 'main'), { prayer: { memberIds: ['m_named'], email: '' }, updatedBy: 'x' }); });
  await check('  named for prayer requests, they read it', 'allow', () => getDoc(doc(ctx('u_named'), 'prayers', 'pr_9')));
  await check('  and list them all', 'allow', () => getDocs(collection(ctx('u_named'), 'prayers')));
  await check('  the safeguarding lead reads it', 'allow', () => getDoc(doc(ctx('u_sglead'), 'prayers', 'pr_9')));
  await check('  still not anyone else', 'deny', () => getDoc(doc(ctx('u_other'), 'prayers', 'pr_9')));
  await check('  with a lead set, a request is sent', 'allow', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_10'), PR('u_asker', 'pastoral')));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'safeguardingSettings', 'defaults'), { ...(sgWas || {}), leadSiteId: 'site_nolead' }); });
  await check('NO SAFEGUARDING LEAD: a request that would reach nobody is refused', 'deny', () => setDoc(doc(ctx('u_asker'), 'prayers', 'pr_11'), PR('u_asker', 'pastoral')));
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    if (sgWas) await setDoc(doc(db, 'safeguardingSettings', 'defaults'), sgWas); else await deleteDoc(doc(db, 'safeguardingSettings', 'defaults'));
    await deleteDoc(doc(db, 'careRouting', 'main'));
  });
}

// ── EVENTS (events window) ── "I'm new here" (NEXT-BRIEF §24 item 12; F-167)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', 'u_welc'), { uid: 'u_welc', memberId: 'm_welc', status: 'active', name: 'Wendy', teams: [], adminFor: [], masterAdmin: false, attender: true });
    await setDoc(doc(db, 'welcomeSettings', 'main'), { memberIds: ['m_welc'], updatedAt: 'x', updatedBy: 'x' });
  });
  const H = (extra) => ({ name: 'Vera Visitor (invented)', email: 'vera@example.invalid', phone: '', message: 'Hello!', contactMe: true, uid: '', at: serverTimestamp(), status: 'new', ...(extra || {}) });
  await check('NEW HERE: a visitor, not signed in, says hello', 'allow', () => setDoc(doc(guest(), 'welcomes', 'w_1'), H()));
  await check('just saying hello, with no contact details', 'allow', () => setDoc(doc(guest(), 'welcomes', 'w_2'), H({ email: '', contactMe: false })));
  await check('asking to be contacted needs an email or phone', 'deny', () => setDoc(doc(guest(), 'welcomes', 'w_3'), H({ email: '', phone: '' })));
  await check('nothing more than the hello', 'deny', () => setDoc(doc(guest(), 'welcomes', 'w_4'), H({ extra: 'x' })));
  await check('not already marked contacted', 'deny', () => setDoc(doc(guest(), 'welcomes', 'w_5'), H({ status: 'contacted' })));
  await check('signed out, not in someone’s name', 'deny', () => setDoc(doc(guest(), 'welcomes', 'w_6'), H({ uid: 'u_martin' })));
  await check('signed in, it carries their own uid', 'allow', () => setDoc(doc(ctx('u_other'), 'welcomes', 'w_7'), H({ uid: 'u_other' })));
  await check('A HELLO IS NOT READ SIGNED OUT', 'deny', () => getDoc(doc(guest(), 'welcomes', 'w_1')));
  await check('nor by the visitor who sent it', 'deny', () => getDoc(doc(ctx('u_other'), 'welcomes', 'w_7')));
  await check('nor by an attender', 'deny', () => getDocs(collection(ctx('u_asker'), 'welcomes')));
  await check('the welcomer the church chose reads them', 'allow', () => getDocs(collection(ctx('u_welc'), 'welcomes')));
  await check('and marks one contacted', 'allow', () => updateDoc(doc(ctx('u_welc'), 'welcomes', 'w_1'), { status: 'contacted', handledBy: 'u_welc', handledAt: serverTimestamp() }));
  await check('but cannot change what was said', 'deny', () => updateDoc(doc(ctx('u_welc'), 'welcomes', 'w_1'), { message: 'changed' }));
  await check('a master admin reads them', 'allow', () => getDoc(doc(as('martin'), 'welcomes', 'w_2')));
  await check('and only a master admin removes one', 'deny', () => deleteDoc(doc(ctx('u_welc'), 'welcomes', 'w_2')));
  await check('the email address is public (the page needs it)', 'allow', () => getDoc(doc(guest(), 'welcomeSettings', 'public')));
  await check('WHO THE WELCOMERS ARE IS NOT', 'deny', () => getDoc(doc(guest(), 'welcomeSettings', 'main')));
  await check('only a master admin chooses them', 'deny', () => setDoc(doc(ctx('u_welc'), 'welcomeSettings', 'main'), { memberIds: ['m_welc', 'm_other'], updatedAt: serverTimestamp(), updatedBy: 'u_welc' }));
  await check('a master admin does', 'allow', () => setDoc(doc(as('martin'), 'welcomeSettings', 'public'), { notifyEmail: 'welcome@example.invalid', updatedAt: serverTimestamp(), updatedBy: 'u_martin' }));
}

// ── EVENTS (events window) ── Gift Aid declarations (NEXT-BRIEF §24 item 6; F-169)
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const guest = () => env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const U = (uid, mid, teams) => setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor: [], masterAdmin: false, attender: true });
    await U('u_giver', 'm_giver', []);
    await U('u_nosy', 'm_nosy', []);
    await U('u_office', 'm_office', ['Church office']);
    await U('u_treas', 'm_treas', ['Finance']);
    await U('u_kadmin', 'm_kadmin', []);
  });
  const GA = (who, mid, extra) => ({ memberId: mid, title: 'Mrs', firstName: 'Gina', lastName: 'Giver (invented)', house: '12', address: 'Invented Road, Esher', postcode: 'KT10 9AA',
    source: 'app', taxpayer: true, wording: 'I want to Gift Aid any donations I make in the future, and have made in the past 4 years, to Test Green Church. I am a UK taxpayer…',
    declaredOn: '2026-10-14', declaredAt: serverTimestamp(), paperHeld: false, cancelled: false, cancelledOn: '', recordedBy: who, updatedAt: serverTimestamp(), updatedBy: who, ...(extra || {}) });
  await check('GIFT AID: a person declares, in the app, for themselves', 'allow', () => setDoc(doc(ctx('u_giver'), 'giftAid', 'ga_1'), GA('u_giver', 'm_giver')));
  await check('not for someone else', 'deny', () => setDoc(doc(ctx('u_nosy'), 'giftAid', 'ga_2'), GA('u_nosy', 'm_giver')));
  await check('not without saying they are a UK taxpayer', 'deny', () => setDoc(doc(ctx('u_giver'), 'giftAid', 'ga_3'), GA('u_giver', 'm_giver', { taxpayer: false })));
  await check('not without the words they agreed to', 'deny', () => setDoc(doc(ctx('u_giver'), 'giftAid', 'ga_4'), GA('u_giver', 'm_giver', { wording: '' })));
  await check('not with a postcode that is not one', 'deny', () => setDoc(doc(ctx('u_giver'), 'giftAid', 'ga_5'), GA('u_giver', 'm_giver', { postcode: 'nowhere' })));
  await check('not "on paper" by themselves', 'deny', () => setDoc(doc(ctx('u_giver'), 'giftAid', 'ga_6'), GA('u_giver', 'm_giver', { source: 'paper', paperHeld: true })));
  await check('not signed out', 'deny', () => setDoc(doc(guest(), 'giftAid', 'ga_7'), GA('x', 'm_giver')));
  await check('the person reads their own', 'allow', () => getDocs(query(collection(ctx('u_giver'), 'giftAid'), where('memberId', '==', 'm_giver'))));
  await check('THE DECLARATION IS NOT READ BY ANOTHER MEMBER', 'deny', () => getDoc(doc(ctx('u_nosy'), 'giftAid', 'ga_1')));
  await check('NOR BY AN ADMIN OF ANOTHER AREA', 'deny', () => getDoc(doc(as('karen'), 'giftAid', 'ga_1')));
  await check('nor signed out', 'deny', () => getDoc(doc(guest(), 'giftAid', 'ga_1')));
  await check('the church office reads them all', 'allow', () => getDocs(collection(ctx('u_office'), 'giftAid')));
  await check('the treasurer (Finance) reads them all', 'allow', () => getDocs(collection(ctx('u_treas'), 'giftAid')));
  await check('the office records a paper declaration, with the paper held', 'allow', () => setDoc(doc(ctx('u_office'), 'giftAid', 'ga_p'), GA('u_office', 'm_nosy', { source: 'paper', paperHeld: true, wording: '', declaredOn: '2024-03-01' })));
  await check('not without the paper held', 'deny', () => setDoc(doc(ctx('u_office'), 'giftAid', 'ga_p2'), GA('u_office', 'm_nosy', { source: 'paper', paperHeld: false, wording: '' })));
  await check('the person updates their address', 'allow', () => updateDoc(doc(ctx('u_giver'), 'giftAid', 'ga_1'), { house: '14', postcode: 'KT10 9AB', updatedAt: serverTimestamp(), updatedBy: 'u_giver' }));
  await check('but never what was declared, or when', 'deny', () => updateDoc(doc(ctx('u_giver'), 'giftAid', 'ga_1'), { declaredOn: '2020-01-01', updatedAt: serverTimestamp(), updatedBy: 'u_giver' }));
  await check('the person cancels it, from a date', 'allow', () => updateDoc(doc(ctx('u_giver'), 'giftAid', 'ga_1'), { cancelled: true, cancelledOn: '2026-10-20', updatedAt: serverTimestamp(), updatedBy: 'u_giver' }));
  await check('A CANCELLED ONE CANNOT BE BROUGHT BACK (declare again instead)', 'deny', () => updateDoc(doc(ctx('u_giver'), 'giftAid', 'ga_1'), { cancelled: false, cancelledOn: '', updatedAt: serverTimestamp(), updatedBy: 'u_giver' }));
  await check('declaring again makes a new one', 'allow', () => setDoc(doc(ctx('u_giver'), 'giftAid', 'ga_8'), GA('u_giver', 'm_giver', { declaredOn: '2026-11-01' })));
  await check('NOBODY DELETES ONE, not even a master admin (HMRC expects them kept)', 'deny', () => deleteDoc(doc(as('martin'), 'giftAid', 'ga_1')));
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
/* ── EVERYONE ON THE SUNDAY PLAN EMAIL CAN READ THE PLAN ─────────────
   Martin, 12 Oct 2026: "That includes the preachers and service leader."
   The link in the plan email goes to song-summary.html, and a preacher
   on no team was getting "No access" from their own email.

   u_preach is on NO team: teams [], adminFor [], not a master admin. So
   volunteer() is false for them and the ONLY thing that can let them in
   is being named on that Sunday's plan. */
{
  const preacher = () => env.authenticatedContext('u_preach').firestore();
  await check('a speaker on no team reads the plan for THEIR Sunday', 'allow',
    () => getDoc(doc(preacher(), 'services', 'sv_their_sunday')));
  await check('and the song summary the email links to', 'allow',
    () => getDoc(doc(preacher(), 'songSummaries', '2026-11-08')));
  /* THE ONE THAT MATTERS. Being on one Sunday is not being on the rota. */
  await check('but NOT another Sunday’s plan', 'deny',
    () => getDoc(doc(preacher(), 'services', 'sv_other_sunday')));
  await check('nor its song summary', 'deny',
    () => getDoc(doc(preacher(), 'songSummaries', '2026-11-15')));
  /* An AV member reads it because they are a volunteer, not because they
     are named - which is why the teams are deliberately NOT written into
     the audience list. */
  await check('somebody on AV reads it without being named on it', 'allow',
    () => getDoc(doc(as('av'), 'services', 'sv_their_sunday')));
  /* An Attender is on no team AND not on the plan. */
  await check('an Attender who is not on the email cannot read it', 'deny',
    () => getDoc(doc(as('attender'), 'services', 'sv_their_sunday')));
  await check('nor its song summary', 'deny',
    () => getDoc(doc(as('attender'), 'songSummaries', '2026-11-08')));
  /* BEING ON THE PLAN IS NOT BEING A PLANNER. */
  await check('and being named on it does not let them change it', 'deny',
    () => setDoc(doc(preacher(), 'services', 'sv_their_sunday'),
      { date: '2026-11-08', audience: ['u_preach'], order: [] }));
  /* The audience is a read gate, so it has to be a list of uids and not
     whatever a page felt like writing.

     AS SOMEBODY WHO CAN ACTUALLY WRITE. The first version of this used
     samy, who is on Worship Team but administers nothing - so the write
     was refused by the write rule and the assertion passed without ever
     reaching the shape check. Deliberately breaking audienceShape() to
     `return true` is what showed it: 1086/1086, unchanged. An assertion
     that passes with the thing it tests removed is not an assertion.
     A positive control sits beside it for the same reason. */
  await check('a planner writes a plan with a proper audience', 'allow',
    () => setDoc(doc(as('martin'), 'services', 'sv_shape'),
      { date: '2026-11-08', audience: ['u_preach'], audienceUnresolved: [] }));
  await check('but the audience has to be a list, not a name', 'deny',
    () => setDoc(doc(as('martin'), 'services', 'sv_shape2'),
      { date: '2026-11-08', audience: 'u_preach' }));
  await check('and what did not resolve has to be a list too', 'deny',
    () => setDoc(doc(as('martin'), 'services', 'sv_shape3'),
      { date: '2026-11-08', audience: [], audienceUnresolved: 'Pat' }));
}

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

/* A COMPUTER'S JOB (Martin, 19 Oct 2026). A Lessons-only computer - the
   Kids Church laptop - reads no service plan, song or rota; one doing main
   services does; one paired before jobs existed does main services. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'devices', 'churchshow-site_main-lessons'), {
    kind: 'churchshow', siteId: 'site_main', active: true, name: 'Kids laptop Synthetic',
    jobs: { services: false, lessonGroups: ['pg_kids'] } });
  await setDoc(doc(ctx.firestore(), 'devices', 'churchshow-site_main-both'), {
    kind: 'churchshow', siteId: 'site_main', active: true, name: 'Hall PC Synthetic',
    jobs: { services: true, lessonGroups: ['pg_kids'] } });
});
const csLessons = () => device('churchshow-site_main-lessons', 'site_main');
const csBoth = () => device('churchshow-site_main-both', 'site_main');
await check('JOBS: a Lessons-only computer reads no service plan', 'deny', () => getDoc(doc(csLessons(), 'services', 's1')));
await check('  no songs', 'deny', () => getDoc(doc(csLessons(), 'songs', 'sg_cs')));
await check('  no song list for a Sunday', 'deny', () => getDoc(doc(csLessons(), 'songSummaries', '2026-10-11')));
await check('  and no rota', 'deny', () => getDoc(doc(csLessons(), 'events', 'e1')));
await check('a computer doing main services and lessons reads the plan', 'allow', () => getDoc(doc(csBoth(), 'services', 's1')));
await check('  and the songs', 'allow', () => getDoc(doc(csBoth(), 'songs', 'sg_cs')));
await check('one paired before jobs existed does main services, as always', 'allow', () => getDoc(doc(csMain(), 'services', 's1')));

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
/* COMMENTS ON THEIR OWN BOARD: they READ them and write none.
   APP-DESIGN-BRIEF 7f: "On the moderated youth boards (Youth, ReNu,
   Lazers), young people don't comment at launch. Their way in stays
   'Suggest an idea' through a leader." They read the notes, so they read
   what is said about them - being talked about on a board you can see
   and cannot answer would be worse than not seeing it. */
await check('and the comments on a note on their own board', 'allow',
  () => getDoc(doc(youthOk(), 'boardComments', 'bc_youth')));
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
/* AND THEY DO NOT COMMENT, which is the decision behind 7f and the one
   most likely to be undone by accident later: widening who may create a
   comment to "whoever can READ the board" would let them, and this is
   what would notice. Their route stays a suggestion a leader reads
   first. */
await check('a young person cannot comment on a note, even on their own board', 'deny',
  () => setDoc(doc(youthOk(), 'boardComments', 'bc_y2'),
    { boardId: 'youth', noteId: 'n1', text: 'me too', byUid: 'u_youth_ok',
      byName: 'Young', createdAt: 'x' }));
await check('nor on the worship team’s', 'deny',
  () => setDoc(doc(youthOk(), 'boardComments', 'bc_y3'),
    { boardId: 'state', noteId: 'n1', text: 'me too', byUid: 'u_youth_ok',
      byName: 'Young', createdAt: 'x' }));
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
const ywYouth = () => youth('u_youth_yw');

/* WHO SEES WHAT. Five boards, and every one of them is somebody's. */
await check('the worship team sees the worship board', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'state')));
await check('and writes it', 'allow', () => setDoc(doc(as('samy'), 'worshipBoardState', 'state'), { notes: [], pages: [] }));

/* EVERY BOARD IS FOR EVERYONE ON ITS TEAM (Martin, 10 Oct 2026), never
   leaders only - an ideas board that excludes the people you want ideas
   from is not one. Kids Church was narrowed on the 9th and put back on the
   10th; these three are the corrected pair plus its admin. */
await check('Kids Church: its admin sees the board', 'allow', () => getDoc(doc(as('karen'), 'worshipBoardState', 'kids-church')));
await check('AND SO DOES AN ORDINARY MEMBER', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'kids-church')));
await check('who writes it too', 'allow', () => setDoc(doc(as('samy'), 'worshipBoardState', 'kids-church'), { notes: [] }));

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

/* ---- THE YOUTH BOARD IS A QUEUE TOO (Martin, 10 Oct 2026) ----------
   It let a young person with a live code read the board and suggest
   nothing. Same queue, same shape, same no-surname rule as ReNu and
   Lazers: they post, an adult on Youth Worship puts it up. */
const aYouthPost = (over) => Object.assign({
  boardId: 'youth', text: 'Could we do a songwriting night?',
  firstName: 'Cara', byUid: 'u_youth_yw', createdAt: new Date()
}, over || {});

await check('A YOUNG PERSON ON THE YOUTH BAND SUGGESTS AN IDEA', 'allow',
  () => setDoc(doc(ywYouth(), 'boardSuggestions', 'youth__p1'), aYouthPost()));
await check('  and sees their own back, so the app can say it is waiting', 'allow',
  () => getDoc(doc(ywYouth(), 'boardSuggestions', 'youth__p1')));
await check('  AND CANNOT WRITE THE BOARD DIRECTLY - that is the whole queue', 'deny',
  () => setDoc(doc(ywYouth(), 'worshipBoardState', 'youth'), { notes: [] }));
await check('  nor list the queue and read everybody else\'s', 'deny',
  () => getDocs(query(collection(ywYouth(), 'boardSuggestions'), where('boardId', '==', 'youth'))));
await check('AN ADULT ON YOUTH WORSHIP SEES THE QUEUE', 'allow',
  () => getDocs(query(collection(as('isla'), 'boardSuggestions'), where('boardId', '==', 'youth'))));
await check('  and puts it up by writing the board', 'allow',
  () => setDoc(doc(as('isla'), 'worshipBoardState', 'youth'), { notes: [], pages: [] }));
await check('a ReNu child cannot suggest to the youth board', 'deny',
  () => setDoc(doc(renuYouth(), 'boardSuggestions', 'youth__p2'),
    aYouthPost({ byUid: 'u_youth_renu' })));
await check('  and a youth suggestion still cannot carry a surname', 'deny',
  () => setDoc(doc(ywYouth(), 'boardSuggestions', 'youth__p3'),
    aYouthPost({ firstName: 'Cara Smith' })));

/* ---- Core Team's own board (Martin, 10 Oct 2026) ------------------- */
await check('a Core Team member reads the Core Team board', 'allow',
  () => getDoc(doc(as('martin'), 'worshipBoardState', 'core-team')));
await check('  and writes it', 'allow',
  () => setDoc(doc(as('martin'), 'worshipBoardState', 'core-team'), { notes: [], pages: [] }));
await check('A WORSHIP-ONLY MEMBER CANNOT READ IT', 'deny',
  () => getDoc(doc(as('isla'), 'worshipBoardState', 'core-team')));
await check('  nor can a young person', 'deny',
  () => getDoc(doc(ywYouth(), 'worshipBoardState', 'core-team')));
await check('  nor an Attender', 'deny',
  () => getDoc(doc(as('attender'), 'worshipBoardState', 'core-team')));

/* ---- CORE TEAM COVERS WORSHIP & AV (Martin, 11 Oct 2026) -----------
   "core team cant see worship and AV". On the old portal the Core Team
   link showed every Worship & AV item plus Core's own. egbc-auth.js now
   says so on every page check (CORE_COVERS); these are the rules saying
   the same thing, because a page that opens onto data the rules refuse is
   not a fix, it is a worse fault with a nicer error.

   u_core is Core Team AND NOTHING ELSE: not AV, not a master admin. */
await check('a Core Team member reads the worship board', 'allow',
  () => getDoc(doc(as('core'), 'worshipBoardState', 'state')));
await check('  and writes it, because they run the service', 'allow',
  () => setDoc(doc(as('core'), 'worshipBoardState', 'state'), { notes: [], pages: [] }));
await check('  reads the song library', 'allow',
  () => getDoc(doc(as('core'), 'songs', 'sg1')));
await check('  reads a Worship Team video', 'allow',
  () => getDoc(doc(as('core'), 'teamVideos', 'v_worship')));
await check('  reads the rota', 'allow',
  () => getDoc(doc(as('core'), 'events', 'e1')));
/* THE SERVICE PLANNER SAVES, and this is the half that a second spelling
   of "is on that team" would have got wrong: the rota write used a bare
   me().teams.hasAny() of its own, so Core Team could have read the
   planner and been refused saving it. Both go through myTeams() now. */
await check('  and SAVES a Worship service, not only reads it', 'allow',
  () => setDoc(doc(as('core'), 'events', 'e_core_saves'),
    { date: '2026-11-01', roles: ['Guitar'], teams: ['Worship Team'] }));

/* ---- the church email's drafts --------------------------------------
   11 Oct 2026 said "anyone on Core Team"; 16 Oct replaced it: the Email
   Compiler is for team leaders, the church office and master admins (WHO
   MAY), and its drafts follow. */
await check('a Core Team member who leads nothing does not read the drafts', 'deny',
  () => getDoc(doc(as('core'), 'emailDrafts', 'd1')));
await check('  the church office does', 'allow',
  () => getDoc(doc(as('churchOffice'), 'emailDrafts', 'd1')));
await check('  and writes one', 'allow',
  () => setDoc(doc(as('churchOffice'), 'emailDrafts', 'd_office'),
    { subject: 'This Sunday', updatedBy: 'u_church_office', updatedAt: 'now' }));
await check('  a team leader does, as before', 'allow',
  () => getDoc(doc(as('karen'), 'emailDrafts', 'd1')));
await check('BUT A WORSHIP-ONLY MEMBER CANNOT', 'deny',
  () => getDoc(doc(as('samy'), 'emailDrafts', 'd1')));
await check('  nor write one', 'deny',
  () => setDoc(doc(as('samy'), 'emailDrafts', 'd_bad'), { subject: 'No' }));
await check('  nor an Attender', 'deny',
  () => getDoc(doc(as('attender'), 'emailDrafts', 'd1')));

/* IT ONLY GOES ONE WAY. Nobody counts as Core Team who is not on it. */
await check('A WORSHIP-ONLY MEMBER STILL CANNOT READ THE CORE TEAM BOARD', 'deny',
  () => getDoc(doc(as('samy'), 'worshipBoardState', 'core-team')));
await check('  nor write it', 'deny',
  () => setDoc(doc(as('samy'), 'worshipBoardState', 'core-team'), { notes: [], pages: [] }));
/* And the cover is three named teams, not "everything Core Team fancies". */
await check('  and Core Team is not quietly on Kids Church', 'deny',
  () => getDoc(doc(as('core'), 'teamVideos', 'v_kids')));

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

/* THE PREACHING PLAN (Martin, 15 Oct 2026). The Pastor is the one named in
   Team emails (teamMailSettings/main.pastor), and may change the four
   preaching fields of a service - and nothing else - team or no team. The
   attender is the Pastor here BECAUSE they are on no team: it proves the
   rule, not the team membership, lets them in. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'events', 'ev_preach'), { date: '2026-11-15', type: 'Sunday Morning Worship',
    teams: ['Worship Team'], roles: ['Keyboard'], archived: false, speaker: '', serviceLeader: '' });
});
await check('nobody names the Pastor here (Team emails does, through the server)', 'deny',
  () => setDoc(doc(as('martin'), 'churchSettings', 'preaching'), { pastorIds: ['m_u_attender'] }));
await check('somebody not the Pastor cannot read who is', 'deny',
  () => getDoc(doc(as('attender'), 'teamMailSettings', 'main')));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'teamMailSettings', 'main'), { pastor: 'm_u_attender', officeAdmin: '' });
});
await check('the Pastor reads that they are (so the page knows)', 'allow',
  () => getDoc(doc(as('attender'), 'teamMailSettings', 'main')));
await check('  and nobody else does', 'deny',
  () => getDoc(doc(as('parent'), 'teamMailSettings', 'main')));
await check('the Pastor reads the services', 'allow',
  () => getDoc(doc(as('attender'), 'events', 'ev_preach')));
await check('  and sets the speaker, leader, description and readers', 'allow',
  () => updateDoc(doc(as('attender'), 'events', 'ev_preach'), { speaker: 'Guest Synthetic', speakerId: '', serviceLeader: 'Leader Synthetic', serviceLeaderId: 'm_u_samy',
    publicTitle: 'Shoebox Sunday', readers: [{ name: 'Reader Synthetic', passage: 'John 3:1-17' }] }));
await check('  but not who is on the rota', 'deny',
  () => updateDoc(doc(as('attender'), 'events', 'ev_preach'), { assignments: { Keyboard: { id: 'm_x', name: 'X' } } }));
await check('  nor the date', 'deny',
  () => updateDoc(doc(as('attender'), 'events', 'ev_preach'), { date: '2026-11-22' }));
await check('  nor delete it', 'deny',
  () => deleteDoc(doc(as('attender'), 'events', 'ev_preach')));
await check('somebody not named cannot', 'deny',
  () => updateDoc(doc(as('parent'), 'events', 'ev_preach'), { speaker: 'Nobody Synthetic' }));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'teamMailSettings', 'main'), { pastor: '', officeAdmin: '' });
});
await check('somebody else chosen, the old Pastor cannot', 'deny',
  () => updateDoc(doc(as('attender'), 'events', 'ev_preach'), { speaker: 'Too Late Synthetic' }));
/* AND THE CHURCH'S OVERALL LEADERS (Martin, 26 Oct 2026: "assembled and
   edited by the pastors and elders"): the "leadership" job's teams, EGBC's
   Elders where the church has not said. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'users', 'u_pp_elder'), { uid: 'u_pp_elder', memberId: 'm_pp_elder', status: 'active', name: 'Elder', teams: ['Elders'], adminFor: [], masterAdmin: false });
  await setDoc(doc(d, 'users', 'u_pp_staff'), { uid: 'u_pp_staff', memberId: 'm_pp_staff', status: 'active', name: 'Staff', teams: ['Staff team'], adminFor: [], masterAdmin: false });
});
const asU = (uid) => env.authenticatedContext(uid).firestore();
await check('an Elder (the leadership, by default) reads the services', 'allow',
  () => getDoc(doc(asU('u_pp_elder'), 'events', 'ev_preach')));
await check('  and sets the speaker and readers', 'allow',
  () => updateDoc(doc(asU('u_pp_elder'), 'events', 'ev_preach'), { speaker: 'Elder Chosen Synthetic', readers: [] }));
await check('  but not the date', 'deny',
  () => updateDoc(doc(asU('u_pp_elder'), 'events', 'ev_preach'), { date: '2026-11-29' }));
await check('another team cannot, not being the leadership', 'deny',
  () => updateDoc(doc(asU('u_pp_staff'), 'events', 'ev_preach'), { speaker: 'Staff Synthetic' }));
let tjWas = null;
await env.withSecurityRulesDisabled(async (ctx) => {
  const s = await getDoc(doc(ctx.firestore(), 'churchSettings', 'teamJobs'));
  tjWas = s.exists() ? s.data() : null;
  await setDoc(doc(ctx.firestore(), 'churchSettings', 'teamJobs'), { ...(tjWas || {}), leadership: ['Staff team'] });
});
await check('A CHURCH WHOSE LEADERS ARE ITS STAFF TEAM: they set it', 'allow',
  () => updateDoc(doc(asU('u_pp_staff'), 'events', 'ev_preach'), { speaker: 'Staff Chosen Synthetic' }));
await check('  and the Elders, no longer the leadership, cannot', 'deny',
  () => updateDoc(doc(asU('u_pp_elder'), 'events', 'ev_preach'), { speaker: 'Elder Again Synthetic' }));
await env.withSecurityRulesDisabled(async (ctx) => {
  if (tjWas) await setDoc(doc(ctx.firestore(), 'churchSettings', 'teamJobs'), tjWas);
  else await deleteDoc(doc(ctx.firestore(), 'churchSettings', 'teamJobs'));
});

/* TEAMS & GROUPS (Martin, 15 Oct 2026): the Church office looks after the
   list too - add, rename, recolour, order, archive - but never `runs`, which
   is what a group may do. That stays a master admin's. */
await check('the office adds a group with no tabs', 'allow',
  () => setDoc(doc(as('officeAdmin'), 'teams', 'Welcome team'),
    { name: 'Welcome team', label: 'Welcome team', colour: '#0f766e', rota: false,
      under18: false, order: 9, archived: false }));
await check('  and relabels, recolours, orders and archives it', 'allow',
  () => updateDoc(doc(as('officeAdmin'), 'teams', 'Welcome team'),
    { label: 'Welcome', colour: '#b45309', order: 3, archived: true }));
await check('  but cannot add one that runs things', 'deny',
  () => setDoc(doc(as('officeAdmin'), 'teams', 'Treasury'),
    { name: 'Treasury', label: 'Treasury', rota: false, runs: ['send'] }));
await check('  nor give an existing one tabs', 'deny',
  () => updateDoc(doc(as('officeAdmin'), 'teams', 'Welcome team'), { runs: ['people'] }));
await check('  nor take tabs away', 'deny',
  () => updateDoc(doc(as('officeAdmin'), 'teams', 'Church office'), { runs: [] }));
await check('  but can relabel a group that does run things', 'allow',
  () => updateDoc(doc(as('officeAdmin'), 'teams', 'Church office'), { label: 'Church office' }));
await check('  and never deletes one: archive, so markers and history stay', 'deny',
  () => deleteDoc(doc(as('officeAdmin'), 'teams', 'Welcome team')));
await check('  nor a master admin', 'deny',
  () => deleteDoc(doc(as('martin'), 'teams', 'Welcome team')));
await check('an unknown field is refused', 'deny',
  () => updateDoc(doc(as('martin'), 'teams', 'Welcome team'), { secret: 1 }));
/* Which core team covers a team, and which pin board a team shares (H-15;
   26 Oct 2026): both decide what people see, so both are a master admin's. */
await check('the office cannot make a group a core team', 'deny',
  () => updateDoc(doc(as('officeAdmin'), 'teams', 'Welcome team'), { coreFor: ['Kids Church'] }));
await check('  nor change which pin board a team shares', 'deny',
  () => updateDoc(doc(as('officeAdmin'), 'teams', 'Welcome team'), { board: 'state' }));
await check('a master admin sets the pin board', 'allow',
  () => updateDoc(doc(as('martin'), 'teams', 'Welcome team'), { board: 'welcome' }));
await check('  as a short name, not anything else', 'deny',
  () => updateDoc(doc(as('martin'), 'teams', 'Welcome team'), { board: ['state'] }));
await check('  and not a long one', 'deny',
  () => updateDoc(doc(as('martin'), 'teams', 'Welcome team'), { board: 'x'.repeat(61) }));
await check('  the office still relabels a group with a board', 'allow',
  () => updateDoc(doc(as('officeAdmin'), 'teams', 'Welcome team'), { label: 'Welcome' }));

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

/* ---- "I'm worried about someone" (NEXT-BRIEF §24) -------------------
   Private is the whole point: the person it is about never sees it, and it
   never reaches their record, the directory or any list. Martin named the
   three breaks - an ordinary member, a team leader, and the person named -
   and all three are below.

   A MASTER ADMIN IS NOT A READER of a safeguarding concern either, which
   is the strict reading of "goes only to the safeguarding lead and
   deputy". That is a decision rather than an oversight, so it is a test. */

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  /* The Pastoral group: a team with rota:false, read by the pastoral team. */
  await setDoc(doc(db, 'teams', 'Pastoral'), {
    name: 'Pastoral', label: 'Pastoral', colour: '#6b4a7a', rota: false, runs: [], archived: false });
  /* karen is the safeguarding lead (bookingSettings/site_main, seeded with
     the §24 block above); pastor is on the Pastoral group; worried raises
     them; samy is an ordinary member; isla leads Youth Worship. */
  await setDoc(doc(db, 'users', 'u_pastor'), {
    memberId: 'm_u_pastor', name: 'Pastor Synthetic', teams: ['Pastoral'], adminFor: [],
    masterAdmin: false, attender: true, churchMember: true, status: 'active' });
  await setDoc(doc(db, 'users', 'u_worried'), {
    memberId: 'm_u_worried', name: 'Worried Synthetic', teams: [], adminFor: [],
    masterAdmin: false, attender: true, churchMember: false, status: 'active' });
  /* The person the concerns are ABOUT, who must never read either. */
  await setDoc(doc(db, 'users', 'u_about'), {
    memberId: 'm_u_about', name: 'About Synthetic', teams: ['Worship Team'], adminFor: [],
    masterAdmin: false, attender: true, churchMember: false, status: 'active' });

  const base = {
    aboutMemberId: 'm_u_about', aboutName: 'About Synthetic',
    noticed: 'Not seen at church for about six weeks, and did not answer the door.',
    happyToBeContacted: true, by: 'u_worried', byName: 'Worried Synthetic',
    at: new Date(), dealtWith: false };
  await setDoc(doc(db, 'worries', 'c_pastoral'), { ...base, kind: 'pastoral' });
  await setDoc(doc(db, 'worries', 'c_safeguarding'), { ...base, kind: 'safeguarding' });
  /* "I'd like some pastoral care": worried asking for themselves, and
     about asking for themselves. */
  await setDoc(doc(db, 'worries', 'c_care'), { ...base, kind: 'care', aboutMemberId: 'm_u_worried',
    aboutName: 'Worried Synthetic', noticed: '' });
  await setDoc(doc(db, 'worries', 'c_care_about'), { ...base, kind: 'care', aboutMemberId: 'm_u_about',
    aboutName: 'About Synthetic', noticed: 'Things are hard at home.', by: 'u_about', byName: 'About Synthetic' });
});
PEOPLE.pastor = { uid: 'u_pastor' };
PEOPLE.worried = { uid: 'u_worried' };
PEOPLE.about = { uid: 'u_about' };

/* ---- raising one --------------------------------------------------- */
const concern = (kind, extra) => ({
  kind, aboutMemberId: 'm_u_about', aboutName: 'About Synthetic',
  noticed: 'They have not been in church for a while and I am worried about them.',
  happyToBeContacted: true, by: 'u_worried', byName: 'Worried Synthetic',
  at: serverTimestamp(), dealtWith: false, ...(extra || {}) });

await check('anybody in the address book can raise a pastoral concern', 'allow',
  () => setDoc(doc(as('worried'), 'worries', 'c_new1'), concern('pastoral')));
await check('and a safeguarding one', 'allow',
  () => setDoc(doc(as('worried'), 'worries', 'c_new2'), concern('safeguarding')));
await check('a stranger cannot raise one', 'deny',
  () => setDoc(doc(anon(), 'worries', 'c_new3'), concern('pastoral')));
await check('a concern about nobody is refused', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_new4'),
    concern('pastoral', { aboutMemberId: '', aboutName: '' })));
await check('one with nothing noticed is refused', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_new5'), concern('pastoral', { noticed: 'x' })));
await check('nobody can raise one in somebody else\'s name', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_new6'), concern('pastoral', { by: 'u_samy' })));
await check('nor raise one already marked dealt with', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_new7'), concern('pastoral', { dealtWith: true })));

/* ---- THE THREE BREAKS MARTIN NAMED --------------------------------- */
await check('AN ORDINARY MEMBER CANNOT READ A CONCERN', 'deny',
  () => getDoc(doc(as('samy'), 'worries', 'c_pastoral')));
await check('  nor a safeguarding one', 'deny',
  () => getDoc(doc(as('samy'), 'worries', 'c_safeguarding')));
await check('A TEAM LEADER CANNOT EITHER', 'deny',
  () => getDoc(doc(as('isla'), 'worries', 'c_pastoral')));
/* NOT Karen: in these fixtures she is the safeguarding lead, so she reads
   both - correctly, and asserted below. Administering a team is the thing
   being checked here, and renuLead administers one without being the
   lead. The first version of this line named Karen and failed, which is
   the fixture catching a description of it that was wrong. */
await check('  nor somebody who administers a team of their own', 'deny',
  () => getDoc(doc(as('renuLead'), 'worries', 'c_pastoral')));
await check('THE PERSON IT IS ABOUT CANNOT READ IT', 'deny',
  () => getDoc(doc(as('about'), 'worries', 'c_pastoral')));
await check('  nor the safeguarding one about them', 'deny',
  () => getDoc(doc(as('about'), 'worries', 'c_safeguarding')));
await check('  and cannot find it by listing the collection', 'deny',
  () => getDocs(collection(as('about'), 'worries')));
/* Even the person who raised it does not get it back: a list of "concerns
   I raised" is a list somebody can be asked to show. */
await check('even the person who RAISED it cannot read it back', 'deny',
  () => getDoc(doc(as('worried'), 'worries', 'c_pastoral')));

/* ---- who does read ------------------------------------------------- */
await check('the pastoral team reads a pastoral concern', 'allow',
  () => getDoc(doc(as('pastor'), 'worries', 'c_pastoral')));
await check('BUT NOT A SAFEGUARDING ONE', 'deny',
  () => getDoc(doc(as('pastor'), 'worries', 'c_safeguarding')));
await check('the safeguarding lead reads a safeguarding concern', 'allow',
  () => getDoc(doc(as('karen'), 'worries', 'c_safeguarding')));
await check('and a pastoral one too', 'allow',
  () => getDoc(doc(as('karen'), 'worries', 'c_pastoral')));
/* The strict reading of "only the safeguarding lead and deputy". */
await check('A MASTER ADMIN IS NOT A READER of a safeguarding concern', 'deny',
  () => getDoc(doc(as('martin'), 'worries', 'c_safeguarding')));

/* ---- "I'd like some pastoral care" (Care & support, 14 Oct 2026) ---- */
const care = (extra) => concern('care', { aboutMemberId: 'm_u_worried', aboutName: 'Worried Synthetic', noticed: '', ...(extra || {}) });
await check('anybody may ask for pastoral care for themselves, saying nothing more', 'allow',
  () => setDoc(doc(as('worried'), 'worries', 'c_care_new1'), care()));
await check('  or saying why', 'allow',
  () => setDoc(doc(as('worried'), 'worries', 'c_care_new2'), care({ noticed: 'I have had a hard few weeks.' })));
await check('  BUT NOT IN SOMEBODY ELSE\'S NAME: care is asked for yourself', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_care_new3'), care({ aboutMemberId: 'm_u_about', aboutName: 'About Synthetic' })));
await check('  and asking is agreeing to be contacted', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_care_new4'), care({ happyToBeContacted: false })));
await check('  a stranger cannot ask', 'deny',
  () => setDoc(doc(anon(), 'worries', 'c_care_new5'), care()));
await check('  and no kind the page does not know', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_care_new6'), concern('other')));
await check('a concern still has to say what was noticed', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_new8'), concern('pastoral', { noticed: '' })));
await check('THE PASTORAL TEAM READS A REQUEST FOR CARE', 'allow',
  () => getDoc(doc(as('pastor'), 'worries', 'c_care')));
await check('  and the safeguarding lead', 'allow',
  () => getDoc(doc(as('karen'), 'worries', 'c_care')));
await check('  an ordinary member cannot', 'deny',
  () => getDoc(doc(as('samy'), 'worries', 'c_care')));
await check('  nor a team leader', 'deny',
  () => getDoc(doc(as('isla'), 'worries', 'c_care')));
await check('  nor a master admin who is not on the pastoral team', 'deny',
  () => getDoc(doc(as('martin'), 'worries', 'c_care')));
await check('  NOR THE PERSON WHO ASKED, reading it back', 'deny',
  () => getDoc(doc(as('worried'), 'worries', 'c_care')));
await check('  NOR ANYBODY ELSE WHO HAS ASKED, reading another person\'s', 'deny',
  () => getDoc(doc(as('worried'), 'worries', 'c_care_about')));
await check('the pastoral team lists what it may read (care-inbox.html)', 'allow',
  () => getDocs(query(collection(as('pastor'), 'worries'), where('kind', 'in', ['pastoral', 'care']))));
await check('  but not the whole collection, which holds safeguarding concerns', 'deny',
  () => getDocs(collection(as('pastor'), 'worries')));
await check('  the safeguarding lead lists all three kinds', 'allow',
  () => getDocs(query(collection(as('karen'), 'worries'), where('kind', 'in', ['pastoral', 'care', 'safeguarding'])))) ;
await check('  an ordinary member lists nothing', 'deny',
  () => getDocs(query(collection(as('samy'), 'worries'), where('kind', 'in', ['pastoral', 'care']))));
await check('the pastoral team marks a request for care dealt with', 'allow',
  () => updateDoc(doc(as('pastor'), 'worries', 'c_care'),
    { dealtWith: true, dealtNote: 'Rang on Wednesday.', dealtBy: 'u_pastor', dealtAt: serverTimestamp() }));
await check('  but cannot change what was asked', 'deny',
  () => updateDoc(doc(as('pastor'), 'worries', 'c_care_about'), { noticed: 'Something else.' }));

/* ---- who gets told: named people, never the office (Martin, 14 Oct) -- */
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', 'u_carer'), {
    memberId: 'm_u_carer', name: 'Carer Synthetic', teams: [], adminFor: [],
    masterAdmin: false, attender: true, churchMember: true, status: 'active' });
  await setDoc(doc(db, 'careRouting', 'main'), { care: { memberIds: ['m_u_carer'], email: '' },
    pastoral: { memberIds: [], email: '' }, prayer: { memberIds: [], email: '' } });
});
PEOPLE.carer = { uid: 'u_carer' };
await check('somebody NAMED for requests for care reads one, though on no team', 'allow',
  () => getDoc(doc(as('carer'), 'worries', 'c_care')));
await check('  but not a pastoral concern, which they are not named for', 'deny',
  () => getDoc(doc(as('carer'), 'worries', 'c_pastoral')));
await check('  nor a safeguarding one', 'deny',
  () => getDoc(doc(as('carer'), 'worries', 'c_safeguarding')));
await check('  and lists the requests for care', 'allow',
  () => getDocs(query(collection(as('carer'), 'worries'), where('kind', '==', 'care'))));
await check('  reads who is named, to know what is theirs', 'allow',
  () => getDoc(doc(as('carer'), 'careRouting', 'main')));
await check('a stranger cannot read who is named', 'deny',
  () => getDoc(doc(anon(), 'careRouting', 'main')));
await check('only a master admin names them', 'allow',
  () => setDoc(doc(as('martin'), 'careRouting', 'main'), { care: { memberIds: ['m_u_carer'], email: 'pastoral@example.invalid' },
    pastoral: { memberIds: [], email: '' }, prayer: { memberIds: [], email: '' }, updatedAt: 'x', updatedBy: 'u_martin' }));
await check('  not the safeguarding lead', 'deny',
  () => setDoc(doc(as('karen'), 'careRouting', 'main'), { care: { memberIds: [], email: '' }, updatedBy: 'u_karen' }));
await check('  nor the church office', 'deny',
  () => setDoc(doc(as('officeAdmin'), 'careRouting', 'main'), { care: { memberIds: [], email: '' }, updatedBy: PEOPLE.officeAdmin.uid }));
await check('  and an address that is not an address is refused', 'deny',
  () => setDoc(doc(as('martin'), 'careRouting', 'main'), { care: { memberIds: [], email: 'not an address' }, updatedBy: 'u_martin' }));
await check('anyone signed in reads whether a lead is set (careRouting/status)', 'allow',
  () => getDoc(doc(as('samy'), 'careRouting', 'status')));
await check('  but nobody writes it from a page', 'deny',
  () => setDoc(doc(as('martin'), 'careRouting', 'status'), { leadSet: true }));

/* NO SAFEGUARDING LEAD: nothing is sent to nobody. */
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'safeguardingSettings', 'defaults_saved'),
    (await getDoc(doc(ctx.firestore(), 'safeguardingSettings', 'defaults'))).data() || {});
  await updateDoc(doc(ctx.firestore(), 'safeguardingSettings', 'defaults'), { leadSiteId: '' });
});
await check('WITH NO SAFEGUARDING LEAD SET, a request for care is refused', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_nolead1'), care()));
await check('  and a concern', 'deny',
  () => setDoc(doc(as('worried'), 'worries', 'c_nolead2'), concern('pastoral')));
await env.withSecurityRulesDisabled(async (ctx) => {
  const saved = (await getDoc(doc(ctx.firestore(), 'safeguardingSettings', 'defaults_saved'))).data() || {};
  await setDoc(doc(ctx.firestore(), 'safeguardingSettings', 'defaults'), saved);
  await deleteDoc(doc(ctx.firestore(), 'safeguardingSettings', 'defaults_saved'));
});
await check('  and allowed again once one is', 'allow',
  () => setDoc(doc(as('worried'), 'worries', 'c_nolead3'), care()));

/* ---- switch-over: churchSettings/launch (14 Oct 2026) --------------- */
await check('anybody, signed out too, reads whether the private forms are open', 'allow',
  () => getDoc(doc(anon(), 'churchSettings', 'launch')));
await check('a master admin opens them, after the rules deploy', 'allow',
  () => setDoc(doc(as('martin'), 'churchSettings', 'launch'), { rulesLocked: true, opensOn: '1 November 2026', updatedAt: 'x', updatedBy: 'u_martin' }));
await check('  nobody else', 'deny',
  () => setDoc(doc(as('karen'), 'churchSettings', 'launch'), { rulesLocked: true, updatedBy: 'u_karen' }));
await check('  and not the church office', 'deny',
  () => setDoc(doc(as('officeAdmin'), 'churchSettings', 'launch'), { rulesLocked: true }));

/* ---- churchSettings/video: the church's rooms (21 Oct 2026) ----------
   Made by the hub's server (functions/video.js, Church HQ's Daily
   account); pages only read them. Their addresses are not secret -
   knowing one only lets you knock. */
await check('a signed-in member reads the church\'s meeting rooms', 'allow',
  () => getDoc(doc(as('karen'), 'churchSettings', 'video')));
await check('  but no page writes them, not even a master admin', 'deny',
  () => setDoc(doc(as('martin'), 'churchSettings', 'video'), { rooms: [{ key: 'x', url: 'https://evil.example/x' }] }));

/* ---- members' meetings and their votes (21 Oct 2026) ----------------
   Members read; the Church office, the Elders and master admins run them;
   a vote is written by a page only as a draft, or for the chair's outcome
   once closed; ballots and the tally are the hub's alone, and the tally is
   read by nobody - for a secret vote it is the only place a choice is. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'churchMeetings', 'rt_m1'), { title: 'T', date: '2026-10-29', joinKind: 'zoom', room: 'CMM', papers: [], status: 'planned' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'private', 'join'), { zoomUrl: 'https://zoom.example/x', passcode: '1' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vS'), { question: 'Q', choices: ['Yes', 'No'], secret: true, status: 'open' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vD'), { question: 'Q', choices: ['Yes', 'No'], secret: true, status: 'draft' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vC'), { question: 'Q', choices: ['Yes', 'No'], secret: false, status: 'closed', results: { Yes: 1, No: 0 } });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vS', 'ballots', 'm_u_member'), { at: 'x', name: 'M' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vS', 'ballots', 'm_other'), { at: 'x', name: 'O' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vC', 'ballots', 'm_other'), { at: 'x', name: 'O', choice: 'Yes' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vS', 'tally', 'count'), { Yes: 1, No: 1 });
  /* Proxies (PROXIES.md): the member holds m_giver's vote; m_third's is someone else's. */
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'proxies', 'm_giver'), { holderId: 'm_u_member', holderName: 'M', giverName: 'G' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'proxies', 'm_third'), { holderId: 'm_x', holderName: 'X', giverName: 'T' });
  await setDoc(doc(d, 'churchMeetings', 'rt_m1', 'votes', 'vS', 'ballots', 'm_giver'), { at: 'x', name: 'G', castBy: 'M', proxy: true });
});
const MV = (who, ...p) => doc(as(who), 'churchMeetings', 'rt_m1', ...p);
await check('a church member reads the members\' meeting', 'allow', () => getDoc(MV('member')));
await check('  and its Zoom details', 'allow', () => getDoc(MV('member', 'private', 'join')));
await check('somebody on a team but not a church member does not', 'deny', () => getDoc(MV('worship')));
await check('  nor its Zoom details', 'deny', () => getDoc(MV('worship', 'private', 'join')));
await check('the Church office plans one', 'allow', () => setDoc(doc(as('churchOffice'), 'churchMeetings', 'rt_m2'), { title: 'T', date: '2026-11-05', joinKind: 'room', room: 'CMM', papers: [], status: 'planned' }));
await check('  a member does not', 'deny', () => setDoc(doc(as('member'), 'churchMeetings', 'rt_m3'), { title: 'T', date: '2026-11-05', joinKind: 'room', room: 'CMM', papers: [], status: 'planned' }));
await check('the office writes a vote as a draft', 'allow', () => setDoc(MV('churchOffice', 'votes', 'vN'), { question: 'Q', choices: ['Yes', 'No'], secret: true, status: 'draft', order: 1, createdAt: 'x', createdBy: 'u' }));
await check('  but not straight in as open', 'deny', () => setDoc(MV('churchOffice', 'votes', 'vN2'), { question: 'Q', choices: ['Yes', 'No'], secret: true, status: 'open' }));
await check('  nor opens one from a page (the hub does)', 'deny', () => updateDoc(MV('churchOffice', 'votes', 'vD'), { status: 'open' }));
await check('  nor writes results onto an open vote', 'deny', () => updateDoc(MV('churchOffice', 'votes', 'vS'), { results: { Yes: 99 } }));
await check('  the chair\'s outcome, once closed', 'allow', () => updateDoc(MV('churchOffice', 'votes', 'vC'), { outcome: 'Agreed', outcomeBy: 'u', outcomeAt: 'x' }));
await check('nobody writes a ballot from a page, not even a master admin', 'deny', () => setDoc(MV('martin', 'votes', 'vS', 'ballots', 'm_u_martin'), { at: 'x' }));
await check('  nor a member their own', 'deny', () => setDoc(MV('member', 'votes', 'vS', 'ballots', 'm_u_member'), { at: 'x', choice: 'Yes' }));
await check('a member reads their own ballot (to know they voted)', 'allow', () => getDoc(MV('member', 'votes', 'vS', 'ballots', 'm_u_member')));
await check('  but not somebody else\'s on a secret vote', 'deny', () => getDoc(MV('member', 'votes', 'vS', 'ballots', 'm_other')));
await check('  and everyone\'s on an OPEN vote once it has closed', 'allow', () => getDoc(MV('member', 'votes', 'vC', 'ballots', 'm_other')));
await check('the office sees who has voted', 'allow', () => getDoc(MV('churchOffice', 'votes', 'vS', 'ballots', 'm_other')));
await check('the tally is read by nobody, a master admin included', 'deny', () => getDoc(MV('martin', 'votes', 'vS', 'tally', 'count')));
/* PROXIES (21 Oct 2026). */
await check('PROXIES: the member holding a vote reads that proxy', 'allow', () => getDoc(MV('member', 'proxies', 'm_giver')));
await check('  but not somebody else’s', 'deny', () => getDoc(MV('member', 'proxies', 'm_third')));
await check('  and sees the ballot they cast for the giver (to know it went)', 'allow', () => getDoc(MV('member', 'votes', 'vS', 'ballots', 'm_giver')));
await check('the office sees who holds whose vote', 'allow', () => getDoc(MV('churchOffice', 'proxies', 'm_third')));
await check('nobody appoints a proxy from a page (the hub does)', 'deny', () => setDoc(MV('member', 'proxies', 'm_u_member'), { holderId: 'm_other' }));
await check('  not even a master admin', 'deny', () => setDoc(MV('martin', 'proxies', 'm_u_martin'), { holderId: 'm_other' }));

/* ---- marking it dealt with ----------------------------------------- */
await check('the safeguarding lead marks one dealt with, with a note', 'allow',
  () => updateDoc(doc(as('karen'), 'worries', 'c_pastoral'),
    { dealtWith: true, dealtNote: 'Visited on Tuesday; she is well and glad to be asked.',
      dealtBy: 'u_karen', dealtAt: serverTimestamp() }));
await check('  the pastoral team cannot', 'deny',
  () => updateDoc(doc(as('pastor'), 'worries', 'c_safeguarding'), { dealtWith: true }));
await check('  AND NOBODY CAN CHANGE WHAT WAS SAID', 'deny',
  () => updateDoc(doc(as('karen'), 'worries', 'c_safeguarding'),
    { noticed: 'Actually it was nothing.' }));
await check('  nor who it was about', 'deny',
  () => updateDoc(doc(as('karen'), 'worries', 'c_safeguarding'), { aboutName: 'Somebody else' }));
await check('NOBODY DELETES ONE, not even the lead', 'deny',
  () => deleteDoc(doc(as('karen'), 'worries', 'c_safeguarding')));
await check('  and certainly not the person it is about', 'deny',
  () => deleteDoc(doc(as('about'), 'worries', 'c_safeguarding')));

// ---- an urgent notice goes to phones: the office and master admin only --
// Martin, 13 Oct 2026. Posting a notice is unchanged (any admin); setting
// urgent is the office's. A positive control for each refusal, so a
// refusal for some other reason cannot pass as this one.
await check('an admin posts an ordinary notice', 'allow',
  () => setDoc(doc(as('karen'), 'news', 'u_plain'), { title: 'Plain', body: 'x', teams: ['Kids Church'], ackedBy: [] }));
await check('  but an admin NOT in the office cannot post it urgent', 'deny',
  () => setDoc(doc(as('karen'), 'news', 'u_karen'), { title: 'Urgent', body: 'x', teams: ['Kids Church'], ackedBy: [], urgent: true }));
await check('  nor make an existing notice urgent', 'deny',
  () => updateDoc(doc(as('karen'), 'news', 'u_plain'), { urgent: true }));
await check('an admin in the Church office posts it urgent', 'allow',
  () => setDoc(doc(as('officeAdmin'), 'news', 'u_office'), { title: 'Urgent', body: 'x', teams: [], ackedBy: [], urgent: true }));
await check('  and the master admin', 'allow',
  () => setDoc(doc(as('martin'), 'news', 'u_master'), { title: 'Urgent', body: 'x', teams: [], ackedBy: [], urgent: true }));
await check('  the office makes an existing notice urgent', 'allow',
  () => updateDoc(doc(as('officeAdmin'), 'news', 'u_plain'), { urgent: true }));
await check('  and any admin may still edit it afterwards, which sends nothing', 'allow',
  () => updateDoc(doc(as('karen'), 'news', 'u_plain'), { title: 'Plain, edited' }));
/* urgent:false is no gate - but since 16 Oct a team leader posts to their
   own team, not to everyone (WHO MAY, below). */
await check('  urgent false may be set by a team leader, on their own team', 'allow',
  () => setDoc(doc(as('karen'), 'news', 'u_false'), { title: 'Not', body: 'x', teams: ['Kids Church'], ackedBy: [], urgent: false }));

/* WHO MAY POST A NOTICE (Martin, 16 Oct 2026). Team leaders (adminFor) to
   their own teams; the church office and master admins to anyone; nobody
   else. Karen leads Kids Church; officeAdmin is in the Church office (and
   leads Kids Church too); samy is on teams but leads none. */
await check('WHO MAY: a team leader posts to their own team', 'allow',
  () => setDoc(doc(as('karen'), 'news', 'wm_k1'), { title: 'Kids', body: 'x', teams: ['Kids Church'], ackedBy: [] }));
await check('  not to everyone', 'deny',
  () => setDoc(doc(as('karen'), 'news', 'wm_k2'), { title: 'All', body: 'x', teams: [], ackedBy: [] }));
await check('  nor to a team they do not lead', 'deny',
  () => setDoc(doc(as('karen'), 'news', 'wm_k3'), { title: 'Worship', body: 'x', teams: ['Worship Team'], ackedBy: [] }));
await check('  nor to theirs and another', 'deny',
  () => setDoc(doc(as('karen'), 'news', 'wm_k4'), { title: 'Both', body: 'x', teams: ['Kids Church', 'Worship Team'], ackedBy: [] }));
await check('somebody on a team who leads none posts nothing', 'deny',
  () => setDoc(doc(as('samy'), 'news', 'wm_s1'), { title: 'Mine', body: 'x', teams: ['Worship Team'], ackedBy: [] }));
await check('the church office posts to everyone', 'allow',
  () => setDoc(doc(as('churchOffice'), 'news', 'wm_o1'), { title: 'All', body: 'x', teams: [], ackedBy: [] }));
await check('  and to any team', 'allow',
  () => setDoc(doc(as('churchOffice'), 'news', 'wm_o2'), { title: 'Worship', body: 'x', teams: ['Worship Team'], ackedBy: [] }));
await check('a master admin posts to everyone', 'allow',
  () => setDoc(doc(as('martin'), 'news', 'wm_m1'), { title: 'All', body: 'x', teams: [], ackedBy: [] }));
await check('a leader cannot change a notice for everyone', 'deny',
  () => updateDoc(doc(as('karen'), 'news', 'wm_o1'), { title: 'Mine now' }));
await check('  nor move their own notice to everyone', 'deny',
  () => updateDoc(doc(as('karen'), 'news', 'wm_k1'), { teams: [] }));
await check('  but edits their own team\'s', 'allow',
  () => updateDoc(doc(as('karen'), 'news', 'wm_k1'), { title: 'Kids, edited' }));
await check('  and takes it down', 'allow',
  () => deleteDoc(doc(as('karen'), 'news', 'wm_k1')));
await check('  not the office\'s notice for Worship', 'deny',
  () => deleteDoc(doc(as('karen'), 'news', 'wm_o2')));
await check('the office takes down any notice', 'allow',
  () => deleteDoc(doc(as('churchOffice'), 'news', 'wm_o2')));
await check('anybody still says they have read one', 'allow',
  () => updateDoc(doc(as('samy'), 'news', 'wm_o1'), { ackedBy: ['u_samy'] }));

/* WHO MAY CHANGE AN ADDRESS BOOK RECORD (16 Oct). A leader: the people on
   their teams, only their own teams' ticks, never the admin ticks; the
   office and master admins: anyone. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'addressBook', 'wm_both'), { name: 'Both Synthetic', email: 'both@example.invalid', markers: ['Kids Church', 'Worship Team'], adminFor: [], archived: false, isMinor: false });
  await setDoc(doc(d, 'addressBook', 'wm_both2'), { name: 'Both Two Synthetic', email: 'both2@example.invalid', markers: ['Kids Church', 'Worship Team'], adminFor: [], archived: false, isMinor: false });
  await setDoc(doc(d, 'addressBook', 'wm_worship'), { name: 'Worship Synthetic', email: 'w@example.invalid', markers: ['Worship Team'], adminFor: [], archived: false, isMinor: false });
  await setDoc(doc(d, 'addressBook', 'wm_kids'), { name: 'Kids Synthetic', email: 'k@example.invalid', markers: ['Kids Church'], adminFor: [], archived: false, isMinor: false });
});
await check('WHO MAY (address book): a leader changes somebody on their team', 'allow',
  () => updateDoc(doc(as('karen'), 'addressBook', 'wm_both'), { name: 'Both Synthetic, renamed' }));
await check('  and takes their own team\'s tick off', 'allow',
  () => updateDoc(doc(as('karen'), 'addressBook', 'wm_both'), { markers: ['Worship Team'] }));
await check('  but not another team\'s', 'deny',
  () => updateDoc(doc(as('karen'), 'addressBook', 'wm_both2'), { markers: ['Kids Church'] }));
await check('  nor somebody on no team of theirs', 'deny',
  () => updateDoc(doc(as('karen'), 'addressBook', 'wm_worship'), { name: 'Not mine' }));
await check('  nor gives them an admin tick', 'deny',
  () => updateDoc(doc(as('karen'), 'addressBook', 'wm_kids'), { adminFor: ['Kids Church'] }));
await check('  adds a new person on their team', 'allow',
  () => setDoc(doc(as('karen'), 'addressBook', 'wm_new'), { name: 'New Synthetic', email: 'n@example.invalid', markers: ['Kids Church'], adminFor: [], archived: false, isMinor: false }));
await check('  not on somebody else\'s team', 'deny',
  () => setDoc(doc(as('karen'), 'addressBook', 'wm_new2'), { name: 'New Synthetic', email: 'n2@example.invalid', markers: ['Worship Team'], adminFor: [], archived: false, isMinor: false }));
await check('  removes somebody only on their team', 'allow',
  () => deleteDoc(doc(as('karen'), 'addressBook', 'wm_kids')));
await check('the office changes anyone', 'allow',
  () => updateDoc(doc(as('churchOffice'), 'addressBook', 'wm_worship'), { name: 'Worship Synthetic, by the office' }));
await check('somebody who leads nothing changes nobody', 'deny',
  () => updateDoc(doc(as('samy'), 'addressBook', 'wm_worship'), { name: 'Samy was here' }));

// ---- the notifications master switch (A-081) ----------------------------
await check('the master admin switches phone notifications on', 'allow',
  () => setDoc(doc(as('martin'), 'churchSettings', 'notifications'), { live: true, updatedBy: 'u_martin' }));
/* What this church uses (F-230): a master admin switches parts on and off. */
await check('FEATURES: a master admin switches the session planner on', 'allow',
  () => setDoc(doc(as('martin'), 'churchSettings', 'features'), { sessionPlanner: true, care: false, updatedBy: 'u_martin' }));
/* EVERY switch the hub has (functions/features.js), at once: a name added
   there and to egbc-auth.js but not to this rule (the quiz, 21 Oct 2026)
   would make Church settings' Save refused for everyone. */
await check('  every switch in functions/features.js, saved together', 'allow',
  () => setDoc(doc(as('martin'), 'churchSettings', 'features'),
    Object.assign(Object.fromEntries(SERVER_FEATURES.map(x => [x.name, x.on])), { updatedBy: 'u_martin' })));
await check('  but not a name the hub does not know', 'deny',
  () => setDoc(doc(as('martin'), 'churchSettings', 'features'), { somethingElse: true }));
await check('  and nobody else may', 'deny',
  () => setDoc(doc(as('officeAdmin'), 'churchSettings', 'features'), { sessionPlanner: true }));
await check('  while anybody may read them (every page asks)', 'allow',
  () => getDoc(doc(as('attender'), 'churchSettings', 'features')));
await check('  an admin who is not master cannot', 'deny',
  () => setDoc(doc(as('karen'), 'churchSettings', 'notifications'), { live: false }));
await check('  nor the Church office', 'deny',
  () => setDoc(doc(as('officeAdmin'), 'churchSettings', 'notifications'), { live: false }));
await check('  and it holds a yes or no and nothing else', 'deny',
  () => setDoc(doc(as('martin'), 'churchSettings', 'notifications'), { live: 'yes' }));
await check('  nor anything beside it', 'deny',
  () => setDoc(doc(as('martin'), 'churchSettings', 'notifications'), { live: true, sendTo: 'everyone' }));

// ---- a parent reads their children's youth boards (6c) -------------------
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore();
  await updateDoc(doc(d, 'users', 'u_parent'), { familyGroups: ['Lazers'] });
  await setDoc(doc(d, 'worshipBoardState', 'lazers'), { pages: [], notes: [] });
  await setDoc(doc(d, 'worshipBoardState', 'renu'), { pages: [], notes: [] });
  await setDoc(doc(d, 'boardComments', 'bc_fam_lazers'), { boardId: 'lazers', noteId: 'n1', text: 'x', byUid: 'u_lazers_lead', byName: 'L', createdAt: 'then' });
  await setDoc(doc(d, 'boardComments', 'bc_fam_renu'), { boardId: 'renu', noteId: 'n1', text: 'x', byUid: 'u_renu_lead', byName: 'R', createdAt: 'then' });
});
await check('a parent reads the board of their child’s group', 'allow',
  () => getDoc(doc(as('parent'), 'worshipBoardState', 'lazers')));
await check('  and its comments', 'allow',
  () => getDoc(doc(as('parent'), 'boardComments', 'bc_fam_lazers')));
await check('  but NOT another youth group’s board', 'deny',
  () => getDoc(doc(as('parent'), 'worshipBoardState', 'renu')));
await check('  nor its comments', 'deny',
  () => getDoc(doc(as('parent'), 'boardComments', 'bc_fam_renu')));
await check('  and cannot write the board they can read', 'deny',
  () => setDoc(doc(as('parent'), 'worshipBoardState', 'lazers'), { pages: [], notes: [] }));
await check('an attender with no familyGroups reads no youth board', 'deny',
  () => getDoc(doc(as('attender'), 'worshipBoardState', 'lazers')));
await check('nobody can give themselves a family group', 'deny',
  () => updateDoc(doc(as('attender'), 'users', 'u_attender'), { familyGroups: ['ReNu'] }));
await check('  not even when making their record', 'deny',
  () => setDoc(doc(asNewcomer('u_fam_new', 'fam.new@example.invalid'), 'users', 'u_fam_new'),
    { status: 'pending', teams: [], adminFor: [], masterAdmin: false, familyGroups: ['ReNu'] }));
await check('  while making the same record without it is fine', 'allow',
  () => setDoc(doc(asNewcomer('u_fam_new2', 'fam.new2@example.invalid'), 'users', 'u_fam_new2'),
    { status: 'pending', teams: [], adminFor: [], masterAdmin: false }));

// ── EVENTS (events window) ── rooms made of other rooms (Martin, 14 Oct 2026)
// A test hall bookable whole or as two halves. The whole has no day of its
// own: it marks each half's.
{
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const R = (name, extra) => ({ name, kind: 'room', siteId: 'site_bk', capacity: 20, active: true, bookableByMembers: true, ...(extra || {}) });
    await setDoc(doc(d, 'rooms', 'room_whole'), R('Test hall (whole)', { capacity: 45, parts: ['room_halfA', 'room_halfB'] }));
    await setDoc(doc(d, 'rooms', 'room_halfA'), R('Test hall, front half'));
    await setDoc(doc(d, 'rooms', 'room_halfB'), R('Test hall, back half'));
  });
  const KK = (n) => ('bk_cr_' + n).padEnd(31, '0');
  const BK = (room, day, start, end, extra) => ({ kind: 'member', status: 'confirmed', siteId: 'site_bk', roomId: room, groupId: '', day, startMin: start, endMin: end,
    startLocal: day + 'T00:00', endLocal: day + 'T00:00', slotFrom: Math.floor(start / 15), slotTo: Math.ceil(end / 15), setupMins: 0, packdownMins: 0,
    title: 'Test', people: 6, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '',
    requester: { name: 'Samy', email: 'samy@example.invalid', phone: '', org: '' }, memberUid: 'u_samy', memberName: 'Samy', createdAt: 'x', ...(extra || {}) });
  const dayNow = async (id) => { let sl; await env.withSecurityRulesDisabled(async (c) => { const s = await getDoc(doc(c.firestore(), 'roomDays', id)); sl = s.exists() ? s.data().slots : Array(96).fill(0); }); return sl; };
  /* A confirmed booking, marking the days named (each as it is now). */
  const bookOn = async (dbx, key, b, dayRooms) => {
    const x = writeBatch(dbx);
    x.set(doc(dbx, 'bookings', key), b);
    for (const r of dayRooms) {
      const sl = (await dayNow(r + '_' + b.day)).slice();
      for (let i = b.slotFrom; i < b.slotTo; i++) sl[i] = 1;
      x.set(doc(dbx, 'roomDays', r + '_' + b.day), { slots: sl, lastBooking: key, roomId: r, day: b.day, siteId: 'site_bk' });
    }
    return x.commit();
  };
  const D = '2026-12-02';
  await check('combined room: a member books the WHOLE hall, marking both halves', 'allow', () => bookOn(as('samy'), KK('w10'), BK('room_whole', D, 600, 660), ['room_halfA', 'room_halfB']));
  await check('  not marking only one half', 'deny', () => bookOn(as('samy'), KK('w12a'), BK('room_whole', D, 720, 780), ['room_halfA']));
  await check('  not marking the whole room’s own day instead of the halves', 'deny', () => bookOn(as('samy'), KK('w12b'), BK('room_whole', D, 720, 780), ['room_whole']));
  await check('  a HALF cannot be booked while the whole is', 'deny', () => bookOn(as('samy'), KK('a10'), BK('room_halfA', D, 630, 690), ['room_halfA']));
  await check('  nor asked for', 'deny', () => setDoc(doc(as('samy'), 'bookings', KK('a10r')), BK('room_halfA', D, 630, 690, { status: 'requested' })));
  await check('  a half at a free time is fine', 'allow', () => bookOn(as('samy'), KK('a14'), BK('room_halfA', D, 840, 900), ['room_halfA']));
  await check('  then the WHOLE cannot be booked over that half', 'deny', () => bookOn(as('samy'), KK('w14'), BK('room_whole', D, 840, 900), ['room_halfA', 'room_halfB']));
  await check('  nor asked for (a request is checked against both halves)', 'deny', () => setDoc(doc(as('samy'), 'bookings', KK('w14r')),
    BK('room_whole', D, 840, 900, { status: 'requested' })));
  await check('  a booking of one half cannot mark the OTHER half’s day too', 'deny', () => bookOn(as('samy'), KK('a15x'), BK('room_halfA', D, 1200, 1260), ['room_halfA', 'room_halfB']));
  await check('  while the OTHER half at that time is fine', 'allow', () => bookOn(as('samy'), KK('b14'), BK('room_halfB', D, 840, 900), ['room_halfB']));
  await check('  the office books the whole, holding both halves', 'allow', () => bookOn(as('karen'), KK('ow16'), BK('room_whole', D, 960, 1020, { kind: 'office', memberUid: '', memberName: '' }), ['room_halfA', 'room_halfB']));
  await check('  but not holding only one', 'deny', () => bookOn(as('karen'), KK('ow18'), BK('room_whole', D, 1080, 1140, { kind: 'office', memberUid: '', memberName: '' }), ['room_halfA']));
  /* The member gives back their whole-hall booking: both halves, in the same write. */
  const giveBack = async (dbx, key, b, dayRooms) => {
    const x = writeBatch(dbx);
    x.update(doc(dbx, 'bookings', key), { status: 'cancelled', cancelledAt: 'x', cancelledBy: 'u_samy' });
    for (const r of dayRooms) {
      const before = await dayNow(r + '_' + b.day), sl = before.slice();
      for (let i = b.slotFrom; i < b.slotTo; i++) sl[i] = 0;
      let last = ''; await env.withSecurityRulesDisabled(async (c) => { const s = await getDoc(doc(c.firestore(), 'roomDays', r + '_' + b.day)); last = s.exists() ? s.data().lastBooking : ''; });
      x.set(doc(dbx, 'roomDays', r + '_' + b.day), { slots: sl, lastBooking: last, roomId: r, day: b.day, siteId: 'site_bk', lastCancel: key });
    }
    return x.commit();
  };
  await check('  a member cancels their whole-hall booking: not giving back only one half', 'deny', () => giveBack(as('samy'), KK('w10'), BK('room_whole', D, 600, 660), ['room_halfA']));
  await check('  giving back both halves is fine', 'allow', () => giveBack(as('samy'), KK('w10'), BK('room_whole', D, 600, 660), ['room_halfA', 'room_halfB']));
  await check('  and the half is free again', 'allow', () => bookOn(as('samy'), KK('a10b'), BK('room_halfA', D, 600, 660), ['room_halfA']));
}

// Deleted events: what, when and who (F-180, ChurchSuite's "deleted events").
{
  const DEL = (by, extra) => ({ title: 'Film club (invented)', startUtc: 1, endUtc: 2, seriesId: 'ser_x', count: 3, byUid: PEOPLE[by].uid, byName: 'Someone', at: serverTimestamp(), ...(extra || {}) });
  await check('deleted events: an admin records the series they delete', 'allow', () => setDoc(doc(as('karen'), 'calEventsDeleted', 'd1'), DEL('karen')));
  await check('  not in somebody else\'s name', 'deny', () => setDoc(doc(as('karen'), 'calEventsDeleted', 'd2'), DEL('martin')));
  await check('  not at a time of their choosing', 'deny', () => setDoc(doc(as('karen'), 'calEventsDeleted', 'd3'), DEL('karen', { at: 5 })));
  await check('  not with anything else on it', 'deny', () => setDoc(doc(as('karen'), 'calEventsDeleted', 'd4'), DEL('karen', { who: ['a guest'] })));
  await check('  somebody who is not an admin cannot write one', 'deny', () => setDoc(doc(as('samy'), 'calEventsDeleted', 'd5'), DEL('samy')));
  await check('  an admin reads the list', 'allow', () => getDocs(collection(as('martin'), 'calEventsDeleted')));
  await check('  nobody else does', 'deny', () => getDocs(collection(as('member'), 'calEventsDeleted')));
  await check('  nor signed out', 'deny', () => getDoc(doc(env.unauthenticatedContext().firestore(), 'calEventsDeleted', 'd1')));
  await check('  NOBODY CHANGES ONE, not even a master admin', 'deny', () => updateDoc(doc(as('martin'), 'calEventsDeleted', 'd1'), { byName: 'Nobody' }));
  await check('  NOR REMOVES ONE', 'deny', () => deleteDoc(doc(as('martin'), 'calEventsDeleted', 'd1')));
}

// The church's own event categories (F-180).
{
  const CAT = (extra) => ({ name: 'Art Club', colour: '#aa3366', order: 3, retired: false, ...(extra || {}) });
  await check('event categories: an admin adds one', 'allow', () => setDoc(doc(as('karen'), 'eventCategories', 'art-club'), CAT()));
  await check('  and retires it', 'allow', () => setDoc(doc(as('karen'), 'eventCategories', 'art-club'), CAT({ retired: true })));
  await check('  somebody who is not an admin cannot', 'deny', () => setDoc(doc(as('samy'), 'eventCategories', 'samy-cat'), CAT()));
  await check('  not with a colour that is not a colour', 'deny', () => setDoc(doc(as('karen'), 'eventCategories', 'bad-colour'), CAT({ colour: 'red; x' })));
  await check('  not with no name', 'deny', () => setDoc(doc(as('karen'), 'eventCategories', 'no-name'), CAT({ name: '' })));
  await check('  not with anything else on it', 'deny', () => setDoc(doc(as('karen'), 'eventCategories', 'extra'), CAT({ who: 'x' })));
  await check('  not under an id that is not a plain word', 'deny', () => setDoc(doc(as('karen'), 'eventCategories', 'Art Club!'), CAT()));
  await check('  NOBODY DELETES ONE, not even a master admin', 'deny', () => deleteDoc(doc(as('martin'), 'eventCategories', 'art-club')));
  await check('  anyone reads them, signed out too (What\'s on shows them)', 'allow', () => getDocs(collection(env.unauthenticatedContext().firestore(), 'eventCategories')));
}

// Paid on the day (F-183).
{
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'calEvents', 'ev_pay'), { title: 'Barn dance (invented)', audience: ['public'], visibility: 'public', status: 'confirmed', createdBy: 'u_martin', teamUids: ['u_karen'] });
    await setDoc(doc(db, 'signups', 'sp_key_1'), { calEventId: 'ev_pay', name: 'Pat Payer (invented)', email: 'pat@example.invalid', places: 2, status: 'confirmed' });
    await setDoc(doc(db, 'eventLeaders', 'ev_pay'), { leaderUids: ['u_samy'] });
    await setDoc(doc(db, 'signups', 'sp_key_2'), { calEventId: 'ev_pay', name: 'Pip Payer (invented)', email: 'pip@example.invalid', places: 1, status: 'confirmed' });
  });
  const PAY = (by, extra) => ({ calEventId: 'ev_pay', paid: true, amount: 12, method: 'cash', by: PEOPLE[by].uid, byName: 'Someone', at: serverTimestamp(), ...(extra || {}) });
  await check('PAID ON THE DAY: the event\'s leader marks a place paid at the door', 'allow', () => setDoc(doc(as('samy'), 'signupPayments', 'sp_key_1'), PAY('samy')));
  await check('  and the event team can (F-212)', 'allow', () => setDoc(doc(as('karen'), 'signupPayments', 'sp_key_1'), PAY('karen', { method: 'card' })));
  await check('  somebody who is not its leader or an admin cannot', 'deny', () => setDoc(doc(as('member'), 'signupPayments', 'sp_key_1'), PAY('member')));
  await check('  not for a sign-up to another event', 'deny', () => setDoc(doc(as('samy'), 'signupPayments', 'sp_key_1'), PAY('samy', { calEventId: 'ev_other' })));
  await check('  not for a sign-up that does not exist', 'deny', () => setDoc(doc(as('samy'), 'signupPayments', 'sp_nobody'), PAY('samy')));
  await check('  NOT EVEN AN ADMIN files a payment under a different event from the sign-up\'s', 'deny', () => setDoc(doc(as('karen'), 'signupPayments', 'sp_key_2'), PAY('karen', { calEventId: 'ev_other' })));
  await check('  not in somebody else\'s name', 'deny', () => setDoc(doc(as('samy'), 'signupPayments', 'sp_key_1'), PAY('karen')));
  await check('  not paid in something that is not a way of paying', 'deny', () => setDoc(doc(as('samy'), 'signupPayments', 'sp_key_1'), PAY('samy', { method: 'iou' })));
  await check('  marked NOT paid again is a change, allowed', 'allow', () => setDoc(doc(as('samy'), 'signupPayments', 'sp_key_1'), PAY('samy', { paid: false, amount: 0, method: '' })));
  await check('  the person, by their key, reads whether they have paid', 'allow', () => getDoc(doc(env.unauthenticatedContext().firestore(), 'signupPayments', 'sp_key_1')));
  await check('  but nobody signed out lists them', 'deny', () => getDocs(collection(env.unauthenticatedContext().firestore(), 'signupPayments')));
  await check('  the leader lists the event\'s', 'allow', () => getDocs(query(collection(as('samy'), 'signupPayments'), where('calEventId', '==', 'ev_pay'))));
  await check('  nobody deletes one', 'deny', () => deleteDoc(doc(as('martin'), 'signupPayments', 'sp_key_1')));
}

// The whole series (F-184). The allowed path - made in the same write as its
// own new sign-up - is driven through the real page in series.test.mjs.
{
  const G = { seriesId: 'ser_x', keys: ['sp_key_1', 'sp_new_2'], calEventIds: ['ev_pay', 'ev_pay2'], email: 'pat@example.invalid', createdAt: 'x' };
  await check('WHOLE SERIES: no series record for a sign-up that already exists (someone else\'s)', 'deny', () => setDoc(doc(env.unauthenticatedContext().firestore(), 'seriesSignups', 'sp_key_1'), G));
  await check('  nor for a sign-up that is not being made in the same write', 'deny', () => setDoc(doc(env.unauthenticatedContext().firestore(), 'seriesSignups', 'sp_new_2'), G));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'seriesSignups', 'sp_seeded'), { ...G, keys: ['sp_seeded', 'sp_new_2'] }); });
  await check('  the key-holder reads theirs', 'allow', () => getDoc(doc(env.unauthenticatedContext().firestore(), 'seriesSignups', 'sp_seeded')));
  await check('  nobody but an admin lists them', 'deny', () => getDocs(collection(as('member'), 'seriesSignups')));
  await check('  nobody changes one', 'deny', () => updateDoc(doc(as('martin'), 'seriesSignups', 'sp_seeded'), { email: 'x@example.invalid' }));
}

// Label size (F-185).
{
  const LS = (by, extra) => ({ format: 'brother62x29', updatedAt: serverTimestamp(), updatedBy: PEOPLE[by].uid, ...(extra || {}) });
  await check('LABEL SIZE: an admin chooses it', 'allow', () => setDoc(doc(as('karen'), 'labelSettings', 'main'), LS('karen')));
  await check('  somebody who is not an admin cannot', 'deny', () => setDoc(doc(as('samy'), 'labelSettings', 'main'), LS('samy')));
  await check('  not a size the pages do not know', 'deny', () => setDoc(doc(as('karen'), 'labelSettings', 'main'), LS('karen', { format: 'huge' })));
  await check('  not in somebody else\'s name', 'deny', () => setDoc(doc(as('karen'), 'labelSettings', 'main'), LS('martin')));
  await check('  anyone signed in who prints labels reads it', 'allow', () => getDoc(doc(as('samy'), 'labelSettings', 'main')));
  await check('  not signed out', 'deny', () => getDoc(doc(env.unauthenticatedContext().firestore(), 'labelSettings', 'main')));
}

// Taking money through the church's own Stripe account (F-181).
{
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'paymentSecrets', 'stripe'), { secretKey: 'rk_test_secret', webhookSecret: 'whsec_secret' });
    await setDoc(doc(db, 'paymentSettings', 'stripe'), { connected: true, accountName: 'Test', accountLast4: '1234', mode: 'test' });
    await setDoc(doc(db, 'paymentSettings', 'public'), { card: true });
    await setDoc(doc(db, 'paymentEvents', 'stripe_evt_1'), { at: 'x' });
    await setDoc(doc(db, 'users', 'u_fin'), { uid: 'u_fin', memberId: 'm_fin', status: 'active', name: 'Fin', teams: ['Finance'], adminFor: [], masterAdmin: false, attender: true });
  });
  const fin = () => env.authenticatedContext('u_fin').firestore();
  await check('PAYMENTS: the key is refused to everyone, a master admin included', 'deny', () => getDoc(doc(as('martin'), 'paymentSecrets', 'stripe')));
  await check('  and to the money team', 'deny', () => getDoc(doc(fin(), 'paymentSecrets', 'stripe')));
  await check('  nobody writes one from a page', 'deny', () => setDoc(doc(as('martin'), 'paymentSecrets', 'stripe'), { secretKey: 'rk_test_mine' }));
  await check('  whether card payments are taken: anyone, signed out too', 'allow', () => getDoc(doc(env.unauthenticatedContext().firestore(), 'paymentSettings', 'public')));
  await check('  the connected account: an admin reads it', 'allow', () => getDoc(doc(as('karen'), 'paymentSettings', 'stripe')));
  await check('  and the money team', 'allow', () => getDoc(doc(fin(), 'paymentSettings', 'stripe')));
  await check('  not anyone else', 'deny', () => getDoc(doc(as('member'), 'paymentSettings', 'stripe')));
  await check('  nobody changes the settings from a page, not even a master admin', 'deny', () => setDoc(doc(as('martin'), 'paymentSettings', 'public'), { card: false }));
  await check('  the server\'s record of messages is nobody\'s', 'deny', () => getDoc(doc(as('martin'), 'paymentEvents', 'stripe_evt_1')));
  await check('  A PAGE CANNOT MARK A PLACE "paid by card online"', 'deny', () => setDoc(doc(as('samy'), 'signupPayments', 'sp_key_1'), { calEventId: 'ev_pay', paid: true, amount: 12, method: 'card-online', by: 'u_samy', byName: 'S', at: serverTimestamp() }));
}

// Regular giving by Direct Debit (F-181, GoCardless).
{
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'regularGifts', 'rg_' + 'K'.repeat(28)), { name: 'Gill', amount: 20, status: 'active' });
    await setDoc(doc(c.firestore(), 'donations', 'gc_PM1'), { amount: 20, giftAid: true });
  });
  const fin = () => env.authenticatedContext('u_fin').firestore();
  await check('GIVING: the giver reads their own gift by its key, signed out too', 'allow', () => getDoc(doc(env.unauthenticatedContext().firestore(), 'regularGifts', 'rg_' + 'K'.repeat(28))));
  await check('  but nobody lists the gifts except the treasurer and the office', 'deny', () => getDocs(collection(as('member'), 'regularGifts')));
  await check('  the money team does', 'allow', () => getDocs(collection(fin(), 'regularGifts')));
  await check('  the gifts collected: the money team reads them', 'allow', () => getDocs(collection(fin(), 'donations')));
  await check('  nobody else', 'deny', () => getDocs(collection(as('samy'), 'donations')));
  await check('  nobody writes a gift from a page, not even a master admin', 'deny', () => setDoc(doc(as('martin'), 'donations', 'gc_fake'), { amount: 1000 }));
  await check('  nor changes a regular gift', 'deny', () => updateDoc(doc(as('martin'), 'regularGifts', 'rg_' + 'K'.repeat(28)), { amount: 1 }));
}

// The What's on calendar feed keys (R7).
{
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'eventFeeds', 'K'.repeat(32)), { uid: 'u_samy' }); });
  await check('FEED KEYS: nobody reads one from a page, not even its owner or a master admin', 'deny', () => getDoc(doc(as('samy'), 'eventFeeds', 'K'.repeat(32))));
  await check('  nor lists them', 'deny', () => getDocs(collection(as('martin'), 'eventFeeds')));
  await check('  nor makes one', 'deny', () => setDoc(doc(as('samy'), 'eventFeeds', 'M'.repeat(32)), { uid: 'u_samy' }));
}

// Checklist reminders' own records (R11).
{
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'checklistReminders', 'ev_x_abc_tomorrow'), { ok: true }); });
  await check('CHECKLIST REMINDERS: their record is nobody\'s to read, not even a master admin\'s', 'deny', () => getDoc(doc(as('martin'), 'checklistReminders', 'ev_x_abc_tomorrow')));
  await check('  nor to write', 'deny', () => setDoc(doc(as('martin'), 'checklistReminders', 'ev_y'), { ok: true }));
}

// THE EVENT TEAM (F-212; Martin, 15 Oct: "if I run Film Club only me,
// Natasha and Val should be able to edit things and download lists").
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const U = (uid, mid, teams, adminFor) => setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor, masterAdmin: false });
    await U('u_natasha', 'm_natasha', [], []);              // no admin role at all
    await U('u_val', 'm_val', ['Kids Church'], []);          // on the team by her account only
    await U('u_mo', 'm_mo', ['Maintenance'], ['Maintenance']); // the Maintenance admin, not on the team
    await U('u_quiz', 'm_quiz', [], []);                     // runs a different event
    await setDoc(doc(db, 'calEvents', 'ev_film'), { title: 'Film Club (invented)', audience: ['unlisted'], visibility: 'unlisted', status: 'confirmed',
      createdBy: 'u_martin', teams: ['Maintenance'], teamMemberIds: ['m_natasha'], teamUids: ['u_val'], signupOn: true, capacity: 20 });
    await setDoc(doc(db, 'calEvents', 'ev_quiz2'), { title: 'Quiz (invented)', audience: ['members'], visibility: 'members', status: 'confirmed',
      createdBy: 'u_martin', teams: [], teamMemberIds: ['m_quiz'], teamUids: [] });
    await setDoc(doc(db, 'signups', 'su_film_1'), { calEventId: 'ev_film', name: 'Fay Filmgoer (invented)', email: 'fay@example.invalid', places: 2, status: 'confirmed' });
    await setDoc(doc(db, 'signupPayments', 'su_film_1'), { calEventId: 'ev_film', paid: false, amount: 6, method: 'card-online', status: 'awaiting' });
    await setDoc(doc(db, 'checkins', 'ev_film__su_film_1__0'), { calEventId: 'ev_film', signupKey: 'su_film_1', attendeeIndex: 0, name: 'Fay', kind: 'booked', state: 'in', inAt: 'x', inBy: 'u_martin', day: '2026-11-20' });
  });
  const film = (uid) => getDocs(query(collection(ctx(uid), 'signups'), where('calEventId', '==', 'ev_film')));
  await check('EVENT TEAM: Natasha (no admin role) opens Film Club, though it is not listed', 'allow', () => getDoc(doc(ctx('u_natasha'), 'calEvents', 'ev_film')));
  await check('  and edits it', 'allow', () => updateDoc(doc(ctx('u_natasha'), 'calEvents', 'ev_film'), { title: 'Film Club: Paddington (invented)' }));
  await check('  its ticket types', 'allow', () => setDoc(doc(ctx('u_natasha'), 'calEvents', 'ev_film', 'ticketTypes', 'tt_child'), { name: 'Child', price: 2, capacity: 0 }));
  await check('  and its questions', 'allow', () => setDoc(doc(ctx('u_natasha'), 'calEvents', 'ev_film', 'questions', 'q_snack'), { label: 'Popcorn?', kind: 'yesno' }));
  await check('  sees its sign-ups (the lists and the door sheet)', 'allow', () => film('u_natasha'));
  await check('  and its payments', 'allow', () => getDocs(query(collection(ctx('u_natasha'), 'signupPayments'), where('calEventId', '==', 'ev_film'))));
  await check('  checks people in at the door', 'allow', () => setDoc(doc(ctx('u_natasha'), 'checkins', 'ev_film__su_film_1__1'), { calEventId: 'ev_film', signupKey: 'su_film_1', attendeeIndex: 1, name: 'Finn', kind: 'booked', state: 'in', inAt: 'x', inBy: 'u_natasha', inByName: 'Natasha', roomId: '', day: '2026-11-20', updatedAt: 'x' }));
  await check('  sees who is in', 'allow', () => getDocs(query(collection(ctx('u_natasha'), 'checkins'), where('calEventId', '==', 'ev_film'))));
  await check('  and logs the emails she sends them', 'allow', () => setDoc(doc(ctx('u_natasha'), 'commsLog', 'cl_film'), { calEventId: 'ev_film', kind: 'email', subject: 'Popcorn', to: 2, failed: 0, by: 'Natasha', at: 'x' }));
  await check('VAL, ON THE TEAM BY HER ACCOUNT, sees the sign-ups too', 'allow', () => film('u_val'));
  await check('THE MAINTENANCE ADMIN (the event is tagged Maintenance, she is not on its team) CANNOT SEE FILM CLUB\'S LIST', 'deny', () => film('u_mo'));
  await check('  nor edit it', 'deny', () => updateDoc(doc(ctx('u_mo'), 'calEvents', 'ev_film'), { title: 'x' }));
  await check('  nor its ticket types', 'deny', () => setDoc(doc(ctx('u_mo'), 'calEvents', 'ev_film', 'ticketTypes', 'tt_mo'), { name: 'x', price: 0 }));
  await check('  nor its payments', 'deny', () => getDocs(query(collection(ctx('u_mo'), 'signupPayments'), where('calEventId', '==', 'ev_film'))));
  await check('  nor who is in', 'deny', () => getDocs(query(collection(ctx('u_mo'), 'checkins'), where('calEventId', '==', 'ev_film'))));
  await check('SOMEONE WHO RUNS ANOTHER EVENT cannot see Film Club\'s list', 'deny', () => film('u_quiz'));
  await check('  but sees their own', 'allow', () => getDocs(query(collection(ctx('u_quiz'), 'signups'), where('calEventId', '==', 'ev_quiz2'))));
  await check('A MASTER ADMIN sees it', 'allow', () => film('u_martin'));
  await check('AN ORDINARY MEMBER does not', 'deny', () => film('u_samy'));
  await check('NATASHA CANNOT MAKE A NEW EVENT (still an admin\'s job)', 'deny', () => setDoc(doc(ctx('u_natasha'), 'calEvents', 'ev_new_n'), { title: 'x', audience: ['members'], visibility: 'members', status: 'confirmed', createdBy: 'u_natasha' }));
  await check('  nor touch an event she does not run', 'deny', () => updateDoc(doc(ctx('u_natasha'), 'calEvents', 'ev_quiz2'), { title: 'x' }));
}

// THE FIRE ROLL-CALL (F-214; Martin, 15 Oct): named people see who is in.
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const DAYF = '2026-11-21';
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const U = (uid, mid, teams, adminFor) => setDoc(doc(db, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor, masterAdmin: false });
    await U('u_wanda', 'm_wanda', [], []);   // fire warden, every building
    await U('u_sid', 'm_sid', [], []);       // fire warden, building B only
    await U('u_quinn', 'm_quinn', [], []);   // runs a different event
    await setDoc(doc(db, 'fireRollCall', 'main'), { people: [], memberIds: ['m_wanda', 'm_sid'], allSites: ['m_wanda'], bySite: { site_b: ['m_sid'] }, updatedBy: 'u_martin', updatedByName: 'x', updatedAt: 'x' });
    await setDoc(doc(db, 'calEvents', 'ev_fa'), { title: 'Film Club A (invented)', audience: ['members'], visibility: 'members', status: 'confirmed', createdBy: 'u_martin', teamMemberIds: [], teamUids: ['u_natasha'] });
    await setDoc(doc(db, 'calEvents', 'ev_qz'), { title: 'Quiz (invented)', audience: ['members'], visibility: 'members', status: 'confirmed', createdBy: 'u_martin', teamMemberIds: ['m_quinn'], teamUids: [] });
    await setDoc(doc(db, 'signups', 'su_fa_1'), { calEventId: 'ev_fa', name: 'Ann Answer (invented)', email: 'ann@example.invalid', places: 1, status: 'confirmed', answers: { q_med: 'SECRET-ASTHMA' } });
    await setDoc(doc(db, 'checkins', 'ev_fa__su_fa_1__0'), { calEventId: 'ev_fa', signupKey: 'su_fa_1', attendeeIndex: 0, name: 'Ann', kind: 'booked', state: 'in', inAt: 'x', inBy: 'u_natasha', day: DAYF, buildingId: 'site_a', roomId: '' });
    await setDoc(doc(db, 'checkins', 'ev_qz__su_qz_1__0'), { calEventId: 'ev_qz', signupKey: 'su_qz_1', attendeeIndex: 0, name: 'Quinn guest', kind: 'booked', state: 'in', inAt: 'x', inBy: 'u_quinn', day: DAYF, buildingId: 'site_b', roomId: '' });
  });
  const roll = (uid, extra) => getDocs(extra ? query(collection(ctx(uid), 'checkins'), where('day', '==', DAYF), where('kind', 'in', ['booked', 'walkin', 'leader']), where('buildingId', '==', extra))
                                              : query(collection(ctx(uid), 'checkins'), where('day', '==', DAYF), where('kind', 'in', ['booked', 'walkin', 'leader'])));
  await check('FIRE ROLL-CALL: a warden for every building sees today\'s check-ins', 'allow', () => roll('u_wanda'));
  await check('  a warden for building B sees building B\'s', 'allow', () => roll('u_sid', 'site_b'));
  await check('  but not building A\'s', 'deny', () => roll('u_sid', 'site_a'));
  await check('  nor every building\'s', 'deny', () => roll('u_sid'));
  await check('AN EVENT TEAM MEMBER OF A DIFFERENT EVENT does not get the roll-call', 'deny', () => roll('u_quinn'));
  await check('  nor Film Club\'s check-ins', 'deny', () => getDocs(query(collection(ctx('u_quinn'), 'checkins'), where('calEventId', '==', 'ev_fa'))));
  await check('THE WARDEN CANNOT SEE SIGN-UP ANSWERS', 'deny', () => getDocs(query(collection(ctx('u_wanda'), 'signups'), where('calEventId', '==', 'ev_fa'))));
  await check('  nor the children\'s Sunday check-ins', 'deny', () => getDocs(query(collection(ctx('u_wanda'), 'checkins'), where('calEventId', '==', 'kids_grp_junior_' + DAYF))));
  await check('  a warden reads the list they are on', 'allow', () => getDoc(doc(ctx('u_wanda'), 'fireRollCall', 'main')));
  await check('  someone not on it does not', 'deny', () => getDoc(doc(ctx('u_quinn'), 'fireRollCall', 'main')));
  await check('  nor does a warden change it', 'deny', () => setDoc(doc(ctx('u_wanda'), 'fireRollCall', 'main'), { people: [], memberIds: ['m_wanda', 'm_quinn'], allSites: ['m_wanda', 'm_quinn'], bySite: {}, updatedBy: 'u_wanda', updatedByName: 'x', updatedAt: 'x' }));
  await check('  a master admin does', 'allow', () => setDoc(doc(as('martin'), 'fireRollCall', 'main'), { people: [], memberIds: ['m_wanda', 'm_sid'], allSites: ['m_wanda'], bySite: { site_b: ['m_sid'] }, updatedBy: 'u_martin', updatedByName: 'Martin', updatedAt: 'x' }));
  // Children as numbers (F-216): kidsCounts, kept by a function.
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'kidsCounts', 'site_a__' + DAYF), { siteId: 'site_a', day: DAYF, total: 3, groups: [{ groupId: 'g', name: 'Juniors', roomId: '', n: 3 }], updatedAt: 'x' });
    await setDoc(doc(c.firestore(), 'kidsCounts', 'site_b__' + DAYF), { siteId: 'site_b', day: DAYF, total: 1, groups: [{ groupId: 'g2', name: 'Creche', roomId: '', n: 1 }], updatedAt: 'x' });
  });
  await check('CHILDREN AS NUMBERS: a warden for every building reads a count', 'allow', () => getDoc(doc(ctx('u_wanda'), 'kidsCounts', 'site_a__' + DAYF)));
  await check('  and lists today\'s', 'allow', () => getDocs(query(collection(ctx('u_wanda'), 'kidsCounts'), where('day', '==', DAYF))));
  await check('  a building-B warden reads building B\'s', 'allow', () => getDoc(doc(ctx('u_sid'), 'kidsCounts', 'site_b__' + DAYF)));
  await check('  but not building A\'s', 'deny', () => getDoc(doc(ctx('u_sid'), 'kidsCounts', 'site_a__' + DAYF)));
  await check('  someone not named reads none', 'deny', () => getDoc(doc(ctx('u_quinn'), 'kidsCounts', 'site_b__' + DAYF)));
  await check('  a master admin reads them', 'allow', () => getDoc(doc(as('martin'), 'kidsCounts', 'site_a__' + DAYF)));
  await check('  nobody writes one, not even a master admin (only the function)', 'deny', () => setDoc(doc(as('martin'), 'kidsCounts', 'site_a__' + DAYF), { siteId: 'site_a', day: DAYF, total: 99, groups: [], updatedAt: 'x' }));
  await check('  nor a warden', 'deny', () => setDoc(doc(ctx('u_wanda'), 'kidsCounts', 'site_a__' + DAYF), { siteId: 'site_a', day: DAYF, total: 0, groups: [], updatedAt: 'x' }));
  await check('  THE WARDEN READS NO CHILD\'S ROLL-CALL COPY (names)', 'deny', () => getDocs(query(collection(ctx('u_wanda'), 'kidsRoll'), where('siteId', '==', 'site_a'), where('day', '==', DAYF))));
  await check('  a check-in may carry its building (buildingId)', 'allow', () => setDoc(doc(as('martin'), 'checkins', 'ev_fa__su_fa_1__1'), { calEventId: 'ev_fa', signupKey: 'su_fa_1', attendeeIndex: 1, name: 'Abe', kind: 'booked', state: 'in', inAt: 'x', inBy: 'u_martin', inByName: 'M', roomId: '', day: DAYF, buildingId: 'site_a', updatedAt: 'x' }));
}

// THE SESSION PLANNER (F-223, F-225): each group's leaders edit its plans; its team reads.
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const U = (uid, mid, teams) => setDoc(doc(d, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor: [], masterAdmin: false });
    await U('u_samy', 'm_samy', ['Kids Church']);
    await U('u_tomk', 'm_tomk', ['Kids Church']);
    await U('u_yola', 'm_yola', ['Youth']);
    await U('u_nobo', 'm_nobo', []);
    /* main's H-15: a core team's members have the teams it covers, kept on their record by the server */
    await setDoc(doc(d, 'users', 'u_kycore'), { uid: 'u_kycore', memberId: 'm_kycore', status: 'active', name: 'Kids and Youth core (invented)', teams: ['Kids & Youth Core Team'], covers: ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship'], adminFor: [], masterAdmin: false });
    await setDoc(doc(d, 'users', 'u_wcore'), { uid: 'u_wcore', memberId: 'm_wcore', status: 'active', name: 'Worship core (invented)', teams: ['Core Team'], covers: ['Worship', 'AV', 'Choir'], adminFor: [], masterAdmin: false });
    await setDoc(doc(d, 'calEvents', 'ev_kidsonly'), { title: 'Kids Church team night (invented)', visibility: 'public', status: 'confirmed', audience: ['Kids Church'], startUtc: 1765533600000, startLocal: '2026-12-12T10:00', teams: [], createdBy: 'u_martin' });
    await setDoc(doc(d, 'planGroups', 'pg_kids'), { name: 'Kids Church', kind: 'children', leaderIds: ['m_samy'], teamName: 'Kids Church' });
    await setDoc(doc(d, 'planGroups', 'pg_youth'), { name: 'Youth', kind: 'youth', leaderIds: ['m_yola'], teamName: 'Youth' });
    await setDoc(doc(d, 'planSessions', 'ps_1'), { groupId: 'pg_kids', date: '2026-11-01', title: 'Born again?', parts: [], updatedBy: 'u_samy' });
    await setDoc(doc(d, 'privateSettings', 'apiBible'), { key: 'SYNTHETIC-KEY' });
  });
  const PS = (uid, extra) => ({ groupId: 'pg_kids', date: '2026-11-08', title: 'Valued', parts: [{ id: 'a', title: 'Welcome' }], updatedBy: uid, updatedByName: 'x', updatedAt: 'x', ...(extra || {}) });
  /* H-15: core teams cover chosen teams - the Session planner and Present for a Kids & Youth Core Team member, not a Worship Core Team member */
  await check('H-15: A KIDS & YOUTH CORE TEAM MEMBER READS KIDS CHURCH’S SESSION GROUP (their core team covers it)', 'allow', () => getDoc(doc(ctx('u_kycore'), 'planGroups', 'pg_kids')));
  await check('  and finds it by its team', 'allow', () => getDocs(query(collection(ctx('u_kycore'), 'planGroups'), where('teamName', 'in', ['Kids Church']))));
  await check('  and reads its plans (the Session planner, Present)', 'allow', () => getDoc(doc(ctx('u_kycore'), 'planSessions', 'ps_1')));
  await check('  A WORSHIP CORE TEAM MEMBER DOES NOT', 'deny', () => getDoc(doc(ctx('u_wcore'), 'planGroups', 'pg_kids')));
  await check('  nor its plans', 'deny', () => getDoc(doc(ctx('u_wcore'), 'planSessions', 'ps_1')));
  await check('  an event for Kids Church’s team: the Kids & Youth Core Team member sees it', 'allow', () => getDoc(doc(ctx('u_kycore'), 'calEvents', 'ev_kidsonly')));
  await check('  the Worship Core Team member doesn’t', 'deny', () => getDoc(doc(ctx('u_wcore'), 'calEvents', 'ev_kidsonly')));
  await check('PLANNER: a group leader writes a plan for the group', 'allow', () => setDoc(doc(ctx('u_samy'), 'planSessions', 'ps_2'), PS('u_samy')));
  await check('  and changes one', 'allow', () => setDoc(doc(ctx('u_samy'), 'planSessions', 'ps_1'), PS('u_samy', { date: '2026-11-01' })));
  await check('  but not in someone else\u2019s name', 'deny', () => setDoc(doc(ctx('u_samy'), 'planSessions', 'ps_3'), PS('u_tomk')));
  await check('  nor moves a plan to another group', 'deny', () => setDoc(doc(ctx('u_samy'), 'planSessions', 'ps_1'), PS('u_samy', { groupId: 'pg_youth' })));
  await check('  the team reads the plans', 'allow', () => getDoc(doc(ctx('u_tomk'), 'planSessions', 'ps_1')));
  await check('  and lists the group\u2019s', 'allow', () => getDocs(query(collection(ctx('u_tomk'), 'planSessions'), where('groupId', '==', 'pg_kids'))));
  await check('  A TEAM MEMBER CANNOT CHANGE A PLAN', 'deny', () => updateDoc(doc(ctx('u_tomk'), 'planSessions', 'ps_1'), { title: 'Tom was here', updatedBy: 'u_tomk' }));
  await check('  ANOTHER GROUP\u2019S LEADER CANNOT CHANGE IT', 'deny', () => setDoc(doc(ctx('u_yola'), 'planSessions', 'ps_1'), PS('u_yola', { date: '2026-11-01' })));
  await check('  nor read it', 'deny', () => getDoc(doc(ctx('u_yola'), 'planSessions', 'ps_1')));
  await check('  someone in no group reads nothing', 'deny', () => getDoc(doc(ctx('u_nobo'), 'planSessions', 'ps_1')));
  await check('  a master admin reads', 'allow', () => getDoc(doc(as('martin'), 'planSessions', 'ps_1')));
  await check('  a leader deletes a plan of the group', 'allow', () => deleteDoc(doc(ctx('u_samy'), 'planSessions', 'ps_2')));
  await check('  a team member does not', 'deny', () => deleteDoc(doc(ctx('u_tomk'), 'planSessions', 'ps_1')));
  await check('PLANNER GROUPS: a master admin sets one up', 'allow', () => setDoc(doc(as('martin'), 'planGroups', 'pg_new'), { name: 'Lazers', kind: 'youth', leaderIds: ['m_samy'], teamName: 'Lazers', updatedBy: 'u_martin', updatedAt: 'x' }));
  await check('  a group\u2019s own leader cannot change who leads it', 'deny', () => setDoc(doc(ctx('u_samy'), 'planGroups', 'pg_kids'), { name: 'Kids Church', kind: 'children', leaderIds: ['m_samy', 'm_nobo'], teamName: 'Kids Church' }));
  await check('  its team reads the group', 'allow', () => getDoc(doc(ctx('u_tomk'), 'planGroups', 'pg_kids')));
  await check('  someone else does not', 'deny', () => getDoc(doc(ctx('u_nobo'), 'planGroups', 'pg_kids')));
  await check('API.BIBLE\u2019S KEY: not even a master admin\u2019s page reads where it is kept', 'deny', () => getDoc(doc(as('martin'), 'privateSettings', 'apiBible')));
  await check('  nor writes it (only the server)', 'deny', () => setDoc(doc(as('martin'), 'privateSettings', 'apiBible'), { key: 'x' }));

  // PRESENT (F-242): a session's deck, its notes, and which slide everyone is on.
  const SCTX = { type: 'session', groupId: 'pg_kids', sessionId: 'ps_1' };
  const DK = (uid, extra) => ({ context: SCTX, name: 'Born again (invented)', status: 'uploaded', source: 'upload', by: uid, byName: 'x', at: 'x', ...(extra || {}) });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'presentDecks', 'dk_ready'), { ...DK('u_samy'), status: 'ready', count: 4 });
    await setDoc(doc(d, 'presentNotes', 'dk_ready'), { context: SCTX, notes: ['Say hello'] });
  });
  const NOW = (uid, extra) => ({ context: SCTX, slide: 0, presenterUid: uid, presenterName: 'x', startedAt: 'x', slideAt: 'x', blank: false, updatedBy: uid, ...(extra || {}) });
  await check('PRESENT: a group leader adds a deck to the group’s session', 'allow', () => setDoc(doc(ctx('u_samy'), 'presentDecks', 'dk_1'), DK('u_samy')));
  await check('  not in someone else’s name', 'deny', () => setDoc(doc(ctx('u_samy'), 'presentDecks', 'dk_2'), DK('u_tomk')));
  await check('  not already marked "ready" (only the converter says that)', 'deny', () => setDoc(doc(ctx('u_samy'), 'presentDecks', 'dk_3'), DK('u_samy', { status: 'ready' })));
  await check('  not for a session of another group', 'deny', () => setDoc(doc(ctx('u_samy'), 'presentDecks', 'dk_4'), DK('u_samy', { context: { ...SCTX, groupId: 'pg_youth' } })));
  await check('  A TEAM MEMBER CANNOT ADD ONE', 'deny', () => setDoc(doc(ctx('u_tomk'), 'presentDecks', 'dk_5'), DK('u_tomk')));
  await check('  the team reads the deck', 'allow', () => getDoc(doc(ctx('u_tomk'), 'presentDecks', 'dk_ready')));
  await check('  another group does not', 'deny', () => getDoc(doc(ctx('u_yola'), 'presentDecks', 'dk_ready')));
  await check('  the leader renames it, or keeps it', 'allow', () => updateDoc(doc(ctx('u_samy'), 'presentDecks', 'dk_ready'), { name: 'Renamed', keep: true }));
  await check('  but cannot mark it ready or change its count', 'deny', () => updateDoc(doc(ctx('u_samy'), 'presentDecks', 'dk_1'), { status: 'ready', count: 9 }));
  await check('THE SPEAKER NOTES: the leader reads them', 'allow', () => getDoc(doc(ctx('u_samy'), 'presentNotes', 'dk_ready')));
  await check('  THE TEAM FOLLOWING DOES NOT', 'deny', () => getDoc(doc(ctx('u_tomk'), 'presentNotes', 'dk_ready')));
  await check('  nobody writes them from a page (only the converter)', 'deny', () => setDoc(doc(as('martin'), 'presentNotes', 'dk_ready'), { context: SCTX, notes: [] }));
  await check('WHICH SLIDE: before anyone presents, the team may look (nothing there yet)', 'allow', () => getDoc(doc(ctx('u_tomk'), 'presentNow', 'ps_ps_1')));
  await check('  the leader starts presenting', 'allow', () => setDoc(doc(ctx('u_samy'), 'presentNow', 'ps_ps_1'), NOW('u_samy')));
  await check('  under the session’s own key only', 'deny', () => setDoc(doc(ctx('u_samy'), 'presentNow', 'ps_1'), NOW('u_samy')));
  await check('  the team reads which slide', 'allow', () => getDoc(doc(ctx('u_tomk'), 'presentNow', 'ps_ps_1')));
  await check('  another group does not', 'deny', () => getDoc(doc(ctx('u_yola'), 'presentNow', 'ps_ps_1')));
  await check('  the presenter moves on', 'allow', () => updateDoc(doc(ctx('u_samy'), 'presentNow', 'ps_ps_1'), { slide: 1, slideAt: 'y' }));
  await check('  A TEAM MEMBER CANNOT MOVE THE SLIDES', 'deny', () => updateDoc(doc(ctx('u_tomk'), 'presentNow', 'ps_ps_1'), { slide: 3, slideAt: 'z' }));
  await check('  nor take over', 'deny', () => setDoc(doc(ctx('u_tomk'), 'presentNow', 'ps_ps_1'), NOW('u_tomk')));
  await check('  a master admin may take over', 'allow', () => setDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), NOW('u_martin')));
  await check('  then the leader cannot just move the slides (it is not theirs now)', 'deny', () => updateDoc(doc(ctx('u_samy'), 'presentNow', 'ps_ps_1'), { slide: 2, slideAt: 'z' }));
  const MED = (extra) => ({ i: 1, k: 0, state: 'playing', at: 0, since: '2026-11-01T10:00:00.000Z', ...(extra || {}) });
  await check('A SLIDE’S VIDEO (F-251): the presenter plays it for everyone', 'allow', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { media: MED() }));
  await check('  and pauses it part way', 'allow', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { media: MED({ state: 'paused', at: 12.5 }) }));
  await check('  only "playing" or "paused"', 'deny', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { media: MED({ state: 'skip' }) }));
  await check('  nothing else in it', 'deny', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { media: MED({ url: 'https://elsewhere.invalid/x.mp4' }) }));
  await check('  A VIEWER CANNOT PLAY, PAUSE OR SKIP IT', 'deny', () => updateDoc(doc(ctx('u_tomk'), 'presentNow', 'ps_ps_1'), { media: MED({ at: 99 }) }));
  await check('  NOR A LEADER WHO IS NOT PRESENTING (take over first)', 'deny', () => updateDoc(doc(ctx('u_samy'), 'presentNow', 'ps_ps_1'), { media: MED({ at: 42 }) }));
  // THE QUIZ (F-255): TV mode in presentNow.quiz; phones mode in quizRuns (the functions write it).
  const QZ = (extra) => ({ step: 1, mode: 'tv', phase: 'question', q: 0, teams: [{ name: 'Lions', colour: '#7f1d1d', score: 0 }], bonus: false, first: -1, got: [], seed: 7, openedAt: 1, seconds: 20, ...(extra || {}) });
  await check('THE QUIZ, TV MODE: the presenter runs it', 'allow', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { quiz: QZ() }));
  await check('  and clears it', 'allow', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { quiz: null }));
  await check('  only "tv" or "phones"', 'deny', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { quiz: QZ({ mode: 'other' }) }));
  await check('  no more than 6 teams', 'deny', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { quiz: QZ({ teams: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: 'T' + n, colour: '#000', score: 0 })) }) }));
  await check('  nothing else in it', 'deny', () => updateDoc(doc(as('martin'), 'presentNow', 'ps_ps_1'), { quiz: QZ({ answer: 0 }) }));
  await check('  A TEAM MEMBER CANNOT CHANGE THE QUIZ OR THE SCORES', 'deny', () => updateDoc(doc(ctx('u_tomk'), 'presentNow', 'ps_ps_1'), { quiz: QZ({ teams: [{ name: 'Lions', colour: '#7f1d1d', score: 99 }] }) }));
  await check('  nor a leader who is not presenting', 'deny', () => updateDoc(doc(ctx('u_samy'), 'presentNow', 'ps_ps_1'), { quiz: QZ() }));
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'quizRuns', 'runInvented0000000000'), { code: '123456', phase: 'join', players: {}, createdAt: 1 });
    for (const [col, id] of [['quizSecret', 'runInvented0000000000'], ['quizAnswers', 'runInvented0000000000_0_p1'], ['quizPlayers', 'runInvented0000000000_p1'], ['quizCodes', '123456']]) await setDoc(doc(d, col, id), { runId: 'runInvented0000000000' });
  });
  await check('THE QUIZ, PHONES MODE: a player with no account reads the quiz by its id', 'allow', () => getDoc(doc(anon(), 'quizRuns', 'runInvented0000000000')));
  await check('  nobody lists the quizzes, signed in or not', 'deny', () => getDocs(collection(anon(), 'quizRuns')));
  await check('  not even a master admin', 'deny', () => getDocs(collection(as('martin'), 'quizRuns')));
  await check('  nobody writes one from a page (only the functions)', 'deny', () => setDoc(doc(as('martin'), 'quizRuns', 'runInvented0000000000'), { phase: 'final' }));
  for (const [col, id] of [['quizSecret', 'runInvented0000000000'], ['quizAnswers', 'runInvented0000000000_0_p1'], ['quizPlayers', 'runInvented0000000000_p1'], ['quizCodes', '123456']]) {
    await check('  ' + col + ' (the right answers, the answers, the keys, the codes): no page reads it, not even a master admin', 'deny', () => getDoc(doc(as('martin'), col, id)));
    await check('  nor a player', 'deny', () => getDoc(doc(anon(), col, id)));
  }
  await check('  a meeting’s deck is master admins only until the hosts are agreed', 'deny', () => setDoc(doc(ctx('u_samy'), 'presentDecks', 'dk_m'), DK('u_samy', { context: { type: 'meeting', meetingId: 'mt_1' } })));
}

// ── EVENTS (events window) ── BUILDING COMPLIANCE, Stage 2 (F-231, F-232): who sees and does what
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const U = (uid, mid, teams, extra) => setDoc(doc(d, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor: [], masterAdmin: false, ...(extra || {}) });
    await U('u_cmoff', 'm_cmoff', ['Church office']);
    await U('u_cmeld', 'm_cmeld', ['Elders']);
    await U('u_cmval', 'm_cmval', ['Maintenance']);
    await U('u_cmvol', 'm_cmvol', ['Welcome']);
    await setDoc(doc(d, 'sites', 'cs_a'), { name: 'Test church (invented)' });
    await setDoc(doc(d, 'rooms', 'cs_a_kit'), { siteId: 'cs_a', name: 'Kitchen' });
    await setDoc(doc(d, 'complianceTemplates', 'gas-safety'), { id: 'gas-safety', basis: 'legal', every: { n: 1, unit: 'year' }, version: 2 });
    await setDoc(doc(d, 'complianceTemplates', 'water-temps'), { id: 'water-temps', basis: 'standard', every: { n: 1, unit: 'month' }, version: 2 });
    await setDoc(doc(d, 'complianceTemplates', 'walk-round'), { id: 'walk-round', basis: 'practice', every: { n: 1, unit: 'month' }, version: 2 });
    const CK = (tid, every, resp, basis) => ({ siteId: 'cs_a', templateId: tid, templateVersion: 2, area: 'Fire', title: 'Check ' + tid, every, kind: 'check', basis, legal: basis === 'legal', baseEvery: every, lengthenReason: '', note: '', state: 'on', offReason: '', responsibleIds: resp, custom: false, edited: [], createdAt: 'x', updatedAt: 'x' });
    await setDoc(doc(d, 'buildingChecks', 'cs_a__gas-safety'), CK('gas-safety', { n: 1, unit: 'year' }, [], 'legal'));
    await setDoc(doc(d, 'buildingChecks', 'cs_a__water-temps'), CK('water-temps', { n: 1, unit: 'month' }, ['m_cmval'], 'standard'));
    await setDoc(doc(d, 'buildingChecks', 'cs_a__walk-round'), CK('walk-round', { n: 1, unit: 'month' }, [], 'practice'));
    await setDoc(doc(d, 'checkRecords', 'cr_gas'), { checkId: 'cs_a__gas-safety', siteId: 'cs_a', doneOn: '2026-01-10', doneBy: 'u_cmoff' });
    await setDoc(doc(d, 'checkRecords', 'cr_water'), { checkId: 'cs_a__water-temps', siteId: 'cs_a', doneOn: '2026-10-01', doneBy: 'u_cmval' });
    await setDoc(doc(d, 'buildingProfiles', 'cs_a'), { siteId: 'cs_a', gas: true });
    await setDoc(doc(d, 'complianceLog', 'cl_1'), { siteId: 'cs_a', what: 'profile', by: 'u_cmoff', byName: 'x', at: 'x', detail: {} });
  });
  const ck = (db, id, ch) => updateDoc(doc(db, 'buildingChecks', id), { ...ch, updatedAt: 'y' });
  const REC = (uid, checkId, extra) => ({ checkId, siteId: 'cs_a', doneOn: '2026-10-19', doneBy: uid, doneByName: uid, notes: '', files: [], certExpiry: '', items: [], jobId: '', at: 'x', ...(extra || {}) });

  // who sees
  await check('COMPLIANCE: the Church office reads every check', 'allow', () => getDocs(query(collection(ctx('u_cmoff'), 'buildingChecks'), where('siteId', '==', 'cs_a'))));
  await check('  a trustee (an Elder) reads every check', 'allow', () => getDocs(query(collection(ctx('u_cmeld'), 'buildingChecks'), where('siteId', '==', 'cs_a'))));
  await check('  and the history (the audit log)', 'allow', () => getDocs(query(collection(ctx('u_cmeld'), 'complianceLog'), where('siteId', '==', 'cs_a'))));
  await check('  a master admin reads the building’s answers', 'allow', () => getDoc(doc(as('martin'), 'buildingProfiles', 'cs_a')));
  await check('  AN ASSIGNED VOLUNTEER (Val) READS HER OWN CHECK', 'allow', () => getDoc(doc(ctx('u_cmval'), 'buildingChecks', 'cs_a__water-temps')));
  await check('  and lists hers', 'allow', () => getDocs(query(collection(ctx('u_cmval'), 'buildingChecks'), where('responsibleIds', 'array-contains', 'm_cmval'))));
  await check('  and its records', 'allow', () => getDocs(query(collection(ctx('u_cmval'), 'checkRecords'), where('checkId', '==', 'cs_a__water-temps'))));
  await check('  AN ASSIGNED VOLUNTEER CANNOT SEE A CHECK NOT ASSIGNED TO HER', 'deny', () => getDoc(doc(ctx('u_cmval'), 'buildingChecks', 'cs_a__gas-safety')));
  await check('  nor list the building’s checks', 'deny', () => getDocs(query(collection(ctx('u_cmval'), 'buildingChecks'), where('siteId', '==', 'cs_a'))));
  await check('  nor that check’s records', 'deny', () => getDoc(doc(ctx('u_cmval'), 'checkRecords', 'cr_gas')));
  await check('  nor the building’s answers, nor the audit log', 'deny', () => getDoc(doc(ctx('u_cmval'), 'buildingProfiles', 'cs_a')));
  await check('  (the audit log)', 'deny', () => getDoc(doc(ctx('u_cmval'), 'complianceLog', 'cl_1')));
  await check('  A NON-MEMBER (signed in, no record) SEES NOTHING: no check', 'deny', () => getDoc(doc(ctx('u_nobody_cmp'), 'buildingChecks', 'cs_a__water-temps')));
  await check('    no record', 'deny', () => getDoc(doc(ctx('u_nobody_cmp'), 'checkRecords', 'cr_water')));
  await check('    not the templates', 'deny', () => getDoc(doc(ctx('u_nobody_cmp'), 'complianceTemplates', 'gas-safety')));
  await check('    not the extinguisher register', 'deny', () => getDocs(collection(ctx('u_nobody_cmp'), 'fireEquipment')));
  await check('  a volunteer with no checks reads none', 'deny', () => getDoc(doc(ctx('u_cmvol'), 'buildingChecks', 'cs_a__water-temps')));
  await check('  a stranger, nothing', 'deny', () => getDoc(doc(anon(), 'buildingChecks', 'cs_a__water-temps')));

  // who does
  await check('  VAL RECORDS HER OWN CHECK DONE', 'allow', () => setDoc(doc(ctx('u_cmval'), 'checkRecords', 'cr_v1'), REC('u_cmval', 'cs_a__water-temps')));
  await check('  but not in someone else’s name', 'deny', () => setDoc(doc(ctx('u_cmval'), 'checkRecords', 'cr_v2'), REC('u_cmoff', 'cs_a__water-temps')));
  await check('  nor a check not hers', 'deny', () => setDoc(doc(ctx('u_cmval'), 'checkRecords', 'cr_v3'), REC('u_cmval', 'cs_a__gas-safety')));
  await check('  WHAT WAS DONE STAYS DONE: nobody changes a record', 'deny', () => updateDoc(doc(as('martin'), 'checkRecords', 'cr_water'), { doneOn: '2026-10-18' }));
  await check('    nor deletes one', 'deny', () => deleteDoc(doc(as('martin'), 'checkRecords', 'cr_water')));
  await check('  Val cannot change her check’s frequency', 'deny', () => ck(ctx('u_cmval'), 'cs_a__water-temps', { every: { n: 2, unit: 'month' } }));
  await check('  the office assigns a check to Val', 'allow', () => ck(ctx('u_cmoff'), 'cs_a__walk-round', { responsibleIds: ['m_cmval'] }));
  await check('  a trustee cannot edit a check (they see; the office does)', 'deny', () => ck(ctx('u_cmeld'), 'cs_a__walk-round', { responsibleIds: [] }));
  await check('  nobody deletes a check (removed, its history kept)', 'deny', () => deleteDoc(doc(as('martin'), 'buildingChecks', 'cs_a__walk-round')));

  // F-232: the law is a floor
  await check('  A LEGAL REQUIREMENT MADE LESS FREQUENT: REFUSED (gas safety every 2 years)', 'deny', () => ck(as('martin'), 'cs_a__gas-safety', { every: { n: 2, unit: 'year' }, lengthenReason: 'We would rather (invented)' }));
  await check('    nor "only when needed"', 'deny', () => ck(as('martin'), 'cs_a__gas-safety', { every: { unit: 'demand' } }));
  await check('    nor switched off', 'deny', () => ck(as('martin'), 'cs_a__gas-safety', { state: 'off', offReason: 'Not needed (invented)' }));
  await check('    MORE OFTEN is allowed (every 6 months)', 'allow', () => ck(as('martin'), 'cs_a__gas-safety', { every: { n: 6, unit: 'month' } }));
  await check('    12 months is a year: allowed', 'allow', () => ck(as('martin'), 'cs_a__gas-safety', { every: { n: 12, unit: 'month' } }));
  await check('  a RECOMMENDED STANDARD lengthened with no reason: refused', 'deny', () => ck(ctx('u_cmoff'), 'cs_a__water-temps', { every: { n: 2, unit: 'month' } }));
  await check('    with a reason: allowed', 'allow', () => ck(ctx('u_cmoff'), 'cs_a__water-temps', { every: { n: 2, unit: 'month' }, lengthenReason: 'Used once a month (invented)' }));
  await check('  GOOD PRACTICE: the church decides', 'allow', () => ck(ctx('u_cmoff'), 'cs_a__walk-round', { every: { n: 1, unit: 'year' } }));
  await check('  nobody writes the templates from a page (the law’s frequencies)', 'deny', () => setDoc(doc(as('martin'), 'complianceTemplates', 'gas-safety'), { id: 'gas-safety', basis: 'legal', every: { n: 5, unit: 'year' } }));

  // the audit log
  await check('  THE AUDIT LOG: a church user cannot edit it', 'deny', () => updateDoc(doc(ctx('u_cmoff'), 'complianceLog', 'cl_1'), { what: 'nothing' }));
  await check('    not even a master admin', 'deny', () => updateDoc(doc(as('martin'), 'complianceLog', 'cl_1'), { what: 'nothing' }));
  await check('    nor deletes from it', 'deny', () => deleteDoc(doc(as('martin'), 'complianceLog', 'cl_1')));
  await check('    the office adds to it, in their own name', 'allow', () => setDoc(doc(ctx('u_cmoff'), 'complianceLog', 'cl_2'), { siteId: 'cs_a', what: 'edit', by: 'u_cmoff', byName: 'x', at: 'x', detail: {} }));
  await check('    not in someone else’s', 'deny', () => setDoc(doc(ctx('u_cmoff'), 'complianceLog', 'cl_3'), { siteId: 'cs_a', what: 'edit', by: 'u_martin', byName: 'x', at: 'x', detail: {} }));

  // follow-ups are Maintenance jobs
  const JOB = (uid, extra) => ({ siteId: 'cs_a', roomId: '', where: 'Kitchen', what: 'Thermostatic valve sticking (invented)', details: '', photoPath: '', status: 'todo', reportedBy: uid, reportedByName: uid, reportedAt: serverTimestamp(), ...(extra || {}) });
  await check('  A FOLLOW-UP IS A MAINTENANCE JOB: Val raises one on her check (safety, due, owner)', 'allow', () => setDoc(doc(ctx('u_cmval'), 'maintJobs', 'mj_c1'), JOB('u_cmval', { checkId: 'cs_a__water-temps', safety: true, due: '2026-11-01', ownerId: 'm_cmval' })));
  await check('    not on a check that is not hers', 'deny', () => setDoc(doc(ctx('u_cmval'), 'maintJobs', 'mj_c2'), JOB('u_cmval', { checkId: 'cs_a__gas-safety', safety: true })));
  await check('    anyone still reports a plain job (with the safety tick)', 'allow', () => setDoc(doc(ctx('u_cmvol'), 'maintJobs', 'mj_c3'), JOB('u_cmvol', { safety: true })));
  await check('    a bad due date is refused', 'deny', () => setDoc(doc(ctx('u_cmvol'), 'maintJobs', 'mj_c4'), JOB('u_cmvol', { due: 'soon' })));
  await check('    the office sets its due date', 'allow', () => updateDoc(doc(ctx('u_cmoff'), 'maintJobs', 'mj_c3'), { due: '2026-11-05' }));
  await check('    a volunteer does not', 'deny', () => updateDoc(doc(ctx('u_cmvol'), 'maintJobs', 'mj_c1'), { due: '2027-01-01' }));

  // the register
  await check('  the extinguisher register: the office adds one', 'allow', () => setDoc(doc(ctx('u_cmoff'), 'fireEquipment', 'fe_1'), { siteId: 'cs_a', roomId: 'cs_a_kit', type: 'wetChemical', size: '2 l', label: 'K1', nextService: '2027-01-01', removed: false, updatedAt: 'x' }));
  await check('    a volunteer reads it (for the walk-round)', 'allow', () => getDoc(doc(ctx('u_cmval'), 'fireEquipment', 'fe_1')));
  await check('    but does not change it', 'deny', () => updateDoc(doc(ctx('u_cmval'), 'fireEquipment', 'fe_1'), { removed: true }));
  await check('    nobody deletes one (marked removed)', 'deny', () => deleteDoc(doc(as('martin'), 'fireEquipment', 'fe_1')));
  await check('  the office says what kind of room it is', 'allow', () => setDoc(doc(ctx('u_cmoff'), 'roomProfiles', 'cs_a_kit'), { siteId: 'cs_a', kind: 'kitchen', updatedAt: 'x' }));

  // Stage 3 (F-233): the colour, the reminders' markers, the trustees' sign-off
  const ST3 = { siteId: 'cs_a', rag: 'red', counts: { red: 1, amber: 0, green: 2, grey: 0 }, safetyJobs: 0, at: 'x' };
  await check('  THE COLOUR for bookings: the office writes it', 'allow', () => setDoc(doc(ctx('u_cmoff'), 'complianceStatus', 'cs_a'), ST3));
  await check('    anyone signed in reads it (a colour and numbers only)', 'allow', () => getDoc(doc(ctx('u_cmvol'), 'complianceStatus', 'cs_a')));
  await check('    a stranger does not', 'deny', () => getDoc(doc(anon(), 'complianceStatus', 'cs_a')));
  await check('    a volunteer cannot change it', 'deny', () => setDoc(doc(ctx('u_cmval'), 'complianceStatus', 'cs_a'), { ...ST3, rag: 'green' }));
  await check('    nor can it carry anything but the colour and numbers', 'deny', () => setDoc(doc(ctx('u_cmoff'), 'complianceStatus', 'cs_a'), { ...ST3, items: ['Gas safety'] }));
  await check('  the reminders’ markers: the server only', 'deny', () => getDoc(doc(as('martin'), 'complianceReminders', 'x')));
  const SO = (uid, extra) => ({ year: 2026, by: uid, byName: uid, at: serverTimestamp(), note: '', snapshot: { cs_a: { rag: 'red' } }, ...(extra || {}) });
  await check('  THE SIGN-OFF: a trustee (an Elder) signs off for the year', 'allow', () => setDoc(doc(ctx('u_cmeld'), 'complianceSignoffs', 'so_1'), SO('u_cmeld')));
  await check('    and it is in the log', 'allow', () => setDoc(doc(ctx('u_cmeld'), 'complianceLog', 'cl_so'), { siteId: '', what: 'signoff', by: 'u_cmeld', byName: 'x', at: 'x', detail: { year: 2026 } }));
  await check('    not in someone else’s name', 'deny', () => setDoc(doc(ctx('u_cmeld'), 'complianceSignoffs', 'so_2'), SO('u_martin')));
  await check('    the office does not sign off (the trustees do)', 'deny', () => setDoc(doc(ctx('u_cmoff'), 'complianceSignoffs', 'so_3'), SO('u_cmoff')));
  await check('    nor Val', 'deny', () => setDoc(doc(ctx('u_cmval'), 'complianceSignoffs', 'so_4'), SO('u_cmval')));
  await check('    nobody changes a sign-off', 'deny', () => updateDoc(doc(as('martin'), 'complianceSignoffs', 'so_1'), { note: 'changed' }));
  await check('    nor deletes one', 'deny', () => deleteDoc(doc(as('martin'), 'complianceSignoffs', 'so_1')));
  await check('    the office reads them', 'allow', () => getDoc(doc(ctx('u_cmoff'), 'complianceSignoffs', 'so_1')));
  await check('    Val does not', 'deny', () => getDoc(doc(ctx('u_cmval'), 'complianceSignoffs', 'so_1')));
}

// ── EVENTS (events window) ── STAGE 4 (F-234): the live risk register, PEEPs and GEEPs
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const U = (uid, mid, teams) => setDoc(doc(d, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor: [], masterAdmin: false });
    await U('u_pwar', 'm_pwar', ['Welcome']);     // a fire warden
    await U('u_pste', 'm_pste', ['Welcome']);     // a duty steward, NOT on duty today
    await U('u_ppat', 'm_ppat', []);              // a person with a plan
    await U('u_poth', 'm_poth', ['Welcome']);     // anyone else
    await U('u_poff', 'm_poff', ['Church office']);
    await U('u_peld', 'm_peld', ['Elders']);
    await setDoc(doc(d, 'sites', 'ps_a'), { name: 'Test church (invented)' });
    await setDoc(doc(d, 'peeps', 'm_ppat'), { memberId: 'm_ppat', name: 'Pat (invented)', agreed: true, agreedAt: 'x', needs: 'Cannot use stairs (invented)', helpers: '', route: '', equipment: '', reviewDue: '2027-10-19', madeBy: 'self', updatedBy: 'u_ppat', updatedAt: 'x' });
    await setDoc(doc(d, 'peepToday', '2026-10-19'), { day: '2026-10-19', readers: ['m_pwar'], entries: [{ memberId: 'm_ppat', name: 'Pat (invented)', needs: 'Cannot use stairs (invented)' }], at: 'x' });
    await setDoc(doc(d, 'peepLog', 'pl_1'), { what: 'view', memberId: 'm_ppat', by: 'u_pwar', byName: 'x', at: 'x' });
    await setDoc(doc(d, 'hazards', 'hz_1'), { siteId: 'ps_a', hazard: 'Fire (invented)', l: 2, s: 5, controls: [], status: 'open', updatedBy: 'u_poff' });
  });
  const PEEP = (uid, extra) => ({ memberId: 'm_ppat', name: 'Pat (invented)', agreed: true, agreedAt: 'x', needs: 'Cannot use stairs (invented)', helpers: 'A steward', route: '', equipment: '', reviewDue: '2027-10-19', madeBy: 'self', updatedBy: uid, updatedAt: 'y', ...(extra || {}) });
  await check('PEEPS: the person reads their own plan', 'allow', () => getDoc(doc(ctx('u_ppat'), 'peeps', 'm_ppat')));
  await check('  and changes it', 'allow', () => setDoc(doc(ctx('u_ppat'), 'peeps', 'm_ppat'), PEEP('u_ppat')));
  await check('  NOT WITHOUT THEIR AGREEMENT', 'deny', () => setDoc(doc(ctx('u_ppat'), 'peeps', 'm_ppat'), PEEP('u_ppat', { agreed: false })));
  await check('  NO MEDICAL HISTORY: no field for it', 'deny', () => setDoc(doc(ctx('u_ppat'), 'peeps', 'm_ppat'), PEEP('u_ppat', { medical: 'Epilepsy (invented)' })));
  await check('  A FIRE WARDEN DOES NOT READ ANYONE’S PLAN DIRECTLY', 'deny', () => getDoc(doc(ctx('u_pwar'), 'peeps', 'm_ppat')));
  await check('    nor list the plans', 'deny', () => getDocs(collection(ctx('u_pwar'), 'peeps')));
  await check('  nobody else reads it', 'deny', () => getDoc(doc(ctx('u_poth'), 'peeps', 'm_ppat')));
  await check('    not the office', 'deny', () => getDoc(doc(ctx('u_poff'), 'peeps', 'm_ppat')));
  await check('    not a trustee', 'deny', () => getDoc(doc(ctx('u_peld'), 'peeps', 'm_ppat')));
  await check('  nor writes one for someone else', 'deny', () => setDoc(doc(ctx('u_poth'), 'peeps', 'm_ppat'), PEEP('u_poth')));
  await check('  a master admin reads it', 'allow', () => getDoc(doc(as('martin'), 'peeps', 'm_ppat')));
  await check('  A MASTER ADMIN ENTERS A PLAN FOR SOMEONE only recording it (entered by, with their agreement)', 'allow', () => setDoc(doc(as('martin'), 'peeps', 'm_ppat'), PEEP('u_martin', { madeBy: 'master', enteredBy: 'u_martin', enteredByName: 'Martin Master' })));
  await check('    not without saying who entered it', 'deny', () => setDoc(doc(as('martin'), 'peeps', 'm_ppat'), PEEP('u_martin', { madeBy: 'master' })));
  await check('    nor in someone else’s name', 'deny', () => setDoc(doc(as('martin'), 'peeps', 'm_ppat'), PEEP('u_martin', { madeBy: 'master', enteredBy: 'u_poff', enteredByName: 'Olive' })));
  await check('TODAY’S PLANS: A WARDEN (a reader today) SEES THEM', 'allow', () => getDoc(doc(ctx('u_pwar'), 'peepToday', '2026-10-19')));
  await check('  A STEWARD NOT ON DUTY (not a reader) DOES NOT', 'deny', () => getDoc(doc(ctx('u_pste'), 'peepToday', '2026-10-19')));
  await check('  nor anyone else', 'deny', () => getDoc(doc(ctx('u_poth'), 'peepToday', '2026-10-19')));
  await check('  nor a stranger', 'deny', () => getDoc(doc(anon(), 'peepToday', '2026-10-19')));
  await check('  nobody writes it from a page (the server works it out)', 'deny', () => setDoc(doc(as('martin'), 'peepToday', '2026-10-19'), { day: '2026-10-19', readers: ['m_poth'], entries: [] }));
  await check('  THE LOG: a look at a plan is written down', 'allow', () => setDoc(doc(ctx('u_pwar'), 'peepLog', 'pl_2'), { what: 'view', memberId: 'm_ppat', by: 'u_pwar', byName: 'x', at: 'x' }));
  await check('    never changed', 'deny', () => updateDoc(doc(as('martin'), 'peepLog', 'pl_1'), { what: 'changed' }));
  await check('    nor deleted', 'deny', () => deleteDoc(doc(as('martin'), 'peepLog', 'pl_1')));
  await check('    the warden does not read the log', 'deny', () => getDoc(doc(ctx('u_pwar'), 'peepLog', 'pl_1')));
  await check('  the person deletes their plan when it is no longer needed', 'allow', () => deleteDoc(doc(ctx('u_ppat'), 'peeps', 'm_ppat')));

  await check('LIVE RISK REGISTER: the office keeps a hazard', 'allow', () => setDoc(doc(ctx('u_poff'), 'hazards', 'hz_2'), { siteId: 'ps_a', area: 'Fire', hazard: 'Blocked exit (invented)', who: 'Everyone', l: 2, s: 4, controls: ['ps_a__escape-routes'], notes: '', status: 'open', source: 'added', starterId: '', createdAt: 'x', updatedAt: 'x', updatedBy: 'u_poff' }));
  await check('  a rating outside 1 to 5 is refused', 'deny', () => setDoc(doc(ctx('u_poff'), 'hazards', 'hz_3'), { siteId: 'ps_a', hazard: 'x', l: 9, s: 4, controls: [], status: 'open', updatedBy: 'u_poff' }));
  await check('  a trustee reads it', 'allow', () => getDoc(doc(ctx('u_peld'), 'hazards', 'hz_1')));
  await check('  a volunteer does not', 'deny', () => getDoc(doc(ctx('u_poth'), 'hazards', 'hz_1')));
  await check('  nobody deletes a hazard (closed, never deleted)', 'deny', () => deleteDoc(doc(as('martin'), 'hazards', 'hz_1')));
  await check('  the office puts up the professional fire risk assessment', 'allow', () => setDoc(doc(ctx('u_poff'), 'raReports', 'ra_1'), { siteId: 'ps_a', kind: 'fire', date: '2026-03-01', assessor: 'A. Assessor Ltd (invented)', nextReview: '2027-03-01', files: [], by: 'u_poff', byName: 'x', at: 'x' }));
  await check('    never changed afterwards', 'deny', () => updateDoc(doc(as('martin'), 'raReports', 'ra_1'), { nextReview: '2030-01-01' }));
  const SN = (uid, banner) => ({ siteId: 'ps_a', banner, by: uid, byName: uid, at: serverTimestamp(), note: '', reports: [], hazards: [], changes: '' });
  await check('  A TRUSTEE KEEPS A DATED SNAPSHOT, under Martin’s banner', 'allow', () => setDoc(doc(ctx('u_peld'), 'riskSnapshots', 'rs_1'), SN('u_peld', 'Live risk management: how Test church (invented) manages, day to day, ...')));
  await check('    NOT CALLED A "RISK ASSESSMENT" (no banner, no snapshot)', 'deny', () => setDoc(doc(ctx('u_peld'), 'riskSnapshots', 'rs_2'), SN('u_peld', 'Risk assessment for Test church')));
  await check('    the office does not sign off', 'deny', () => setDoc(doc(ctx('u_poff'), 'riskSnapshots', 'rs_3'), SN('u_poff', 'Live risk management: x')));
  await check('    a snapshot is never changed', 'deny', () => updateDoc(doc(as('martin'), 'riskSnapshots', 'rs_1'), { note: 'changed' }));
  await check('  THE GEEP: the office writes the building’s plan for visitors', 'allow', () => setDoc(doc(ctx('u_poff'), 'geeps', 'ps_a'), { siteId: 'ps_a', identify: 'Ask at the door (invented)', refuges: '', helpers: '', equipment: '', reviewDue: '2027-10-19', updatedBy: 'u_poff', updatedByName: 'x', updatedAt: 'x' }));
  await check('    anyone signed in reads it (it names nobody)', 'allow', () => getDoc(doc(ctx('u_poth'), 'geeps', 'ps_a')));
  await check('    a volunteer does not change it', 'deny', () => setDoc(doc(ctx('u_poth'), 'geeps', 'ps_a'), { siteId: 'ps_a', identify: 'x' }));
  await check('  THE ROLL-CALL LIST names duty stewards (a master admin)', 'allow', () => setDoc(doc(as('martin'), 'fireRollCall', 'main'), { people: [{ memberId: 'm_pwar', name: 'W', siteId: '', role: 'warden' }, { memberId: 'm_pste', name: 'S', siteId: '', role: 'steward' }], memberIds: ['m_pwar', 'm_pste'], allSites: ['m_pwar', 'm_pste'], bySite: {}, stewards: ['m_pste'], updatedBy: 'u_martin', updatedByName: 'x', updatedAt: 'x' }));
}

// ── EVENTS (events window) ── ROOMS ON THE DAY (F-260): "we've arrived", and the caterers' list
{
  const ctx = (uid) => env.authenticatedContext(uid).firestore();
  const lena = () => ctx('u_aroff');   /* this block's own office: site_ar's bookings admin */
  const { deleteField } = await import('firebase/firestore');
  const BK = (d, k, o) => setDoc(doc(d, 'bookings', k), Object.assign({ status: 'confirmed', siteId: 'site_ar', roomId: 'room_band', day: '2026-11-27', startMin: 600, endMin: 660,
    setupMins: 0, packdownMins: 0, slotFrom: 40, slotTo: 44, title: 'Test (invented)', memberUid: '' }, o));
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'users', 'u_cook'), { uid: 'u_cook', memberId: 'm_cook', status: 'active', name: 'Cook (invented)', teams: ['Catering'], adminFor: [], masterAdmin: false });
    await setDoc(doc(d, 'users', 'u_aroff'), { uid: 'u_aroff', memberId: 'm_aroff', status: 'active', name: 'Office (invented)', teams: [], adminFor: [], masterAdmin: false });
    await setDoc(doc(d, 'bookingSettings', 'site_ar'), { bookingsAdmins: ['m_aroff'], safeguardingLead: '', safeguardingDeputy: '' });
    await setDoc(doc(d, 'users', 'u_other'), { uid: 'u_other', memberId: 'm_other', status: 'active', name: 'Other (invented)', teams: ['Welcome'], adminFor: [], masterAdmin: false });
    await BK(d, 'ar_hire_000000000000000000000000', { kind: 'hire', requester: { name: 'Hirer (invented)', email: 'h@example.invalid' } });
    await BK(d, 'ar_hire2_00000000000000000000000', { kind: 'hire' });
    await BK(d, 'ar_asked_00000000000000000000000', { kind: 'hire', status: 'requested' });
    await BK(d, 'ar_mem_000000000000000000000000', { kind: 'member', memberUid: 'u_samy' });
    await BK(d, 'ar_done_00000000000000000000000', { kind: 'hire', arrived: { at: 'x', by: 'hirer', name: 'x' } });
    await BK(d, 'ar_off_000000000000000000000000', { kind: 'office' });
    const CO = { siteId: 'site_ar', roomId: 'room_band', roomName: 'Band room', day: '2026-11-27', startMin: 600, servingAt: '10:30', people: 20, title: 'Test', items: [], dietary: {}, notes: '', state: 'new' };
    await setDoc(doc(d, 'cateringOrders', 'co_1'), CO);
    await setDoc(doc(d, 'cateringOrders', 'co_2'), Object.assign({}, CO, { siteId: 'site_appr' }));
  });
  const ARR = (by, name, extra) => ({ arrived: Object.assign({ at: serverTimestamp(), by, name: name || 'x' }, extra || {}) });
  await check('ARRIVED: the hirer, with the booking’s private link, says they are here', 'allow', () => updateDoc(doc(anon(), 'bookings', 'ar_hire_000000000000000000000000'), ARR('hirer', 'Hirer (invented)')));
  await check('  only once (already arrived)', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_done_00000000000000000000000'), ARR('hirer')));
  await check('  not on a booking still waiting to be approved', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_asked_00000000000000000000000'), ARR('hirer')));
  await check('  "hirer" only on a hire, not the office’s own booking', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_off_000000000000000000000000'), ARR('hirer')));
  await check('  nothing else changes with it (not the status)', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_hire2_00000000000000000000000'), Object.assign(ARR('hirer'), { status: 'cancelled' })));
  await check('  the time is the server’s, not one the phone makes up', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_hire2_00000000000000000000000'), { arrived: { at: '2026-11-27T09:00', by: 'hirer', name: 'x' } }));
  await check('  no extra fields in it', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_hire2_00000000000000000000000'), ARR('hirer', 'x', { paid: true })));
  await check('  a name no longer than 120', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_hire2_00000000000000000000000'), ARR('hirer', 'x'.repeat(121))));
  await check('  a member marks their own booking arrived', 'allow', () => updateDoc(doc(as('samy'), 'bookings', 'ar_mem_000000000000000000000000'), ARR('member', 'Samy')));
  await check('  not someone else’s', 'deny', () => updateDoc(doc(as('isla'), 'bookings', 'ar_hire2_00000000000000000000000'), ARR('member')));
  await check('  signed out cannot claim to be the member', 'deny', () => updateDoc(doc(anon(), 'bookings', 'ar_hire2_00000000000000000000000'), ARR('member')));
  await check('  the office marks any booking at its site arrived', 'allow', () => updateDoc(doc(lena(), 'bookings', 'ar_off_000000000000000000000000'), ARR('office', 'Office')));
  await check('  and takes a mistaken "arrived" off', 'allow', () => updateDoc(doc(lena(), 'bookings', 'ar_done_00000000000000000000000'), { arrived: deleteField() }));
  await check('  nobody else takes it off', 'deny', () => updateDoc(doc(as('samy'), 'bookings', 'ar_mem_000000000000000000000000'), { arrived: deleteField() }));

  const ST = (uid, state, extra) => Object.assign({ state, stateBy: uid, stateByName: 'x', stateAt: serverTimestamp() }, extra || {});
  await check('CATERING: the Catering team reads the orders', 'allow', () => getDocs(query(collection(ctx('u_cook'), 'cateringOrders'), where('siteId', '==', 'site_ar'))));
  await check('  the site’s bookings admin does', 'allow', () => getDoc(doc(lena(), 'cateringOrders', 'co_1')));
  await check('  but not at a site they do not look after', 'deny', () => getDoc(doc(lena(), 'cateringOrders', 'co_2')));
  await check('  someone on another team does not', 'deny', () => getDoc(doc(ctx('u_other'), 'cateringOrders', 'co_1')));
  await check('  signed out does not', 'deny', () => getDoc(doc(anon(), 'cateringOrders', 'co_1')));
  await check('  the team marks one prepared', 'allow', () => updateDoc(doc(ctx('u_cook'), 'cateringOrders', 'co_1'), ST('u_cook', 'prepared')));
  await check('  not as somebody else', 'deny', () => updateDoc(doc(ctx('u_cook'), 'cateringOrders', 'co_1'), ST('u_lena', 'served')));
  await check('  not to a made-up state', 'deny', () => updateDoc(doc(ctx('u_cook'), 'cateringOrders', 'co_1'), ST('u_cook', 'eaten')));
  await check('  not the order itself (numbers come from the booking)', 'deny', () => updateDoc(doc(ctx('u_cook'), 'cateringOrders', 'co_1'), ST('u_cook', 'served', { people: 200 })));
  await check('  nobody makes an order (the server does)', 'deny', () => setDoc(doc(as('martin'), 'cateringOrders', 'co_new'), { siteId: 'site_bk', state: 'new' }));
  await check('  nobody deletes one', 'deny', () => deleteDoc(doc(as('martin'), 'cateringOrders', 'co_1')));
}

// ── EVENTS (events window) ── PRESENT IN A VIDEO MEETING (F-242 section 6, F-247)
{
  const MC = (extra) => ({ type: 'meeting', room: 'Eldership', eventId: 'ev_m1', day: '2026-11-05', ...(extra || {}) });
  const MD = (uid, ctxx) => ({ context: ctxx || MC(), name: 'Building fund (invented)', status: 'uploaded', source: 'upload', by: uid, byName: 'x', at: 'x' });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'presentDecks', 'md_ready'), { ...MD('u_martin'), status: 'ready', count: 3 });
    await setDoc(doc(d, 'presentDecks', 'md_other'), { ...MD('u_martin', MC({ room: 'Prayer' })), status: 'ready', count: 2 });
  });
  const MN = (uid, extra) => ({ context: MC(), slide: 0, presenterUid: uid, presenterName: 'x', startedAt: 'x', slideAt: 'x', blank: false, updatedBy: uid, deckId: 'md_ready', ...(extra || {}) });
  const samy = () => env.authenticatedContext('u_samy').firestore();
  await check('MEETINGS: a master admin (a host) adds a deck for this meeting', 'allow', () => setDoc(doc(as('martin'), 'presentDecks', 'md_1'), MD('u_martin')));
  await check('  its context is the room, the event and the day - nothing else', 'deny', () => setDoc(doc(as('martin'), 'presentDecks', 'md_2'), MD('u_martin', MC({ groupId: 'pg_kids' }))));
  await check('  the day as YYYY-MM-DD', 'deny', () => setDoc(doc(as('martin'), 'presentDecks', 'md_3'), MD('u_martin', MC({ day: 'Thursday' }))));
  await check('  a room is needed', 'deny', () => setDoc(doc(as('martin'), 'presentDecks', 'md_4'), MD('u_martin', MC({ room: '' }))));
  await check('  someone who is not a host (and not let present) adds none', 'deny', () => setDoc(doc(samy(), 'presentDecks', 'md_5'), MD('u_samy')));
  await check('  the host presents it to the meeting, naming the deck', 'allow', () => setDoc(doc(as('martin'), 'presentNow', 'mtg_Eldership_ev_m1'), MN('u_martin')));
  await check('  NOT WITHOUT NAMING THE DECK (every screen must load the same slides)', 'deny', () => setDoc(doc(as('martin'), 'presentNow', 'mtg_Eldership_ev_m2'), (({ deckId, ...x }) => x)(MN('u_martin'))));
  await check('  NOT ANOTHER MEETING ROOM’S DECK', 'deny', () => setDoc(doc(as('martin'), 'presentNow', 'mtg_Eldership_ev_m3'), MN('u_martin', { deckId: 'md_other' })));
  await check('  not a session’s deck', 'deny', () => setDoc(doc(as('martin'), 'presentNow', 'mtg_Eldership_ev_m4'), MN('u_martin', { deckId: 'dk_ready' })));
  await check('  not a deck that does not exist', 'deny', () => setDoc(doc(as('martin'), 'presentNow', 'mtg_Eldership_ev_m5'), MN('u_martin', { deckId: 'md_nope' })));
  await check('  under a meeting key only', 'deny', () => setDoc(doc(as('martin'), 'presentNow', 'ps_ps_9'), MN('u_martin')));
  await check('  the host moves on', 'allow', () => updateDoc(doc(as('martin'), 'presentNow', 'mtg_Eldership_ev_m1'), { slide: 1, slideAt: 'y' }));
  await check('  and stops (the deck stays named)', 'allow', () => updateDoc(doc(as('martin'), 'presentNow', 'mtg_Eldership_ev_m1'), { presenterUid: '', presenterName: '', blank: false }));
  await check('  someone not invited to that meeting does not see it', 'deny', () => getDoc(doc(samy(), 'presentNow', 'mtg_Eldership_ev_m1')));

  /* ── MAIN WINDOW (F-263, 22 Oct 2026): meetingHost() and meetingInvitee(),
     the same answer as functions/video.js mayHost(), from the rooms kept
     keyed in churchSettings/video.roomsByKey. */
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const U = (uid, mid, teams, adminFor, extra) => setDoc(doc(d, 'users', uid), Object.assign({ uid, memberId: mid, status: 'active', teams, adminFor, masterAdmin: false, churchMember: false }, extra || {}));
    await U('u_eld_admin', 'm_eld_admin', [], ['Elders']);
    await U('u_elder', 'm_elder', ['Elders'], []);
    await U('u_cmm_member', 'm_cmm_member', [], [], { churchMember: true });
    await U('u_organiser', 'm_organiser', [], []);
    await setDoc(doc(d, 'churchSettings', 'video'), { roomsByKey: {
      Eldership: { teams: ['Elders'], hostTeams: [], members: false },
      CMM: { teams: ['Church office'], hostTeams: ['Church office', 'Elders'], members: true } }, byType: { 'Elders Meeting': 'Eldership' } }, { merge: true });
    await setDoc(doc(d, 'events', 'ev_org'), { organiserUid: 'u_organiser', videoRoom: 'Eldership', type: 'Other' });
    await setDoc(doc(d, 'events', 'ev_org_elsewhere'), { organiserUid: 'u_organiser', videoRoom: 'Prayer', type: 'Other' });
    await setDoc(doc(d, 'presentDecks', 'md_cmm'), { ...MD('u_martin', MC({ room: 'CMM', eventId: '' })), status: 'ready', count: 2 });
  });
  const as2 = (uid) => env.authenticatedContext(uid).firestore();
  await check('MEETING HOSTS: an admin of the room’s team adds a deck for the meeting', 'allow', () => setDoc(doc(as2('u_eld_admin'), 'presentDecks', 'mh_1'), MD('u_eld_admin')));
  await check('  and presents it', 'allow', () => setDoc(doc(as2('u_eld_admin'), 'presentNow', 'mtg_Eldership_ev_m9'), MN('u_eld_admin', { context: MC({ eventId: 'ev_m9' }) })));   // the key is that meeting's own (F-264)
  await check('  somebody on the room’s team follows it (an invitee)', 'allow', () => getDoc(doc(as2('u_elder'), 'presentNow', 'mtg_Eldership_ev_m1')));
  await check('  and reads its deck', 'allow', () => getDoc(doc(as2('u_elder'), 'presentDecks', 'md_ready')));
  await check('  BUT AN INVITEE DOES NOT PRESENT (hosts only)', 'deny', () => setDoc(doc(as2('u_elder'), 'presentDecks', 'mh_2'), MD('u_elder')));
  await check('  somebody not in that room sees nothing', 'deny', () => getDoc(doc(as2('u_cmm_member'), 'presentDecks', 'md_ready')));
  await check('THE MEMBERS’ MEETING: an Elder (a host team) presents there', 'allow', () => setDoc(doc(as2('u_elder'), 'presentDecks', 'mh_3'), MD('u_elder', MC({ room: 'CMM', eventId: '' }))));
  await check('  a church member follows it', 'allow', () => getDoc(doc(as2('u_cmm_member'), 'presentDecks', 'md_cmm')));
  await check('  but cannot present', 'deny', () => setDoc(doc(as2('u_cmm_member'), 'presentDecks', 'mh_4'), MD('u_cmm_member', MC({ room: 'CMM', eventId: '' }))));
  await check('THE ORGANISER of a meeting in this room presents', 'allow', () => setDoc(doc(as2('u_organiser'), 'presentDecks', 'mh_5'), MD('u_organiser', MC({ eventId: 'ev_org' }))));
  await check('  not for their meeting in another room', 'deny', () => setDoc(doc(as2('u_organiser'), 'presentDecks', 'mh_6'), MD('u_organiser', MC({ eventId: 'ev_org_elsewhere' }))));

  // THE HOST'S SAY-SO (Martin, 21 Oct): presentAllow/<meeting key>_<uid>
  /* An INVITED Elder who is not a host (main window, 22 Oct 2026: the say-so is
     for an invitee who is in the meeting - presentHere invitees only). */
  const AK = 'mtg_Eldership_ev_m1', SU = 'u_elder';
  const sam = () => env.authenticatedContext('u_elder').firestore();
  const AL = (by, extra) => ({ context: MC(), key: AK, uid: SU, name: 'Samy', by, at: serverTimestamp(), aliveAt: serverTimestamp(), ...(extra || {}) });
  await check('LETTING SOMEONE PRESENT: before it, he may not add a deck', 'deny', () => setDoc(doc(sam(), 'presentDecks', 'md_s0'), MD(SU)));
  await check('  nor move the slides', 'deny', () => updateDoc(doc(sam(), 'presentNow', 'mtg_Eldership_ev_m1'), { slide: 2, slideAt: 'z' }));
  await check('  nor let himself present', 'deny', () => setDoc(doc(sam(), 'presentAllow', AK + '_' + SU), AL(SU)));
  await check('  the host cannot let somebody who is not here', 'deny', () => setDoc(doc(as('martin'), 'presentAllow', AK + '_' + SU), AL('u_martin')));
  await check('  (he joins the meeting: here)', 'allow', () => setDoc(doc(sam(), 'presentHere', AK + '_' + SU), { context: MC(), key: AK, uid: SU, name: 'x', at: serverTimestamp() }));
  await check('  the host lets him', 'allow', () => setDoc(doc(as('martin'), 'presentAllow', AK + '_' + SU), AL('u_martin')));
  await check('  only under that meeting and that person', 'deny', () => setDoc(doc(as('martin'), 'presentAllow', AK + '_u_isla'), AL('u_martin')));
  await check('  in the host’s own name', 'deny', () => setDoc(doc(as('martin'), 'presentAllow', AK + '_' + SU), AL('u_karen')));
  await check('  with the server’s time, not one made up', 'deny', () => setDoc(doc(as('martin'), 'presentAllow', AK + '_' + SU), AL('u_martin', { aliveAt: '2099-01-01' })));
  await check('  he reads his own say-so', 'allow', () => getDoc(doc(sam(), 'presentAllow', AK + '_' + SU)));
  await check('  someone else does not', 'deny', () => getDoc(doc(env.authenticatedContext('u_isla').firestore(), 'presentAllow', AK + '_' + SU)));
  await check('  NOW HE ADDS A DECK for this meeting', 'allow', () => setDoc(doc(sam(), 'presentDecks', 'md_s1'), MD(SU)));
  await check('  but not for another meeting', 'deny', () => setDoc(doc(sam(), 'presentDecks', 'md_s2'), MD(SU, MC({ eventId: 'ev_other' }))));
  await check('  he presents', 'allow', () => setDoc(doc(sam(), 'presentNow', 'mtg_Eldership_ev_m1'), MN(SU)));
  await check('  and moves the slides on', 'allow', () => updateDoc(doc(sam(), 'presentNow', 'mtg_Eldership_ev_m1'), { slide: 1, slideAt: 'z' }));
  await check('  the host takes it back', 'allow', () => deleteDoc(doc(as('martin'), 'presentAllow', AK + '_' + SU)));
  await check('  then he cannot move them', 'deny', () => updateDoc(doc(sam(), 'presentNow', 'mtg_Eldership_ev_m1'), { slide: 2, slideAt: 'z' }));
  await check('  nor present again', 'deny', () => setDoc(doc(sam(), 'presentNow', 'mtg_Eldership_ev_m1'), MN(SU)));
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'presentAllow', AK + '_' + SU), { context: MC(), key: AK, uid: SU, name: 'Samy', by: 'u_martin', at: new Date(Date.now() - 6 * 60000), aliveAt: new Date(Date.now() - 4 * 60000) });
  });
  await check('  A SAY-SO NOT RENEWED FOR 4 MINUTES (the host has gone) no longer counts', 'deny', () => setDoc(doc(sam(), 'presentNow', 'mtg_Eldership_ev_m1'), MN(SU)));
  await check('  nor for a deck', 'deny', () => setDoc(doc(sam(), 'presentDecks', 'md_s3'), MD(SU)));
  // WHO IS HERE, for the host's list
  const HR = (uid, extra) => ({ context: MC(), key: AK, uid, name: 'x', at: serverTimestamp(), ...(extra || {}) });
  await check('WHO IS HERE: each person says they are', 'allow', () => setDoc(doc(sam(), 'presentHere', AK + '_' + SU), HR(SU)));
  await check('  only for themselves', 'deny', () => setDoc(doc(sam(), 'presentHere', AK + '_u_isla'), HR('u_isla')));
  await check('  but somebody not invited cannot say they are here', 'deny', () => setDoc(doc(samy(), 'presentHere', AK + '_u_samy'), HR('u_samy')));
  await check('  the host sees the list', 'allow', () => getDocs(query(collection(as('martin'), 'presentHere'), where('key', '==', AK))));
  await check('  nobody else does', 'deny', () => getDocs(query(collection(env.authenticatedContext('u_isla').firestore(), 'presentHere'), where('key', '==', AK))));
}

// ── EVENTS (events window) ── OPEN FOR SIGN-UPS (F-265's gap): the database, not only the button
{
  const EVS = (extra) => ({ title: 'Test (invented)', visibility: 'public', status: 'confirmed', audience: ['public'], startLocal: '2026-12-12T10:00', startUtc: 1765533600000,
    createdBy: 'u_martin', teams: [], signupOn: true, capacity: 10, teamUids: ['u_karen'], teamMemberIds: [], ...(extra || {}) });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    for (const [id, extra] of [['ev_so_open', {}], ['ev_so_closed', { signupOn: false }], ['ev_so_cancelled', { status: 'cancelled' }], ['ev_so_unsaid', { signupOn: null }]]) {
      const e = EVS(extra); if (e.signupOn === null) delete e.signupOn;
      await setDoc(doc(d, 'calEvents', id), e);
      await setDoc(doc(d, 'capacity', id), { calEventId: id, taken: 0, capacity: 10 });
    }
  });
  const SUO = (dbx, key, ev) => {
    const b = writeBatch(dbx);
    b.set(doc(dbx, 'signups', key), { calEventId: ev, personKind: 'contacts', personId: 'c_guest', name: 'Guest (invented)', email: 'g@example.invalid', places: 1, status: 'confirmed', attendees: [], answers: {} });
    b.update(doc(dbx, 'capacity', ev), { taken: 1 });
    return b.commit();
  };
  await check('SIGN-UPS: a guest signs up to an event taking sign-ups', 'allow', () => SUO(anon(), 'key_so_open_00000000000000000000', 'ev_so_open'));
  await check('  NOT to one not taking sign-ups (the page hid the button; now the database refuses too)', 'deny', () => SUO(anon(), 'key_so_closed_000000000000000000', 'ev_so_closed'));
  await check('  nor to one that never said it takes sign-ups', 'deny', () => SUO(anon(), 'key_so_unsaid_000000000000000000', 'ev_so_unsaid'));
  await check('  NOR TO A CANCELLED ONE', 'deny', () => SUO(anon(), 'key_so_cancel_000000000000000000', 'ev_so_cancelled'));
  await check('  a signed-in member not on its team: the same', 'deny', () => SUO(as('samy'), 'key_so_samy_00000000000000000000', 'ev_so_closed'));
  await check('  BUT THE EVENT’S OWN TEAM may add a walk-in at the door', 'allow', () => SUO(as('karen'), 'key_so_walkin_000000000000000000', 'ev_so_closed'));
}

// ── EVENTS (events window) ── THE SAFEGUARDING RISK REGISTER (F-265, step 1: standing risks)
{
  const cx = (uid) => env.authenticatedContext(uid).firestore();
  let hadSettings = null;
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const U = (uid, mid, teams) => setDoc(doc(d, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor: [], masterAdmin: false });
    await U('u_sgr_lead', 'm_sgr_lead', ['Kids Church']);
    await U('u_sgr_dep', 'm_sgr_dep', []);
    await U('u_sgr_trustee', 'm_sgr_trustee', ['Elders']);
    await U('u_sgr_trustee2', 'm_sgr_trustee2', ['Trustees']);
    await U('u_sgr_vol', 'm_sgr_vol', ['Kids Church']);
    await U('u_sgr_other', 'm_sgr_other', []);
    await setDoc(doc(d, 'bookingSettings', 'site_sgr'), { bookingsAdmins: [], safeguardingLead: 'm_sgr_lead', safeguardingDeputy: 'm_sgr_dep' });
    await setDoc(doc(d, 'bookingSettings', 'site_sgr2'), { bookingsAdmins: [], safeguardingLead: 'm_sgr_other', safeguardingDeputy: '' });
    await setDoc(doc(d, 'sgActivities', 'sga_1'), { siteId: 'site_sgr', kind: 'sunday', name: 'Juniors (invented)', link: {}, active: true, updatedAt: 'x', updatedBy: 'x' });
    await setDoc(doc(d, 'sgActivities', 'sga_other'), { siteId: 'site_sgr2', kind: 'youth', name: 'Elsewhere (invented)', link: {}, active: true, updatedAt: 'x', updatedBy: 'x' });
    await setDoc(doc(d, 'sgRisks', 'sgr_1'), { siteId: 'site_sgr', activityId: 'sga_1', risk: 'A child leaves unnoticed', who: 'Children', l: 2, i: 5, controls: [{ kind: 'checkin', text: '' }], ownerName: 'The Juniors leader', reviewDue: '2027-01-01', rl: 1, ri: 5, status: 'open', source: 'starter', starterId: 'sun-leaves', createdAt: 'x', updatedAt: 'x', updatedBy: 'x' });
    const s = await getDoc(doc(d, 'safeguardingSettings', 'defaults')); hadSettings = s.exists() ? s.data() : null;
  });
  const ACT = (uid, extra) => ({ siteId: 'site_sgr', kind: 'youth', name: 'Youth club (invented)', link: {}, active: true, updatedAt: 'x', updatedBy: uid, ...(extra || {}) });
  const RSK = (uid, extra) => ({ siteId: 'site_sgr', activityId: 'sga_1', risk: 'Too few leaders', who: 'Children', l: 3, i: 4, controls: [{ kind: 'ratio', text: '' }, { kind: 'text', text: 'Do not start until enough leaders are in' }],
    ownerName: 'The Juniors leader', reviewDue: '2027-03-01', rl: 2, ri: 4, status: 'open', source: 'added', starterId: '', createdAt: 'x', updatedAt: 'x', updatedBy: uid, ...(extra || {}) });
  await check('SG RISK REGISTER: the site’s safeguarding lead adds an activity', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgActivities', 'sga_2'), ACT('u_sgr_lead')));
  await check('  and the deputy', 'allow', () => setDoc(doc(cx('u_sgr_dep'), 'sgActivities', 'sga_3'), ACT('u_sgr_dep')));
  await check('  NO FIELD FOR A CHILD: an extra field is refused', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgActivities', 'sga_4'), ACT('u_sgr_lead', { childName: 'Invented Child' })));
  await check('  only the kinds of activity', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgActivities', 'sga_5'), ACT('u_sgr_lead', { kind: 'secret' })));
  await check('  not for a site they don’t lead', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgActivities', 'sga_6'), ACT('u_sgr_lead', { siteId: 'site_sgr2' })));
  await check('  in their own name only', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgActivities', 'sga_7'), ACT('u_sgr_dep')));
  await check('  the lead adds a risk', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_2'), RSK('u_sgr_lead')));
  await check('  NO FIELD FOR A CHILD OR A CONCERN in a risk either', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_3'), RSK('u_sgr_lead', { concern: 'invented' })));
  await check('  ratings 1 to 5 only', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_4'), RSK('u_sgr_lead', { l: 6 })));
  await check('  the risk in 200 characters at most', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_5'), RSK('u_sgr_lead', { risk: 'x'.repeat(201) })));
  const TODO = (n) => Array.from({ length: n }, (x, i) => ({ what: 'Book the lifeguard ' + i, who: 'The leader', by: '2026-12-01', done: false }));
  await check('S5: a standing risk keeps the group’s size when it was last reviewed', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_size'), RSK('u_sgr_lead', { sizeAtReview: 12 })));
  await check('  a count, never less than nothing', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_size'), RSK('u_sgr_lead', { sizeAtReview: -1 })));
  await check('S4: a standing risk keeps up to 50 things still to do (what a record holds; it was 5)', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_todo'), RSK('u_sgr_lead', { todo: TODO(50) })));
  await check('  not 51', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_todo'), RSK('u_sgr_lead', { todo: TODO(51) })));
  await check('  up to 50 controls (what a record holds, H-9)', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_6max'), RSK('u_sgr_lead', { controls: Array(50).fill({ kind: 'text', text: 'x' }) })));
  await check('  no more than 50 controls', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_6'), RSK('u_sgr_lead', { controls: Array(51).fill({ kind: 'text', text: 'x' }) })));
  await check('  not under another site’s activity', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_7'), RSK('u_sgr_lead', { activityId: 'sga_other' })));
  await check('  a review date as a date', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_8'), RSK('u_sgr_lead', { reviewDue: 'soon' })));
  await check('  a risk is closed, never deleted', 'deny', () => deleteDoc(doc(cx('u_sgr_lead'), 'sgRisks', 'sgr_1')));
  await check('  THE TRUSTEES (Elders, unless set) read the register', 'allow', () => getDocs(query(collection(cx('u_sgr_trustee'), 'sgRisks'), where('siteId', '==', 'site_sgr'))));
  await check('  but do not change it', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgRisks', 'sgr_9'), RSK('u_sgr_trustee')));
  await check('  a master admin reads it', 'allow', () => getDoc(doc(as('martin'), 'sgRisks', 'sgr_1')));
  await check('  but the lead and deputy keep it', 'deny', () => setDoc(doc(as('martin'), 'sgRisks', 'sgr_10'), RSK('u_martin')));
  await check('  AN ACTIVITY’S OWN LEADER (a volunteer) DOES NOT SEE IT', 'deny', () => getDoc(doc(cx('u_sgr_vol'), 'sgRisks', 'sgr_1')));
  await check('  nor the activities', 'deny', () => getDocs(query(collection(cx('u_sgr_vol'), 'sgActivities'), where('siteId', '==', 'site_sgr'))));
  await check('  nor anyone signed out', 'deny', () => getDoc(doc(anon(), 'sgRisks', 'sgr_1')));
  await check('  another site’s lead does not see this site’s', 'deny', () => getDoc(doc(cx('u_sgr_other'), 'sgRisks', 'sgr_1')));
  /* the trustee team is the setting */
  /* (team jobs saying nothing of the trustees: the setting is the trustees job's fallback, H-9) */
  let tjHad = null;
  await env.withSecurityRulesDisabled(async (c) => {
    const tj = await getDoc(doc(c.firestore(), 'churchSettings', 'teamJobs')); tjHad = tj.exists() ? tj.data() : null;
    if (tjHad) { const rest = { ...tjHad }; delete rest.trustees; await setDoc(doc(c.firestore(), 'churchSettings', 'teamJobs'), rest); }
    await setDoc(doc(c.firestore(), 'safeguardingSettings', 'defaults'), { ...(hadSettings || {}), trusteeTeam: 'Trustees' }); });
  await check('THE TRUSTEE TEAM IS A SETTING: set to "Trustees", that team reads it', 'allow', () => getDoc(doc(cx('u_sgr_trustee2'), 'sgRisks', 'sgr_1')));
  await check('  and the Elders no longer do', 'deny', () => getDoc(doc(cx('u_sgr_trustee'), 'sgRisks', 'sgr_1')));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'churchSettings', 'teamJobs'), { ...(tjHad || {}), trustees: ['Elders'] }); });
  await check('  TEAM JOBS WIN (H-9): with the trustees job given to the Elders, the Elders read it', 'allow', () => getDoc(doc(cx('u_sgr_trustee'), 'sgRisks', 'sgr_1')));
  await check('    and "Trustees", the setting, no longer do', 'deny', () => getDoc(doc(cx('u_sgr_trustee2'), 'sgRisks', 'sgr_1')));
  await env.withSecurityRulesDisabled(async (c) => { const r = doc(c.firestore(), 'churchSettings', 'teamJobs'); if (tjHad) await setDoc(r, tjHad); else await deleteDoc(r); });
  await check('  the setting is 60 characters at most', 'deny', () => setDoc(doc(as('martin'), 'safeguardingSettings', 'defaults'), { ...(hadSettings || {}), templates: (hadSettings || {}).templates || {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, trusteeTeam: 'x'.repeat(61) }));
  await env.withSecurityRulesDisabled(async (c) => { const r = doc(c.firestore(), 'safeguardingSettings', 'defaults'); if (hadSettings) await setDoc(r, hadSettings); else await deleteDoc(r); });
}

// ── EVENTS (events window) ── THE SAFEGUARDING RISK REGISTER, step 2: event assessments, signed off before bookings open
{
  const cx = (uid) => env.authenticatedContext(uid).firestore();
  const { deleteField } = await import('firebase/firestore');
  const EVX = (extra) => ({ title: 'Trip (invented)', visibility: 'public', status: 'confirmed', audience: ['public'], startLocal: '2026-12-12T10:00', startUtc: 1765533600000,
    createdBy: 'u_martin', teams: [], signupOn: true, capacity: 30, teamUids: ['u_sga_org'], teamMemberIds: [], location: { siteId: 'site_sgr' }, sgKind: 'trip', ...(extra || {}) });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const U = (uid, mid, teams) => setDoc(doc(d, 'users', uid), { uid, memberId: mid, status: 'active', name: uid, teams, adminFor: [], masterAdmin: false });
    await U('u_sga_org', 'm_sga_org', []); await U('u_sga_leader', 'm_sga_leader', []); await U('u_sga_vol', 'm_sga_vol', ['Kids Church']);
    for (const [id, extra, u18] of [['ev_sga_trip', {}, true], ['ev_sga_adults', {}, false], ['ev_sga_club', { sgKind: '' }, true], ['ev_sga_trip2', {}, true]]) {
      await setDoc(doc(d, 'calEvents', id), EVX(extra));
      await setDoc(doc(d, 'capacity', id), { calEventId: id, taken: 0, capacity: 30 });
      await setDoc(doc(d, 'eventLeaders', id), { under18: u18, leaders: [], leaderIds: ['m_sga_leader'], leaderUids: ['u_sga_leader'], siteId: 'site_sgr', clearedIds: [], lastCleared: [] });
    }
  });
  const SUX = (dbx, key, ev) => { const b = writeBatch(dbx); b.set(doc(dbx, 'signups', key), { calEventId: ev, personKind: 'contacts', personId: 'c_guest', name: 'Guest (invented)', email: 'g@example.invalid', places: 1, status: 'confirmed', attendees: [], answers: {} }); b.update(doc(dbx, 'capacity', ev), { taken: 1 }); return b.commit(); };
  /* every required question for a trip answered (Martin's checklist, 23 Oct) */
  const ANS = Object.fromEntries(['insurance', 'incharge', 'leaders', 'consent', 'medical', 'emergency', 'contacts', 'headcount', 'transport', 'venue', 'behaviour', 'accessibility', 'visitors', 'photos', 'weather', 'incidents'].map(k => [k, 'Answered (invented)'])
    .concat([['paedFirstAid', 'Yes: the deputy (invented)'], ['mixedLeaders', 'N/A: Not a mixed group']]));
  const AS = (uid, extra) => ({ siteId: 'site_sgr', calEventId: 'ev_sga_trip', title: 'Trip (invented)', templateId: 'trip', answers: ANS, risks: [{ risk: 'A child is lost', who: 'Children', l: 3, i: 5, rl: 1, ri: 5, controls: [{ kind: 'text', text: 'Head counts' }] }],
    status: 'draft', version: 1, updatedAt: 'x', updatedBy: uid, ...(extra || {}) });
  await check('SIGN-OFF: AN UNDER-18s TRIP TAKES NO SIGN-UP BEFORE IT IS SIGNED OFF', 'deny', () => SUX(anon(), 'key_sga_1_0000000000000000000000', 'ev_sga_trip'));
  await check('  an adults’ trip needs no sign-off', 'allow', () => SUX(anon(), 'key_sga_2_0000000000000000000000', 'ev_sga_adults'));
  await check('  nor a usual under-18s club', 'allow', () => SUX(anon(), 'key_sga_3_0000000000000000000000', 'ev_sga_club'));
  await check('  the event’s team writes the assessment', 'allow', () => setDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip'), AS('u_sga_org')));
  /* S3: who has read the host's safeguarding policy - its own record, beside the assessment */
  const PR = (uid, extra) => ({ siteId: 'site_sgr', reads: { m_sga_leader: '2026-10-26' }, updatedAt: 'x', updatedBy: uid, ...(extra || {}) });
  await check('S3: A NAMED LEADER RECORDS THAT THEY HAVE READ THE HOST’S SAFEGUARDING POLICY', 'allow', () => setDoc(doc(cx('u_sga_leader'), 'sgPolicyReads', 'ev_sga_trip'), PR('u_sga_leader')));
  await check('  and the organiser reads it', 'allow', () => getDoc(doc(cx('u_sga_org'), 'sgPolicyReads', 'ev_sga_trip')));
  await check('  a volunteer not on the event can’t write it', 'deny', () => setDoc(doc(cx('u_sga_vol'), 'sgPolicyReads', 'ev_sga_trip'), PR('u_sga_vol')));
  await check('  nor read it', 'deny', () => getDoc(doc(cx('u_sga_vol'), 'sgPolicyReads', 'ev_sga_trip')));
  await check('  nor anything else kept in it', 'deny', () => setDoc(doc(cx('u_sga_leader'), 'sgPolicyReads', 'ev_sga_trip'), PR('u_sga_leader', { notes: 'x' })));
  await check('  nor filed under another site', 'deny', () => setDoc(doc(cx('u_sga_leader'), 'sgPolicyReads', 'ev_sga_trip'), PR('u_sga_leader', { siteId: 'site_kids' })));
  await check('  and its named leaders', 'allow', () => setDoc(doc(cx('u_sga_leader'), 'sgAssessments', 'ev_sga_trip'), AS('u_sga_leader', { status: 'waiting' })));
  await check('  not a volunteer who isn’t on it', 'deny', () => setDoc(doc(cx('u_sga_vol'), 'sgAssessments', 'ev_sga_trip'), AS('u_sga_vol')));
  await check('  no field for a child or a concern (an extra field)', 'deny', () => setDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip'), AS('u_sga_org', { childNames: 'invented' })));
  await check('  the site must be the event’s', 'deny', () => setDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip'), AS('u_sga_org', { siteId: 'site_sgr2' })));
  await check('  the trustees read it', 'allow', () => getDoc(doc(cx('u_sgr_trustee'), 'sgAssessments', 'ev_sga_trip')));
  await check('  but don’t write it', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgAssessments', 'ev_sga_trip'), AS('u_sgr_trustee')));
  await check('  THE ORGANISER CANNOT SIGN IT OFF', 'deny', () => setDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip'), AS('u_sga_org', { status: 'signed', signedBy: 'u_sga_org', signedAt: serverTimestamp(), signedVersion: 1 })));
  await check('  nor the lead in someone else’s name', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), AS('u_sgr_lead', { status: 'signed', signedBy: 'u_sga_org', signedAt: serverTimestamp(), signedVersion: 1 })));
  await check('  nor at a made-up time', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), AS('u_sgr_lead', { status: 'signed', signedBy: 'u_sgr_lead', signedAt: '2026-01-01', signedVersion: 1 })));
  await check('  THE PUBLIC GATE cannot say "open" before it is signed', 'deny', () => setDoc(doc(cx('u_sga_org'), 'sgGate', 'ev_sga_trip'), { needed: true, open: true, updatedAt: 'x' }));
  await check('  "waiting" it may', 'allow', () => setDoc(doc(cx('u_sga_org'), 'sgGate', 'ev_sga_trip'), { needed: true, open: false, updatedAt: 'x' }));
  await check('  anyone reads the gate (it says only waiting or open)', 'allow', () => getDoc(doc(anon(), 'sgGate', 'ev_sga_trip')));
  await check('  nobody signed out writes it', 'deny', () => setDoc(doc(anon(), 'sgGate', 'ev_sga_trip'), { needed: false, open: true, updatedAt: 'x' }));
  /* THE REQUIRED CHECKLIST: the rules refuse sign-off while any question is blank (Martin, 23 Oct) */
  const SIGN = (extra) => AS('u_sgr_lead', { status: 'signed', signedBy: 'u_sgr_lead', signedByName: 'Lead', signedAt: serverTimestamp(), signedVersion: 1, signedNote: '', ...(extra || {}) });
  const without = (k) => Object.fromEntries(Object.entries(ANS).filter(([x]) => x !== k));
  await check('THE CHECKLIST: NOT SIGNED with the insurance question blank', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ answers: without('insurance') })));
  await check('  nor with the paediatric first aider question blank', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ answers: without('paedFirstAid') })));
  await check('  nor with behaviour blank (a core question on every event, F-280 10.2)', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ answers: without('behaviour') })));
  await check('  nor with the mixed-group question blank', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ answers: without('mixedLeaders') })));
  await check('  nor with an answer that is empty', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ answers: { ...ANS, weather: '' } })));
  await check('  nor "not applicable" with no reason', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ answers: { ...ANS, transport: 'N/A: ' } })));
  await check('  nor "Yes" or "No" with nothing more', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ answers: { ...ANS, paedFirstAid: 'No: ' } })));
  await check('  AN OVERSEAS TRIP without the travel advice and travel insurance answers', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ flags: { abroad: true } })));
  await check('  only the ticks the hub knows', 'deny', () => setDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip'), AS('u_sga_org', { flags: { safe: true } })));
  await check('  THE HOST’S LIST NOT YET CHECKED: no sign-off', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ host: { name: 'Camp (invented)', items: [], confirmed: false }, hostIds: [] })));
  await check('  CHECKED, ITS QUESTIONS ARE REQUIRED: one blank', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN({ host: { name: 'Camp (invented)', items: [{ id: 'h_1', q: 'Code of conduct sent?' }], confirmed: true }, hostIds: ['h_1'] })));
  await check('  THE CHURCH’S OWN questions are required too', 'deny', async () => {
    await env.withSecurityRulesDisabled(async (c) => { const r = doc(c.firestore(), 'safeguardingSettings', 'defaults'); const s0 = await getDoc(r); await setDoc(r, { ...(s0.exists() ? s0.data() : {}), register: { checklist: [{ id: 'c_ins', q: 'Insurer form sent?' }], checklistIds: ['c_ins'] } }); });
    try { await setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'), SIGN()); }
    finally { await env.withSecurityRulesDisabled(async (c) => { const r = doc(c.firestore(), 'safeguardingSettings', 'defaults'); const s0 = await getDoc(r); const d = s0.data(); delete d.register; await setDoc(r, d); }); }
  });
  await check('  every answer there (one "not applicable" with its reason, an overseas trip with its travel answers, the host’s answered): signs', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip'),
    SIGN({ answers: { ...ANS, transport: 'N/A: we walk (invented)', travelAdvice: 'x', passports: 'x', travelInsurance: 'x', health: 'x', localEmergency: 'x', money: 'x', localHelpers: 'x', h_1: 'Sent (invented)' }, flags: { abroad: true, under8: true },
      host: { name: 'Camp (invented)', items: [{ id: 'h_1', q: 'Code of conduct sent?' }], confirmed: true }, hostIds: ['h_1'], signedByRole: 'Safeguarding lead' })));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'sgAssessments', 'ev_sga_trip'), AS('x', { status: 'waiting' })); });
  await check('  THE SITE’S LEAD SIGNS IT OFF, opening the gate with it', 'allow', () => { const dbx = cx('u_sgr_lead'); const b = writeBatch(dbx);
    b.set(doc(dbx, 'sgAssessments', 'ev_sga_trip'), AS('u_sgr_lead', { status: 'signed', signedBy: 'u_sgr_lead', signedByName: 'Lead', signedAt: serverTimestamp(), signedVersion: 1, signedNote: '' }));
    b.set(doc(dbx, 'sgGate', 'ev_sga_trip'), { needed: true, open: true, updatedAt: 'x' }); return b.commit(); });
  await check('  NOW A SIGN-UP GOES THROUGH', 'allow', () => SUX(anon(), 'key_sga_4_0000000000000000000000', 'ev_sga_trip'));
  /* S4: the trustees note it - its own record, for the signed version only */
  const NOTE = (uid, extra) => ({ siteId: 'site_sgr', version: 1, by: uid, byName: 'A trustee (invented)', at: serverTimestamp(), ...(extra || {}) });
  await check('S4 TRUSTEES NOTED: A TRUSTEE RECORDS THAT THE TRUSTEES HAVE NOTED THE SIGNED ASSESSMENT', 'allow', () => setDoc(doc(cx('u_sgr_trustee'), 'sgNoted', 'ev_sga_trip'), NOTE('u_sgr_trustee')));
  await check('  the organiser can’t (it’s the trustees’)', 'deny', () => setDoc(doc(cx('u_sga_org'), 'sgNoted', 'ev_sga_trip'), NOTE('u_sga_org')));
  await check('  nor in someone else’s name', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgNoted', 'ev_sga_trip'), NOTE('u_sga_org')));
  await check('  nor for a version that wasn’t the one signed', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgNoted', 'ev_sga_trip'), NOTE('u_sgr_trustee', { version: 2 })));
  await check('  nor before it is signed off', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgNoted', 'ev_sga_trip2'), NOTE('u_sgr_trustee')));
  await check('  the event’s organiser reads it', 'allow', () => getDoc(doc(cx('u_sga_org'), 'sgNoted', 'ev_sga_trip')));
  await check('  a change after signing cannot stay "signed"', 'deny', () => updateDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip'), { answers: { ...ANS, weather: 'Somewhere else' }, updatedAt: 'y', updatedBy: 'u_sga_org' }));
  await check('  it goes back to waiting', 'allow', () => updateDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip'), { answers: { ...ANS, weather: 'Somewhere else' }, status: 'waiting', version: 2, updatedAt: 'y', updatedBy: 'u_sga_org' }));
  await check('  AND BOOKINGS CLOSE AGAIN', 'deny', () => SUX(anon(), 'key_sga_5_0000000000000000000000', 'ev_sga_trip'));
  await check('"NOT NEEDED": not by the organiser', 'deny', () => setDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip2'), AS('u_sga_org', { calEventId: 'ev_sga_trip2', waived: true, waivedBy: 'u_sga_org', waivedAt: serverTimestamp(), waivedWhy: 'Short' })));
  await check('  not by the lead without a reason', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip2'), AS('u_sgr_lead', { calEventId: 'ev_sga_trip2', waived: true, waivedBy: 'u_sgr_lead', waivedAt: serverTimestamp(), waivedWhy: '' })));
  await check('  the lead, with a reason, recorded (who, when, why)', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip2'), AS('u_sgr_lead', { calEventId: 'ev_sga_trip2', waived: true, waivedBy: 'u_sgr_lead', waivedByName: 'Lead', waivedAt: serverTimestamp(), waivedWhy: 'It is a walk to the park next door with parents' })));
  await check('  then that event takes sign-ups', 'allow', () => SUX(anon(), 'key_sga_6_0000000000000000000000', 'ev_sga_trip2'));
  await check('  and the organiser cannot quietly undo or change the "not needed"', 'deny', () => updateDoc(doc(cx('u_sga_org'), 'sgAssessments', 'ev_sga_trip2'), { waivedWhy: 'changed', updatedAt: 'z', updatedBy: 'u_sga_org' }));
  await check('an assessment is never deleted', 'deny', () => deleteDoc(doc(cx('u_sgr_lead'), 'sgAssessments', 'ev_sga_trip')));
}

// ── EVENTS (events window) ── THE SAFEGUARDING RISK REGISTER, step 3: live warnings (counts only, the server writes them)
{
  const cx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'sgWarnings', 'site_sgr'), { siteId: 'site_sgr', items: [{ id: 'checks_out', kind: 'checks', level: 'red', count: 1, label: '1 leader ...', todo: 'x', date: '2026-10-22', fix: 'safeguarding.html', act: '' }], controls: { '*|checks': 'red' }, today: '2026-10-22', at: 'x' });
    await setDoc(doc(c.firestore(), 'sgMailed', 'ev_x_2026-10-24'), { siteId: 'site_sgr', at: 'x', subject: 'x' });
  });
  await check('SG WARNINGS: the site’s lead reads them', 'allow', () => getDoc(doc(cx('u_sgr_lead'), 'sgWarnings', 'site_sgr')));
  await check('  and the deputy', 'allow', () => getDoc(doc(cx('u_sgr_dep'), 'sgWarnings', 'site_sgr')));
  await check('  and the trustees', 'allow', () => getDoc(doc(cx('u_sgr_trustee'), 'sgWarnings', 'site_sgr')));
  await check('  and a master admin', 'allow', () => getDoc(doc(as('martin'), 'sgWarnings', 'site_sgr')));
  await check('  NOT A VOLUNTEER', 'deny', () => getDoc(doc(cx('u_sgr_vol'), 'sgWarnings', 'site_sgr')));
  await check('  not another site’s lead', 'deny', () => getDoc(doc(cx('u_sgr_other'), 'sgWarnings', 'site_sgr')));
  await check('  nor anyone signed out', 'deny', () => getDoc(doc(anon(), 'sgWarnings', 'site_sgr')));
  await check('  ONLY THE SERVER WRITES THEM: not the lead', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgWarnings', 'site_sgr'), { siteId: 'site_sgr', items: [], controls: {}, today: '2026-10-22', at: 'y' }));
  await check('  nor a master admin', 'deny', () => setDoc(doc(as('martin'), 'sgWarnings', 'site_sgr'), { siteId: 'site_sgr', items: [], controls: {}, today: '2026-10-22', at: 'y' }));
  await check('  nor deletes them', 'deny', () => deleteDoc(doc(cx('u_sgr_lead'), 'sgWarnings', 'site_sgr')));
  await check('THE "ALREADY EMAILED" RECORDS are the server’s alone: no reading', 'deny', () => getDoc(doc(as('martin'), 'sgMailed', 'ev_x_2026-10-24')));
  await check('  and no writing (an email cannot be quietly stopped)', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgMailed', 'ev_y_2026-10-24'), { siteId: 'site_sgr', at: 'x', subject: 'x' }));
}

// ── EVENTS (events window) ── THE SAFEGUARDING RISK REGISTER, step 4: the dials, the annual review, snapshots
{
  const cx = (uid) => env.authenticatedContext(uid).firestore();
  const Y = new Date().getUTCFullYear();
  let had = null;
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'sgDashboard', 'site_sgr'), { siteId: 'site_sgr', dials: { checks: { value: 1, of: 2, pct: 50, rag: 'red', parts: { ok: 1, soon: 0, out: 1 } } }, sessions: [], consentByGroup: [], review: {}, today: 'x', at: 'x' });
    const s = await getDoc(doc(d, 'safeguardingSettings', 'defaults')); had = s.exists() ? s.data() : null;
    await setDoc(doc(d, 'safeguardingSettings', 'defaults'), { ...(had || {}), leadSiteId: 'site_sgr', trusteeTeam: 'Elders' });
  });
  await check('SG DIALS: the site’s lead reads them', 'allow', () => getDoc(doc(cx('u_sgr_lead'), 'sgDashboard', 'site_sgr')));
  await check('  and the trustees', 'allow', () => getDoc(doc(cx('u_sgr_trustee'), 'sgDashboard', 'site_sgr')));
  await check('  NOT A VOLUNTEER', 'deny', () => getDoc(doc(cx('u_sgr_vol'), 'sgDashboard', 'site_sgr')));
  await check('  not another site’s lead', 'deny', () => getDoc(doc(cx('u_sgr_other'), 'sgDashboard', 'site_sgr')));
  await check('  ONLY THE SERVER WRITES THEM', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgDashboard', 'site_sgr'), { siteId: 'site_sgr', dials: {} }));

  const RV = (uid, item, extra) => ({ year: Y, itemId: item, siteId: 'site_sgr', at: serverTimestamp(), by: uid, byName: 'Invented', note: '', na: false, ...(extra || {}) });
  await check('THE ANNUAL REVIEW: the lead records "the lead and deputy named"', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_leads'), RV('u_sgr_lead', 'leads')));
  await check('  ONCE: it can’t be changed afterwards', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_leads'), RV('u_sgr_lead', 'leads', { note: 'changed' })));
  await check('  nor removed', 'deny', () => deleteDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_leads')));
  await check('  not in someone else’s name', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_policy'), RV('u_sgr_dep', 'policy')));
  await check('  not at a made-up time', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_policy'), RV('u_sgr_lead', 'policy', { at: '2026-01-01' })));
  await check('  not for last year', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', (Y - 1) + '_policy'), RV('u_sgr_lead', 'policy', { year: Y - 1 })));
  await check('  not under another item’s name', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_policy'), RV('u_sgr_lead', 'register')));
  await check('  NO FIELD FOR A CHILD OR A CONCERN', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_policy'), RV('u_sgr_lead', 'policy', { childName: 'Invented' })));
  await check('  the note in 300 characters at most', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_policy'), RV('u_sgr_lead', 'policy', { note: 'x'.repeat(301) })));
  await check('  a required item can’t be marked "does not apply"', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_policy'), RV('u_sgr_lead', 'policy', { na: true })));
  await check('  an optional one can (hirers)', 'allow', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_hirers'), RV('u_sgr_lead', 'hirers', { na: true })));
  await check('  THE LEAD CAN’T RECORD THE TRUSTEES’ ITEMS', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_adopted'), RV('u_sgr_lead', 'adopted')));
  await check('  a trustee records "the policy adopted"', 'allow', () => setDoc(doc(cx('u_sgr_trustee'), 'sgReviews', Y + '_adopted'), RV('u_sgr_trustee', 'adopted', { siteId: '' })));
  await check('  but not the lead’s items', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgReviews', Y + '_policy'), RV('u_sgr_trustee', 'policy')));
  await check('  A VOLUNTEER RECORDS NOTHING', 'deny', () => setDoc(doc(cx('u_sgr_vol'), 'sgReviews', Y + '_policy'), RV('u_sgr_vol', 'policy')));
  await check('  ANOTHER SITE’S LEAD records a lead’s item for the whole church, naming their site', 'allow', () => setDoc(doc(cx('u_sgr_other'), 'sgReviews', Y + '_policy'), RV('u_sgr_other', 'policy', { siteId: 'site_sgr2' })));
  await check('  but not naming a site they don’t lead', 'deny', () => setDoc(doc(cx('u_sgr_other'), 'sgReviews', Y + '_recruitment'), RV('u_sgr_other', 'recruitment')));
  await check('  the trustees read the review', 'allow', () => getDoc(doc(cx('u_sgr_trustee'), 'sgReviews', Y + '_leads')));
  await check('  the lead of the lead site reads another site’s record', 'allow', () => getDoc(doc(cx('u_sgr_lead'), 'sgReviews', Y + '_policy')));
  await check('  another site’s lead reads their own', 'allow', () => getDoc(doc(cx('u_sgr_other'), 'sgReviews', Y + '_policy')));
  await check('  but not the lead site’s', 'deny', () => getDoc(doc(cx('u_sgr_other'), 'sgReviews', Y + '_leads')));
  await check('  a volunteer doesn’t read it', 'deny', () => getDoc(doc(cx('u_sgr_vol'), 'sgReviews', Y + '_leads')));
  await check('  one not recorded yet: nothing to see', 'allow', () => getDoc(doc(cx('u_sgr_vol'), 'sgReviews', Y + '_return')));

  const SN = (uid, extra) => ({ siteId: 'site_sgr', banner: 'Safeguarding risk register: Test site, 22 October 2026', by: uid, byName: 'Invented', at: serverTimestamp(), note: '',
    risks: [{ activity: 'Juniors', risk: 'Too few leaders', before: 'amber', beforeScore: 12, after: 'green', afterScore: 4 }], warnings: { red: 1, amber: 0 }, dials: {}, review: { done: 1, of: 8 }, ...(extra || {}) });
  await check('SNAPSHOTS: a trustee takes one', 'allow', () => setDoc(doc(cx('u_sgr_trustee'), 'sgSnapshots', 'sn_1'), SN('u_sgr_trustee')));
  await check('  a master admin takes one', 'allow', () => setDoc(doc(as('martin'), 'sgSnapshots', 'sn_2'), SN('u_martin')));
  await check('  THE BANNER must begin "Safeguarding risk register:"', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgSnapshots', 'sn_3'), SN('u_sgr_trustee', { banner: 'Risk assessment, Test site' })));
  await check('  not in someone else’s name', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgSnapshots', 'sn_4'), SN('u_sgr_lead')));
  await check('  no extra field', 'deny', () => setDoc(doc(cx('u_sgr_trustee'), 'sgSnapshots', 'sn_5'), SN('u_sgr_trustee', { concerns: 1 })));
  await check('  the lead and deputy don’t take them', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgSnapshots', 'sn_6'), SN('u_sgr_lead')));
  await check('  NEVER CHANGED', 'deny', () => updateDoc(doc(cx('u_sgr_trustee'), 'sgSnapshots', 'sn_1'), { note: 'changed' }));
  await check('  nor removed', 'deny', () => deleteDoc(doc(as('martin'), 'sgSnapshots', 'sn_1')));
  await check('  the lead reads them', 'allow', () => getDocs(query(collection(cx('u_sgr_lead'), 'sgSnapshots'), where('siteId', '==', 'site_sgr'))));
  await check('  a volunteer doesn’t', 'deny', () => getDocs(query(collection(cx('u_sgr_vol'), 'sgSnapshots'), where('siteId', '==', 'site_sgr'))));
  await env.withSecurityRulesDisabled(async (c) => { const r = doc(c.firestore(), 'safeguardingSettings', 'defaults'); if (had) await setDoc(r, had); else await deleteDoc(r); });
}

// ── EVENTS (events window) ── THE SAFEGUARDING RISK REGISTER, step 5: AI drafts (the server writes; counts only)
{
  const cx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'sgAiLog', 'log_1'), { siteId: 'site_sgr', calEventId: 'ev_sga_trip', by: 'u_sgr_vol', byName: 'x', at: 'x', chars: 120, outcome: 'drafted', tokensIn: 900, tokensOut: 1800 });
    await setDoc(doc(c.firestore(), 'sgAiUse', '2026-10-22'), { total: 1, by: { u_sgr_vol: 1 } });
  });
  const LOG = (uid) => ({ siteId: 'site_sgr', calEventId: 'ev_sga_trip', by: uid, byName: 'x', at: 'x', chars: 1, outcome: 'drafted', tokensIn: 0, tokensOut: 0 });
  await check('THE AI LOG: the site’s lead reads it', 'allow', () => getDoc(doc(cx('u_sgr_lead'), 'sgAiLog', 'log_1')));
  await check('  a master admin reads it', 'allow', () => getDoc(doc(as('martin'), 'sgAiLog', 'log_1')));
  await check('  not the person who asked (a volunteer)', 'deny', () => getDoc(doc(cx('u_sgr_vol'), 'sgAiLog', 'log_1')));
  await check('  not the trustees', 'deny', () => getDoc(doc(cx('u_sgr_trustee'), 'sgAiLog', 'log_1')));
  await check('  NOBODY WRITES IT FROM A PAGE: not the lead', 'deny', () => setDoc(doc(cx('u_sgr_lead'), 'sgAiLog', 'log_2'), LOG('u_sgr_lead')));
  await check('  nor a master admin', 'deny', () => setDoc(doc(as('martin'), 'sgAiLog', 'log_3'), LOG('u_martin')));
  await check('  nor removes an entry', 'deny', () => deleteDoc(doc(cx('u_sgr_lead'), 'sgAiLog', 'log_1')));
  await check('TODAY’S COUNTS are the server’s: no page resets the cap', 'deny', () => setDoc(doc(as('martin'), 'sgAiUse', '2026-10-22'), { total: 0, by: {} }));
  await check('  nor reads them', 'deny', () => getDoc(doc(cx('u_sgr_lead'), 'sgAiUse', '2026-10-22')));
  await check('THE EMULATOR’S STAND-IN is never set from a page', 'deny', () => setDoc(doc(as('martin'), 'sgAiStub', 'config'), { url: 'http://example.invalid' }));
}

// ── EVENTS (events window) ── a team-only event: its site's safeguarding lead sees it (the reviewing window, 23 Oct)
{
  const cx = (uid) => env.authenticatedContext(uid).firestore();
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'calEvents', 'ev_teamonly'), { title: 'Youth weekend (invented)', status: 'confirmed', audience: [], teamUids: ['u_sga_org'], teamMemberIds: [], location: { kind: 'room', siteId: 'site_sgr' }, sgKind: 'trip' });
  });
  await check('A TEAM-ONLY EVENT: its team sees it', 'allow', () => getDoc(doc(cx('u_sga_org'), 'calEvents', 'ev_teamonly')));
  await check('  AND THE SAFEGUARDING LEAD OF ITS SITE (to assess, sign off and print it)', 'allow', () => getDoc(doc(cx('u_sgr_lead'), 'calEvents', 'ev_teamonly')));
  await check('  and the deputy', 'allow', () => getDoc(doc(cx('u_sgr_dep'), 'calEvents', 'ev_teamonly')));
  await check('  not another site’s lead', 'deny', () => getDoc(doc(cx('u_sgr_other'), 'calEvents', 'ev_teamonly')));
  await check('  not a volunteer', 'deny', () => getDoc(doc(cx('u_sgr_vol'), 'calEvents', 'ev_teamonly')));
  await check('  nor anyone signed out', 'deny', () => getDoc(doc(anon(), 'calEvents', 'ev_teamonly')));
  await check('  seeing it is all: the lead doesn’t edit it', 'deny', () => updateDoc(doc(cx('u_sgr_lead'), 'calEvents', 'ev_teamonly'), { title: 'Changed' }));
}

// ── EVENTS (events window) ── H&S step 2b: my gates by JOB, never a team's name (H-9). The synthetic
// parish (St Aidan's with St Hild, Testbury) names its own teams; EGBC's names then do nothing.
{
  const cx = (uid) => env.authenticatedContext(uid).firestore();
  let tjWas = null;
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const s = await getDoc(doc(db, 'churchSettings', 'teamJobs')); tjWas = s.exists() ? s.data() : null;
    await setDoc(doc(db, 'churchSettings', 'teamJobs'), { office: ['Parish office'], trustees: ['PCC'], buildings: ['Fabric team'], catering: ['Kitchen team'], finance: ['Treasury'] });
    const U = (uid, teams) => setDoc(doc(db, 'users', uid), { uid, memberId: 'm' + uid.slice(1), status: 'active', name: uid, teams, adminFor: [], masterAdmin: false });
    for (const [u, tm] of [['u_jb_office', ['Parish office']], ['u_jb_oldoffice', ['Church office']], ['u_jb_pcc', ['PCC']], ['u_jb_elder', ['Elders']],
      ['u_jb_fabric', ['Fabric team']], ['u_jb_maint', ['Maintenance']], ['u_jb_kitchen', ['Kitchen team']], ['u_jb_catering', ['Catering']],
      ['u_jb_treasury', ['Treasury']], ['u_jb_finance', ['Finance']]]) await U(u, tm);
    await setDoc(doc(db, 'users', 'u_jb_cover'), { uid: 'u_jb_cover', memberId: 'm_jb_cover', status: 'active', name: 'x', teams: ['Parish staff'], covers: ['Fabric team'], adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'sites', 'site_jb'), { name: 'St Hild (synthetic)', active: true });
    await setDoc(doc(db, 'buildingProfiles', 'site_jb'), { siteId: 'site_jb' });
    await setDoc(doc(db, 'cateringOrders', 'co_jb'), { siteId: 'site_jb', day: '2026-11-20', state: 'new' });
    await setDoc(doc(db, 'giftAid', 'ga_jb'), { memberId: 'm_someone' });
    for (const j of ['mj_jb1', 'mj_jb2', 'mj_jb3']) await setDoc(doc(db, 'maintJobs', j), { siteId: 'site_jb', roomId: '', where: 'Vestry', what: 'A tap drips (invented)', details: '', photoPath: '',
      status: 'todo', reportedBy: 'u_jb_pcc', reportedByName: 'x', reportedAt: 'x' });
  });
  const done = (uid, id) => updateDoc(doc(cx(uid), 'maintJobs', id), { status: 'done', doneBy: uid, doneByName: 'x', doneAt: serverTimestamp(), doneNote: '' });
  await check('BY JOB (H-9), THE PARISH: its "Parish office" does the office job - it keeps the building compliance', 'allow', () => setDoc(doc(cx('u_jb_office'), 'buildingProfiles', 'site_jb'), { siteId: 'site_jb' }));
  await check('  and reads it', 'allow', () => getDoc(doc(cx('u_jb_office'), 'buildingProfiles', 'site_jb')));
  await check('  a team called "Church office" no longer may', 'deny', () => getDoc(doc(cx('u_jb_oldoffice'), 'buildingProfiles', 'site_jb')));
  await check('  ITS PCC DOES THE TRUSTEES JOB: it reads the compliance', 'allow', () => getDoc(doc(cx('u_jb_pcc'), 'buildingProfiles', 'site_jb')));
  await check('    but does not keep it', 'deny', () => setDoc(doc(cx('u_jb_pcc'), 'buildingProfiles', 'site_jb'), { siteId: 'site_jb' }));
  await check('    the Elders no longer read it', 'deny', () => getDoc(doc(cx('u_jb_elder'), 'buildingProfiles', 'site_jb')));
  await check('    the PCC reads the safeguarding register as the trustees', 'allow', () => getDoc(doc(cx('u_jb_pcc'), 'sgRisks', 'sgr_1')));
  await check('  ITS FABRIC TEAM DOES THE BUILDINGS JOB: it marks a repair done', 'allow', () => done('u_jb_fabric', 'mj_jb1'));
  await check('    so does a core team that covers it', 'allow', () => done('u_jb_cover', 'mj_jb2'));
  await check('    a team called "Maintenance" no longer may', 'deny', () => done('u_jb_maint', 'mj_jb3'));
  await check('  ITS KITCHEN TEAM DOES THE CATERING JOB: it reads the caterers’ list', 'allow', () => getDoc(doc(cx('u_jb_kitchen'), 'cateringOrders', 'co_jb')));
  await check('    a team called "Catering" no longer may', 'deny', () => getDoc(doc(cx('u_jb_catering'), 'cateringOrders', 'co_jb')));
  await check('  ITS TREASURY DOES THE FINANCE JOB: it reads the card payments setting', 'allow', () => getDoc(doc(cx('u_jb_treasury'), 'paymentSettings', 'stripe')));
  await check('    and the Gift Aid declarations', 'allow', () => getDoc(doc(cx('u_jb_treasury'), 'giftAid', 'ga_jb')));
  await check('    a team called "Finance" no longer may', 'deny', () => getDoc(doc(cx('u_jb_finance'), 'paymentSettings', 'stripe')));
  await check('    nor read the declarations', 'deny', () => getDoc(doc(cx('u_jb_finance'), 'giftAid', 'ga_jb')));
  await check('  the Parish office reads the declarations (the office job)', 'allow', () => getDoc(doc(cx('u_jb_office'), 'giftAid', 'ga_jb')));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'churchSettings', 'teamJobs'), { office: ['Parish office'], trustees: ['PCC'], buildings: [], catering: ['Kitchen team'], finance: ['Treasury'] }); });
  await check('  A JOB NOBODY DOES ([]): nobody is on it - the Fabric team may not', 'deny', () => done('u_jb_fabric', 'mj_jb3'));
  /* NO HIDDEN CAPS (H-9): my old 10, 20, 30 and 60 are now 500, the most one list holds */
  const many = (n, p) => Array.from({ length: n }, (_, i) => p + i);
  await check('NO HIDDEN CAPS: 500 people see the newcomers’ hellos (it was 30)', 'allow', () => setDoc(doc(as('martin'), 'welcomeSettings', 'main'), { memberIds: many(500, 'm_w'), updatedAt: serverTimestamp(), updatedBy: 'u_martin' }));
  await check('  never 501', 'deny', () => setDoc(doc(as('martin'), 'welcomeSettings', 'main'), { memberIds: many(501, 'm_w'), updatedAt: serverTimestamp(), updatedBy: 'u_martin' }));
  await check('  a children’s site names 500 teams (it was 20)', 'allow', () => setDoc(doc(as('martin'), 'kidsSettings', 'site_jb'), { teams: many(500, 'Team ') }));
  await check('  the groups admins: 500 teams (it was 20)', 'allow', () => setDoc(doc(as('martin'), 'groupsSettings', 'main'), { teams: many(500, 'Team ') }));
  await check('  never 501', 'deny', () => setDoc(doc(as('martin'), 'groupsSettings', 'main'), { teams: many(501, 'Team ') }));
  await check('  the fire roll call holds 500 people (it was 60)', 'allow', () => setDoc(doc(as('martin'), 'fireRollCall', 'main'), { people: many(500, 'm_f').map((m) => ({ memberId: m })), memberIds: [], allSites: [], bySite: {}, updatedBy: 'u_martin', updatedAt: 'x' }));
  await env.withSecurityRulesDisabled(async (c) => { const r = doc(c.firestore(), 'churchSettings', 'teamJobs'); if (tjWas) await setDoc(r, tjWas); else await deleteDoc(r); });
}

// Nothing else is open.
await check('unknown collection stays shut', 'deny', () => getDoc(doc(as('samy'), 'somethingElse', 'x')));

await env.cleanup();

const failed = results.filter(r => !r.ok);
for (const r of results) {
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  (expected ' + r.expect + ')' + (r.why ? '\n          ' + r.why : ''));
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
