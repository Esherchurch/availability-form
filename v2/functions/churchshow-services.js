/* =====================================================================
   CHURCHSHOW: TODAY'S SERVICES IN ITS BUILDING, AND THE CHURCH'S WORDS
   (FINDINGS-churchhq H-11 item 2; ChurchShow's N2/N3; Martin's answer,
   23 Oct 2026: it shows the next service starting in that building, with
   the day's others to pick from)
   ---------------------------------------------------------------------
     churchShowServicesToday {}  -> { siteId, date, next, services: [{ eventId,
                                    type, label, startTime, serviceTime,
                                    siteId, planId }] }
     churchShowWords {}          -> { churchName, serviceDay, groups: { id: name } }

   Only a paired ChurchShow computer asks (its sign-in says device:
   'churchshow' and its building). The church is the computer's own
   (churchOf: its `churches` claim; none is EGBC).

   A SERVICE IS ITS ROTA EVENT (H-11): today's live events in this
   building, in time order (egbc-plan-store.js, the planners' own helper),
   each with its own plan (`services`, by eventId). A service with no
   building is at the church's main building: churchSettings/details
   .mainSiteId, or else the first of its buildings by name. A meeting
   (not a service: the church's kinds, egbc-services.js; or whatsOn) is
   left out.
   ===================================================================== */
import { createRequire } from 'node:module';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';

const require = createRequire(import.meta.url);
const Plans = require('./plan-store.cjs');

/* EGBC's services, when the church has stored no kinds of its own. */
const EGBC_SERVICES = ['Sunday Morning Worship', 'Evening Carol Service', 'Midnight Service', 'Special Service', 'LOUD Worship'];
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const londonTime = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

function device(request) {
  const t = (request.auth && request.auth.token) || {};
  if (t.device !== 'churchshow' || !t.siteId) throw new HttpsError('permission-denied', 'Only a paired ChurchShow computer asks this.');
  return { uid: request.auth.uid, siteId: String(t.siteId) };
}

async function mainSite(db) {
  const d = (await db.collection('churchSettings').doc('details').get()).data() || {};
  if (d.mainSiteId) return String(d.mainSiteId);
  const sites = (await db.collection('sites').get()).docs.map((x) => ({ id: x.id, name: String((x.data() || {}).name || x.id), active: (x.data() || {}).active !== false }))
    .filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name));
  return sites.length ? sites[0].id : '';
}

/* The work, with the day and time passed in, so a check can run it. */
export async function servicesToday(db, { siteId, now }) {
  const at = now || new Date(), date = londonDay(at), time = londonTime(at);
  const cfg = (await db.collection('churchSettings').doc('services').get()).data() || null;
  const kinds = cfg && Array.isArray(cfg.types) && cfg.types.length ? cfg.types.filter((t) => t && t.service).map((t) => t.name) : EGBC_SERVICES;
  const main = await mainSite(db);
  const day = (await db.collection('events').where('date', '==', date).get()).docs.map((x) => ({ id: x.id, ...x.data() }))
    .filter((e) => kinds.includes(e.type) || e.whatsOn === true);
  const live = Plans.inOrder(day);
  const here = live.filter((e) => (e.siteId || main || siteId) === siteId);
  const plans = (await db.collection('services').where('date', '==', date).get()).docs.map((x) => ({ id: x.id, data: x.data() }));
  const services = here.slice(0, 50).map((e) => {
    const p = Plans.planFor(plans, e.id, live);
    return { eventId: e.id, type: e.type || '', label: Plans.label(e, here.length), startTime: e.startTime || '', serviceTime: e.serviceTime || '',
      siteId: e.siteId || main || '', planId: p ? p.id : null };
  });
  /* The next to start: the first whose public time (or team time) is not
     yet an hour past; else the last of the day. */
  const startOf = (s) => s.serviceTime || s.startTime || '00:00';
  const plusHour = (hm) => { const [h, m] = hm.split(':').map(Number); return String(Math.min(23, h + 1)).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0'); };
  const next = services.find((s) => plusHour(startOf(s)) >= time) || services[services.length - 1] || null;
  return { siteId, date, next: next ? next.eventId : null, services };
}

/* The church's own words for ChurchShow (H-11 item 2): EGBC's are today's. */
export async function wordsFor(db, { uid }) {
  const d = (await db.collection('churchSettings').doc('details').get()).data() || {};
  const dev = (await db.collection('devices').doc(uid).get()).data() || {};
  const groups = {};
  for (const id of ((dev.jobs || {}).lessonGroups || []).slice(0, 500)) {
    const t = (await db.collection('teams').doc(String(id)).get()).data();
    groups[id] = String((t && (t.label || t.name)) || id);
  }
  return { churchName: String(d.name || ''), serviceDay: String(d.serviceDay || 'Sunday'), groups };
}

export const churchShowServicesToday = onCall({ region: 'europe-west2' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = device(request);
  return servicesToday(churchOf(request, getFirestore()).db, { siteId: me.siteId, now: new Date() });
});

export const churchShowWords = onCall({ region: 'europe-west2' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = device(request);
  return wordsFor(churchOf(request, getFirestore()).db, { uid: me.uid });
});
