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
     the members' copy  -> an address book person with the office's
                            "church member" tick, OR on a team (Martin,
                            19 Oct: team members get them too; §21 -
                            Pending and Attender never)
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
import { makeHqSender } from './hq-mail.js';
import { makeSender } from './public-mail.js';
import { featureOn } from './features.js';
import { under18Emails, isUnder18Record } from './under18.js';
import { paperLinksFor, personalise } from './meeting-papers.js';
import { SENDING_SECRETS } from './resend-secrets.js';
import { hubUrl } from './notify.js';
import { isOffice } from './comms-office.js';

const REGION = 'europe-west2';
/* The hub's web address: one church setting, churchSettings/details.hubUrl
   (main's hubUrl in notify.js, EGBC's address the default), without its
   last "/". Every e-news link and email takes it from there. */
const hubOf = async db => (await hubUrl(db)).replace(/\/+$/, '');
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

const escHtml = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Which copy, and the person's own links, for one person. Pure.
   A subscriber has their own unsubscribe link and the one-click header.
   Someone sent a one-off email who is not a subscriber (church members, a
   team, people picked) has a "please leave me out" email to the office
   instead. "Dear {{first_name}}" becomes theirs ("friend" if none). */
export function letterFor(issue, sub, isMember, o = {}) {
  const hub = o.hub, fnBase = o.fnBase || FN_LIVE;
  if (!hub) throw new Error('letterFor: the hub’s web address is needed (hubOf).');
  const leave = 'mailto:' + String(o.replyTo || '') + '?subject=' + encodeURIComponent('Please leave me out of these emails');
  const page = sub.token ? hub + '/enews-unsubscribe.html?t=' + encodeURIComponent(sub.token) : leave;
  const first = escHtml(String(sub.firstName || '').trim().split(/\s+/)[0] || 'friend');
  const html = String(isMember ? issue.htmlMembers : issue.htmlEveryone || '').split(PLACEHOLDER).join(page).split('{{first_name}}').join(first);
  const kind = issue.kind === 'oneoff' ? 'mailing' : 'enews';
  return {
    to: sub.email, subject: String(issue.subject || '').split('{{first_name}}').join(first), html,
    headers: sub.token
      ? { 'List-Unsubscribe': '<' + fnBase + '/enewsUnsubscribe?t=' + encodeURIComponent(sub.token) + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      : { 'List-Unsubscribe': '<' + leave + '>' },
    tags: { kind, issue: o.issueId || '', sub: sub.id || '' },
    idempotencyKey: kind + '-' + (o.issueId || '') + '-' + (sub.id || '')
  };
}

/* WHO A ONE-OFF EMAIL GOES TO (plan F), worked out here - never from a
   page: e-news subscribers (as the e-news); church members (the address
   book's tick); a team or group (its marker); or people picked from the
   address book. Never archived, never without an address; under-18s are
   taken out where the list is sent. Each address once. */
export async function recipientsFor(db, issue, subsDocs) {
  const out = [], seen = new Set();
  const add = (r) => { const e = String(r.email || '').trim().toLowerCase(); if (!e || seen.has(e)) return; seen.add(e); out.push(Object.assign({}, r, { email: e })); };
  /* A chosen person who is under 18 is never sent to, even when their
     address is a parent's (under18.js): the parent's own record gets it. */
  const fromBook = (d) => { const x = d.data() || {}; if (x.archived === true || isUnder18Record(x)) return; add({ id: 'ab_' + d.id, email: x.email, firstName: String(x.name || '').split(/\s+/)[0], token: '', member: x.churchMember === true }); };
  const aud = issue.kind === 'oneoff' ? (issue.audience || 'subscribers') : 'subscribers';
  if (aud === 'subscribers') {
    subsDocs.forEach(s => { const x = s.data(); if (x.lists && x.lists.weekly === true && x.token) add({ id: s.id, email: x.email, firstName: x.firstName || '', token: x.token }); });
  } else if (aud === 'members') {
    (await db.collection('addressBook').where('churchMember', '==', true).get()).docs.forEach(fromBook);
  } else if (aud === 'team' && issue.team) {
    (await db.collection('addressBook').where('markers', 'array-contains', String(issue.team)).get()).docs.forEach(fromBook);
  } else if (aud === 'picked') {
    for (const id of (issue.picked || []).slice(0, 300)) { const d = await db.collection('addressBook').doc(String(id)).get(); if (d.exists) fromBook(d); }
  }
  return out;
}

/* Who gets the members' copy, by email: in the address book (not
   archived) with the church-member tick, or on at least one team (its
   markers). An Attender - in the address book, no tick, no team - and
   anyone not in the address book get everybody else's. */
export function getsMembersCopy(x) {
  return !!x && x.archived !== true && (x.churchMember === true || (Array.isArray(x.markers) && x.markers.filter(Boolean).length > 0));
}
async function memberEmails(db) {
  const s = await db.collection('addressBook').get();
  const out = new Set();
  s.docs.forEach(d => { const x = d.data(); if (x.email && getsMembersCopy(x)) out.add(String(x.email).trim().toLowerCase()); });
  return out;
}

export async function runEnewsSend({ db, send, now = new Date(), hub, fnBase, gap = 120 }) {
  if (enewsShut()) return { shut: true };
  hub = hub || await hubOf(db);
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
    const [details, members, subs, done, minors] = await Promise.all([
      db.collection('churchSettings').doc('details').get(),
      memberEmails(db),
      db.collection('enewsSubscribers').where('status', '==', 'subscribed').get(),
      doc.ref.collection('sends').get(),
      under18Emails(db)
    ]);
    const church = details.exists ? details.data() : {};
    const already = new Set(done.docs.map(d => d.id));
    let sent = 0, failed = 0, toMembers = 0, under18 = 0;
    const people = await recipientsFor(db, issue, subs.docs);
    const toMembersOnly = issue.kind === 'oneoff' && issue.audience === 'members';
    /* A members' meeting email: members without a hub account get their
       own link to the papers (meeting-papers.js). */
    const links = issue.kind === 'oneoff' ? await paperLinksFor(db, issue, now.getTime()) : null;
    for (const sub of people) {
      if (already.has(sub.id)) { sent++; continue; }
      /* Never an under-18, even one on the list (ticked after they joined). */
      if (minors.has(String(sub.email || '').toLowerCase())) { under18++; continue; }
      const isMember = toMembersOnly || members.has(String(sub.email || '').toLowerCase());
      const letter = letterFor(issue, sub, isMember, { hub, fnBase, issueId: doc.id, replyTo: church.enquiryEmail || '' });
      if (isMember) letter.html = await personalise(db, links, sub, letter.html, { fnBase: fnBase || FN_LIVE, issueId: doc.id });
      const r = await send(Object.assign(letter, { fromName: church.name || '', replyTo: church.enquiryEmail || '' }), { kind: issue.kind === 'oneoff' ? 'mailing' : 'enews', issueId: doc.id, subscriberId: sub.id, copy: isMember ? 'members' : 'everyone' });
      await doc.ref.collection('sends').doc(sub.id).set({ at: new Date().toISOString(), ok: !!r.ok, copy: isMember ? 'members' : 'everyone', error: r.error || '' });
      if (r.ok) { sent++; if (isMember) toMembers++; } else failed++;
      if (gap) await sleep(gap);   /* Resend: at most 10 a second */
    }
    /* The web version: everybody else's copy, the unsubscribe link turned
       into the sign-up page (a web page has no one person to unsubscribe).
       Only for the e-news and emails to subscribers: an email to church
       members, a team or picked people has no public web version. */
    if (issue.kind !== 'oneoff' || (issue.audience || 'subscribers') === 'subscribers') await db.collection('enewsWeb').doc(doc.id).set({
      subject: issue.subject || '', sentAt: new Date().toISOString(),
      html: String(issue.htmlEveryone).split(PLACEHOLDER).join(hub + '/enews-signup.html').split('{{first_name}}').join('friend')
    });
    /* A shared "Preview web version" link now shows the sent web version
       (enews-preview.js; enews-web.html follows sentIssueId). */
    for (const pd of (await db.collection('enewsPreview').where('issueId', '==', doc.id).get()).docs) await pd.ref.update({ preview: false, sentIssueId: doc.id, html: '' });
    await doc.ref.update({ status: 'sent', sentAt: new Date().toISOString(), counts: { sent, failed, members: toMembers, under18 } });
    results.push({ id: doc.id, sent, failed, members: toMembers, under18 });
  }
  return { results };
}

export const enewsSendDue = onSchedule({ region: REGION, schedule: 'every 5 minutes', timeZone: 'Europe/London', retryCount: 0, timeoutSeconds: 540, secrets: SENDING_SECRETS }, async () => {
  const db = getFirestore();
  await runEnewsSend({ db, send: makeHqSender({ db }) });
});

/* "SEND ME A TEST" (Martin, 20 Oct: it must work now). The members'
   copy, to the signed-in office person's OWN address and nobody else's,
   through the hub's usual sender (public-mail.js makeSender): Church HQ's
   Resend, where they are a known recipient (21 Oct: never Calla's). So it
   works before switch-over, while sending to subscribers stays shut
   (enews-gate.js). Its unsubscribe link goes nowhere: a test has no
   subscriber to unsubscribe. */
export const enewsTest = onCall({ region: REGION, secrets: SENDING_SECRETS }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  const me = await db.collection('users').doc(uid).get();
  const p = me.exists ? me.data() : {};
  if (!(await isOffice(db, p))) throw new HttpsError('permission-denied', 'For the church office.');
  if (!(await featureOn(db, 'enews'))) throw new HttpsError('failed-precondition', 'The e-news is switched off for this church.');
  const id = String((req.data || {}).issueId || '');
  const doc = id && await db.collection('enewsIssues').doc(id).get();
  if (!doc || !doc.exists) throw new HttpsError('not-found', 'That e-news is not there.');
  const html = String((req.data || {}).html || doc.data().htmlMembers || '').slice(0, 900000);
  if (!html) throw new HttpsError('failed-precondition', 'Nothing to send yet.');
  /* Their own address: their account's, else their address-book record's. */
  let email = String(p.email || '').trim();
  if (!email && p.memberId) { const ab = await db.collection('addressBook').doc(String(p.memberId)).get(); email = String((ab.exists && ab.data().email) || '').trim(); }
  if (!email) throw new HttpsError('failed-precondition', 'Your account has no email address.');
  const details = await db.collection('churchSettings').doc('details').get();
  const church = details.exists ? details.data() : {};
  const r = await makeSender({ db })({
    to: [email], subject: '[Test] ' + (doc.data().subject || ''),
    html: html.split(PLACEHOLDER).join('#test-only-no-unsubscribe'), replyTo: church.enquiryEmail || ''
  }, { source: 'enews', kind: 'enews test', issueId: id, by: uid });
  if (!r.ok) throw new HttpsError('internal', 'Not sent: ' + (r.error || 'unknown'));
  return { ok: true, to: email, via: r.via || 'churchhq' };
});
