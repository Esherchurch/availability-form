/* THE FIRE ROLL CALL, ONE RECORD FOR EACH BUILDING (H&S step 3a;
   FINDINGS-events F-298).

   The old single record, fireRollCall/main, named everyone who may open the
   fire roll call, each for one building or for every building. The new rules
   read one record for each building (fireRollCall/<siteId>) and
   fireRollCall/all for every building. This splits the old record into them,
   worked out by the page's own code (egbc-hs-core.js splitRollCall and
   rollCallDoc), so the script and the page can't disagree.

   The old record is left where it is: only a master admin can read it under
   the new rules, and functions/peeps.js only falls back to it while no new
   record exists. A building's record that is already there is left alone.

   Lists what it would change; changes nothing without --write.

     node tools/migrate-fire-rollcall.mjs                 (the list)
     node tools/migrate-fire-rollcall.mjs --write         (and do it)
     --project <id>   the Firebase project (default egbc-worship-planner)
     --church <cid>   a church's records, under churches/<cid>/ (default: EGBC's, at the top)

   With FIRESTORE_EMULATOR_HOST set it runs against that emulator. Run the
   live one WHEN THE NEW RULES GO LIVE, with them: until then the live pages
   still read the old record. */
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes('--write');
const PROJECT = arg('--project', process.env.GCLOUD_PROJECT || 'egbc-worship-planner');
const CHURCH = arg('--church', '');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();

/* the page's own working-out */
const hm = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-hs-core.js'), 'utf8'), { module: hm, globalThis: {} });
const H = hm.exports;

const base = CHURCH ? 'churches/' + CHURCH + '/' : '';
const col = db.collection(base + 'fireRollCall');
const old = await col.doc('main').get();
console.log((WRITE ? 'CHANGING' : 'WOULD CHANGE (nothing written; add --write)') + ' - ' + PROJECT + (CHURCH ? ', church ' + CHURCH : ', EGBC (top level)') + (process.env.FIRESTORE_EMULATOR_HOST ? ', the emulator at ' + process.env.FIRESTORE_EMULATOR_HOST : ''));
if (!old.exists) { console.log('  No old fire roll call record: nothing to do.'); process.exit(0); }

const x = old.data() || {};
const parts = H.splitRollCall(x);
const sites = new Set((await db.collection(base + 'sites').get()).docs.map((d) => d.id));
const out = { write: [], already: [], unknown: [] };
for (const id of Object.keys(parts)) {
  if (id !== H.ROLL_ALL && !sites.has(id)) { out.unknown.push({ id, people: parts[id].length }); continue; }
  if ((await col.doc(id).get()).exists) { out.already.push(id); continue; }
  out.write.push({ id, doc: H.rollCallDoc(id, parts[id]) });
}
console.log('  The old record names ' + (x.people || []).length + ' people. ' + out.write.length + ' records to write, ' + out.already.length + ' already there, ' + out.unknown.length + ' for a building that no longer exists.');
out.write.forEach((w) => console.log('    ' + (w.id === H.ROLL_ALL ? 'every building' : 'building ' + w.id) + ': ' + w.doc.people.length + ' people (' + w.doc.stewards.length + ' duty stewards)'));
out.already.forEach((id) => console.log('    left alone (already there): ' + id));
out.unknown.forEach((u) => console.log('    FOR A PERSON: building ' + u.id + ' is not in Places (' + u.people + ' people). Name them again in Health and safety settings.'));
if (!WRITE) process.exit(0);
const at = new Date().toISOString();
for (const w of out.write) {
  await col.doc(w.id).set(Object.assign(w.doc, { updatedBy: x.updatedBy || '', updatedByName: String(x.updatedByName || 'moved from the old list').slice(0, 200), updatedAt: at }));
}
console.log('  Done: ' + out.write.length + ' written.');
