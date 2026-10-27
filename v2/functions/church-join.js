/* =====================================================================
   A CHURCH'S PEOPLE SIGN IN (the setup frame; H-6 step 2)
   ---------------------------------------------------------------------
   At EGBC a person's users/{uid} is written by the page, from the address
   book record their verified address matches, and the rules check it
   field by field. A church's own users record is the SERVER'S to write
   (H-4), so the same two jobs happen here:

     hqJoinChurch { churchId }  someone signing in on a church's page for
       the first time. Their VERIFIED address must be on exactly one of the
       church's address book records (not archived, not a child's): then
       their membership (hqMemberships, so the sign-in carries the church),
       and churches/<id>/users/<uid> from that record. Two records on one
       address: 'ambiguous', for the office to link, as at EGBC. None: they
       are told the church doesn't have their address yet. Nothing is
       written for an address the church doesn't hold.

     the mirror (churchBookToUsers): when a church's address book record
       changes, the users record linked to it follows - teams, admin,
       master admin, member, status - as the page's refreshFromBook does at
       EGBC. Only on a church's path; EGBC's pages keep doing it themselves.
   ===================================================================== */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { validChurchId, MEMBERSHIP_ID, syncClaims } from './hq-directory.js';

const REGION = 'europe-west2';
const RUNS = ['today', 'people', 'bookings', 'send'];

/* What one address book record says about access - egbc-auth.js's
   membershipFrom, the same fields and the same rules. */
export function membershipFrom(md) {
  const teams = Array.isArray(md.markers) ? md.markers : [];
  const adminFor = Array.isArray(md.adminFor) ? md.adminFor : [];
  const gone = md.archived === true, child = md.isMinor === true;
  const attender = !gone && !child;
  return {
    teams, adminFor, masterAdmin: md.masterAdmin === true, attender,
    churchMember: md.churchMember === true && !gone,
    runs: !gone && Array.isArray(md.runs) ? md.runs.filter((r) => RUNS.includes(r)) : [],
    status: (attender || teams.length || adminFor.length || md.masterAdmin === true) ? 'active' : 'pending'
  };
}

export async function join(root, { uid, email, name, cid, db }) {
  const mine = root.collection('users').doc(uid);
  const had = await mine.get();
  if (had.exists && had.data().status !== 'ambiguous') return { joined: true, already: true };
  const hits = (await root.collection('addressBook').where('email', '==', email).limit(10).get()).docs
    .filter((d) => d.data().archived !== true && d.data().isMinor !== true);
  if (!hits.length) return { joined: false, why: 'not-held' };
  const now = new Date().toISOString();
  if (hits.length > 1) {
    await mine.set({ uid, email, name, memberId: null, teams: [], status: 'ambiguous', createdAt: now,
      candidates: hits.map((d) => ({ id: d.id, name: String(d.data().name || d.data().fullName || '(no name)').trim(),
        admin: d.data().masterAdmin === true || (d.data().adminFor || []).length > 0 })) });
  } else {
    const m = hits[0];
    await mine.set(Object.assign({ uid, email, memberId: m.id, name: String(m.data().name || m.data().fullName || name || '').trim(),
      linkedBy: 'auto', createdAt: now }, membershipFrom(m.data())));
  }
  await db.collection('hqMemberships').doc(MEMBERSHIP_ID(cid, uid)).set({ churchId: cid, uid, at: now }, { merge: true });
  return { joined: true, ambiguous: hits.length > 1 };
}

export const hqJoinChurch = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const cid = String((req.data || {}).churchId || '');
  if (!validChurchId(cid)) throw new HttpsError('invalid-argument', 'Which church?');
  const t = req.auth.token || {};
  const email = String(t.email || '').trim().toLowerCase();
  /* A verified address only: an email link or Google proves it. */
  if (!email || t.email_verified !== true) throw new HttpsError('failed-precondition', 'Your address needs confirming first: sign in with the link we email you.');
  const db = getFirestore();
  const church = await db.collection('hqChurches').doc(cid).get();
  if (!church.exists || ['setup', 'active'].indexOf(church.data().status) === -1) throw new HttpsError('not-found', 'That church is not on the hub.');
  const r = await join(db.collection('churches').doc(cid), { uid: req.auth.uid, email, name: String(t.name || ''), cid, db });
  if (r.joined) await syncClaims({ db, auth: getAuth(), uid: req.auth.uid });
  return r;
});

/* The mirror: a church's address book record -> the users record linked to it. */
export const churchBookToUsers = onDocumentWritten({ document: 'churches/{cid}/addressBook/{mid}', region: REGION }, async (event) => {
  const cid = String(event.params.cid || '');
  if (!validChurchId(cid)) return;
  const root = getFirestore().collection('churches').doc(cid);
  const after = event.data.after.exists ? event.data.after.data() : { archived: true };
  const linked = await root.collection('users').where('memberId', '==', event.params.mid).limit(10).get();
  for (const u of linked.docs) {
    const next = membershipFrom(after), cur = u.data();
    const same = Object.keys(next).every((k) => JSON.stringify(cur[k]) === JSON.stringify(next[k]));
    if (!same) await u.ref.set(next, { merge: true });
  }
});
