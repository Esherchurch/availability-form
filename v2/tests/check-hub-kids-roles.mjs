/* The worship team's lists leave out Kids Church roles (Martin, 23 and
 * 25 Oct 2026; the same filter as c5f664ba). Kids Church slots share the
 * Sunday rota event, and both the original site and v2 read the same
 * database.
 *
 *   node tests/check-hub-kids-roles.mjs              (from v2/; no emulator)
 *   BREAK=<name> node tests/check-hub-kids-roles.mjs  one list without its filter: must fail
 *                                                    (names: hub, youthapp, youthplanner,
 *                                                     performance, coreteam)
 *
 * For each page, in v2 and on the original site: the page's own
 * isWorshipRole keeps the worship and AV roles and drops the Kids Church
 * ones, and the list Martin named is built through it.
 * KEPT on purpose, every team shown: Planner.html, view-only-rota.html,
 * and the Core Team app's availability note (Martin, 25 Oct 2026).
 */
import fs from 'node:fs';
import path from 'node:path';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
const ROLES = ['Worship Leader', 'Keyboard', 'Sound', 'Words', 'Session Leader', 'Leader (Younger)', 'Assistant (Creche)', 'Helper 1', 'Helper 12'];
const KIDS = /Session Leader|Leader \(|Assistant \(|^Helper \d+$/;

/* name, file, which copies, the line that must use the filter, and its unfiltered form (the break). */
const PAGES = [
  ['hub', 'worshiphubapp.html', ['v2', 'root'], 'const roles = (ev.roles || []).filter(isWorshipRole);', 'const roles = ev.roles || [];'],
  ['youthapp', 'youthapp2.html', ['v2', 'root'], 'let rows = sortAssignments(Object.entries(worshipOnly(data.assignments)));', 'let rows = sortAssignments(Object.entries(data.assignments || {}));'],
  ['youthplanner', 'youthserviceplanner.html', ['v2', 'root'], 'let assignmentsArray = Object.entries(worshipOnly(data.assignments));', 'let assignmentsArray = Object.entries(data.assignments || {});'],
  ['performance', 'Performancenotes.html', ['v2', 'root'], 'Object.keys(selectedEvent.assignments || {}).filter(isWorshipRole).forEach(', 'Object.keys(selectedEvent.assignments || {}).forEach('],
  ['coreteam', 'CoreTeamApp.html', ['root'], 'table.innerHTML = Object.entries(worshipOnly(assignments)).map(', 'table.innerHTML = Object.entries(assignments).map('],
  ['coreteam', 'CoreTeamApp.html', ['root'], 'Object.entries(worshipOnly(assignments)).forEach(([role, person]) => {\n      plan +=', 'Object.entries(assignments).forEach(([role, person]) => {\n      plan +='],
  /* v2's Core Team app already had both (its own filter, inline). */
  ['coreteam', 'CoreTeamApp.html', ['v2'], 'table.innerHTML = Object.entries(assignments).filter(([r]) => isWorshipRole(r)).map(', 'table.innerHTML = Object.entries(assignments).map('],
  ['coreteam', 'CoreTeamApp.html', ['v2'], 'Object.entries(assignments).filter(([r]) => isWorshipRole(r)).forEach(([role, person]) => {', 'Object.entries(assignments).forEach(([role, person]) => {']
];

for (const [name, file, copies, uses, without] of PAGES) {
  for (const copy of copies) {
    let s = fs.readFileSync(copy === 'v2' ? file : path.join('..', file), 'utf8').replace(/\r\n/g, '\n');
    if (process.env.BREAK === name) s = s.split(uses).join(without);
    const label = (copy === 'v2' ? 'v2/' : 'the original site\'s ') + file;
    ok(label + ': the list is built through the filter', s.includes(uses), uses);
    /* The page's own isWorshipRole, run on a made-up Sunday's roles. */
    let def = (s.match(/const KIDS_CHURCH_ROLES = \[[\s\S]*?\];\s*const isWorshipRole = [^\n]*/) || s.match(/const isWorshipRole = r => \{[\s\S]*?\n\};/) || s.match(/const isWorshipRole = [^\n]*/) || [''])[0];
    /* v2's Core Team app takes the shared planner's (egbc-core-planner.js). */
    if (/EGBCCorePlanner\.isWorshipRole/.test(def)) {
      const planner = fs.readFileSync('egbc-core-planner.js', 'utf8').replace(/\r\n/g, '\n');
      def = (planner.match(/ {2}var isWorshipRole = function \(r\) \{[\s\S]*?\n {2}\};/) || [''])[0].replace(/^ {2}var /, 'const ');
    }
    let kept = [];
    try { kept = ROLES.filter(new Function(def + '\nreturn isWorshipRole;')()); } catch (e) { kept = ['threw: ' + e.message]; }
    ok('  its filter keeps the worship and AV roles and drops the Kids Church ones',
      ['Worship Leader', 'Keyboard', 'Sound', 'Words'].every((r) => kept.includes(r)) && !kept.some((r) => KIDS.test(r)), kept);
  }
}
/* Kept as they are, on purpose. */
for (const file of ['Planner.html', 'view-only-rota.html']) {
  ok('the original site\'s ' + file + ' still shows every team (Martin: it is the rota for every team)', !/KIDS_CHURCH_ROLES|worshipOnly/.test(fs.readFileSync(path.join('..', file), 'utf8')));
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
