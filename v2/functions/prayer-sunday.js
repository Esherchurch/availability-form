/* ===================================================================
   EGBC — "For Sunday": the prayer list for the service (F-222)
   ===================================================================

   Martin, 16 Oct: the For Sunday prayer list is also seen by
     - the SERVICE LEADER for that Sunday (from the rota / Preaching plan:
       events.serviceLeader for that date's services), that Sunday's list
       only, from the Wednesday before until the Sunday ends; and
     - the PASTOR (teamMailSettings/main.pastor - the one setting team
       mail uses), always.
   Neither sees the other prayer requests unless they already read them.
   A name only where the person said "Yes, with my name".

   The rules can't hide one field of a request, so neither may read
   `prayers`. This keeps a copy of just the list, one per Sunday:

     prayerSundayList/<YYYY-MM-DD> = { sunday, from, until, leaderMemberIds,
       items: [{ text, name, at }], updatedAt }

   items: the requests marked yes, not answered, made in the four weeks
   up to that Sunday, newest first; name '' unless "with my name".
   from / until: Wednesday 00:00 to Sunday 23:59:59, church (UK) time.
   leaderMemberIds: every service that Sunday's service leader, by their
   address-book id (serviceLeaderId); by the typed name only where no id.
   The rules let the Pastor read any of them, and a service leader the
   one naming them, between from and until. Nobody writes them but this.

     prayerSundayOnPrayer   trigger: prayers/{id} written
     prayerSundayOnRota     trigger: events/{id} written (a leader changed)
     prayerSundayDaily      schedule: 00:10 every day (the week moves on)
   =================================================================== */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { eachChurch } from './church-scope.js';
import { twinTriggers } from './church-triggers.js';
import { usesPart } from './parts.js';

const REGION = 'europe-west2';
const TZ = 'Europe/London';
const DAY = 864e5;

/* The date in the church's time, as YYYY-MM-DD. */
export function londonDate(t) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}
/* Midnight at the start of a church date, as a moment. */
export function londonMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const g = (k) => +p.find(x => x.type === k).value;
  const offset = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - guess;
  return guess - offset;
}
const addDays = (dateStr, n) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekday = (dateStr) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

/* Today if it's Sunday, else the next Sunday (church time). */
export function comingSunday(t) {
  const today = londonDate(t == null ? Date.now() : t);
  return addDays(today, (7 - weekday(today)) % 7);
}
/* Wednesday 00:00 before it, to the end of the Sunday. */
export function windowOf(sunday) {
  return { from: londonMidnight(addDays(sunday, -4)), until: londonMidnight(addDays(sunday, 1)) - 1 };
}

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/* The list for one Sunday, from what is there now. */
export async function buildSunday(db, sunday) {
  const w = windowOf(sunday), since = w.until - 28 * DAY;
  const [evs, prs, ab] = await Promise.all([
    db.collection('events').where('date', '==', sunday).get(),
    db.collection('prayers').where('sunday', 'in', ['named', 'anon']).get(),
    db.collection('addressBook').get()
  ]);
  /* BY ID, NOT BY NAME (Martin, 16 Oct): the rota keeps the service leader's
     address-book id (serviceLeaderId, or serviceLeader as {id, name}); a
     typed name is matched only where there is no id yet (older services). */
  const names = [], ids = [];
  evs.docs.forEach(d => {
    const e = d.data();
    [].concat(e.serviceLeaderId || []).forEach(i => { if (typeof i === 'string' && i) ids.push(i); });
    [].concat(e.serviceLeader || []).forEach(n => {
      if (n && typeof n === 'object') { if (n.id) ids.push(String(n.id)); }
      else if (!e.serviceLeaderId && norm(n)) names.push(norm(n));
    });
  });
  const leaderMemberIds = [];
  ab.docs.forEach(d => { const x = d.data(); if (x.archived) return; if (ids.includes(d.id) || (names.length && names.includes(norm(x.name)))) leaderMemberIds.push(d.id); });
  const ms = (v) => (v && v.toMillis ? v.toMillis() : (typeof v === 'string' ? Date.parse(v) : (v instanceof Date ? v.getTime() : 0))) || 0;
  const items = prs.docs.map(d => d.data())
    .filter(p => !p.answered && ms(p.at) >= since && ms(p.at) <= w.until)
    .sort((a, b) => ms(b.at) - ms(a.at))
    .slice(0, 60)
    .map(p => ({ text: String(p.text || '').slice(0, 4000), name: p.sunday === 'named' ? String(p.byName || '').slice(0, 120) : '', at: new Date(ms(p.at)).toISOString() }));
  const doc = { sunday, from: Timestamp.fromMillis(w.from), until: Timestamp.fromMillis(w.until), leaderMemberIds, items, updatedAt: new Date().toISOString() };
  await db.collection('prayerSundayList').doc(sunday).set(doc);
  return doc;
}

/* Each church's list from its own prayers and rota. */
export const [prayerSundayOnPrayer, prayerSundayOnPrayerChurch] = twinTriggers(onDocumentWritten, { document: 'prayers/{id}', region: REGION }, async ({ db }) => {
  if (await usesPart(db, 'care')) await buildSunday(db, comingSunday());
});

export const [prayerSundayOnRota, prayerSundayOnRotaChurch] = twinTriggers(onDocumentWritten, { document: 'events/{id}', region: REGION }, async ({ db }, event) => {
  if (!(await usesPart(db, 'care'))) return;
  const dates = [event.data && event.data.before && event.data.before.exists ? event.data.before.data().date : '',
                 event.data && event.data.after && event.data.after.exists ? event.data.after.data().date : ''];
  const today = londonDate(Date.now()), soon = addDays(today, 14);
  const seen = {};
  for (const d of dates) {
    if (!d || seen[d] || !/^\d{4}-\d{2}-\d{2}$/.test(d) || weekday(d) !== 0 || d < today || d > soon) continue;
    seen[d] = 1;
    await buildSunday(db, d);
  }
});

export const prayerSundayDaily = onSchedule({ region: REGION, schedule: '10 0 * * *', timeZone: TZ, retryCount: 1 }, async () => {
  await eachChurch(getFirestore(), async ({ db }) => { if (await usesPart(db, 'care')) await buildSunday(db, comingSunday()); });
});
