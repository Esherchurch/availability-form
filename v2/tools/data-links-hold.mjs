/* MARK WHAT EXISTING RECORDS HOLD. The server marks a record's heldBy when a
 * payment, safeguarding, health and safety or accident record pointing at it
 * is written (functions/data-links.js, holdParent). Records written before
 * that trigger existed are marked by this, once, for EGBC and every church.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/data-links-hold.mjs           DRY RUN: counts, writes nothing
 *   node ../tools/data-links-hold.mjs --apply   writes it
 *
 * Options: --project <id> (default egbc-worship-planner). Safe to run again:
 * heldBy only gains words it hasn't got.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const url = (f) => path.join(HERE, '..', 'functions', f).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:');
const { MAP, holdParents, counts, londonDay } = await import(url('data-links.js'));
const { scopedDb } = await import(url('church-scope.js'));

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : ''; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const root = getFirestore(), today = londonDay();
const holders = Object.keys(MAP).filter((c) => (MAP[c].links || []).some((l) => l.rule === 'block' && l.holds));
const churches = [null].concat((await root.collection('hqChurches').limit(500).get()).docs.map((d) => d.id));

console.log((APPLY ? 'MARKING' : 'DRY RUN, nothing written') + ' (' + PROJECT + ')');
for (const cid of churches) {
  const dbi = scopedDb(root, cid);
  let n = 0;
  for (const c of holders) {
    for (const d of (await dbi.collection(c).get()).docs) {
      const x = Object.assign({ __id: d.id }, d.data());
      if (!MAP[c].links.some((l) => l.rule === 'block' && l.holds && counts(l.only, x, today))) continue;
      n++;
      if (APPLY) await holdParents(dbi, c, x);
    }
  }
  console.log('  ' + (cid || 'egbc') + ': ' + n + ' records hold something');
}
if (!APPLY) console.log('Add --apply to write it.');
process.exit(0);
