/* Loads the building-compliance files in node exactly as a page loads them:
   plain scripts that set EGBCCompliance, EGBCComplianceStore and
   EGBCComplianceTemplates. v2/package.json makes every .js a module in node,
   so each file is run in a sandbox rather than required. The server
   (Stage 3) loads the one engine the same way. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
function run(name, global, file) {
  const f = file || path.join(V2, name);
  const box = { self: {} };
  vm.runInNewContext(fs.readFileSync(f, 'utf8'), box, { filename: f });
  if (!box.self[global]) throw new Error(name + ' did not load.');
  return box.self[global];
}
export const loadEngine = (file) => run('egbc-compliance.js', 'EGBCCompliance', file);
export const loadStore = (file) => run('egbc-compliance-store.js', 'EGBCComplianceStore', file);
export const loadTemplates = (file) => run('egbc-compliance-templates.js', 'EGBCComplianceTemplates', file);
