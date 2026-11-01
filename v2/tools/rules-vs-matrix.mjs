/* THE FOURTH WAY: do the rules let each person read what the pages the
 * "who sees what" table gives them read?
 *
 *   node tools/rules-vs-matrix.mjs     (from v2/; after tests/rules-first-stage.test.mjs
 *                                       and tools/access-matrix.mjs have written their answers)
 *
 * For every person and every first-stage page the table lets them open
 * (access-matrix.json's verdict ''), each collection that page names is
 * looked up in tests/out/rules-first-stage.json. A collection they can read
 * neither as someone else's record nor as their own is listed, to be looked
 * at: most rules look at the record itself, so a generic test record can be
 * refused where the real one is let through - the list is where to look,
 * not a verdict.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstStageCollections, collectionsIn } from './rules-coverage.mjs';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matrix = JSON.parse(fs.readFileSync(path.join(V2, 'access-matrix.json'), 'utf8'));
const probe = JSON.parse(fs.readFileSync(path.join(V2, 'tests', 'out', 'rules-first-stage.json'), 'utf8'));
const byColl = firstStageCollections();
/* The server's own records, and the ones a page only writes. */
const SERVER_ONLY = new Set(['hqSlugs', 'churches', 'downloadsLog', 'commsLog', 'sgDashboard', 'sgGate', 'capacity', 'raStatus']);

/* The records a page's OWN code names: the shared scripts it loads name
   many more, read only for the people they are for. */
const onDisk = Object.fromEntries(fs.readdirSync(V2).filter((f) => f.endsWith('.html')).map((f) => [f.toLowerCase(), f]));
const pagesOf = {};
for (const p of new Set(Object.values(byColl).flatMap((v) => [...v.pages]))) {
  if (onDisk[p]) pagesOf[p] = collectionsIn(fs.readFileSync(path.join(V2, onDisk[p]), 'utf8'));
}

let pairs = 0, reads = 0;
const look = [];
for (const [who, r] of Object.entries(matrix.by)) {
  if (!probe.result[who]) continue;
  for (const [page, verdict] of Object.entries(r.verdict || {})) {
    const key = page.toLowerCase();
    if (verdict !== '' || !pagesOf[key]) continue;
    pairs++;
    for (const c of pagesOf[key]) {
      if (SERVER_ONLY.has(c)) continue;
      reads++;
      const a = probe.result[who][c];
      if (a && !a.readOther && !a.readOwn) look.push(who + ' / ' + page + ' / ' + c);
    }
  }
}
console.log('People x first-stage pages they may open: ' + pairs + '; the records those pages name: ' + reads);
console.log('Readable neither as another\'s nor their own (to look at): ' + look.length);
const byC = {};
look.forEach((l) => { const c = l.split(' / ')[2]; (byC[c] = byC[c] || new Set()).add(l.split(' / ')[0]); });
for (const [c, w] of Object.entries(byC).sort((a, b) => b[1].size - a[1].size)) console.log('  ' + c.padEnd(24) + [...w].join(', '));
