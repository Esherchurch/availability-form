/* "When the hub goes live", never "when the church switches over"
 * (the reviewing window, 22 Oct 2026: Val may never switch over; Church HQ
 * is for any church).
 *
 *   node tests/check-going-live.mjs      (from v2/; no emulator)
 *
 * Fails if "switch over" or "switches over" is in anything a person sees:
 * the pages, the scripts they load, and the functions' messages. Comments
 * are not read (nobody sees them), and nor is a pattern that RECOGNISES the
 * old words - a page testing a refusal's message, so a function deployed
 * before this change is still understood.
 */
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve('.');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 800) : ''))); };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(V2, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'tests', '.git', 'design-mocks', 'screenshots'].includes(e.name)) continue;
      walk(rel, out);
    } else if (/\.(html|js|cjs|mjs)$/i.test(e.name) && e.name !== 'public-mail-pages.cjs') out.push(rel);
  }
  return out;
}
/* What a person could see: the file without its comments. Line comments are
   taken only where a line starts with one, so a "//" inside a URL stays. */
function seen(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
}
const WORDS = /switch(es)?\s+over/i;
const found = [];
for (const f of walk('.')) {
  seen(fs.readFileSync(path.join(V2, f), 'utf8')).split('\n').forEach((line, i) => {
    if (!WORDS.test(line)) return;
    /* A pattern that recognises the old message, not words on a page. */
    if (/\/[^/\n]*switches over[^/\n]*\/i?\.test\(/.test(line)) return;
    found.push(f + ': ' + line.trim().slice(0, 140));
  });
}
console.log('Words a person sees');
ok('  never "switch over" / "switches over" - "when the hub goes live"', found.length === 0, found.join('\n          '));
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
