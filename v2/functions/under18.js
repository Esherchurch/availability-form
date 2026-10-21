/* ===================================================================
   Under 18: never emailed (HANDOVER-MAIN rule 7; YOUTH-ACCESS.md, Martin:
   "No email addresses for under-18s, ever"). The reviewing window, 20 Oct:
   "no emails to anyone under 18, not under 16 - never offered, never
   added, never sent".

   An address-book record is under 18 when it is ticked "Under 16"
   (isMinor, which is under 18 too) or "Under 18" (under18). The one
   place this is decided for the server: the e-news (adding, sending), the
   Mailchimp import and the hub's mail route all ask here.

   A CHILD OFTEN HAS A PARENT'S ADDRESS (reviewing window, 21 Oct 2026:
   Martin's son is in the address book with Martin's address, and Martin's
   own "Send me a test" was refused). So:
     - an ADDRESS is an under-18's only when EVERY address-book record
       holding it is under 18 - no adult shares it (under18Emails);
     - a chosen PERSON (an address-book record) who is under 18 is never
       sent to, whatever their address (isUnder18Record) - the same
       address held by an adult still gets that adult's own emails.
   =================================================================== */

export const isUnder18Record = x => !!x && (x.isMinor === true || x.under18 === true);

const low = e => String(e || '').trim().toLowerCase();

/* Every address held ONLY by under-18s in the address book, lower case.
   (Read through the whole book, so an address typed with capitals still
   counts, and an adult with the same address is seen.) */
export async function under18Emails(db) {
  const s = await db.collection('addressBook').get();
  const minor = new Map();          // address -> true while every record with it is under 18
  s.docs.forEach(d => {
    const x = d.data() || {}, e = low(x.email);
    if (!e) return;
    const u = isUnder18Record(x);
    minor.set(e, minor.has(e) ? (minor.get(e) && u) : u);
  });
  const out = new Set();
  minor.forEach((u, e) => { if (u) out.add(e); });
  return out;
}

/* One address: is it held only by under-18s? */
export async function isUnder18Email(db, email) {
  const e = low(email); if (!e) return false;
  return (await under18Emails(db)).has(e);
}
