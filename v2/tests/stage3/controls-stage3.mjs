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
 *   node tests/stage3/controls-stage3.mjs [--reached=a.json,b.json]   (from v2/; reads files only)
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
  /* --reached=a.json,b.json: several audit runs together (one per group of people) */
  const files = (process.argv.find((a) => a.startsWith('--reached=')) || '').slice(10).split(',').filter(Boolean);
  const reached = (files.length ? files : [path.join(OUT, 'controls-reached-events.json')])
    .flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
    .filter((r) => want.has(String(r.page || '').split('?')[0].toLowerCase()));
  const r = report({ pages, shared: [] }, reached);
  /* Per person and size: the controls on the pages they used, and how many they reached. */
  const seen = {};
  for (const x of reached) {
    const k = x.role + '@' + x.size, pg = String(x.page).split('?')[0];
    (seen[k] = seen[k] || new Set()).add(Object.keys(pages).find((p) => p.toLowerCase() === pg.toLowerCase()) || pg);
  }
  /* The audit presses what each screen and pop-up shows; the controls
     deeper in (a plan's editor, the desk mid check-in) are pressed by the
     journey tests. A journey counts for a control when its code names it:
     its id, its data-act or data-tab, the page it links to, or its words. */
  const JOURNEYS = fs.readdirSync(path.join(V2, 'screenshots', 'events')).filter((f) => /\.(test|check)\.mjs$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(V2, 'screenshots', 'events', f), 'utf8')]);
  const needle = (key) => {
    const [kind, ...rest] = key.split(':'), v = rest.join(':').replace(/\*$/, '');
    if (!v) return null;
    if (kind === 'id') return ['#' + v, "'" + v + "'", '"' + v + '"'];
    if (kind === 'act') return ['data-act="' + v, "data-act='" + v, '[data-act="' + v];
    if (kind === 'tab') return ['data-tab="' + v];
    if (kind === 'href') return [v];
    if (kind === 'field') return ['name="' + v, '#' + v];
    if (kind === 'text') return v.length >= 4 ? [v] : null;
    return null;
  };
  const journeyOf = (x) => {
    const n = needle(x.key);
    if (!n) return '';
    const hit = JOURNEYS.find(([, t]) => t.includes(x.page.replace(/\.html$/i, '')) && n.some((s) => t.includes(s)));
    return hit ? hit[0] : '';
  };
  r.rows.forEach((x) => { x.journey = x.by.length ? '' : journeyOf(x); });
  const byJourney = r.rows.filter((x) => x.journey).length, none = r.rows.filter((x) => !x.by.length && !x.journey);
  const md = ['# The Kids Church Sunday’s pages: every control, from the code', '',
    '**' + (r.reached + byJourney) + ' of ' + r.total + ' coded controls reached** on ' + Object.keys(pages).length + ' pages (' + PARTS.join(', ') + '): ' +
      r.reached + ' pressed by the audit as the people below, ' + byJourney + ' more by a journey test, ' + none.length + ' not reached (listed).', '',
    '## Each kind of person, at each size (the audit)', '', '| Person @ size | Pages used | Controls on them | Reached |', '|---|---|---|---|'];
  for (const k of Object.keys(seen).sort()) {
    const ps = [...seen[k]], rows = r.rows.filter((x) => ps.includes(x.page));
    md.push('| ' + k + ' | ' + ps.length + ' | ' + rows.length + ' | ' + rows.filter((x) => x.by.includes(k)).length + ' |');
  }
  md.push('', '## Reached by a journey test', '', '| Page | Control | Test |', '|---|---|---|');
  for (const x of r.rows.filter((x) => x.journey)) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.journey + ' |');
  md.push('', '## Not reached', '', '| Page | Control | Kind | Where in the code |', '|---|---|---|---|');
  for (const x of none) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.kind + ' | ' + x.file + ':' + x.at + ' |');
  fs.writeFileSync(path.join(OUT, 'controls-stage3.md'), md.join('\n') + '\n');
  console.log((r.reached + byJourney) + ' of ' + r.total + ' controls reached (' + r.reached + ' by the audit, ' + byJourney + ' by journeys); ' + none.length + ' not reached. tests/out/controls-stage3.md');
}
