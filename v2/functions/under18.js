/* ===================================================================
   Under 18: never emailed (HANDOVER-MAIN rule 7; YOUTH-ACCESS.md, Martin:
   "No email addresses for under-18s, ever"). The reviewing window, 20 Oct:
   "no emails to anyone under 18, not under 16 - never offered, never
   added, never sent".

   An address-book record is under 18 when it is ticked "Under 16"
   (isMinor, which is under 18 too) or "Under 18" (under18). The one
   place this is decided for the server: the e-news (adding, sending), the
   Mailchimp import and the hub's mail route all ask here.
   =================================================================== */

export const isUnder18Record = x => !!x && (x.isMinor === true || x.under18 === true);

const low = e => String(e || '').trim().toLowerCase();

/* Every under-18 address in the address book, lower case. */
export async function under18Emails(db) {
  const book = db.collection('addressBook');
  const [a, b] = await Promise.all([book.where('isMinor', '==', true).get(), book.where('under18', '==', true).get()]);
  const out = new Set();
  a.docs.concat(b.docs).forEach(d => { const e = low(d.data().email); if (e) out.add(e); });
  return out;
}

/* One address: is it an under-18's? (Read through the whole list, so an
   address typed with capitals in the address book still counts.) */
export async function isUnder18Email(db, email) {
  const e = low(email); if (!e) return false;
  return (await under18Emails(db)).has(e);
}
