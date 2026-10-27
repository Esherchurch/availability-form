/* ===================================================================
   HEALTH AND SAFETY REMINDERS (the reviewing window's job 2, item 5;
   like safeguarding's two-days-before email)
   ===================================================================
   Every morning at 08:15, with building compliance switched on:

     a building's own H&S or fire assessment
       review due within 6 weeks   its lead (and the H&S deputy), once
       review overdue              the same, once a month until reviewed
       signed, not countersigned   the trustees, after 2 days, then every
                                   2 weeks while it waits
     an event's assessment
       signed by the organiser,    the building's H&S lead and deputy,
       not approved                when the event is 14 days off or less,
                                   and again 2 days before

   The fire assessment's lead is the building's fire safety lead (the H&S
   lead when there is none). Each email is sent once, marked in
   raReminded/{key} (this job only; nobody reads it). It says what and
   when, with the link: never anything from the assessment itself.
   For any church: the trustees are the trustees job's teams.

   The events window's file. Exported from index.js.
   =================================================================== */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { makeSender } from './public-mail.js';
import { hubUrl } from './notify.js';
import { featureOn } from './compliance.js';
import { readTeamJobs, teamsFor } from './team-jobs.js';
import { addDays, words } from './checklist-reminders.js';

const REGION = 'europe-west2';
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLE = { hs: 'health and safety risk assessment', fire: 'fire risk assessment' };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const dayOf = (t) => (t && t.toDate ? londonDay(t.toDate()) : typeof t === 'string' ? t.slice(0, 10) : '');

/* the review's stage today: '' (not yet), 'soon' (within 6 weeks) or 'overdue' */
export function reviewStage(due, today) {
  if (!due) return '';
  if (due < today) return 'overdue';
  return due <= addDays(today, 42) ? 'soon' : '';
}

async function emailsOf(db, memberIds) {
  const out = [];
  for (const mid of [...new Set(memberIds.filter(Boolean))]) {
    const a = (await db.collection('addressBook').doc(String(mid)).get()).data();
    if (a && a.email) out.push(String(a.email).trim().toLowerCase());
  }
  return [...new Set(out)];
}
/* the trustees: active people on (or covering) the trustees job's teams, 500 at most */
async function trusteeEmails(db) {
  const tj = await readTeamJobs(db);
  const s = (await db.collection('safeguardingSettings').doc('defaults').get()).data() || {};
  const teams = teamsFor(tj.map, 'trustees', Object.assign({}, tj.set, { trusteeTeam: s.trusteeTeam || 'Elders' })).slice(0, 30);
  if (!teams.length) return [];
  const ids = new Set();
  for (const f of ['teams', 'covers']) {
    const q = await db.collection('users').where(f, 'array-contains-any', teams).limit(500).get().catch(() => ({ docs: [] }));
    q.docs.forEach((d) => { const u = d.data(); if (u.status === 'active' && u.memberId) ids.add(u.memberId); });
  }
  return emailsOf(db, [...ids]);
}

/* The work, with what it needs passed in, so a test can run it on any day. */
export async function runRaReminders({ db, send, now, hub }) {
  if (!(await featureOn(db))) return { off: true, sent: [] };
  /* never a reminder without its link (the hub's address is made at setup) */
  if (!hub) { console.error('H&S reminders: the hub has no address yet, so nothing was sent.'); return { error: 'no hub address', sent: [] }; }
  const today = londonDay(now || new Date()), sent = [];
  let trustees = null;
  const once = async (key, to, subject, lines, link) => {
    const mark = db.collection('raReminded').doc(key);
    if ((await mark.get()).exists) return;
    const html = lines.map((l) => '<p>' + l + '</p>').join('') + '<p><a href="' + esc(link) + '">' + esc(link) + '</a></p>';
    const r = to.length ? await send({ to, subject, html }, { source: 'hs', kind: 'hs-reminder', ref: key }) : { ok: false, error: 'nobody to tell' };
    await mark.set({ at: new Date().toISOString(), subject, count: to.length, ok: !!(r && r.ok), error: (r && r.error) || '' });
    sent.push({ key, to: to.length, ok: !!(r && r.ok) });
  };

  const sites = (await db.collection('sites').where('active', '==', true).get()).docs.slice(0, 500);
  for (const sd of sites) {
    const site = Object.assign({ id: sd.id }, sd.data()), name = String(site.name || 'the building').slice(0, 120);
    const roles = (await db.collection('raSiteRoles').doc(site.id).get()).data() || {};
    for (const kind of ['hs', 'fire']) {
      const a = (await db.collection('raAssessments').doc(site.id + '__' + kind).get()).data();
      if (!a) continue;
      const link = hub + 'assessment.html?site=' + encodeURIComponent(site.id) + '&kind=' + kind, what = 'The ' + TITLE[kind] + ' for ' + esc(name);
      if (a.status === 'countersigned') {
        const st = reviewStage(a.reviewDue, today);
        if (!st) continue;
        const leads = kind === 'fire' ? [roles.fireLead || roles.hsLead, roles.hsDeputy] : [roles.hsLead, roles.hsDeputy];
        await once(site.id + '__' + kind + '__v' + a.version + '__' + (st === 'soon' ? 'soon' : 'overdue_' + today.slice(0, 7)), await emailsOf(db, leads),
          (st === 'soon' ? 'Review due soon: ' : 'Review overdue: ') + TITLE[kind] + ', ' + name,
          [what + (st === 'soon' ? ' is due for review by <strong>' + esc(words(a.reviewDue)) + '</strong>.' : ' was due for review on <strong>' + esc(words(a.reviewDue)) + '</strong> and has not been reviewed.'),
            'Open it, check every section, and sign the new version. A trustee then countersigns it.'], link);
      } else if (a.status === 'signed') {
        const on = dayOf(a.signedAt), waited = on ? daysBetween(on, today) : 0;
        if (waited < 2) continue;
        if (trustees === null) trustees = await trusteeEmails(db);
        await once(site.id + '__' + kind + '__v' + a.version + '__counter_' + Math.floor((waited - 2) / 14), trustees,
          'To countersign: ' + TITLE[kind] + ', ' + name,
          [what + ' was signed by ' + esc(a.signedByName || 'its lead') + ' on ' + esc(words(on)) + ', and is waiting for a trustee to countersign it.',
            'Any trustee who did not sign it may countersign.'], link);
      }
    }
  }

  /* events: signed by the organiser, waiting for the building's H&S lead */
  const evs = await db.collection('raEvents').where('status', '==', 'signed').limit(500).get().catch(() => ({ docs: [] }));
  for (const d of evs.docs) {
    const r = d.data(), ev = (await db.collection('calEvents').doc(d.id).get()).data();
    if (!ev || ev.status === 'cancelled') continue;
    const evDay = String(ev.startLocal || '').slice(0, 10), left = /^\d{4}-\d{2}-\d{2}$/.test(evDay) ? daysBetween(today, evDay) : -1;
    if (left < 0 || left > 14) continue;
    const roles = (await db.collection('raSiteRoles').doc(String(r.approverSiteId || (ev.location || {}).siteId || '-')).get()).data() || {};
    const title = String(ev.title || 'An event').slice(0, 120);
    await once('ev_' + d.id + '__v' + (r.version || 1) + (left <= 2 ? '__last' : '__approve'), await emailsOf(db, [roles.hsLead, roles.hsDeputy]),
      'To approve: the risk assessment for ' + title,
      ['The risk assessment for <strong>' + esc(title) + '</strong> on ' + esc(words(evDay)) + ' was signed by its organiser' + (r.signedByName ? ' (' + esc(r.signedByName) + ')' : '') + ', and is waiting for the health and safety lead to approve it.'],
      hub + 'event-ra.html?event=' + encodeURIComponent(d.id));
  }
  return { sent };
}

export const raRemindersDaily = onSchedule({ region: REGION, schedule: '15 8 * * *', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  const db = getFirestore();
  const r = await runRaReminders({ db, send: makeSender({ db }), now: new Date(), hub: await hubUrl(db) });
  if (r.sent && r.sent.length) console.log('H&S reminders: ' + r.sent.length);
});
