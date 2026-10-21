/* No Calla in v2 (Martin, 21 Oct 2026: "v2 doesn't use Calla at all; it
 * uses Church HQ's own Resend"). Only the original site uses Calla's
 * sendEmail.
 *
 *   node tests/check-no-calla.mjs      (from v2/; no emulator)
 *
 * 1. Calla's send service is named nowhere in v2: no page, script or
 *    function (the tests may name it, to look for it).
 * 2. No page posts to an email service itself - not Calla's, not Resend's.
 * 3. Every one of the fifteen senders that used to goes through the hub:
 *    EGBCAuth.sendEmail (hubSend), with the kind of email it is.
 * hubSend's own rules are tests/check-hub-send.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve('.');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 600) : ''))); };
const read = (f) => fs.readFileSync(path.join(V2, f), 'utf8');

/* Every file v2 serves or deploys: pages, scripts, functions. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(V2, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'tests', '.git', 'design-mocks', 'screenshots'].includes(e.name)) continue;
      walk(rel, out);
    } else if (/\.(html|js|cjs|mjs|json)$/i.test(e.name)) out.push(rel);
  }
  return out;
}
const files = walk('.');
const CALLA = /sendemail-[a-z0-9]+-uc\.a\.run\.app|cloudfunctions\.net\/sendemail/i;

console.log('Calla’s send service, named anywhere in v2 (' + files.length + ' files)');
const named = files.filter(f => CALLA.test(read(f)));
ok('  nowhere: no page, script or function', named.length === 0, named.join(', '));

/* The WORDS too (the reviewing window, 21 Oct 2026): three planners still
   told people "Sends from EGBCWorship@callasuite.uk". v2's mail comes from
   hub@mail.churchhq.co.uk in the church's name. */
const words = files.filter(f => !f.startsWith('functions')).filter(f => /callasuite/i.test(read(f)));
ok('  no page or script says mail comes from Calla (callasuite)', words.length === 0, words.join(', '));

console.log('\nNo page posts to an email service itself');
const direct = files.filter(f => !f.startsWith('functions')).filter(f => /fetch\([^)]*(sendemail|api\.resend\.com)/i.test(read(f)));
ok('  no fetch to a send service in any page or script', direct.length === 0, direct.join(', '));

console.log('\nEvery sender goes through the hub (EGBCAuth.sendEmail), saying what kind of email it is');
const SENDERS = [
  ['Planner.html', 'rota', 3], ['SundayServicePlanner.html', 'servicePlan', 1], ['youthserviceplanner.html', 'servicePlan', 1],
  ['youthapp2.html', 'servicePlan', 1], ['egbc-core-planner.js', 'servicePlan', 1], ['egbc-core-rota.js', 'rota', 1], ['hub-app.js', 'youthCode', 2]
];
for (const [f, source, n] of SENDERS) {
  const got = (read(f).match(new RegExp("EGBCAuth\\.sendEmail\\(Object\\.assign\\(\\{ source: '" + source + "' \\}", 'g')) || []).length;
  ok('  ' + f + ': ' + n + ' × ' + source, got === n, got + ' found');
}
const builder = read('EmailBuilder2.html');
ok('  EmailBuilder2.html: compiler, and its test to yourself as compilerTest', /EGBCAuth\.sendEmail\(\{\s*source: test \? 'compilerTest' : 'compiler'/.test(builder));
const em = read('egbc-email.js');
ok('  egbc-email.js (the events pages, through EGBCChurch.send): EGBCAuth.sendEmail with the page’s source',
  /global\.EGBCAuth\.sendEmail\(payload\)/.test(em) && /payload\.source = opts\.source \|\| sourceHere\(\)/.test(em));
const auth = read('egbc-auth.js');
ok('  and EGBCAuth.sendEmail is hubSend', /sendEmail: function[\s\S]{0,400}callFunction\('hubSend'/.test(auth));
const idx = read('functions/index.js');
ok('  the server exports hubSend', /export \{ hubSend \} from '\.\/hub-send\.js'/.test(idx));

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
