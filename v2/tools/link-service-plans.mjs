/* LINK EACH SAVED SERVICE PLAN TO ITS SERVICE (FINDINGS-churchhq H-11 item 0).
 *
 * Before this, a plan in `services` was found by its date alone. Now it
 * carries `eventId`, the rota event it belongs to. This links the plans
 * saved before: each to its date's ONE live (not archived) rota event.
 * A date with more than one live service, or none, is never guessed: it
 * is listed for a person to choose.
 *
 * Run by the reviewing window against the live project (read-only by
 * default). From v2/functions (where firebase-admin is installed), with
 * Application Default Credentials:
 *
 *   node ../tools/link-service-plans.mjs                 DRY RUN: reads only, writes nothing;
 *                                                        prints each plan -> event id, and any
 *                                                        it cannot place
 *   node ../tools/link-service-plans.mjs --apply         backs up each plan it changes to
 *                                                        servicesBackups/{planId}_{time}, then
 *                                                        adds eventId to the plan; nothing else
 *
 * Options: --project <id> (default egbc-worship-planner). On the emulator,
 * set FIRESTORE_EMULATOR_HOST first (the checks do).
 *
 * It only ever ADDS eventId to a plan that has none. A plan that already
 * has one is left alone, so running it twice changes nothing the second time.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
await import(path.join(HERE, '..', 'egbc-plan-store.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const Store = globalThis.EGBCPlanStore;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const at = args.indexOf('--project');
const PROJECT = at >= 0 ? args[at + 1] : (process.env.GCLOUD_PROJECT || 'egbc-worship-planner');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();

const where = process.env.FIRESTORE_EMULATOR_HOST ? 'the EMULATOR (' + process.env.FIRESTORE_EMULATOR_HOST + ')' : 'LIVE project ' + PROJECT;
console.log((APPLY ? 'APPLY' : 'DRY RUN (writes nothing)') + ' against ' + where + '\n');

const [plansSnap, eventsSnap] = await Promise.all([db.collection('services').get(), db.collection('events').get()]);
const plansByDate = {}, eventsByDate = {};
plansSnap.docs.forEach((d) => { const x = d.data() || {}; (plansByDate[x.date || '(no date)'] = plansByDate[x.date || '(no date)'] || []).push({ id: d.id, data: x }); });
eventsSnap.docs.forEach((d) => { const x = d.data() || {}; if (!x.date) return; (eventsByDate[x.date] = eventsByDate[x.date] || []).push(Object.assign({ id: d.id }, x)); });

const linked = plansSnap.docs.filter((d) => (d.data() || {}).eventId).length;
const plan = Store.migrationPlan(plansByDate, eventsByDate);
console.log(plansSnap.size + ' plans; ' + linked + ' already linked; ' + plan.link.length + ' to link; ' + plan.ask.length + ' date(s) for a person to choose.\n');

for (const l of plan.link) {
  const archived = (eventsByDate[l.date] || []).filter((e) => e.archived).length;
  console.log('  LINK  ' + l.date + '  plan ' + l.planId + '  ->  event ' + l.eventId + (archived ? '   (' + archived + ' archived on that date, ignored)' : ''));
}
for (const a of plan.ask) {
  console.log('  ASK   ' + a.date + '  plan(s) ' + a.planIds.join(', ') + '  -  ' + (a.services.length
    ? a.services.length + ' live services: ' + a.services.map((s) => s.id + ' (' + (s.type || '?') + (s.startTime ? ' ' + s.startTime : '') + ')').join(', ')
    : 'no live service on that date'));
}

if (!APPLY) {
  console.log('\nNothing was written. Run again with --apply to back up and link the ' + plan.link.length + ' above.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let done = 0;
for (const l of plan.link) {
  const ref = db.collection('services').doc(l.planId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    if (!snap.exists || cur.eventId) return;                 // gone, or linked meanwhile: leave it
    tx.set(db.collection('servicesBackups').doc(l.planId + '_' + stamp), { plan: cur, planId: l.planId, reason: 'H-11 item 0: before linking to its service', at: new Date().toISOString() });
    tx.update(ref, { eventId: l.eventId });
    done++;
  });
}
console.log('\nLinked ' + done + ' plan(s); each backed up first to servicesBackups/<planId>_' + stamp + '.');
