/* Who may email whom (Martin, 16 Oct 2026): functions/compiler-send.js decide().
 *
 *   node tests/check-compiler-send.mjs      (from v2/, no emulator)
 *
 * The office and master admins email anyone; a team leader emails the people
 * on their teams and themselves; anybody else, nobody. The callable around
 * it (and the emailOutbox row) is checked in check-who-may.mjs.
 */
import { decide } from '../functions/compiler-send.js';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };
const book = [
  { email: 'kid.leader.helper@example.invalid', markers: ['Kids Church'] },
  { email: 'both@example.invalid', markers: ['Kids Church', 'Worship Team'] },
  { email: 'worship.only@example.invalid', markers: ['Worship Team'] }
];
const leader = { status: 'active', email: 'karen@example.invalid', teams: [], adminFor: ['Kids Church'] };
const office = { status: 'active', email: 'office@example.invalid', teams: ['Church office'], adminFor: [] };
const master = { status: 'active', email: 'm@example.invalid', teams: [], adminFor: [], masterAdmin: true };
const member = { status: 'active', email: 'sam@example.invalid', teams: ['Worship Team'], adminFor: [] };

console.log('A team leader');
ok('  emails people on their team', decide(leader, book, ['kid.leader.helper@example.invalid', 'both@example.invalid']).ok);
ok('  and themselves (the test email)', decide(leader, book, ['Karen@Example.invalid']).ok);
const r1 = decide(leader, book, ['kid.leader.helper@example.invalid', 'worship.only@example.invalid']);
ok('  not somebody on another team - and says who', !r1.ok && /worship\.only@/.test(r1.why), JSON.stringify(r1));
ok('  nor an address the church does not hold', !decide(leader, book, ['stranger@example.invalid']).ok);

console.log('\nThe church office and master admins');
ok('  the office emails anyone', decide(office, [], ['worship.only@example.invalid', 'stranger@example.invalid']).ok);
ok('  a master admin too', decide(master, [], ['stranger@example.invalid']).ok);

console.log('\nAnybody else');
const r2 = decide(member, book, ['worship.only@example.invalid']);
ok('  somebody on a team who leads none emails nobody', !r2.ok && /team leaders and the church office/.test(r2.why), JSON.stringify(r2));
ok('  not signed in to the church', !decide({ status: 'pending' }, book, ['both@example.invalid']).ok);
ok('  no account at all', !decide(null, book, ['both@example.invalid']).ok);

console.log('\nThe message');
ok('  nobody to send to is refused', !decide(office, [], []).ok);
ok('  not an email address is refused', !decide(office, [], ['not-an-address']).ok);
ok('  more than 50 at once is refused', !decide(office, [], Array.from({ length: 51 }, (_, i) => 'p' + i + '@example.invalid')).ok);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some((v) => !v) ? 1 : 0);
