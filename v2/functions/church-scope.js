/* WHICH CHURCH A CALL IS FOR (multi-church step 3, FINDINGS-churchhq H-5).
 *
 * The church comes from the sign-in's `churches` claim (set by the server,
 * hq-directory.js) or, for a trigger, from the document's path - never from
 * anything else the page sends. A page may NAME one of its own churches
 * (data.churchId) when the person is in more than one; naming any other is
 * refused.
 *
 * No claim at all - everybody at EGBC today - means EGBC's top-level data,
 * exactly as before. So nothing EGBC-facing changes until EGBC moves in.
 *
 * What a function gets back is a stand-in for `db`: .collection('news') is
 * churches/{id}/news for a church and the top-level news for EGBC. A
 * function that already takes `db` is moved by handing it `ch.db` instead,
 * and everything it reads or writes then stays inside that church.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { validChurchId } from './hq-directory.js';

/* The churches in a verified sign-in, or null when it has none. */
export function claimedChurches(auth) {
  const c = auth && auth.token && auth.token.churches;
  return Array.isArray(c) ? c.filter((x) => typeof x === 'string' && validChurchId(x)) : null;
}

/* The church id for a call, or null for EGBC's top-level data. Throws. */
export function churchIdOf(request) {
  const claimed = claimedChurches(request && request.auth);
  const asked = request && request.data && request.data.churchId;
  if (asked !== undefined && asked !== null && asked !== '') {
    if (!claimed || !claimed.includes(String(asked))) {
      throw new HttpsError('permission-denied', 'That church is not one of yours.');
    }
    return String(asked);
  }
  if (!claimed || !claimed.length) return null;
  if (claimed.length === 1) return claimed[0];
  throw new HttpsError('invalid-argument', 'You are in more than one church: say which.');
}

/* A `db` that stays inside one church. Paths given to .doc() are relative
   to the church ('users/u1'). Batches, transactions and getAll are the real
   database's: the references handed to them already carry the church. A
   collection group would reach every church, so it is refused here - query
   the church's own collection instead. */
export function scopedDb(db, churchId) {
  if (!churchId) return db;
  if (!validChurchId(churchId)) throw new Error('Not a church id: ' + churchId);
  const root = db.collection('churches').doc(churchId);
  return {
    churchId,
    collection: (name) => root.collection(name),
    doc: (p) => db.doc('churches/' + churchId + '/' + String(p).replace(/^\/+/, '')),
    batch: () => db.batch(),
    bulkWriter: (o) => db.bulkWriter(o),
    runTransaction: (fn, o) => db.runTransaction(fn, o),
    getAll: (...refs) => db.getAll(...refs),
    collectionGroup: () => { throw new Error('collectionGroup reaches every church; use the church\'s own collection.'); }
  };
}

/* For a callable: { id, legacy, db }. id is null for EGBC. */
export function churchOf(request, db) {
  const id = churchIdOf(request);
  return { id, legacy: !id, db: scopedDb(db, id) };
}

/* For a trigger: the church from the document's path. A trigger on
   'churches/{cid}/news/{id}' has params.cid; one on 'news/{id}' is EGBC's. */
export function churchFromPath(event, db) {
  const id = event && event.params && event.params.cid ? String(event.params.cid) : null;
  if (id && !validChurchId(id)) throw new Error('Not a church id in the path: ' + id);
  return { id, legacy: !id, db: scopedDb(db, id) };
}

/* For a scheduled job: EGBC first (its top-level data, as today), then each
   active church in the directory, one at a time. One church failing is
   logged and the rest carry on; then, if any failed, the run fails, so the
   job's own retry works as it always did. Returns what each run returned,
   by church. */
export async function eachChurch(db, fn, log) {
  const out = {};
  const failed = [];
  const run = async (id) => {
    try { out[id || 'egbc'] = await fn({ id, legacy: !id, db: scopedDb(db, id) }); }
    catch (e) { failed.push(id || 'egbc'); out[id || 'egbc'] = { error: String(e && e.message || e) }; (log || console.error)('church ' + (id || 'egbc') + ':', e); }
  };
  await run(null);
  const snap = await db.collection('hqChurches').where('status', '==', 'active').get();
  for (const d of snap.docs) if (validChurchId(d.id)) await run(d.id);
  if (failed.length) throw new Error('Failed for ' + failed.join(', ') + ' (the others ran)');
  return out;
}
