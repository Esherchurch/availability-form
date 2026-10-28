/* The nightly orphan check. The tidying after a delete (data-links.js) can
   be missed - a deploy, an outage, a delete made before the map knew about a
   link - so every night each church's records are checked against the joined
   data map (data-map.json): a record whose linked record is gone gets the
   rule the map gives it, and the counts are kept in orphanSweeps/<date> for
   the weekly live check. The number should be 0.

   A church's FIRST sweep only counts: years of data may hold old orphans,
   and somebody should read that first report before anything is changed.
   Every later night fixes. "archive" and "block" links are only counted:
   the record pointed at is never meant to be deleted, so a missing one is
   a mistake for a person to look at, not something to tidy. */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { eachChurch } from './church-scope.js';
import { MAP, valueAt } from './data-links.js';

const PAGE = 500;
const GET_ALL = 100;
/* A map mistake (a wrong field name) would make every record look like an
   orphan; past this share nothing is changed and the link is reported. */
const TOO_MANY = 0.5;

/** Every link in the map, as [{ child, link }]. @param {object} [map] */
export function everyLink(map = MAP) {
  return Object.entries(map).flatMap(([child, c]) => (c.links || []).map((link) => ({ child, link })));
}

/** The key a link is marked under in parentGone, as data-links.js marks it. @param {string} field */
const goneKey = (field) => (field.startsWith('$') ? field.slice(1) : field.replace(/\./g, '_'));

/**
 * Which of these ids exist in a collection, remembered across links.
 * @param {object} db a church's database @param {string} to @param {string[]} ids @param {Map<string, boolean>} known
 */
async function existing(db, to, ids, known) {
  const want = [...new Set(ids)].filter((id) => id && !id.includes('/') && !known.has(to + '/' + id));
  for (let i = 0; i < want.length; i += GET_ALL) {
    const snaps = await db.getAll(...want.slice(i, i + GET_ALL).map((id) => db.collection(to).doc(id)));
    snaps.forEach((s, j) => known.set(to + '/' + want[i + j], s.exists));
  }
}

/** The parent ids one record's link holds. @param {object} d a snapshot @param {object} link */
function idsOf(d, link) {
  if (link.field === '$id') return [d.id];
  if (link.field === '$idPrefix') return [d.id.split('_')[0]];
  const v = valueAt(d.data() || {}, link.field);
  return [].concat(v == null ? [] : v).filter((x) => typeof x === 'string' && x);
}

/**
 * The records of a subcollection whose parent record is gone ($parent links).
 * listDocuments also returns parents that no longer exist but still hold
 * records, which is exactly what is being looked for.
 */
async function* subcollectionOrphans(db, child) {
  const [parent, , sub] = child.split('/');
  const refs = await db.collection(parent).listDocuments();
  for (let i = 0; i < refs.length; i += GET_ALL) {
    const part = refs.slice(i, i + GET_ALL);
    const snaps = await db.getAll(...part);
    for (let j = 0; j < part.length; j++) {
      if (snaps[j].exists) continue;
      const s = await part[j].collection(sub).get();
      if (!s.empty) yield s.docs;
    }
  }
}

/**
 * Checks one link across a whole collection, and fixes what its rule says.
 * @returns {Promise<{ link: string, rule: string, checked: number, orphans: number, fixed: number, held?: boolean }>}
 */
export async function sweepLink({ db, child, link, known, dryRun = false }) {
  const out = { link: child + '.' + link.field + ' -> ' + link.to, rule: link.rule, checked: 0, orphans: 0, fixed: 0 };
  const found = [];
  if (link.field === '$parent') {
    for await (const docs of subcollectionOrphans(db, child)) { out.orphans += docs.length; out.checked += docs.length; found.push(...docs.map((d) => ({ d, gone: '' }))); }
  } else {
    for (let last = null; ;) {
      let q = db.collection(child).orderBy(FieldPath.documentId()).limit(PAGE);
      if (last) q = q.startAfter(last);
      const s = await q.get();
      if (s.empty) break;
      await existing(db, link.to, s.docs.flatMap((d) => idsOf(d, link)), known);
      for (const d of s.docs) {
        const ids = idsOf(d, link);
        if (!ids.length) continue;
        out.checked++;
        const gone = ids.filter((id) => known.get(link.to + '/' + id) === false);
        if (gone.length) { out.orphans++; found.push({ d, gone: gone[0] }); }
      }
      if (s.size < PAGE) break;
      last = s.docs[s.size - 1];
    }
  }
  if (!found.length || dryRun || !['cascade', 'keep-history'].includes(link.rule) || link.array) return out;
  if (out.checked >= 20 && out.orphans > out.checked * TOO_MANY) { out.held = true; return out; }
  const writer = db.bulkWriter();
  const at = new Date().toISOString(), key = goneKey(link.field);
  for (const { d } of found) {
    if (link.rule === 'cascade') { writer.delete(d.ref); out.fixed++; }
    else if (!((d.data() || {}).parentGone || {})[key]) { writer.set(d.ref, { parentGone: { [key]: { at, name: '', from: link.to } } }, { merge: true }); out.fixed++; }
  }
  await writer.close();
  return out;
}

/**
 * Sweeps every mapped link for one church and keeps the counts.
 * @param {{ db: object, now?: Date, map?: object }} p
 * @returns {Promise<{ dryRun: boolean, orphans: number, fixed: number, links: object[] }>}
 */
export async function sweepChurch({ db, now = new Date(), map = MAP }) {
  const known = new Map();
  const dryRun = (await db.collection('orphanSweeps').limit(1).get()).empty;
  const links = [];
  for (const { child, link } of everyLink(map)) {
    try { links.push(await sweepLink({ db, child, link, known, dryRun })); }
    catch (e) { links.push({ link: child + '.' + link.field + ' -> ' + link.to, error: String(e.message || e) }); }
  }
  const found = links.filter((l) => l.orphans || l.error || l.held);
  const sum = { dryRun, orphans: found.reduce((n, l) => n + (l.orphans || 0), 0), fixed: found.reduce((n, l) => n + (l.fixed || 0), 0), links: found };
  await db.collection('orphanSweeps').doc(now.toISOString().slice(0, 10)).set(Object.assign({ at: now.toISOString() }, sum));
  return sum;
}

export const orphanSweep = onSchedule({ region: 'europe-west2', schedule: '15 3 * * *', timeZone: 'Europe/London', timeoutSeconds: 540, memory: '512MiB', retryCount: 0 }, async () => {
  const out = await eachChurch(getFirestore(), ({ db }) => sweepChurch({ db }));
  /* Counts only, by church: never a person's details in the logs. */
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([c, r]) => [c, r && r.error ? r : { dryRun: r.dryRun, orphans: r.orphans, fixed: r.fixed }]))));
});
