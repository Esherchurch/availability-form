/* Which sites may call the e-news sign-up and confirm functions
 * (functions/enews.js fromOurSite; the main window, 26 Oct 2026, for
 * egbc.churchhq.co.uk; Comms, 28 Oct 2026: no church's address typed in).
 * No emulator.
 *
 *   node tests/check-enews-sites.mjs          (from v2/)
 *   BREAK=1 node tests/check-enews-sites.mjs  a church's address typed into the list: must fail
 *
 * Every church's own address (<slug>.churchhq.co.uk) and a local test may,
 * by the list; the church's own hub address may, by its setting (hubOf);
 * a look-alike, a plain http address or a deeper name may not.
 */
import fs from 'node:fs';
let src = fs.readFileSync('functions/enews.js', 'utf8');
if (process.env.BREAK) src = src.replace('const HQ_SITES = /^(', () => String.raw`const HQ_SITES = /^(https:\/\/esherchurch\.github\.io|`);
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
const m = /const HQ_SITES = (\/[^\n]*\/);/.exec(src);
ok('the one list is there', !!m);
const SITES = m ? (0, eval)(m[1]) : /$^/;
ok('  no church’s own address in it', !/github\.io|esherchurch/.test(m ? m[1] : 'x'));
ok('  both functions check the site, with the church’s hub address', /enewsSignup = onRequest\(\{[^}]*cors: false[\s\S]{0,120}fromOurSite\(req, res, D\)/.test(src)
  && /enewsConfirm = onRequest\(\{[^}]*cors: false[\s\S]{0,120}fromOurSite\(req, res, D\)/.test(src) && /hubOf\(D \|\| root\(\)\)/.test(src));
for (const o of ['https://egbc.churchhq.co.uk', 'https://st-aidans-testbury.churchhq.co.uk', 'http://localhost:5601']) ok('may: ' + o, SITES.test(o));
for (const o of ['https://egbc.churchhq.co.uk.evil.example', 'https://evilchurchhq.co.uk', 'http://egbc.churchhq.co.uk', 'https://a.b.churchhq.co.uk', 'https://churchhq.co.uk']) ok('may not: ' + o, !SITES.test(o));
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
