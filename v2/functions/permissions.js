/* WHO MAY DO WHAT, ON EACH PERSON'S SIGN-IN (FINDINGS-churchhq H-14;
 * 26 Oct 2026). The Permissions screen keeps the ticks and the exceptions;
 * this works out each person's allowed actions (permissions-core.js, built
 * from the page's own egbc-permissions.js) and puts them on their sign-in:
 *
 *     perms: { <church id, or 'egbc' for EGBC's own data>: ['kbUpload', ...] }
 *
 * merged with the claims they already carry (churches, a ChurchShow
 * computer's device fields...). The Storage rules then ask the claim, with
 * no read at all (H-8). A claim reaches the page at its next token: within
 * the hour, or at once when the page refreshes it.
 *
 * Worked out again when the ticks, the team jobs, an exception or a
 * person's teams change, and every morning (an exception's end date passes;
 * and a week before it does, the master admin who added it is told -
 * Martin's answer 3).
 */
import { allowed, ending, action as actionOf } from './permissions-core.js';
import { readTeamJobs } from './team-jobs.js';
import { coresMap } from './core-teams.js';

export const CLAIM_KEY = (cid) => cid || 'egbc';
const same = (a, b) => JSON.stringify((a || []).slice().sort()) === JSON.stringify((b || []).slice().sort());

/* The person's claims with this church's perms replaced, everything else kept. */
export function mergedPerms(existing, key, list) {
  const out = Object.assign({}, existing || {});
  const perms = Object.assign({}, out.perms || {});
  if (list && list.length) perms[key] = list.slice().sort(); else delete perms[key];
  if (Object.keys(perms).length) out.perms = perms; else delete out.perms;
  return out;
}

/* What decides anybody's permissions in this church, read once. */
export async function permState(db) {
  const [p, tj, cores, xs] = await Promise.all([
    db.collection('churchSettings').doc('permissions').get().then((s) => (s.exists ? s.data() : null), () => null),
    readTeamJobs(db),
    coresMap(db),
    db.collection('permissionExceptions').get().then((s) => s.docs.map((d) => d.data()), () => [])
  ]);
  return { perms: p, jobs: tj.map, set: tj.set, cores, exceptions: xs };
}

export function personOf(u) {
  const active = u && u.status === 'active';
  return { master: !!(active && u.masterAdmin === true), teams: active ? (u.teams || []) : [], adminFor: active ? (u.adminFor || []) : [],
    roles: active ? (u.roles || {}) : {}, memberId: active ? (u.memberId || '') : '' };
}

export function allowedFor(u, state, today) {
  return allowed(personOf(u), Object.assign({ today }, state));
}

/* One person: set their claim if it is not right. */
export async function syncUser({ db, auth, cid, uid, state, today }) {
  const s = await db.collection('users').doc(uid).get();
  const list = s.exists ? allowedFor(s.data(), state || await permState(db), today) : [];
  let user;
  try { user = await auth.getUser(String(uid)); } catch (e) { if (e && e.code === 'auth/user-not-found') return { skipped: 'no such account' }; throw e; }
  const key = CLAIM_KEY(cid);
  const have = ((user.customClaims || {}).perms || {})[key] || [];
  if (same(have, list)) return { unchanged: true, list };
  await auth.setCustomUserClaims(String(uid), mergedPerms(user.customClaims, key, list));
  return { written: true, list };
}

/* Everybody in this church. */
export async function syncAll({ db, auth, cid, today }) {
  const state = await permState(db);
  const snap = await db.collection('users').get();
  let written = 0;
  for (const d of snap.docs) if ((await syncUser({ db, auth, cid, uid: d.id, state, today })).written) written++;
  return { people: snap.size, written };
}

/* An exception changed: the person it names. */
export async function syncException({ db, auth, cid, before, after, today }) {
  const uids = new Set([before && before.uid, after && after.uid].filter(Boolean));
  for (const mid of new Set([before && before.memberId, after && after.memberId].filter(Boolean))) {
    const q = await db.collection('users').where('memberId', '==', mid).get();
    q.docs.forEach((d) => uids.add(d.id));
  }
  const state = await permState(db);
  for (const uid of uids) await syncUser({ db, auth, cid, uid, state, today });
  return { people: uids.size };
}

/* A users record changed: only what decides permissions matters. */
export function userChangeMatters(before, after) {
  if (!before || !after) return true;
  return ['teams', 'adminFor', 'covers', 'adminCovers', 'masterAdmin', 'status', 'memberId', 'roles']
    .some((k) => JSON.stringify(before[k] === undefined ? null : before[k]) !== JSON.stringify(after[k] === undefined ? null : after[k]));
}

/* Every morning: claims again (an end date may have passed), and a note to
   whoever added an exception that ends in a week, once. */
export async function runDaily({ db, auth, cid, today, notify }) {
  const r = await syncAll({ db, auth, cid, today });
  const snap = await db.collection('permissionExceptions').get();
  const due = ending(snap.docs.map((d) => Object.assign({ _id: d.id }, d.data())), today, 7)
    .filter((x) => !x.notedAt && x.until && daysBetween(today, x.until) === 7);
  for (const x of due) {
    if (notify && x.by) await notify({ uids: [x.by], type: 'permission', data: { name: x.name || 'Somebody', what: ((actionOf(x.action) || {}).words || x.action), until: x.until } });
    await db.collection('permissionExceptions').doc(x._id).set({ notedAt: new Date().toISOString() }, { merge: true });
  }
  return Object.assign(r, { noted: due.length });
}
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
