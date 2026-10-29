/* ===================================================================
   WHO MAY EMAIL WHOM (any church)
   ===================================================================

   The Email Compiler (EmailBuilder2.html) sends through the hub, which
   decides:

     - the church office (the office job) and master admins: anyone;
     - a team leader (adminFor a team): the people on THEIR teams, as the
       address book has them (markers), the people in the small groups
       they lead, and themselves (the test email);
     - anybody else: nobody.

   Every email it sends is written to emailOutbox by makeSender (who, when,
   to whom, the subject), so it shows in "Emails sent", the sender's own
   Sent list here and the person's "My messages".

     decide(user, book, to, office, extra)   pure: may this list be sent to?
     compilerSend     the older one-call sender (pages now use hubSend)
     compilerGroups   the small groups this person may email, with their people
     compilerNotify   the same email as a phone notification, to those with the app
     compilerSent     what this person has sent (the office: everyone's)

   decide() is pure, so tests ask it directly (tests/check-compiler-send.mjs);
   the callables only gather what they need and ask it.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { churchOf } from './church-scope.js';
import { makeSender } from './public-mail.js';
import { officeTeams, isOfficeIn } from './comms-office.js';
import { teamsFor } from './team-jobs.js';
import { isUnder18Record } from './under18.js';
import * as Notify from './notify.js';
import { partOn, PART_WORDS } from './part-on.js';

const REGION = 'europe-west2';
const MAX_TO = 50;
/* A group email can reach every person a leader may email, but a phone
   note is one call per person's phones; 500 is the hubSend ceiling. */
const MAX_NOTIFY = 500;

const low = (e) => String(e || '').trim().toLowerCase();

/**
 * May this person send to these addresses?
 * @param {object|null} user users/{uid}
 * @param {Array<{email:string, markers?:string[]}>} book the address book records the leader's teams reach
 * @param {string|string[]} to the addresses asked for
 * @param {string[]} [office] the teams doing the office job; without it, the job's defaults
 * @param {Set<string>|string[]} [extra] more addresses the person may reach (their small groups' people)
 * @param {number} [max] the most addresses at once
 * @returns {{ok:true, to:string[]}|{ok:false, why:string, refused?:string[]}}
 */
export function decide(user, book, to, office, extra, max = MAX_TO) {
  if (!user || user.status !== 'active') return { ok: false, why: 'not signed in to the church' };
  const all = isOfficeIn(user, office || teamsFor({}, 'office', {}));
  const mine = Array.isArray(user.adminFor) ? user.adminFor : [];
  const more = new Set([...(extra || [])].map(low));
  const list = (Array.isArray(to) ? to : [to]).map(low).filter(Boolean);
  if (!list.length) return { ok: false, why: 'nobody to send to' };
  if (list.length > max) return { ok: false, why: 'at most ' + max + ' addresses at once' };
  if (list.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { ok: false, why: 'an address is not an email address' };
  if (all) return { ok: true, to: list };
  if (!mine.length && !more.size) return { ok: false, why: 'only team leaders and the church office send emails' };
  const allowed = new Set([low(user.email), ...more]);
  (book || []).forEach((m) => { if ((m.markers || []).some((t) => mine.includes(t)) && m.email) allowed.add(low(m.email)); });
  const refused = list.filter((e) => !allowed.has(e));
  if (refused.length) return { ok: false, why: 'not on your team or in your group: ' + refused.join(', '), refused };
  return { ok: true, to: list };
}

/**
 * The small groups a person may email, each with its people who have an
 * email address and are not under 18. The office: every running group; a
 * leader: the groups they lead.
 * @param {FirebaseFirestore.Firestore} db the church's database (scoped)
 * @param {object} user users/{uid}
 * @param {boolean} all whether the person may email anyone (the office)
 * @returns {Promise<Array<{id:string, name:string, people:Array<{id:string, name:string, email:string}>}>>}
 */
export async function groupsFor(db, user, all) {
  const mid = String((user && user.memberId) || '');
  if (!all && !mid) return [];
  const gs = all ? await db.collection('smallGroups').get()
    : await db.collection('smallGroups').where('leaderIds', 'array-contains', mid).get();
  const groups = gs.docs.filter((g) => g.data().archived !== true);
  const out = [];
  for (const g of groups) {
    const ms = await db.collection('smallGroupMembers').where('groupId', '==', g.id).get();
    const rows = ms.docs.map((d) => d.data());
    /* The person's own record, for the under-18 ticks and the address the
       church holds now; the copy on the membership is only a fallback. */
    const refs = rows.map((r) => db.collection(r.personKind === 'contacts' ? 'contacts' : 'addressBook').doc(String(r.personId || '_')));
    const recs = refs.length ? await db.getAll(...refs) : [];
    const people = [];
    rows.forEach((r, i) => {
      const p = recs[i] && recs[i].exists ? recs[i].data() : null;
      if (!p || p.archived === true || isUnder18Record(p)) return;
      const email = String(p.email || r.email || '').trim();
      if (email) people.push({ id: String(r.personId), name: String(p.name || r.name || email), email });
    });
    out.push({ id: g.id, name: String(g.data().name || 'Group'), people });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every address in the small groups a person leads (for decide's extra). */
export async function groupEmailsFor(db, user) {
  const gs = await groupsFor(db, user, false);
  return new Set(gs.flatMap((g) => g.people.map((p) => low(p.email))));
}

/* The signed-in person, their church's database, and whether they are the office. */
async function caller(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const db = churchOf(req, getFirestore()).db;
  const u = await db.collection('users').doc(req.auth.uid).get();
  const user = u.exists ? u.data() : null;
  if (!user || user.status !== 'active') throw new HttpsError('permission-denied', 'Not signed in to the church.');
  if (!(await partOn(db, 'comms'))) throw new HttpsError('failed-precondition', PART_WORDS.comms);
  const office = await officeTeams(db);
  return { db, user, office, all: isOfficeIn(user, office), uid: req.auth.uid };
}
/* Asked the same way as hubSend's compiler scope: team people and group people. */
async function verdictFor(c, to, max) {
  const mine = (Array.isArray(c.user.adminFor) ? c.user.adminFor : []).slice(0, 30);
  let book = [];
  if (!c.all && mine.length) {
    const s = await c.db.collection('addressBook').where('markers', 'array-contains-any', mine).get();
    book = s.docs.map((x) => x.data()).filter((m) => m.archived !== true);
  }
  const extra = c.all ? [] : await groupEmailsFor(c.db, c.user);
  return decide(c.user, book, to, c.office, extra, max);
}

export const compilerSend = onCall({ region: REGION }, async (req) => {
  const c = await caller(req);
  const d = req.data || {};
  const verdict = await verdictFor(c, d.to);
  if (!verdict.ok) throw new HttpsError('permission-denied', verdict.why);
  const subject = String(d.subject || '').slice(0, 300);
  const html = String(d.html || '').slice(0, 400000);
  if (!subject) throw new HttpsError('invalid-argument', 'The email needs a subject.');
  const send = makeSender({ db: c.db });
  const out = await send({ to: verdict.to, subject, html, replyTo: String(d.replyTo || '').slice(0, 200) },
    { source: 'emailCompiler', by: c.uid, byName: String(c.user.name || '') });
  if (!out.ok) throw new HttpsError('unavailable', 'It did not send: ' + (out.error || 'unknown'));
  return { ok: true, stubbed: !!out.stubbed };
});

/* The groups for the page's "Send to": only what the person may email. */
export const compilerGroups = onCall({ region: REGION }, async (req) => {
  const c = await caller(req);
  return { groups: await groupsFor(c.db, c.user, c.all) };
});

/**
 * The uids of the hub accounts behind these addresses (address book
 * record by email, then users.memberId), never an under-18's.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string[]} emails
 * @returns {Promise<string[]>}
 */
export async function uidsForEmails(db, emails) {
  const want = [...new Set(emails.map(low))];
  const mids = [];
  for (let i = 0; i < want.length; i += 30) {
    const s = await db.collection('addressBook').where('email', 'in', want.slice(i, i + 30)).get();
    s.docs.forEach((d) => { if (d.data().archived !== true && !isUnder18Record(d.data())) mids.push(d.id); });
  }
  return Object.values(await Notify.uidsForMembers(db, mids));
}

/* "Also send as a notification": a note on the phones of the people
   emailed who have the app, saying who it is from and what it is about.
   The email itself is the message; the note never repeats its words. */
export const compilerNotify = onCall({ region: REGION }, async (req) => {
  const c = await caller(req);
  const d = req.data || {};
  const verdict = await verdictFor(c, d.to, MAX_NOTIFY);
  if (!verdict.ok) throw new HttpsError('permission-denied', verdict.why);
  const subject = String(d.subject || '').slice(0, 120);
  if (!subject) throw new HttpsError('invalid-argument', 'The email needs a subject.');
  const uids = (await uidsForEmails(c.db, verdict.to)).filter((u) => u !== c.uid);
  const st = await Notify.liveState(c.db);
  const emulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const deps = {
    db: c.db, auth: getAuth(), dryRun: !st.sending, state: st,
    push: Notify.pushTransport({ db: c.db, messaging: emulator ? null : getMessaging(), onEmulator: emulator }),
    /* The type never falls back to email: they have just been emailed. */
    email: async () => ({ ok: false }),
    hub: await Notify.hubUrl(c.db)
  };
  const r = await Notify.send(deps, { uids, type: 'message', by: c.uid,
    data: { from: String(c.user.name || ''), title: subject, url: 'my-messages.html', tag: String(Date.now()) } });
  return { ok: true, phones: r.phones || 0, people: uids.length, dryRun: !!r.dryRun };
});

/**
 * What a person has sent from the Compiler, newest first: one row per
 * send (an email to each person is one outbox row), with how many it
 * reached and who. The office sees everyone's.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string|null} uid the sender, or null for everyone's
 * @returns {Promise<Array<{at:string, subject:string, by:string, sent:number, failed:number, to:string[]}>>}
 */
export async function sentBy(db, uid) {
  let q = db.collection('emailOutbox').where('source', '==', 'hub:compiler');
  if (uid) q = q.where('by', '==', uid);
  const s = await q.get();
  const sends = {};
  s.docs.forEach((d) => {
    const r = d.data();
    /* One press of Send: the same sender and subject within ten minutes. */
    const key = (r.by || '') + '|' + (r.subject || '') + '|' + String(r.at || '').slice(0, 15);
    const x = sends[key] = sends[key] || { at: String(r.at || ''), subject: String(r.subject || ''), by: String(r.byName || ''), sent: 0, failed: 0, to: [] };
    if (r.ok) x.sent++; else x.failed++;
    (r.to || []).forEach((t) => { if (x.to.length < 500) x.to.push(String(t)); });
    if (String(r.at) < x.at) x.at = String(r.at);
  });
  return Object.values(sends).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 100);
}

export const compilerSent = onCall({ region: REGION }, async (req) => {
  const c = await caller(req);
  if (!c.all && !(c.user.adminFor || []).length && !c.user.masterAdmin) throw new HttpsError('permission-denied', 'Only team leaders and the church office send emails.');
  return { sends: await sentBy(c.db, c.all ? null : c.uid) };
});
