/* ===================================================================
   hubSend: every email a v2 page sends, through Church HQ's Resend
   ===================================================================
   Martin, 21 Oct 2026: "v2 doesn't use Calla at all." Fifteen browser
   senders used to post straight to Calla's sendEmail with nobody's name
   on the request. Now every one calls this, and this decides
   (PLAN-hub-send.md):

     1. signed in, with an active hub record;
     2. WHO MAY SEND, by source - the same people the page lets in today,
        now asked on the server too (SCOPES below);
     3. TO WHOM - each source reaches only its own people (the event's
        sign-ups, the group's members, the address book...), then
        makeSender's own checks: known recipients only, never an under-18,
        the hourly cap (mail-route.js, the comms window's);
     4. ONE EMAIL PER RECIPIENT, so nobody sees anyone else's address -
        each through makeSender (public-mail.js), which keeps the outbox
        row and sends with HQ_RESEND_API_KEY. Never Calla's.

   hubSend({ source, ref?, to: [emails], subject, html, replyTo?,
             attachments?: [{ filename, content: base64, type? }] })
     -> { ok, sent, stubbed, failed: [{ to, error }] }
   A refusal of the whole call is an HttpsError with plain words; a
   recipient that cannot be sent to is in `failed`, the rest still go.

   scope() is separate from the callable so the checks can ask it
   directly (tests/check-hub-send.mjs).
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';
import { makeSender } from './public-mail.js';
import { decide } from './compiler-send.js';
import * as MailRoute from './mail-route.js';
import { isUnder18Record } from './under18.js';

const REGION = 'europe-west2';
export const MAX_TO = 500;
const MAX_ATTACH = 8, MAX_ATTACH_CHARS = 9 * 1024 * 1024;   // under the callable's 10 MB request
const low = (e) => String(e || '').trim().toLowerCase();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const has = (list, any) => Array.isArray(list) && list.some((t) => any.includes(t));
const isMaster = (u) => u.masterAdmin === true;
const isAdmin = (u) => isMaster(u) || (Array.isArray(u.adminFor) && u.adminFor.length > 0);
const ROTA_TEAMS = ['Worship Team', 'AV Team', 'Kids Church', 'Youth Worship', 'Core Team'];
const PLAN_TEAMS = ['Worship Team', 'AV Team', 'Youth Worship', 'Core Team'];
const YOUTH_ADMIN = ['Kids Church', 'Youth Worship', 'Lazers', 'ReNu'];

async function emails(q, field = 'email') {
  const s = await q.get();
  const out = new Set();
  s.docs.forEach((d) => {
    const v = String(field).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), d.data());
    if (typeof v === 'string' && v.trim()) out.add(low(v));
  });
  return out;
}
const join = (...sets) => { const o = new Set(); sets.forEach((s) => s.forEach((x) => o.add(x))); return o; };
async function book(db) {
  const s = await db.collection('addressBook').get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.archived !== true);
}
const bookEmails = (people) => new Set(people.filter((m) => m.email).map((m) => low(m.email)));

/* Who may send for each source, and whom they may reach. Each returns
   { ok:true, allowed: Set|null } (null: any known recipient) or
   { ok:false, why }. The wording is what the page shows. */
export const SCOPES = {
  /* The Email Compiler: compilerSend's own rule (team leaders: their
     teams; the office and master admins: anyone). */
  async compiler(db, u, d, to) {
    let people = [];
    if (!isMaster(u) && !(u.teams || []).includes('Church office')) people = await book(db);
    const v = decide(u, people, to);
    return v.ok ? { ok: true, allowed: null } : { ok: false, why: v.why };
  },
  /* "Send test": to yourself only (it used to go to any typed address). */
  async compilerTest(db, u) {
    const ok = isMaster(u) || (u.teams || []).includes('Church office') || isAdmin(u);
    if (!ok) return { ok: false, why: 'only team leaders and the church office send emails' };
    const mine = new Set([low(u.email)]);
    if (u.memberId) {
      const m = await db.collection('addressBook').doc(String(u.memberId)).get();
      if (m.exists && m.data().email) mine.add(low(m.data().email));
    }
    return { ok: true, allowed: mine };
  },
  /* Rotas and availability requests: the planners' people. */
  async rota(db, u) {
    if (!(isMaster(u) || has(u.teams, ['Core Team']) || has(u.adminFor, ROTA_TEAMS))) return { ok: false, why: 'only rota leaders send rotas' };
    return { ok: true, allowed: bookEmails(await book(db)) };
  },
  /* A service plan to its team. */
  async servicePlan(db, u) {
    if (!(isMaster(u) || has(u.teams, PLAN_TEAMS) || has(u.adminFor, PLAN_TEAMS))) return { ok: false, why: 'only the worship teams send service plans' };
    return { ok: true, allowed: bookEmails(await book(db)) };
  },
  /* A Youth Hub access code: to a young person's household head, never
     to the young person. */
  async youthCode(db, u) {
    if (!(isMaster(u) || has(u.adminFor, YOUTH_ADMIN))) return { ok: false, why: 'only the youth and children’s leaders send access codes' };
    const people = await book(db);
    const homes = new Set(people.filter((m) => isUnder18Record(m) && m.householdId).map((m) => m.householdId));
    return { ok: true, allowed: bookEmails(people.filter((m) => !isUnder18Record(m) && homes.has(m.householdId))) };
  },
  /* An event: an admin, or someone on that event's team. Its sign-ups,
     its invitations, the address book (tasks), and small groups invited. */
  async event(db, u, d) {
    const ref = String(d.ref || '');
    if (!ref) return { ok: false, why: 'which event is this about?' };
    if (!isAdmin(u)) {
      const ev = await db.collection('calEvents').doc(ref).get();
      const e = ev.exists ? ev.data() : {};
      const mine = (Array.isArray(e.teamMemberIds) && u.memberId && e.teamMemberIds.includes(u.memberId))
        || (Array.isArray(e.teamUids) && e.teamUids.includes(u.uid));
      if (!mine) return { ok: false, why: 'only the people running this event email about it' };
    }
    const [s, i, g] = await Promise.all([
      emails(db.collection('signups').where('calEventId', '==', ref)),
      emails(db.collection('eventInvites').where('calEventId', '==', ref)),
      emails(db.collection('smallGroupMembers'))
    ]);
    return { ok: true, allowed: join(s, i, g, bookEmails(await book(db))) };
  },
  /* Room bookings, payments, invoices, closures: anyone signed in may
     book a room, as today; the emails reach only bookings' people and
     the church's own office addresses. */
  async booking(db) {
    const [a, b, c, e, f] = await Promise.all([
      emails(db.collection('bookings'), 'requester.email'),
      emails(db.collection('charges'), 'payer.email'),
      emails(db.collection('invoices'), 'payer.email'),
      emails(db.collection('sites'), 'bookingsEmail'),
      emails(db.collection('hirers'))
    ]);
    const det = await db.collection('churchSettings').doc('details').get();
    const church = new Set([low(det.exists && det.data().enquiryEmail), low(det.exists && det.data().bookingsEmail)].filter(Boolean));
    return { ok: true, allowed: join(a, b, c, e, f, church) };
  },
  /* A form to fill in: the request is written first, so it is known. */
  async form(db, u) {
    if (!(isAdmin(u) || (Array.isArray(u.teams) && u.teams.length))) return { ok: false, why: 'only the church’s teams send forms' };
    return { ok: true, allowed: await emails(db.collection('formRequests')) };
  },
  /* A small group: an admin, or the group's leader; its members and the
     people asking to join. */
  async group(db, u) {
    let groups = null;
    if (!isAdmin(u)) {
      if (!u.memberId) return { ok: false, why: 'only a group’s leaders email it' };
      const s = await db.collection('smallGroups').where('leaderIds', 'array-contains', u.memberId).get();
      groups = new Set(s.docs.map((x) => x.id));
      if (!groups.size) return { ok: false, why: 'only a group’s leaders email it' };
    }
    const pick = async (col) => {
      const s = await db.collection(col).get();
      return new Set(s.docs.map((x) => x.data()).filter((m) => !groups || groups.has(m.groupId)).map((m) => low(m.email)).filter(Boolean));
    };
    return { ok: true, allowed: join(await pick('smallGroupMembers'), await pick('smallGroupRequests')) };
  },
  /* A safeguarding concern: anyone signed in may raise one; it goes to
     the sites' safeguarding leads only. */
  async safeguarding(db) {
    const s = await db.collection('bookingSettings').get();
    const ids = new Set();
    s.docs.forEach((x) => { const v = x.data(); if (v.safeguardingLead) ids.add(String(v.safeguardingLead)); if (v.safeguardingDeputy) ids.add(String(v.safeguardingDeputy)); });
    const people = await book(db);
    return { ok: true, allowed: bookEmails(people.filter((m) => ids.has(m.id))), outlineOnly: true };
  }
};

/* The whole decision, without sending: { ok, to, why, outlineOnly }. */
export async function scope(db, uid, d) {
  if (!uid) return { ok: false, code: 'unauthenticated', why: 'Please sign in.' };
  const us = await db.collection('users').doc(String(uid)).get();
  const u = us.exists ? { uid, ...us.data() } : null;
  if (!u || u.status !== 'active') return { ok: false, code: 'permission-denied', why: 'not signed in to the church' };
  const rule = SCOPES[String(d.source || '')];
  if (!rule) return { ok: false, code: 'invalid-argument', why: 'what kind of email is this? (no source)' };
  const to = [...new Set((Array.isArray(d.to) ? d.to : [d.to]).map(low).filter(Boolean))];
  if (!to.length) return { ok: false, code: 'invalid-argument', why: 'nobody to send to' };
  if (to.length > MAX_TO) return { ok: false, code: 'invalid-argument', why: 'at most ' + MAX_TO + ' people at once' };
  if (to.some((e) => !EMAIL.test(e))) return { ok: false, code: 'invalid-argument', why: 'an address is not an email address' };
  const v = await rule(db, u, d, to);
  if (!v.ok) return { ok: false, code: 'permission-denied', why: v.why };
  const outside = v.allowed ? to.filter((e) => !v.allowed.has(e)) : [];
  if (outside.length) return { ok: false, code: 'permission-denied', why: 'not someone this email can go to (' + outside.length + ')' };
  return { ok: true, to, u, outlineOnly: !!v.outlineOnly };
}

export function cleanAttachments(list) {
  if (!list) return [];
  if (!Array.isArray(list) || list.length > MAX_ATTACH) throw new HttpsError('invalid-argument', 'At most ' + MAX_ATTACH + ' attachments.');
  let total = 0;
  const out = list.map((a) => {
    const content = String((a && a.content) || '');
    if (!content || !/^[A-Za-z0-9+/=\s]+$/.test(content)) throw new HttpsError('invalid-argument', 'An attachment is not readable.');
    total += content.length;
    return { filename: String((a && a.filename) || 'attachment').replace(/[\\/\r\n"]/g, '_').slice(0, 120), content: content.replace(/\s+/g, ''), type: String((a && (a.type || a.contentType)) || '').slice(0, 100) };
  });
  if (total > MAX_ATTACH_CHARS) throw new HttpsError('invalid-argument', 'The attachments are too big to send (over 9 MB).');
  return out;
}

export const hubSend = onCall({ region: REGION, memory: '512MiB', timeoutSeconds: 300 }, async (req) => {
  /* The church from the sign-in (H-5): its people, its hourly limit, its
     name on the From line, its outbox. */
  const db = churchOf(req, getFirestore()).db;
  const d = req.data || {};
  const v = await scope(db, req.auth && req.auth.uid, d);
  if (!v.ok) throw new HttpsError(v.code, v.why);
  const subject = String(d.subject || '').slice(0, 300);
  if (!subject) throw new HttpsError('invalid-argument', 'The email needs a subject.');
  const html = String(d.html || '').slice(0, 400000);
  const attachments = cleanAttachments(d.attachments);
  const replyTo = EMAIL.test(low(d.replyTo)) ? String(d.replyTo).trim().slice(0, 200) : '';
  /* makeSender checks the recipients and reserves the hour for each
     message; asked once per email that is every known-recipient source
     read again per person. So: once for the whole call, here, with the
     same functions and the same refusals - then each email goes with
     those two already answered. */
  const known = await MailRoute.checkRecipients(db, v.to).catch(() => ({ refused: 'Could not check recipients' }));
  if (known.refused) throw new HttpsError('permission-denied', known.refused);
  if (!(await MailRoute.reserve(db, v.to.length))) throw new HttpsError('resource-exhausted', 'Hourly limit reached: try again in a while.');
  const route = { ...MailRoute, checkRecipients: async () => ({ ok: true }), reserve: async () => true };
  const send = makeSender({ db, route });
  const meta = { source: 'hub:' + d.source, ref: String(d.ref || '').slice(0, 200), by: req.auth.uid, byName: String(v.u.name || '').slice(0, 120) };
  if (v.outlineOnly) meta.outlineOnly = true;
  const failed = [];
  let sent = 0, stubbed = false;
  for (const to of v.to) {
    const r = await send({ to: [to], subject, html, replyTo, attachments }, meta);
    if (r.ok) { sent++; stubbed = stubbed || !!r.stubbed; } else failed.push({ to, error: r.error || 'not sent' });
  }
  return { ok: failed.length === 0, sent, stubbed, failed, error: failed.length ? failed[0].error : '' };
});
