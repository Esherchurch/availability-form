/* Team jobs, not team names (FINDINGS-churchhq H-9): egbc-team-jobs.js and
 * its server copy, functions/team-jobs.js.
 *
 *   node tests/check-team-jobs.mjs          (from v2/; no emulator)
 *   BREAK=map node tests/check-team-jobs.mjs     the church's mapping ignored
 *                                                (EGBC's teams always): must fail
 *   BREAK=cover node tests/check-team-jobs.mjs   leadership covering worship, AV and
 *                                                choir again (as before H-15): must fail
 *
 * EGBC, with nothing stored, gets today's teams for every job - written out
 * here from the rules and egbc-auth.js, so the check cannot agree with
 * itself. A church's own mapping, several teams for one job, "nobody", and
 * the synthetic parish.
 */
import fs from 'node:fs';
import { buildTeamJobs, SOURCE, BUILT } from '../tools/team-jobs-build.mjs';
await import('../egbc-team-jobs.js');
const J = Object.assign({}, globalThis.EGBCTeamJobs);
if (process.env.BREAK === 'map') { const real = J.teamsFor; J.teamsFor = (map, job, set) => real(null, job, set); }
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
/* BREAK=cover: leadership covering worship, AV and choir, as before H-15. */
if (process.env.BREAK === 'cover') { const real = J.onJob; J.onJob = (map, mine, job, set) => real(map, mine, job, set) || (['worship', 'av', 'choir'].includes(job) && J.teamsFor(map, 'leadership', set).some((x) => (mine || []).includes(x))); }
const onJob = (...a) => J.onJob(...a);

console.log('The server copy');
const built = fs.existsSync(BUILT) ? fs.readFileSync(BUILT, 'utf8').replace(/\r\n/g, '\n') : '';
ok('functions/team-jobs.js is built from egbc-team-jobs.js as it is now', built === buildTeamJobs(fs.readFileSync(SOURCE, 'utf8')), 'run: node tools/team-jobs-build.mjs');
const S = await import('../functions/team-jobs.js');
const sameEverywhere = J.JOBS.every((j) => JSON.stringify(S.teamsFor({ office: ['Admin'] }, j.id, { moneyTeam: 'Treasury' })) === JSON.stringify(globalThis.EGBCTeamJobs.teamsFor({ office: ['Admin'] }, j.id, { moneyTeam: 'Treasury' })));
ok('  and gives the pages\' answers', sameEverywhere);

console.log('The jobs (H-9, decided 23 Oct 2026)');
const ids = J.JOBS.map((j) => j.id);
ok('15 jobs, communications among them', ids.length === 15 && ids.includes('communications') && new Set(ids).size === 15, ids);
ok('  every one says what it is for, with suggestions for a new church', J.JOBS.every((j) => j.means && j.suggest.length >= 2));

console.log('EGBC, with nothing stored: today\'s teams for every job');
/* From firestore.rules onTeam() and egbc-auth.js, 26 Oct 2026. */
const TODAY = { office: ['Church office'], communications: ['Church office'], trustees: ['Elders'], leadership: ['Elders'], finance: ['Finance'],
  buildings: ['Maintenance'], pastoral: ['Pastoral'], worship: ['Worship Team'], av: ['AV Team'], choir: ['Choir'], children: ['Kids Church'],
  youth: ['Youth Worship'], catering: ['Catering'], welcome: [], prayer: [] };
const wrong = ids.filter((j) => JSON.stringify(J.teamsFor(null, j)) !== JSON.stringify(TODAY[j]));
ok('every job is today\'s team', wrong.length === 0, wrong);
const rules = fs.readFileSync('firestore.rules', 'utf8');
const named = [...new Set([...rules.matchAll(/onTeam\('([^']+)'\)/g)].map((m) => m[1]))];
/* A core team (H-15) is no job's: it covers chosen teams instead. */
const coreTeams = [...fs.readFileSync('egbc-auth.js', 'utf8').matchAll(/'([^']+)':\s*\{[^}]*coreFor:/g)].map((m) => m[1]);
const homeless = named.filter((t) => !coreTeams.includes(t) && !ids.some((j) => J.teamsFor(null, j).includes(t)));
ok('  every team the rules name today is some job\'s team, or a core team (' + coreTeams.join(', ') + ')', homeless.length === 0 && coreTeams.includes('Core Team'), homeless);
/* Leadership is the church's overall leaders and covers nothing (H-15,
   Martin, 26 Oct 2026); worship's leadership is the Worship Core Team. */
ok('  leadership is the Elders, and covers nothing: not worship, AV, choir, children or youth', ['worship', 'av', 'choir', 'children', 'youth'].every((j) => !onJob(null, ['Elders'], j)));
ok('  and Core Team is no job\'s team (it is the Worship Core Team)', ids.every((j) => !J.teamsFor(null, j).includes('Core Team')));
ok('  and with EGBC\'s settings as they are, the same', J.teamsFor(null, 'finance', { moneyTeam: 'Finance' })[0] === 'Finance' && J.teamsFor(null, 'trustees', { trusteeTeam: 'Elders' })[0] === 'Elders');
ok('  a setting already changed is kept (moneyTeam "Treasury")', J.teamsFor(null, 'finance', { moneyTeam: 'Treasury' })[0] === 'Treasury');
ok('  the prayer team as prayer.html sets it, or nobody', J.teamsFor(null, 'prayer', { prayerTeam: 'Prayer ministry' })[0] === 'Prayer ministry' && J.teamsFor(null, 'prayer', { prayerTeam: '' }).length === 0);

console.log('A church\'s own mapping');
const map = { office: ['Parish office'], trustees: ['PCC', 'Churchwardens'], welcome: [], finance: ['Treasurers'] };
ok('its own team, not EGBC\'s', J.teamsFor(map, 'office')[0] === 'Parish office');
ok('  the mapping wins over an old setting', J.teamsFor(map, 'finance', { moneyTeam: 'Finance' })[0] === 'Treasurers');
ok('  several teams for one job, named together', J.label(map, 'trustees', (t) => t) === 'PCC and Churchwardens' && onJob(map, ['Churchwardens'], 'trustees'));
ok('  "nobody": no one is on it, and it is named as nobody', J.teamsFor(map, 'welcome').length === 0 && !onJob(map, ['Welcome'], 'welcome') && J.label(map, 'welcome', (t) => t) === '');
ok('  the team\'s label, never its id', J.label({ office: ['team_7f3a'] }, 'office', (t) => ({ team_7f3a: 'Admin' })[t]) === 'Admin');
ok('  a team can do several jobs', J.jobsOf({ office: ['Church office'], communications: ['Church office'] }, 'Church office').join() === 'office,communications');

console.log('Pastoral care never falls back (H-9 question 4)');
ok('the church\'s leaders are not the pastoral team', !onJob(null, ['Elders'], 'pastoral'));
ok('  nor is anyone when a church has nobody', !onJob({ pastoral: [] }, ['Elders', 'Church office'], 'pastoral'));

console.log('A mapping that is not right is said in words');
ok('a made-up job', J.validate({ bellringing: ['Ringers'] }).length === 1);
ok('  a team where a list belongs', J.validate({ office: 'Church office' }).length === 1);
ok('  501 teams for one job (500 is the most)', J.validate({ buildings: Array.from({ length: 501 }, (_, i) => 'T' + i) }).length === 1 && J.validate({ buildings: Array.from({ length: 500 }, (_, i) => 'T' + i) }).length === 0);
ok('  a team twice', J.validate({ office: ['A', 'A'] }).length === 1);
ok('  EGBC\'s nothing-stored is fine', J.validate(null).length === 0);

console.log('The synthetic parish (St Aidan\'s with St Hild, Testbury)');
const aidan = { office: ['t_parish_office'], communications: ['t_parish_office'], trustees: ['t_pcc'], leadership: ['t_standing'], worship: ['t_choir', 't_music'],
  choir: ['t_choir'], children: ['t_junior'], youth: [], av: [], pastoral: ['t_pastoral'], buildings: ['t_fabric', 't_hild_site'], finance: ['t_treasurer'], catering: [], welcome: ['t_sidespeople'], prayer: [] };
const LBL = { t_parish_office: 'Parish office', t_pcc: 'PCC', t_standing: 'Standing Committee', t_choir: 'Choir', t_music: 'Music group', t_junior: 'Junior Church',
  t_pastoral: 'Pastoral visitors', t_fabric: 'Fabric team', t_hild_site: 'St Hild site team', t_treasurer: 'Treasurer', t_sidespeople: 'Sidespeople' };
ok('its mapping is a good one', J.validate(aidan).length === 0, J.validate(aidan));
ok('  every word is its own ("Fabric team and St Hild site team")', J.label(aidan, 'buildings', (t) => LBL[t]) === 'Fabric team and St Hild site team');
ok('  no EGBC team appears anywhere in its answers', ids.every((j) => J.teamsFor(aidan, j).every((t) => t.startsWith('t_'))));
ok('  its PCC are its trustees; its choir sings in worship', onJob(aidan, ['t_pcc'], 'trustees') && onJob(aidan, ['t_choir'], 'worship'));
ok('  with no AV team, nobody is on AV, not even the Standing Committee', !onJob(aidan, ['t_standing'], 'av') && J.teamsFor(aidan, 'av').length === 0);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
