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
   =================================================================== */
import { createRequire } from 'node:module';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
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
    dueSoonDays: ((s.register || {}).dueSoonDays) || 42, trusteeTeam: s.trusteeTeam || 'Elders' };
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
    const children = sus.filter((x) => x.status === 'confirmed').reduce((a, x) => a + (+x.places || 1), 0);
    let signedOff = true;
    const needs = SG_KINDS.includes(e.sgKind || '');
    if (needs) { const a = (await dbi.collection('sgAssessments').doc(e.id).get()).data(); signedOff = !!(a && (a.status === 'signed' || a.waived)); }
    out.push({ id: e.id, title: String(e.title || 'An event').slice(0, 80), day: String(e.startLocal || '').slice(0, 10) || new Date(e.startUtc).toISOString().slice(0, 10),
      children, leaders: (l.leaders || []).length || (l.leaderIds || []).length, leaderIds: l.leaderIds || [], needsSignoff: needs, signedOff });
  }
  return out;
}

export async function siteWarnings({ db: dbi, siteId, today }) {
  const st = await settingsOf(dbi);
  const [activities, groups, kidsIn, leadIns, planGroups, children, risks] = await Promise.all([
    rows(dbi.collection('sgActivities').where('siteId', '==', siteId)),
    rows(dbi.collection('kidsGroups').where('siteId', '==', siteId)).then((g) => g.filter((x) => x.active !== false)),
    rows(dbi.collection('checkins').where('day', '==', today).where('kind', '==', 'child')).then((c) => c.filter((x) => x.siteId === siteId && x.state === 'in')),
    rows(dbi.collection('kidsLeaderIns').where('siteId', '==', siteId).where('day', '==', today)).then((c) => c.filter((x) => x.state === 'in')),
    rows(dbi.collection('planGroups').where('siteId', '==', siteId)).then((g) => g.filter((x) => !x.archived && (x.kind === 'children' || x.kind === 'youth'))),
    rows(dbi.collection('kidsChildren').where('siteId', '==', siteId)).then((c) => c.filter((x) => x.status === 'registered')),
    rows(dbi.collection('sgRisks').where('siteId', '==', siteId))
  ]);
  const events = await eventsAt(dbi, siteId, today, 14);
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
  return Core.warningsFrom({ today, settings: st,
    activities: activities.map((a) => ({ id: a.id, link: a.link || {} })),
    groups: groups.map((g) => ({ id: g.id, name: String(g.name || 'A group').slice(0, 80), ratio: g.ratio, leaderIds: g.leaderIds || [] })),
    childrenIn, leadersIn, events, leaderMids, checks,
    consent: children.map((c) => ({ groupId: c.groupId, consentUntil: c.consentUntil || '' })),
    risks: risks.map((r) => ({ id: r.id, activityId: r.activityId, reviewDue: r.reviewDue || '', status: r.status })) });
}

export async function runSgWarnings({ db: dbi, at = new Date(), siteIds }) {
  const today = londonDay(at);
  const ids = siteIds || (await rows(dbi.collection('sites').where('active', '==', true))).map((s) => s.id);
  const done = [];
  for (const siteId of ids) {
    const w = await siteWarnings({ db: dbi, siteId, today });
    await dbi.collection('sgWarnings').doc(siteId).set({ siteId, items: w.items.slice(0, 100), controls: w.controls, today, at: at.toISOString() });
    done.push({ siteId, count: w.items.length });
  }
  return done;
}

export const sgWarningsSync = onSchedule({ region: REGION, schedule: 'every 15 minutes', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  if (!(await featureOn(db(), 'safeguarding'))) return;
  await runSgWarnings({ db: db() });
});

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
  if (!(await featureOn(db(), 'safeguarding'))) throw new HttpsError('failed-precondition', 'Safeguarding is turned off for this church.');
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
  if (!(await featureOn(db(), 'safeguarding'))) return;
  const sender = makeSender({ db: db() });
  const hub = await hubUrl(db());
  const sent = await runTwoAdultsMail({ db: db(), hub, send: (msg, meta) => sender({ to: msg.to, subject: msg.subject, html: msg.html, replyTo: '' }, meta) });
  if (sent.length) console.log('sg two adults: emailed ' + sent.length);
});
