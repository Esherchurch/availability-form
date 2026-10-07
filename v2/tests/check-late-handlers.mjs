/* Does any page attach a start-up handler that can never run?
 *
 *   node tests/check-late-handlers.mjs        (from v2/)
 *
 * THE BUG THIS EXISTS FOR. Step B put `await ready;` at the top of each
 * module so the page knows who is signed in before it reads anything. In
 * SundayServicePlanner.html and youthserviceplanner.html the line
 *
 *     window.onload = async () => { ... setupDefaultOrder() ... }
 *
 * came AFTER that await. A handler assigned after an await is attached late:
 * if the load event has already fired - which it has, whenever restoring the
 * sign-in takes a moment, as it does on a phone - the handler never runs and
 * everything inside it is silently lost. The Sunday planner opened with an
 * empty order of service, and the church noticed before any check did.
 *
 * It is a race, which is why it survived: on a fast local emulator `ready`
 * can resolve before the load event and the page looks fine.
 *
 * WHAT COUNTS AS A FAILURE. Inside an inline module (only a module can have
 * a top-level await), a registration of load / DOMContentLoaded / onload
 * that appears after the first top-level await.
 *
 * The right shape is to name the function and call it either way:
 *
 *     const startPage = async () => { ... };
 *     if (document.readyState === 'complete') startPage();
 *     else window.addEventListener('load', startPage);
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] || '.';
const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.html')).sort();

/* An await at the start of a line is a top-level await in practice: an await
   inside a function is indented in every file in this repo. Stated rather
   than hidden, because it is a heuristic and not a parser. */
const TOP_LEVEL_AWAIT = /^await\s/m;

const REGISTRATIONS = [
  { what: 'window.onload', re: /^[^\n]*\bwindow\.onload\s*=/m },
  { what: "addEventListener('load')", re: /addEventListener\(\s*['"]load['"]/ },
  { what: "addEventListener('DOMContentLoaded')", re: /addEventListener\(\s*['"]DOMContentLoaded['"]/ }
];

const problems = [];
let modulesChecked = 0;

for (const file of files) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');

  /* every inline module on the page */
  const re = /<script\b([^>]*\btype\s*=\s*["']module["'][^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const code = m[2];
    if (!code.trim()) continue;
    modulesChecked++;

    const awaitAt = code.search(TOP_LEVEL_AWAIT);
    if (awaitAt === -1) continue;

    for (const { what, re: rr } of REGISTRATIONS) {
      rr.lastIndex = 0;
      const hit = code.search(rr);
      if (hit <= awaitAt) continue;

      /* The safe shape registers for load AND runs the function straight
         away if the page has already loaded. A readyState check just before
         the registration is that shape, and is not a problem. */
      const guarded = /document\.readyState/.test(code.slice(Math.max(0, hit - 220), hit + 60));
      if (guarded) continue;

      const line = html.slice(0, m.index + hit).split('\n').length;
      problems.push({ file, what, line });
    }
  }
}

console.log('Pages checked: ' + files.length + '   inline modules: ' + modulesChecked);
if (!problems.length) {
  console.log('\nNo start-up handler is registered after a top-level await.');
  process.exit(0);
}
console.log('\nThese handlers are attached after a top-level await, so they will not');
console.log('run whenever the load event has already fired:\n');
for (const p of problems) console.log('  ' + p.file + ':' + p.line + '  ' + p.what);
console.log('\nName the handler and call it either way - see the comment at the top');
console.log('of this file.');
process.exit(1);
