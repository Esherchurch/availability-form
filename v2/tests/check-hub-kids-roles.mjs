/* The worship hub's team rota leaves out Kids Church roles (Martin,
 * 23 Oct 2026; the same filter as c5f664ba). Kids Church slots share the
 * Sunday rota event, and both the original site's worshiphubapp.html and
 * v2's read the same database.
 *
 *   node tests/check-hub-kids-roles.mjs          (from v2/; no emulator)
 *   BREAK=1 node tests/check-hub-kids-roles.mjs  the grid without the filter: must fail
 *
 * Reads both files as they are, takes the page's own filter and the line
 * that builds the grid's roles, and runs them on a made-up Sunday.
 */
import fs from 'node:fs';
import path from 'node:path';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
const ev = { roles: ['Worship Leader', 'Keyboard', 'Sound', 'Words', 'Session Leader', 'Leader (Younger)', 'Assistant (Creche)', 'Helper 1', 'Helper 12'] };

for (const file of ['worshiphubapp.html', path.join('..', 'worshiphubapp.html')]) {
  let s = fs.readFileSync(file, 'utf8');
  if (process.env.BREAK) s = s.replace('const roles = (ev.roles || []).filter(isWorshipRole);', 'const roles = ev.roles || [];');
  const consts = (s.match(/const KIDS_CHURCH_ROLES = \[[\s\S]*?\];\s*const isWorshipRole = [^\n]*/) || [''])[0];
  const line = (s.match(/const roles = \(?ev\.roles \|\| \[\]\)?[^;]*;/) || [''])[0];
  const which = file.startsWith('..') ? 'the original site\'s' : 'v2\'s';
  ok(which + ' worshiphubapp.html has the filter and uses it for the grid', !!consts && !!line, { consts: !!consts, line });
  let roles = [];
  try { roles = new Function('ev', consts + '\n' + line + '\nreturn roles;')(ev); } catch (e) { roles = ['threw: ' + e.message]; }
  ok('  the grid shows the worship and AV roles', ['Worship Leader', 'Keyboard', 'Sound', 'Words'].every((r) => roles.includes(r)), roles);
  ok('  and no Kids Church role (session leader, leaders, assistants, helpers)', !roles.some((r) => /Session Leader|Leader \(|Assistant \(|^Helper \d+$/.test(r)), roles);
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
