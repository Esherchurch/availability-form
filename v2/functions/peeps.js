/* ===================================================================
   EGBC — personal evacuation plans on the fire roll-call (Stage 4; F-234)
   ===================================================================

   A PEEP (peeps/<memberId>) is a person's own plan for getting out of the
   building if there is a fire: what help they need, who helps, where they
   go, any equipment. Made with their agreement, minimal (no medical
   history), edited by them, reviewed yearly, deleted when no longer needed.
   The rules let only the person and master admins read peeps/.

   THE ROLL-CALL GETS ONLY TODAY'S, AND ONLY FOR TODAY'S PEOPLE (Martin,
   19 Oct). This builds peepToday/<London day>:
     entries  the agreed plans of the people who are IN TODAY - checked in at
              one of today's events, or on today's rota - and nobody else
     readers  the fire wardens named on the roll-call list, and the duty
              stewards ON THE ROTA TODAY (a steward not on duty: not a reader)
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

const REGION = 'europe-west2';
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const people = (raw) => (Array.isArray(raw) ? raw : [raw]).filter(Boolean);

export async function runPeepToday({ db, today }) {
  today = today || londonDay(new Date());
  const ref = db.collection('peepToday').doc(today);
  /* Yesterday's (and older) go: "deleted when no longer needed". */
  const old = await db.collection('peepToday').get();
  for (const d of old.docs) if (d.id !== today) await d.ref.delete();
  if (!(await featureOn(db))) { await ref.delete().catch(() => {}); return { off: true }; }

  /* Who is in today: on the rota... */
  const rota = {};
  (await db.collection('events').where('date', '==', today).get()).docs.forEach((d) => {
    const ev = d.data();
    if (ev.archived || ev.draft) return;
    Object.keys(ev.assignments || {}).forEach((role) => people(ev.assignments[role]).forEach((p) => { if (p && p.id) rota[p.id] = (rota[p.id] || []).concat(role); }));
  });
  /* ...or checked in at one of today's events (members, through their sign-up). */
  const inToday = {};
  const cks = (await db.collection('checkins').where('day', '==', today).get()).docs.map((d) => d.data()).filter((c) => c.state === 'in');
  for (const c of cks) {
    if (!c.signupKey || c.kind === 'child') continue;
    const su = await db.collection('signups').doc(c.signupKey).get();
    if (!su.exists) continue;
    const s = su.data();
    let mid = s.personKind === 'addressBook' ? s.personId : '';
    if (!mid && s.memberUid) { const u = await db.collection('users').doc(s.memberUid).get(); mid = u.exists ? (u.data().memberId || '') : ''; }
    if (mid) inToday[mid] = c.buildingId || inToday[mid] || '';
  }

  const sites = {}; (await db.collection('sites').get()).docs.forEach((d) => { sites[d.id] = d.data().name || d.id; });
  const entries = [];
  for (const mid of [...new Set(Object.keys(inToday).concat(Object.keys(rota)))]) {
    const p = await db.collection('peeps').doc(mid).get();
    if (!p.exists || p.data().agreed !== true) continue;
    const x = p.data();
    entries.push({ memberId: mid, name: x.name || '', why: mid in inToday ? 'Checked in' : 'On the rota', building: inToday[mid] ? (sites[inToday[mid]] || '') : '',
      needs: x.needs || '', helpers: x.helpers || '', route: x.route || '', equipment: x.equipment || '', reviewDue: x.reviewDue || '' });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  /* Who may read it: the fire wardens, and the duty stewards on duty today. */
  const f = await db.collection('fireRollCall').doc('main').get();
  const fire = f.exists ? f.data() : {};
  const stewards = fire.stewards || [];
  const readers = (fire.memberIds || []).filter((m) => stewards.indexOf(m) < 0 || m in rota);
  await ref.set({ day: today, readers, entries, at: new Date().toISOString() });
  return { off: false, readers, entries };
}

const rebuild = async () => { await runPeepToday({ db: getFirestore() }); };
export const peepTodayDaily = onSchedule({ region: REGION, schedule: '30 5 * * *', timeZone: 'Europe/London', retryCount: 1 }, rebuild);
export const peepTodayOnCheckin = onDocumentWritten({ region: REGION, document: 'checkins/{id}' }, rebuild);
export const peepTodayOnPeep = onDocumentWritten({ region: REGION, document: 'peeps/{id}' }, rebuild);
export const peepTodayOnRollCall = onDocumentWritten({ region: REGION, document: 'fireRollCall/{id}' }, rebuild);
export const peepTodayOnRota = onDocumentWritten({ region: REGION, document: 'events/{id}' }, rebuild);
