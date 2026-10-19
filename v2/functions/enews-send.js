/* ===================================================================
   Sending the e-news (comms window, 19 Oct 2026; FINDINGS-comms C-7,
   C-11, C-18)
   ===================================================================

     enewsSendDue   every 5 minutes: any issue scheduled for now or earlier
                    is sent, once, to every confirmed subscriber
     enewsTest      callable, the office: the members' copy to yourself

   TWO COPIES, MADE ON THE PAGE. When the office presses Schedule, the
   page draws the issue twice with egbc-mailblocks.js - the members' copy
   and everybody else's - and saves both on the issue. This file never
   builds email; it only chooses which copy each person gets:
     the members' copy  -> an address with the office's "church member"
                            tick in the address book (§21)
     everybody else's   -> everyone else, and the web version
   So the one place that decides what is members-only stays the one place.

   EACH PERSON'S OWN LINKS. The copy holds {{unsubscribe_url}}; each
   person gets their own link there, and the same in the List-Unsubscribe
   header with List-Unsubscribe-Post, so Gmail and Apple Mail show their
   own "Unsubscribe" button (RFC 8058).

   ONCE ONLY. The issue goes scheduled -> sending in a transaction, so
   two timers can never both take it. Each person sent to is written to
   enewsIssues/{id}/sends/{subscriberId} before the next, and Resend gets
   an Idempotency-Key per person per issue, so a timer that dies half way
   carries on where it stopped and nobody gets two.

   SHUT until switch-over (enews-gate.js): on the live site nothing is
   sent and a scheduled issue just waits.
   =================================================================== */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { enewsShut } from './enews-gate.js';
import { makeHqSender, hqSecrets } from './hq-mail.js';

const REGION = 'europe-west2';
const HUB = 'https://esherchurch.github.io/availability-form/v2';
const FN_LIVE = 'https://europe-west2-egbc-worship-planner.cloudfunctions.net';
export const PLACEHOLDER = '{{unsubscribe_url}}';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* "Now" as the office typed sendAt: London wall-clock, YYYY-MM-DDTHH:MM. */
export function londonNow(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {}; f.formatToParts(d).forEach(x => { o[x.type] = x.value; });
  return o.year + '-' + o.month + '-' + o.day + 'T' + o.hour + ':' + o.minute;
}
export const isDue = (issue, nowLocal) => issue.status === 'scheduled' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(issue.sendAt || '')) && issue.sendAt <= nowLocal;

/* Which copy, and the person's own links, for one subscriber. Pure. */
export function letterFor(issue, sub, isMember, o = {}) {
  const hub = o.hub || HUB, fnBase = o.fnBase || FN_LIVE;
  const page = hub + '/enews-unsubscribe.html?t=' + encodeURIComponent(sub.token);
  const html = String(isMember ? issue.htmlMembers : issue.htmlEveryone || '').split(PLACEHOLDER).join(page);
  return {
    to: sub.email, subject: issue.subject, html,
    headers: { 'List-Unsubscribe': '<' + fnBase + '/enewsUnsubscribe?t=' + encodeURIComponent(sub.token) + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: { kind: 'enews', issue: o.issueId || '', sub: sub.id || '' },
    idempotencyKey: 'enews-' + (o.issueId || '') + '-' + (sub.id || '')
  };
}

/* Who is a church member, by email: the address book's tick (§21). */
async function memberEmails(db) {
  const s = await db.collection('addressBook').where('churchMember', '==', true).get();
  const out = new Set();
  s.docs.forEach(d => { const x = d.data(); if (x.archived !== true && x.email) out.add(String(x.email).trim().toLowerCase()); });
  return out;
}

export async function runEnewsSend({ db, send, now = new Date(), hub, fnBase, gap = 120 }) {
  if (enewsShut()) return { shut: true };
  const nowLocal = londonNow(now);
  const due = (await db.collection('enewsIssues').where('status', '==', 'scheduled').get()).docs.filter(d => isDue(d.data(), nowLocal));
  /* Also any issue a dead timer left half sent. */
  const stuck = (await db.collection('enewsIssues').where('status', '==', 'sending').get()).docs;
  const results = [];
  for (const doc of due.concat(stuck)) {
    const took = await db.runTransaction(async tx => {
      const cur = await tx.get(doc.ref), x = cur.data() || {};
      if (x.status === 'sending') return true;               /* carrying on */
      if (!isDue(x, nowLocal)) return false;                  /* changed meanwhile */
      tx.update(doc.ref, { status: 'sending', sendingAt: new Date().toISOString() });
      return true;
    });
    if (!took) continue;
    const issue = (await doc.ref.get()).data();
    if (!issue.htmlEveryone || !issue.htmlMembers) {
      await doc.ref.update({ status: 'draft', error: 'No finished copies on the issue: press Schedule again.' });
      continue;
    }
    const [details, members, subs, done] = await Promise.all([
      db.collection('churchSettings').doc('details').get(),
      memberEmails(db),
      db.collection('enewsSubscribers').where('status', '==', 'subscribed').get(),
      doc.ref.collection('sends').get()
    ]);
    const church = details.exists ? details.data() : {};
    const already = new Set(done.docs.map(d => d.id));
    let sent = 0, failed = 0, toMembers = 0;
    for (const s of subs.docs) {
      const sub = Object.assign({ id: s.id }, s.data());
      if (!sub.lists || sub.lists.weekly !== true || !sub.token) continue;
      if (already.has(s.id)) { sent++; continue; }
      const isMember = members.has(String(sub.email || '').toLowerCase());
      const letter = letterFor(issue, sub, isMember, { hub, fnBase, issueId: doc.id });
      const r = await send(Object.assign(letter, { fromName: church.name || '', replyTo: church.enquiryEmail || '' }), { kind: 'enews', issueId: doc.id, subscriberId: s.id, copy: isMember ? 'members' : 'everyone' });
      await doc.ref.collection('sends').doc(s.id).set({ at: new Date().toISOString(), ok: !!r.ok, copy: isMember ? 'members' : 'everyone', error: r.error || '' });
      if (r.ok) { sent++; if (isMember) toMembers++; } else failed++;
      if (gap) await sleep(gap);   /* Resend: at most 10 a second */
    }
    /* The web version: everybody else's copy, the unsubscribe link turned
       into the sign-up page (a web page has no one person to unsubscribe). */
    await db.collection('enewsWeb').doc(doc.id).set({
      subject: issue.subject || '', sentAt: new Date().toISOString(),
      html: String(issue.htmlEveryone).split(PLACEHOLDER).join((hub || HUB) + '/enews-signup.html')
    });
    await doc.ref.update({ status: 'sent', sentAt: new Date().toISOString(), counts: { sent, failed, members: toMembers } });
    results.push({ id: doc.id, sent, failed, members: toMembers });
  }
  return { results };
}

export const enewsSendDue = onSchedule({ region: REGION, schedule: 'every 5 minutes', timeZone: 'Europe/London', retryCount: 0, timeoutSeconds: 540, secrets: hqSecrets() }, async () => {
  const db = getFirestore();
  await runEnewsSend({ db, send: makeHqSender({ db }) });
});

/* The office sends the members' copy to their own address, from the
   address book, to see it in a real inbox. Their own link only. */
export const enewsTest = onCall({ region: REGION, secrets: hqSecrets() }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  const me = await db.collection('users').doc(uid).get();
  const p = me.exists ? me.data() : {};
  if (!(p.status === 'active' && (p.masterAdmin === true || (p.teams || []).includes('Church office')))) throw new HttpsError('permission-denied', 'For the church office.');
  if (enewsShut()) throw new HttpsError('failed-precondition', 'Sending opens at switch-over.');
  const id = String((req.data || {}).issueId || '');
  const doc = id && await db.collection('enewsIssues').doc(id).get();
  if (!doc || !doc.exists) throw new HttpsError('not-found', 'That e-news is not there.');
  const issue = Object.assign({}, doc.data(), (req.data || {}).html ? { htmlMembers: String(req.data.html).slice(0, 900000) } : {});
  if (!issue.htmlMembers) throw new HttpsError('failed-precondition', 'Nothing to send yet.');
  const email = String(p.email || '').trim();
  if (!email) throw new HttpsError('failed-precondition', 'Your account has no email address.');
  const details = await db.collection('churchSettings').doc('details').get();
  const church = details.exists ? details.data() : {};
  const letter = letterFor(issue, { email, token: 'test-only', id: 'test' }, true, { issueId: id });
  letter.subject = '[Test] ' + (issue.subject || '');
  delete letter.idempotencyKey;
  const r = await makeHqSender({ db })(Object.assign(letter, { fromName: church.name || '', replyTo: church.enquiryEmail || '' }), { kind: 'enews test', issueId: id, by: uid });
  if (!r.ok) throw new HttpsError('internal', 'Not sent: ' + (r.error || 'unknown'));
  return { ok: true, to: email };
});
