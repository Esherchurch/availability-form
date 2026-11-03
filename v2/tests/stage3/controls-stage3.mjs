/* EVERY CONTROL ON THE KIDS CHURCH SUNDAY'S PAGES, N OF N (the going-live
 * test, Stage 3). Reads the list from the code (tools/control-inventory.mjs)
 * and what an events audit pressed or filled
 * (tests/out/controls-reached-events.json, from
 * `tests/audit-everything.mjs --emulators=events --every`), and writes
 * tests/out/controls-stage3.md:
 *   - N of N controls reached, for the Kids, Safeguarding and ChurchShow
 *     parts' pages;
 *   - for each kind of person, at each size, how many of the controls on
 *     the pages they opened they reached;
 *   - every control not reached, with where it is in the code. None is
 *     left out quietly.
 *
 *   node tests/stage3/controls-stage3.mjs          (from v2/; reads files only)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inventory, report } from '../../tools/control-inventory.mjs';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(V2, 'tests', 'out');
createRequire(import.meta.url)(path.join(V2, 'egbc-parts.js'));
const PARTS = ['kids', 'safeguarding', 'churchShow'];
/** The Stage 3 pages, as the inventory names them. @returns {Set<string>} */
export function stage3Pages() {
  const want = new Set();
  for (const p of globalThis.EGBCParts.PARTS.filter((x) => PARTS.includes(x.id))) p.pages.forEach((f) => want.add(f.toLowerCase()));
  return want;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = stage3Pages(), inv = inventory();
  const pages = Object.fromEntries(Object.entries(inv.pages).filter(([p]) => want.has(p.toLowerCase())));
  const reached = JSON.parse(fs.readFileSync(path.join(OUT, 'controls-reached-events.json'), 'utf8'))
    .filter((r) => want.has(String(r.page || '').split('?')[0].toLowerCase()));
  const r = report({ pages, shared: [] }, reached);
  /* Per person and size: the controls on the pages they used, and how many they reached. */
  const seen = {};
  for (const x of reached) {
    const k = x.role + '@' + x.size, pg = String(x.page).split('?')[0];
    (seen[k] = seen[k] || new Set()).add(Object.keys(pages).find((p) => p.toLowerCase() === pg.toLowerCase()) || pg);
  }
  const md = ['# The Kids Church Sunday’s pages: every control, from the code', '',
    '**' + r.reached + ' of ' + r.total + ' coded controls reached** on ' + Object.keys(pages).length + ' pages (' + PARTS.join(', ') + ').', '',
    '## Each kind of person, at each size', '', '| Person @ size | Pages used | Controls on them | Reached |', '|---|---|---|---|'];
  for (const k of Object.keys(seen).sort()) {
    const ps = [...seen[k]], rows = r.rows.filter((x) => ps.includes(x.page));
    md.push('| ' + k + ' | ' + ps.length + ' | ' + rows.length + ' | ' + rows.filter((x) => x.by.includes(k)).length + ' |');
  }
  md.push('', '## Not reached', '', '| Page | Control | Kind | Where in the code |', '|---|---|---|---|');
  for (const x of r.rows.filter((x) => !x.by.length)) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.kind + ' | ' + x.file + ':' + x.at + ' |');
  fs.writeFileSync(path.join(OUT, 'controls-stage3.md'), md.join('\n') + '\n');
  console.log(r.reached + ' of ' + r.total + ' controls reached. tests/out/controls-stage3.md');
}
