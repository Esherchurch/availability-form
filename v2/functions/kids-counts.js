/* ===================================================================
   EGBC — children's counts for the fire roll-call (F-216; Martin, 15 Oct)
   ===================================================================

   "Fire wardens also see a count of children per room for today (e.g.
   'Juniors 12 · Creche 4 · total 16'), from the kids check-ins at their
   building. Numbers only: no children's names, no details. Kids Church
   leaders keep the names."

   Every child's check-in (and check-out) writes a roll-call copy,
   kidsRoll/<checkinId>, which has the child's name - so a warden may not
   read it. This keeps a numbers-only copy beside it:

     kidsCounts/<siteId>__<day> = { siteId, day, total, updatedAt,
                                    groups: [{ groupId, name, roomId, n }] }

   counted again in full from that site's kidsRoll each time one changes
   (never added to or taken from, so it can't drift). No names, no ids
   of children, nothing else. The rules let master admins, the site's
   Kids Church leads and its fire wardens read it; nobody writes it but
   this.

     kidsCountsKeep   trigger: kidsRoll/{id} written
   =================================================================== */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west2';

/* The counts from one site's roll for one day: pure, so it can be tested
   on its own. Groups in name order; a group with nobody in is left out. */
export function countRoll(rows) {
  const by = {};
  for (const r of rows) {
    if (!r || r.state !== 'in') continue;
    const k = r.groupId || r.groupName || '-';
    by[k] = by[k] || { groupId: String(r.groupId || ''), name: String(r.groupName || 'Children'), roomId: String(r.roomId || ''), n: 0 };
    by[k].n++;
  }
  const groups = Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
  return { groups, total: groups.reduce((t, g) => t + g.n, 0) };
}

export async function recount(db, siteId, day) {
  if (!siteId || !day) return null;
  const ref = db.collection('kidsCounts').doc(siteId + '__' + day);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection('kidsRoll').where('siteId', '==', siteId).where('day', '==', day));
    const c = countRoll(snap.docs.map(d => d.data()));
    tx.set(ref, { siteId, day, groups: c.groups, total: c.total, updatedAt: new Date().toISOString() });
    return c;
  });
}

export const kidsCountsKeep = onDocumentWritten({ document: 'kidsRoll/{id}', region: REGION }, async (event) => {
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const db = getFirestore();
  const seen = {};
  for (const r of [after, before]) {
    if (!r || !r.siteId || !r.day) continue;
    const k = r.siteId + '__' + r.day;
    if (seen[k]) continue;
    seen[k] = 1;
    await recount(db, r.siteId, r.day);
  }
});
