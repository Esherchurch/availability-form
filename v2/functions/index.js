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
import { buildFeed } from './rota-feed.js';

initializeApp();
const db = getFirestore();

/* London, because that is where the church is and where the bills land. */
setGlobalOptions({ region: 'europe-west2', maxInstances: 10 });

/* 32 characters from a-z0-9, which is about 165 bits. Long enough that it
   cannot be guessed, short enough to paste. */
const newKey = () => randomBytes(24).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 32);

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
    const { memberId } = feedDoc.data() || {};
    if (!memberId) return no();

    const memberSnap = await db.collection('addressBook').doc(memberId).get();
    const member = memberSnap.exists ? memberSnap.data() : null;

    const eventsSnap = await db.collection('events').get();
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const body = buildFeed({ events, memberId, member });

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

  const reset = !!(request.data && request.data.reset);

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

  const keyRef = db.collection('calendarKeys').doc(uid);
  const existing = await keyRef.get();
  const oldKey = existing.exists ? (existing.data() || {}).key : null;

  if (oldKey && !reset) {
    return { key: oldKey, created: false };
  }

  const key = newKey();
  const batch = db.batch();
  /* Delete the old lookup FIRST, in the same write. That is the whole of what
     "Reset my calendar link" means: the moment this lands, the old address
     stops resolving to anybody. */
  if (oldKey) batch.delete(db.collection('calendarFeeds').doc(oldKey));
  batch.set(db.collection('calendarFeeds').doc(key), {
    uid, memberId, createdAt: new Date().toISOString()
  });
  batch.set(keyRef, { key, createdAt: new Date().toISOString() });
  await batch.commit();

  return { key, created: true, replaced: !!oldKey };
});
