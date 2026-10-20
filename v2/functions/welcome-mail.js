/* ===================================================================
   EGBC — the two welcome emails the hub sends by itself (comms window;
   FINDINGS-comms plan G: "New subscriber welcome", "Newcomer welcome")
   ===================================================================

   The words are the church's own: two fixed drafts, enewsIssues/
   auto_subscriber and auto_newcomer, written in the e-news editor, which
   keeps their finished copy (htmlEveryone) only while nothing is left to
   fill in. Each is switched on in enews.html, Welcome emails
   (enewsSettings/welcomes). Nothing is sent while either is missing.

   welcomeSubscriber  enewsSubscribers updated: pending -> subscribed,
                      confirmed by email (enews.js enewsConfirm). Their own
                      first name, their own unsubscribe link and the
                      one-click header, as the e-news (enews-send.js
                      letterFor).
   welcomeNewcomer    welcomes created (newhere.html, "I'm new here").
                      Reviewing window, 21 Oct: ONLY to the address the
                      person gave - never anyone else, no copy; NEVER an
                      under-18; and it RESPECTS THE PASTORAL ROUTING: it is
                      a welcome, never a care referral. So it reads the
                      hello's name and email and nothing else (never the
                      message, the phone number or "please contact me"),
                      writes nothing to the hello or to any care, pastoral
                      or safeguarding record, and leaves telling the
                      welcomers and the church to what does that already
                      (notify.js onHello, public-mail.js newHere). Only
                      when "I'm new here" is switched on.

   Both: once per person (welcomeSent/<kind>_<id>), never an under-18
   (under18.js), through Church HQ's sender like the e-news (hq-mail.js),
   and shut until go-live with the e-news (enews-gate.js).

     runSubscriberWelcome({ db, send, id, before, after })   for the checks
     runNewcomerWelcome({ db, send, id, hello })
     welcomeSubscriber, welcomeNewcomer                        the triggers
   =================================================================== */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { enewsShut } from './enews-gate.js';
import { makeHqSender } from './hq-mail.js';
import { featureOn } from './features.js';
import { under18Emails } from './under18.js';
import { letterFor } from './enews-send.js';

const REGION = 'europe-west2';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* The church's words for this welcome, if it is switched on and complete. */
async function words(db, kind) {
  const [set, issue] = await Promise.all([db.collection('enewsSettings').doc('welcomes').get(), db.collection('enewsIssues').doc('auto_' + kind).get()]);
  if (!(set.exists && set.data()[kind] === true)) return { skipped: 'switched off' };
  const x = issue.exists ? issue.data() : null;
  if (!x || !x.htmlEveryone) return { skipped: 'the words are not finished' };
  return { issue: x };
}
/* Made first, and only once: a trigger that runs twice sends once. */
async function once(db, key) {
  try { await db.collection('welcomeSent').doc(key).create({ at: new Date().toISOString() }); return true; } catch (e) { return false; }
}
async function sendOne(db, send, kind, issue, person, ref) {
  if ((await under18Emails(db)).has(person.email)) return { skipped: 'under 18' };
  if (!(await once(db, kind + '_' + ref))) return { skipped: 'already sent' };
  const church = (await db.collection('churchSettings').doc('details').get()).data() || {};
  const letter = letterFor(Object.assign({}, issue, { htmlMembers: '' }), person, false, { issueId: 'auto_' + kind, replyTo: church.enquiryEmail || '' });
  const r = await send(Object.assign(letter, { fromName: church.name || '', replyTo: church.enquiryEmail || '' }),
    { kind: kind === 'subscriber' ? 'subscriber welcome' : 'newcomer welcome', issueId: 'auto_' + kind, ref });
  return { sent: !!(r && r.ok), to: person.email };
}

export async function runSubscriberWelcome({ db, send, id, before, after }) {
  if (enewsShut()) return { skipped: 'shut until go-live' };
  if (!after || after.status !== 'subscribed' || (before && before.status === 'subscribed')) return { skipped: 'not a new subscriber' };
  if (!/confirmed by email/.test(String((after.consent || {}).how || ''))) return { skipped: 'not confirmed by email' };
  const email = String(after.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || !after.token) return { skipped: 'no address' };
  const w = await words(db, 'subscriber'); if (!w.issue) return w;
  return sendOne(db, send, 'subscriber', w.issue, { id: String(id), email, firstName: String(after.firstName || ''), token: String(after.token) }, String(id));
}

export async function runNewcomerWelcome({ db, send, id, hello }) {
  if (enewsShut()) return { skipped: 'shut until go-live' };
  if (!hello) return { skipped: 'nothing said' };
  if (!(await featureOn(db, 'newHere'))) return { skipped: '"I’m new here" is switched off' };
  /* Only what a welcome needs: the name they gave and the address they gave. */
  const email = String(hello.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { skipped: 'no address given' };
  const w = await words(db, 'newcomer'); if (!w.issue) return w;
  return sendOne(db, send, 'newcomer', w.issue, { id: 'hello_' + id, email, firstName: String(hello.name || '').trim().split(/\s+/)[0], token: '' }, String(id));
}

let sender = null;
const deps = () => { const db = getFirestore(); if (!sender) sender = makeHqSender({ db }); return { db, send: sender }; };
export const welcomeSubscriber = onDocumentUpdated({ document: 'enewsSubscribers/{id}', region: REGION }, (e) =>
  runSubscriberWelcome({ ...deps(), id: e.params.id, before: e.data && e.data.before.data(), after: e.data && e.data.after.data() }));
export const welcomeNewcomer = onDocumentCreated({ document: 'welcomes/{id}', region: REGION }, (e) =>
  runNewcomerWelcome({ ...deps(), id: e.params.id, hello: e.data && e.data.data() }));
