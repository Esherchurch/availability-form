/* ===================================================================
   WHO MAY EMAIL WHOM (Martin, 16 Oct 2026, any church)
   ===================================================================

   The Email Compiler (EmailBuilder2.html) used to post straight from the
   browser to the send service, so nothing on the server asked who was
   sending to whom. It now sends through compilerSend, which decides:

     - the church office (the Church office group) and master admins:
       anyone;
     - a team leader (adminFor a team): the people on THEIR teams, as the
       address book has them (markers), and themselves (the test email);
     - anybody else: nobody.

   Every email it sends is written to emailOutbox by makeSender (who, when,
   to whom, the subject), so it shows in "Emails sent" and the sender's "My
   messages" - the server log F-206 asked for.

   decide() is pure, so tests ask it directly (tests/check-compiler-send.mjs);
   the callable only gathers what it needs and asks it.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';
import { makeSender } from './public-mail.js';

const REGION = 'europe-west2';
const MAX_TO = 50;

const low = (e) => String(e || '').trim().toLowerCase();

/* user: users/{uid}. book: the address book records the leader's teams
   reach ({email, markers}). to: the addresses asked for. */
export function decide(user, book, to) {
  if (!user || user.status !== 'active') return { ok: false, why: 'not signed in to the church' };
  const all = user.masterAdmin === true || (user.teams || []).includes('Church office');
  const mine = Array.isArray(user.adminFor) ? user.adminFor : [];
  const list = (Array.isArray(to) ? to : [to]).map(low).filter(Boolean);
  if (!list.length) return { ok: false, why: 'nobody to send to' };
  if (list.length > MAX_TO) return { ok: false, why: 'at most ' + MAX_TO + ' addresses at once' };
  if (list.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { ok: false, why: 'an address is not an email address' };
  if (all) return { ok: true, to: list };
  if (!mine.length) return { ok: false, why: 'only team leaders and the church office send emails' };
  const allowed = new Set([low(user.email)]);
  (book || []).forEach((m) => { if ((m.markers || []).some((t) => mine.includes(t)) && m.email) allowed.add(low(m.email)); });
  const refused = list.filter((e) => !allowed.has(e));
  if (refused.length) return { ok: false, why: 'not on your team: ' + refused.join(', '), refused };
  return { ok: true, to: list };
}

export const compilerSend = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  /* The church from the sign-in (H-5); EGBC's top level without a claim. */
  const db = churchOf(req, getFirestore()).db;
  const u = await db.collection('users').doc(req.auth.uid).get();
  const user = u.exists ? u.data() : null;
  const d = req.data || {};
  /* The people a leader may reach: address book records on their teams.
     array-contains-any takes up to 30 values - far more teams than anybody
     leads. */
  let book = [];
  const mine = (user && Array.isArray(user.adminFor) ? user.adminFor : []).slice(0, 30);
  const all = !!user && (user.masterAdmin === true || (user.teams || []).includes('Church office'));
  if (user && !all && mine.length) {
    const s = await db.collection('addressBook').where('markers', 'array-contains-any', mine).get();
    book = s.docs.map((x) => x.data()).filter((m) => m.archived !== true);
  }
  const verdict = decide(user, book, d.to);
  if (!verdict.ok) throw new HttpsError('permission-denied', verdict.why);
  const subject = String(d.subject || '').slice(0, 300);
  const html = String(d.html || '').slice(0, 400000);
  if (!subject) throw new HttpsError('invalid-argument', 'The email needs a subject.');
  const send = makeSender({ db });
  const out = await send({ to: verdict.to, subject, html, replyTo: String(d.replyTo || '').slice(0, 200) },
    { source: 'emailCompiler', by: req.auth.uid, byName: String((user && user.name) || '') });
  if (!out.ok) throw new HttpsError('unavailable', 'It did not send: ' + (out.error || 'unknown'));
  return { ok: true, stubbed: !!out.stubbed };
});
