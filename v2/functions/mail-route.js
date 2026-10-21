/* ===================================================================
   How the hub's emails go: Church HQ's own Resend, always (comms window;
   FINDINGS-comms C-20, C-28; Martin, 21 Oct 2026: "v2 doesn't use Calla
   at all")
   ===================================================================

   Every email v2 sends goes through Church HQ's Resend, from now - not
   from going live. Calla's sendEmail is not used, not even as a fallback:
   if Resend fails, that email is not sent and emailOutbox says why.

   THE KEY: Google Secret Manager, HQ_RESEND_API_KEY (resend-secrets.js).
   Never the database, a page or a chat.

   THE PROTECTIONS, kept on this side:
     - known recipients only (KNOWN_SOURCES, compared ignoring case); an
       unknown address is refused;
     - no under-18 address, ever (HANDOVER-MAIN rule 7): ticked Under 16
       or Under 18 in the address book (under18.js);
     - an hourly cap: 2,000 recipients an hour across every instance (one
       counter document per hour, reserved in a transaction);
     - outlineOnly (a Safeguarding team's email): the outbox keeps when,
       who and the subject, never the email (public-mail.js makeSender).
   From: "<the church's name from Church settings>" <hub@mail.churchhq.co.uk>.
   Reply-To: the address the sender chose, else the church's enquiry email.
   Nothing about any one church is written here.
   =================================================================== */

export { resendKey } from './resend-secrets.js';
import { fromFor } from './hq-mail.js';
import { under18Emails } from './under18.js';

/* Who the hub may email: an address in one of these places. Taken from
   Calla's sendEmail's list when the route was built (19 Oct 2026), and
   the hub's own now. */
export const KNOWN_SOURCES = [
  ['addressBook', 'email'],
  ['users', 'email'],
  ['contacts', 'email'],
  ['signups', 'email'],
  ['smallGroupRequests', 'email'],
  /* A small group's members (Message the group, invitations; the main
     window's PLAN-hub-send, 21 Oct). */
  ['smallGroupMembers', 'email'],
  /* A child's parents (kidsFamilies): "call the parent" emails the one with
     no phone (notify.js callParent). Main window, 21 Oct 2026, when sendOne
     moved onto makeSender; Calla's path never asked. */
  ['kidsFamilies', 'email'],
  ['kidsFamilies', 'email2'],
  ['formRequests', 'email'],
  ['bookings', 'requester.email'],
  ['hirers', 'email'],
  ['charges', 'payer.email'],
  ['invoices', 'payer.email'],
  ['sites', 'bookingsEmail'],
  ['churchSettings', 'enquiryEmail'],
  ['churchSettings', 'bookingsEmail'],
  ['welcomeSettings', 'notifyEmail'],
  ['careRouting', 'care.email'],
  ['careRouting', 'pastoral.email'],
  ['careRouting', 'prayer.email']
];
export const HOURLY_RECIPIENTS = 2000;
const API = 'https://api.resend.com/emails';

const low = a => String(a || '').trim().toLowerCase();
const at = (o, dotted) => dotted.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);


/* Known recipients and no under-18s: read every source into memory,
   lowercased (Firestore can't ignore case). Church-sized. */
export async function checkRecipients(db, to) {
  const want = to.map(low);
  const known = new Set();
  await Promise.all(KNOWN_SOURCES.map(([c, f]) => db.collection(c).get().then(s => s.docs.forEach(d => {
    const v = at(d.data(), f);
    if (typeof v === 'string' && v.trim()) known.add(low(v));
  }))));
  const unknown = want.filter(a => !known.has(a));
  if (unknown.length) return { refused: 'Recipient not known to the hub (' + unknown.length + ')' };
  /* Ticked Under 16 or Under 18 in the address book (under18.js). */
  const minors = await under18Emails(db);
  if (want.some(a => minors.has(a))) return { refused: 'An under-18 address: the hub never emails under-18s' };
  return { ok: true };
}

/* The hourly cap, across every instance: one counter per hour. */
export async function reserve(db, count, now = new Date()) {
  const hour = now.toISOString().slice(0, 13);
  const ref = db.collection('mailRouteHours').doc(hour);
  return db.runTransaction(async tx => {
    const d = await tx.get(ref);
    const used = d.exists ? Number(d.data().recipients || 0) : 0;
    if (used + count > HOURLY_RECIPIENTS) return false;
    tx.set(ref, { recipients: used + count, hour }, { merge: true });
    return true;
  });
}

/* Resend, for the hub's emails. Returns { ok, id } or { ok:false, error }. */
export async function sendViaResend({ db, key, msg, fetchFn }) {
  const details = await db.collection('churchSettings').doc('details').get();
  const church = details.exists ? details.data() : {};
  const body = {
    from: fromFor(church.name, 'hub'),
    to: msg.to, subject: String(msg.subject || '').slice(0, 300), html: String(msg.html || '')
  };
  const reply = msg.replyTo || church.enquiryEmail || '';
  if (reply) body.reply_to = reply;
  if (msg.attachments && msg.attachments.length) {
    body.attachments = msg.attachments.map(a => ({ filename: a.filename, content: a.content, content_type: a.type || a.contentType || undefined }));
  }
  try {
    const r = await (fetchFn || fetch)(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return r.ok && j && j.id ? { ok: true, id: j.id, from: body.from } : { ok: false, error: (j && (j.message || j.name)) || ('HTTP ' + r.status) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
