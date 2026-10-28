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
import { churchDb, forCaller } from './church-context.js';

const REGION = 'europe-west2';
/* The caller's own church (church-context.js): each callable says which. */
const db = () => churchDb();

/* What each kind of email is called, for people. */
const WHAT = {
  signup: 'Sign-up confirmation', 'booking waiting': 'Booking: waiting for approval', 'booking request': 'Booking request to the office',
  'cancel ask': 'Booking: asked to cancel', 'form received': 'Form received', 'group ask': 'Asked to join a small group', 'group ask leaders': 'Small group: leaders told', 'new here': 'Someone new said hello',
  'checklist tomorrow': 'Checklist: due tomorrow', 'checklist overdue': 'Checklist: overdue',
  'calendar link': 'Calendar link (to themselves)',
  'regular gift set up': 'Regular gift: set up', 'regular gift changed': 'Regular gift: changed',
  'team email': 'Team email', 'team email copy': 'Team email: copy to the team'
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
      what: whatOf(r) + (r.asTeam ? ': ' + String(r.asTeam).slice(0, 60) : ''), by: r.asTeam ? String(r.sentBy || '').slice(0, 120) + ' (as the ' + String(r.asTeam).slice(0, 60) + ' team)' : '', source: String(r.source || ''), ok: r.ok === true, error: String(r.error || '').slice(0, 300), test: r.stubbed === true };
  });
}

export const commsReport = onCall({ region: REGION }, forCaller(async (req) => {
  const uid = req.auth && req.auth.uid;
  const u = uid ? await db().collection('users').doc(uid).get() : null;
  const d = u && u.exists ? u.data() : null;
  const admin = !!(d && d.status === 'active' && d.masterAdmin === true);
  if (!admin) throw new HttpsError('permission-denied', 'The list of emails sent is for master admins.'); // Martin, 15 Oct 2026: who was sent what, master admins only
  return { rows: await report({ from: String(req.data && req.data.from || ''), to: String(req.data && req.data.to || '') }) };
}));

/* ---- "My messages" (R6; ChurchSuite's My Communication; F-206) --------
   What the church's server has emailed ME: the outline only (when, what
   kind, subject, whether it went), for the signed-in person's own
   addresses, and nobody else's. Never the email itself (some carry
   private links), never who else it went to. The last 12 months.

     myMessages   callable, signed in -> { rows: [{ at, what, subject, ok }] } */
export function mineOf(rows, addresses) {
  const mine = addresses.map((a) => String(a || '').trim().toLowerCase()).filter(Boolean);
  return rows.filter((r) => (Array.isArray(r.to) ? r.to : []).some((t) => mine.includes(String(t || '').trim().toLowerCase())))
    .map((r) => ({ at: r.at || '', what: whatOf(r), subject: String(r.subject || '').slice(0, 200), ok: r.ok === true }));
}
export const myMessages = onCall({ region: REGION }, forCaller(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const u = await db().collection('users').doc(uid).get();
  const d = u.exists ? u.data() : null;
  if (!d || d.status !== 'active') throw new HttpsError('permission-denied', 'Your account is not active.');
  /* Their own addresses: the one they sign in with (if their email
     provider confirmed it), and the one on their record. */
  const t = req.auth.token || {};
  const addresses = [t.email_verified ? t.email : '', d.email].filter(Boolean);
  if (!addresses.length) return { rows: [] };
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const snap = await db().collection('emailOutbox').where('at', '>=', since).orderBy('at', 'desc').limit(5000).get();
  return { rows: mineOf(snap.docs.map((x) => x.data()), addresses).slice(0, 300) };
}));
