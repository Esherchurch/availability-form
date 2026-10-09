/* The public availability form's only way in.
 *
 * WHY THIS EXISTS. index.html has no sign-in, by decision: somebody on the
 * Kids Church rota who has never signed in to anything is emailed a link and
 * fills it in. To make that work, firestore.rules had `allow read: if true`
 * on addressBook and on events, and an open create on availability. That gave
 * anyone on the internet every name, email address, telephone number and
 * household in the church, every service with its assignments - who is
 * serving, by name - and the ability to write an answer for any member id
 * they had seen. See PRIVACY-OPEN-COLLECTIONS.md; Martin chose Option A.
 *
 * So the form now asks three questions through here, and the Admin SDK reads
 * the collections on its behalf. The Admin SDK does not go through the rules,
 * so the rules can be shut.
 *
 *   findMe(email)                    the people on that address, and a token
 *   myDates(token, memberId)         their dates, and their previous answers
 *   saveAnswer(token, memberId, ...) one answer
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT HAND OVER, because they are what
 * the open rules were giving away and the form never used:
 *   - no telephone number, no address, no household, no email
 *   - no event assignments, no service leader, no speaker
 *   - no list: there is no call that returns more than one person's data, and
 *     no way to ask for everybody
 *
 * THE TOKEN IS THE POINT OF THE OTHER TWO CALLS. If myDates and saveAnswer
 * took a bare member id, anyone who had been given one - and findMe hands one
 * out - could read that person's answers and write answers as them. The token
 * is issued by findMe, names the ids that address matched, lives two hours and
 * is stored where only the Admin SDK can read it. An answer can therefore only
 * be written by somebody who proved they can receive mail at that address.
 *
 * WHAT IT STILL DOES NOT FIX, stated plainly: findMe is an oracle. Anyone may
 * type an address and learn whether that person is in this church's address
 * book, and their name. The rate limit below is what turns that from "download
 * the lot" into "guess one address at a time, slowly".
 */

import { createHash, randomBytes } from 'node:crypto';

/* Twenty lookups an hour from one connection. A volunteer uses one. A
   household sharing a wifi connection on a Sunday afternoon might use five.
   Somebody working through a list of addresses needs thousands. */
export const FIND_LIMIT = 20;
export const WINDOW_MS = 60 * 60 * 1000;

/* Long enough to fill the form in, including being interrupted, short enough
   that a token found in a browser history later is no use. */
export const SESSION_MS = 2 * 60 * 60 * 1000;

/* The two answers the form's buttons write, and nothing else. */
export const STATUSES = ['avail', 'not-avail'];

/* The fields the form is allowed to learn about a person, and about a date.
   Written out rather than deleted-from, so a new field added to the address
   book or to an event is private by default and nobody has to remember. */
const PERSON_FIELDS = ['id', 'name', 'markers'];
const EVENT_FIELDS = ['id', 'date', 'startTime', 'endTime', 'type', 'description', 'termLabel'];

const pick = (src, keys) => {
  const out = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
};

export const newToken = () =>
  randomBytes(24).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 32);

/* The counter is keyed by a hash, never by the address itself: the collection
   would otherwise be a log of which connections have used the form. */
export const ipKey = (ip) =>
  createHash('sha256').update('egbc-availability-form:' + String(ip || 'unknown')).digest('hex').slice(0, 32);

/* The first address in x-forwarded-for is the caller; the rest are proxies.
   Cloud Run appends its own, so never take the last. */
export function callerIp(rawRequest) {
  const h = (rawRequest && rawRequest.headers) || {};
  const fwd = h['x-forwarded-for'] || h['X-Forwarded-For'] || '';
  const first = String(fwd).split(',')[0].trim();
  return first || (rawRequest && rawRequest.ip) || 'unknown';
}

/* One window per connection, counted in a transaction so twenty requests
   arriving together cannot each read "nineteen" and all be allowed. Returns
   { allowed, count }. Over the limit it does not write, so a flood costs one
   read rather than one write each. */
export async function checkRate(db, ip, nowMs) {
  const ref = db.collection('formRateLimit').doc(ipKey(ip));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : null;
    const startedAt = d && d.windowStart ? Number(d.windowStart) : 0;
    const fresh = !d || (nowMs - startedAt) >= WINDOW_MS;
    const count = fresh ? 1 : Number(d.count || 0) + 1;

    if (count > FIND_LIMIT) return { allowed: false, count: Number(d.count || 0) };

    tx.set(ref, {
      count,
      windowStart: fresh ? nowMs : startedAt,
      lastSeen: nowMs,
      /* So an admin clearing these out can see which are stale without
         needing to know how the window works. */
      expiresAt: new Date((fresh ? nowMs : startedAt) + WINDOW_MS)
    });
    return { allowed: true, count };
  });
}

/* ---------------------------------------------------------- findMe ----- */

export async function findMe(db, { email, ip, nowMs }) {
  const e = String(email || '').toLowerCase().trim();
  if (!e || e.length > 200 || e.indexOf('@') < 1) {
    return { error: 'invalid-argument', message: 'Enter the email address the church holds for you.' };
  }

  const rate = await checkRate(db, ip, nowMs);
  if (!rate.allowed) {
    return {
      error: 'resource-exhausted',
      message: 'Too many lookups from this connection. Please try again in an hour, '
             + 'or ask the church office to send you your link.'
    };
  }

  /* Both the primary address and any extra sign-in address the office has
     linked, the same two lookups egbc-auth.js does, so somebody whose Gmail
     is on their record is not told they do not exist. */
  const [byEmail, bySignIn] = await Promise.all([
    db.collection('addressBook').where('email', '==', e).get(),
    db.collection('addressBook').where('signInEmails', 'array-contains', e).get()
  ]);

  const seen = Object.create(null);
  const people = [];
  for (const snap of [byEmail, bySignIn]) {
    for (const doc of snap.docs) {
      if (seen[doc.id]) continue;
      seen[doc.id] = true;
      const md = doc.data() || {};
      /* Somebody who has left is not asked when they can serve. */
      if (md.archived === true) continue;
      people.push(pick({
        id: doc.id,
        name: String(md.name || md.fullName || '').trim(),
        markers: Array.isArray(md.markers) ? md.markers : []
      }, PERSON_FIELDS));
    }
  }

  /* No token for nobody: an unknown address must cost the same as a known one
     in everything except the answer, and must leave nothing behind. */
  if (!people.length) return { people: [] };

  const token = newToken();
  await db.collection('formSessions').doc(token).set({
    memberIds: people.map(p => p.id),
    createdAt: nowMs,
    expiresAt: new Date(nowMs + SESSION_MS)
  });

  return { token, people };
}

/* ------------------------------------------------------- the session --- */

/* Proves this caller may act for this member id. Everything after findMe
   goes through here, and it is the whole of "an answer cannot be written for
   somebody else". */
export async function openSession(db, { token, memberId, nowMs }) {
  const t = String(token || '').trim();
  const id = String(memberId || '').trim();
  if (!t || !id) return { error: 'invalid-argument', message: 'Start again from the form.' };

  const snap = await db.collection('formSessions').doc(t).get();
  if (!snap.exists) return { error: 'permission-denied', message: 'That form session has expired. Please enter your email address again.' };

  const d = snap.data() || {};
  const expires = d.expiresAt && d.expiresAt.toMillis ? d.expiresAt.toMillis() : 0;
  if (!expires || expires < nowMs) {
    return { error: 'permission-denied', message: 'That form session has expired. Please enter your email address again.' };
  }
  if (!Array.isArray(d.memberIds) || d.memberIds.indexOf(id) === -1) {
    return { error: 'permission-denied', message: 'That form session is not for that person.' };
  }
  return { memberIds: d.memberIds };
}

/* --------------------------------------------------------- myDates ----- */

export async function myDates(db, { token, memberId, nowMs }) {
  const s = await openSession(db, { token, memberId, nowMs });
  if (s.error) return s;

  /* Read the record again rather than trusting the teams the page sends
     back: which dates a person is shown is decided here. */
  const person = await db.collection('addressBook').doc(String(memberId)).get();
  if (!person.exists) return { error: 'not-found', message: 'That record is no longer in the address book.' };
  const markers = Array.isArray(person.data().markers) ? person.data().markers : [];

  const snap = await db.collection('events').orderBy('date').get();
  const events = [];
  for (const doc of snap.docs) {
    const ev = doc.data() || {};
    if (ev.archived === true) continue;
    const teams = Array.isArray(ev.teams) ? ev.teams : [];
    /* The same relevance test the page used to make, moved in here so that
       nothing about a date for another team ever leaves the server. 'Youth'
       on an event means the Youth Worship marker on a person. */
    const relevant = teams.length === 0
      || teams.some(t => markers.indexOf(t) !== -1)
      || (teams.indexOf('Youth') !== -1 && markers.indexOf('Youth Worship') !== -1);
    if (!relevant) continue;
    events.push(pick({ id: doc.id, ...ev }, EVENT_FIELDS));
  }

  /* Their own previous answers. The page has never been able to show these -
     the rules refused the read and the form coped by drawing the dates blank
     - so this is the one thing the change gives back. */
  const mine = await db.collection('availability').where('memberId', '==', String(memberId)).get();
  const answers = {};
  for (const doc of mine.docs) {
    const a = doc.data() || {};
    if (a.eventId) answers[a.eventId] = a.status;
  }

  return { events, answers };
}

/* ------------------------------------------------------ saveAnswer ----- */

export async function saveAnswer(db, { token, memberId, eventId, status, nowMs }) {
  const s = await openSession(db, { token, memberId, nowMs });
  if (s.error) return s;

  const id = String(memberId);
  const ev = String(eventId || '').trim();
  if (!ev) return { error: 'invalid-argument', message: 'Which date?' };
  if (STATUSES.indexOf(status) === -1) {
    return { error: 'invalid-argument', message: 'An answer is either available or not available.' };
  }

  /* An answer has to be about a real date, or the collection is free storage
     for anything that finds the function. */
  const event = await db.collection('events').doc(ev).get();
  if (!event.exists) return { error: 'not-found', message: 'That date is no longer in the rota.' };

  const person = await db.collection('addressBook').doc(id).get();
  if (!person.exists) return { error: 'not-found', message: 'That record is no longer in the address book.' };

  /* The name and the date come off the records, not off the request: the
     caller decides what their answer is and nothing else about it. */
  await db.collection('availability').doc(id + '_' + ev).set({
    memberId: id,
    memberName: String(person.data().name || person.data().fullName || '').trim(),
    eventId: ev,
    dateKey: String(event.data().date || ''),
    status,
    updatedAt: new Date(nowMs)
  });

  return { ok: true };
}

/* ------------------------------------------------------------ whoAmI ---

   WHICH RECORD IS MINE. Not part of the availability form, but the same
   lookup, so it lives beside it.

   egbc-auth.js has always found a person by querying the address book from
   the page: `where email ==`, then `where signInEmails array-contains`. With
   `allow read: if true` that worked for anybody, including somebody signing
   in for the very first time, who has no users/{uid} document and therefore
   no teams and no status.

   Closing the address book broke that, for EVERYBODY and not only Attenders,
   and it cannot be fixed in the rules. Rules are not filters: in a `list`
   rule `resource` is not a document, so "only the row carrying my own
   address" is not an expression that can be written. Two attempts at it
   produced an evaluation error, which fails the whole request.

   So the lookup is here. THE ADDRESS COMES OUT OF THE VERIFIED TOKEN, never
   out of the request body, so this can only ever answer about whoever is
   asking - which is why it is safe for it to return rather more than findMe
   does. Everything it returns is about them.

   An unverified address gets nothing: an address nobody has proved they can
   receive mail at must not be able to claim a record. */

export async function whoAmI(db, { token }) {
  const t = token || {};
  if (t.email_verified !== true) return { people: [] };
  const email = String(t.email || '').toLowerCase().trim();
  if (!email) return { people: [] };

  const [byEmail, bySignIn] = await Promise.all([
    db.collection('addressBook').where('email', '==', email).get(),
    db.collection('addressBook').where('signInEmails', 'array-contains', email).get()
  ]);

  const seen = Object.create(null);
  const people = [];
  for (const snap of [byEmail, bySignIn]) {
    for (const doc of snap.docs) {
      if (seen[doc.id]) continue;
      seen[doc.id] = true;
      const md = doc.data() || {};
      /* The same two exclusions egbc-auth.js made for itself, kept here so
         the page cannot be the only thing enforcing them. Somebody archived
         has left; a child's record is not a person who signs in - they use an
         access code emailed to a parent. */
      if (md.archived === true) continue;
      if (md.isMinor === true) continue;
      people.push({
        id: doc.id,
        name: String(md.name || md.fullName || '').trim(),
        markers: Array.isArray(md.markers) ? md.markers : [],
        adminFor: Array.isArray(md.adminFor) ? md.adminFor : [],
        masterAdmin: md.masterAdmin === true,
        churchMember: md.churchMember === true
      });
    }
  }
  return { people };
}
