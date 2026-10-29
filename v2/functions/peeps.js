/* ===================================================================
   EGBC — personal evacuation plans on the fire roll-call (Stage 4; F-234)
   ===================================================================

   A PEEP (peeps/<memberId>) is a person's own plan for getting out of the
   building if there is a fire: what help they need, who helps, where they
   go, any equipment. Made with their agreement, minimal (no medical
   history), edited by them, reviewed yearly, deleted when no longer needed.
   The rules let only the person and master admins read peeps/.

   THE ROLL-CALL GETS ONLY TODAY'S, AND ONLY FOR TODAY'S PEOPLE (Martin,
   19 Oct), BUILDING BY BUILDING. This builds peepToday/<London day>__<site>:
     entries  the agreed plans of the people who are IN TODAY - checked in at
              one of today's events, or on today's rota - and nobody else
     readers  the fire wardens named for THAT building (or every building), and
              its duty stewards ON THE ROTA TODAY (a steward not on duty: not a reader)
   The rules let only those readers and master admins read it. Yesterday's
   is deleted. Rebuilt whenever someone checks in or out, a plan changes,
   the roll-call list or the rota changes, and every morning.

   NEVER IN AN EMAIL: nothing here sends anything, and no other function
   reads peeps/ or peepToday/ (compliance-stage4.test checks every file).

   Off unless the church has the add-on (churchSettings/features
   .buildingCompliance exactly true), as the rest of building compliance.
   The events window's file. Exported from index.js.
   =================================================================== */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { featureOn } from './compliance.js';
import { eachChurch } from './church-scope.js';
import { usesPart } from './parts.js';
import { twinTriggers } from './church-triggers.js';

const REGION = 'europe-west2';
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const people = (raw) => (Array.isArray(raw) ? raw : [raw]).filter(Boolean);

export async function runPeepToday({ db, today }) {
  today = today || londonDay(new Date());
  /* One list per building (Martin, 19 Oct): peepToday/<day>__<siteId>.
     Yesterday's (and older) go: "deleted when no longer needed". Off: all go. */
  const on = (await usesPart(db, 'building')) && (await featureOn(db));
  const old = await db.collection('peepToday').get();
  for (const d of old.docs) if (!on || !d.id.startsWith(today + '__')) await d.ref.delete();
  if (!on) return { off: true };
  /* HOW MANY personal evacuation plans there are, agreed, for the fire risk
     assessment (H&S step 6; F-280 3B): a number, never a name. */
  const agreed = (await db.collection('peeps').where('agreed', '==', true).get()).size;
  await db.collection('raCounts').doc('peeps').set({ agreed, at: new Date().toISOString() });

  const siteDocs = (await db.collection('sites').get()).docs.filter((d) => d.data().active !== false)
    .sort((a, b) => (a.data().order || 0) - (b.data().order || 0));
  const sites = {}; siteDocs.forEach((d) => { sites[d.id] = d.data().name || d.id; });
  /* The rota's services are in the church's first building unless the rota
     event names one (F-235). */
  const MAIN = siteDocs.length ? siteDocs[0].id : '';

  /* Who is in today, and where: on the rota... */
  const rota = {}, where = {};
  (await db.collection('events').where('date', '==', today).get()).docs.forEach((d) => {
    const ev = d.data();
    if (ev.archived || ev.draft) return;
    const site = String(ev.siteId || (ev.location && ev.location.siteId) || MAIN);
    Object.keys(ev.assignments || {}).forEach((role) => people(ev.assignments[role]).forEach((p) => {
      if (!p || !p.id) return;
      rota[p.id] = (rota[p.id] || []).concat(role);
      (where[p.id] = where[p.id] || {})[site] = 'On the rota';
    }));
  });
  /* ...or checked in at one of today's events (members, through their sign-up). */
  const cks = (await db.collection('checkins').where('day', '==', today).get()).docs.map((d) => d.data()).filter((c) => c.state === 'in');
  for (const c of cks) {
    if (!c.signupKey || c.kind === 'child') continue;
    const su = await db.collection('signups').doc(c.signupKey).get();
    if (!su.exists) continue;
    const s = su.data();
    let mid = s.personKind === 'addressBook' ? s.personId : '';
    if (!mid && s.memberUid) { const u = await db.collection('users').doc(s.memberUid).get(); mid = u.exists ? (u.data().memberId || '') : ''; }
    if (mid) (where[mid] = where[mid] || {})[c.buildingId || MAIN] = 'Checked in';
  }

  /* The plans, building by building. */
  const bySite = {};
  for (const mid of Object.keys(where)) {
    const p = await db.collection('peeps').doc(mid).get();
    if (!p.exists || p.data().agreed !== true) continue;
    const x = p.data();
    Object.keys(where[mid]).forEach((site) => {
      (bySite[site] = bySite[site] || []).push({ memberId: mid, name: x.name || '', why: where[mid][site], building: sites[site] || '',
        needs: x.needs || '', helpers: x.helpers || '', route: x.route || '', equipment: x.equipment || '', reviewDue: x.reviewDue || '',
        enteredByName: x.enteredByName || '' });
    });
  }

  /* Who may read each: the fire wardens for that building (or every
     building), and the duty stewards for it who are on the rota today. */
  const { stewards, all, per } = await rollCallOf(db);
  const docs = {};
  for (const site of Object.keys(bySite)) {
    const entries = bySite[site].sort((a, b) => a.name.localeCompare(b.name));
    const readers = [...new Set(all.concat(per[site] || []))].filter((m) => stewards.indexOf(m) < 0 || m in rota);
    await db.collection('peepToday').doc(today + '__' + site).set({ day: today, siteId: site, readers, entries, at: new Date().toISOString() });
    docs[site] = { readers, entries };
  }
  return { off: false, docs };
}

/* The fire roll call: one record for each building, and fireRollCall/all
   for every building (H&S step 3a). Until tools/migrate-fire-rollcall.mjs
   has split it, the old single record (fireRollCall/main) still answers. */
export async function rollCallOf(db) {
  const snap = await db.collection('fireRollCall').get();
  const docs = snap.docs.filter((d) => d.id !== 'main');
  if (!docs.length) {
    const old = snap.docs.find((d) => d.id === 'main');
    const fire = old ? old.data() : {};
    return { stewards: fire.stewards || [], all: fire.allSites || [], per: fire.bySite || {} };
  }
  const out = { stewards: [], all: [], per: {} };
  docs.forEach((d) => {
    const x = d.data() || {};
    out.stewards = out.stewards.concat(x.stewards || []);
    if (d.id === 'all') out.all = x.memberIds || [];
    else out.per[d.id] = x.memberIds || [];
  });
  return out;
}

/* Each church's lists from its own data: the morning run goes church by
   church, and each change rebuilds the church it happened in. */
const rebuild = async ({ db }) => { await runPeepToday({ db }); };
export const peepTodayDaily = onSchedule({ region: REGION, schedule: '30 5 * * *', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  await eachChurch(getFirestore(), (ch) => rebuild(ch));
});
export const [peepTodayOnCheckin, peepTodayOnCheckinChurch] = twinTriggers(onDocumentWritten, { region: REGION, document: 'checkins/{id}' }, rebuild);
export const [peepTodayOnPeep, peepTodayOnPeepChurch] = twinTriggers(onDocumentWritten, { region: REGION, document: 'peeps/{id}' }, rebuild);
export const [peepTodayOnRollCall, peepTodayOnRollCallChurch] = twinTriggers(onDocumentWritten, { region: REGION, document: 'fireRollCall/{id}' }, rebuild);
export const [peepTodayOnRota, peepTodayOnRotaChurch] = twinTriggers(onDocumentWritten, { region: REGION, document: 'events/{id}' }, rebuild);
