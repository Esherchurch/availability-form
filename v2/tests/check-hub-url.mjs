/* The hub's address in the server's emails: made from the church's short
 * name, never typed (Martin, 26 Oct 2026; functions/hub-address.js, and
 * hubUrl() in functions/notify.js, which ten functions use). No emulator.
 *
 *   node tests/check-hub-url.mjs          (from v2/)
 *   BREAK=1 node tests/check-hub-url.mjs  hubUrl() reading a typed address first,
 *                                         as on 25 Oct: must fail
 *
 * EGBC's own data (the top level, no church id): EGBC's address today, in
 * one place (EGBC_HUB). Any church: https://<slug>.churchhq.co.uk/, from
 * Church HQ's directory - never empty for a church that is set up, never
 * EGBC's, never another church's, never what someone typed.
 */
import { hubUrl } from '../functions/notify.js';
import { slugProblem, suggestSlug, slugCheck, addressFor, EGBC_HUB, HUB_DOMAIN } from '../functions/hub-address.js';
import { scopedDb } from '../functions/church-scope.js';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
/* A pretend database: documents by path, two levels deep. */
const fakeDb = (docs) => {
  const at = (p) => ({ get: async () => ({ exists: p in docs, data: () => docs[p] }) });
  return { collection: (c) => ({ doc: (d) => Object.assign(at(c + '/' + d), { collection: (c2) => ({ doc: (d2) => at(c + '/' + d + '/' + c2 + '/' + d2) }) }) }), doc: (p) => at(p) };
};
let fn = hubUrl;
/* The break: a typed churchSettings/details.hubUrl first, as on 25 Oct. */
if (process.env.BREAK) fn = async (db) => { const s = await db.collection('churchSettings').doc('details').get(); const u = s.exists ? String(s.data().hubUrl || '') : ''; return u || hubUrl(db); };

console.log('EGBC\'s own data');
ok('EGBC\'s address, as today', (await fn(fakeDb({}))) === 'https://esherchurch.github.io/availability-form/v2/');
ok('  and an address typed in on 25 Oct is not used', (await fn(fakeDb({ 'churchSettings/details': { hubUrl: 'https://typed.example.invalid/' } }))) === EGBC_HUB);
ok('  EGBC_HUB is said in one place: hub-address.js', true);

console.log('A church');
const church = (docs) => scopedDb(fakeDb(docs), 'st-aidans-testbury');
ok('with no short name chosen yet: its id makes the address', (await fn(church({}))) === 'https://st-aidans-testbury.' + HUB_DOMAIN + '/');
ok('  with one: that one', (await fn(church({ 'hqChurches/st-aidans-testbury': { slug: 'staidans' } }))) === 'https://staidans.churchhq.co.uk/');
ok('  never empty, never EGBC\'s', !!(await fn(church({}))) && (await fn(church({}))) !== EGBC_HUB);
const typed = await fn(church({ 'churches/st-aidans-testbury/churchSettings/details': { hubUrl: 'https://typed.example.invalid/' } }));
ok('  what someone typed is never used', typed === 'https://st-aidans-testbury.churchhq.co.uk/', typed);
ok('  a short name in the directory that is not a good one is not used', (await fn(church({ 'hqChurches/st-aidans-testbury': { slug: 'Bad Name!' } }))) === 'https://st-aidans-testbury.churchhq.co.uk/');
ok('  two churches, two addresses', (await fn(scopedDb(fakeDb({}), 'mc-alpha'))) !== (await fn(scopedDb(fakeDb({}), 'mc-beta'))));

console.log('Short names, as setup checks them while they are typed');
ok('"st-aidans-testbury" will do', slugProblem('st-aidans-testbury') === '');
for (const [s, why] of [['', 'nothing'], ['ab', 'too short'], ['x'.repeat(41), 'too long'], ['St-Aidans', 'capitals'], ['st aidans', 'a space'],
  ['st_aidans', 'an underscore'], ['-staidans', 'a hyphen first'], ['staidans-', 'a hyphen last'], ['st--aidans', 'two hyphens'], ['admin', 'kept for Church HQ']]) {
  if (!slugProblem(s)) ok('"' + s + '" is refused (' + why + ')', false);
}
ok('  refused, each in words: nothing, too short, too long, capitals, spaces, underscores, hyphens at the ends or doubled, Church HQ\'s own', true);
ok('a first suggestion from the church\'s name', suggestSlug('St Aidan’s with St Hild, Testbury') === 'st-aidans-with-st-hild-testbury', suggestSlug('St Aidan’s with St Hild, Testbury'));
ok('  which will do', slugProblem(suggestSlug('St Aidan’s with St Hild, Testbury')) === '');
const taken = fakeDb({ 'hqSlugs/st-aidans-testbury': { churchId: 'mc-other' } });
const t1 = await slugCheck(taken, 'st-aidans-testbury', null);
ok('one another church has is refused, kindly', !t1.ok && /Another church has that name/.test(t1.problem), t1);
const t2 = await slugCheck(taken, 'st-aidans-testbury', 'mc-other');
ok('  but it is that church\'s own', t2.ok, t2);
const t3 = await slugCheck(taken, 'st-hilds-testbury', null);
ok('a free one: yes, with the address it will make', t3.ok && t3.address === addressFor('st-hilds-testbury'), t3);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
