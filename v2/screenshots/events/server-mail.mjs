/* The email the hub's server sends for a public page (F-168,
   functions/public-mail.js), built here by the server's own code against
   the events emulator, for the page checks that used to read it from the
   page's own outbox. Events window. Invented people only.

     const mails = await serverMail('signup', { key });       // the sign-up's id
     const mails = await serverMail('bookingAsked', { key });  // bookings/<key>
     ...

   Each returns what would have been sent: [{ to, subject, html, attachments }].
   Nothing is sent and nothing goes to emailOutbox: the sender here only
   keeps what it is given. Each may be asked once per document (the
   server's own "send once" marker), as the trigger would be. */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FN = process.env.FN_DIR || path.join(V2, 'functions');
const fnRequire = createRequire(path.join(FN, 'index.js'));

let PM = null, db = null;
async function ready() {
  if (db) return;
  const host = process.env.FIRESTORE_EMULATOR_HOST || '';
  if (!/:8182$/.test(host)) throw new Error('server-mail: not on the events emulator (' + host + ') - refusing.');
  const { initializeApp, getApps } = fnRequire('firebase-admin/app');
  const { getFirestore } = fnRequire('firebase-admin/firestore');
  const app = getApps().find(a => a.name === 'server-mail') ||
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'egbc-worship-planner' }, 'server-mail');
  db = getFirestore(app);
  PM = await import(pathToFileURL(path.join(FN, 'public-mail.js')).href);
}

/* kind: signup | bookingAsked | bookingOffice | cancelAsk | formDone | groupAsk | newHere.
   For the "updated" ones (cancelAsk, formDone) give before; after is read now.
   hub: where the email's links lead; the checks' own page server. */
export async function serverMail(kind, { key, id, before = {}, hub = 'http://localhost:5601/' } = {}) {
  await ready();
  const col = { signup: 'signups', bookingAsked: 'bookings', bookingOffice: 'bookings', cancelAsk: 'bookings',
    formDone: 'formRequests', groupAsk: 'smallGroupRequests', newHere: 'welcomes' }[kind];
  const ref = key || id, snap = await db.collection(col).doc(ref).get();
  const doc = snap.exists ? snap.data() : null, kept = [];
  const send = async (msg) => { kept.push(msg); return { ok: true, stubbed: true }; };
  const out = await PM.handlers[kind]({ db, send, key: ref, id: ref, doc, before, after: doc, hub });
  kept.result = out;
  return kept;
}

/* The documents a check needs to find before it can ask. */
export async function find(col, field, value) {
  await ready();
  const q = await db.collection(col).where(field, '==', value).get();
  return q.docs.map(d => ({ id: d.id, ...d.data() }));
}
