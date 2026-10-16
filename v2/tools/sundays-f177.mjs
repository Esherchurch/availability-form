/* ===================================================================
   One-off: the Sundays from ChurchSuite into the rota (F-177)
   ===================================================================

   "Enter a Sunday once" (Martin, 15 Oct 2026). The ChurchSuite import
   left the Sunday services out on purpose (F-177: "for the main window,
   the rota"). This puts them on the ROTA (`events`), ticked "In What's
   On", and the hub function rotaWhatsOn shows each one in What's On, the
   app and the website. No separate calendar event is made.

   FOR EACH DATE:
     - a service already on the rota that day (not archived, and of the
       kind below) is UPDATED: publicTitle, serviceTime and whatsOn:true.
       Its speaker is filled in only if the rota has none; a different
       speaker already there is left alone and listed for Martin;
     - none there: one is MADE, exactly as the Rota Planner makes one
       (teams, roles, the team's 08:00-11:30, the term label).
   Roles, assignments, notes and everything else on a service are never
   touched.

   27 Dec, "No Service Today": nothing is made. If the rota has a Sunday
   service that day it is UNticked (whatsOn:false) and listed, so nobody
   is rota'd for a service that is not happening without someone deciding.

   SAFE BY DEFAULT.
     - With no --write it only reads, and prints what it WOULD do.
     - Against the real database it does nothing at all without --live.
     - Running it twice changes nothing the second time.

   HOW MARTIN RUNS IT (from the v2 folder), AFTER functions:hub is deployed
   with rotaWhatsOn (otherwise the rota is right and What's On waits for
   the next change to each service):
     node tools/sundays-f177.mjs --live            (look first)
     node tools/sundays-f177.mjs --live --write    (then write)
   =================================================================== */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const PROJECT = 'egbc-worship-planner';
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const LIVE = argv.includes('--live');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';

if (!EMULATOR && !LIVE) {
  console.error('Refusing: this would read the REAL database, and --live was not given.\n'
    + 'To look:   node tools/sundays-f177.mjs --live\n'
    + 'To write:  node tools/sundays-f177.mjs --live --write');
  process.exit(2);
}
if (EMULATOR && LIVE) {
  console.error('Refusing: --live was given but FIRESTORE_EMULATOR_HOST is set (' + EMULATOR + '). Pick one.');
  process.exit(2);
}

/* F-177's table (FINDINGS-events, "For the main window, the rota"). */
const SUNDAYS = [
  { date: '2026-10-18', time: '10:00', title: 'Morning Worship', speaker: 'Ryan Ahern' },
  { date: '2026-10-25', time: '10:00', title: 'Morning Worship', speaker: 'Ryan Ahern' },
  { date: '2026-11-01', time: '10:00', title: 'International Day of Prayer for the Persecuted Church' },
  { date: '2026-11-08', time: '10:00', title: 'Remembrance Sunday' },
  { date: '2026-11-15', time: '10:00', title: 'Shoebox Sunday', speaker: 'Matt Stott' },
  { date: '2026-11-22', time: '10:00', title: 'Morning Worship', speaker: 'Jeanette Holt' },
  { date: '2026-11-29', time: '10:00', title: 'Baptism Sunday!' },
  { date: '2026-12-06', time: '10:00', title: 'Morning Worship', speaker: 'James Griffin' },
  { date: '2026-12-13', time: '10:00', title: 'Family Nativity Service' },
  { date: '2026-12-20', time: '18:30', title: 'Carol Service', type: 'Evening Carol Service', serviceEnd: '20:00' },
  { date: '2026-12-25', time: '10:00', title: 'Christmas Day Family Celebration Service', type: 'Special Service' },
  { date: '2026-12-27', none: true, title: 'No Service Today' }
];

/* As the Rota Planner makes a Sunday (Planner.html addSingleLine). */
const MANDATORY_SUNDAY_ROLES = ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass', 'Sound', 'Words', 'Cameras'];
function termLabel(date) {
  const d = new Date(date), m = d.getMonth() + 1;
  return (m <= 4 ? 'Spring' : m <= 8 ? 'Summer' : 'Autumn') + ' ' + d.getFullYear();
}

const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp, applicationDefault } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
initializeApp(EMULATOR ? { projectId: PROJECT } : { projectId: PROJECT, credential: applicationDefault() });
const db = getFirestore();

console.log((WRITE ? 'WRITING to ' : 'Looking only (add --write to write), ') + (EMULATOR ? 'the emulator at ' + EMULATOR : 'the REAL database'));
let writes = 0; const forMartin = [];
for (const s of SUNDAYS) {
  const type = s.type || 'Sunday Morning Worship';
  const day = (await db.collection('events').where('date', '==', s.date).get()).docs
    .filter((d) => d.get('archived') !== true);
  const same = day.filter((d) => d.get('type') === type);
  if (s.none) {
    for (const d of day.filter((x) => x.get('type') === 'Sunday Morning Worship')) {
      if (d.get('whatsOn') === false && d.get('publicTitle') === s.title) { console.log('  leave  ' + s.date + ' ' + s.title + ' (already unticked)'); continue; }
      console.log('  untick ' + s.date + ' the rota has a service on a "No Service Today" Sunday (' + d.id + ')');
      forMartin.push(s.date + ': the rota has a Sunday service (' + d.id + ') on a "No Service Today" Sunday. Unticked from What\'s On; archive it on the rota if it is not happening.');
      if (WRITE) { await d.ref.update({ whatsOn: false, publicTitle: s.title }); writes++; }
    }
    if (!day.length) console.log('  none   ' + s.date + ' ' + s.title + ' (nothing on the rota, nothing made)');
    continue;
  }
  if (same.length > 1) forMartin.push(s.date + ': ' + same.length + ' "' + type + '" services on the rota; the first (' + same[0].id + ') was used.');
  if (same.length) {
    const d = same[0], want = { publicTitle: s.title, serviceTime: s.time, whatsOn: true };
    if (s.serviceEnd) want.serviceEnd = s.serviceEnd;
    const had = String(d.get('speaker') || '').trim();
    if (s.speaker && !had) want.speaker = s.speaker;
    if (s.speaker && had && had !== s.speaker) forMartin.push(s.date + ': the rota says the speaker is "' + had + '", ChurchSuite said "' + s.speaker + '". Left as the rota has it.');
    const changes = Object.keys(want).filter((k) => d.get(k) !== want[k]);
    if (!changes.length) { console.log('  leave  ' + s.date + ' ' + s.title + ' (already right)'); continue; }
    console.log('  update ' + s.date + ' ' + s.title + ' (' + d.id + '): ' + changes.join(', '));
    if (WRITE) { await d.ref.update(Object.fromEntries(changes.map((k) => [k, want[k]]))); writes++; }
  } else {
    const doc = { date: s.date, termLabel: termLabel(s.date), type, description: '',
      teams: ['Worship Team', 'AV Team'], startTime: type === 'Evening Carol Service' ? '17:00' : '08:00',
      endTime: type === 'Evening Carol Service' ? '20:00' : '11:30', roles: MANDATORY_SUNDAY_ROLES, archived: false,
      whatsOn: true, serviceTime: s.time, publicTitle: s.title };
    if (s.serviceEnd) doc.serviceEnd = s.serviceEnd;
    if (s.speaker) doc.speaker = s.speaker;
    console.log('  make   ' + s.date + ' ' + s.title + ' (' + type + ', ' + s.time + ')');
    if (WRITE) { await db.collection('events').add(doc); writes++; }
  }
}
console.log(WRITE ? writes + ' written.' : 'Nothing written.');
if (forMartin.length) console.log('\nFor Martin to look at:\n  - ' + forMartin.join('\n  - '));
process.exit(0);
