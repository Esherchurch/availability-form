/* Which saved plan is which service's (FINDINGS-churchhq H-11 item 0).
 *
 *   node tests/check-plan-store.mjs          (from v2/; no emulator)
 *   BREAK=date node tests/check-plan-store.mjs  the old rule (first plan for
 *                                               the date): must fail
 *
 * The decisions every planner now asks egbc-plan-store.js, with made-up
 * services: two services on one date keep two plans; one service on a date
 * behaves exactly as before; an older unlinked plan goes to the day's only
 * service, and is never guessed on a day with two.
 */
/* A plain script that sets window.EGBCPlanStore (globalThis here). */
await import('../egbc-plan-store.js');
const S = Object.assign({}, globalThis.EGBCPlanStore);
if (process.env.BREAK === 'date') {
  /* The old behaviour: the first plan with that date, whatever the service. */
  S.planFor = (docs) => (docs && docs[0]) || null;
  S.saveTarget = (docs) => (docs && docs[0] ? docs[0].id : null);
}
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };

const morning = { id: 'ev_am', date: '2026-11-01', type: 'Sunday Morning Worship', startTime: '10:00' };
const evening = { id: 'ev_pm', date: '2026-11-01', type: 'Sunday Morning Worship', startTime: '18:30' };
const two = [evening, morning];
const amPlan = { id: 'sv_am', data: { date: '2026-11-01', eventId: 'ev_am', order: ['am song'] } };
const pmPlan = { id: 'sv_pm', data: { date: '2026-11-01', eventId: 'ev_pm', order: ['pm song'] } };

console.log('Two services on one date');
ok('each opens its own plan (morning)', (S.planFor([amPlan, pmPlan], 'ev_am', two) || {}).id === 'sv_am');
ok('  and evening, even with the morning first in the list', (S.planFor([amPlan, pmPlan], 'ev_pm', two) || {}).id === 'sv_pm');
ok('  saving the evening never goes over the morning', S.saveTarget([amPlan], 'ev_pm', two) === null);
ok('  saving the morning goes to its own', S.saveTarget([amPlan, pmPlan], 'ev_am', two) === 'sv_am');
ok('  both are listed, in time order, even though they are the same type', S.inOrder(two).map((e) => e.id).join() === 'ev_am,ev_pm');
ok('  labelled with their time so they can be told apart', S.label(morning, 2) === 'Sunday Morning Worship · 10:00');
ok('  each emails its own plan', S.summaryId('2026-11-01', 'ev_am', two) !== S.summaryId('2026-11-01', 'ev_pm', two));

console.log('One service on a date (EGBC, almost every week): as before');
const old = { id: 'sv_old', data: { date: '2026-11-08', order: ['old'] } };
const only = [{ id: 'ev_only', date: '2026-11-08', type: 'Sunday Morning Worship', startTime: '10:00' }];
ok('an older plan (no service on it) is that service\'s', (S.planFor([old], 'ev_only', only) || {}).id === 'sv_old');
ok('  and saving goes to it, so it is linked as it is saved', S.saveTarget([old], 'ev_only', only) === 'sv_old');
ok('  the label is the type alone, as before', S.label(only[0], 1) === 'Sunday Morning Worship');
ok('  the emailed plan keeps the date as its name, as before', S.summaryId('2026-11-08', 'ev_only', only) === '2026-11-08');

console.log('An older plan on a date with two services: never guessed');
ok('neither service is given it', S.planFor([old], 'ev_am', two) === null && S.planFor([old], 'ev_pm', two) === null);
const mig = S.migrationPlan({ '2026-11-08': [old], '2026-11-01': [{ id: 'sv_x', data: { date: '2026-11-01' } }], '2026-11-15': [{ id: 'sv_y', data: { date: '2026-11-15' } }] },
  { '2026-11-08': only, '2026-11-01': two });
ok('the migration links a one-service date', mig.link.length === 1 && mig.link[0].planId === 'sv_old' && mig.link[0].eventId === 'ev_only', mig.link);
ok('  and lists a two-service date, and a date with no service, for a person', mig.ask.map((a) => a.date).join() === '2026-11-01,2026-11-15', mig.ask);

console.log('Archived services do not count (EGBC\'s live data, 23 Oct 2026: nine dates have 1-4 archived copies)');
const live = { id: 'ev_live', date: '2026-05-03', type: 'Sunday Morning Worship', startTime: '10:00' };
const dupes = [live, { id: 'ev_a1', date: '2026-05-03', type: 'Sunday Morning Worship', archived: true }, { id: 'ev_a2', date: '2026-05-03', type: 'Sunday Morning Worship', archived: true }];
const may = { id: 'sv_may', data: { date: '2026-05-03' } };
ok('a date with one live service and archived copies is a one-service date', S.inOrder(dupes).length === 1);
ok('  its older plan is that service\'s', (S.planFor([may], 'ev_live', dupes) || {}).id === 'sv_may');
const m2 = S.migrationPlan({ '2026-05-03': [may] }, { '2026-05-03': dupes });
ok('  and the migration links it, with nobody asked', m2.link.length === 1 && m2.link[0].eventId === 'ev_live' && m2.ask.length === 0, m2);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
