/* CORE TEAMS COVER CHOSEN TEAMS, INDEPENDENTLY (FINDINGS-churchhq H-15;
 * Martin, 26 Oct 2026: "We need a kids church and youth core team and a
 * worship core team. They need to be independent").
 *
 * A team's `coreFor` (Teams & groups) lists the teams it is the core team
 * for. Being on it counts as being on those teams, and nothing else; an
 * admin of it administers them. The pages ask egbc-auth.js (the same
 * defaults, in its TEAMS table); the server asks here; the rules read what
 * this keeps on each person's users record:
 *
 *   covers       the teams their core teams cover
 *   adminCovers  the teams covered by the core teams they administer
 *
 * so the rules need no extra read (H-8). No page may write either field.
 *
 * EGBC'S DEFAULTS, for a team with no coreFor stored: Core Team (the
 * Worship Core Team) covers Worship Team, AV Team and Choir, as before;
 * Kids & Youth Core Team covers Kids Church, Lazers, ReNu and Youth Worship.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const DEFAULT_CORES = {
  'Core Team': ['Worship Team', 'AV Team', 'Choir'],
  'Kids & Youth Core Team': ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship']
};

/* { coreTeam: [covered teams] } for this church: EGBC's defaults, then what
   Teams & groups stored (an empty coreFor there means "covers nothing"). */
export async function coresMap(db) {
  const out = Object.fromEntries(Object.entries(DEFAULT_CORES).map(([k, v]) => [k, v.slice()]));
  try {
    const snap = await db.collection('teams').get();
    snap.docs.forEach((d) => {
      const t = d.data() || {};
      if (!Array.isArray(t.coreFor)) return;
      const list = t.coreFor.filter((x) => typeof x === 'string' && x && x !== d.id);
      if (list.length && t.archived !== true) out[d.id] = list; else delete out[d.id];
    });
  } catch (e) { /* the defaults are a complete answer */ }
  return out;
}

/* One step only: a core team never reaches another core team's teams. */
export function coversFor(teams, cores) {
  const mine = Array.isArray(teams) ? teams : [];
  const out = [];
  mine.forEach((t) => (cores[t] || []).forEach((c) => { if (!mine.includes(c) && !out.includes(c)) out.push(c); }));
  return out.sort();
}

const same = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort());

/* Write covers / adminCovers on one users record if they are not right.
   Returns what it decided, for the checks. */
export async function syncCovers(db, uid, cores) {
  const ref = db.collection('users').doc(uid);
  const s = await ref.get();
  if (!s.exists) return { skipped: 'no record' };
  const u = s.data() || {};
  const covers = coversFor(u.teams, cores), adminCovers = coversFor(u.adminFor, cores);
  if (same(u.covers, covers) && same(u.adminCovers, adminCovers) && Array.isArray(u.covers) && Array.isArray(u.adminCovers)) return { unchanged: true, covers, adminCovers };
  await ref.set({ covers, adminCovers }, { merge: true });
  return { written: true, covers, adminCovers };
}

/* Everyone on, or administering, one of these teams. */
export async function syncTeamPeople(db, teamIds, cores) {
  const uids = new Set();
  for (const t of teamIds) {
    for (const field of ['teams', 'adminFor']) {
      const snap = await db.collection('users').where(field, 'array-contains', t).get();
      snap.docs.forEach((d) => uids.add(d.id));
    }
  }
  let written = 0;
  for (const uid of uids) if ((await syncCovers(db, uid, cores)).written) written++;
  return { people: uids.size, written };
}

/* A users record written: its teams or admin areas may have changed. Its
   own covers write comes back here and is then unchanged, so it stops. */
export async function onUserWrite(db, uid, before, after) {
  if (!after) return { skipped: 'deleted' };
  const changed = !before || !same(before.teams, after.teams) || !same(before.adminFor, after.adminFor)
    || !Array.isArray(after.covers) || !Array.isArray(after.adminCovers);
  if (!changed) return { skipped: 'nothing that matters changed' };
  return syncCovers(db, uid, await coresMap(db));
}

/* A team written: if what it covers changed, its people are worked out again. */
export async function onTeamWrite(db, id, before, after) {
  const b = before && Array.isArray(before.coreFor) ? before.coreFor : null;
  const a = after && Array.isArray(after.coreFor) ? after.coreFor : null;
  if (same(b, a) && !!(before && before.archived) === !!(after && after.archived)) return { skipped: 'coreFor unchanged' };
  return syncTeamPeople(db, [id], await coresMap(db));
}

/* The triggers, for EGBC's top level and every church (index.js twins). */
export const makeCoverTriggers = (twins) => ({
  user: twins(onDocumentWritten, 'users/{uid}', async (ch, event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    return onUserWrite(ch.db, event.params.uid, b, a);
  }),
  team: twins(onDocumentWritten, 'teams/{id}', async (ch, event) => {
    const b = event.data.before.exists ? event.data.before.data() : null;
    const a = event.data.after.exists ? event.data.after.data() : null;
    return onTeamWrite(ch.db, event.params.id, b, a);
  })
});
