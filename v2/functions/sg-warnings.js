/* ===================================================================
   THE SAFEGUARDING RISK REGISTER, step 3: live warnings (F-265)
   ===================================================================
     sgWarningsSync   every 15 minutes: each site's warnings, as counts,
                      dates and links (sgWarnings/{siteId}) - read by the
                      site's lead and deputy, the trustees and master admins,
                      who never see the names behind them here
     sgWarningsNow    callable { siteId }: the same, now (the register's
                      "Refresh"), for that site's lead, deputy, a trustee or a
                      master admin
     sgTwoAdultsDaily every morning: a session two days on still short of two
                      adults (or of the ratio) emails the site's lead and
                      deputy, once (Martin, 22 Oct)
   It reads what the hub already holds - check-ins, leaders checked in,
   leader checks, consent dates, events and their named leaders, the
   register's own risks - with the Admin SDK, and writes only counts.
   No new secret or setting. Off with the safeguarding switch.

   STEP 4, THE DIALS (F-265 part B): the same run writes sgDashboard/{siteId}
   - six dials (checks, sessions, consent, assessments, the annual review,
   incident follow-ups), the last 8 weeks' sessions and consent per group,
   as counts. An incident gives only its date and whether it has a
   follow-up; concerns are never read. The 8 weeks before today are read
   once a day and kept; today's are read every time.
   =================================================================== */
import { createRequire } from 'node:module';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { featureOn } from './features.js';
import { makeSender } from './public-mail.js';
import { hubUrl } from './notify.js';

const require = createRequire(import.meta.url);
const Core = require('./sg-warnings-core.cjs');
const REGION = 'europe-west2';
const db = () => getFirestore();
const SG_KINDS = ['trip', 'overnight', 'holidayclub', 'offsite'];

export function londonDay(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day;
}
async function settingsOf(dbi) {
  const s = (await dbi.collection('safeguardingSettings').doc('defaults').get()).data() || {};
  return { ratioAll: s.ratioAll || 5, ratioUnder8: s.ratioUnder8 || 4, dbsYears: s.dbsYears || 3, trainingYears: s.trainingYears || 3,
    dueSoonDays: ((s.register || {}).dueSoonDays) || 42, dials: ((s.register || {}).dials) || {}, trusteeTeam: s.trusteeTeam || 'Elders' };
}
const rows = (q) => q.get().then((s) => s.docs.map((d) => Object.assign({ id: d.id }, d.data())), () => []);

/* this site's under-18s events in the next `days` (named leaders, places booked, sign-off) */
async function eventsAt(dbi, siteId, today, days) {
  const from = Date.parse(today + 'T00:00:00Z') - 864e5, to = from + (days + 2) * 864e5;
  const evs = (await rows(dbi.collection('calEvents').where('startUtc', '>=', from).where('startUtc', '<=', to)))
    .filter((e) => (e.location || {}).siteId === siteId && e.status !== 'cancelled');
  const out = [];
  for (const e of evs) {
    const l = (await dbi.collection('eventLeaders').doc(e.id).get()).data();
    if (!l || l.under18 !== true) continue;
    const sus = await rows(dbi.collection('signups').where('calEventId', '==', e.id));
    /* one per attendee, as the event's own pages count them (EGBCCheckin.people) */
    const children = sus.filter((x) => x.status === 'confirmed').reduce((a, x) => a + ((x.attendees || []).length || 1), 0);
    let signedOff = true;
    const needs = SG_KINDS.includes(e.sgKind || '');
    if (needs) { const a = (await dbi.collection('sgAssessments').doc(e.id).get()).data(); signedOff = !!(a && (a.status === 'signed' || a.waived)); }
    out.push({ id: e.id, title: String(e.title || 'An event').slice(0, 80), day: String(e.startLocal || '').slice(0, 10) || new Date(e.startUtc).toISOString().slice(0, 10),
      children, leaders: (l.leaders || []).length || (l.leaderIds || []).length, leaderIds: l.leaderIds || [], needsSignoff: needs, signedOff });
  }
  return out;
}

/* a read that fails is "could not be read", never a zero */
const must = (q) => q.get().then((s) => s.docs.map((d) => Object.assign({ id: d.id }, d.data())));
/* the 8 weeks before today: each Sunday group's sessions (children and leaders who came) */
async function history(dbi, siteId, today, groupIds) {
  const from = Core.plus(today, -56), out = {};
  const kids = await must(dbi.collection('checkins').where('day', '>=', from));
  kids.forEach((c) => {
    if (c.siteId !== siteId || c.kind !== 'child' || c.day >= today || !groupIds.includes(c.groupId)) return;
    const k = c.groupId + '|' + c.day; (out[k] = out[k] || { groupId: c.groupId, day: c.day, children: 0, leaders: 0 }).children++;
  });
  /* kidsLeaderIns/<site>_<day>_<member>: read by id, so no new index */
  const leads = await must(dbi.collection('kidsLeaderIns').where(FieldPath.documentId(), '>=', siteId + '_' + from).where(FieldPath.documentId(), '<', siteId + '_' + today));
  leads.forEach((l) => { const k = l.groupId + '|' + l.day; if (out[k]) out[k].leaders++; });
  return Object.values(out);
}
/* the church-wide annual review, this year and last */
export async function reviewNow(dbi, today) {
  const y = +today.slice(0, 4);
  const [now, last] = await Promise.all([must(dbi.collection('sgReviews').where('year', '==', y)), must(dbi.collection('sgReviews').where('year', '==', y - 1))]);
  return Core.reviewFrom({ records: now, lastYear: last, today });
}

export async function siteWarnings({ db: dbi, siteId, today, review }) {
  const st = await settingsOf(dbi), unread = {};
  const [activities, groups, kidsToday, leadToday, planGroups, children, risks] = await Promise.all([
    rows(dbi.collection('sgActivities').where('siteId', '==', siteId)),
    rows(dbi.collection('kidsGroups').where('siteId', '==', siteId)).then((g) => g.filter((x) => x.active !== false)),
    rows(dbi.collection('checkins').where('day', '==', today).where('kind', '==', 'child')).then((c) => c.filter((x) => x.siteId === siteId)),
    rows(dbi.collection('kidsLeaderIns').where('siteId', '==', siteId).where('day', '==', today)),
    rows(dbi.collection('planGroups').where('siteId', '==', siteId)).then((g) => g.filter((x) => !x.archived && (x.kind === 'children' || x.kind === 'youth'))),
    must(dbi.collection('kidsChildren').where('siteId', '==', siteId)).then((c) => c.filter((x) => x.status === 'registered'), () => { unread.consent = 'Not a zero: the children’s records could not be read just now.'; return []; }),
    rows(dbi.collection('sgRisks').where('siteId', '==', siteId))
  ]);
  const kidsIn = kidsToday.filter((x) => x.state === 'in'), leadIns = leadToday.filter((x) => x.state === 'in');
  /* hirers who work with children and have no safeguarding policy in date: only then are the next 30 days' bookings read (by date, so no new index) */
  const hirers = (await rows(dbi.collection('hirers').where('siteId', '==', siteId))).filter((h) => h.active !== false && h.withChildren === true && !Core.hirerPolicyOk(h, today));
  if (hirers.length) {
    const booked = new Set((await rows(dbi.collection('bookings').where('day', '>=', today).where('day', '<=', Core.plus(today, 30))))
      .filter((b) => b.siteId === siteId && b.kind === 'hire' && !['declined', 'cancelled'].includes(b.status)).map((b) => String((b.requester || {}).email || '').toLowerCase()).filter(Boolean));
    hirers.forEach((h) => { h.booked = booked.has(String(h.email || '').toLowerCase()); });
  }
  const events = await eventsAt(dbi, siteId, today, 60);
  const childrenIn = {}, leadersIn = {};
  kidsIn.forEach((c) => { childrenIn[c.groupId] = (childrenIn[c.groupId] || 0) + 1; });
  leadIns.forEach((l) => { leadersIn[l.groupId] = (leadersIn[l.groupId] || 0) + 1; });
  const leaderMids = [...new Set([].concat(...groups.map((g) => g.leaderIds || []), ...planGroups.map((g) => g.leaderIds || []), ...events.map((e) => e.leaderIds || [])).filter(Boolean))];
  const checks = {};
  for (let i = 0; i < leaderMids.length; i += 10) {
    const part = leaderMids.slice(i, i + 10);
    const got = await dbi.getAll(...part.map((m) => dbi.collection('leaderChecks').doc(m)));
    got.forEach((d) => { if (d.exists) checks[d.id] = d.data(); });
  }
  const gs = groups.map((g) => ({ id: g.id, name: String(g.name || 'A group').slice(0, 80), ratio: g.ratio, leaderIds: g.leaderIds || [] }));
  const consent = children.map((c) => ({ groupId: c.groupId, consentUntil: c.consentUntil || '' }));
  const w = Core.warningsFrom({ today, settings: st,
    activities: activities.map((a) => ({ id: a.id, link: a.link || {} })),
    groups: gs, childrenIn, leadersIn, events, leaderMids, checks, consent,
    hirers: hirers.map((h) => ({ withChildren: true, documents: (h.documents || []).map((x) => ({ kind: x.kind, expires: x.expires || '' })), booked: !!h.booked })),
    risks: risks.map((r) => ({ id: r.id, activityId: r.activityId, reviewDue: r.reviewDue || '', status: r.status })) });

  /* THE DIALS */
  const prev = (await dbi.collection('sgDashboard').doc(siteId).get().catch(() => null));
  const old = prev && prev.exists ? prev.data() : {};
  let hist = old.histDay === today && Array.isArray(old.hist) ? old.hist : null;
  if (!hist) hist = await history(dbi, siteId, today, groups.map((g) => g.id)).catch(() => { unread.sessions = 'Not a zero: the check-ins could not be read just now.'; return null; });
  const todays = {};
  kidsToday.forEach((c) => { if (c.groupId) (todays[c.groupId] = todays[c.groupId] || { groupId: c.groupId, day: today, children: 0, leaders: 0 }).children++; });
  leadToday.forEach((l) => { if (todays[l.groupId]) todays[l.groupId].leaders++; });
  /* incidents: only when each was made and whether it has a follow-up */
  const incidents = await must(dbi.collection('incidents').where('siteId', '==', siteId))
    .then((x) => x.map((i) => ({ created: String(i.createdAt || i.happenedAt || '').slice(0, 10), followed: !!String(i.followUp || '').trim() })), () => { unread.incidents = 'Not a zero: the incidents could not be read just now.'; return []; });
  const d = Core.dialsFrom({ today, settings: st, leaderMids, checks, groups: gs, sessions: (hist || []).concat(Object.values(todays)), consent,
    assess: events.filter((e) => e.needsSignoff && Core.daysTo(today, e.day) >= 0).map((e) => ({ signed: e.signedOff })),
    review: review || (await reviewNow(dbi, today)), incidents, unread });
  return { items: w.items, controls: w.controls, dash: Object.assign(d, { hist: hist || [], histDay: hist ? today : '' }) };
}

export async function runSgWarnings({ db: dbi, at = new Date(), siteIds }) {
  const today = londonDay(at);
  const ids = siteIds || (await rows(dbi.collection('sites').where('active', '==', true))).map((s) => s.id);
  const done = [], review = await reviewNow(dbi, today);
  for (const siteId of ids) {
    const w = await siteWarnings({ db: dbi, siteId, today, review });
    await dbi.collection('sgWarnings').doc(siteId).set({ siteId, items: w.items.slice(0, 100), controls: w.controls, today, at: at.toISOString() });
    await dbi.collection('sgDashboard').doc(siteId).set({ siteId, dials: w.dash.dials, sessions: w.dash.sessions, consentByGroup: w.dash.consentByGroup,
      review: { done: review.done, of: review.of, status: review.status, due: review.due, items: review.items },
      hist: w.dash.hist, histDay: w.dash.histDay, today, at: at.toISOString() });
    done.push({ siteId, count: w.items.length });
  }
  return done;
}

export const sgWarningsSync = onSchedule({ region: REGION, schedule: 'every 15 minutes', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  if (!(await registerOn(db()))) return;
  await runSgWarnings({ db: db() });
});

/* the register follows its own switch (main's safeguardingRegister, F-268), inside safeguarding's */
export async function registerOn(dbi) { return (await featureOn(dbi, 'safeguarding')) && (await featureOn(dbi, 'safeguardingRegister')); }

/* who may refresh a site's warnings: as the rules' sgRegSees() */
export async function maySee(dbi, uid, siteId) {
  const u = (await dbi.collection('users').doc(uid).get()).data() || {};
  if (u.status !== 'active') return false;
  if (u.masterAdmin === true) return true;
  const b = (await dbi.collection('bookingSettings').doc(String(siteId)).get()).data() || {};
  if (u.memberId && (b.safeguardingLead === u.memberId || b.safeguardingDeputy === u.memberId)) return true;
  return (u.teams || []).includes((await settingsOf(dbi)).trusteeTeam);
}
export const sgWarningsNow = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const siteId = String((req.data || {}).siteId || '');
  if (!siteId || siteId.includes('/')) throw new HttpsError('invalid-argument', 'Which site?');
  if (!(await maySee(db(), req.auth.uid, siteId))) throw new HttpsError('permission-denied', 'This is for the safeguarding lead and deputy, and the trustees.');
  if (!(await registerOn(db()))) throw new HttpsError('failed-precondition', 'Safeguarding, or its risk register, is turned off for this church.');
  const r = await runSgWarnings({ db: db(), siteIds: [siteId] });
  return { count: r[0].count };
});

/* ---- two days before ---- */
export async function runTwoAdultsMail({ db: dbi, send, at = new Date(), hub = '' }) {
  const today = londonDay(at), day = Core.plus(today, 2), st = await settingsOf(dbi), mailed = [];
  for (const site of await rows(dbi.collection('sites').where('active', '==', true))) {
    const b = (await dbi.collection('bookingSettings').doc(site.id).get()).data() || {};
    const to = [];
    for (const mid of [b.safeguardingLead, b.safeguardingDeputy].filter(Boolean)) {
      const a = (await dbi.collection('addressBook').doc(mid).get()).data();
      if (a && a.email) to.push(String(a.email).toLowerCase());
    }
    if (!to.length) continue;
    const groups = (await rows(dbi.collection('kidsGroups').where('siteId', '==', site.id))).filter((g) => g.active !== false)
      .map((g) => ({ id: g.id, name: String(g.name || 'A group').slice(0, 80), day: g.day, leaderIds: g.leaderIds || [] }));
    const events = (await eventsAt(dbi, site.id, today, 3)).filter((e) => e.day === day);
    const sent = {};
    for (const k of [...groups.map((g) => 'kg_' + g.id + '_' + day), ...events.map((e) => 'ev_' + e.id + '_' + day)]) {
      if ((await dbi.collection('sgMailed').doc(k).get()).exists) sent[k] = true;
    }
    for (const m of Core.twoAdultsMails({ day, settings: st, events, groups, sent })) {
      const link = (hub || '') + '/' + m.fix;
      await send({ to, subject: m.subject, html: m.lines.map((l) => '<p>' + l.replace(/[<>&]/g, '') + '</p>').join('') + '<p><a href="' + link + '">' + link + '</a></p>' }, { kind: 'sg-two-adults', key: m.key });
      await dbi.collection('sgMailed').doc(m.key).set({ siteId: site.id, at: at.toISOString(), subject: m.subject });
      mailed.push(m.key);
    }
  }
  return mailed;
}
export const sgTwoAdultsDaily = onSchedule({ region: REGION, schedule: 'every day 08:00', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  if (!(await registerOn(db()))) return;
  const sender = makeSender({ db: db() });
  const hub = await hubUrl(db());
  const sent = await runTwoAdultsMail({ db: db(), hub, send: (msg, meta) => sender({ to: msg.to, subject: msg.subject, html: msg.html, replyTo: '' }, meta) });
  if (sent.length) console.log('sg two adults: emailed ' + sent.length);
});
