/* Which sites may call the e-news sign-up and confirm functions
 * (functions/enews.js SIGNUP_SITES; the main window, 26 Oct 2026, for
 * egbc.churchhq.co.uk). No emulator.
 *
 *   node tests/check-enews-sites.mjs          (from v2/)
 *   BREAK=1 node tests/check-enews-sites.mjs  the list as it was (github.io only): must fail
 *
 * github.io and every church's own address (<slug>.churchhq.co.uk) may;
 * a look-alike, a plain http address or a deeper name may not.
 */
import fs from 'node:fs';
const src = fs.readFileSync('functions/enews.js', 'utf8');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
const m = /const SIGNUP_SITES = (\[[^\n]*\]);/.exec(src);
ok('the one list is there', !!m);
const SITES = process.env.BREAK ? [/^https:\/\/esherchurch\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/] : (m ? (0, eval)(m[1]) : []);
const allowed = (o) => SITES.some((re) => re.test(o));
ok('  both functions use it', /export const enewsSignup = onRequest\(\{[^}]*cors: SIGNUP_SITES/.test(src) && /export const enewsConfirm = onRequest\(\{[^}]*cors: SIGNUP_SITES/.test(src));
for (const o of ['https://esherchurch.github.io', 'https://egbc.churchhq.co.uk', 'https://st-aidans-testbury.churchhq.co.uk', 'http://localhost:5601']) ok('may: ' + o, allowed(o));
for (const o of ['https://egbc.churchhq.co.uk.evil.example', 'https://evilchurchhq.co.uk', 'http://egbc.churchhq.co.uk', 'https://a.b.churchhq.co.uk', 'https://churchhq.co.uk']) ok('may not: ' + o, !allowed(o));
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
