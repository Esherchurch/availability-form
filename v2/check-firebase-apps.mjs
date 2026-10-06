/* Which v2 pages start their own Firebase app?
 *
 * Firebase keeps the signed-in user per app. A page that calls initializeApp
 * for itself gets a second app, and that app has nobody signed in - so its
 * reads and writes go out unauthenticated even though the page checked the
 * login. Today the rules allow that, which is the only reason it works, and
 * it is what stops firestore.rules being deployed.
 *
 * It also means "served from localhost" does not imply "talking to the
 * emulator": the emulator hook lives in egbc-auth.js, on the shared app only.
 * That is how five test records ended up in the live database during Step A.
 *
 * A page is clean when it gets its data from EGBCAuth.db / EGBCAuth.storage().
 *
 *   node check-firebase-apps.mjs           list the pages that are not clean
 *   node check-firebase-apps.mjs --all     list every page and its verdict
 *
 * Exit code 0 when no in-scope page starts its own app, 1 otherwise, so it
 * can be used as a gate.
 */

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/* Deliberately out of scope - not ours to touch. ONE-APP-BRIEF §4. */
const OUT_OF_SCOPE = [
  /^worshiphubapp\.html$/i,
  /^manifest-worship\.json$/i,
  /^mix-.*/i,
  /^studio\.html$/i,
  /^trainingrotaplanner\.html$/i,   /* training copies read the training_* collections */
  /^training .*\.html$/i,
  /^trainingbatchimporter\.html$/i,
  /^trainingmusicdatabase\.html$/i,
  /^trainingportalhub\.html$/i,
];

const outOfScope = f => OUT_OF_SCOPE.some(r => r.test(f));

const files = fs.readdirSync(DIR)
  .filter(f => /\.html$/i.test(f))
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

const rows = [];
for (const f of files) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');

  /* An app of its own, either SDK. */
  const compat = (s.match(/firebase\s*\.\s*initializeApp\s*\(/g) || []).length;
  const modular = (s.match(/(^|[^.\w])initializeApp\s*\(/gm) || []).length - compat;
  let ownApp = compat + Math.max(0, modular);

  /* An app opened against a DIFFERENT project is not the problem this gate is
     about. data-tools.html restores a backup into another Firebase project and
     has to connect to it; that app is named, and its config is built from what
     the person typed, so it carries no egbc-worship-planner literal. Counted
     separately rather than ignored, so it stays visible. */
  const foreign = (s.match(/initializeApp\s*\(\s*\{[^}]*\}\s*,\s*['"][^'"]+['"]\s*\)/g) || [])
    .filter(call => call.indexOf('egbc-worship-planner') === -1).length;
  ownApp -= foreign;

  /* egbc-auth.js owns the shared app; it is allowed to make it. */
  const isAuthItself = /^egbc-auth\.js$/i.test(f);

  /* Two ways to be on the shared connection: EGBCAuth.db for compat pages,
     egbc-db.js for modular ones. Both are the same app, named 'egbc'. */
  const usesShared = /EGBCAuth\s*\.\s*(db|storage)\b/.test(s) || /egbc-db\.js/.test(s);

  /* Which SDK the page's own data code is written in - a page can load the
     compat scripts for the sign-in and still be modular underneath. */
  const sdk = /egbc-db\.js/.test(s) || /firebasejs\/[\d.]+\/firebase-firestore\.js/.test(s) ? 'modular'
            : /firebase-app-compat\.js/.test(s) ? 'compat' : '—';

  rows.push({
    file: f,
    scope: outOfScope(f) ? 'out' : 'in',
    own: isAuthItself ? 0 : ownApp,
    foreign: foreign,
    shared: usesShared,
    sdk
  });
}

const all = process.argv.includes('--all');
const offenders = rows.filter(r => r.scope === 'in' && r.own > 0);

const show = all ? rows : offenders;
if (show.length) {
  console.log('');
  console.log('  ' + 'page'.padEnd(32) + 'scope  own app  uses EGBCAuth.db  SDK');
  console.log('  ' + '-'.repeat(76));
  for (const r of show) {
    console.log('  ' + r.file.padEnd(32) + r.scope.padEnd(7) +
      String(r.own).padEnd(9) + (r.shared ? 'yes' : 'no').padEnd(18) + r.sdk);
  }
}

console.log('');
console.log('  in scope, starting their own Firebase app : ' + offenders.length);
console.log('  in scope, on the shared connection        : ' +
  rows.filter(r => r.scope === 'in' && r.own === 0 && r.shared).length);
console.log('  out of scope, left alone                  : ' + rows.filter(r => r.scope === 'out').length);
const foreignTotal = rows.reduce((n, r) => n + (r.foreign || 0), 0);
if (foreignTotal) console.log('  apps opened against ANOTHER project       : ' + foreignTotal + '   (data-tools restore target - legitimate)');
console.log('');

if (offenders.length) {
  console.log('  Not clean yet. Step B is done when the first number is zero.');
  process.exit(1);
}
console.log('  Every in-scope page is on the one signed-in connection.');
process.exit(0);
