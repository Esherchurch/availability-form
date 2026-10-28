/* RECORDS THAT LINK TO OTHER RECORDS: the server carries out the data map.
 *
 * Firestore has no foreign keys, so a deleted record leaves behind whatever
 * pointed at it. data-map.json (built from v2/data-map/*.json) says, for
 * each link, what happens then, and this file does it, on the server,
 * because a page can close half-way through:
 *
 *   tidyAfterDelete-<parent>   when a record is deleted: cascade deletes its
 *                              children, keep-history marks them
 *                              parentGone.<field> = { at, name }. Safe to
 *                              run twice. One for EGBC's top level and one
 *                              (<parent>Church) for every church.
 *   holdParent-<child>         when a record that "blocks" its parent is
 *                              written: the parent gets heldBy += the word
 *                              (payments, safeguarding...). The rules refuse
 *                              to delete a record with heldBy, and the page
 *                              says why.
 *   removeCheck                callable: what stops a record being deleted
 *                              or taken out of use, for the page to show.
 *   takeOutOfUse               callable: takes a room or building out of
 *                              use, unless something blocks it.
 *
 * Legal records (safeguarding, health and safety, accident, finance) never
 * cascade: tools/data-map-build.mjs refuses such a map.
 */
import { readFileSync } from 'node:fs';
import { onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { churchOf, churchFromPath } from './church-scope.js';

const REGION = 'europe-west2';
const PAGE = 500;
const db = () => getFirestore();

/** The joined data map: { collectionName: entry }. */
export const MAP = JSON.parse(readFileSync(new URL('./data-map.json', import.meta.url), 'utf8')).collections;

/** Every link pointing at a collection, as [{ child, link }]. @param {object} map @param {string} parent */
export function linksTo(map, parent) {
  const out = [];
  for (const [child, c] of Object.entries(map)) for (const link of c.links || []) if (link.to === parent) out.push({ child, link });
  return out;
}

/** A dotted field's value ('location.siteId'). @param {object} o @param {string} field */
export const valueAt = (o, field) => String(field).split('.').reduce((x, k) => (x == null ? x : x[k]), o);

/** London's date as YYYY-MM-DD. @param {Date} [at] */
export function londonDay(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Whether a child counts for a link's "only" (which children block). @param {object|undefined} only @param {object} d @param {string} today */
export function counts(only, d, today) {
  for (const [field, want] of Object.entries(only || {})) {
    const v = valueAt(d, field);
    if (Array.isArray(want)) { if (!want.includes(v)) return false; }
    else if (want === 'not-false') { if (v === false) return false; }
    else if (want === 'today-or-later') { if (!(String(v || '') >= today)) return false; }
    else if (v !== want) return false;
  }
  return true;
}

/** The name kept on a child when its parent goes. @param {object|null} p */
const nameOf = (p) => String((p && (p.title || p.name)) || '').slice(0, 200);

/** The key a link is marked under in parentGone. @param {string} field */
const goneKey = (field) => (field.startsWith('$') ? field.slice(1) : field.replace(/\./g, '_'));

/** Every child of one parent for one link, page by page. parent is the parent's collection path, its own ids filled in for a subcollection. @returns {AsyncGenerator<FirebaseFirestore.QueryDocumentSnapshot>} */
async function* childrenOf(dbi, parent, id, child, link) {
  let q;
  if (link.field === '$parent') q = dbi.collection(parent).doc(id).collection(child.split('/').pop());
  else if (link.field === '$id') { const s = await dbi.collection(child).doc(id).get(); if (s.exists) yield s; return; }
  else if (link.field === '$idPrefix') q = dbi.collection(child).where(FieldPath.documentId(), '>=', id + '_').where(FieldPath.documentId(), '<', id + '_');
  else q = dbi.collection(child).where(link.field, link.array ? 'array-contains' : '==', id);
  q = q.orderBy(FieldPath.documentId()).limit(PAGE);
  for (let last = null; ;) {
    const s = await (last ? q.startAfter(last) : q).get();
    for (const d of s.docs) yield d;
    if (s.size < PAGE) return;
    last = s.docs[s.size - 1];
  }
}

/* A booking still to come is cancelled and its quarter-hours given back,
   as the page's cancel does (egbc-events-bookings.js): a confirmed booking
   holds its time on each room of its footprint (the room, or its parts). */
async function freeBooking(dbi, ref, today, note) {
  await dbi.runTransaction(async (tx) => {
    const s = await tx.get(ref), b = s.exists ? s.data() : null;
    if (!b || !['confirmed', 'requested'].includes(b.status) || !(String(b.day || '') >= today)) return;
    const days = [];
    if (b.status === 'confirmed' && b.roomId) {
      const room = (await tx.get(dbi.collection('rooms').doc(b.roomId))).data() || {};
      const foot = Array.isArray(room.parts) && room.parts.length ? room.parts.slice(0, 4) : [b.roomId];
      for (const rid of foot) days.push(await tx.get(dbi.collection('roomDays').doc(rid + '_' + b.day)));
    }
    for (const d of days) {
      if (!d.exists) continue;
      const slots = (d.data().slots || []).slice();
      for (let i = b.slotFrom || 0; i < (b.slotTo || 0); i++) slots[i] = Math.max(0, (slots[i] || 0) - 1);
      tx.update(d.ref, { slots });
    }
    tx.update(ref, { status: 'cancelled', cancelledAt: new Date().toISOString(), decidedBy: '', decidedByName: 'The hub', decisionNote: note });
  });
}
const THEN = { freeBooking };

/**
 * Carries out the data map for one deleted record. Safe to run twice.
 * @param {object} dbi the church's db (scopedDb) @param {string} parent @param {string} id @param {object|null} before the deleted record
 * @param {object} [map] @param {string} [path] the parent's real collection path, for a subcollection (churchMeetings/m1/votes)
 * @returns {Promise<object>} what was done, by child collection
 */
export async function tidyChildren(dbi, parent, id, before, map = MAP, path = parent) {
  const done = {}, today = londonDay(), at = new Date().toISOString(), name = nameOf(before);
  for (const { child, link } of linksTo(map, parent)) {
    if (link.rule === 'archive') continue;
    const writer = dbi.bulkWriter();
    /* a child with subcollections of its own in the map takes them with it */
    const deep = link.rule === 'cascade' && Object.keys(map).some((k) => k.startsWith(child + '/*/'));
    let n = 0;
    for await (const d of childrenOf(dbi, path, id, child, link)) {
      /* a cascade's "only" says which children go; the rest stay as they are */
      if (link.rule === 'cascade' && link.only && !counts(link.only, d.data(), today)) continue;
      if (link.then && THEN[link.then]) await THEN[link.then](dbi, d.ref, today, 'The event was deleted.');
      if (deep) await db().recursiveDelete(d.ref);
      else if (link.rule === 'cascade') writer.delete(d.ref);
      else writer.set(d.ref, { parentGone: { [goneKey(link.field)]: { at, name, from: parent } } }, { merge: true });
      n++;
    }
    await writer.close();
    if (n) done[child] = (link.rule === 'cascade' ? 'deleted ' : 'kept ') + n;
    if (n && link.rule === 'block') console.warn('data-links: ' + parent + '/' + id + ' was deleted with ' + n + ' ' + child + ' holding it; kept as history.');
  }
  return done;
}

/**
 * Marks the parents a record holds (block links with a "holds" word).
 * @param {object} dbi @param {string} child @param {object|null} d the record as written
 */
export async function holdParents(dbi, child, d, map = MAP) {
  if (!d) return [];
  const today = londonDay(), held = [];
  for (const link of (map[child] && map[child].links) || []) {
    if (link.rule !== 'block' || !link.holds || !counts(link.only, d, today)) continue;
    const ids = link.field === '$id' ? [d.__id] : [].concat(valueAt(d, link.field) || []);
    for (const pid of ids.filter((x) => typeof x === 'string' && x)) {
      const ref = dbi.collection(link.to).doc(pid);
      await ref.update({ heldBy: FieldValue.arrayUnion(link.holds) }).then(() => held.push(link.to + '/' + pid), () => {});
    }
  }
  return held;
}

/**
 * What stops one record being deleted or taken out of use.
 * @param {object} dbi @param {string} parent @param {string} id
 * @returns {Promise<Array<{collection: string, count: number, why: string}>>}
 */
export async function blockersOf(dbi, parent, id, map = MAP) {
  const out = [], today = londonDay();
  for (const { child, link } of linksTo(map, parent)) {
    if (link.rule !== 'block') continue;
    let n = 0;
    for await (const d of childrenOf(dbi, parent, id, child, link)) if (counts(link.only, d.data(), today) && ++n >= PAGE) break;
    if (n) out.push({ collection: child, count: n, why: link.why });
  }
  return out;
}

/* One trigger pair per parent the map tidies, and per child that holds a
   parent: grouped exports, deployed as tidyAfterDelete-<name> and
   holdParent-<name>. */
const pairs = (names, on, make) => Object.fromEntries(names.flatMap((name) => {
  const path = name.replace(/\/\*\//g, '/{p}/') + '/{id}';
  return [[name.replace(/\W/g, '_'), on({ document: path, region: REGION }, make(name))],
    [name.replace(/\W/g, '_') + 'Church', on({ document: 'churches/{cid}/' + path, region: REGION }, make(name))]];
}));
const PARENTS = [...new Set(Object.values(MAP).flatMap((c) => (c.links || [])
  .filter((l) => l.rule !== 'archive').map((l) => l.to)))].filter((p) => MAP[p]).sort();
const HOLDERS = Object.keys(MAP).filter((c) => (MAP[c].links || []).some((l) => l.rule === 'block' && l.holds)).sort();

export const tidyAfterDelete = pairs(PARENTS, onDocumentDeleted, (parent) => async (event) => {
  const ch = churchFromPath(event, db());
  const done = await tidyChildren(ch.db, parent, event.params.id, event.data ? event.data.data() : null, MAP, parent.replace('/*/', '/' + event.params.p + '/'));
  if (Object.keys(done).length) console.log('data-links: ' + (ch.id || 'egbc') + ' ' + parent + '/' + event.params.id, done);
});
export const holdParent = pairs(HOLDERS, onDocumentWritten, (child) => async (event) => {
  const after = event.data && event.data.after.exists ? Object.assign({ __id: event.params.id }, event.data.after.data()) : null;
  await holdParents(churchFromPath(event, db()).db, child, after);
});

/* The caller must be an active member of the church; only admins take
   rooms and buildings out of use, as the rules say for any other change. */
async function caller(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const ch = churchOf(request, db());
  const u = (await ch.db.collection('users').doc(request.auth.uid).get()).data() || {};
  if (u.status !== 'active') throw new HttpsError('permission-denied', 'Only the church\'s members can ask.');
  return { ch, admin: u.masterAdmin === true || (Array.isArray(u.adminFor) && u.adminFor.length > 0) };
}
const ask = (request) => {
  const c = String((request.data && request.data.collection) || ''), id = String((request.data && request.data.id) || '');
  if (!MAP[c] || !/^[\w-]{1,200}$/.test(id)) throw new HttpsError('invalid-argument', 'Which record?');
  return { c, id };
};

export const removeCheck = onCall({ region: REGION }, async (request) => {
  const { c, id } = ask(request), { ch } = await caller(request);
  const blockers = await blockersOf(ch.db, c, id);
  return { ok: !blockers.length, blockers };
});

export const takeOutOfUse = onCall({ region: REGION }, async (request) => {
  const { c, id } = ask(request), { ch, admin } = await caller(request);
  if (!['rooms', 'sites'].includes(c)) throw new HttpsError('invalid-argument', 'Only rooms and buildings are taken out of use here.');
  if (!admin) throw new HttpsError('permission-denied', 'Only an admin can take it out of use.');
  const blockers = await blockersOf(ch.db, c, id);
  if (blockers.length) return { ok: false, blockers };
  await ch.db.collection(c).doc(id).update({ active: false });
  return { ok: true, blockers: [] };
});
