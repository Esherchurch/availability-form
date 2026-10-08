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
import { randomBytes } from 'node:crypto';
import {
  buildFeed, buildHouseholdFeed, buildFullFeed,
  householdIds, visibleRoleTeams, FULL_SCOPES
} from './rota-feed.js';

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
