/* SHOW, OR SET, WHAT A CHURCH CALLS THE MEETING WHERE ITS MEMBERS VOTE
 * (churchSettings/details.meetingWord; Comms, 28 Oct 2026). Your church
 * sets it on screen; this is for a church whose wording was in the code
 * before the setting existed, so it keeps its wording with no change seen.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/set-meeting-word.mjs                        the original site's: says
 *                                                             what is set, writes nothing
 *   node ../tools/set-meeting-word.mjs [<churchId>] --word "Members’ meeting" --apply
 *                                                             sets it; every other detail
 *                                                             is left exactly as it is
 *
 * Options: --project <id> (default egbc-worship-planner). On the emulator,
 * set FIRESTORE_EMULATOR_HOST first. Running it twice changes nothing more.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const WORD = opt('--word');
const cid = args.find((a, i) => !a.startsWith('--') && !['--project', '--word'].includes(args[i - 1])) || '';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const root = getFirestore();
const ref = (cid ? root.collection('churches').doc(cid) : root).collection('churchSettings').doc('details');
const d = (await ref.get()).data() || {};
console.log((cid ? 'Church ' + cid : 'The original site') + ', project ' + PROJECT + ': meetingWord ' +
  (d.meetingWord ? JSON.stringify(d.meetingWord) : '- NOT SET (pages say "Church meeting")'));

if (WORD !== undefined) {
  /* The same limits as the rules and Your church. */
  const w = String(WORD).trim();
  if (!w || w.length > 60 || /[<>"&]/.test(w)) { console.error('Up to 60 characters, without < > " or &.'); process.exit(2); }
  if (d.meetingWord === w) console.log('It is already ' + JSON.stringify(w) + '. Nothing to do.');
  else if (!APPLY) console.log('DRY RUN: would set meetingWord to ' + JSON.stringify(w) + '. Add --apply to do it.');
  else {
    await ref.set({ meetingWord: w, updatedAt: new Date().toISOString(), updatedBy: 'set-meeting-word' }, { merge: true });
    console.log('Set meetingWord to ' + JSON.stringify(w) + '.');
  }
}
