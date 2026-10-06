/* Runs the real rules engine against firestore.rules.
   Nothing here touches the live project. */

import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';

/* Read the port from firebase.json rather than repeating it here. They used
   to be two numbers that had to agree, and when 8080 turned out to be taken
   on a real machine only one of them moved. */
const cfg = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
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
  await setDoc(doc(db, 'events', 'e1'), { date: '2026-09-06', roles: ['Guitar'] });
  await setDoc(doc(db, 'worshipBoardState', 'state'), { notes: [] });
  await setDoc(doc(db, 'worshipBoardState', 'kids-church'), { notes: [] });
  await setDoc(doc(db, 'worshipBoardState', 'youth'), { notes: [] });
  await setDoc(doc(db, 'teamVideos', 'v_kids'), { title: 'Kids clip', team: 'Kids Church' });
  await setDoc(doc(db, 'teamVideos', 'v_worship'), { title: 'Worship clip', team: 'Worship Team' });
  await setDoc(doc(db, 'videoSections', 'kids-church'), { team: 'Kids Church', names: ['Church Show'] });
  await setDoc(doc(db, 'services', 's1'), { date: '2026-09-06' });
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
  await setDoc(doc(db, 'eventChecklists', 'ev_public'), { tasks: [] });
  await setDoc(doc(db, 'checklistTemplates', 'tpl_service'), { name: 'Service', tasks: ['Chairs out'] });
  await setDoc(doc(db, 'eventNotes', 'ev_public'), { text: 'Invented note' });
  await setDoc(doc(db, 'eventChanges', 'ch1'), { calEventId: 'ev_public', by: 'u_martin', what: 'created' });
  await setDoc(doc(db, 'commsLog', 'log1'), { calEventId: 'ev_public', to: 1, subject: 'Test' });

});

const as = (who) => env.authenticatedContext(PEOPLE[who].uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

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

// Nothing else is open.
await check('unknown collection stays shut', 'deny', () => getDoc(doc(as('samy'), 'somethingElse', 'x')));

await env.cleanup();

const failed = results.filter(r => !r.ok);
for (const r of results) {
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  (expected ' + r.expect + ')' + (r.why ? '\n          ' + r.why : ''));
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
