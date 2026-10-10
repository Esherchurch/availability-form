/* Does any events-window query need a database index that
   firestore.indexes.json does not have? (launch list item 2)

     node screenshots/events/index-check.mjs

   WHY A CHECK AND NOT A TEST: the emulator runs every query whether or not
   an index exists, so a missing index only shows after the switch-over, as
   "The query requires an index" on a live page. This reads the code
   instead, and applies Firestore's own rule:

     - Filters that are all "equals" (==, in, array-contains, -any) never
       need an index of their own: Firestore merges the automatic ones.
     - A query needs a COMPOSITE index when it sorts (orderBy) or uses a
       range (>=, <=, >, <, !=, not-in) on one field AND has any other
       filter or sort, or sorts on two fields.

   It finds every query in the events window's files (any file an "Events:"
   commit has touched, less two shared files it never owned), and fails if
   one needs an index the file lacks. It also fails if it meets a filter it
   could not read as part of a query, rather than guessing. Reads code
   only: no emulator, no database, nothing deployed. */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEXES = process.env.INDEXES || path.join(V2, 'firestore.indexes.json');
const NOT_MINE = /^(egbc-auth|egbc-db)\.js$/;

const files = process.env.FILES ? process.env.FILES.split(',') : [...new Set(
  execSync('git log --format=%H --grep="^Events:"', { cwd: V2, encoding: 'utf8' }).trim().split('\n')
    .flatMap(h => execSync('git show --name-only --format= ' + h, { cwd: V2, encoding: 'utf8' }).trim().split('\n'))
    .filter(f => /^v2\/[^/]+\.(js|html)$/.test(f)).map(f => f.slice(3)))]
  .filter(f => !NOT_MINE.test(f) && fs.existsSync(path.join(V2, f))).sort();

const EQ = ['==', 'in', 'array-contains', 'array-contains-any'];
const RANGE = ['>=', '<=', '>', '<', '!=', 'not-in'];
const arg = (s) => (s || '').trim().replace(/^['"]|['"]$/g, '');

/* Every query: from .collection(...) to the first .get( / .onSnapshot( /
   .doc( / ; at the same depth. */
function queriesIn(src) {
  const out = [], seen = new Set();
  const re = /\.(collection|collectionGroup)\(\s*([^)]*?)\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 0, end = src.length;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') { if (depth === 0) { end = i; break; } depth--; }
      else if (c === ';' && depth === 0) { end = i; break; }
      if (depth === 0 && /^\.(get|onSnapshot|add|doc|then)\(/.test(src.slice(i, i + 14))) { end = i; break; }
    }
    const chain = src.slice(re.lastIndex, end), base = re.lastIndex;
    const q = { coll: arg(m[2]), at: src.slice(0, m.index).split('\n').length, where: [], order: [] };
    const cr = /\.(where|orderBy)\(\s*([^,)]+)(?:,\s*([^,)]+))?/g;
    let c;
    while ((c = cr.exec(chain))) {
      seen.add(base + c.index);
      if (c[1] === 'where') q.where.push([arg(c[2]), arg(c[3])]);
      else q.order.push([arg(c[2]), /desc/i.test(c[3] || '') ? 'DESCENDING' : 'ASCENDING']);
    }
    out.push(q);
  }
  /* Filters that were not inside any query this could read. */
  const loose = [];
  const all = /\.(where|orderBy)\(\s*([^,)]+)(?:,\s*([^,)]+))?/g;
  while ((m = all.exec(src))) {
    if (seen.has(m.index)) continue;
    /* A query kept in a variable (var fams = db().collection(...);
       fams.where(...).get()) is fine when it is one "equals" and nothing
       else before it is run: that never needs an index. */
    const rest = src.slice(all.lastIndex, all.lastIndex + 300).split(/\.get\(|\.onSnapshot\(|;/)[0];
    if (m[1] === 'where' && EQ.includes(arg(m[3])) && !/\.(where|orderBy)\(/.test(rest)) continue;
    loose.push({ at: src.slice(0, m.index).split('\n').length, what: m[0] });
  }
  return { out, loose };
}

/* What composite index a query needs, or null. */
function needs(q) {
  const eq = q.where.filter(w => EQ.includes(w[1]));
  const rng = q.where.filter(w => RANGE.includes(w[1]));
  const unknown = q.where.filter(w => !EQ.includes(w[1]) && !RANGE.includes(w[1]));
  if (unknown.length) return { unknown };
  const sortFields = [...new Set([...rng.map(w => w[0]), ...q.order.map(o => o[0])])];
  if (!sortFields.length) return null;                         /* equals only */
  const eqFields = [...new Set(eq.map(w => w[0]))].filter(f => !sortFields.includes(f));
  if (sortFields.length === 1 && !eqFields.length) return null; /* one field: automatic */
  return {
    eq: eq.filter(w => !sortFields.includes(w[0])).map(w => ({ field: w[0], array: /array-contains/.test(w[1]) })),
    sort: sortFields.map(f => ({ field: f, order: (q.order.find(o => o[0] === f) || [f, 'ASCENDING'])[1] }))
  };
}

/* Does one of the declared indexes serve it? The equality fields in any
   order first, then the sort fields in order, each with the right kind. */
function served(coll, need, indexes) {
  return indexes.some(ix => {
    if (ix.collectionGroup !== coll || ix.fields.length !== need.eq.length + need.sort.length) return false;
    const head = ix.fields.slice(0, need.eq.length), tail = ix.fields.slice(need.eq.length);
    const headOk = need.eq.every(e => head.some(f => f.fieldPath === e.field && (e.array ? f.arrayConfig === 'CONTAINS' : !!f.order)));
    const tailOk = need.sort.every((s, k) => tail[k].fieldPath === s.field && tail[k].order === s.order);
    return headOk && tailOk;
  });
}

const indexes = JSON.parse(fs.readFileSync(INDEXES, 'utf8')).indexes || [];
const problems = [], used = [];
let count = 0;
for (const f of files) {
  const { out, loose } = queriesIn(fs.readFileSync(path.join(V2, f), 'utf8'));
  count += out.length;
  loose.forEach(l => problems.push(`${f}:${l.at}  a filter outside any query this could read: ${l.what}`));
  for (const q of out) {
    const n = needs(q);
    if (!n) continue;
    if (n.unknown) { problems.push(`${f}:${q.at}  ${q.coll}: an operator this does not know: ${JSON.stringify(n.unknown)}`); continue; }
    const words = [...n.eq.map(e => e.field + (e.array ? ' (contains)' : '')), ...n.sort.map(s => s.field + ' ' + s.order.toLowerCase())].join(', ');
    if (/^[a-zA-Z]+$/.test(q.coll) === false) { problems.push(`${f}:${q.at}  needs an index on a collection named by a variable (${q.coll}): ${words}`); continue; }
    if (served(q.coll, n, indexes)) used.push(`${f}:${q.at}  ${q.coll}: ${words}  - in the file`);
    else problems.push(`${f}:${q.at}  ${q.coll} NEEDS AN INDEX that is not in the file: ${words}`);
  }
}

console.log(`${files.length} files, ${count} queries read.`);
used.forEach(u => console.log('  ok    ' + u));
problems.forEach(p => console.log('  FAIL  ' + p));
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nEvery query that needs an index has one in firestore.indexes.json.');
process.exit(problems.length ? 1 : 0);
