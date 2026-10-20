/* ===================================================================
   One-off: write each switch's default into churchSettings/features
   ===================================================================

   The reviewing window, 20 Oct 2026: live churchSettings/features is
   empty. The pages take the defaults (every switch on at EGBC), but the
   events window's complianceDaily, peepToday and the bookings dot want
   buildingCompliance stored as exactly true, so to them it is OFF. The
   code now has one list (functions/features.js = egbc-auth.js, held
   together by tests/check-features-agree.mjs); this makes the live data
   say the same thing out loud, so every reader agrees today, old or new.

   WHAT IT WRITES: for each switch with NOTHING stored, its default
   (all true at EGBC; Martin, 19 Oct 2026), merged, with updatedAt and
   updatedBy 'store-feature-defaults'. A switch already stored, on or
   off, is never changed. Nothing else in the document is touched.

   SAFE BY DEFAULT.
     - With no --write it only reads, and prints what it WOULD do.
     - Against the real database it does nothing at all without --live.
     - Running it twice changes nothing the second time.

   HOW MARTIN RUNS IT (from the v2 folder):
     node tools/store-feature-defaults.mjs --live            (look first)
     node tools/store-feature-defaults.mjs --live --write    (then write)
   =================================================================== */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const PROJECT = 'egbc-worship-planner';
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const LIVE = argv.includes('--live');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';

if (!EMULATOR && !LIVE) {
  console.error('Refusing: this would read the REAL database, and --live was not given.\n'
    + 'To look:   node tools/store-feature-defaults.mjs --live\n'
    + 'To write:  node tools/store-feature-defaults.mjs --live --write');
  process.exit(2);
}
if (EMULATOR && LIVE) {
  console.error('Refusing: --live was given but FIRESTORE_EMULATOR_HOST is set (' + EMULATOR + '). Pick one.');
  process.exit(2);
}

const { FEATURES } = await import(pathToFileURL(path.join(V2, 'functions', 'features.js')).href);
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp, applicationDefault } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
initializeApp(EMULATOR ? { projectId: PROJECT } : { projectId: PROJECT, credential: applicationDefault() });
const db = getFirestore();

const ref = db.collection('churchSettings').doc('features');
const snap = await ref.get();
const stored = (snap.exists && snap.data()) || {};
console.log((EMULATOR ? 'EMULATOR ' + EMULATOR : 'LIVE ' + PROJECT) + ': churchSettings/features ' + (snap.exists ? 'has ' + Object.keys(stored).length + ' field(s)' : 'does not exist'));

const patch = {};
for (const f of FEATURES) {
  const v = stored[f.name];
  if (typeof v === 'boolean') console.log('  kept     ' + f.name + ' = ' + v + (v === f.on ? '' : '  (set by a master admin; not the default)'));
  else { patch[f.name] = f.on; console.log('  ' + (WRITE ? 'writing ' : 'would set') + ' ' + f.name + ' = ' + f.on + (v === undefined ? '' : '  (was ' + JSON.stringify(v) + ')')); }
}
const n = Object.keys(patch).length;
if (!n) { console.log('Nothing to do: every switch is stored.'); process.exit(0); }
if (!WRITE) { console.log('\n' + n + ' switch(es) would be written. Nothing written (no --write).'); process.exit(0); }
await ref.set({ ...patch, updatedAt: new Date().toISOString(), updatedBy: 'store-feature-defaults' }, { merge: true });
console.log('\n' + n + ' switch(es) written.');
process.exit(0);
