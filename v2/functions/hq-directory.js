/* ===================================================================
   Church HQ for more than one church - step 1: the directory and the
   sign-in's claims (design-mocks/multi-church/PLAN.md; Martin chose B,
   22 Oct 2026). NO DATA IS MOVED by this step.
   ===================================================================

   hqChurches/{churchId}
     The one place that knows each church: { name, domain, group, status,
     createdAt }. `group` is the project it lives in - 'main' for every
     church now; a "group of one" later is a church pointed at another.
     Written by the server and Church HQ's own scripts only.

   hqMemberships/{churchId}_{uid}
     { churchId, uid, at } - this person belongs to this church. Written by
     the server only (a church's office adds people through the hub; that
     callable comes with step 2's paths).

   THE CLAIM: every membership written or removed recomputes the person's
   custom claim  churches: [ids]  from their memberships, MERGED with the
   claims they already carry (a ChurchShow computer has device/siteId/jobs;
   nothing here may drop them). Step 2's rules start every path under
   churches/{cid} with "cid in request.auth.token.churches".

   A claim reaches the page at its next token (within the hour, or at once
   after getIdToken(true)); EGBCAuth.churches() reads it.

   churchesFor() and mergedClaims() are pure, so checks ask them directly.
   =================================================================== */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const REGION = 'europe-west2';
export const MEMBERSHIP_ID = (churchId, uid) => String(churchId) + '_' + String(uid);
const CHURCH_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const validChurchId = (id) => CHURCH_ID.test(String(id || ''));

/* Every church this uid belongs to, sorted, from the memberships. */
export async function churchesFor(db, uid) {
  const s = await db.collection('hqMemberships').where('uid', '==', String(uid)).get();
  return [...new Set(s.docs.map((d) => d.data().churchId).filter(validChurchId))].sort();
}

/* The person's claims with `churches` replaced, everything else kept. An
   empty list removes the key rather than leaving churches: []. */
export function mergedClaims(existing, churches) {
  const out = Object.assign({}, existing || {});
  if (churches && churches.length) out.churches = churches.slice();
  else delete out.churches;
  return out;
}

export async function syncClaims({ db, auth, uid }) {
  const churches = await churchesFor(db, uid);
  let user;
  try { user = await auth.getUser(String(uid)); }
  catch (e) { if (e && e.code === 'auth/user-not-found') return { skipped: 'no such account' }; throw e; }
  const next = mergedClaims(user.customClaims, churches);
  await auth.setCustomUserClaims(String(uid), next);
  return { churches };
}

export const hqMembershipClaims = onDocumentWritten({ document: 'hqMemberships/{id}', region: REGION }, async (event) => {
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  const uid = (after && after.uid) || (before && before.uid);
  if (!uid) return;
  await syncClaims({ db: getFirestore(), auth: getAuth(), uid });
});

/* The churches I belong to, from the directory - for a church picker. Only
   the ones in my own claims; nothing about anybody else's. */
export const hqMyChurches = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ids = Array.isArray(req.auth.token.churches) ? req.auth.token.churches.filter(validChurchId) : [];
  const db = getFirestore();
  const docs = await Promise.all(ids.map((id) => db.collection('hqChurches').doc(id).get()));
  return { churches: docs.filter((d) => d.exists).map((d) => ({ id: d.id, name: String(d.data().name || ''), domain: String(d.data().domain || '') })) };
});
