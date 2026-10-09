/* Pairing the projection PC to the hub.
 *
 * WHY. ChurchShow reads `services`, `songs`, `songSummaries` and `events`
 * through the Firestore REST API with the web key and no sign-in at all. It
 * works today only because those collections were open; they are shut now
 * (PRIVACY-OPEN-COLLECTIONS.md, and the songSummaries rule that never
 * existed), so the projection PC needs an identity of its own or Sunday's
 * screens go blank at switch-over.
 *
 * R1-R3 of C:\Users\marti\churchshow\FINDINGS-churchshow.md, built to the
 * wire contract written there on 9 October 2026. The ChurchShow side is
 * already built against it, so the shapes below are fixed:
 *
 *   churchShowPairingCode  onCall, an admin presses "Make pairing code"
 *                          -> { code, expiresAt }
 *   churchShowRedeem       onRequest, public, ChurchShow posts the code
 *                          -> 200 { customToken, siteId, siteName }
 *                          -> 400 { error: "<one plain sentence>" }
 *   churchShowDisconnect   onCall, an admin switches the site off
 *
 * ONE IDENTITY PER SITE, not per computer: `churchshow-<siteId>`. The main
 * and the spare projection PC at one site both sign in as the same device, so
 * pairing again does not break the other one. Disconnect switches off the
 * whole site, which is what you want if a laptop goes missing.
 *
 * THE PLAIN CODE IS NEVER STORED. `deviceCodes` is keyed by its sha256, so a
 * leak of that collection - which is shut to everything but the Admin SDK
 * anyway - hands over nothing that can be redeemed.
 *
 * AND THE DEVICE DOCUMENT IS WHAT MAKES DISCONNECT IMMEDIATE. Revoking a
 * refresh token stops the device RENEWING, but an ID token already issued
 * stays good for up to an hour. churchShow() in firestore.rules reads
 * devices/{uid}.active on every request, so Disconnect takes effect at once
 * rather than some time before the end of the service.
 */

import { createHash, randomInt } from 'node:crypto';

/* No I, L, O, 0 or 1: an operator is typing this off a screen across a hall.
   31 characters, 8 of them, is about 850 billion - and a code lives fifteen
   minutes, so guessing is not a route in. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const CODE_LIFE_MS = 15 * 60 * 1000;

/* THERE IS NO "FIVE FAILED TRIES" LIMIT, and the ChurchShow window's F-CS3
   is right that the one I wrote could never have fired:

   - a wrong code hashes to a different document, so there is nothing to count
     it against
   - the only place tries was ever incremented was a SUCCESSFUL redemption,
     and a used code is refused by usedAt anyway

   So it was a check that read as protection and gave none. What actually
   protects this is the fifteen-minute life, 31^8 (about 850 billion) and
   maxInstances - all of which are real. The field is still written as 0, so
   nothing reading the document has to change. */

/* One sentence, the same one, for every way of being wrong. ChurchShow shows
   it to the operator exactly as it arrives, so it has to read as something a
   person can act on - and it must never say WHICH way the code was wrong,
   because that is the difference between "no" and a hint. */
export const REFUSAL = "That code isn't valid or has run out \u2014 make a new one on the hub.";

/* R7, requested by the ChurchShow window after testing against the real
   functions: A SERVER FAULT MUST NOT READ AS A BAD CODE.

   The one that will actually happen is the IAM step - a v2 function cannot
   sign a custom token until its runtime service account has Service Account
   Token Creator on itself. Without it createCustomToken throws, and the old
   code turned that into "That code isn't valid or has run out", so an
   operator would have made code after code, each one refused, with nothing
   anywhere saying the problem was at our end. ChurchShow shows any `error`
   sentence as it arrives, so this is the whole fix. */
export const SETUP_FAILED = "The hub couldn't finish connecting ChurchShow \u2014 "
  + "ask the hub admin to check the server setup (SERVER-DEPLOY.md).";

export const uidFor = (siteId) => 'churchshow-' + String(siteId);
export const hashCode = (code) => createHash('sha256').update('egbc-churchshow:' + code).digest('hex');

/* Upper case, and nothing that is not in the alphabet. ChurchShow normalises
   before sending; this does it again because a human may be typing into curl. */
export const normalise = (code) =>
  String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function makeCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/* Who may pair and unpair: a master admin, or somebody who administers the
   AV or Worship team. Read off users/{uid}, exactly as the rules read it, so
   there is one answer to "is this person an admin" and not two. */
export async function mayPair(db, uid) {
  if (!uid) return false;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return false;
  const u = snap.data() || {};
  if (u.status !== 'active') return false;
  if (u.masterAdmin === true) return true;
  const adminFor = Array.isArray(u.adminFor) ? u.adminFor : [];
  return adminFor.includes('AV Team') || adminFor.includes('Worship Team');
}

/* ------------------------------------------------- R1: make a code ----- */

export async function pairingCode(db, auth, { uid, siteId, nowMs }) {
  if (!await mayPair(db, uid)) {
    return { error: 'permission-denied', message: 'Only an AV or Worship admin can connect ChurchShow.' };
  }

  const id = String(siteId || '').trim();
  if (!id) return { error: 'invalid-argument', message: 'Which site is the screen in?' };
  const site = await db.collection('sites').doc(id).get();
  if (!site.exists) return { error: 'not-found', message: 'There is no site with that id.' };
  const siteName = String((site.data() || {}).name || id);

  const deviceUid = uidFor(id);
  const claims = { device: 'churchshow', siteId: id };

  /* The Auth user, once per site. Created with no email and no password: it
     is a computer, and there is nobody to send a reset to. */
  try {
    await auth.getUser(deviceUid);
    await auth.setCustomUserClaims(deviceUid, claims);
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') {
      await auth.createUser({ uid: deviceUid, displayName: 'ChurchShow \u2013 ' + siteName });
      await auth.setCustomUserClaims(deviceUid, claims);
    } else {
      throw e;
    }
  }

  /* Merged, not replaced: re-pairing the spare computer keeps the date the
     site was FIRST connected as well as the latest, which is the question
     somebody actually asks ("how long has that PC been on this?"). Read
     first, because a merge would overwrite firstPairedAt every time. */
  const existing = await db.collection('devices').doc(deviceUid).get();
  const firstPairedAt = (existing.exists && (existing.data() || {}).firstPairedAt)
    || new Date(nowMs);
  await db.collection('devices').doc(deviceUid).set({
    kind: 'churchshow',
    siteId: id,
    siteName,
    active: true,
    pairedBy: uid,
    pairedAt: new Date(nowMs),
    firstPairedAt
  }, { merge: true });

  const code = makeCode();
  const expiresAt = new Date(nowMs + CODE_LIFE_MS);
  await db.collection('deviceCodes').doc(hashCode(code)).set({
    uid: deviceUid, siteId: id, siteName,
    expiresAt, usedAt: null, tries: 0,
    createdBy: uid, createdAt: new Date(nowMs)
  });

  /* The code goes back to the admin's screen and nowhere else. It is not
     stored, not logged and not emailed. */
  return { code, expiresAt: expiresAt.toISOString(), siteId: id, siteName };
}

/* ------------------------------------------------- R2: redeem it ------- */

/* Answers { status, body } so the function around it stays four lines and
   this can be tested without one. */
export async function redeem(db, auth, { code, nowMs }) {
  const clean = normalise(code);
  if (clean.length !== CODE_LENGTH) return { status: 400, body: { error: REFUSAL } };

  const ref = db.collection('deviceCodes').doc(hashCode(clean));

  /* The whole check and the marking in ONE transaction, or two projection
     PCs racing on the same code both get a token. */
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { no: true };

    const d = snap.data() || {};
    const expires = d.expiresAt && d.expiresAt.toMillis ? d.expiresAt.toMillis() : 0;

    if (d.usedAt) return { no: true };
    if (!expires || expires < nowMs) return { no: true };

    tx.update(ref, { usedAt: new Date(nowMs) });
    return { uid: d.uid, siteId: d.siteId, siteName: d.siteName || d.siteId };
  });

  if (outcome.no) return { status: 400, body: { error: REFUSAL } };

  /* Switched off on the hub since the code was made. Same sentence: the
     operator's next step is the same either way - ask for a new one. */
  const dev = await db.collection('devices').doc(outcome.uid).get();
  if (!dev.exists || (dev.data() || {}).active !== true) {
    return { status: 400, body: { error: REFUSAL } };
  }

  /* CAUGHT HERE, not in the function wrapper, so it can be tested without
     one - and so the code has already been marked used by the transaction
     above. That is deliberate: a code that got as far as signing has been
     spent, and handing the same one back after a server fault would be
     telling the operator to retry something that cannot now work. They need
     a new code once the setup is fixed, which is what the sentence says. */
  let customToken;
  try {
    customToken = await auth.createCustomToken(outcome.uid, {
      device: 'churchshow', siteId: outcome.siteId
    });
  } catch (e) {
    console.error('[churchShowRedeem] could not sign a custom token \u2014 '
      + 'is Service Account Token Creator granted? ', e);
    return { status: 500, body: { error: SETUP_FAILED } };
  }

  return {
    status: 200,
    body: { customToken, siteId: outcome.siteId, siteName: outcome.siteName }
  };
}

/* ------------------------------------------------- R3: disconnect ------ */

export async function disconnect(db, auth, { uid, siteId }) {
  if (!await mayPair(db, uid)) {
    return { error: 'permission-denied', message: 'Only an AV or Worship admin can disconnect ChurchShow.' };
  }
  const id = String(siteId || '').trim();
  if (!id) return { error: 'invalid-argument', message: 'Which site?' };

  const deviceUid = uidFor(id);
  const dev = await db.collection('devices').doc(deviceUid).get();
  if (!dev.exists) return { error: 'not-found', message: 'Nothing is connected for that site.' };

  /* The document first, because that is what takes effect immediately: the
     rules read it on every request. Revoking the refresh token stops it
     renewing in an hour's time, which matters for tomorrow and not for now. */
  await db.collection('devices').doc(deviceUid).set(
    { active: false, disconnectedBy: uid, disconnectedAt: new Date() }, { merge: true });

  try { await auth.revokeRefreshTokens(deviceUid); }
  catch (e) { if (!e || e.code !== 'auth/user-not-found') throw e; }

  /* Any code made for this site and not yet used is now worthless; tidying
     them up means a code found on a screenshot cannot be tried later. */
  const codes = await db.collection('deviceCodes')
    .where('uid', '==', deviceUid).where('usedAt', '==', null).get();
  for (const c of codes.docs) await c.ref.delete();

  return { ok: true, codesCleared: codes.size };
}
