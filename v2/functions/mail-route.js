/* ===================================================================
   Which way each of the hub's emails goes: Calla's sendEmail, or Church
   HQ's own Resend (comms window, 19 Oct 2026; FINDINGS-comms C-20, C-28)
   ===================================================================

   Martin decided (19 Oct): the ORIGINAL site stays on Calla's sendEmail;
   v2's emails move to Church HQ's Resend one kind at a time, with Calla's
   as the fallback for the first weeks, all moved by switch-over.

   A KIND GOES TO CHURCH HQ'S RESEND ONLY WHEN ALL THREE ARE TRUE:
     (a) the key is saved in the key box (hq-mail-key.js);
     (b) the switch is open - enews-gate.js, the payments-gate pattern,
         shut on the live site until switch-over;
     (c) the kind is on Martin's list, churchSettings/mailRoute.kinds -
         EMPTY until he adds one. An entry is a kind ('signup') or a
         source ('emailCompiler'), exactly as the outbox writes them.
   Otherwise it goes to Calla's sendEmail exactly as today.

   EVERY PROTECTION CALLA'S sendEmail GIVES, KEPT ON THIS SIDE TOO:
     - known recipients only: the same KNOWN_SOURCES list, compared
       ignoring case; an unknown address is refused, not sent elsewhere;
     - no under-18 address, ever (HANDOVER-MAIN rule 7): an address on an
       address-book record ticked isMinor is refused - Calla's does not
       check this, the hub's rule says it must never happen;
     - an hourly cap: 2,000 recipients an hour across every instance (one
       counter document per hour, reserved in a transaction);
     - outlineOnly (a Safeguarding team's email): the outbox keeps when,
       who and the subject, never the email - makeSender already does
       this for both routes.
   From: "<the church's name from Church settings>" <hub@mail.churchhq.co.uk>.
   Reply-To: the address the sender chose, else the church's enquiry email.
   Nothing about any one church is written here.

   IF RESEND FAILS, the same email goes to Calla's, and both attempts are
   in the outbox (via: 'churchhq', then via: 'calla'), for the first
   weeks. A REFUSAL (unknown address, under-18, the cap) is not a failure:
   it is not passed to Calla, because Calla would be asked to do what the
   hub has just decided must not happen.
   =================================================================== */

import { storedKeys } from './hq-mail-key.js';
import { enewsShut } from './enews-gate.js';
import { fromFor } from './hq-mail.js';
import { under18Emails } from './under18.js';

/* The same list as Calla's sendEmail (C:\Users\marti\egbc-email,
   functions/index.js KNOWN_SOURCES, read 19 Oct 2026). check-mail-route
   compares the two when Calla's file is on the machine. */
export const KNOWN_SOURCES = [
  ['addressBook', 'email'],
  ['users', 'email'],
  ['contacts', 'email'],
  ['signups', 'email'],
  ['smallGroupRequests', 'email'],
  ['formRequests', 'email'],
  ['bookings', 'requester.email'],
  ['hirers', 'email'],
  ['charges', 'payer.email'],
  ['invoices', 'payer.email'],
  ['sites', 'bookingsEmail'],
  ['churchSettings', 'enquiryEmail'],
  ['churchSettings', 'bookingsEmail'],
  ['welcomeSettings', 'notifyEmail'],
  ['careRouting', 'care.email'],
  ['careRouting', 'pastoral.email'],
  ['careRouting', 'prayer.email']
];
export const HOURLY_RECIPIENTS = 2000;
const API = 'https://api.resend.com/emails';

const low = a => String(a || '').trim().toLowerCase();
const at = (o, dotted) => dotted.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);

/* (c) Martin's list. A kind matches by its kind or its source. */
export async function routeList(db) {
  const d = await db.collection('churchSettings').doc('mailRoute').get();
  const k = d.exists ? d.data().kinds : [];
  return Array.isArray(k) ? k.map(String) : [];
}
export function listed(list, meta) {
  const m = meta || {};
  return list.some(x => x && (x === m.kind || x === m.source));
}

/* The decision, before anything is sent. */
export async function routeFor(db, meta, { shut = enewsShut } = {}) {
  if (shut()) return { route: 'calla', why: 'shut until switch-over' };
  const list = await routeList(db);
  if (!listed(list, meta)) return { route: 'calla', why: 'not on the list' };
  const keys = await storedKeys(db);
  if (!keys.key) return { route: 'calla', why: 'no key in the key box' };
  return { route: 'churchhq', key: keys.key };
}

/* Known recipients and no under-18s: read every source into memory,
   lowercased (Firestore can't ignore case). Church-sized. */
export async function checkRecipients(db, to) {
  const want = to.map(low);
  const known = new Set();
  await Promise.all(KNOWN_SOURCES.map(([c, f]) => db.collection(c).get().then(s => s.docs.forEach(d => {
    const v = at(d.data(), f);
    if (typeof v === 'string' && v.trim()) known.add(low(v));
  }))));
  const unknown = want.filter(a => !known.has(a));
  if (unknown.length) return { refused: 'Recipient not known to the hub (' + unknown.length + ')' };
  /* Ticked Under 16 or Under 18 in the address book (under18.js). */
  const minors = await under18Emails(db);
  if (want.some(a => minors.has(a))) return { refused: 'An under-18 address: the hub never emails under-18s' };
  return { ok: true };
}

/* The hourly cap, across every instance: one counter per hour. */
export async function reserve(db, count, now = new Date()) {
  const hour = now.toISOString().slice(0, 13);
  const ref = db.collection('mailRouteHours').doc(hour);
  return db.runTransaction(async tx => {
    const d = await tx.get(ref);
    const used = d.exists ? Number(d.data().recipients || 0) : 0;
    if (used + count > HOURLY_RECIPIENTS) return false;
    tx.set(ref, { recipients: used + count, hour }, { merge: true });
    return true;
  });
}

/* Resend, for the hub's emails. Returns { ok, id } or { ok:false, error }. */
export async function sendViaResend({ db, key, msg, fetchFn }) {
  const details = await db.collection('churchSettings').doc('details').get();
  const church = details.exists ? details.data() : {};
  const body = {
    from: fromFor(church.name, 'hub'),
    to: msg.to, subject: String(msg.subject || '').slice(0, 300), html: String(msg.html || '')
  };
  const reply = msg.replyTo || church.enquiryEmail || '';
  if (reply) body.reply_to = reply;
  if (msg.attachments && msg.attachments.length) {
    body.attachments = msg.attachments.map(a => ({ filename: a.filename, content: a.content, content_type: a.type || a.contentType || undefined }));
  }
  try {
    const r = await (fetchFn || fetch)(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return r.ok && j && j.id ? { ok: true, id: j.id, from: body.from } : { ok: false, error: (j && (j.message || j.name)) || ('HTTP ' + r.status) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
