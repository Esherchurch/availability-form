/* WHICH CHURCH A CODE OR LINK BELONGS TO (multi-church step 3, H-5).
 *
 * Codes and links that arrive with no sign-in - a ChurchShow pairing code,
 * a youth code, a calendar feed key, a meeting papers link - each have a
 * document in the church's own data. Nothing in the request can say which
 * church, and the request must not be trusted to. So when a CHURCH makes
 * one, the server also writes hqCodes/{kind}_{hash} = { churchId } at the
 * top level, server-only (no rule opens it). The public endpoint looks the
 * code up there first.
 *
 * No entry means EGBC: every code made before this, and every code EGBC
 * makes now, keeps working exactly as it did. Only a hash is stored here,
 * never the code.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { scopedDb } from './church-scope.js';
import { validChurchId } from './hq-directory.js';

/* stripe, gocardless: the checkouts, payments, subscriptions and mandates a
   church's own account makes, so their webhooks find the church.
   enews: an e-news subscriber's confirm and unsubscribe links; canva: a
   church's Canva sign-in on its way back (comms window, batch 8). */
export const KINDS = ['churchshow', 'youth', 'feed', 'papers', 'enews', 'canva', 'stripe', 'gocardless'];
export const codeHash = (s) => createHash('sha256').update('hq-code:' + String(s)).digest('hex');
const ref = (root, kind, hash) => {
  if (!KINDS.includes(kind)) throw new Error('Not a kind of code: ' + kind);
  if (!/^[0-9a-f]{64}$/.test(String(hash))) throw new Error('Not a hash');
  return root.collection('hqCodes').doc(kind + '_' + hash);
};

/* After a church writes a code into its own data. db is the scoped db the
   code was written with: EGBC's (no churchId) needs no entry. */
export async function indexCode(db, kind, hash, extra) {
  const churchId = db && db.churchId;
  if (!churchId) return false;
  await ref(getFirestore(), kind, hash).set(Object.assign({ churchId, kind, at: new Date() }, extra || {}));
  return true;
}

/* When a church's code is withdrawn. */
export async function dropCode(db, kind, hash) {
  if (!db || !db.churchId) return false;
  await ref(getFirestore(), kind, hash).delete();
  return true;
}

/* The church a code belongs to, or null for EGBC. */
export async function churchForCode(root, kind, hash) {
  const s = await ref(root, kind, hash).get();
  const id = s.exists ? String((s.data() || {}).churchId || '') : '';
  return id && validChurchId(id) ? id : null;
}

/* The db a public endpoint should use for this code. */
export async function dbForCode(root, kind, hash) {
  return scopedDb(root, await churchForCode(root, kind, hash));
}
