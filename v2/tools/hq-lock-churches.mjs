/* GOING LIVE: EVERY CHURCH COUNTS AS LIVE (GOING-LIVE.md step 12; the events
 * window). A church counts as live once the hub's rules are live, because
 * until then its files and private forms could be read signed out. That is
 * churches/<id>/churchSettings/launch.rulesLocked, which Present (adding
 * slides) and the private forms wait for. EGBC's own is set on Church
 * settings (step 12); this sets it for every other church that exists on the
 * day. hq-create-church.mjs sets it for a church made after that.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials, only after the rules are deployed:
 *
 *   node ../tools/hq-lock-churches.mjs            DRY RUN: lists, writes nothing
 *   node ../tools/hq-lock-churches.mjs --apply    writes it
 *
 * Options: --project <id> (default egbc-worship-planner). Running it again
 * lists nothing to do.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : ''; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const churches = (await db.collection('hqChurches').limit(500).get()).docs.map((d) => d.id);
const todo = [];
for (const cid of churches) {
  const l = await db.doc('churches/' + cid + '/churchSettings/launch').get();
  if (!(l.exists && l.data().rulesLocked === true)) todo.push(cid);
}
console.log((APPLY ? 'LOCKING' : 'DRY RUN, nothing written') + ' (' + PROJECT + '): ' + churches.length + ' churches, ' + todo.length + ' to do');
todo.forEach((cid) => console.log('  ' + cid));
if (!APPLY) { console.log(todo.length ? 'Add --apply to write it.' : 'Nothing to do.'); process.exit(0); }
const now = new Date().toISOString();
for (let i = 0; i < todo.length; i += 400) {
  const b = db.batch();
  todo.slice(i, i + 400).forEach((cid) => b.set(db.doc('churches/' + cid + '/churchSettings/launch'),
    { rulesLocked: true, updatedAt: now, updatedBy: 'church-hq' }, { merge: true }));
  await b.commit();
}
console.log(todo.length + ' written.');
process.exit(0);
