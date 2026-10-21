/* ===================================================================
   EGBC — sending as a team (R9; F-207 plan, F-208 as built)
   ===================================================================

   ChurchSuite lets a group send as its shared address. Calla's sendEmail
   sends every email from one fixed address ("EGBC Worship & AV
   <EGBCWorship@callasuite.uk>") and that can't change, so "as a team"
   here means (Martin, 15 Oct):
     - REPLIES go to the team's address, or to the sender when the team
       has none (Reply-To is not checked against the known list)
     - the email says it is from the team, in the subject and the words
     - a COPY goes to the team's mailbox, when it has one
     - one email per person, so nobody sees anyone else's address

   WHO MAY SEND AS A TEAM: its leads and deputies, the Pastor and the
   office admin (named people in settings, never hard-coded). A team
   marked Safeguarding: its lead and deputy ONLY (Martin, 15 Oct, firm:
   not the Pastor, the office admin or a master admin), and the hub keeps
   only the outline (when, who, subject), never the email.

   SHUT ON THE LIVE SITE UNTIL SWITCH-OVER, like payments (F-196): until
   the locked rules deploy, the settings could be changed by anybody. The
   same switch opens both (payments-gate.js PAYMENTS_LIVE).

     teamMailMine   callable, signed in: the teams I may send as
     teamMailSave   callable, master admins: the Pastor, the office admin,
                    and each team (add, rename, address, leads, deputies,
                    Safeguarding), remove; "the usual teams" to start
     sendAsTeam     callable: { teamId, to: [{ email, name }], subject,
                    text, calEventId? }

   ONE LIST OF TEAMS (the reviewing window, 15 Oct): the teams themselves -
   their names, adding, renaming, archiving - are the main window's Teams &
   Groups page, over the `teams` collection egbc-auth.js already reads. This
   file keeps ONLY each team's mail settings, keyed by the team's id (the
   `teams` document id: the team's name as the rules spell it):
     teamMailboxes/{teamId} = { address, leads, deputies, safeguarding,
                                updatedBy, updatedAt }
   The name shown is teams/{teamId}.label (or .name, or the id).
   teamMailSettings/main = { pastor, officeAdmin }. Written by these
   functions only (rules: no writes from pages). Feature name teamMail.
   The events window's file. Exported from index.js.
   =================================================================== */

import crypto from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { paymentsShut } from './payments-gate.js';
import { makeSender } from './public-mail.js';

const REGION = 'europe-west2';
const db = () => getFirestore();
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const SHUT_MSG = 'Team emails open when the hub goes live.';
const MAX_TO = 300;
/* Martin's list (15 Oct), offered to a church with none yet. */
export const USUAL_TEAMS = ['Safeguarding', 'Worship Team', 'Pastoral', 'Church office', 'Admin', 'Hospitality', 'Kids Church', 'Youth Worship', 'Welcome team', 'Maintenance'];

/* The live site: shut until switch-over. The emulator: open, unless a
   test asks (teamMailSettings/config.shutForTest, never read live). */
async function shut() {
  if (paymentsShut()) return true;
  if (!EMULATOR) return false;
  const c = await db().collection('teamMailSettings').doc('config').get();
  return !!(c.exists && c.data().shutForTest === true);
}
async function whoAmI(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const u = await db().collection('users').doc(uid).get();
  const d = u.exists ? u.data() : null;
  if (!d || d.status !== 'active') throw new HttpsError('permission-denied', 'Your account is not active.');
  return { uid, user: d, memberId: String(d.memberId || '') };
}
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* May this person send as this team? Its leads and deputies; for any
   team but Safeguarding, also the Pastor and the office admin. A
   Safeguarding team: its lead and deputy ONLY - not the Pastor, not the
   office admin, not a master admin (Martin, 15 Oct, firm). Being a master
   admin never counts on its own. */
export function maySend(team, settings, memberId) {
  if (!team || !memberId) return false;
  if ((team.leads || []).includes(memberId) || (team.deputies || []).includes(memberId)) return true;
  if (team.safeguarding) return false;
  if (settings && settings.pastor && settings.pastor === memberId) return true;
  if (settings && settings.officeAdmin && settings.officeAdmin === memberId) return true;
  return false;
}
/* A team's name, from the one list of teams (teams/{id}). */
async function namesOf() {
  const t = await db().collection('teams').get(), out = {};
  t.docs.forEach((d) => { const x = d.data() || {}; out[d.id] = { name: String(x.label || x.name || d.id), archived: x.archived === true, order: typeof x.order === 'number' ? x.order : 999 }; });
  return out;
}
async function loadAll() {
  const [t, s, names] = await Promise.all([db().collection('teamMailboxes').get(), db().collection('teamMailSettings').doc('main').get(), namesOf()]);
  /* Every team on the one list, with its mail settings if it has any (a
     team with none: no address, no leads - the Pastor and the office admin
     may still send as it, replies going to them). */
  const mail = {}; t.docs.forEach((d) => { mail[d.id] = d.data(); });
  const idsAll = Array.from(new Set(Object.keys(names).concat(Object.keys(mail))));
  return {
    teams: idsAll.map((id) => ({ id, leads: [], deputies: [], ...(mail[id] || {}), name: (names[id] || {}).name || id, archived: !!(names[id] || {}).archived, order: (names[id] || {}).order || 999 })),
    settings: s.exists ? s.data() : {}
  };
}

export const teamMailMine = onCall({ region: REGION }, async (req) => {
  const me = await whoAmI(req);
  const { teams, settings } = await loadAll();
  return {
    shut: await shut(),
    teams: teams.filter((t) => !t.archived && maySend(t, settings, me.memberId)).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)))
      .map((t) => ({ id: t.id, name: t.name, hasAddress: !!t.address, safeguarding: !!t.safeguarding }))
  };
});

/* Settings: master admins only, and shut until switch-over. */
const ids = (v) => (Array.isArray(v) ? v : []).map((x) => String(x || '').trim()).filter((x) => /^[A-Za-z0-9_-]{1,80}$/.test(x)).slice(0, 20);
export const teamMailSave = onCall({ region: REGION }, async (req) => {
  if (await shut()) throw new HttpsError('failed-precondition', SHUT_MSG, { shut: true });
  const me = await whoAmI(req);
  if (me.user.masterAdmin !== true) throw new HttpsError('permission-denied', 'Only a master admin sets up team emails.');
  const d = req.data || {}, by = { updatedBy: me.uid, updatedAt: FieldValue.serverTimestamp() };
  if (d.settings) {
    await db().collection('teamMailSettings').doc('main').set({ pastor: ids([d.settings.pastor])[0] || '', officeAdmin: ids([d.settings.officeAdmin])[0] || '', ...by });
    return { ok: true };
  }
  /* Teams are added, renamed and removed on Teams & Groups, never here:
     this saves (or clears) one team's mail settings, by the team's id. */
  const teamId = String((d.team && d.team.id) || d.clear || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 &'()._-]{0,79}$/.test(teamId)) throw new HttpsError('invalid-argument', 'Which team?');
  const ref = db().collection('teamMailboxes').doc(teamId);
  if (d.clear) { await ref.delete(); return { ok: true }; }
  const t = d.team, address = String(t.address || '').trim().toLowerCase().slice(0, 200);
  if (address && !emailOk(address)) throw new HttpsError('invalid-argument', 'That email address does not look right.');
  await ref.set({ address, leads: ids(t.leads), deputies: ids(t.deputies), safeguarding: t.safeguarding === true, ...by });
  return { ok: true, id: teamId };
});

/* The email itself, built here from plain words (nobody's HTML). */
export function teamEmail({ team, church, senderName, text, about, copy, count }) {
  const body = esc(text).replace(/\n/g, '<br>');
  const reply = team.address ? 'Reply to this email to reach the ' + esc(team.name) + ' team.' : 'Reply to this email to reach ' + esc(senderName) + '.';
  return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827">' +
    (copy ? '<p style="background:#eef5f4;padding:8px 10px;border-radius:6px">A copy for the ' + esc(team.name) + ' team: sent by ' + esc(senderName) + ' to ' + count + ' ' + (count === 1 ? 'person' : 'people') + '.</p>' : '') +
    '<p style="color:#3d6263;font-weight:600;margin:0 0 12px">From the ' + esc(team.name) + ' team' + (church ? ', ' + esc(church) : '') + '</p>' +
    '<p>' + body + '</p>' + (about ? '<p style="color:#6b7280;font-size:13px">' + esc(about) + '</p>' : '') +
    '<p style="color:#6b7280;font-size:13px">' + esc(senderName) + ', for the ' + esc(team.name) + ' team. ' + reply + '</p></div>';
}

export const sendAsTeam = onCall({ region: REGION }, async (req) => {
  if (await shut()) throw new HttpsError('failed-precondition', SHUT_MSG, { shut: true });
  const me = await whoAmI(req);
  const d = req.data || {};
  const teamId = String(d.teamId || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9 &'()._-]{0,79}$/.test(teamId)) throw new HttpsError('not-found', 'That team is not there any more.');
  const [ts, tn] = await Promise.all([db().collection('teamMailboxes').doc(teamId).get(), db().collection('teams').doc(teamId).get()]);
  /* A team on the one list, or one with mail settings. */
  if (!ts.exists && !tn.exists) throw new HttpsError('not-found', 'That team is not there any more.');
  const tx = tn.exists ? tn.data() || {} : {};
  if (tx.archived === true) throw new HttpsError('failed-precondition', 'That team has been archived.');
  const team = { id: teamId, leads: [], deputies: [], ...(ts.exists ? ts.data() : {}), name: String(tx.label || tx.name || teamId) };
  const settings = (await db().collection('teamMailSettings').doc('main').get()).data() || {};
  if (!maySend(team, settings, me.memberId)) throw new HttpsError('permission-denied', 'You can\'t send as the ' + team.name + ' team.');
  const seen = {}, to = (Array.isArray(d.to) ? d.to : []).map((x) => ({ email: String((x && x.email) || '').trim(), name: String((x && x.name) || '').slice(0, 120) }))
    .filter((x) => emailOk(x.email) && !seen[x.email.toLowerCase()] && (seen[x.email.toLowerCase()] = 1));
  if (!to.length) throw new HttpsError('invalid-argument', 'Nobody to send to.');
  if (to.length > MAX_TO) throw new HttpsError('invalid-argument', 'At most ' + MAX_TO + ' people at once.');
  const subjectIn = String(d.subject || '').trim().slice(0, 150), text = String(d.text || '').trim().slice(0, 5000);
  if (!subjectIn || !text) throw new HttpsError('invalid-argument', 'Write a subject and a message.');
  const church = ((await db().collection('churchSettings').doc('details').get()).data() || {}).name || '';
  const senderName = String(me.user.name || 'Someone').slice(0, 120);
  const replyTo = team.address || String(me.user.email || '');
  const subject = team.name + ': ' + subjectIn;
  const about = String(d.about || '').slice(0, 200);
  const send = makeSender({ db: db() });
  const batch = 'tm_' + crypto.randomBytes(6).toString('hex');
  const meta = { source: 'team-mail', kind: 'team email', asTeam: team.name, sentBy: senderName, sentByUid: me.uid, batch,
    calEventId: String(d.calEventId || ''), outlineOnly: team.safeguarding === true };
  let sent = 0, failed = 0;
  for (const r of to) {
    const out = await send({ to: [r.email], subject, html: teamEmail({ team, church, senderName, text, about }), replyTo }, meta);
    if (out.ok) sent++; else failed++;
  }
  let copied = false;
  if (team.address) {
    const out = await send({ to: [team.address], subject: '[Copy] ' + subject, html: teamEmail({ team, church, senderName, text, about, copy: true, count: to.length }), replyTo }, { ...meta, kind: 'team email copy' });
    copied = !!out.ok;
  }
  return { ok: true, sent, failed, copied, replyTo: team.address ? 'team' : 'you' };
});
