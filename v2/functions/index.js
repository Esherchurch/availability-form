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
  pairingCode as pairingCodeIn, redeem as redeemIn, disconnect as disconnectIn, rename as renameIn, setJob as setJobIn,
  SETUP_FAILED
} from './churchshow.js';
import { redeemYouthCode as redeemYouthCodeIn } from './youth-redeem.js';
import { myFamily as myFamilyIn, onBookChange as onBookChangeIn } from './family.js';
import { myYouthHub as myYouthHubIn } from './youth-hub.js';
/* Which church a call is for: the sign-in's claim, never the page (multi-
   church step 3, FINDINGS-churchhq H-5). No claim is EGBC, as before. */
import { churchOf, churchFromPath, eachChurch } from './church-scope.js';
/* Codes and links that come with no sign-in: which church (hq-codes.js). */
import { codeHash, indexCode, dropCode, dbForCode } from './hq-codes.js';
import { hashCode as churchShowHash, normalise as churchShowNormalise } from './churchshow.js';
import { normalise as youthNormalise, docIdFor as youthDocId } from './youth-redeem.js';
import { runFeeds } from './feeds.js';

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
async function addressBook(fdb = db) {
  const snap = await fdb.collection('addressBook').get();
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
    /* The church the key was made in; no entry is EGBC (H-5). */
    const fdb = await dbForCode(db, 'feed', codeHash(key));
    const feedDoc = await fdb.collection('calendarFeeds').doc(key).get();
    if (!feedDoc.exists) return no();
    const feed = feedDoc.data() || {};
    const { uid, memberId } = feed;
    if (!memberId) return no();

    /* A link made before the three kinds existed has no `kind`. It is a
       "just me" link and must keep working: somebody has it in their phone. */
    const kind = feed.kind || 'me';
    const scope = feed.scope || 'all';

    const eventsSnap = await fdb.collection('events').get();
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let body;

    if (kind === 'household') {
      /* WORKED OUT NOW, NOT WHEN THE LINK WAS MADE (18). Somebody joining or
         leaving the household changes the feed on its next refresh, with
         nothing to reset. */
      const book = await addressBook(fdb);
      const ids = householdIds(book, memberId);
      const members = book.filter(m => ids.includes(m.id));
      body = buildHouseholdFeed({ events, members });

    } else if (kind === 'full') {
      /* AND SO IS WHAT THEY MAY SEE. The teams come from their record as it
         stands, not as it stood when the link was made, so leaving a team
         narrows the feed by itself. No record, no feed: a person whose
         account has gone is not shown the whole church's rota. */
      const userSnap = uid ? await fdb.collection('users').doc(uid).get() : null;
      const user = userSnap && userSnap.exists ? userSnap.data() : null;
      if (!user || user.status !== 'active') return no();
      body = buildFullFeed({ events, allowedTeams: visibleRoleTeams(user), scope });

    } else {
      const memberSnap = await fdb.collection('addressBook').doc(memberId).get();
      const member = memberSnap.exists ? memberSnap.data() : null;
      /* The person's own feed lists only what they are invited to, so a
         meeting's title comes back from its own part (the meetings split);
         the household and full feeds never carry it. */
      const withTitles = await Promise.all(events.map(async (ev) => {
        if (!ev || ev.meeting !== true || !ev.id) return ev;
        const m = await fdb.collection('meetings').doc(ev.id).get().catch(() => null);
        return m && m.exists ? Object.assign({}, ev, { description: m.data().description || '', organiserUid: m.data().organiserUid || '' }) : ev;
      }));
      body = buildFeed({ events: withTitles, memberId, member });
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
  /* The church from the sign-in (H-5); its key is indexed for rotaFeed. */
  const cdb = churchOf(request, db).db;

  const data = request.data || {};
  const reset = !!data.reset;

  /* Which feed. An old page that asks for nothing gets "just me", which is
     what it used to get, so nothing in anybody's phone stops working while
     the pages catch up. */
  const feedId = String(data.feed || 'me');
  const cfg = FEEDS[feedId];
  if (!cfg) throw new HttpsError('invalid-argument', 'There is no feed called ' + feedId + '.');

  const userSnap = await cdb.collection('users').doc(uid).get();
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

  const keyRef = cdb.collection('calendarKeys').doc(uid);
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
  const batch = cdb.batch();
  /* Delete the old lookup FIRST, in the same write. That is the whole of what
     "Reset this link" means: the moment this lands, the old address stops
     resolving to anybody.

     Only this feed's lookup. Resetting the household link must leave "just
     me" working - 18 asks for that in those words, and it is why each feed
     carries its own key rather than one key with a kind on the end. */
  if (oldKey) batch.delete(cdb.collection('calendarFeeds').doc(oldKey));
  batch.set(cdb.collection('calendarFeeds').doc(key), {
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
  if (oldKey) await dropCode(cdb, 'feed', codeHash(oldKey));
  await indexCode(cdb, 'feed', codeHash(key));

  return { key, feed: feedId, created: true, replaced: !!oldKey };
});

/* Every link this person has already made, so the page can show them without
   making the ones they have not asked for. Making a link is a deliberate act:
   the fewer of these addresses exist, the fewer there are to leak. */
export const myCalendarLinks = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const snap = await churchOf(request, db).db.collection('calendarKeys').doc(uid).get();
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

const onEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

/* EVERY MESSAGE THROUGH CHURCH HQ'S RESEND (Martin, 21 Oct 2026: "v2
   doesn't use Calla at all"). sendOne used to post to Calla's sendEmail
   with the server's Google identity; it is now makeSender (public-mail.js,
   mail-route.js): known recipients, never an under-18, the hourly cap, an
   emailOutbox row for every message, sent or stubbed. On the emulator
   nothing leaves; the row is the whole of it and a check reads it. */
import { makeSender } from './public-mail.js';
/* One email, from one church's data (its details, its outbox); EGBC's
   top level is db. Each job below makes its own. */
function sendOneIn(cdb) {
  return (msg, meta) => makeSender({ db: cdb })({ to: msg.to || [], subject: msg.subject || '', html: msg.html || msg.body || '', replyTo: msg.replyTo || '' }, meta || {});
}

/* The church's own details, so nothing here carries one church's name.
   Empty is fine: the message simply says less. */
async function churchDetails(cdb = db) {
  try {
    const s = await cdb.collection('churchSettings').doc('details').get();
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
  /* EGBC as today, then each church from its own data (H-5). */
  async () => { await eachChurch(db, (ch) => runBookingReminders(new Date(), ch.db)); }
);

/* Separated so a check can run it against the emulator at a date of its
   choosing, rather than waiting until nine tomorrow morning. */
export async function runBookingReminders(runAt, cdb = db) {
  const sendOne = sendOneIn(cdb);
  const [bookingsSnap, roomsSnap, sitesSnap, church] = await Promise.all([
    cdb.collection('bookings').where('day', '==', addLondonDay(runAt, 1)).get(),
    cdb.collection('rooms').get(),
    cdb.collection('sites').get(),
    churchDetails(cdb)
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
    await cdb.collection('bookings').doc(b.id)
      .update({ reminderSentAt: new Date().toISOString() })
      .catch(e => console.error('[reminders] could not mark ' + b.id, e));
    if (r.ok) sent++;
  }
  return { due: due.length, sent };
}

/* ---- 2. a hirer's document running out ------------------------------ */

export const documentExpiryReminders = onSchedule(
  { schedule: '30 9 * * *', timeZone: 'Europe/London', retryCount: 2 },
  async () => { await eachChurch(db, (ch) => runExpiryReminders(new Date(), ch.db)); }
);

export async function runExpiryReminders(runAt, cdb = db) {
  const sendOne = sendOneIn(cdb);
  const today = londonDay(runAt);
  const [hirersSnap, sitesSnap, bookingsSnap, church] = await Promise.all([
    cdb.collection('hirers').get(),
    cdb.collection('sites').get(),
    cdb.collection('bookings').where('day', '>=', today).get(),
    churchDetails(cdb)
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
      const ref = cdb.collection('hirers').doc(hirer.id);
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

/* THE CHURCH FROM THE ADDRESS (H-6 step 4; events' church-address.js): the
   form on <church>.churchhq.co.uk is that church's, signed in or not - its
   address book, its dates, its answers. EGBC's address, and every address
   today, is EGBC's top level, as before. A church address nobody has is
   refused. The token findMe gives is checked in the same church. */
async function formDb(request) {
  const cdb = await dbForAddress(db, request.rawRequest);
  if (!cdb) throw new HttpsError('not-found', 'This church’s address isn’t on Church HQ.');
  return cdb;
}

export const findMe = onCall(async (request) => orThrow(await findMeIn(await formDb(request), {
  email: (request.data || {}).email,
  ip: callerIp(request.rawRequest),
  nowMs: Date.now()
})));

export const myDates = onCall(async (request) => orThrow(await myDatesIn(await formDb(request), {
  token: (request.data || {}).token,
  memberId: (request.data || {}).memberId,
  nowMs: Date.now()
})));

export const saveAnswer = onCall(async (request) => orThrow(await saveAnswerIn(await formDb(request), {
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
  return orThrow(await whoAmIIn(churchOf(request, db).db, { token: request.auth.token || {} }));
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
  const d = request.data || {};
  return orThrow(await pairingCodeIn(churchOf(request, db).db, getAuth(), {
    uid: request.auth.uid,
    siteId: d.siteId, deviceId: d.deviceId, name: d.name,
    nowMs: Date.now()
  }));
});

export const churchShowDisconnect = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return orThrow(await disconnectIn(churchOf(request, db).db, getAuth(), {
    uid: request.auth.uid,
    siteId: (request.data || {}).siteId,
    deviceId: (request.data || {}).deviceId
  }));
});

/* What one computer does - Main services, Lessons for chosen groups
   (Martin, 19 Oct 2026). Master admins. */
export const churchShowSetJob = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const d = request.data || {};
  return orThrow(await setJobIn(churchOf(request, db).db, getAuth(), {
    uid: request.auth.uid, deviceId: d.deviceId, services: d.services, lessonGroups: d.lessonGroups
  }));
});

/* One computer's name (Martin, 19 Oct 2026: each named on its own). */
export const churchShowRename = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return orThrow(await renameIn(churchOf(request, db).db, {
    uid: request.auth.uid,
    deviceId: (request.data || {}).deviceId,
    name: (request.data || {}).name
  }));
});

/* Not a callable: ChurchShow is an Electron app posting plain JSON, not a
   Firebase client, so this answers ordinary HTTP. POST only - a GET with a
   code in the query string would end up in a proxy log. */
export const churchShowRedeem = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Post the code.' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    /* The church the code was made in; no entry is EGBC (H-5). */
    const cdb = await dbForCode(db, 'churchshow', churchShowHash(churchShowNormalise(body.code)));
    const out = await redeemIn(cdb, getAuth(), { code: body.code, nowMs: Date.now() });
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
    /* The church the code was made in; no entry is EGBC (H-5). */
    const cdb = await dbForCode(db, 'youth', codeHash(youthDocId(youthNormalise(body.code))));
    const out = await redeemYouthCodeIn(cdb, getAuth(), { code: body.code, nowMs: Date.now() });
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('[redeemYouthCode]', e);
    res.status(500).json({ error: 'unknown',
      message: 'Something went wrong at our end. Try again, or ask a leader.' });
  }
});

/* =================================================================
   Phone notifications (FINDINGS-notify N-4; NEXT-BRIEF §23)
   =================================================================

   The sending side; the events window built the phone side. What each
   message says and who gets it on a phone or by email is notify-core.cjs,
   the same file the Notifications page uses. The work is in notify.js;
   these are the doors.

   THREE OF THESE ARE FIRESTORE TRIGGERS (bookingNotify, maintJobNotify,
   urgentNotice), and a trigger has to run in the database's own region.
   TRIGGER_REGION must be the Location shown for the database in the
   Firebase console (Firestore, top of the Data tab). If it is wrong, those
   three refuse to deploy and the rest deploy as normal.                   */

import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as Notify from './notify.js';

const TRIGGER_REGION = 'europe-west2';

/* Every sender's door reads the master switch first (notify.js liveState).
   Switched off, the senders run as a dry run: they log what they would
   send and send nothing. "Send me a test" alone ignores the switch - it
   goes to the person who pressed it, which is how the real-phone proof
   (N-7) is done before anything else is switched on. */
/* opts.db: one church's data (church-scope.js); EGBC's top level without. */
async function notifyDeps(opts = {}) {
  const cdb = opts.db || db;
  const st = await Notify.liveState(cdb);
  const dryRun = opts.test ? !st.feature : !st.sending;
  return {
    db: cdb, auth: getAuth(), dryRun, state: st,
    push: Notify.pushTransport({ db: cdb, messaging: onEmulator() ? null : getMessaging(), onEmulator: onEmulator() }),
    email: dryRun ? Notify.dryEmail(cdb) : sendOneIn(cdb),
    hub: await Notify.hubUrl(cdb)
  };
}

/* A leader calls a parent to collect their child: the group and the code,
   to that family's own phones. */
export const callParent = onCall(async (request) => orThrow(await Notify.callParent(await notifyDeps({ db: churchOf(request, db).db }), {
  uid: request.auth && request.auth.uid,
  checkinId: (request.data || {}).checkinId
})));

/* "Send me a test", from the Notifications page. */
export const notifyTest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const deps = await notifyDeps({ test: true, db: churchOf(request, db).db });
  if (deps.dryRun) throw new HttpsError('failed-precondition', 'This church does not use phone notifications.');
  return Notify.send(deps, { uids: [request.auth.uid], type: 'test', by: request.auth.uid });
});

/* The day before you serve, at five in the evening. */
export const rotaReminders = onSchedule(
  { schedule: '0 17 * * *', timeZone: 'Europe/London', retryCount: 2 },
  async () => { await eachChurch(db, async (ch) => Notify.runRotaReminders(await notifyDeps({ db: ch.db }), new Date())); }
);

/* Booking confirmed, approved, declined or cancelled. */
/* EACH TRIGGER TWICE (multi-church step 3, H-5): on EGBC's top-level
   path, by its old name and doing exactly what it did, and on every
   church's own path (churches/{cid}/...), named <name>Church. The handler
   gets the church from the path - never from the document - so what it
   reads and writes stays in that church. */
const twins = (on, path, handler) => [
  on({ document: path, region: TRIGGER_REGION }, (event) => handler(churchFromPath(event, db), event)),
  on({ document: 'churches/{cid}/' + path, region: TRIGGER_REGION }, (event) => handler(churchFromPath(event, db), event))
];
const beforeOf = (event) => event.data.before && event.data.before.exists ? event.data.before.data() : null;
/* Core teams cover chosen teams (H-15): each person's covers kept on their
   users record, for the rules. */
const COVERS = makeCoverTriggers(twins);
export const [coversOnUser, coversOnUserChurch] = COVERS.user;
export const [coversOnTeam, coversOnTeamChurch] = COVERS.team;
/* Each person's team jobs on their users record (H-9 part 2): when the
   team jobs, or a setting they fall back on, change. */
export const [jobsOnTeamJobs, jobsOnTeamJobsChurch] = COVERS.jobs;
export const [jobsOnMoneyTeam, jobsOnMoneyTeamChurch] = COVERS.money;
export const [jobsOnTrusteeTeam, jobsOnTrusteeTeamChurch] = COVERS.trustees;
export const [jobsOnPrayerTeam, jobsOnPrayerTeamChurch] = COVERS.prayer;
/* A new building gets its copy of the Accounts setting at once (H&S step 3a;
   the events window's accounts-copy.js). Room bookings still fills any gap. */
export const [accountsForNewSite, accountsForNewSiteChurch] = makeAccountsTriggers(twins).site;
/* The teams that work with under-18s, in one record the rules read (teamFlags/under18; the events window's under18-teams.js). */
export const [under18OnTeam, under18OnTeamChurch] = makeUnder18Triggers(twins).team;

/* WHO MAY DO WHAT (H-14): each person's permissions on their sign-in, for
   the Storage rules (functions/permissions.js). */
const permsToday = () => londonDay(new Date());
/* THE MEETINGS SPLIT (Martin, 28 Oct 2026): a meeting's own words never
   stay on its rota event (functions/meeting-split.js). */
export const [meetingSplit, meetingSplitChurch] = twins(onDocumentWritten, 'events/{id}', async (ch, event) => {
  /* A deleted meeting's own part, guest links and sends: the data map's cascade (data-links.js). */
  if (!event.data.after.exists) return null;
  return splitMeeting(ch.db, event.params.id, event.data.after.data(), await meetingServiceKinds(ch.db));
});
export const [permsOnSettings, permsOnSettingsChurch] = twins(onDocumentWritten, 'churchSettings/{id}', async (ch, event) => {
  if (!['permissions', 'teamJobs'].includes(event.params.id)) return;
  return Perms.syncAll({ db: ch.db, auth: getAuth(), cid: ch.id, today: permsToday() });
});
export const [permsOnException, permsOnExceptionChurch] = twins(onDocumentWritten, 'permissionExceptions/{id}', async (ch, event) =>
  Perms.syncException({ db: ch.db, auth: getAuth(), cid: ch.id, before: beforeOf(event), after: afterOf(event), today: permsToday() }));
export const [permsOnUser, permsOnUserChurch] = twins(onDocumentWritten, 'users/{uid}', async (ch, event) => {
  if (!Perms.userChangeMatters(beforeOf(event), afterOf(event))) return;
  return Perms.syncUser({ db: ch.db, auth: getAuth(), cid: ch.id, uid: event.params.uid, today: permsToday() });
});
export const permsDaily = onSchedule(
  { schedule: '15 6 * * *', timeZone: 'Europe/London', retryCount: 2 },
  async () => { await eachChurch(db, async (ch) => Perms.runDaily({ db: ch.db, auth: getAuth(), cid: ch.id, today: permsToday(),
    notify: async (o) => Notify.send(await notifyDeps({ db: ch.db }), o) })); }
);
const afterOf = (event) => event.data.after && event.data.after.exists ? event.data.after.data() : null;

export const [bookingNotify, bookingNotifyChurch] = twins(onDocumentUpdated, 'bookings/{key}', async (ch, event) => {
  await Notify.onBookingChange(await notifyDeps({ db: ch.db }), event.params.key,
    event.data.before.data(), event.data.after.data(), event.id);
});

/* A new maintenance job, to the Maintenance team (and F-129's email). */
export const [maintJobNotify, maintJobNotifyChurch] = twins(onDocumentCreated, 'maintJobs/{id}', async (ch, event) => {
  if (!event.data) return;
  await Notify.onMaintJob(await notifyDeps({ db: ch.db }), event.params.id, event.data.data());
});

/* A notice the office marks urgent, once, to everyone it is for. */
export const [urgentNotice, urgentNoticeChurch] = twins(onDocumentWritten, 'news/{id}', async (ch, event) => {
  await Notify.onNotice(await notifyDeps({ db: ch.db }), event.params.id, beforeOf(event), afterOf(event));
});

/* Who gets told (Martin, 14 Oct 2026): the people the church named are
   told which kind has come in, and no more (notify.js onWorry, onPrayer,
   onHello). Never the office, except a hello's copy. */
export const [worryNotify, worryNotifyChurch] = twins(onDocumentCreated, 'worries/{id}', async (ch, event) => {
  if (!event.data) return;
  await Notify.onWorry(await notifyDeps({ db: ch.db }), event.params.id, event.data.data());
});
export const [prayerNotify, prayerNotifyChurch] = twins(onDocumentCreated, 'prayers/{id}', async (ch, event) => {
  if (!event.data) return;
  await Notify.onPrayer(await notifyDeps({ db: ch.db }), event.params.id, event.data.data());
});
export const [helloNotify, helloNotifyChurch] = twins(onDocumentCreated, 'welcomes/{id}', async (ch, event) => {
  if (!event.data) return;
  await Notify.onHello(await notifyDeps({ db: ch.db }), event.params.id, event.data.data());
});
/* Is a safeguarding lead set? Kept in careRouting/status for the forms. */
export const [careStatusFromSettings, careStatusFromSettingsChurch] = twins(onDocumentWritten, 'safeguardingSettings/{id}',
  async (ch) => { await Notify.refreshCareStatus(ch.db); });
export const [careStatusFromSite, careStatusFromSiteChurch] = twins(onDocumentWritten, 'bookingSettings/{id}',
  async (ch) => { await Notify.refreshCareStatus(ch.db); });
/* AND BY ITSELF, every hour (Martin, 14 Oct 2026: "we can't do this for
   every church" - no church is ever told to press Save to make something
   work). A new church, or a deploy before anybody has touched the
   safeguarding settings, has its note within the hour; it is written only
   when the answer changes. */
export const careStatusSync = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Europe/London', retryCount: 1 },
  async () => { await eachChurch(db, (ch) => Notify.refreshCareStatus(ch.db)); });

/* DBS checks and training running out, every Monday morning. */
export const checksReminders = onSchedule(
  { schedule: '0 9 * * 1', timeZone: 'Europe/London', retryCount: 2 },
  async () => { await eachChurch(db, async (ch) => Notify.runChecksReminders(await notifyDeps({ db: ch.db }), new Date())); }
);

/* =================================================================
   The family rule (APP-DESIGN-BRIEF §4; APP-A1 §3)
   =================================================================

   "Your family this week" on Home: the caller's household, first names
   only, and this week's rota slots and group meetings - when and where,
   nothing else. A function because the household needs the whole address
   book, which an Attender may not read. See family.js.                  */
export const myFamily = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return orThrow(await myFamilyIn(churchOf(request, db).db, { uid: request.auth.uid, now: new Date() }));
});

/* A household or a child's groups changed: rewrite the parents'
   familyGroups, which is what lets them read their children's youth
   boards (6c; the board rules read it). */
export const [familyGroupsSync, familyGroupsSyncChurch] = twins(onDocumentWritten, 'addressBook/{id}', async (ch, event) => {
  await onBookChangeIn(ch.db, event.params.id, beforeOf(event), afterOf(event));
});

/* A church's youth code (H-5): which church, for redeemYouthCode. Pages
   write youth grants, and pages cannot write the index, so the server does
   it here. EGBC's grants (top level) need none. */
export const youthGrantIndex = onDocumentCreated({ document: 'churches/{cid}/youthGrants/{id}', region: TRIGGER_REGION }, async (event) => {
  const cid = String(event.params.cid || '');
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(cid)) return;
  await indexCode({ churchId: cid }, 'youth', codeHash(event.params.id));
});

/* A young person's own rota dates and charters, for the Youth app (6b).
   Their code gives them no account and no read of the rota or the
   charters; this answers for them alone. See youth-hub.js. */
export const myYouthHub = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return orThrow(await myYouthHubIn(churchOf(request, db).db, { uid: request.auth.uid, now: new Date() }));
});

/* The church's two outside feeds, read every hour (F-139, F-164): the
   sermon podcast (sermonShow/feed.url) and the YouTube channel
   (watchShow/settings.channelId). A part the church does not use is not
   fetched. See feeds.js. */
export const feedSync = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'Europe/London', retryCount: 1 },
  async () => { await eachChurch(db, (ch) => runFeeds(ch.db, { now: new Date() })); }
);

/* The seven public pages' emails, sent by the server (F-168, the events window's file). */
export * from './public-mail.js';
/* Taking money through each church's own Stripe account (F-181), the events window's file. */
export * from './payments.js';
/* ...and its own GoCardless account: bank payments and Direct Debit giving. */
export * from './gocardless.js';
/* The What's on calendar people subscribe to (R7, F-182), the events window's file. */
export * from './events-feed.js';
/* Checklist reminders as a task falls due (R11, F-188), the events window's file. */
export * from './checklist-reminders.js';
/* Every email the church sent, and the ones that failed (R8), the events window's file. */
export * from './comms.js';
export * from './team-mail.js';
/* Children's counts for the fire roll-call (F-216), the events window's file. */
export { kidsCountsKeep } from './kids-counts.js';
/* Enter a Sunday once: a rota service ticked "In What's On" is copied to
   calEvents/rota_<id> for What's On, the app, the embed and the feed. */
export { rotaWhatsOn, rotaWhatsOnChurch } from './rota-whatson.js';
/* For Sunday: the prayer list for the service leader and the Pastor (F-222), the events window's file. */
export { prayerSundayOnPrayer, prayerSundayOnRota, prayerSundayDaily } from './prayer-sunday.js';
/* The session planner's Bible (API.Bible, the church's key) and its plan email (F-223), the events window's files. */
export { bibleKeySave, bibleKeyStatus, bibleFetch } from './bible.js';
export { planSend } from './planner.js';
/* A session plan for a paired ChurchShow computer (F-225, egbc-lesson/1), the events window's file. */
export { lessonFor } from './lesson.js';
/* Who may email whom (Martin, 16 Oct 2026): the Email Compiler sends through
   the hub, which checks the sender's teams; logged to emailOutbox. */
export { compilerSend } from './compiler-send.js';
export { videoRoomsEnsure, meetingHostToken, videoRoomsForTeams, videoRoomsForTeamsChurch } from './video.js';
export { meetingRoom, meetingInvite, meetingGuestJoin, meetingCancel } from './meeting-manage.js';
/* Two meetings never share a link at the same time (27 Oct 2026). */
export { meetingOwnRoom, meetingOwnRoomChurch } from './meeting-rooms.js';
import { dbForAddress } from './church-address.js';
import { splitOne as splitMeeting, serviceKinds as meetingServiceKinds } from './meeting-split.js';
export { orphanSweep } from './orphan-sweep.js';
export { castVote, voteOpen, voteClose, proxyAppoint, proxyCancel, proxyPeople, voteQuick } from './meetings.js';
/* A members' meeting keeps a matching meeting, so its votes happen in the call. */
export { membersMeetingSync, membersMeetingSyncChurch } from './members-meeting.js';
/* Sermon plans, the other way: sermonLinks for the Preaching plan (F-229), the events window's file. */
export { sermonLinkKeep } from './sermon-links.js';
/* Building compliance: the colour for bookings, reminders and the monthly summary (F-233), the events window's file. */
export { complianceDaily } from './compliance.js';
/* Personal evacuation plans on the fire roll-call: today's only, for today's people (F-234), the events window's file. */
export { peepTodayDaily, peepTodayOnCheckin, peepTodayOnPeep, peepTodayOnRollCall, peepTodayOnRota } from './peeps.js';
/* The e-news's subscribers (comms window, FINDINGS-comms): sign-up, confirm,
   unsubscribe, Resend's bounce webhook, the office's add-by-hand. Sends
   through Church HQ's Resend (hq-mail.js); shut until switch-over (enews-gate.js). */
export { enewsSignup, enewsConfirm, enewsUnsubscribe, hqMailEvents, enewsSubscriberSave } from './enews.js';
export { enewsSendDue, enewsTest } from './enews-send.js';
/* Canva: connect once, list designs, import into the picture library (comms window, FINDINGS-comms C-15); shut until switch-over (CANVA_LIVE in canva.js). */
export { canvaStatus, canvaStart, canvaCallback, canvaDesigns, canvaImport, canvaDisconnect } from './canva.js';
/* Church HQ's Resend key box (comms window): master admins paste the key in Church settings; held until switch-over. */
export { hqMailKeySave, hqMailKeyStatus } from './hq-mail-key.js';
/* Social posts, step 1: the 7am reminder for people who asked (comms window, FINDINGS-comms plan H). */
export { socialMorning } from './social.js';
/* Pictures from Unsplash: search (kept a day, within Demo mode's 50 an hour) and the download ping; the comms window's file (FINDINGS-comms). */
export { unsplashSearch, unsplashUsed } from './unsplash.js';
/* A members' meeting's papers for members without a hub account: their own 30-day link (comms window; mailings plan 3.3). */
export { meetingPapers } from './meeting-papers.js';
/* "Preview web version": a draft e-news's public copy at an unguessable link, to share before it is sent (comms window). */
export { enewsPreviewWeb } from './enews-preview.js';
/* The "?" help panel's Ask box (egbc-help.js): answers from help/<page>.md only. */
export { helpAsk } from './help-ask.js';/* Every email a v2 page sends (PLAN-hub-send.md). */
export { hubSend } from './hub-send.js';
/* Church HQ for more than one church, step 1: the directory and the claims. */
export { hqMembershipClaims, hqMyChurches } from './hq-directory.js';
/* The hub's address, made from the church's short name (hub-address.js). */
export { hubAddress, hqSlugCheck } from './hub-address.js';
import { makeCoverTriggers } from './core-teams.js';
import { makeAccountsTriggers } from './accounts-copy.js';
import { makeUnder18Triggers } from './under18-teams.js';
import * as Perms from './permissions.js';
/* The two welcome emails the hub sends by itself: a confirmed subscriber, and a hello on "I'm new here" (comms window; plan G). */
export { welcomeSubscriber, welcomeSubscriberChurch, welcomeNewcomer, welcomeNewcomerChurch } from './welcome-mail.js';
/* Present: a PowerPoint into slides and notes, from a file or a OneDrive link; the 30-day sweep (F-242), the events window's file. */
export { presentConvert, presentFromLink, presentSweep, presentLeave } from './present.js';
export { m365Start, m365Callback, m365Status, m365Disconnect } from './microsoft.js';
export { quizStart, quizOpen, quizReveal, quizPhase, quizKick, quizEnd, quizJoin, quizAnswer, quizSweep } from './quiz.js';
export { cateringSync, arrivalCheck } from './rooms-day.js';
export { sgWarningsSync, sgWarningsNow, sgTwoAdultsDaily } from './sg-warnings.js';
export { sgDraftAssessment, sgAiStatus, sgExtractRequirements, sgRequirementsFile, sgRequirementsFromLinks } from './sg-ai.js';
/* A professional's fire or health and safety report read into the building's own assessment (H&S step 4; the events window's ra-report.js). */
export { raReadReport, raAiStatus, raDraftAssessment } from './ra-report.js';
/* Reminder emails for H&S and fire reviews, countersigning and event approvals (the events window's ra-reminders.js). */
export { raRemindersDaily } from './ra-reminders.js';
/* Working alone: "I'm in" and "I've left", and who is told when someone doesn't sign out (the events window's lone-working.js). */
export { loneWorkingCheck } from './lone-working.js';
/* Pastoral visits' follow-up reminders (F-308). */
export { pastoralFollowUps } from './pastoral-visits.js';
/* ChurchShow: today's services in its building, and the church's words (H-11 item 2). */
export { churchShowServicesToday, churchShowWords } from './churchshow-services.js';
/* A church's people sign in, and its users records follow its address book (the setup frame). */
export { hqJoinChurch, churchBookToUsers } from './church-join.js';
/* The privacy tools on the information asset register (UK GDPR). */
export { privacyFind, privacyExport } from './privacy-tools.js';
/* Records that link to other records: the data map carried out (on-delete rules). */
export { tidyAfterDelete, holdParent, removeCheck, takeOutOfUse } from './data-links.js';
