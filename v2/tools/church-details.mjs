/* SHOW, OR FILL IN, A CHURCH'S DETAILS (churchSettings/details): the name,
 * short name, logo and enquiry email that pages, emails and calendar feeds
 * now take instead of words written into the code. A church whose details
 * lack one shows nothing in its place, so check before going live.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/church-details.mjs                     the original site's details: says
 *                                                        which are set, writes nothing
 *   node ../tools/church-details.mjs <churchId>          a church's, the same way
 *   node ../tools/church-details.mjs [<churchId>] --short "St A's" --apply
 *                                                        adds the short name; the other
 *                                                        fields are left exactly as they are
 *
 * It also says where replies to the rota emails (worship job) and youth
 * codes (youth job) will go: the team's own Team mail address, else the
 * enquiry email. If the original site shows "enquiry email" there, set the
 * team's address in Team mail first, or replies will reach the office.
 *
 * Options: --project <id> (default egbc-worship-planner). On the emulator,
 * set FIRESTORE_EMULATOR_HOST first. Running it twice changes nothing more.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const SHORT = opt('--short');
const cid = args.find((a, i) => !a.startsWith('--') && !['--project', '--short'].includes(args[i - 1])) || '';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const root = getFirestore();
const ref = (cid ? root.collection('churches').doc(cid) : root).collection('churchSettings').doc('details');
const d = (await ref.get()).data() || {};

console.log((cid ? 'Church ' + cid : 'The original site') + ', project ' + PROJECT + ':');
for (const k of ['name', 'shortName', 'logoUrl', 'enquiryEmail']) console.log('  ' + k.padEnd(13) + (d[k] ? JSON.stringify(d[k]) : '- NOT SET'));
const { replyToFor } = await import(pathToFileURL(path.join(HERE, '..', 'functions', 'team-reply.js')).href);
const cdb = cid ? root.collection('churches').doc(cid) : root;
const scoped = cid ? { collection: (n) => cdb.collection(n), getAll: (...r) => root.getAll(...r) } : root;
for (const job of ['worship', 'youth']) {
  const r = await replyToFor(scoped, job);
  const where = r.from === 'team' ? ' - the ' + r.team + ' team\'s own' : ' - the enquiry email';
  console.log('  replies (' + job + ')'.padEnd(12) + (r.address ? r.address + where : '- NONE'));
}

if (SHORT !== undefined) {
  const short = String(SHORT).trim().slice(0, 40);
  if (!short) { console.error('A short name cannot be empty.'); process.exit(2); }
  if (d.shortName === short) console.log('The short name is already ' + JSON.stringify(short) + '. Nothing to do.');
  else if (!APPLY) console.log('DRY RUN: would set shortName to ' + JSON.stringify(short) + '. Add --apply to do it.');
  else { await ref.set({ shortName: short }, { merge: true }); console.log('Set shortName to ' + JSON.stringify(short) + '.'); }
}
