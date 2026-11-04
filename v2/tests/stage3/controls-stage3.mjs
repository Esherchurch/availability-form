/* EVERY CONTROL ON THE KIDS CHURCH SUNDAY'S PAGES, N OF N (the going-live
 * test, Stage 3). Reads the list from the code (tools/control-inventory.mjs)
 * and what events audits pressed, filled or saw
 * (`tests/audit-everything.mjs --emulators=events --every --press-all
 * --states=...`, its controls-reached-events.json and -skipped.json), and
 * writes tests/out/controls-stage3.md:
 *   - not on this page: a control in a script the page loads but never
 *     draws there, with the proof (tests/stage3/drawn-on.mjs);
 *   - every other control is done when each kind of person who saw it
 *     pressed (or filled) it at 375 and at 1440;
 *   - the table for each kind of person at each size;
 *   - the rest, listed with why: seen by some but not pressed by all at
 *     both sizes, seen but not pressable (a phone number, a file picker),
 *     or not seen by anyone. None is left out quietly.
 *
 *   node tests/stage3/controls-stage3.mjs [--reached=a.json,b.json]   (from v2/; reads files only)
 *   (each a.json beside its a-skipped.json, as the audit writes them)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inventory } from '../../tools/control-inventory.mjs';
import { drawnOn } from './drawn-on.mjs';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(V2, 'tests', 'out');
createRequire(import.meta.url)(path.join(V2, 'egbc-parts.js'));
const PARTS = ['kids', 'safeguarding', 'churchShow'];
export const SIZES = ['375', '1440'];
/** The Stage 3 pages, as the inventory names them. @returns {Set<string>} */
export function stage3Pages() {
  const want = new Set();
  for (const p of globalThis.EGBCParts.PARTS.filter((x) => PARTS.includes(x.id))) p.pages.forEach((f) => want.add(f.toLowerCase()));
  return want;
}

/* Which records a control's keys answer for: an exact key, or a key built in
   script (ending *) that a used key starts with. */
/* A key built in script: marked *, or cut off where the code adds to it
   (`id="v-child-' + i` reads as id:v-child-, a tab's name as tab:). */
const built = (key) => key.endsWith('*') || /[-_:]$/.test(key);
const matches = (key, used) => built(key) ? used.some((k) => k.startsWith(key.replace(/\*$/, ''))) : used.includes(key);
/* The code's words as the page shows them: `&times;` is ×, `\u25b6 Play` is ▶ Play. */
const shown = (key) => key.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
  .replace(/&times;/g, '\u00d7').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
/* A button whose words go on past markup (`Free Bibles<br>(on the hub)`) is read by the inventory up to the
   tag, and by the page whole: the page's words start with the inventory's. */
function usedBy(c, used) {
  const key = shown(c.key);
  if (matches(key, used)) return true;
  if (!key.startsWith('text:')) return false;
  const line = fs.readFileSync(path.join(V2, c.file), 'utf8').split('\n')[c.at - 1] || '';
  return line.includes(c.key.slice(5) + '<') && used.some((k) => k.startsWith(key));
}
/* A handler attached in script (`x.onclick = function () { name(...)`) is
   the control x, already counted by its own key: say which. */
function handlerOf(c) {
  if (!c.key.startsWith('fn:')) return '';
  const line = (fs.readFileSync(path.join(V2, c.file), 'utf8').split('\n')[c.at - 1] || '');
  const m = /([^\s;=(]+(?:\([^)]*\))?)\.onclick\s*=/.exec(line);
  return m && !/onclick=\\?["']/.test(line) ? m[1] : '';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = stage3Pages(), inv = inventory();
  const pages = Object.fromEntries(Object.entries(inv.pages).filter(([p]) => want.has(p.toLowerCase())));
  const files = (process.argv.find((a) => a.startsWith('--reached=')) || '').slice(10).split(',').filter(Boolean);
  const load = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []);
  const runs = files.length ? files : [path.join(OUT, 'controls-reached-events.json')];
  const page = (r) => String(r.page || '').split('?')[0].toLowerCase();
  const pressed = runs.flatMap(load).filter((r) => want.has(page(r)));
  const skipped = runs.flatMap((f) => load(f.replace(/\.json$/, '-skipped.json'))).filter((r) => want.has(page(r)));

  const rows = [], notHere = [], handlers = [];
  for (const [p, list] of Object.entries(pages)) for (const c of list) {
    const d = drawnOn(p, c);
    if (!d.drawn) { notHere.push(Object.assign({ page: p, reason: d.reason }, c)); continue; }
    const h = handlerOf(c);
    if (h) { handlers.push(Object.assign({ page: p, on: h }, c)); continue; }
    const mine = (r) => page(r) === p.toLowerCase() && usedBy(c, r.keys);
    const by = new Set(pressed.filter(mine).map((r) => r.role + '@' + r.size));
    const sk = skipped.filter(mine);
    const saw = new Set([...by, ...sk.map((r) => r.role + '@' + r.size)].map((k) => k.split('@')[0]));
    const missing = [];
    for (const role of saw) for (const sz of SIZES) if (!by.has(role + '@' + sz)) missing.push(role + '@' + sz);
    rows.push(Object.assign({ page: p, by, saw, missing, why: [...new Set(sk.map((r) => r.why))] }, c));
  }
  const done = rows.filter((x) => x.saw.size && !x.missing.length);
  const part = rows.filter((x) => x.saw.size && x.missing.length);
  const never = rows.filter((x) => !x.saw.size);
  const people = [...new Set([...pressed, ...skipped].map((r) => r.role))].sort();
  const md = ['# The Kids Church Sunday’s pages: every control, from the code', '',
    '**' + done.length + ' of ' + rows.length + ' controls done**: pressed by every kind of person who saw them, at 375 and at 1440, on ' +
      Object.keys(pages).length + ' pages (' + PARTS.join(', ') + '). ' + part.length + ' partly, ' + never.length + ' not seen by anyone (listed below). ' +
      notHere.length + ' more are in scripts these pages load but never draw there, and ' + handlers.length + ' are handlers of controls counted already (both listed, with the proof).', '',
    '## Each kind of person, at each size', '', '| Person | Size | Saw | Pressed |', '|---|---|---|---|'];
  for (const role of people) for (const sz of SIZES) {
    const k = role + '@' + sz, sawHere = rows.filter((x) => x.saw.has(role));
    md.push('| ' + role + ' | ' + sz + ' | ' + sawHere.length + ' | ' + sawHere.filter((x) => x.by.has(k)).length + ' |');
  }
  const who = (x) => [...x.saw].sort().join(', ');
  md.push('', '## Done, and who sees each (only some people can see a control when the page shows it to them alone)', '', '| Page | Control | Seen and pressed by |', '|---|---|---|');
  for (const x of done) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + who(x) + ' |');
  md.push('', '## Partly: seen, but not pressed by everyone at both sizes', '', '| Page | Control | Seen by | Not pressed | Why |', '|---|---|---|---|---|');
  for (const x of part) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + who(x) + ' | ' + x.missing.join(', ') + ' | ' + (x.why.join('; ') || 'not reached at that size') + ' |');
  md.push('', '## Not seen by anyone', '', '| Page | Control | Kind | Where in the code |', '|---|---|---|---|');
  for (const x of never) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.kind + ' | ' + x.file + ':' + x.at + ' |');
  md.push('', '## Handlers, not controls (attached in script to a control counted by its own key)', '', '| Page | Handler | Attached to |', '|---|---|---|');
  for (const x of handlers) md.push('| ' + x.page + ' | `' + x.key + '` | `' + x.on.replace(/\|/g, '/') + '` (' + x.file + ':' + x.at + ') |');
  md.push('', '## Not on this page (the page loads the script but never draws these)', '', '| Page | Control | Why |', '|---|---|---|');
  for (const x of notHere) md.push('| ' + x.page + ' | `' + x.key.replace(/\|/g, '/') + '` | ' + x.reason + ' |');
  fs.writeFileSync(path.join(OUT, 'controls-stage3.md'), md.join('\n') + '\n');
  console.log(done.length + ' of ' + rows.length + ' done; ' + part.length + ' partly; ' + never.length + ' not seen; ' + notHere.length + ' not on their page. tests/out/controls-stage3.md');
}
