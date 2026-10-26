/* CHANGE A CHURCH'S SHORT NAME (its slug), and so its hub's address
 * (functions/hub-address.js: https://<slug>.churchhq.co.uk/). Church HQ
 * staff only: it changes every link the church has already sent, so no
 * page can do it.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/hq-set-slug.mjs <churchId> <new-slug>           DRY RUN: says what would
 *                                                                 change, writes nothing
 *   node ../tools/hq-set-slug.mjs <churchId> <new-slug> --apply   makes the change, in one
 *                                                                 transaction
 *
 * Options: --project <id> (default egbc-worship-planner). On the emulator,
 * set FIRESTORE_EMULATOR_HOST first.
 *
 * What it does: hqSlugs/<new> = { churchId } (refused if another church has
 * it), hqChurches/<churchId>.slug = <new>, and the old slug is kept as
 * { churchId, retired: true }, so no other church can take it and its old
 * links can be sent on later. Running it twice changes nothing the second time.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { slugProblem, addressFor } = await import(path.join(HERE, '..', 'functions', 'hub-address.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const { validChurchId } = await import(path.join(HERE, '..', 'functions', 'hq-directory.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const at = args.indexOf('--project');
const PROJECT = at >= 0 ? args[at + 1] : (process.env.GCLOUD_PROJECT || 'egbc-worship-planner');
const [cid, slug] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--project');

if (!validChurchId(cid)) { console.error('Not a church id: ' + cid); process.exit(2); }
const problem = slugProblem(slug);
if (problem) { console.error('"' + slug + '": ' + problem); process.exit(2); }
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();

const church = await db.collection('hqChurches').doc(cid).get();
if (!church.exists) { console.error('No church ' + cid + ' in the directory.'); process.exit(2); }
const old = String(church.data().slug || cid);
const held = await db.collection('hqSlugs').doc(slug).get();
if (held.exists && held.data().churchId !== cid) { console.error('"' + slug + '" belongs to ' + held.data().churchId + '.'); process.exit(3); }
if (old === slug && held.exists && !held.data().retired) { console.log(cid + ' is already ' + slug + ' (' + addressFor(slug) + '). Nothing to do.'); process.exit(0); }

console.log((APPLY ? 'CHANGING' : 'DRY RUN, nothing written') + ' (' + PROJECT + ')');
console.log('  ' + cid + ': ' + old + ' -> ' + slug);
console.log('  address: ' + addressFor(old) + ' -> ' + addressFor(slug));
console.log('  ' + old + ' is kept for ' + cid + ', retired, so no other church can take it.');
if (!APPLY) { console.log('Add --apply to make the change.'); process.exit(0); }

await db.runTransaction(async (tx) => {
  const again = await tx.get(db.collection('hqSlugs').doc(slug));
  if (again.exists && again.data().churchId !== cid) throw new Error('"' + slug + '" was taken meanwhile by ' + again.data().churchId);
  const now = new Date().toISOString();
  tx.set(db.collection('hqSlugs').doc(slug), { churchId: cid, at: now });
  if (old !== slug) tx.set(db.collection('hqSlugs').doc(old), { churchId: cid, retired: true, at: now });
  tx.set(db.collection('hqChurches').doc(cid), { slug, slugChangedAt: now }, { merge: true });
});
console.log('Done. ' + cid + ' is now ' + addressFor(slug));
