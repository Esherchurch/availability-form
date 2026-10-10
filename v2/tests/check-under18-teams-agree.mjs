/* The "Works with under-18s" tick is written down twice. Do the two agree?
 *
 *   node tests/check-under18-teams-agree.mjs       (from v2/, no emulator)
 *
 * WHY THERE ARE TWO COPIES. The tick lives in the teams data - TEAMS in
 * egbc-auth.js - because that is what the interface reads and what Martin
 * means by "the teams data". firestore.rules cannot read a JavaScript file,
 * and egbc-auth.js cannot read the rules, so the five names appear in both.
 *
 * TWO COPIES OF ONE TRUTH IS HOW A GATE STOPS COVERING A TEAM. Tick a new
 * team in egbc-auth.js alone and the interface says it is protected while
 * the rules let anybody on its rota - which is worse than no tick, because
 * it reads as safe. This check makes that impossible to ship quietly: it
 * reads both files and fails naming whichever team is missing from which.
 *
 * It needs no emulator and no browser, so it can run on every change.
 */
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve('.');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
  + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };

/* The five Martin named on 10 October 2026, written out here a THIRD time
   on purpose. If this check only compared the two files with each other it
   would pass just as happily when both lost a team. A list copied from the
   brief by hand is the only one of the three that cannot drift with the
   code. Creche is absent because it is not a team - the address book holds
   it as roles inside Kids Church, so ticking Kids Church covers it. */
const BRIEF = ['Kids Church', 'Youth Worship', 'Lazers', 'ReNu'];

const auth = fs.readFileSync(path.join(V2, 'egbc-auth.js'), 'utf8');
const rules = fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8');

/* From the teams data: every TEAMS entry carrying under18: true. */
const fromAuth = [];
{
  const start = auth.indexOf('var TEAMS = {');
  const end = auth.indexOf('};', start);
  if (start < 0 || end < 0) {
    ok('TEAMS is where it was in egbc-auth.js', false, 'could not find "var TEAMS = {"');
  } else {
    const block = auth.slice(start, end);
    /* split(/\r?\n/), NOT split('\n'). These files are CRLF, and a trailing
       \r defeats a pattern ending in (.*)$ outright: JavaScript's dot does
       not match a carriage return and $ without /m only matches the very
       end, so every single line failed and the check reported no ticked
       teams at all. It read exactly like the tick being missing. */
    for (const line of block.split(/\r?\n/)) {
      const m = /^\s*'([^']+)'\s*:\s*\{(.*)$/.exec(line);
      if (m && /under18\s*:\s*true/.test(m[2])) fromAuth.push(m[1]);
    }
  }
}

/* From the rules: the names inside under18Teams(). */
const fromRules = [];
{
  const m = /function\s+under18Teams\s*\(\s*\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(rules);
  if (!m) ok('under18Teams() is in firestore.rules', false, 'could not find the function');
  else for (const q of m[1].match(/'([^']+)'/g) || []) fromRules.push(q.slice(1, -1));
}

const sort = a => [...a].sort();
const show = a => a.length ? sort(a).join(', ') : '(none)';

console.log('\nthe "Works with under-18s" tick, in both places');
console.log('  the brief says        ' + show(BRIEF));
console.log('  egbc-auth.js says     ' + show(fromAuth));
console.log('  firestore.rules says  ' + show(fromRules));

const missingFromAuth = BRIEF.filter(t => !fromAuth.includes(t));
const missingFromRules = BRIEF.filter(t => !fromRules.includes(t));
const extraInAuth = fromAuth.filter(t => !BRIEF.includes(t));
const extraInRules = fromRules.filter(t => !BRIEF.includes(t));

console.log('');
ok('every team the brief names is ticked in the teams data',
  missingFromAuth.length === 0, 'not ticked in egbc-auth.js: ' + show(missingFromAuth));
ok('every team the brief names is enforced by the rules',
  missingFromRules.length === 0, 'missing from under18Teams(): ' + show(missingFromRules));
/* Extras are not a fault - Martin may tick another team later - but they
   must be in BOTH, or the interface and the rules disagree about it. */
ok('a team ticked in the teams data is enforced too',
  extraInAuth.every(t => fromRules.includes(t)),
  'ticked in egbc-auth.js but NOT in the rules, so it reads as protected and is not: '
  + show(extraInAuth.filter(t => !fromRules.includes(t))));
ok('a team the rules enforce is ticked too',
  extraInRules.every(t => fromAuth.includes(t)),
  'enforced by the rules but not ticked in the teams data, so the planner will not explain itself: '
  + show(extraInRules.filter(t => !fromAuth.includes(t))));

/* The clearance itself is the events window's (F-109), reused rather than
   written again. If that definition moved, the rota would silently stop
   agreeing with the under-18s groups about who is cleared. */
ok('the rota uses the events window\'s definition of "cleared", not its own',
  /function\s+rotaCleared\s*\([^)]*\)\s*\{[^}]*checksInDate\s*\(/.test(rules),
  'rotaCleared() no longer calls checksInDate() - there are now two definitions of cleared');

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
