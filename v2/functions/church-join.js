/* =====================================================================
   A CHURCH'S PEOPLE SIGN IN (the setup frame; H-6 step 2)
   ---------------------------------------------------------------------
   At EGBC a person's users/{uid} is written by the page, from the address
   book record their verified address matches, and the rules check it
   field by field. A church's own users record is the SERVER'S to write
   (H-4), so the same two jobs happen here:

     hqJoinChurch { churchId }  someone signing in on a church's page for
       the first time. Their VERIFIED address must be on exactly one of the
       church's address book records (not archived, not a child's): then
       their membership (hqMemberships, so the sign-in carries the church),
       and churches/<id>/users/<uid> from that record. Two records on one
       address: 'ambiguous', for the office to link, as at EGBC. None: they
       are told the church doesn't have their address yet. Nothing is
       written for an address the church doesn't hold.

     the mirror (churchBookToUsers): when a church's address book record
       changes, the users record linked to it follows - teams, roles, admin,
       master admin, member, status - as the page's refreshFromBook does at
       EGBC. Only on a church's path; EGBC's pages keep doing it themselves.
       It also does recheckIdentityLater's job: a second record that now
       carries an auto-linked person's address stands them down to
       'ambiguous', for the office to decide.

     churchLinkSignIn { uid, memberId, choose }  the hub's People tab
       (link, unlink, "Wrong person?") and "Which of you is this?" - the
       page writes users/{uid} for these at EGBC, and a church's rules
       refuse every page write to it (the People-tab finding, 6 Nov 2026:
       a stopper for any church). Who may do what is EGBC's rules, field
       for field - see linkSignIn.
   ===================================================================== */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { validChurchId, MEMBERSHIP_ID, syncClaims } from './hq-directory.js';
import { churchIdOf } from './church-scope.js';

const REGION = 'europe-west2';
const RUNS = ['today', 'people', 'bookings', 'send'];

/* What one address book record says about access - egbc-auth.js's
   membershipFrom, the same fields and the same rules. */
export function membershipFrom(md) {
  const teams = Array.isArray(md.markers) ? md.markers : [];
  const adminFor = Array.isArray(md.adminFor) ? md.adminFor : [];
  const gone = md.archived === true, child = md.isMinor === true;
  const attender = !gone && !child;
  /* ROLES (member, leader...) as the People tab ticks them on the record.
     At EGBC the page writes them onto users itself; a church's users
     record is the server's, so they come across here or never. Only the
     record's own teams: a role on a team they are not on means nothing,
     and must not grant anything (leadsOrCore reads any leader role). */
  const raw = md.roles && typeof md.roles === 'object' && !Array.isArray(md.roles) ? md.roles : {};
  const roles = {};
  teams.forEach((t) => { if (typeof raw[t] === 'string') roles[t] = raw[t]; });
  return {
    teams, roles, adminFor, masterAdmin: md.masterAdmin === true, attender,
    churchMember: md.churchMember === true && !gone,
    runs: !gone && Array.isArray(md.runs) ? md.runs.filter((r) => RUNS.includes(r)) : [],
    status: (attender || teams.length || adminFor.length || md.masterAdmin === true) ? 'active' : 'pending'
  };
}

export async function join(root, { uid, email, name, cid, db }) {
  const mine = root.collection('users').doc(uid);
  const had = await mine.get();
  if (had.exists && had.data().status !== 'ambiguous') return { joined: true, already: true };
  const hits = (await root.collection('addressBook').where('email', '==', email).limit(10).get()).docs
    .filter((d) => d.data().archived !== true && d.data().isMinor !== true);
  if (!hits.length) return { joined: false, why: 'not-held' };
  const now = new Date().toISOString();
  if (hits.length > 1) {
    await mine.set({ uid, email, name, memberId: null, teams: [], status: 'ambiguous', createdAt: now,
      candidates: hits.map((d) => ({ id: d.id, name: String(d.data().name || d.data().fullName || '(no name)').trim(),
        admin: d.data().masterAdmin === true || (d.data().adminFor || []).length > 0 })) });
  } else {
    const m = hits[0];
    await mine.set(Object.assign({ uid, email, memberId: m.id, name: String(m.data().name || m.data().fullName || name || '').trim(),
      linkedBy: 'auto', createdAt: now }, membershipFrom(m.data())));
  }
  await db.collection('hqMemberships').doc(MEMBERSHIP_ID(cid, uid)).set({ churchId: cid, uid, at: now }, { merge: true });
  return { joined: true, ambiguous: hits.length > 1 };
}

export const hqJoinChurch = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const cid = String((req.data || {}).churchId || '');
  if (!validChurchId(cid)) throw new HttpsError('invalid-argument', 'Which church?');
  const t = req.auth.token || {};
  const email = String(t.email || '').trim().toLowerCase();
  /* A verified address only: an email link or Google proves it. */
  if (!email || t.email_verified !== true) throw new HttpsError('failed-precondition', 'Your address needs confirming first: sign in with the link we email you.');
  const db = getFirestore();
  const church = await db.collection('hqChurches').doc(cid).get();
  if (!church.exists || ['setup', 'active'].indexOf(church.data().status) === -1) throw new HttpsError('not-found', 'That church is not on the hub.');
  const r = await join(db.collection('churches').doc(cid), { uid: req.auth.uid, email, name: String(t.name || ''), cid, db });
  if (r.joined) await syncClaims({ db, auth: getAuth(), uid: req.auth.uid });
  return r;
});

/* The mirror: a church's address book record -> the users record linked to it. */
export const churchBookToUsers = onDocumentWritten({ document: 'churches/{cid}/addressBook/{mid}', region: REGION }, async (event) => {
  const cid = String(event.params.cid || '');
  if (!validChurchId(cid)) return;
  const root = getFirestore().collection('churches').doc(cid);
  const after = event.data.after.exists ? event.data.after.data() : { archived: true };
  const linked = await root.collection('users').where('memberId', '==', event.params.mid).limit(10).get();
  for (const u of linked.docs) {
    const next = membershipFrom(after), cur = u.data();
    const same = Object.keys(next).every((k) => JSON.stringify(cur[k]) === JSON.stringify(next[k]));
    if (!same) await u.ref.set(next, { merge: true });
  }
  await standDownShared(root, event.params.mid, after);
});

/* A SECOND RECORD ON SOMEONE'S ADDRESS (egbc-auth.js recheckIdentityLater,
   which a church's page cannot do: it writes users). A parent's address
   added to a child's record is the case. An automatic match was a guess,
   and with two records on the address it is no longer safe: the person
   goes back to 'ambiguous', and the office (or they, for a record that is
   not an admin's) decides. Links an admin or the person made are left. */
export async function standDownShared(root, mid, after) {
  const email = String(after.email || '').trim().toLowerCase();
  if (!email || after.archived === true || after.isMinor === true) return;
  const hits = (await root.collection('addressBook').where('email', '==', email).limit(10).get()).docs
    .filter((d) => d.data().archived !== true && d.data().isMinor !== true);
  if (hits.length < 2) return;
  const users = await root.collection('users').where('email', '==', email).limit(10).get();
  for (const u of users.docs) {
    const d = u.data();
    if (d.linkedBy !== 'auto' || d.status === 'ambiguous') continue;
    await u.ref.set({ status: 'ambiguous', memberId: null, teams: [], roles: {}, adminFor: [], masterAdmin: false,
      attender: false, churchMember: false, runs: [], linkedBy: FieldValue.delete(),
      candidates: hits.map((h) => ({ id: h.id, name: String(h.data().name || h.data().fullName || '(no name)').trim(),
        admin: h.data().masterAdmin === true || (h.data().adminFor || []).length > 0 })) }, { merge: true });
  }
}

/* LINK, UNLINK, OR "WHICH OF YOU IS THIS?" for a church's sign-in.
   -> { status, body }. Who may, as EGBC's users rules have it:
     - a master admin: link anyone to any record, or unlink anyone;
     - a team admin: link to a record on one of their teams that is not an
       admin's or master admin's (EGBC: adminFor must cover the new teams,
       and they may not hand on admin); they may not unlink (EGBC: their
       update must leave a team of theirs ticked, and unlinking leaves none);
     - the person themselves, when their address is shared ('ambiguous'):
       one of their own candidates, not an admin's record unless the church
       has no active admin yet (egbc-auth.js chooseIdentity's rule - at
       EGBC only the page checked it; here the server does).
   Unlinking clears every access field, not only teams: at EGBC an unlinked
   record kept a stale adminFor or masterAdmin until the next sign-in. */
export async function linkSignIn(root, { caller, uid, memberId, choose }) {
  const no = (status, error, message) => ({ status, body: { error, message } });
  if (!caller) return no(401, 'unauthenticated', 'Please sign in.');
  uid = String(uid || ''); memberId = memberId ? String(memberId) : null;
  if (!uid || uid.includes('/') || (memberId && memberId.includes('/'))) return no(400, 'invalid-argument', 'Which sign-in, and which record?');
  const meSnap = await root.collection('users').doc(caller).get();
  const me = meSnap.exists ? meSnap.data() : {};
  const target = root.collection('users').doc(uid);
  const tSnap = await target.get();
  if (!tSnap.exists) return no(404, 'not-found', 'That sign-in is not on this church\'s hub.');
  const t = tSnap.data();
  const book = memberId ? await root.collection('addressBook').doc(memberId).get() : null;
  if (memberId && !(book.exists && book.data().archived !== true)) return no(404, 'not-found', 'That address book record is not there.');
  const m = book ? book.data() : null;
  const adminRecord = (d) => d.masterAdmin === true || (Array.isArray(d.adminFor) && d.adminFor.length > 0);
  const master = me.status === 'active' && me.masterAdmin === true;
  const mine = me.status === 'active' && Array.isArray(me.adminFor) ? me.adminFor : [];

  if (choose) {
    if (uid !== caller || t.status !== 'ambiguous') return no(403, 'permission-denied', 'Only the person themselves can say which record is theirs, and only while their address is shared.');
    if (!memberId || !(t.candidates || []).some((c) => c && c.id === memberId)) return no(403, 'permission-denied', 'That record is not one of the ones on your address.');
    if (adminRecord(m)) {
      const admins = await root.collection('users').where('status', '==', 'active').get();
      if (admins.docs.some((d) => adminRecord(d.data()))) return no(403, 'permission-denied', 'An administrator needs to link this one. Ask another member of the Core Team.');
    }
  } else if (!master) {
    const theirs = m && Array.isArray(m.markers) && m.markers.some((x) => mine.includes(x));
    if (!memberId) return no(403, 'permission-denied', 'Only a master admin can unlink a sign-in.');
    if (!theirs || adminRecord(m)) return no(403, 'permission-denied', 'You can link a sign-in only to someone on a team you run, and not to an administrator\'s record.');
  }

  const email = String(t.email || '').toLowerCase();
  if (!memberId) {
    /* Unlink: off the record's sign-in list, and every access field cleared. */
    if (t.memberId) {
      const was = await root.collection('addressBook').doc(String(t.memberId)).get();
      if (was.exists && Array.isArray(was.data().signInEmails) && was.data().signInEmails.includes(email)) {
        await was.ref.update({ signInEmails: FieldValue.arrayRemove(email) });
      }
    }
    await target.set({ memberId: null, teams: [], roles: {}, adminFor: [], masterAdmin: false, attender: false,
      churchMember: false, runs: [], status: 'pending', linkedBy: FieldValue.delete() }, { merge: true });
    return { status: 200, body: { linked: false } };
  }
  if (!choose && email) await book.ref.update({ signInEmails: FieldValue.arrayUnion(email) });
  await target.set(Object.assign({ memberId, name: String(m.name || m.fullName || t.name || '').trim(),
    linkedBy: choose && !adminRecord(m) ? 'self' : 'admin', candidates: FieldValue.delete() }, membershipFrom(m)), { merge: true });
  return { status: 200, body: { linked: true } };
}

export const churchLinkSignIn = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const cid = churchIdOf(req);
  /* EGBC's pages write users themselves, and its rules check them. */
  if (!cid) throw new HttpsError('failed-precondition', 'This is for a church on the hub.');
  const d = req.data || {};
  const r = await linkSignIn(getFirestore().collection('churches').doc(cid),
    { caller: req.auth.uid, uid: d.uid, memberId: d.memberId, choose: d.choose === true });
  if (r.status !== 200) {
    const code = { 400: 'invalid-argument', 401: 'unauthenticated', 403: 'permission-denied', 404: 'not-found' }[r.status] || 'internal';
    throw new HttpsError(code, r.body.message);
  }
  return r.body;
});
