/* The one invented account every browser check signs in as.
 *
 * WHY THIS FILE EXISTS. Every check that drives the hub rewrites this
 * account's profile to suit itself - check-menu.mjs reads the Menu as three
 * different people and leaves it as the last of them. So whether a sweep can
 * open a gated page depended on which check had run most recently, and the
 * sweeps said nothing about it: six pages went unmeasured behind a total of 0
 * (A-023 in FINDINGS-app.md).
 *
 * A sweep needs somebody who can open everything. It asks for that here rather
 * than hoping, so running the checks in a different order changes nothing.
 *
 * Nothing in here resembles a real person, and it only ever writes to the
 * emulator - the port is the emulator's, with its "owner" bearer token, and no
 * live project will answer it.
 */
import http from 'node:http';

const PROJECT = 'egbc-worship-planner';
const BASE = '/v1/projects/' + PROJECT + '/databases/(default)/documents/';

/* Every team there is. A sweep is not testing who can see what - check-menu.mjs
   does that, carefully, as three different people - so here the account simply
   has all of it. */
export const ALL_TEAMS = ['Core Team', 'Worship Team', 'AV Team', 'Choir',
  'Kids Church', 'Youth Worship', 'Lazers', 'ReNu'];

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});

const str = s => ({ stringValue: String(s) });

/* Give the signed-in account everything it needs to open every page.
 *
 *   uid    the account that is signed in, from firebase.auth().currentUser
 *   email  its address, so the record reads as itself
 *
 * `roles` is the one that is easy to leave out, and leaving it out is silent:
 * neither adminFor nor masterAdmin clears a `data-role="leader"` gate, which is
 * what the Rota Planner and the Sunday Service Planner use. Without it those
 * two show EGBCAuth's "Not enough permissions" card and a sweep measures the
 * card.
 */
export async function giveFullAccess(uid, email) {
  if (!uid) throw new Error('giveFullAccess needs the signed-in uid');
  await rest('PATCH', BASE + 'users/' + uid, { fields: {
    uid: str(uid),
    email: str(email || 'places.tester@example.invalid'),
    name: str('Sweep Tester'),
    memberId: str('ab_tester'),
    status: str('active'),
    linkedBy: str('admin'),
    teams: { arrayValue: { values: ALL_TEAMS.map(str) } },
    adminFor: { arrayValue: { values: ALL_TEAMS.map(str) } },
    masterAdmin: { booleanValue: true },
    /* Section 21: the sweep account is an Attender and a Church member too,
       or every members-only thing would be hidden from it and a sweep would
       measure its absence as though that were the page. */
    attender: { booleanValue: true },
    churchMember: { booleanValue: true },
    roles: { mapValue: { fields: Object.fromEntries(ALL_TEAMS.map(t => [t, str('owner')])) } }
  } });
  /* AND THE ADDRESS BOOK, WHICH IS WHERE IT ACTUALLY COMES FROM.
     EGBCAuth.refreshFromBook() re-reads addressBook/{memberId} on every page
     load and writes teams, adminFor, masterAdmin, name and status back over
     users/{uid}. Setting them on the user document alone looks like it worked
     - the write succeeds - and is undone before the first page draws. That is
     what kept three pages showing "Admins only" after this helper had, as far
     as anything could tell, just made the account a master admin. */
  await rest('PATCH', BASE + 'addressBook/ab_tester', { fields: {
    name: str('Sweep Tester'),
    email: str(email || 'places.tester@example.invalid'),
    markers: { arrayValue: { values: ALL_TEAMS.map(str) } },
    adminFor: { arrayValue: { values: ALL_TEAMS.map(str) } },
    masterAdmin: { booleanValue: true },
    churchMember: { booleanValue: true }
  } });
}
