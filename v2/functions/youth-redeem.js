/* Redeeming a youth access code, server side.
 *
 * WHY. `youthGrants/{code}` was `allow get: if true`, because
 * youth-access.html looked the code up before anybody was signed in - that
 * was how redemption worked. But the document holds `sentTo`, which is the
 * PARENT'S EMAIL ADDRESS, along with the child's name and member id. So
 * anybody holding a code - a forwarded email, a screenshot, a used code -
 * could read a parent's address off it. A-045, and Martin's second
 * follow-up.
 *
 * The phone never reads it now. It posts the code here; this checks it with
 * the Admin SDK, which does not go through the rules, and answers with a
 * custom token. `youthGrants` is shut to everything.
 *
 * NO ACCOUNT IS MADE FOR A WRONG CODE. The old page signed in anonymously
 * first and then looked the code up, so every mistyped code left a
 * disposable account behind. This creates the identity only on success,
 * which also keeps "one code, one device": a new code makes a new identity,
 * and the old device's access record is untouched until somebody revokes it.
 *
 * THE THREE REFUSALS ARE KEPT APART, unlike ChurchShow's one sentence. The
 * person holding a youth code is the person it was sent to, and "that code
 * has already been used" tells them what to do while "no" does not. It is a
 * small oracle - it says a code once existed - against 36^8, which is about
 * 2.8 trillion, on codes that are single-use anyway.
 */

import { randomBytes } from 'node:crypto';

/* Six weeks, matching WEEKS in youth-access.html. If the two ever disagree
   the function wins, because it is the one that writes the record. */
export const WEEKS = 6;
export const ACCESS_MS = WEEKS * 7 * 24 * 60 * 60 * 1000;

export const normalise = (code) =>
  String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* The page formats as XXXX-XXXX, so eight characters once the dash is out. */
export const looksLikeCode = (clean) => /^[A-Z0-9]{8}$/.test(clean);

/* AND THE DOCUMENT ID KEEPS THE DASH. makeCode() in hub-app.js stores the
   code as its own id in the dashed form - `ABCD-2345` - so stripping the dash
   to tidy the input and then looking THAT up finds nothing, however good the
   code is. The first version of this did exactly that, and every real code
   came back "we do not recognise that code" while a nonsense one gave the
   same answer for the right reason. Caught by driving the page rather than
   by calling the function. */
export const docIdFor = (clean) => clean.slice(0, 4) + '-' + clean.slice(4);

const newUid = () =>
  'youth-' + randomBytes(18).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);

/* Answers { status, body }, so the function around it stays short and this
   can be tested without one. */
export async function redeemYouthCode(db, auth, { code, nowMs }) {
  const clean = normalise(code);
  if (!looksLikeCode(clean)) {
    return { status: 400, body: { error: 'unknown',
      message: 'That does not look like a full code. It has eight characters.' } };
  }

  const ref = db.collection('youthGrants').doc(docIdFor(clean));

  /* The check and the burning in ONE transaction: two phones racing on the
     same code must not both get in. */
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: 'unknown' };

    const g = snap.data() || {};
    if (g.active === false) return { error: 'cancelled' };
    if (g.redeemedAt) return { error: 'used' };

    const uid = newUid();
    tx.update(ref, { redeemedAt: new Date(nowMs), uid });
    return {
      uid,
      memberId: g.memberId || null,
      memberName: String(g.memberName || '')
    };
  });

  if (outcome.error) {
    return { status: 400, body: {
      error: outcome.error,
      message: outcome.error === 'cancelled'
        ? 'That code has been cancelled. Ask a leader for a new one.'
        : outcome.error === 'used'
        ? 'That code has already been used. Codes work once only - ask a leader for a new one.'
        : 'We do not recognise that code. Check it against the email, or ask a leader for a new one.'
    } };
  }

  /* WHICH GROUPS THEY ARE IN, copied off their address book record here at
     redemption. The rules need it to tell a Lazers child from a ReNu one for
     the moderated pin boards; reading the address book from the rules instead
     would hand over every field of the record, because rules cannot pick
     fields out of a document.

     Only the youth groups are copied, nothing else comes with them, and if
     the office moves a child between groups the next code moves them here
     too. Read off the record, never from anything the phone sent. */
  const YOUTH_GROUPS = ['Lazers', 'ReNu', 'Youth Worship'];
  let groups = [];
  if (outcome.memberId) {
    const child = await db.collection('addressBook').doc(outcome.memberId).get();
    const markers = child.exists && Array.isArray((child.data() || {}).markers)
      ? child.data().markers : [];
    groups = markers.filter(m => YOUTH_GROUPS.indexOf(m) !== -1);
  }

  /* An account with no email address and no password, because the church does
     not hold a minor's address and there is nothing to send a reset to. The
     display name is the child's first name only - see below. */
  const firstName = outcome.memberName.split(/\s+/)[0] || 'Youth';
  await auth.createUser({ uid: outcome.uid, displayName: firstName });

  /* NO EMAIL ADDRESS, AND NO SURNAME, in anything the phone can reach.
     `sentTo` - the parent's address - stays in youthGrants, which is now shut
     to every page. */
  await db.collection('youthAccess').doc(outcome.uid).set({
    memberId: outcome.memberId,
    memberName: outcome.memberName,
    firstName,
    groups,
    grantCode: docIdFor(clean),
    redeemedAt: new Date(nowMs),
    expiresAt: new Date(nowMs + ACCESS_MS),
    active: true
  });

  const customToken = await auth.createCustomToken(outcome.uid, { youth: true });

  return { status: 200, body: { customToken, firstName } };
}
