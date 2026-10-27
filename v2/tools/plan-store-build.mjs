/* functions/plan-store.cjs, copied from egbc-plan-store.js (H-11 item 2),
 * so churchShowServicesToday finds each service's plan exactly as the
 * planners do. Functions deploy from functions/ alone, so they cannot load
 * the page's file.
 *
 *   node tools/plan-store-build.mjs        (from v2/)
 *   node tools/plan-store-build.mjs --check (fails while the copy is stale)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = '// COPIED from egbc-plan-store.js by tools/plan-store-build.mjs - do not edit; change egbc-plan-store.js and rebuild.\n';
const want = HEAD + fs.readFileSync(path.join(V2, 'egbc-plan-store.js'), 'utf8');
const out = path.join(V2, 'functions/plan-store.cjs');
if (process.argv.includes('--check')) {
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === want;
  console.log(same ? 'functions/plan-store.cjs is up to date' : 'functions/plan-store.cjs is OUT OF DATE: run node tools/plan-store-build.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(out, want);
console.log('wrote functions/plan-store.cjs');
