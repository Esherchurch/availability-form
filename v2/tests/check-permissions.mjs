/* Who may do what: the Permissions screen's rules (FINDINGS-churchhq H-14;
 * egbc-permissions.js and its server copy, functions/permissions-core.js).
 * No emulator. The screen, the sign-in claim and the Storage rule come next.
 *
 *   node tests/check-permissions.mjs          (from v2/)
 *   BREAK=ends node tests/check-permissions.mjs   an exception that never ends: must fail
 *
 * Martin's answers (26 Oct 2026): kb/ uploads for master admins, the core
 * teams covering worship (EGBC's Worship Core Team, H-15) and the admins of
 * AV and Worship; exceptions only add; end dates optional; "leaders" are
 * the leaders of the teams ticked. Made-up people throughout.
 */
import fs from 'node:fs';
import { buildPermissions, PERMS_SOURCE, PERMS_BUILT } from '../tools/team-jobs-build.mjs';
const P = await import('../functions/permissions-core.js');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
const TODAY = '2026-10-26';
/* EGBC's core teams, as egbc-auth.js and functions/core-teams.js have them. */
const cores = { 'Core Team': ['Worship Team', 'AV Team', 'Choir'], 'Kids & Youth Core Team': ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship'] };
let exceptions = [];
const o = (extra) => Object.assign({ today: TODAY, cores, exceptions }, extra || {});
const may = (person, extra) => P.may(person, 'kbUpload', o(extra));

console.log('The server copy');
const built = fs.existsSync(PERMS_BUILT) ? fs.readFileSync(PERMS_BUILT, 'utf8').replace(/\r\n/g, '\n') : '';
ok('functions/permissions-core.js is built from egbc-permissions.js as it is now', built === buildPermissions(fs.readFileSync(PERMS_SOURCE, 'utf8')), 'run: node tools/team-jobs-build.mjs');

console.log('kb/ uploads, by default (Martin\'s answer 1, with H-15)');
ok('a master admin may', may({ master: true }));
ok('  a Worship Core Team member may', may({ teams: ['Core Team'] }));
ok('  an admin of AV may, and of Worship', may({ adminFor: ['AV Team'] }) && may({ adminFor: ['Worship Team'] }));
ok('  an admin of the Worship Core Team may (it covers AV and Worship)', may({ adminFor: ['Core Team'] }));
ok('a Kids & Youth Core Team member may not', !may({ teams: ['Kids & Youth Core Team'] }));
ok('  nor a plain AV or Worship member', !may({ teams: ['AV Team'] }) && !may({ teams: ['Worship Team'] }));
ok('  nor the church\'s overall leaders (the Elders)', !may({ teams: ['Elders'] }));
ok('  nor a Kids Church admin', !may({ adminFor: ['Kids Church'] }));

console.log('Exceptions only add (answer 2); end dates are optional (answer 3)');
exceptions = [{ action: 'kbUpload', memberId: 'm_sam', until: '2026-12-31', by: 'u_master', why: 'Runs the AV desk on Sundays' },
  { action: 'kbUpload', memberId: 'm_jo', until: '', by: 'u_master', why: 'No end date' },
  { action: 'kbUpload', memberId: 'm_old', until: '2026-10-01', by: 'u_master', why: 'Ended' }];
let P2 = P;
if (process.env.BREAK === 'ends') P2 = Object.assign({}, P, { may: (person, id, x) => P.may(person, id, Object.assign({}, x, { today: '' })) });
const mayX = (person) => P2.may(person, 'kbUpload', o());
ok('a person given it may, with no team at all', mayX({ memberId: 'm_sam' }));
ok('  and with no end date, still', mayX({ memberId: 'm_jo' }));
ok('  but not once it has ended', !mayX({ memberId: 'm_old' }));
ok('  nor anybody else because of it', !mayX({ memberId: 'm_other' }));
const soon = P.ending(exceptions, TODAY, 7).map((x) => x.memberId);
ok('ending within a week: told to whoever added it (none here)', soon.length === 0, soon);
ok('  one ending in 5 days is', P.ending([{ action: 'kbUpload', memberId: 'm_x', until: '2026-10-31' }], TODAY, 7).length === 1);

console.log('"Leaders" are the leaders of the teams ticked (answer 4)');
const perms = { actions: { kbUpload: { jobs: [], coresOf: [], adminJobs: [], teams: ['AV Team'], leaders: true } } };
ok('with AV ticked and its leaders: an AV member may', may({ teams: ['AV Team'] }, { perms }));
ok('  a leader of AV may', may({ roles: { 'AV Team': 'leader' } }, { perms }));
ok('  a leader of Kids Church may not', !may({ roles: { 'Kids Church': 'leader' } }, { perms }));
ok('  and the Worship Core Team no longer may (untick it, and it is gone)', !may({ teams: ['Core Team'] }, { perms }));

console.log('Every meeting (27 Oct 2026): never on by default');
const mayM = (person, extra) => P.may(person, 'meetingsAll', o(extra));
ok('a master admin may', mayM({ master: true }));
ok('  nobody else, whatever their teams, admin areas or core teams', ![{ teams: ['Core Team'] }, { teams: ['Kids & Youth Core Team'] }, { adminFor: ['Kids Church'] }, { teams: ['Elders', 'Church office'] }, { roles: { 'Worship Team': 'leader' } }].some((p) => mayM(p)));
ok('  one person given it (a small group leader) may', mayM({ memberId: 'm_sg' }, { exceptions: [{ action: 'meetingsAll', memberId: 'm_sg', until: '' }] }));
ok('  and a kb/ exception is not it', !mayM({ memberId: 'm_sam' }));

console.log('The screen\'s shape');
ok('sections, never one long list', P.SECTIONS.length >= 7 && P.ACTIONS.every((a) => P.SECTIONS.some((s) => s.id === a.section)));
ok('  safeguarding and pastoral care are read-only, with where they are set', P.READ_ONLY.map((x) => x.id).join() === 'safeguarding,pastoral' && P.READ_ONLY.every((x) => x.where));
ok('  a list that is not right is said in words', P.validate({ actions: { nope: {} } }).length === 1 && P.validate({ actions: { kbUpload: { teams: 'AV Team' } } }).length === 1 && P.validate({ actions: { kbUpload: { leaders: 'yes' } } }).length === 1);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
