/* THE MEETINGS ALREADY THERE, SPLIT (FINDINGS-churchhq "The meetings
 * split"). For the reviewing window or Martin to run: it changes live
 * data, so a dry run first.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/split-meetings.mjs                   DRY RUN: lists each meeting
 *                                                      and what would move
 *   node ../tools/split-meetings.mjs --apply           moves them
 *   ... --church <id>                                  a church's meetings
 *                                                      (EGBC's top level without)
 *   ... --project <id>                                 default egbc-worship-planner
 *
 * For each meeting (functions/meeting-split.js says which events are
 * meetings): its title and notes, organiser and invitees go to
 * meetings/<id>, and come off events/<id>, which is marked meeting: true.
 * Each event's old private fields are printed first, as the record of
 * what was there. Running it again changes nothing.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const url = (f) => path.join(HERE, '..', 'functions', f).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:');
const { splitOne, serviceKinds, isMeeting } = await import(url('meeting-split.js'));
const { scopedDb } = await import(url('church-scope.js'));

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : ''; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const CHURCH = opt('--church');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = CHURCH ? scopedDb(getFirestore(), CHURCH) : getFirestore();

const services = await serviceKinds(db);
const snap = await db.collection('events').get();
console.log((APPLY ? 'SPLITTING' : 'DRY RUN, nothing written') + ' (' + PROJECT + (CHURCH ? ', church ' + CHURCH : ', EGBC') + ')');
let n = 0, done = 0;
for (const d of snap.docs) {
  const ev = d.data();
  if (!isMeeting(ev, services)) continue;
  const r = await splitOne(db, d.id, ev, services, APPLY);
  if (!r) continue;
  n++;
  console.log('  ' + d.id + '  ' + (ev.date || '?') + ' ' + (ev.type || '') + (r.moved.length ? '  moves: ' + r.moved.join(', ') : '') + (r.flagged ? '  (marked a meeting)' : ''));
  if (r.moved.length) console.log('      was: ' + JSON.stringify(Object.fromEntries(r.moved.map((k) => [k, ev[k]]))));
  if (APPLY) done++;
}
console.log(n ? (APPLY ? done + ' meetings split.' : n + ' meetings to split. Add --apply to do it.') : 'Nothing to split.');
process.exit(0);
