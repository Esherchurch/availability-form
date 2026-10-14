/* Phone notifications: the sending side (FINDINGS-notify N-4; NEXT-BRIEF §23).
 *
 * The events window built the phone half - turning notifications on, the
 * switches, the service worker - and the rules for pushTokens, notifyPrefs
 * and notifyLog. This is the half that sends.
 *
 * WHAT EACH MESSAGE SAYS, AND WHO GETS IT ON A PHONE OR BY EMAIL, IS NOT
 * DECIDED HERE. It is notify-core.cjs: a copy of the events window's
 * egbc-notify-core.js, the same file the Notifications page uses, so the
 * switch a person sees is the switch this obeys. tests/check-notify-send.mjs
 * fails if the copy and the original differ.
 *
 * One shared sender, send(), and one small function per message in
 * index.js. Everything here takes its database, its push and its email as
 * arguments, so a check can run it against the emulator with nothing
 * leaving the machine.
 *
 * NOTHING IS PUSHED FROM THE EMULATOR, for the same reason nothing is
 * emailed from it (index.js, sendOne): on the emulator every push is
 * written to `pushOutbox` instead, and no request goes to Google.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('./notify-core.cjs');
const Safeguarding = require('./safeguarding-core.cjs');

/* EGBC's address, as the default: churchSettings/details.hubUrl overrides
   it, so another church's emails link to its own hub. */
const DEFAULT_HUB = 'https://esherchurch.github.io/availability-form/v2/';

/* What FCM says about a phone that has gone: the app was removed, or the
   token is not one. Either way it will never answer again. */
const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-argument',
  'messaging/invalid-registration-token'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* A notice is written in the rich editor, so its body is HTML. A locked
   phone shows text. */
export const plainText = (html) => String(html == null ? '' : html)
  .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, ' ').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

/* London's date, n days on from `at`, as yyyy-mm-dd. */
export function londonDate(at, n = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number);
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return t.toISOString().slice(0, 10);
}

/* THE MASTER SWITCH (the reviewing window, 13 Oct 2026). Deploying the
   senders puts timers and triggers live against the real database, and with
   email as the fallback for everybody without a phone set up - which today
   is everybody - they would start emailing real people before launch, and
   could repeat emails the old pages already send. So:

     churchSettings/notifications.live   OFF unless it is exactly true.
                                          A master admin sets it (rules).
     churchSettings/features.notifications
                                          the server's half of
                                          EGBCChurch.uses('notifications')
                                          (HANDOVER-MAIN rule 12): on unless
                                          it is exactly false.

   While either is off, every timer and trigger works out who it WOULD
   reach, writes that to notifyLog as counts (never an address), and sends
   nothing - no push, no email. It writes no once-only markers either, so
   switching on later loses nothing. Calling a parent is refused in words.
   Only "Send me a test", to the person pressing it, still goes: that is
   how Martin proves it on his own phone (N-7). */
export async function liveState(db) {
  const [n, f] = await Promise.all([
    db.collection('churchSettings').doc('notifications').get().catch(() => null),
    db.collection('churchSettings').doc('features').get().catch(() => null)
  ]);
  const live = !!(n && n.exists && n.data().live === true);
  const feature = !(f && f.exists && f.data().notifications === false);
  return { live, feature, sending: live && feature };
}

/* The email door while switched off: it records that one would have gone,
   to how many, and sends nothing. */
export function dryEmail(db) {
  return async (msg, meta) => {
    await db.collection('notifyLog').add({ type: 'email', kind: (meta && meta.kind) || '', dryRun: true,
      wouldEmail: (msg.to || []).length, at: new Date().toISOString() });
    return { ok: false, dryRun: true };
  };
}

export async function hubUrl(db) {
  try {
    const s = await db.collection('churchSettings').doc('details').get();
    const u = s.exists ? String((s.data() || {}).hubUrl || '') : '';
    return /^https:\/\//.test(u) ? u.replace(/\/?$/, '/') : DEFAULT_HUB;
  } catch (e) { return DEFAULT_HUB; }
}

/* ---------------------------------------------------- who is somebody */

/* The uid for each address book record, through users.memberId - the
   same way the planners and the calendar feeds find a person. */
export async function uidsForMembers(db, memberIds) {
  const out = {};
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  for (const part of chunks(ids, 30)) {
    const snap = await db.collection('users').where('memberId', 'in', part).get();
    snap.docs.forEach((d) => { const m = d.data().memberId; if (m && !out[m]) out[m] = d.id; });
  }
  return out;
}

/* An email for each uid: the address book first, because that is the
   address the church holds; then the sign-in itself, for a parent who is
   not in the address book (N-6b). */
async function emailsFor(db, auth, uids) {
  const out = {};
  const users = uids.length ? await db.getAll(...uids.map((u) => db.collection('users').doc(u))) : [];
  const memberOf = {};
  users.forEach((s) => { if (s.exists && s.data().memberId) memberOf[s.id] = s.data().memberId; });
  const mids = [...new Set(Object.values(memberOf))];
  const book = mids.length ? await db.getAll(...mids.map((m) => db.collection('addressBook').doc(m))) : [];
  const emailOf = {};
  book.forEach((s) => { if (s.exists && s.data().email) emailOf[s.id] = String(s.data().email); });
  for (const uid of uids) {
    if (memberOf[uid] && emailOf[memberOf[uid]]) { out[uid] = emailOf[memberOf[uid]]; continue; }
    try {
      const u = await auth.getUser(uid);
      if (u && u.email && u.emailVerified) out[uid] = u.email;
    } catch (e) { /* no such account: no email */ }
  }
  return out;
}

/* ------------------------------------------------------------ sending */

/* The push transport. On the emulator, every push is written to
   pushOutbox and nothing goes to Google; a token beginning "dead-" answers
   as a phone that has gone, so a check can prove dead phones are removed. */
export function pushTransport({ db, messaging, onEmulator }) {
  if (onEmulator) {
    return async (msg) => {
      await db.collection('pushOutbox').add({ tokens: msg.tokens, data: msg.data,
        urgency: msg.webpush.headers.Urgency, at: new Date().toISOString() });
      return { responses: msg.tokens.map((t) => /^dead-/.test(t)
        ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
        : { success: true }) };
    };
  }
  return (msg) => messaging.sendEachForMulticast(msg);
}

/* send(deps, o)
     deps: { db, auth, push, email, hub }
       push(msg)  -> { responses: [{ success, error }] }   (pushTransport)
       email(msg, meta) -> { ok }                            (index.js sendOne)
       hub        the hub's address, for links in emails
     o: { uids, type, data, by, siteId, now, emailFor? }
       emailFor(uid, address) -> { subject, html }  a message's own email,
       where it has one (the maintenance job, F-129); otherwise the
       notification's title and words.
   -> { phones, emailed, none } */
export async function send(deps, o) {
  const { db, auth } = deps;
  const uids = [...new Set((o.uids || []).filter(Boolean))];
  const now = o.now || new Date();

  const prefs = {}, tokens = {}, tokenRefs = {};
  if (uids.length) {
    const ps = await db.getAll(...uids.map((u) => db.collection('notifyPrefs').doc(u)));
    ps.forEach((s) => { if (s.exists) prefs[s.id] = s.data(); });
    for (const part of chunks(uids, 30)) {
      const snap = await db.collection('pushTokens').where('uid', 'in', part).get();
      snap.docs.forEach((d) => {
        const t = d.data();
        if (!t.token) return;
        (tokens[t.uid] = tokens[t.uid] || []).push(t.token);
        (tokenRefs[t.token] = tokenRefs[t.token] || []).push(d.ref);
      });
    }
  }
  const emails = await emailsFor(db, auth, uids);
  const plan = Core.plan({ uids, type: o.type, prefs, tokens, emails, now });
  const words = Core.message(o.type, o.data || {});

  /* SWITCHED OFF: say what would have gone, send nothing. */
  if (deps.dryRun) {
    const wouldPhones = plan.push.reduce((n, e) => n + e.tokens.length, 0);
    await db.collection('notifyLog').add({ type: o.type, siteId: o.siteId || '', by: o.by || '', at: now.toISOString(),
      dryRun: true, wouldPhones, wouldEmail: plan.email.length, skipped: plan.skipped.length });
    console.info('[notify] switched off: ' + o.type + ' would reach ' + wouldPhones + ' phone(s) and email '
      + plan.email.length + ' - nothing sent');
    return { phones: 0, emailed: 0, none: uids.length, dryRun: true, wouldPhones, wouldEmail: plan.email.length };
  }

  let phones = 0, emailed = 0;
  const urgent = o.type === 'callParent' || o.type === 'urgent';
  for (const entry of plan.push) {
    /* DATA-ONLY, which is what egbc-notify-sw.js expects, and what makes
       the message look the same on Android and an iPhone. */
    const data = {};
    Object.keys(words).forEach((k) => { data[k] = String(words[k] == null ? '' : words[k]); });
    data.silent = String(!!entry.silent);
    const res = await deps.push({ tokens: entry.tokens, data,
      webpush: { headers: { Urgency: urgent ? 'high' : 'normal', TTL: '3600' } } });
    const rs = (res && res.responses) || [];
    for (let i = 0; i < entry.tokens.length; i++) {
      const r = rs[i] || {};
      if (r.success) { phones++; continue; }
      const code = r.error && (r.error.code || r.error.errorInfo && r.error.errorInfo.code);
      if (DEAD.includes(code)) {
        for (const ref of tokenRefs[entry.tokens[i]] || []) await ref.delete().catch(() => {});
      }
    }
  }

  for (const entry of plan.email) {
    const own = o.emailFor ? o.emailFor(entry.uid, entry.email) : null;
    const link = deps.hub + String(words.url || 'app.html').replace(/^\//, '');
    const msg = own || {
      subject: words.title,
      html: '<p style="font-size:16px">' + esc(words.body) + '</p>'
        + '<p><a href="' + esc(link) + '">Open the hub</a></p>'
    };
    const r = await deps.email({ to: [entry.email], subject: msg.subject, html: msg.html },
      { kind: 'notify-' + o.type });
    if (r && r.ok) emailed++;
  }

  /* NEVER A TOKEN OR AN ADDRESS in the log: who sent what kind, and how
     far it got. */
  await db.collection('notifyLog').add({ type: o.type, siteId: o.siteId || '', by: o.by || '',
    at: now.toISOString(), phones, emailed, skipped: plan.skipped.length });

  return { phones, emailed, none: plan.skipped.length + plan.email.length - emailed };
}

/* Once only. A scheduled run retries, and a trigger can fire twice; the
   marker is created, never overwritten, so the second attempt finds it
   and sends nothing. Returns true when THIS call made it. */
export async function once(db, id, fields = {}, dryRun = false) {
  /* A dry run must not use up the marker, or switching on would skip it. */
  if (dryRun) return true;
  try {
    await db.collection('notifySent').doc(id).create({ at: new Date().toISOString(), ...fields });
    return true;
  } catch (e) {
    if (e && (e.code === 6 || /already exists/i.test(String(e.message)))) return false;
    throw e;
  }
}

/* ------------------------------------------------------ call a parent */

/* May this person page this child? The same three answers as the rules'
   pageTeam() and the leader's screen: a Kids Church lead of the site, the
   child's group's leader, or that morning's Session Leader. Asked again
   here because a callable is reachable by anybody signed in. */
async function mayPage(db, user, ck, now) {
  if (!user || user.status !== 'active') return false;
  const mid = user.memberId || '';
  const site = ck.siteId || '';
  if (!site) return false;
  if (user.masterAdmin === true) return true;
  if (mid) {
    const bs = await db.collection('bookingSettings').doc(site).get();
    const b = bs.exists ? bs.data() : {};
    if (b.safeguardingLead === mid || b.safeguardingDeputy === mid) return true;
  }
  const ks = await db.collection('kidsSettings').doc(site).get();
  const teams = ks.exists ? (ks.data().teams || []) : [];
  if ((user.adminFor || []).some((t) => teams.includes(t))) return true;
  if (!mid) return false;
  if (ck.groupId) {
    const g = await db.collection('kidsGroups').doc(ck.groupId).get();
    if (g.exists && (g.data().leaderIds || []).includes(mid)) return true;
  }
  /* The rules' kidsToday() is the UTC date. */
  const morning = await db.collection('kidsMornings').doc(site + '_' + now.toISOString().slice(0, 10)).get();
  if (morning.exists) {
    const m = morning.data();
    const exp = m.expiresAt && m.expiresAt.toMillis ? m.expiresAt.toMillis() : Date.parse(m.expiresAt || '');
    if (exp > now.getTime() && (m.sessionLeaderIds || []).includes(mid)) return true;
  }
  return false;
}

/* -> { phones, emailed, none } | { reason } | { error, message } */
export async function callParent(deps, { uid, checkinId, now = new Date() }) {
  const { db, auth } = deps;
  if (!uid) return { error: 'unauthenticated', message: 'Sign in first.' };
  const id = String(checkinId || '');
  if (!id || id.length > 300 || id.includes('/')) return { error: 'invalid-argument', message: 'Which child?' };

  if (deps.dryRun) {
    return { error: 'failed-precondition',
      message: 'Phone notifications are not switched on yet, so nothing was sent' };
  }

  const ckSnap = await db.collection('checkins').doc(id).get();
  const ck = ckSnap.exists ? ckSnap.data() : null;
  if (!ck || ck.kind !== 'child' || ck.state !== 'in') return { reason: 'not-in' };

  const userSnap = await db.collection('users').doc(uid).get();
  if (!(await mayPage(db, userSnap.exists ? userSnap.data() : null, ck, now))) {
    return { error: 'permission-denied', message: 'Only a leader of that group, the Session Leader or a lead can call a parent.' };
  }

  /* AT MOST ONCE A CHILD EVERY TWO MINUTES, decided in a transaction so
     two leaders pressing at once send one call, not two. */
  const gate = db.collection('notifyThrottle').doc('callParent_' + id);
  const tooSoon = await db.runTransaction(async (tx) => {
    const g = await tx.get(gate);
    if (g.exists && now.getTime() - Number(g.data().atMs || 0) < 2 * 60 * 1000) return true;
    tx.set(gate, { atMs: now.getTime(), by: uid });
    return false;
  });
  if (tooSoon) return { reason: 'too-soon' };

  /* The parents: the registration form's address, and the optional second
     one (N-6c), matched to sign-ins whose address is VERIFIED - an
     unverified account could be anybody who typed that address. */
  const fam = ck.familyId ? await db.collection('kidsFamilies').doc(ck.familyId).get() : null;
  const f = fam && fam.exists ? fam.data() : {};
  const uids = [];
  for (const e of [f.email, f.email2]) {
    if (!e) continue;
    try {
      const u = await auth.getUserByEmail(String(e).trim());
      if (u && u.emailVerified) uids.push(u.uid);
    } catch (err) { /* no account with that address */ }
  }

  const g = ck.groupId ? await db.collection('kidsGroups').doc(ck.groupId).get() : null;
  /* THE GROUP AND THE CODE, AND NOTHING ELSE (N-2). The child's name is
     on the check-in; it is not passed on. */
  return send(deps, { uids, type: 'callParent', by: uid, siteId: ck.siteId, now,
    data: { group: g && g.exists ? g.data().name : '', code: ck.pickupCode || '', tag: id } });
}

/* ------------------------------------------------- the day before I serve */

function dayWords(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* Everyone on tomorrow's rota, once each, with every role they have that
   day. Events that are archived or still a draft are not the rota (the
   calendar feeds skip the same ones). */
export async function runRotaReminders(deps, runAt = new Date()) {
  const { db } = deps;
  const day = londonDate(runAt, 1);
  const snap = await db.collection('events').where('date', '==', day).get();
  const byMember = {};
  snap.docs.forEach((d) => {
    const ev = d.data();
    if (ev.archived || ev.draft) return;
    const where = [ev.type, ev.startTime].filter(Boolean).join(', ');
    Object.keys(ev.assignments || {}).forEach((role) => {
      const who = ev.assignments[role];
      const mid = who && who.id;
      if (!mid) return;
      const m = byMember[mid] = byMember[mid] || { roles: [], places: [] };
      if (!m.roles.includes(role)) m.roles.push(role);
      if (where && !m.places.includes(where)) m.places.push(where);
    });
  });
  const uidOf = await uidsForMembers(db, Object.keys(byMember));
  let sent = 0, skipped = 0;
  for (const mid of Object.keys(byMember)) {
    const uid = uidOf[mid];
    if (!uid) { skipped++; continue; }
    if (!(await once(db, 'rota_' + day + '_' + uid, {}, deps.dryRun))) { skipped++; continue; }
    await send(deps, { uids: [uid], type: 'rota', by: 'rotaReminders', now: runAt,
      data: { roles: byMember[mid].roles, place: byMember[mid].places.join(' · '), tag: day } });
    sent++;
  }
  return { day, people: Object.keys(byMember).length, sent, skipped };
}

/* ---------------------------------------------------- room bookings */

/* -> the status word notify-core understands, or '' for no message. */
export function bookingChange(before, after) {
  const a = (before || {}).status, b = (after || {}).status;
  if (!after || a === b) return '';
  if (b === 'confirmed') return a === 'requested' ? 'approved' : 'confirmed';
  if (b === 'declined' || b === 'cancelled') return b;
  return '';
}

/* eventId is the trigger's own id, the same on a retry, so a retried
   delivery finds its marker and sends nothing. */
export async function onBookingChange(deps, key, before, after, eventId) {
  const status = bookingChange(before, after);
  if (!status || !after.memberUid) return null;
  if (!(await once(deps.db, 'booking_' + key + '_' + (eventId || status), {}, deps.dryRun))) return null;
  const room = after.roomId ? await deps.db.collection('rooms').doc(after.roomId).get() : null;
  const when = [after.day ? dayWords(after.day) : '', String(after.startLocal || '').slice(11, 16)].filter(Boolean).join(' ');
  return send(deps, { uids: [after.memberUid], type: 'booking', by: 'bookingNotify', siteId: after.siteId || '',
    data: { status, room: room && room.exists ? room.data().name : '', when, tag: key } });
}

/* --------------------------------------------- a new maintenance job */

/* F-129 and N-4 together: the Maintenance team's phones get the
   notification; anyone on the team without a phone gets F-129's email;
   with nobody on the team, the office gets it, so a job is never lost.
   NO PHOTO, and no link to its file (Martin, A-M1). */
export async function onMaintJob(deps, jobId, job) {
  const { db } = deps;
  if (!(await once(db, 'maintJob_' + jobId, {}, deps.dryRun))) return null;
  const book = await db.collection('addressBook').where('markers', 'array-contains', 'Maintenance').get();
  const members = book.docs.filter((d) => d.data().archived !== true)
    .map((d) => ({ id: d.id, email: String(d.data().email || '') }));
  const uidOf = await uidsForMembers(db, members.map((m) => m.id));

  const link = deps.hub + 'maintenance.html#' + encodeURIComponent(jobId);
  const at = job.reportedAt && job.reportedAt.toDate ? job.reportedAt.toDate() : new Date();
  const mail = {
    subject: 'Maintenance: ' + String(job.what || 'a new job').slice(0, 120),
    html: '<p style="font-size:16px"><strong>' + esc(job.what) + '</strong></p>'
      + (job.where ? '<p>Where: ' + esc(job.where) + '</p>' : '')
      + (job.details ? '<p>' + esc(job.details) + '</p>' : '')
      + '<p>Reported by ' + esc(job.reportedByName || 'someone') + ', '
      + esc(at.toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })) + '</p>'
      + '<p><a href="' + esc(link) + '">Open the job</a></p>'
  };

  const uids = members.map((m) => uidOf[m.id]).filter(Boolean);
  const out = await send(deps, { uids, type: 'maintJob', by: job.reportedBy || '', siteId: job.siteId || '',
    data: { where: job.where || '', what: job.what || '', url: 'maintenance.html#' + jobId, tag: jobId },
    emailFor: () => mail });

  /* On the team, in the address book, but never signed in: no phone and
     no switches, so F-129's email, one each. */
  let extra = 0;
  for (const m of members) {
    if (uidOf[m.id] || !m.email) continue;
    const r = await deps.email({ to: [m.email], subject: mail.subject, html: mail.html }, { kind: 'notify-maintJob' });
    if (r && r.ok) extra++;
  }
  if (!members.length) {
    const s = await db.collection('churchSettings').doc('details').get();
    const office = s.exists ? String(s.data().enquiryEmail || '') : '';
    if (office) {
      const r = await deps.email({ to: [office], subject: mail.subject, html: mail.html }, { kind: 'notify-maintJob-office' });
      if (r && r.ok) extra++;
    }
  }
  return { ...out, emailed: out.emailed + extra };
}

/* ----------------- who gets told: care, concerns, prayer, hellos ---- */

/* Martin, 14 Oct 2026 (NEXT-BRIEF §24, "WHO GETS TOLD"). When something
   arrives, the people the church named for it are told WHICH KIND, and
   nothing else - never who, never the words. "This was in the original
   concerns spec and was never built."

     request for pastoral care   careRouting/main.care     people + address
     pastoral concern            careRouting/main.pastoral people + address
     safeguarding concern        the safeguarding lead and deputy ONLY
     prayer request              careRouting/main.prayer   people + address,
                                 and the prayer team if the person chose it
     a visitor's hello           the welcomers (welcomeSettings/main)

   NEVER THE CHURCH OFFICE OR ANY ADMIN INBOX for the first four: they can
   involve domestic violence or abuse, and the office may be a part-time
   volunteer. Nobody named and no address -> the safeguarding lead and
   deputy. No lead either -> nobody, and the rules refuse the message in
   the first place (sgLeadSet). Only a hello may fall back to the office's
   enquiry address, for its copy.

   Never the person who raised it or the person it is about. The log
   records no sender. A part the church has switched off sends nothing; the
   master switch makes it a dry run - for the named addresses too. */
async function featureOff(db, name) {
  try {
    const f = await db.collection('churchSettings').doc('features').get();
    return f.exists && f.data()[name] === false;
  } catch (e) { return false; }
}
async function teamUids(db, team) {
  if (!team) return [];
  const snap = await db.collection('users').where('teams', 'array-contains', team).get();
  return snap.docs.filter((d) => d.data().status === 'active').map((d) => d.id);
}
/* The safeguarding lead and deputy, as uids. */
async function leadUids(db) {
  const sg = await db.collection('safeguardingSettings').doc('defaults').get();
  const site = sg.exists ? String(sg.data().leadSiteId || '') : '';
  if (!site) return [];
  const b = await db.collection('bookingSettings').doc(site).get();
  const ids = b.exists ? ['safeguardingLead', 'safeguardingDeputy'].map((k) => b.data()[k]).filter(Boolean) : [];
  return Object.values(await uidsForMembers(db, ids));
}
/* The people and the address named for one kind. */
async function named(db, kind) {
  const r = await db.collection('careRouting').doc('main').get();
  const k = (r.exists && r.data()[kind]) || {};
  const ids = Array.isArray(k.memberIds) ? k.memberIds.filter(Boolean) : [];
  return { uids: Object.values(await uidsForMembers(db, ids)), email: String(k.email || '').trim() };
}
/* Tell them. An address is emailed the same plain words as a phone. */
async function careSend(deps, { what, uids, email, not }) {
  const keep = [...new Set(uids)].filter((u) => u && !not.includes(u));
  const out = await send(deps, { uids: keep, type: 'care', by: '', siteId: '', data: { what } });
  if (email) {
    if (deps.dryRun) {
      out.wouldEmail = (out.wouldEmail || 0) + 1;
    } else {
      const words = Core.message('care', { what });
      const link = deps.hub + words.url;
      const r = await deps.email({ to: [email], subject: words.title,
        html: '<p style="font-size:16px">' + esc(words.title) + '.</p><p><a href="' + esc(link) + '">Open it to read it</a></p>' },
        { kind: 'notify-care-address' });
      if (r && r.ok) out.emailed = (out.emailed || 0) + 1;
    }
  }
  return out;
}

export async function onWorry(deps, id, w) {
  const { db } = deps;
  if (!w || ['pastoral', 'care', 'safeguarding'].indexOf(w.kind) === -1) return null;
  if (await featureOff(db, 'care')) return null;
  if (!(await once(db, 'worry_' + id, {}, deps.dryRun))) return null;
  const about = w.aboutMemberId ? Object.values(await uidsForMembers(db, [w.aboutMemberId])) : [];
  const not = [w.by].concat(about);
  const what = w.kind === 'care' ? 'care' : 'concern';
  if (w.kind === 'safeguarding') return careSend(deps, { what, uids: await leadUids(db), email: '', not });
  const n = await named(db, w.kind);
  if (!n.uids.length && !n.email) return careSend(deps, { what, uids: await leadUids(db), email: '', not });
  return careSend(deps, { what, uids: n.uids, email: n.email, not });
}

export async function onPrayer(deps, id, p) {
  const { db } = deps;
  if (!p) return null;
  if (await featureOff(db, 'prayer')) return null;
  if (!(await once(db, 'prayer_' + id, {}, deps.dryRun))) return null;
  const n = await named(db, 'prayer');
  let uids = n.uids;
  if (p.share === 'prayerTeam') {
    const s = await db.collection('prayerSettings').doc('main').get();
    uids = uids.concat(await teamUids(db, s.exists ? String(s.data().prayerTeam || '') : ''));
  }
  if (!uids.length && !n.email) uids = await leadUids(db);
  return careSend(deps, { what: 'prayer', uids, email: n.email, not: [p.by] });
}

/* A visitor's hello (newhere.html): the welcomers the church chose
   (welcomeSettings/main) are told one has come - no details. The church's
   copy WITH the details is the events window's publicMailNewHere
   (functions/public-mail.js, F-168), so it is not sent here too. */
export async function onHello(deps, id, h) {
  const { db } = deps;
  if (!h) return null;
  if (await featureOff(db, 'newHere')) return null;
  if (!(await once(db, 'hello_' + id, {}, deps.dryRun))) return null;
  const m = await db.collection('welcomeSettings').doc('main').get();
  const ids = m.exists && Array.isArray(m.data().memberIds) ? m.data().memberIds : [];
  const out = await careSend(deps, { what: 'hello', uids: Object.values(await uidsForMembers(db, ids)), email: '', not: [h.uid || ''] });
  return out;
}

/* IS A SAFEGUARDING LEAD SET? careRouting/status, which anyone signed in
   may read, so a form can say "this cannot be sent" before it is - the
   safeguarding settings themselves are a volunteer's to read. Written only
   when the answer changes. */
export async function refreshCareStatus(db) {
  /* As the rules' sgLeadSet() asks it: a lead named on the lead site,
     whether or not they have signed in yet. leadIds are the lead's and
     deputy's address book ids - not private (the 999 line names the lead) -
     so a page can tell its reader is one of them without the safeguarding
     settings, which are a volunteer's to read. */
  const sg = await db.collection('safeguardingSettings').doc('defaults').get();
  const site = sg.exists ? String(sg.data().leadSiteId || '') : '';
  let leadSet = false, leadIds = [];
  if (site) {
    const b = await db.collection('bookingSettings').doc(site).get();
    if (b.exists) {
      leadSet = !!b.data().safeguardingLead;
      leadIds = ['safeguardingLead', 'safeguardingDeputy'].map((k) => b.data()[k]).filter(Boolean);
    }
  }
  const ref = db.collection('careRouting').doc('status');
  const now = await ref.get();
  if (now.exists && now.data().leadSet === leadSet
      && JSON.stringify(now.data().leadIds || []) === JSON.stringify(leadIds)) return leadSet;
  await ref.set({ leadSet, leadIds, at: new Date().toISOString() });
  return leadSet;
}

/* -------------------------------------------------- an urgent notice */

/* Everyone the notice is for, as the hub's forMe() decides it: a notice
   with no teams is for everybody active; otherwise for those teams, and
   master admins. Sent once, when the notice first becomes urgent. */
export async function onNotice(deps, id, before, after) {
  const { db } = deps;
  if (!after || after.urgent !== true || (before && before.urgent === true)) return null;
  if (!(await once(db, 'urgent_' + id, {}, deps.dryRun))) return null;
  const teams = Array.isArray(after.teams) ? after.teams.filter(Boolean) : [];
  const users = await db.collection('users').where('status', '==', 'active').get();
  const uids = users.docs.filter((d) => {
    const u = d.data();
    if (!teams.length || u.masterAdmin === true) return true;
    return (u.teams || []).some((t) => teams.includes(t));
  }).map((d) => d.id);
  return send(deps, { uids, type: 'urgent', by: after.postedBy || '', now: new Date(),
    data: { title: after.title || '', text: plainText(after.body), url: 'app.html', tag: id } });
}

/* ---------------------------------- checks running out (§24, weekly) */

/* checksDue() is the events window's, from egbc-events-safeguarding.js
   (a copy, checked against the original like notify-core). Each person
   is told at most once a fortnight per thing; each site's safeguarding
   lead gets one email listing theirs. */
export async function runChecksReminders(deps, runAt = new Date()) {
  const { db } = deps;
  const today = londonDate(runAt);
  const [checksSnap, setSnap] = await Promise.all([
    db.collection('leaderChecks').get(),
    db.collection('safeguardingSettings').doc('defaults').get()
  ]);
  const settings = setSnap.exists ? setSnap.data() : {};
  const list = checksSnap.docs.map((d) => ({ memberId: d.id, ...d.data() }));
  const siteOf = {};
  list.forEach((c) => { siteOf[c.memberId] = c.siteId || ''; });
  const due = Safeguarding.checksDue(list, { dbsYears: settings.dbsYears, trainingYears: settings.trainingYears }, today, 42);
  const uidOf = await uidsForMembers(db, due.map((x) => x.memberId));

  const fortnight = 14 * 864e5;
  const bySite = {};
  let told = 0;
  for (const x of due) {
    const ref = db.collection('checksReminded').doc(x.memberId + '_' + x.what);
    const fresh = deps.dryRun
      ? await ref.get().then((s) => !(s.exists && runAt.getTime() - Number(s.data().atMs || 0) < fortnight))
      : await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (s.exists && runAt.getTime() - Number(s.data().atMs || 0) < fortnight) return false;
        tx.set(ref, { atMs: runAt.getTime(), ends: x.ends, state: x.state });
        return true;
      });
    if (!fresh) continue;
    (bySite[siteOf[x.memberId]] = bySite[siteOf[x.memberId]] || []).push(x);
    if (uidOf[x.memberId]) {
      await send(deps, { uids: [uidOf[x.memberId]], type: 'checks', by: 'checksReminders', siteId: siteOf[x.memberId], now: runAt,
        data: { what: x.what, state: x.state, ends: x.ends, tag: x.what } });
      told++;
    }
  }

  let leads = 0;
  for (const site of Object.keys(bySite)) {
    if (!site) continue;
    const bs = await db.collection('bookingSettings').doc(site).get();
    const lead = bs.exists ? bs.data().safeguardingLead : '';
    const rec = lead ? await db.collection('addressBook').doc(lead).get() : null;
    const to = rec && rec.exists ? String(rec.data().email || '') : '';
    if (!to) continue;
    const rows = bySite[site].map((x) => '<li>' + esc(x.name || x.memberId) + ': '
      + (x.what === 'dbs' ? 'DBS check' : 'safeguarding training')
      + (x.state === 'out' ? ' ran out on ' : ' runs out on ') + esc(x.ends) + '</li>').join('');
    const r = await deps.email({ to: [to], subject: 'DBS checks and training running out',
      html: '<p>These need renewing:</p><ul>' + rows + '</ul><p><a href="' + esc(deps.hub + 'safeguarding.html') + '">Open Safeguarding</a></p>' },
      { kind: 'notify-checks-lead', siteId: site });
    if (r && r.ok) leads++;
  }
  return { due: due.length, told, leads };
}
