/* ===================================================================
   ROOMS ON THE DAY (F-260): the caterers' list, and arrivals
   ===================================================================
   cateringSync   every change to a booking: a confirmed booking with
                  refreshments has cateringOrders/{its key} - what the kitchen
                  needs (day, serving time, room, numbers, items, dietary
                  counts, notes, the booking's title) and NOTHING about who
                  booked; anything else has none. How far the caterers have
                  got (state) is kept when the order is updated.
   arrivalCheck   every 15 minutes: a hire or a member's booking today, not
                  marked arrived the site's arrivalGraceMins after it starts
                  (30 unless set; 0 = off), is flagged ONCE - the site's
                  bookings address is emailed and the booking is marked
                  arrivalFlaggedAt. Never cancelled (the brief: a paid hire
                  stays).
   Both only while the church uses room bookings (the roomBookings switch).
   No new secret or setting.
   =================================================================== */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { makeSender } from './public-mail.js';
import { featureOn } from './features.js';
import { usesPart } from './parts.js';
import { eachChurch } from './church-scope.js';
import { twinTriggers } from './church-triggers.js';

const REGION = 'europe-west2';
const db = () => getFirestore();
const GRACE = 30, FLAG_KINDS = ['hire', 'member'];
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
/* London's date and minute, whatever the server's clock zone */
export function londonNow(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return { day: p.year + '-' + p.month + '-' + p.day, min: (+p.hour % 24) * 60 + +p.minute };
}

/* ---------------- the caterers' list ---------------- */
export function cateringOrderOf(b, room) {
  const f = b && b.refreshments;
  if (!b || b.status !== 'confirmed' || !f || !f.needed) return null;
  return {
    siteId: b.siteId || '', roomId: b.roomId || '', roomName: String((room && room.name) || '').slice(0, 120), day: b.day, startMin: b.startMin || 0,
    servingAt: String(f.servingAt || '').slice(0, 5), people: +b.people || 0, title: String(b.title || '').slice(0, 120),
    items: (f.items || []).slice(0, 30).map((i) => ({ name: String(i.name || '').slice(0, 80), qty: +i.qty || 0, unit: String(i.unit || '').slice(0, 10) })),
    dietary: Object.fromEntries(Object.entries(f.dietary || {}).filter(([k, v]) => /^(vegetarian|vegan|glutenFree|dairyFree)$/.test(k) && +v > 0).map(([k, v]) => [k, +v])),
    notes: String(f.notes || '').slice(0, 500)
  };
}
export async function syncCatering(dbi, key, after) {
  const ref = dbi.collection('cateringOrders').doc(key);
  const room = after && after.roomId ? (await dbi.collection('rooms').doc(after.roomId).get()).data() : null;
  const o = cateringOrderOf(after, room);
  if (!o) { await ref.delete().catch(() => {}); return null; }
  const was = (await ref.get()).data() || {};
  Object.assign(o, { state: was.state || 'new', updatedAt: new Date().toISOString() });
  for (const k of ['stateBy', 'stateByName', 'stateAt']) if (was[k] != null) o[k] = was[k];
  await ref.set(o);
  return o;
}
export const [cateringSync, cateringSyncChurch] = twinTriggers(onDocumentWritten, { document: 'bookings/{key}', region: REGION }, async ({ db: dbi }, event) => {
  if (!(await usesPart(dbi, 'rooms')) || !(await featureOn(dbi, 'roomBookings'))) return;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  await syncCatering(dbi, event.params.key, after);
});

/* ---------------- arrivals ---------------- */
export async function runArrivalCheck({ db: dbi, send, at = new Date() }) {
  const now = londonNow(at), flagged = [];
  const snap = await dbi.collection('bookings').where('day', '==', now.day).get();
  const sites = {};
  for (const d of snap.docs) {
    const b = d.data();
    if (b.status !== 'confirmed' || b.arrived || b.arrivalFlaggedAt || FLAG_KINDS.indexOf(b.kind) < 0) continue;
    if (!(b.siteId in sites)) sites[b.siteId] = (await dbi.collection('sites').doc(b.siteId).get()).data() || {};
    const site = sites[b.siteId], g = site.arrivalGraceMins === 0 ? 0 : (+site.arrivalGraceMins > 0 ? +site.arrivalGraceMins : GRACE);
    if (!g || now.min < b.startMin + g) continue;
    const room = (await dbi.collection('rooms').doc(b.roomId).get()).data() || {}, q = b.requester || {};
    if (site.bookingsEmail) {
      await send({ to: [site.bookingsEmail], subject: 'Not arrived yet: ' + (b.title || 'a booking') + ', ' + (room.name || 'a room') + ' at ' + hhmm(b.startMin),
        html: '<p>' + (b.kind === 'hire' ? 'The hire' : 'The booking') + ' <b>' + (b.title || '') + '</b> in ' + (room.name || 'a room') + ' started at ' + hhmm(b.startMin) + ' and nobody has marked it arrived yet.</p>' +
          '<p>' + (q.name || b.memberName || '') + (q.phone ? ', ' + q.phone : '') + '</p>' +
          '<p>Nothing has been cancelled. Mark it arrived on Room bookings, Today, when they come.</p>' }, { kind: 'arrival-flag', bookingKey: d.id }).catch((e) => console.error('arrivals: email ' + d.id, e.message));
    }
    await d.ref.update({ arrivalFlaggedAt: new Date(at).toISOString() });
    flagged.push(d.id);
  }
  return flagged;
}
export const arrivalCheck = onSchedule({ region: REGION, schedule: 'every 15 minutes', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  await eachChurch(db(), async ({ id, db: dbi }) => {
    if (!(await usesPart(dbi, 'rooms')) || !(await featureOn(dbi, 'roomBookings'))) return;
    const sender = makeSender({ db: dbi });
    const flagged = await runArrivalCheck({ db: dbi, send: (msg, meta) => sender({ to: msg.to, subject: msg.subject, html: msg.html, replyTo: '' }, meta) });
    if (flagged.length) console.log('arrivals (' + (id || 'egbc') + '): flagged ' + flagged.join(', '));
  });
});
