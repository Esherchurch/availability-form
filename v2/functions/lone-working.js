/* ===================================================================
   WORKING ALONE: "I'm in" and "I've left" (the reviewing window's job 3)
   ===================================================================
   Someone working alone at one of the church's buildings signs in on
   lone.html with the time they expect to leave, and signs out when they
   go. Only the building and the times: never where they are.

   loneWorkingCheck, every 5 minutes, for EGBC and every church:
     at the time they said     THEM: "Are you all right? Tap I've left,
                               or I need longer" (a loud notification,
                               and an email)
     + grace (15 minutes)      THE BUILDING'S CONTACTS too: "X hasn't
                               signed out of <building>: ring them"
                               (loneContacts/{siteId}; when none are set,
                               the building's H&S lead and deputy)
     + escalate (30 more)      THE OFFICE too (the office job), and the
                               contacts again: "Still not signed out"
   A contact who has spoken to them marks it "safe" on lone.html, and
   that ends it. "I need longer" starts again from the new time. The
   times are the church's (loneSettings/main). Notifications go through
   the hub's own (notify.js, as urgent), so they follow its switch.

   Closed visits (signed out, or marked safe) are deleted after 30 days.

   The events window's file. Exported from index.js.
   =================================================================== */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { usesPart } from './parts.js';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import * as Notify from './notify.js';
import { featureOn } from './compliance.js';
import { readTeamJobs, teamsFor } from './team-jobs.js';
import { makeSender } from './public-mail.js';
import { eachChurch } from './church-scope.js';

const REGION = 'europe-west2';
export const OPEN = ['in', 'due', 'late', 'escalated'];
const RANK = { in: 0, due: 1, late: 2, escalated: 3 };
const hhmm = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === 'number' ? t : Date.parse(t) || 0);

/* the stage a visit has reached at `now` */
export function stageAt(expectOut, now, s) {
  const past = (now - expectOut) / 60000;
  if (past < 0) return 'in';
  if (past < s.graceMins) return 'due';
  return past < s.graceMins + s.escalateMins ? 'late' : 'escalated';
}

async function settingsOf(db) {
  const s = (await db.collection('loneSettings').doc('main').get()).data() || {};
  const n = (v, d) => (Number.isInteger(v) && v >= 5 && v <= 120 ? v : d);
  return { graceMins: n(s.graceMins, 15), escalateMins: n(s.escalateMins, 30) };
}
/* the building's contacts (member ids): its own list, or its H&S lead and deputy */
async function contactsOf(db, siteId) {
  const c = ((await db.collection('loneContacts').doc(String(siteId)).get()).data() || {}).contacts || [];
  if (c.length) return c.slice(0, 10);
  const r = (await db.collection('raSiteRoles').doc(String(siteId)).get()).data() || {};
  return [r.hsLead, r.hsDeputy].filter(Boolean);
}
async function officeUids(db) {
  const tj = await readTeamJobs(db);
  const teams = teamsFor(tj.map, 'office', tj.set).slice(0, 30);
  const out = new Set();
  if (teams.length) {
    for (const f of ['teams', 'covers']) {
      const q = await db.collection('users').where(f, 'array-contains-any', teams).limit(200).get().catch(() => ({ docs: [] }));
      q.docs.forEach((d) => { if (d.data().status === 'active') out.add(d.id); });
    }
  }
  return [...out];
}

/* The work, with what it needs passed in (deps as notify.js's send), so a test can run it at any time. */
export async function runLoneCheck({ db, deps, now = Date.now() }) {
  if (!(await featureOn(db))) return { off: true, sent: [] };
  const s = await settingsOf(db), sent = [];
  const open = await db.collection('loneVisits').where('status', 'in', OPEN).limit(500).get();
  for (const d of open.docs) {
    const v = d.data(), out = ms(v.expectOut);
    if (!out) continue;
    const a = v.alerts && v.alerts.forOut === out ? v.alerts : { stage: 'in', forOut: out };
    const stage = stageAt(out, now, s);
    if (RANK[stage] <= RANK[a.stage || 'in']) continue;
    const where = String(v.siteName || 'the building'), name = String(v.name || 'Someone'), by = hhmm(out);
    const contacts = stage === 'due' ? [] : Object.values(await Notify.uidsForMembers(db, await contactsOf(db, v.siteId)));
    const office = stage === 'escalated' ? await officeUids(db) : [];
    const tell = async (uids, title, text) => {
      if (!uids.length) return null;
      return Notify.send(deps, { uids, type: 'urgent', data: { title, text, url: 'lone.html' }, by: 'lone-working', siteId: v.siteId, now: new Date(now) });
    };
    if (stage === 'due' || stage === 'late') await tell([v.uid], 'Are you all right?', 'You said you would leave ' + where + ' by ' + by + '. Tap "I\'ve left", or "I need longer".');
    if (stage === 'late') await tell(contacts.filter((u) => u !== v.uid), name + ' hasn\'t signed out', name + ' is working alone at ' + where + ' and said they would leave by ' + by + '. Ring them' + (v.phone ? ' on ' + v.phone : '') + '.');
    if (stage === 'escalated') await tell([...new Set(contacts.concat(office))].filter((u) => u !== v.uid), 'Still not signed out: ' + name, name + ' is working alone at ' + where + ', said they would leave by ' + by + ', and nobody has marked them safe. Ring them' + (v.phone ? ' on ' + v.phone : '') + '; if there is no answer, follow the plan on the page.');
    await d.ref.update({ status: stage, alerts: { stage, forOut: out, at: new Date(now).toISOString(), told: stage === 'due' ? 1 : stage === 'late' ? 1 + contacts.length : contacts.length + office.length } });
    sent.push({ id: d.id, stage });
  }
  /* closed visits go after 30 days */
  const old = await db.collection('loneVisits').where('inAt', '<', Timestamp.fromMillis(now - 30 * 864e5)).limit(200).get().catch(() => ({ docs: [] }));
  let gone = 0;
  for (const d of old.docs) if (!OPEN.includes(d.data().status)) { await d.ref.delete(); gone++; }
  return { sent, gone };
}

export async function loneDeps(db) {
  const onEmulator = !!process.env.FUNCTIONS_EMULATOR || !!process.env.FIRESTORE_EMULATOR_HOST;
  const st = await Notify.liveState(db), send = makeSender({ db });
  return {
    db, auth: getAuth(), dryRun: !st.sending, state: st,
    push: Notify.pushTransport({ db, messaging: onEmulator ? null : getMessaging(), onEmulator }),
    email: st.sending ? (msg, meta) => send({ to: msg.to, subject: msg.subject, html: msg.html, replyTo: '' }, meta) : Notify.dryEmail(db),
    hub: await Notify.hubUrl(db)
  };
}

export const loneWorkingCheck = onSchedule({ region: REGION, schedule: 'every 5 minutes', timeZone: 'Europe/London', retryCount: 0 }, async () => {
  await eachChurch(getFirestore(), async (ch) => { if (await usesPart(ch.db, 'building')) await runLoneCheck({ db: ch.db, deps: await loneDeps(ch.db) }); });
});
