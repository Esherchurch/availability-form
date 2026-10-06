/* Is there any SharePoint left in v2?
 *
 * v2 does not use SharePoint. This lists every reference that would actually
 * do something at run time, so the decision can be checked rather than
 * remembered.
 *
 * What it deliberately ignores, because none of it is a working link:
 *   - comments, in /*...*\/ and // form, and HTML comments. egbc-shell.js and
 *     hub-app.js mention SharePoint only to explain history.
 *   - SharepointHeader.html, which exists to be embedded INSIDE SharePoint.
 *     Nothing in v2 opens it, and nothing is being deleted.
 *   - this file and the briefs.
 *
 * It cannot see the database. Entries whose contentURL still points at
 * SharePoint live in Firestore, and move when somebody uses "Replace video
 * file" on the page. Those are data, not code, and each page marks them.
 *
 *   node check-sharepoint.mjs          the references that are left
 *   node check-sharepoint.mjs --all    every match, including the ignored
 *
 * Exit code 0 when nothing functional is left, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ALL = process.argv.includes('--all');

const IGNORE_FILE = [
  /^SharepointHeader\.html$/i,   /* made to be embedded inside SharePoint */
  /^check-sharepoint\.mjs$/i,
  /-BRIEF\.md$/i, /^FINDINGS-/i, /^DESIGN\.md$/i, /^NEXT-BRIEF\.md$/i
];

const files = fs.readdirSync(DIR)
  .filter(f => /\.(html|js|mjs|json)$/i.test(f))
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

/* Blank out comments so a note about history does not read as a link. Strings
   are left alone - a URL in a string is exactly what we are looking for. */
function stripComments(src, isHtml) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  s = s.replace(/^[ \t]*\/\/.*$/gm, m => ' '.repeat(m.length));
  if (isHtml) s = s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  return s;
}

const hits = [];
const ignored = [];

for (const f of files) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  const isIgnored = IGNORE_FILE.some(r => r.test(f));
  const body = stripComments(raw, /\.html$/i.test(f));
  const lines = body.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/sharepoint\.com/i.test(line)) return;
    const row = { file: f, line: i + 1, text: line.trim().slice(0, 110) };
    if (isIgnored) ignored.push(row); else hits.push(row);
  });
}

if (hits.length || (ALL && ignored.length)) console.log('');
for (const h of hits) console.log('  LEFT     ' + h.file + ':' + h.line + '  ' + h.text);
if (ALL) for (const h of ignored) console.log('  ignored  ' + h.file + ':' + h.line + '  ' + h.text);

console.log('');
console.log('  functional sharepoint.com references in v2 : ' + hits.length);
console.log('  in files that are deliberately ignored     : ' + ignored.length + (ALL ? '' : '   (--all to list)'));
console.log('');
console.log('  Entries whose video still points at SharePoint are data, in');
console.log('  Firestore, not code. Each knowledge-base page marks them, and');
console.log('  "Replace video file" moves one across without duplicating it.');
console.log('');

if (hits.length) {
  console.log('  Not clean yet. Step V is done when the first number is zero.');
  process.exit(1);
}
console.log('  No working SharePoint link left in v2.');
process.exit(0);
