/* READ ONLY: the two questions the nightly orphan check raised.
 *   1. Which team names do rota events (events.teams) carry that are not
 *      on the church's team list, and how many events carry each? Each is
 *      matched to a team by its label where it can be (an old row may have
 *      saved "Youth" for the team named "Youth Worship").
 *   2. The latest orphanSweeps report, link by link.
 * Writes nothing. From v2/functions, with Application Default Credentials:
 *   node ../tools/look-orphan-names.mjs [--church <id>] [--project <id>]
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const req = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
initializeApp({ projectId: opt('--project') || 'egbc-worship-planner' });
const root = getFirestore(), cid = opt('--church');
const db = cid ? root.collection('churches').doc(cid) : root;

const teams = (await db.collection('teams').get()).docs.map((d) => ({ id: d.id, label: (d.data() || {}).label || '' }));
const ids = new Set(teams.map((t) => t.id));
const events = (await db.collection('events').get()).docs;
const unknown = {};
let n = 0;
for (const d of events) {
  const miss = ((d.data() || {}).teams || []).filter((t) => !ids.has(t));
  if (miss.length) n++;
  miss.forEach((t) => { unknown[t] = (unknown[t] || 0) + 1; });
}
console.log('Teams on the list: ' + teams.map((t) => t.id + (t.label && t.label !== t.id ? ' ("' + t.label + '")' : '')).join(', '));
console.log('Events naming a team not on the list: ' + n + ' of ' + events.length);
for (const [name, count] of Object.entries(unknown).sort((a, b) => b[1] - a[1])) {
  const byLabel = teams.filter((t) => t.label === name);
  console.log('  "' + name + '": ' + count + ' events' + (byLabel.length === 1 ? ' - the label of "' + byLabel[0].id + '"' : ' - no team has this name or label'));
}
const s = (await db.collection('orphanSweeps').orderBy('at', 'desc').limit(1).get()).docs[0];
if (s) {
  const x = s.data();
  console.log('Latest orphan check ' + s.id + (x.dryRun ? ' (counted only)' : '') + ': ' + x.orphans + ' orphans, ' + x.fixed + ' fixed');
  (x.links || []).forEach((l) => console.log('  ' + l.link + ' [' + l.rule + '] checked ' + l.checked + ', orphans ' + l.orphans + ', fixed ' + (l.fixed || 0) + (l.held ? ', HELD' : '') + (l.error ? ', error ' + l.error : '')));
}
