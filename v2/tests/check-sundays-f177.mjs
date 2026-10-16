/* tools/sundays-f177.mjs: the F-177 Sundays onto the rota, ticked for
 * What's On.
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore
 *     --project egbc-worship-planner "node tests/check-sundays-f177.mjs"
 *
 * Seeds the awkward cases (a Sunday already on the rota with a different
 * speaker; one with roles filled; a service on "No Service Today"), runs the
 * script for real, twice, and reads back what it did.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Needs the emulator (FIRESTORE_EMULATOR_HOST).'); process.exit(2); }
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const run = (...a) => execFileSync(process.execPath, ['tools/sundays-f177.mjs', ...a], { encoding: 'utf8', env: process.env, timeout: 60000 });
const onDay = async (date) => (await db.collection('events').where('date', '==', date).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

/* A clean slate for the twelve dates. */
const DATES = ['2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-25', '2026-12-27'];
for (const d of DATES) for (const e of await onDay(d)) await db.collection('events').doc(e.id).delete();

await db.collection('events').doc('f177_oct18').set({ date: '2026-10-18', type: 'Sunday Morning Worship', speaker: 'Synthetic Other Speaker',
  roles: ['Keyboard'], assignments: { Keyboard: { id: 'm1', name: 'Synthetic Keys' } }, description: 'private notes', archived: false, teams: ['Worship Team'] });
await db.collection('events').doc('f177_dec27').set({ date: '2026-12-27', type: 'Sunday Morning Worship', archived: false, teams: ['Worship Team'] });

console.log('Looking first');
const look = run();
ok('  with no --write nothing is written', /Nothing written\./.test(look) && !(await onDay('2026-10-25')).length, look.slice(-300));

console.log('\nWriting');
const out = run('--write');
const oct18 = (await db.collection('events').doc('f177_oct18').get()).data();
ok('  a Sunday already on the rota is ticked, titled and timed', oct18.whatsOn === true && oct18.publicTitle === 'Morning Worship' && oct18.serviceTime === '10:00', JSON.stringify(oct18));
ok('  its own speaker, roles, assignments and notes are left alone', oct18.speaker === 'Synthetic Other Speaker'
  && oct18.assignments.Keyboard.name === 'Synthetic Keys' && oct18.description === 'private notes');
ok('  and the different speaker is listed for Martin', /2026-10-18: the rota says the speaker is "Synthetic Other Speaker", ChurchSuite said "Ryan Ahern"/.test(out), out.slice(-500));
const oct25 = (await onDay('2026-10-25'))[0] || {};
ok('  a Sunday not on the rota is made as the Planner makes one, with its speaker', oct25.type === 'Sunday Morning Worship' && oct25.speaker === 'Ryan Ahern'
  && oct25.whatsOn === true && oct25.serviceTime === '10:00' && oct25.startTime === '08:00' && oct25.termLabel === 'Autumn 2026'
  && (oct25.roles || []).length === 8 && oct25.archived === false, JSON.stringify(oct25));
const carol = (await onDay('2026-12-20'))[0] || {};
ok('  the Carol Service is an evening service at 18:30', carol.type === 'Evening Carol Service' && carol.serviceTime === '18:30' && carol.serviceEnd === '20:00' && carol.publicTitle === 'Carol Service', JSON.stringify(carol));
const xmas = (await onDay('2026-12-25'))[0] || {};
ok('  Christmas Day is made on its Friday', xmas.type === 'Special Service' && xmas.publicTitle === 'Christmas Day Family Celebration Service');
const dec27 = (await db.collection('events').doc('f177_dec27').get()).data();
ok('  "No Service Today": the service there is unticked, not deleted, and listed', dec27.whatsOn === false && dec27.archived === false
  && /2026-12-27: the rota has a Sunday service/.test(out), JSON.stringify(dec27));
ok('  and nothing is made that day', (await onDay('2026-12-27')).length === 1);
let total = 0; for (const d of DATES) total += (await onDay(d)).length;
ok('  one service a date: the eleven services, plus the one left on 27 Dec', total === 12, String(total));

console.log('\nAgain');
const again = run('--write');
ok('  running it twice changes nothing', /0 written\./.test(again), again.slice(-300));

for (const d of DATES) for (const e of await onDay(d)) await db.collection('events').doc(e.id).delete();
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some((v) => !v) ? 1 : 0);
