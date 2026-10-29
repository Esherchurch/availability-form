/* functions/parts.js, built from egbc-parts.js, so the pages and the server
 * agree on which parts a church uses from one list.
 *
 *   node tools/parts-build.mjs           (from v2/)
 *   node tools/parts-build.mjs --check   (fails while the copy is stale)
 *
 * Functions deploy from functions/ alone, so they cannot load the page's
 * file; this copies it in and adds what only the server needs: reading a
 * church's switches (usesPart).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'egbc-parts.js', BUILT = 'functions/parts.js';
const CALL = "})(typeof window !== 'undefined' ? window : globalThis);";
const text = fs.readFileSync(path.join(V2, SOURCE), 'utf8').replace(/\r\n/g, '\n');
if (text.split(CALL).length !== 2) throw new Error(SOURCE + ' no longer ends with its one call: the build needs looking at');
const want = '// GENERATED from ' + SOURCE + ' by tools/parts-build.mjs - do not edit; change ' + SOURCE + ' and rebuild.\n'
  + 'const G = {};\n'
  + text.replace(CALL, '})(G);') + '\n'
  + 'export const { PARTS, ALWAYS, PRESETS, on, partOf, partOfFeature, matching, presetSwitches } = G.EGBCParts;\n\n'
  + '/**\n'
  + ' * Whether a church uses a part: false once a master admin has switched it\n'
  + ' * off, so its emails, reminders and scheduled jobs stop. Nothing stored is on.\n'
  + ' * @param {object} db one church\'s database (churchOf / eachChurch), or EGBC\'s\n'
  + ' * @param {string} part a part id (PARTS)\n'
  + ' * @returns {Promise<boolean>}\n'
  + ' */\n'
  + 'export async function usesPart(db, part) {\n'
  + '  const s = await db.collection(\'churchSettings\').doc(\'features\').get().catch(() => null);\n'
  + '  return on(s && s.exists ? (s.data() || {}).parts : null, part);\n'
  + '}\n';
const out = path.join(V2, BUILT);
if (process.argv.includes('--check')) {
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') === want;
  console.log(same ? BUILT + ' is up to date' : BUILT + ' is OUT OF DATE: run node tools/parts-build.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(out, want);
console.log('wrote ' + BUILT);
