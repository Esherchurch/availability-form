/* The hub's Cloud Functions.
 *
 * DEPLOY WITH THE CODEBASE NAMED, ALWAYS:
 *   firebase deploy --only functions:hub --project egbc-worship-planner
 *
 * Never `firebase deploy --only functions`, and never a bare `firebase deploy`.
 * `sendEmail` lives in the same Google project, belongs to the other window and
 * is not in this repository - so a deploy that does not name this codebase sees
 * it as a function nobody owns any more and offers to delete it. Naming the
 * codebase means the CLI only ever looks at what is in this folder.
 *
 * Two functions:
 *   rotaFeed        public, no sign-in - a calendar app cannot sign in, so the
 *                   long random key in the link stands in for one
 *   myCalendarLink  callable, signed in - makes the link, and resets it
 */
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';
import {
  buildFeed, buildHouseholdFeed, buildFullFeed,
  householdIds, visibleRoleTeams, FULL_SCOPES
} from './rota-feed.js';
import {
  findMe as findMeIn, myDates as myDatesIn, saveAnswer as saveAnswerIn,
  whoAmI as whoAmIIn, callerIp
} from './availability-form.js';
import {
  pairingCode as pairingCodeIn, redeem as redeemIn, disconnect as disconnectIn,
  SETUP_FAILED
} from './churchshow.js';
import { redeemYouthCode as redeemYouthCodeIn } from './youth-redeem.js';

initializeApp();
const db = getFirestore();

/* London, because that is where the church is and where the bills land. */
setGlobalOptions({ region: 'europe-west2', maxInstances: 10 });

/* 32 characters from a-z0-9, which is about 165 bits. Long enough that it
   cannot be guessed, short enough to paste. */
const newKey = () => randomBytes(24).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 32);

/* ------------------------------------------------- which feed is which --

   NEXT-BRIEF 18. Martin: "we need to let them choose. for example we need a
   feed for the whole family, or for the full rota if they prefer."

   Three kinds, and the full rota comes in three sizes, so five links a person
   may have. Each has its OWN key, so resetting one leaves the others working -
   which is the point of them being separate: somebody who has shared the
   household link with a grandparent can reset that one alone.

   The id is what goes in calendarKeys/{uid}.feeds and in the feed document, so
   it has to stay stable. Adding to this list is safe; renaming an id makes
   every link of that kind stop working. */
const FEEDS = {
  me: { kind: 'me', label: 'Just me' },
  household: { kind: 'household', label: 'My household' },
  'full:worship': { kind: 'full', scope: 'worship', label: 'The full rota \u2014 Worship & AV' },
  'full:kids': { kind: 'full', scope: 'kids', label: 'The full rota \u2014 Kids Church' },
  'full:all': { kind: 'full', scope: 'all', label: 'The full rota \u2014 Everything' }
};

/* The address book, once, for the feeds that need more than one person in it.
   "Just me" never reads it. */
async function addressBook() {
  const snap = await db.collection('addressBook').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ------------------------------------------------------------- the feed */

export const rotaFeed = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
  const key = String((req.query && req.query.k) || '').trim();

  /* One answer for every way of being wrong: no key, unknown key, a key whose
     person has gone. Telling the difference would let somebody work out which
     keys exist. */
  const no = () => {
    res.set('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Not found');
  };

  if (!/^[a-z0-9]{16,64}$/.test(key)) return no();

  try {
    const feedDoc = await db.collection('calendarFeeds').doc(key).get();
    if (!feedDoc.exists) return no();
    const feed = feedDoc.data() || {};
    const { uid, memberId } = feed;
    if (!memberId) return no();

    /* A link made before the three kinds existed has no `kind`. It is a
       "just me" link and must keep working: somebody has it in their phone. */
    const kind = feed.kind || 'me';
    const scope = feed.scope || 'all';

    const eventsSnap = await db.collection('events').get();
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let body;

    if (kind === 'household') {
      /* WORKED OUT NOW, NOT WHEN THE LINK WAS MADE (18). Somebody joining or
         leaving the household changes the feed on its next refresh, with
         nothing to reset. */
      const book = await addressBook();
      const ids = householdIds(book, memberId);
      const members = book.filter(m => ids.includes(m.id));
      body = buildHouseholdFeed({ events, members });

    } else if (kind === 'full') {
      /* AND SO IS WHAT THEY MAY SEE. The teams come from their record as it
         stands, not as it stood when the link was made, so leaving a team
         narrows the feed by itself. No record, no feed: a person whose
         account has gone is not shown the whole church's rota. */
      const userSnap = uid ? await db.collection('users').doc(uid).get() : null;
      const user = userSnap && userSnap.exists ? userSnap.data() : null;
      if (!user || user.status !== 'active') return no();
      body = buildFullFeed({ events, allowedTeams: visibleRoleTeams(user), scope });

    } else {
      const memberSnap = await db.collection('addressBook').doc(memberId).get();
      const member = memberSnap.exists ? memberSnap.data() : null;
      body = buildFeed({ events, memberId, member });
    }

    /* text/calendar is what makes a browser offer to add it rather than show
       it as a page; the filename is what the calendar app shows while it is
       being added. */
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="egbc-rota.ics"');
    /* Four hours, matching REFRESH-INTERVAL in the file, so a client that
       honours one and not the other still behaves. */
    res.set('Cache-Control', 'public, max-age=14400');
    res.status(200).send(body);
  } catch (err) {
    console.error('rotaFeed failed', err);
    res.set('Cache-Control', 'no-store');
    res.status(500).type('text/plain').send('Could not build the calendar');
  }
});

/* --------------------------------------------------- the link, and resetting it */

/* The page never makes the key itself. If it did, the page would need write
   access to the lookup the feed reads, and then anybody signed in could point
   a key at somebody else. */
export const myCalendarLink = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const data = request.data || {};
  const reset = !!data.reset;

  /* Which feed. An old page that asks for nothing gets "just me", which is
     what it used to get, so nothing in anybody's phone stops working while
     the pages catch up. */
  const feedId = String(data.feed || 'me');
  const cfg = FEEDS[feedId];
  if (!cfg) throw new HttpsError('invalid-argument', 'There is no feed called ' + feedId + '.');

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : null;
  if (!user || user.status !== 'active') {
    throw new HttpsError('permission-denied', 'Only a member of a team has a rota.');
  }
  const memberId = user.memberId;
  if (!memberId) {
    throw new HttpsError('failed-precondition',
      'Your account is not linked to the address book yet, so there is no rota to show.');
  }

  /* A full-rota link for a team this person cannot see would be a link to
     nothing - and worse, it would read as though the choice were theirs to
     make. Refused here, where it can be said in words, rather than quietly
     handing them an empty calendar. */
  if (cfg.kind === 'full' && cfg.scope !== 'all') {
    const allowed = visibleRoleTeams(user);
    const wanted = FULL_SCOPES[cfg.scope].teams || [];
    if (allowed && !wanted.some(t => allowed.includes(t))) {
      throw new HttpsError('permission-denied',
        'The ' + FULL_SCOPES[cfg.scope].label + ' rota is not one you can see.');
    }
  }

  const keyRef = db.collection('calendarKeys').doc(uid);
  const existing = await keyRef.get();
  const stored = existing.exists ? (existing.data() || {}) : {};
  const feeds = stored.feeds || {};

  /* BEFORE THE THREE KINDS, there was one key, kept as `key` on this
     document. That link is in somebody's phone, so it becomes the "just me"
     feed rather than being replaced by a new one. */
  let oldKey = (feeds[feedId] || {}).key || null;
  if (!oldKey && feedId === 'me' && stored.key) oldKey = stored.key;

  if (oldKey && !reset) {
    return { key: oldKey, feed: feedId, created: false };
  }

  const key = newKey();
  const batch = db.batch();
  /* Delete the old lookup FIRST, in the same write. That is the whole of what
     "Reset this link" means: the moment this lands, the old address stops
     resolving to anybody.

     Only this feed's lookup. Resetting the household link must leave "just
     me" working - 18 asks for that in those words, and it is why each feed
     carries its own key rather than one key with a kind on the end. */
  if (oldKey) batch.delete(db.collection('calendarFeeds').doc(oldKey));
  batch.set(db.collection('calendarFeeds').doc(key), {
    uid, memberId,
    kind: cfg.kind,
    scope: cfg.scope || null,
    feed: feedId,
    createdAt: new Date().toISOString()
  });
  batch.set(keyRef, {
    feeds: Object.assign({}, feeds, { [feedId]: { key, createdAt: new Date().toISOString() } })
  }, { merge: true });
  await batch.commit();

  return { key, feed: feedId, created: true, replaced: !!oldKey };
});

/* Every link this person has already made, so the page can show them without
   making the ones they have not asked for. Making a link is a deliberate act:
   the fewer of these addresses exist, the fewer there are to leak. */
export const myCalendarLinks = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const snap = await db.collection('calendarKeys').doc(uid).get();
  const stored = snap.exists ? (snap.data() || {}) : {};
  const feeds = Object.assign({}, stored.feeds);
  /* The single key from before the three kinds is the "just me" one. */
  if (stored.key && !feeds.me) feeds.me = { key: stored.key, createdAt: stored.createdAt || null };

  const out = {};
  Object.keys(FEEDS).forEach(id => { if (feeds[id] && feeds[id].key) out[id] = feeds[id].key; });
  return { feeds: out };
});

/* ====================== REMINDER EMAILS ==============================

   Two timers, both in this codebase, both deployed with
   `--only functions:hub` like everything else here.

     bookingReminders         09:00 London - "your room is booked tomorrow"
     documentExpiryReminders  09:30 London - a hirer's insurance running out

   The spec is the events window's: F-074 and its addendum in
   FINDINGS-events.md. They own the booking data; this sends about it.

   NOTHING IS SENT FROM THE EMULATOR. sendEmail is a real function in the
   real project that puts real email in front of real people, so on the
   emulator every message is written to `emailOutbox` and the POST is not
   made. That is not a test convenience - it is the only thing standing
   between a run of these checks and fifty people being told their room is
   booked tomorrow.                                                       */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  bookingsDueTomorrow, bookingReminder,
  documentsDue, expiryReminder, nextBookingFor, londonDay
} from './reminders.js';

/* The other window's function, in the same Google project and not in this
   repository. We call it over HTTP exactly as the pages do. */
const SEND_EMAIL_URL = 'https://sendemail-irkwdhx3xq-uc.a.run.app';

const onEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

/* Every message, sent or stubbed, lands in emailOutbox. On the emulator that
   is the whole of it and a check reads it; in the real project it is the
   record of what went out, which is what somebody will want the morning a
   hirer says they were never told. */
async function sendOne(msg, meta) {
  const row = {
    to: msg.to || [], subject: msg.subject || '',
    replyTo: msg.replyTo || '', html: msg.html || msg.body || '',
    ...meta, at: new Date().toISOString(), stubbed: onEmulator()
  };
  if (!row.to.length) {
    await db.collection('emailOutbox').add({ ...row, ok: false, error: 'no address' });
    return { ok: false, error: 'no address' };
  }

  if (onEmulator()) {
    await db.collection('emailOutbox').add({ ...row, ok: true });
    console.info('[reminders] emulator: not sent -', row.subject, '->', row.to.join(', '));
    return { ok: true, stubbed: true };
  }

  let out;
  try {
    const payload = { to: row.to, subject: row.subject, html: row.html };
    if (row.replyTo) payload.replyTo = row.replyTo;
    const r = await fetch(SEND_EMAIL_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => null);
    out = j && j.ok ? { ok: true } : { ok: false, error: (j && j.error) || ('HTTP ' + r.status) };
  } catch (e) {
    out = { ok: false, error: e.message || String(e) };
  }
  await db.collection('emailOutbox').add({ ...row, ok: out.ok, error: out.error || '' });
  return out;
}

/* The church's own details, so nothing here carries one church's name.
   Empty is fine: the message simply says less. */
async function churchDetails() {
  try {
    const s = await db.collection('churchSettings').doc('details').get();
    return s.exists ? (s.data() || {}) : {};
  } catch (e) { return {}; }
}

const byId = (snap) => {
  const m = {};
  snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
  return m;
};

/* ---- 1. a room booked tomorrow -------------------------------------- */

export const bookingReminders = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Europe/London', retryCount: 2 },
  async () => { await runBookingReminders(new Date()); }
);

/* Separated so a check can run it against the emulator at a date of its
   choosing, rather than waiting until nine tomorrow morning. */
export async function runBookingReminders(runAt) {
  const [bookingsSnap, roomsSnap, sitesSnap, church] = await Promise.all([
    db.collection('bookings').where('day', '==', addLondonDay(runAt, 1)).get(),
    db.collection('rooms').get(),
    db.collection('sites').get(),
    churchDetails()
  ]);

  const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const due = bookingsDueTomorrow(bookings, runAt);
  const rooms = byId(roomsSnap), sites = byId(sitesSnap);

  console.info('[reminders] ' + bookings.length + ' bookings tomorrow, ' + due.length + ' to remind');

  let sent = 0;
  for (const b of due) {
    const msg = bookingReminder({
      booking: b, room: rooms[b.roomId], site: sites[b.siteId], church
    });
    const r = await sendOne(msg, { kind: 'booking-reminder', bookingKey: b.id });
    /* Marked whatever happened. A send that failed is in emailOutbox with
       its error, and trying again tomorrow would be a reminder for a day
       that has passed - worse than none. */
    await db.collection('bookings').doc(b.id)
      .update({ reminderSentAt: new Date().toISOString() })
      .catch(e => console.error('[reminders] could not mark ' + b.id, e));
    if (r.ok) sent++;
  }
  return { due: due.length, sent };
}

/* ---- 2. a hirer's document running out ------------------------------ */

export const documentExpiryReminders = onSchedule(
  { schedule: '30 9 * * *', timeZone: 'Europe/London', retryCount: 2 },
  async () => { await runExpiryReminders(new Date()); }
);

export async function runExpiryReminders(runAt) {
  const today = londonDay(runAt);
  const [hirersSnap, sitesSnap, bookingsSnap, church] = await Promise.all([
    db.collection('hirers').get(),
    db.collection('sites').get(),
    db.collection('bookings').where('day', '>=', today).get(),
    churchDetails()
  ]);

  const hirers = hirersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sites = byId(sitesSnap);
  const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const due = documentsDue(hirers, runAt);

  console.info('[reminders] ' + due.length + ' documents to chase');

  let sent = 0;
  for (const { hirer, doc, index, stage } of due) {
    const msg = expiryReminder({
      hirer, doc, site: sites[hirer.siteId], church,
      nextBooking: nextBookingFor(hirer, bookings, runAt)
    });
    const a = await sendOne(msg.theirs, { kind: 'document-expiry', hirerId: hirer.id, stage });
    const b = await sendOne(msg.ours, { kind: 'document-expiry-office', hirerId: hirer.id, stage });

    /* Mark the stage on that document, in the array it lives in. Read and
       write the whole array: a document can be added while this runs, and
       the array is short. */
    try {
      const ref = db.collection('hirers').doc(hirer.id);
      const fresh = await ref.get();
      const docs = (fresh.data() || {}).documents || [];
      if (docs[index]) {
        docs[index] = { ...docs[index],
          remindedAt: { ...(docs[index].remindedAt || {}), [stage]: new Date().toISOString() } };
        await ref.update({ documents: docs });
      }
    } catch (e) { console.error('[reminders] could not mark ' + hirer.id, e); }

    if (a.ok || b.ok) sent++;
  }
  return { due: due.length, sent };
}

/* London's tomorrow, as a yyyy-mm-dd, for the query above. */
function addLondonDay(at, n) {
  const d = londonDay(at).split('-').map(Number);
  const t = new Date(Date.UTC(d[0], d[1] - 1, d[2] + n));
  return [t.getUTCFullYear(),
          String(t.getUTCMonth() + 1).padStart(2, '0'),
          String(t.getUTCDate()).padStart(2, '0')].join('-');
}

/* =================================================================
   The public availability form
   =================================================================

   PRIVACY-OPEN-COLLECTIONS.md, Option A, Martin's decision 9 Oct 2026.
   addressBook and events were `allow read: if true` and availability had an
   open create, all three only so index.html could work without a sign-in.
   These three calls replace that: the Admin SDK reads on the form's behalf,
   so the rules can be shut.

   No sign-in, on purpose - that is the whole point of the form - so every one
   of them is reachable by anybody. What protects each is written in
   availability-form.js: a rate limit on the lookup, and a two-hour token on
   the other two, which is what makes it impossible to answer for somebody
   else.                                                                   */


/* The module answers with { error, message } so it can be tested without a
   function around it; a callable has to throw. One place to convert. */
function orThrow(result) {
  if (result && result.error) throw new HttpsError(result.error, result.message || 'No.');
  return result;
}

export const findMe = onCall(async (request) => orThrow(await findMeIn(db, {
  email: (request.data || {}).email,
  ip: callerIp(request.rawRequest),
  nowMs: Date.now()
})));

export const myDates = onCall(async (request) => orThrow(await myDatesIn(db, {
  token: (request.data || {}).token,
  memberId: (request.data || {}).memberId,
  nowMs: Date.now()
})));

export const saveAnswer = onCall(async (request) => orThrow(await saveAnswerIn(db, {
  token: (request.data || {}).token,
  memberId: (request.data || {}).memberId,
  eventId: (request.data || {}).eventId,
  status: (request.data || {}).status,
  nowMs: Date.now()
})));

/* Which address book record belongs to the person signed in. See whoAmI in
   availability-form.js: it reads the address out of the verified token, so a
   caller can only ever learn about themselves. */
export const whoAmI = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return orThrow(await whoAmIIn(db, { token: request.auth.token || {} }));
});

/* =================================================================
   Pairing the projection PC (ChurchShow)
   =================================================================

   R1-R3 of FINDINGS-churchshow.md. The ChurchShow side is already built to
   the wire contract in that file, so the shapes here are fixed - in
   particular churchShowRedeem answers 200 { customToken, siteId, siteName }
   or 400 { error: "<one plain sentence>" }, and ChurchShow shows that
   sentence to the operator exactly as it arrives.

   churchShowRedeem HAS TO BE PUBLIC: the projection PC has no account until
   this gives it one. What protects it is that the code is 8 characters from a
   31-character alphabet, lives fifteen minutes, is stored only as a sha256,
   is burnt in a transaction on first use, and is refused the moment the
   device is switched off on the hub.

   IT ALSO NEEDS AN IAM STEP. A v2 function cannot sign a custom token until
   its own runtime service account has Service Account Token Creator on
   itself. SERVER-DEPLOY.md has the command; without it churchShowRedeem
   answers 500 and nothing else in the suite is affected.               */


export const churchShowPairingCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return orThrow(await pairingCodeIn(db, getAuth(), {
    uid: request.auth.uid,
    siteId: (request.data || {}).siteId,
    nowMs: Date.now()
  }));
});

export const churchShowDisconnect = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return orThrow(await disconnectIn(db, getAuth(), {
    uid: request.auth.uid,
    siteId: (request.data || {}).siteId
  }));
});

/* Not a callable: ChurchShow is an Electron app posting plain JSON, not a
   Firebase client, so this answers ordinary HTTP. POST only - a GET with a
   code in the query string would end up in a proxy log. */
export const churchShowRedeem = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Post the code.' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const out = await redeemIn(db, getAuth(), { code: body.code, nowMs: Date.now() });
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('[churchShowRedeem]', e);
    /* R7. ANYTHING THAT THROWS IS OUR FAULT, never a bad code: every way a
       code can be wrong is answered with a 400 inside redeem(). Saying "that
       code isn't valid" here sent an operator hunting for a new code while
       the real problem was the IAM step on our side. */
    res.status(500).json({ error: SETUP_FAILED });
  }
});

/* Redeeming a youth access code. Public, because a young person has no
   account until this gives them one - the same shape as churchShowRedeem.
   What protects it is that the code is eight characters, single-use, burnt in
   a transaction, and issued only against a parent's address (the rules'
   grantHasParent). See functions/youth-redeem.js, and YOUTH-ACCESS.md. */
export const redeemYouthCode = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'unknown', message: 'Post the code.' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const out = await redeemYouthCodeIn(db, getAuth(), { code: body.code, nowMs: Date.now() });
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('[redeemYouthCode]', e);
    res.status(500).json({ error: 'unknown',
      message: 'Something went wrong at our end. Try again, or ask a leader.' });
  }
});
