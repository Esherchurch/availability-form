/* Every check, one after another, with a table at the end.
 *
 *   node tests/run-all.mjs                 (from v2/, emulators running)
 *   node tests/run-all.mjs --only board    (just the ones whose name matches)
 *   node tests/run-all.mjs --list          (what it would run, and skip)
 *
 * WHY THIS EXISTS. Martin, 12 Oct 2026: "run the targeted checks for what
 * you changed, plus the full suite once per push". There were 53 check
 * files and no way to run them all, so "the full suite" meant fifty
 * commands and a lot of reading - which is the same as not having one.
 *
 * IT RUNS THEM ONE AT A TIME ON PURPOSE. They share one emulator and one
 * set of synthetic people; two at once would have them seeding over each
 * other, and the failure that caused would belong to the runner rather
 * than to the code. Slow and trustworthy beats quick and arguable.
 *
 * THE SKIPPED ONES ARE NAMED, NOT HIDDEN. A few need a different command
 * (their own emulator set, or the functions emulator), and a runner that
 * quietly left them out would report a clean sweep over a gap. They are
 * listed every time with the command to run them by hand.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.resolve('tests');
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 ? String(process.argv[i + 1] || '') : '';
})();
const listOnly = process.argv.includes('--list');

/* Checks that need a command of their own. Each says why and how, so
   nobody has to go and find out. */
const NEEDS_ITS_OWN_COMMAND = {
  'audit-everything.mjs':
    'the click-through audit, hours long: node tests/audit-everything.mjs (see HANDOVER-MAIN rule 15)',
  'check-sundays-f177.mjs':
    'needs the spare emulator: firebase emulators:exec --config firebase.spare.json --only firestore '
    + '--project egbc-worship-planner "node tests/check-sundays-f177.mjs"',
  'check-rota-whatson-live.mjs':
    'needs the spare emulator and functions: set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec '
    + '--config firebase.spare.json --only firestore,auth,functions --project egbc-worship-planner '
    + '"node tests/check-rota-whatson-live.mjs"',
  'check-rota-feed.mjs':
    'needs the functions emulator: set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec '
    + '--config firebase.spare.json --only firestore,auth,functions --project egbc-worship-planner '
    + '"node tests/check-rota-feed.mjs"',
  'check-app-calendar.mjs':
    'needs the functions emulator: firebase emulators:exec --only firestore,auth,functions '
    + '--project egbc-worship-planner "node tests/check-app-calendar.mjs"',
  /* Reads the SPARE emulator on 8171, not the dev one on 8181, and needs
     functions with it. Run here it fails with ECONNREFUSED, which reads
     like a broken check rather than one pointed somewhere else. */
  /* Also the spare set: it signs in against auth on 9089, not 9099. */
  'check-availability-form.mjs':
    'needs the spare emulator: firebase emulators:exec --config firebase.spare.json '
    + '--only firestore,auth --project egbc-worship-planner '
    + '"node tests/check-availability-form.mjs"',
  'check-reminders.mjs':
    'needs the spare emulator and functions: set FUNCTIONS_EMULATOR_PORT=5191 && '
    + 'firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions '
    + '--project egbc-worship-planner "node tests/check-reminders.mjs"',
  /* Phone notifications, sent by the real functions: callables, timers
     and Firestore triggers, so it needs the functions emulator with them. */
  'check-notify-send.mjs':
    'needs the spare emulator and functions: set FUNCTIONS_EMULATOR_PORT=5191 && '
    + 'firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions '
    + '--project egbc-worship-planner "node tests/check-notify-send.mjs"',
  /* The hourly feed read (feedSync): its own Firestore, so a run never
     leaves sermons or videos in the dev emulator's data. */
  'check-feeds.mjs':
    'needs the spare emulator: firebase emulators:exec --config firebase.spare.json --only firestore '
    + '--project egbc-worship-planner "node tests/check-feeds.mjs"',
};

/* Not checks: helpers and screenshot scripts that live in the same
   folder. Named here so the count is honest. */
const NOT_A_CHECK = new Set([
  'run-all.mjs', 'browser-eval.mjs', 'console-watch.mjs', 'group1-screens.mjs',
  'test-account.mjs', 'smoke-all-pages.mjs', 'compare-with-original.mjs',
  'shots-app-vs-mockup.mjs', 'shots-restyle.mjs',
]);

const files = fs.readdirSync(HERE)
  .filter(f => f.endsWith('.mjs') && !NOT_A_CHECK.has(f))
  .filter(f => !only || f.includes(only))
  .sort();

const skipped = files.filter(f => NEEDS_ITS_OWN_COMMAND[f]);
const toRun = files.filter(f => !NEEDS_ITS_OWN_COMMAND[f]);

if (listOnly) {
  console.log('would run ' + toRun.length + ':');
  toRun.forEach(f => console.log('  ' + f));
  console.log('\nwould skip ' + skipped.length + ' (their own command):');
  skipped.forEach(f => console.log('  ' + f + '\n      ' + NEEDS_ITS_OWN_COMMAND[f]));
  process.exit(0);
}

console.log('running ' + toRun.length + ' checks, one at a time\n');
const rows = [];
const began = Date.now();

for (const f of toRun) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join('tests', f)], {
    encoding: 'utf8', timeout: 25 * 60 * 1000,   /* check-menu now takes about 15 minutes */
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  /* The tally each check prints, so the table says 60/60 and not just
     "passed" - a check that silently asserted nothing would otherwise
     look identical to one that asserted sixty things. */
  const m = out.match(/(\d+)\/(\d+) passed/g);
  const tally = m ? m[m.length - 1] : '(no tally printed)';
  /* A PAGE-SIDE THROW ONLY COUNTS IF IT TURNED THE RUN RED.
     browser-eval.mjs forces a non-zero exit whenever an expression threw
     inside the page and nothing expected it, so exit 0 with that banner
     in the output means the throw was deliberate - check-harness.mjs
     prints exactly that, from the child processes it uses to prove the
     banner works. Flagging it there said "something threw" about a check
     whose whole job is making something throw. */
  const threw = r.status !== 0 && /threw inside the page/.test(out);
  const secs = Math.round((Date.now() - t0) / 1000);
  rows.push({ f, code: r.status, tally, threw, secs });
  console.log((r.status === 0 ? 'ok   ' : 'FAIL ')
    + f.padEnd(36) + String(tally).padStart(12) + '  ' + secs + 's'
    + (threw ? '  (something threw inside the page)' : ''));
  if (r.status !== 0) {
    const fails = out.split(/\r?\n/).filter(l => /^\s*FAIL/.test(l)).slice(0, 6);
    fails.forEach(l => console.log('       ' + l.trim()));
  }
}

const bad = rows.filter(r => r.code !== 0);
console.log('\n' + (rows.length - bad.length) + '/' + rows.length + ' checks green, '
  + Math.round((Date.now() - began) / 60000) + ' minutes');
if (bad.length) {
  console.log('\nred:');
  bad.forEach(r => console.log('  ' + r.f + '  ' + r.tally));
}
if (skipped.length) {
  console.log('\nNOT RUN here, each needs its own command:');
  skipped.forEach(f => console.log('  ' + f + '\n      ' + NEEDS_ITS_OWN_COMMAND[f]));
}
/* The rules tests are not in this folder and run inside their own
   emulator, so they are named rather than counted. */
console.log('\nAlso run, separately:'
  + '\n  EGBC_FIREBASE_CONFIG=firebase.spare.json npx firebase emulators:exec'
  + ' --config firebase.spare.json --only firestore "node firestore-rules.test.mjs"');

process.exit(bad.length ? 1 : 0);
