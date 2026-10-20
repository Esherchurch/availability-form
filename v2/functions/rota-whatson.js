/* ===================================================================
   ENTER A SUNDAY ONCE (Martin, 15 Oct 2026)
   ===================================================================

   A service is entered once, on the rota (`events/{id}`, the Planner and
   the Preaching plan), and that is what What's On, the app, the website's
   embed and the church's calendar feed show. No second calendar event to
   keep in step: this trigger keeps `calEvents/rota_<id>` as a copy.

   WHICH SERVICES. Only those ticked "In What's On" (`whatsOn: true`) with
   a service time (`serviceTime`, HH:MM - the time the public come, not the
   team's call time in startTime). Not archived. Anything else - unticked,
   archived, deleted, no time, or the church switched the part off - and
   the copy is removed. So a service that is not public never shows.

   WHAT IT SHOWS. publicTitle (else the service type), publicDescription,
   and the speaker. Nothing else from the rota: no names on roles, no
   internal notes (`description` is the Planner's private notes).

   THE COPY IS THE SERVER'S. Its id starts rota_, it carries source:'rota'
   and rotaId, and a change made to it anywhere else is overwritten at the
   next change on the rota. (FINDINGS-events asks events-admin to show it
   read-only, "change this on the rota".)

   THE FEATURE. "sundaysInWhatsOn": off when churchSettings/features has
   sundaysInWhatsOn === false (item 14 will write that). Off removes the
   copy at the next change; nothing else is touched.
   =================================================================== */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { featureOn } from './features.js';

const REGION = 'europe-west2';   // the database's region (TRIGGER_REGION in index.js)
const TZ = 'Europe/London';
export const FEATURE = 'sundaysInWhatsOn';
const DEFAULT_MINUTES = 90;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* A London wall-clock time as the instant it is (GMT or BST). */
export function londonToUtc(date, time) {
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ms) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}

function localIso(date, minutesFromMidnight) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCMinutes(minutesFromMidnight);
  return d.toISOString().slice(0, 16);
}

/* THE ONE DECISION, kept pure so tests can ask it directly: the calEvents
   document a rota service should have, or null for "none". */
export function mirrorFor(id, rota, opts = {}) {
  if (opts.featureOff) return null;
  if (!rota || rota.archived === true || rota.whatsOn !== true) return null;
  if (!ISO.test(String(rota.date || '')) || !HHMM.test(String(rota.serviceTime || ''))) return null;
  const [h, m] = rota.serviceTime.split(':').map(Number);
  const startMin = h * 60 + m;
  let endMin = startMin + DEFAULT_MINUTES;
  if (HHMM.test(String(rota.serviceEnd || ''))) {
    const [eh, em] = rota.serviceEnd.split(':').map(Number);
    if (eh * 60 + em > startMin) endMin = eh * 60 + em;
  }
  const startLocal = localIso(rota.date, startMin), endLocal = localIso(rota.date, endMin);
  const title = String(rota.publicTitle || '').trim() || String(rota.type || '').trim() || 'Sunday service';
  const speaker = String(rota.speaker || '').trim();
  const about = String(rota.publicDescription || '').trim();
  const description = [about, speaker ? 'Speaker: ' + speaker : ''].filter(Boolean).join('\n\n');
  return {
    title: title.slice(0, 140),
    description,
    speaker,
    category: 'service',
    labels: [],
    visibility: 'public',
    status: 'confirmed',
    audience: ['public', 'members'],
    teams: [],
    featured: false,
    startLocal,
    endLocal,
    /* Milliseconds, as events-admin writes them (E.utcOf): What's On, the
       embed and the feed all ask startUtc >= a number. */
    startUtc: londonToUtc(rota.date, startLocal.slice(11)).getTime(),
    endUtc: londonToUtc(endLocal.slice(0, 10), endLocal.slice(11)).getTime(),
    allDay: false,
    location: { kind: 'room', siteId: String(rota.siteId || opts.siteId || ''), roomIds: [], venueId: '', videoRoom: '' },
    signupOn: false,
    source: 'rota',
    rotaId: id,
    createdBy: 'rota'
  };
}

/* The church's main site, for the location line: the event's own siteId
   if the rota has one, else the first site in the church's order. */
async function firstSiteId(db) {
  try {
    const s = await db.collection('sites').get();
    const list = s.docs.map((d) => ({ id: d.id, order: typeof d.get('order') === 'number' ? d.get('order') : 999, name: String(d.get('name') || '') }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return list.length ? list[0].id : '';
  } catch (e) { return ''; }
}

export async function syncRotaService(db, id, rota) {
  const ref = db.collection('calEvents').doc('rota_' + id);
  const featureOff = !(await featureOn(db, FEATURE));
  const want = mirrorFor(id, rota, { featureOff, siteId: rota && !rota.siteId ? await firstSiteId(db) : '' });
  if (!want) {
    const had = await ref.get();
    if (had.exists) await ref.delete();
    return { removed: had.exists };
  }
  const out = Object.assign({}, want, { updatedAt: FieldValue.serverTimestamp() });
  const had = await ref.get();
  if (!had.exists) out.createdAt = FieldValue.serverTimestamp();
  await ref.set(out);
  return { written: true };
}

export const rotaWhatsOn = onDocumentWritten({ document: 'events/{id}', region: REGION }, async (event) => {
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  await syncRotaService(getFirestore(), event.params.id, after);
});
