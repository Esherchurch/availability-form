/* A NEW BUILDING GETS ITS COPY OF THE ACCOUNTS SETTING AT ONCE (H&S step
 * 3a; the reviewing window, 27 Oct 2026: "don't leave it waiting on someone
 * opening a page").
 *
 * Each building's bookings admins read their own copy, accountsFor/{siteId}
 * (F-297), never the church-wide settings/accounts. An admin's save writes
 * every copy. A building added after that had none until an admin opened
 * Room bookings, so its invoices used the defaults in the meantime. Now the
 * copy is written when the building is created, however it is created.
 * Room bookings' repair (egbc-accounts.js fillMissing) stays as a backstop.
 *
 * Only the setting's own fields are copied, as the page's copy does. With no
 * setting saved there is nothing to copy: the defaults are the answer.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

export function copyOf(acc, at) {
  return {
    mode: acc.mode || 'none',
    invoiceNumbersBy: acc.invoiceNumbersBy || 'hub',
    payText: acc.payText || '',
    payDays: Number.isInteger(acc.payDays) ? acc.payDays : 14,
    updatedAt: at
  };
}

/* Returns what it decided, for the checks. Never overwrites a copy that is
   already there (an admin's save may have written it first). */
export async function onSiteCreated(db, siteId, now = new Date()) {
  const s = await db.collection('settings').doc('accounts').get();
  if (!s.exists) return { skipped: 'no Accounts setting saved' };
  const ref = db.collection('accountsFor').doc(siteId);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return { skipped: 'already has its copy' };
    tx.set(ref, copyOf(s.data() || {}, now.toISOString()));
    return { written: true };
  });
}

/* The triggers, for EGBC's top level and every church (index.js twins). */
export const makeAccountsTriggers = (twins) => ({
  site: twins(onDocumentCreated, 'sites/{siteId}', async (ch, event) => onSiteCreated(ch.db, event.params.siteId))
});
