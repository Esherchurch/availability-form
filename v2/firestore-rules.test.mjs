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
};

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const p of Object.values(PEOPLE)) {
    await setDoc(doc(db, 'users', p.uid), {
      memberId: 'm_' + p.uid, name: p.uid,
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin,
      status: (p.teams.length || p.adminFor.length || p.masterAdmin) ? 'active' : 'pending',
    });
  }
  await setDoc(doc(db, 'addressBook', 'm_u_samy'), { name: 'Samy', markers: ['Worship Team'] });
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
  await setDoc(doc(db, 'forms', 'form_consent'), { title: 'Test consent', fields: [], siteId: 'site_kids' });
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

/* The availability form has no sign-in, by decision: it goes to the whole
   team once a term and a password box would lose the people it is for. So
   these three have to work without an account - and nothing else does. */
await check('public form reads the address book', 'allow', () => getDocs(collection(anon(), 'addressBook')));
await check('public form reads the dates', 'allow', () => getDoc(doc(anon(), 'events', 'e1')));
await check('public form submits an answer', 'allow', () => setDoc(doc(anon(), 'availability', 'a1'), { memberId: 'm_u_samy', status: 'yes' }));
await check('an answer has to look like an answer', 'deny', () => setDoc(doc(anon(), 'availability', 'junk'), { anything: 'goes' }));
await check('the form cannot read anyone\'s answers back', 'deny', () => getDoc(doc(anon(), 'availability', 'a1')));
await check('the form cannot edit the address book', 'deny', () => setDoc(doc(anon(), 'addressBook', 'm_u_samy'), { name: 'Nope' }));
await check('the form cannot edit the rota', 'deny', () => setDoc(doc(anon(), 'events', 'e1'), { date: 'x' }));
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
await check('worship reads the kids board', 'allow', () => getDoc(doc(as('samy'), 'worshipBoardState', 'kids-church')));
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
  await check('an admin builds a form', 'allow', () => setDoc(doc(as('karen'), 'forms', 'form_new'), { title: 'Test trip', fields: [], siteId: 'site_kids' }));
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
  await check('an ordinary admin lists the ordinary answers', 'allow', () => getDocs(query(collection(ella(), 'formResponses'), where('formId', '==', 'form_consent'))));
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
// ── end EVENTS ──
// ── end EVENTS ──

// Nothing else is open.
await check('unknown collection stays shut', 'deny', () => getDoc(doc(as('samy'), 'somethingElse', 'x')));

await env.cleanup();

const failed = results.filter(r => !r.ok);
for (const r of results) {
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  (expected ' + r.expect + ')' + (r.why ? '\n          ' + r.why : ''));
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
