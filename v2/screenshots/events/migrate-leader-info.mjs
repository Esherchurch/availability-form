/* WHO EACH LEADER IS: give every event's leaders record its leaderInfo (the
   spoofed-name fix, Martin 26 Oct; FINDINGS-events F-287).

   leaderInfo keeps each named leader's name, role and sign-in by member id;
   the new rules hold it to exactly the record's member ids, and the pages show
   a member's name from it, never from leaders[i]. This adds it - and
   leaderIds, where an older record has none - worked out the same way the
   pages do (egbc-events-safeguarding.js shapeOf). Nothing else changes.

   Lists what it would change; changes nothing without --write.

     node screenshots/events/migrate-leader-info.mjs                 (the list)
     node screenshots/events/migrate-leader-info.mjs --write         (and do it)
     --project <id>   the Firebase project (default egbc-worship-planner)
     --church <cid>   a church's records, under churches/<cid>/ (default: EGBC's, at the top)

   With FIRESTORE_EMULATOR_HOST set it runs against that emulator. Run the
   live one WHEN THE NEW RULES GO LIVE, not before: the rules live today don't
   know leaderInfo, and would then refuse every later save of a migrated
   record. Records it can't put right by itself are listed for a person:
   the same member named twice. */
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes('--write');
const PROJECT = arg('--project', process.env.GCLOUD_PROJECT || 'egbc-worship-planner');
const CHURCH = arg('--church', '');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();

/* the pages' own working-out, so the script and the pages can't disagree */
const sgm = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-events-safeguarding.js'), 'utf8'), { module: sgm });
const SG = sgm.exports;

const col = db.collection((CHURCH ? 'churches/' + CHURCH + '/' : '') + 'eventLeaders');
const snap = await col.get();
const out = { already: 0, change: [], ask: [] };
for (const d of snap.docs) {
  const x = d.data(), leaders = Array.isArray(x.leaders) ? x.leaders : [];
  const shape = SG.shapeOf(Object.assign({}, x, { leaderInfo: null }));
  const named = shape.leaderIds.filter(Boolean);
  if (new Set(named).size !== named.length) { out.ask.push({ id: d.id, why: 'the same member is named twice: ' + named.filter((m, i) => named.indexOf(m) !== i).join(', ') }); continue; }
  const same = x.leaderInfo && JSON.stringify(Object.keys(x.leaderInfo).sort()) === JSON.stringify([...named].sort())
    && Array.isArray(x.leaderIds) && x.leaderIds.length === leaders.length;
  if (same) { out.already++; continue; }
  out.change.push({ id: d.id, leaders: leaders.length, named: named.length, addsIds: !(Array.isArray(x.leaderIds) && x.leaderIds.length === leaders.length), shape });
}

console.log((WRITE ? 'CHANGING' : 'WOULD CHANGE (nothing written; add --write)') + ' - ' + PROJECT + (CHURCH ? ', church ' + CHURCH : ', EGBC (top level)') + (process.env.FIRESTORE_EMULATOR_HOST ? ', the emulator at ' + process.env.FIRESTORE_EMULATOR_HOST : ''));
console.log('  ' + snap.size + ' event leaders records: ' + out.change.length + ' to change, ' + out.already + ' already right, ' + out.ask.length + ' for a person');
out.change.forEach((c) => console.log('  ' + c.id + ': ' + c.leaders + ' ' + (c.leaders === 1 ? 'leader' : 'leaders') + ', ' + c.named + ' with a member id -> leaderInfo for ' + c.named + (c.addsIds ? '; leaderIds added' : '')));
out.ask.forEach((a) => console.log('  FOR A PERSON ' + a.id + ': ' + a.why));
if (WRITE) {
  for (const c of out.change) await col.doc(c.id).update({ leaderIds: c.shape.leaderIds, leaderInfo: c.shape.leaderInfo });
  console.log('  done: ' + out.change.length + ' changed');
}
process.exitCode = 0;
