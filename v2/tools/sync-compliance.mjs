/* The server runs THE SAME schedule engine as the pages (F-230: one schedule
   function). Only functions/ is deployed, so the two files are copied in,
   byte for byte:

     egbc-compliance.js        -> functions/compliance-engine.cjs
     egbc-compliance-store.js  -> functions/compliance-store.cjs

     node tools/sync-compliance.mjs          copy them
     node tools/sync-compliance.mjs --check  exit 1 if a copy differs

   compliance-stage3.test fails if a copy differs, so an engine change that
   was not copied cannot reach the server unnoticed. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAIRS = [['egbc-compliance.js', 'functions/compliance-engine.cjs'], ['egbc-compliance-store.js', 'functions/compliance-store.cjs']];
export function differs() {
  return PAIRS.filter(([a, b]) => !fs.existsSync(path.join(V2, b)) || !fs.readFileSync(path.join(V2, a)).equals(fs.readFileSync(path.join(V2, b)))).map(p => p[1]);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--check')) { const d = differs(); console.log(d.length ? 'DIFFERS: ' + d.join(', ') : 'in step'); process.exit(d.length ? 1 : 0); }
  for (const [a, b] of PAIRS) fs.copyFileSync(path.join(V2, a), path.join(V2, b));
  console.log('copied: ' + PAIRS.map(p => p[1]).join(', '));
}
