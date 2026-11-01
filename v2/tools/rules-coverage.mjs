/* WHICH RECORDS THE FIRST-STAGE PARTS USE, AND WHAT THE RULES TESTS COVER.
 *
 *   node tools/rules-coverage.mjs [--json]      (from v2/; reads files only)
 *
 * For each part in egbc-parts.js that goes live first, its pages and the
 * shared scripts they load are read for the collections they name
 * (collection('x'), doc('x/...')). Each collection is then looked up in:
 *   - firestore.rules: is there a match block for it (else nobody reaches it);
 *   - the rules tests (*.test.mjs here and in tests/): is it read, written
 *     and deleted in at least one assertion.
 * The list is printed with counts, and what is not covered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => { try { return fs.readFileSync(path.join(V2, f), 'utf8'); } catch (e) { return ''; } };
createRequire(import.meta.url)(path.join(V2, 'egbc-parts.js'));
const P = globalThis.EGBCParts;

/** The first-stage parts (test-first-stage.md); Communications for notices and email only. */
export const FIRST = ['rota', 'worship', 'kids', 'safeguarding', 'churchShow', 'comms'];
const COMMS_FIRST = ['comms.html', 'emailbuilder2.html', 'emailcompilerinstructions.html'];

/* Every page file on disk, by its lower-case name. */
const pagesOnDisk = Object.fromEntries(fs.readdirSync(V2).filter((f) => f.endsWith('.html')).map((f) => [f.toLowerCase(), f]));

/** The collections a file names. @param {string} text @returns {string[]} */
export function collectionsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/collection\(\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]\s*\)/g)) out.add(m[1]);
  for (const m of text.matchAll(/\bdoc\(\s*(?:db\s*,\s*)?['"]([A-Za-z][A-Za-z0-9_]*)\/[^'"]+['"]/g)) out.add(m[1]);
  for (const m of text.matchAll(/collection\(\s*db\s*,\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g)) out.add(m[1]);
  for (const m of text.matchAll(/\bdoc\(\s*db\s*,\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g)) out.add(m[1]);
  return [...out];
}

/* A page and the shared scripts it loads (egbc-*.js beside it). */
function pageFiles(page) {
  const f = pagesOnDisk[page];
  if (!f) return [];
  const text = read(f), files = [f];
  for (const m of text.matchAll(/<script[^>]+src="(egbc-[a-z0-9-]+\.js)[^"]*"/g)) files.push(m[1]);
  return files;
}

/** The first-stage parts' collections, each with the pages that name it. */
export function firstStageCollections() {
  const byColl = {};
  for (const id of FIRST) {
    const part = P.PARTS.find((p) => p.id === id);
    const pages = id === 'comms' ? COMMS_FIRST : part.pages;
    for (const page of pages) {
      for (const f of pageFiles(page)) {
        for (const c of collectionsIn(read(f))) {
          (byColl[c] = byColl[c] || { parts: new Set(), pages: new Set() }).parts.add(id);
          byColl[c].pages.add(page);
        }
      }
    }
  }
  return byColl;
}

/* The rules: does firestore.rules match this collection at the top level? */
const rules = read('firestore.rules');
const ruled = (c) => new RegExp('match\\s+/' + c + '/\\{').test(rules);

/* The tests: in which ways does any rules test use the collection? */
const testText = ['firestore-rules.test.mjs', 'church-rules.test.mjs', 'church-scope-rules.test.mjs']
  .concat(fs.readdirSync(path.join(V2, 'tests')).filter((f) => /rules|first-stage/.test(f)).map((f) => 'tests/' + f))
  .map(read).join('\n');
function testedWays(c) {
  const ways = new Set();
  const near = new RegExp("['\"`]" + c + "(/[^'\"`]*)?['\"`]", 'g');
  for (const m of testText.matchAll(near)) {
    const around = testText.slice(Math.max(0, m.index - 160), m.index + 220);
    if (/\.get\(|getDoc|\.where\(|getDocs|onSnapshot/.test(around)) ways.add('read');
    if (/\.set\(|\.update\(|\.add\(|setDoc|updateDoc|addDoc/.test(around)) ways.add('write');
    if (/\.delete\(|deleteDoc/.test(around)) ways.add('delete');
  }
  return ways;
}

/* Only when run, never when imported. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const byColl = firstStageCollections();
const rows = Object.keys(byColl).sort().map((c) => ({
  collection: c, parts: [...byColl[c].parts], pages: [...byColl[c].pages].length,
  ruled: ruled(c), tested: [...testedWays(c)]
}));
if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
const cells = rows.length * 3, covered = rows.reduce((n, r) => n + r.tested.length, 0);
console.log('First-stage collections: ' + rows.length + '; with a rule: ' + rows.filter((r) => r.ruled).length + ' of ' + rows.length);
console.log('Read / write / delete in a rules test: ' + covered + ' of ' + cells);
for (const r of rows) {
  const miss = ['read', 'write', 'delete'].filter((w) => !r.tested.includes(w));
  console.log((r.ruled ? '  ' : '! ') + r.collection.padEnd(26) + ' ' + r.parts.join(',').padEnd(28) + (miss.length ? 'not tested: ' + miss.join(', ') : 'all three tested'));
}
}
