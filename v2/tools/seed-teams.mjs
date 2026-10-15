/* ===================================================================
   One-off: put EGBC's teams and groups into Teams & groups
   ===================================================================

   Martin, 15 Oct 2026: "Safeguarding, Worship, Pastoral, Office, Admin,
   Hospitality, Kids Church, Youth, Welcome team, Maintenance, plus Finance
   and Elders as groups."

   WHAT IT WRITES, to teams/{id}, and nothing else:
     - a team that is not there yet: name, label, colour, rota, order,
       archived:false (and under18 where egbc-auth.js already says so);
     - a team that IS there: only `order`, and only when it has none. Its
       label, colour, runs and archived are left exactly as they are, so
       running this after the office has tidied the list undoes nothing.
   It never deletes, never touches `runs`, and never renames an id.

   Names the church already uses are kept, so no marker is orphaned:
     Worship  -> "Worship Team"   (the rota team's id; label "Worship")
     Office   -> "Church office"  (the group that runs things)
     Youth    -> "Youth Worship"  (label "Youth"; works with under-18s)

   SAFE BY DEFAULT.
     - With no --write it only reads, and prints what it WOULD write.
     - Against the real database it does nothing at all without --live.
     - Running it twice changes nothing the second time.

   HOW MARTIN RUNS IT (from the v2 folder):
     gcloud auth application-default login       (once, the church account)
     node tools/seed-teams.mjs --live            (look first)
     node tools/seed-teams.mjs --live --write    (then write)
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

/* THE DOOR, before anything is loaded or connected. */
if (!EMULATOR && !LIVE) {
  console.error('Refusing: this would read the REAL database, and --live was not given.\n'
    + 'To look:   node tools/seed-teams.mjs --live\n'
    + 'To write:  node tools/seed-teams.mjs --live --write');
  process.exit(2);
}
if (EMULATOR && LIVE) {
  console.error('Refusing: --live was given but FIRESTORE_EMULATOR_HOST is set ('
    + EMULATOR + '). Pick one.');
  process.exit(2);
}

/* Martin's list, in his order. rota:false is a group. */
const LIST = [
  { id: 'Safeguarding',  label: 'Safeguarding',  colour: '#b0392c', rota: true },
  { id: 'Worship Team',  label: 'Worship',       colour: '#3d6263', rota: true },
  { id: 'Pastoral',      label: 'Pastoral',      colour: '#7a4a6b', rota: true },
  { id: 'Church office', label: 'Church office', colour: '#111827', rota: false },
  { id: 'Admin',         label: 'Admin',         colour: '#475569', rota: true },
  { id: 'Hospitality',   label: 'Hospitality',   colour: '#b45309', rota: true },
  { id: 'Kids Church',   label: 'Kids Church',   colour: '#7a5f4a', rota: true, under18: true },
  { id: 'Youth Worship', label: 'Youth',         colour: '#5f7a4a', rota: true, under18: true },
  { id: 'Welcome team',  label: 'Welcome team',  colour: '#0f766e', rota: true },
  { id: 'Maintenance',   label: 'Maintenance',   colour: '#4f5a66', rota: true },
  { id: 'Finance',       label: 'Finance',       colour: '#15803d', rota: false },
  { id: 'Elders',        label: 'Elders',        colour: '#6b4a7a', rota: false },
  /* "Show the existing rota teams too." Written down as well, because once
     `teams` has anything in it, team emails offer exactly what is in it
     (F-211) - left out, these would vanish from there. */
  { id: 'AV Team',       label: 'AV',            colour: '#4a5f7a', rota: true },
  { id: 'Choir',         label: 'Choir',         colour: '#7a4a5f', rota: true, parent: 'Worship Team' },
  { id: 'Lazers',        label: 'Lazers',        colour: '#8a4a3d', rota: true, under18: true },
  { id: 'ReNu',          label: 'ReNu',          colour: '#3d6b5f', rota: true, under18: true },
  { id: 'Core Team',     label: 'Core Team',     colour: '#6b4a7a', rota: true }
];

const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp, applicationDefault } = requireFn('firebase-admin/app');
const { getFirestore, FieldValue } = requireFn('firebase-admin/firestore');

initializeApp(EMULATOR ? { projectId: PROJECT }
  : { projectId: PROJECT, credential: applicationDefault() });
const db = getFirestore();

console.log((WRITE ? 'WRITING to ' : 'Looking only (add --write to write), ')
  + (EMULATOR ? 'the emulator at ' + EMULATOR : 'the REAL database'));

let writes = 0;
for (let i = 0; i < LIST.length; i++) {
  const t = LIST[i], order = i + 1;
  const ref = db.collection('teams').doc(t.id);
  const snap = await ref.get();
  let data = null;
  if (!snap.exists) {
    data = { name: t.id, label: t.label, colour: t.colour, rota: t.rota, order, archived: false };
    if (t.under18) data.under18 = true;
    if (t.parent) data.parent = t.parent;
    console.log('  add    ' + t.id + (t.rota ? '' : ' (group)') + ', order ' + order);
  } else if (typeof (snap.data() || {}).order !== 'number') {
    data = { order };
    console.log('  order  ' + t.id + ' -> ' + order + ' (already there; nothing else changed)');
  } else {
    console.log('  leave  ' + t.id + ' (already there, order ' + snap.data().order + ')');
  }
  if (data && WRITE) {
    await ref.set(Object.assign(data, { updatedAt: FieldValue.serverTimestamp(), updatedBy: 'seed-teams' }), { merge: true });
    writes++;
  }
}
console.log(WRITE ? writes + ' written.' : 'Nothing written.');
process.exit(0);
