/* A changed Menu reaches every page (the reviewing window, 15 Oct 2026:
 * Martin could not see Payments until his browser fetched the new Menu).
 *
 *   node tests/check-stamps.mjs      (from v2/, no emulators needed)
 *
 * egbc-shell.js loads egbc-menu.js with its own stamp, MENU_V, and records
 * the Menu file's fingerprint beside it. If egbc-menu.js changes and nobody
 * changes MENU_V, browsers keep the old Menu - so:
 *   - MENU_FINGERPRINT must match egbc-menu.js as it is now;
 *   - the hub, which loads the Menu itself, must use the same MENU_V.
 * When this fails: set a new MENU_V (yyyymmddhhmm), put the fingerprint it
 * prints into MENU_FINGERPRINT, and the same MENU_V into hub.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const V2 = path.resolve('.');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + x : ''))); };
const read = (f) => fs.readFileSync(path.join(V2, f), 'utf8').replace(/\r\n/g, '\n');

const shell = read('egbc-shell.js');
const v = (shell.match(/var MENU_V = '(\d{12})';/) || [])[1];
const fp = (shell.match(/var MENU_FINGERPRINT = '([0-9a-f]{12})';/) || [])[1];
const now = crypto.createHash('sha1').update(read('egbc-menu.js')).digest('hex').slice(0, 12);

console.log('\nthe Menu\'s stamp');
ok('egbc-shell.js has a MENU_V and a MENU_FINGERPRINT', !!v && !!fp, 'MENU_V ' + v + ', MENU_FINGERPRINT ' + fp);
ok('  the fingerprint matches egbc-menu.js as it is now (or the Menu changed without a new stamp)', fp === now,
  'egbc-menu.js is now ' + now + ', egbc-shell.js says ' + fp + ' - set a new MENU_V and MENU_FINGERPRINT = \'' + now + '\'');
ok('  the shell loads the Menu with it', /sibling\(MENU_SRC\)\.split\('\?'\)\[0\] \+ '\?v=' \+ MENU_V/.test(shell));
const hub = (read('hub.html').match(/egbc-menu\.js\?v=(\d{12})/) || [])[1];
ok('  and the hub loads the Menu with the same stamp', hub === v, 'hub.html has ' + hub + ', MENU_V is ' + v);

/* EVERY STAMP IS ONE STAMP (19 Oct 2026): a bump that found no old stamp to
   replace glued the new one onto the front of every page's
   egbc-shell.js?v=…, 24 digits, and nothing noticed - the browser loads it
   happily, it just never matches a cache again. Twelve digits, always. */
const bad = [];
for (const f of fs.readdirSync(V2).filter(n => /\.html$/i.test(n))) {
  for (const m of read(f).matchAll(/\.(?:js|css)\?v=(\d+)/g)) if (m[1].length !== 12) bad.push(f + ' ' + m[0]);
}
ok('every ?v= stamp on every page is twelve digits', bad.length === 0, bad.slice(0, 6).join(' | ') + (bad.length > 6 ? ' … ' + bad.length : ''));

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(x => !x) ? 1 : 0);
