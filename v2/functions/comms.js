/* ===================================================================
   EGBC — every email the church sent, and the ones that failed (R8)
   ===================================================================

   ChurchSuite's "Communication" and "Email errors" reports, across the
   whole church rather than one event at a time. The server's own emails
   (sign-up confirmations, bookings, forms, reminders...) are kept in
   emailOutbox, which no page may read: a row holds the whole email, and
   some carry private links. So this function hands an admin the outline
   only - when, who to, what it was, and whether it went - never the email.

     commsReport   callable, admins: { from, to } (yyyy-mm-dd, London) -> rows

   The emails pages send themselves (an event's "Email everyone", a
   cancellation) are in commsLog, which admins read directly; comms.html
   puts the two together.

   The events window's file. Exported from index.js.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west2';
const db = () => getFirestore();

/* What each kind of email is called, for people. */
const WHAT = {
  signup: 'Sign-up confirmation', 'booking waiting': 'Booking: waiting for approval', 'booking request': 'Booking request to the office',
  'cancel ask': 'Booking: asked to cancel', 'form received': 'Form received', 'group ask': 'Asked to join a small group', 'group ask leaders': 'Small group: leaders told', 'new here': 'Someone new said hello',
  'checklist tomorrow': 'Checklist: due tomorrow', 'checklist overdue': 'Checklist: overdue'
};
export function whatOf(row) {
  const k = String(row.kind || '').trim();
  return WHAT[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : (row.source ? String(row.source) : 'Email'));
}

export async function report({ from, to }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) throw new HttpsError('invalid-argument', 'Give the dates as yyyy-mm-dd.');
  const snap = await db().collection('emailOutbox').where('at', '>=', from).where('at', '<=', to + 'T23:59:59.999Z').orderBy('at', 'desc').limit(3000).get();
  return snap.docs.map((d) => {
    const r = d.data();
    /* The outline only: never the email itself, its attachments or links. */
    return { at: r.at || '', to: Array.isArray(r.to) ? r.to.slice(0, 50) : [], subject: String(r.subject || '').slice(0, 200),
      what: whatOf(r), source: String(r.source || ''), ok: r.ok === true, error: String(r.error || '').slice(0, 300), test: r.stubbed === true };
  });
}

export const commsReport = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  const u = uid ? await db().collection('users').doc(uid).get() : null;
  const d = u && u.exists ? u.data() : null;
  const admin = !!(d && d.status === 'active' && (d.masterAdmin === true || (d.adminFor || []).length > 0));
  if (!admin) throw new HttpsError('permission-denied', 'The list of emails sent is for admins.');
  return { rows: await report({ from: String(req.data && req.data.from || ''), to: String(req.data && req.data.to || '') }) };
});
