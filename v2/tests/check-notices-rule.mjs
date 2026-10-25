/* Which notices are showing, and for whom: the one rule (egbc-notices.js,
 * 25 Oct 2026), used by the hub and offered to the app and Comms' e-news
 * weekly draft (C-51), so nobody copies it.
 *
 *   node tests/check-notices-rule.mjs          (from v2/; no emulator)
 *   BREAK=1 node tests/check-notices-rule.mjs  a rule that lets an expired notice
 *                                              through: must fail
 *
 * The answers are the same as the hub's own rule before it moved (written
 * out here, so the check cannot agree with itself), for every case.
 */
import fs from 'node:fs';
await import('../egbc-notices.js');
const N = Object.assign({}, globalThis.EGBCNotices);
if (process.env.BREAK) N.isCurrent = () => true;
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };

const TODAY = '2026-10-25';
/* The hub's rule before it moved (hub-app.js, until 25 Oct 2026). */
const oldExpired = (n) => !!(n && n.until && n.until < TODAY);
const oldForMe = (n, mine, master) => { if (!Array.isArray(n.teams) || !n.teams.length) return true; if (master) return true; return n.teams.some((t) => mine.includes(t)); };

const notices = [
  { id: 'a', title: 'No end date' },
  { id: 'b', title: 'Ends today', until: TODAY },
  { id: 'c', title: 'Ended yesterday', until: '2026-10-24' },
  { id: 'd', title: 'Ends next week', until: '2026-11-01' },
  { id: 'e', title: 'For a team', teams: ['Choir'] },
  { id: 'f', title: 'For no team listed', teams: [] }
];
for (const n of notices) ok('"' + n.title + '": showing as the hub decided', N.isCurrent(n, TODAY) === !oldExpired(n), { id: n.id });
for (const [mine, master] of [[['Choir'], false], [['Worship Team'], false], [[], true], [[], false]]) {
  for (const n of notices) if (N.isForTeams(n, mine, master) !== oldForMe(n, mine, master)) ok('"' + n.title + '" for ' + JSON.stringify(mine) + (master ? ' (master)' : '') + ': as the hub decided', false);
}
ok('who each notice is for: the hub\'s answers, every case', true);
const cur = N.current([{ id: 'old', createdAt: { seconds: 1 } }, { id: 'gone', until: '2026-01-01', createdAt: { seconds: 9 } }, { id: 'new', createdAt: { seconds: 5 } }], TODAY).map((n) => n.id);
ok('current(): the showing ones, newest first', cur.join() === 'new,old', cur);
const hub = fs.readFileSync('hub-app.js', 'utf8');
ok('the hub asks this rule, not a copy of its own', /EGBCNotices\.isCurrent/.test(hub) && /EGBCNotices\.isForTeams/.test(hub) && /egbc-notices\.js/.test(fs.readFileSync('hub.html', 'utf8')));
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
