/* functions/help-texts.json, built from help/<page>.md, so the "Ask" box's
 * function (functions/help-ask.js) answers from exactly the help the page
 * shows. Functions deploy from functions/ alone, so they cannot read help/.
 *
 *   node tools/help-build.mjs          (from v2/)
 *   node tools/help-build.mjs --check  (fails while the copy is stale)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(V2, 'help');
const pages = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
  pages[f.replace(/\.md$/, '').toLowerCase()] = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
}
const want = JSON.stringify({ note: 'BUILT from help/*.md by tools/help-build.mjs - do not edit; change the help and rebuild.', pages }, null, 1) + '\n';
const out = path.join(V2, 'functions/help-texts.json');
if (process.argv.includes('--check')) {
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === want;
  console.log(same ? 'functions/help-texts.json is up to date' : 'functions/help-texts.json is OUT OF DATE: run node tools/help-build.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(out, want);
console.log('wrote functions/help-texts.json (' + Object.keys(pages).length + ' pages)');
