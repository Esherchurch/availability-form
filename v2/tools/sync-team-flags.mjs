/* WHAT THE RULES READ ABOUT TEAMS, FILLED IN FOR EVERYONE. The rules name no
 * team: they read what the server keeps up to date as people and teams
 * change -
 *   users/<uid>.covers / adminCovers / shares / jobs   (functions/core-teams.js)
 *   teamFlags/under18                                  (functions/under18-teams.js)
 *   teamFlags/boards                                   (functions/team-boards.js)
 * A record nobody has touched since those triggers were deployed may not
 * have them yet. Run this before the rules go live, and once for any church
 * whose data came in by import.
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/sync-team-flags.mjs                  the original site: DRY RUN, says
 *                                                      what is missing, writes nothing
 *   node ../tools/sync-team-flags.mjs --church <id>    one church, the same way
 *   ... --apply                                        writes what is missing
 *
 * Options: --project <id> (default egbc-worship-planner). On the emulator,
 * set FIRESTORE_EMULATOR_HOST first. Running it twice writes nothing more.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const fn = (f) => import(pathToFileURL(path.join(HERE, '..', 'functions', f)).href);
const { coresMap, coversFor, sharesFor, jobsFor, syncCovers } = await fn('core-teams.js');
const { readTeamJobs } = await fn('team-jobs.js');
const { syncUnder18, under18Of } = await fn('under18-teams.js');
const { syncBoards, boardsOf } = await fn('team-boards.js');
const { scopedDb } = await fn('church-scope.js');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const cid = opt('--church') || '';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = scopedDb(getFirestore(), cid || null);
const same = (a, b) => Array.isArray(a) && JSON.stringify(a.slice().sort()) === JSON.stringify((b || []).slice().sort());

console.log((cid ? 'Church ' + cid : 'The original site') + ', project ' + PROJECT + (APPLY ? '' : ' (DRY RUN)') + ':');
const cores = await coresMap(db), tj = await readTeamJobs(db);
const users = (await db.collection('users').get()).docs;
let due = 0, written = 0;
for (const d of users) {
  const u = d.data() || {}, covers = coversFor(u.teams, cores);
  const ok = same(u.covers, covers) && same(u.adminCovers, coversFor(u.adminFor, cores))
    && same(u.shares, sharesFor(u.teams, tj)) && same(u.jobs, jobsFor(u.teams, covers, tj));
  if (ok) continue;
  due++;
  if (APPLY && (await syncCovers(db, d.id, cores, tj)).written) written++;
}
console.log('  people: ' + users.length + ', missing or out of date: ' + due + (APPLY ? ', written: ' + written : ''));

const teams = (await db.collection('teams').limit(500).get()).docs.map((d) => Object.assign({ id: d.id }, d.data()));
for (const [name, want, sync, field] of [['under18', under18Of(teams), syncUnder18, 'teams'], ['boards', boardsOf(teams), syncBoards, 'boards']]) {
  const was = (await db.collection('teamFlags').doc(name).get()).data();
  const right = was && JSON.stringify(was[field]) === JSON.stringify(want);
  console.log('  teamFlags/' + name + ': ' + (right ? 'up to date' : (APPLY ? (await sync(db)).written ? 'written' : 'up to date' : 'would write ' + JSON.stringify(want))));
}
if (!APPLY) console.log('Add --apply to write.');
