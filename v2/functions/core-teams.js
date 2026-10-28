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
 *   shares       the worship side's other teams, for someone on one of
 *                them: the teams doing the worship, AV and choir jobs count
 *                as one for reading (Martin: "if worship team want to turn
 *                on the sound desk they should be able to see how"). Kept
 *                apart from covers, which also means "leads these".
 *   jobs         the team jobs their teams and covered teams do (H-9 part 2;
 *                the events window's F-298: a rule asking a job reads the
 *                record it already has, not churchSettings/teamJobs too)
 *
 * so the rules need no extra read (H-8). No page may write either field.
 *
 * EGBC'S DEFAULTS, for a team with no coreFor stored: Core Team (the
 * Worship Core Team) covers Worship Team, AV Team and Choir, as before;
 * Kids & Youth Core Team covers Kids Church, Lazers, ReNu and Youth Worship.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { JOBS, onJob, readTeamJobs, teamsFor } from './team-jobs.js';

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

/**
 * The worship side's teams a person is not on but reads as if they were:
 * someone on a team doing the worship, AV or choir job gets the others.
 * @param {string[]} teams their own teams @param {object} tj readTeamJobs(db)
 * @returns {string[]}
 */
export function sharesFor(teams, tj) {
  const mine = Array.isArray(teams) ? teams : [];
  const side = [...new Set(['worship', 'av', 'choir'].flatMap((j) => teamsFor(tj.map, j, tj.set)))];
  if (!mine.some((t) => side.includes(t))) return [];
  return side.filter((t) => !mine.includes(t)).sort();
}

const same = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort());

/* The jobs a person's teams (and the teams they cover) do. tj is
   readTeamJobs(db): the church's mapping and the settings it falls back on. */
export function jobsFor(teams, covers, tj) {
  const mine = (Array.isArray(teams) ? teams : []).concat(covers || []);
  return JOBS.map((j) => j.id).filter((j) => onJob(tj.map, mine, j, tj.set)).sort();
}

/* Write covers / adminCovers / jobs on one users record if they are not
   right. Returns what it decided, for the checks. */
export async function syncCovers(db, uid, cores, tj) {
  const ref = db.collection('users').doc(uid);
  const s = await ref.get();
  if (!s.exists) return { skipped: 'no record' };
  const u = s.data() || {};
  tj = tj || await readTeamJobs(db);
  const covers = coversFor(u.teams, cores), adminCovers = coversFor(u.adminFor, cores);
  const jobs = jobsFor(u.teams, covers, tj), shares = sharesFor(u.teams, tj);
  if (same(u.covers, covers) && same(u.adminCovers, adminCovers) && same(u.jobs, jobs) && same(u.shares, shares)
      && Array.isArray(u.covers) && Array.isArray(u.adminCovers) && Array.isArray(u.jobs) && Array.isArray(u.shares)) return { unchanged: true, covers, adminCovers, jobs, shares };
  await ref.set({ covers, adminCovers, jobs, shares }, { merge: true });
  return { written: true, covers, adminCovers, jobs, shares };
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
  const tj = await readTeamJobs(db);
  for (const uid of uids) if ((await syncCovers(db, uid, cores, tj)).written) written++;
  return { people: uids.size, written };
}

/* The team jobs, or a setting they fall back on, written: everyone's jobs
   are worked out again (a church's users, in pages of 300). */
export async function syncEveryone(db) {
  const cores = await coresMap(db), tj = await readTeamJobs(db);
  let people = 0, written = 0, last = null;
  for (;;) {
    let q = db.collection('users').orderBy('__name__').limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) { people++; if ((await syncCovers(db, d.id, cores, tj)).written) written++; }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 300) break;
  }
  return { people, written };
}

/* A users record written: its teams or admin areas may have changed. Its
   own covers write comes back here and is then unchanged, so it stops. */
export async function onUserWrite(db, uid, before, after) {
  if (!after) return { skipped: 'deleted' };
  const changed = !before || !same(before.teams, after.teams) || !same(before.adminFor, after.adminFor)
    || !Array.isArray(after.covers) || !Array.isArray(after.adminCovers) || !Array.isArray(after.jobs) || !Array.isArray(after.shares);
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
  }),
  /* The team jobs, and the three settings a job falls back on. */
  jobs: twins(onDocumentWritten, 'churchSettings/teamJobs', async (ch) => syncEveryone(ch.db)),
  money: twins(onDocumentWritten, 'paymentSettings/public', async (ch, event) => settingChanged(ch, event, 'moneyTeam')),
  trustees: twins(onDocumentWritten, 'safeguardingSettings/defaults', async (ch, event) => settingChanged(ch, event, 'trusteeTeam')),
  prayer: twins(onDocumentWritten, 'prayerSettings/main', async (ch, event) => settingChanged(ch, event, 'prayerTeam'))
});

/* Only when the one field a job falls back on changed. */
async function settingChanged(ch, event, field) {
  const b = event.data.before.exists ? event.data.before.data() || {} : {};
  const a = event.data.after.exists ? event.data.after.data() || {} : {};
  if (b[field] === a[field]) return { skipped: field + ' unchanged' };
  return syncEveryone(ch.db);
}
