/* ===================================================================
   The week's e-news drafts itself on Monday morning
   ===================================================================

   At 07:00 London every Monday, for each church that uses the e-news:
   if nothing has been started this week, the week's draft is made from
   What's On, that Sunday's services and the notices showing now - the
   same draft the E-news page makes when the office opens it (enews.html
   newIssue), by the same code (egbc-mailblocks.js draft, copied here by
   tools/enews-draft-build.mjs). The office finds it waiting, to check and
   send. Nobody has to remember to start it.

   The page still drafts one if it opens to find none (a church that
   switched the e-news on mid-week), and it never makes a second: either
   finds the other's by the week it was made in.

     weekOf(date)                 -> the Monday, YYYY-MM-DD, in London
     draftWeek({ db, now, hub })  -> 'made' | 'had one' | 'off'
     enewsMondayDraft             the schedule
   =================================================================== */

import { createRequire } from 'node:module';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { eachChurch } from './church-scope.js';
import { partOn } from './part-on.js';
import { hubUrl } from './notify.js';

const require = createRequire(import.meta.url);
const MB = require('./mailblocks.cjs');
const Notices = require('./notices.cjs');
const PlanStore = require('./plan-store.cjs');
/* egbc-services.js is a plain page script: it sets EGBCServices on the global. */
require('./services.cjs');
const Services = globalThis.EGBCServices;

const REGION = 'europe-west2';
const DAY = 86400000;

/* YYYY-MM-DD in London. */
function londonIso(d) {
  const o = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).forEach((x) => { o[x.type] = x.value; });
  return o.year + '-' + o.month + '-' + o.day;
}

/**
 * The Monday of a date's week, in London, as YYYY-MM-DD (as enews.html).
 * @param {Date} d
 * @returns {string}
 */
export function weekOf(d) {
  const t = new Date(londonIso(d) + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/* Every document of a query, 500 at a time (no hidden cap). */
async function all(q) {
  const out = [];
  let last = null;
  for (;;) {
    const s = await (last ? q.startAfter(last) : q).limit(500).get();
    out.push(...s.docs);
    if (s.size < 500) return out;
    last = s.docs[s.docs.length - 1];
  }
}

/**
 * Make this week's e-news draft for one church, unless it has one or does
 * not use the e-news.
 * @param {object} p
 * @param {FirebaseFirestore.Firestore} p.db the church's database (scoped)
 * @param {Date} [p.now]
 * @param {string} [p.hub] the hub's address, for links; read when not given
 * @returns {Promise<'made'|'had one'|'off'>}
 */
export async function draftWeek({ db, now = new Date(), hub }) {
  if (!(await partOn(db, 'comms', 'enews'))) return 'off';
  const mon = weekOf(now);
  /* Started this week already: by the page, by hand, or by an earlier run. */
  const recent = await db.collection('enewsIssues').where('createdAt', '>=', mon).get();
  const has = recent.docs.some((d) => !/^auto_/.test(d.id) && d.data().kind !== 'oneoff' && d.data().week !== 'notice');
  if (has) return 'had one';

  const today = londonIso(now);
  const sun = new Date(today + 'T12:00:00Z');
  sun.setUTCDate(sun.getUTCDate() + ((7 - sun.getUTCDay()) % 7));
  const sunIso = sun.toISOString().slice(0, 10);
  const from = now.getTime() - DAY, to = now.getTime() + 15 * DAY;

  const [evDocs, dayDocs, newsDocs, siteDocs, servicesCfg, setDoc, detDoc] = await Promise.all([
    /* What's On's events, every audience the office's draft may hold:
       members' events go in as members-only blocks, team and unlisted
       events never (the draft decides, by each event's visibility). */
    all(db.collection('calEvents').where('audience', 'array-contains-any', ['public', 'members', 'churchMembers'])
      .where('startUtc', '>=', from).where('startUtc', '<', to).orderBy('startUtc')),
    db.collection('events').where('date', '==', sunIso).get().then((s) => s.docs),
    all(db.collection('news').orderBy('createdAt', 'desc')),
    db.collection('sites').get().then((s) => s.docs),
    db.collection('churchSettings').doc('services').get().then((s) => (s.exists ? s.data() : null)),
    db.collection('enewsSettings').doc('main').get().then((s) => (s.exists ? s.data() : {})),
    db.collection('churchSettings').doc('details').get().then((s) => (s.exists ? s.data() : {}))
  ]);
  const events = evDocs.map((x) => Object.assign({ id: x.id }, x.data())).sort((a, b) => (a.startUtc || 0) - (b.startUtc || 0));
  const services = PlanStore.dayServices(dayDocs.map((x) => Object.assign({ id: x.id }, x.data()))
    .filter((e) => Services.isService(servicesCfg, e.type)), sunIso);
  const sites = {};
  siteDocs.forEach((x) => { if (x.data().active !== false) sites[x.id] = x.data().name || ''; });
  const notices = newsDocs.map((x) => Object.assign({ id: x.id }, x.data()));
  const base = String(hub !== undefined ? hub : await hubUrl(db)).replace(/\/+$/, '');

  const blocks = MB.draft({ now, events, services, sundayIso: sunIso, sites, notices, base,
    sundayLabel: 'Sunday ' + sun.getUTCDate() + ' ' + sun.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }) });
  const short = String(((setDoc.church || {}).shortName) || detDoc.shortName || detDoc.name || '').trim();
  const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long' }).format(now);
  const at = now.toISOString();
  /* The same fields the page saves for a new draft (enews.html save). */
  await db.collection('enewsIssues').doc().set({
    subject: (short + ' e-news ' + when).trim().slice(0, 200), preheader: ('What’s happening this week at ' + short).slice(0, 200),
    template: setDoc.template === 'green' ? 'green' : 'classic', blocks, status: 'draft', sendAt: '', week: mon,
    htmlMembers: '', htmlEveryone: '', createdAt: at, createdBy: 'enews-monday', updatedAt: at, updatedBy: 'enews-monday'
  });
  return 'made';
}

export const enewsMondayDraft = onSchedule({ region: REGION, schedule: '0 7 * * 1', timeZone: 'Europe/London', retryCount: 0 },
  async () => { await eachChurch(getFirestore(), (ch) => draftWeek({ db: ch.db })); });
