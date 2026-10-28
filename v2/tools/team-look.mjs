/* SHOW, OR SET, A TEAM'S OWN LOGO AND TITLE (teams/<team>.logoUrl, .title):
 * what its pages and apps show in place of the church's logo and the team's
 * name - the youth app's header, for one. The same as Teams & groups'
 * "Logo and title", for a church moving a logo it already has.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/team-look.mjs "<team>"                         says what is set; writes nothing
 *   node ../tools/team-look.mjs "<team>" --logo <https url> --title "<title>"
 *                                                                DRY RUN: says what would change
 *   ... --apply                                                  makes the change
 *   [--church <churchId>]                                        a church's team (none: the
 *                                                                original site's)
 *
 * Options: --project <id> (default egbc-worship-planner). On the emulator,
 * set FIRESTORE_EMULATOR_HOST first. Only the two fields change; running it
 * twice changes nothing more.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');

const args = process.argv.slice(2);
const OPTS = ['--project', '--logo', '--title', '--church'];
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const team = args.find((a, i) => !a.startsWith('--') && !OPTS.includes(args[i - 1]));
const cid = opt('--church') || '';
if (!team) { console.error('Which team? node ../tools/team-look.mjs "<team>"'); process.exit(2); }

if (!getApps().length) initializeApp({ projectId: PROJECT });
const root = getFirestore();
const ref = (cid ? root.collection('churches').doc(cid) : root).collection('teams').doc(team);
const snap = await ref.get();
const d = snap.data() || {};
console.log((cid ? 'Church ' + cid : 'The original site') + ', team ' + JSON.stringify(team) + (snap.exists ? '' : ' (not saved in Teams & groups yet)') + ':');
console.log('  logoUrl  ' + (d.logoUrl ? d.logoUrl : '- NOT SET (the church logo shows)'));
console.log('  title    ' + (d.title ? JSON.stringify(d.title) : '- NOT SET (the team name shows)'));

const want = {};
const logo = opt('--logo'), title = opt('--title');
if (logo !== undefined) {
  if (!/^https:\/\/\S{1,990}$/.test(logo)) { console.error('The logo must be an https address.'); process.exit(2); }
  if (logo !== d.logoUrl) want.logoUrl = logo;
}
if (title !== undefined) {
  const t = String(title).trim().slice(0, 60);
  if (t !== (d.title || '')) want.title = t;
}
if (!Object.keys(want).length) { if (logo !== undefined || title !== undefined) console.log('Already set. Nothing to do.'); process.exit(0); }
/* The rules want the name on every team record (it must equal the id). */
const write = Object.assign({ name: team, updatedAt: new Date(), updatedBy: 'tools/team-look.mjs' }, want);
if (!APPLY) { console.log('DRY RUN: would set ' + JSON.stringify(want) + '. Add --apply to do it.'); process.exit(0); }
await ref.set(write, { merge: true });
console.log('Set ' + JSON.stringify(want) + '.');
