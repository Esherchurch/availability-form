/* The page scripts the server's Monday e-news draft needs, copied into
 * functions/ unchanged (functions deploy from functions/ alone, so they
 * cannot load the page's files). The draft is then made by exactly the
 * same code on the server as in the page.
 *
 *   node tools/enews-draft-build.mjs          (from v2/) writes the copies
 *   node tools/enews-draft-build.mjs --check  fails while a copy is stale
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COPIES = [
  ['egbc-mailblocks.js', 'functions/mailblocks.cjs'],
  ['egbc-notices.js', 'functions/notices.cjs'],
  ['egbc-services.js', 'functions/services.cjs']
];
const want = (src) => '// COPIED from ' + src + ' by tools/enews-draft-build.mjs - do not edit; change ' + src + ' and rebuild.\n'
  + fs.readFileSync(path.join(V2, src), 'utf8');

let stale = 0;
for (const [src, out] of COPIES) {
  const p = path.join(V2, out), w = want(src);
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(p) && fs.readFileSync(p, 'utf8') === w;
    if (!same) stale++;
    console.log(out + (same ? ' is up to date' : ' is OUT OF DATE: run node tools/enews-draft-build.mjs'));
  } else {
    fs.writeFileSync(p, w);
    console.log('wrote ' + out);
  }
}
process.exit(stale ? 1 : 0);
