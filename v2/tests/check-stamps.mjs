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
/* AND EVERY OTHER PAGE THAT LOADS THE MENU ITSELF: the app has since 20 Oct
   (its start screen asks the Menu who sees the building pages), and it
   kept yesterday's stamp when the Menu changed. */
const stale = fs.readdirSync(V2).filter(n => /\.html$/i.test(n) && n !== 'hub.html')
  .map(f => [f, (read(f).match(/egbc-menu\.js\?v=(\d{12})/) || [])[1]])
  .filter(([, s]) => s && s !== v).map(([f, s]) => f + ' has ' + s);
ok('  and so does every other page that loads it', stale.length === 0, stale.join(', ') + ', MENU_V is ' + v);

/* EVERY STAMP IS ONE STAMP (19 Oct 2026): a bump that found no old stamp to
   replace glued the new one onto the front of every page's
   egbc-shell.js?v=…, 24 digits, and nothing noticed - the browser loads it
   happily, it just never matches a cache again. Twelve digits, always. */
const bad = [];
for (const f of fs.readdirSync(V2).filter(n => /\.html$/i.test(n))) {
  for (const m of read(f).matchAll(/\.(?:js|css)\?v=(\d+)/g)) if (m[1].length !== 12) bad.push(f + ' ' + m[0]);
}
ok('every ?v= stamp on every page is twelve digits', bad.length === 0, bad.slice(0, 6).join(' | ') + (bad.length > 6 ? ' … ' + bad.length : ''));

/* ONE ENGINE, ONE STAMP (reviewing window, 22 Oct 2026): present.html had
   egbc-present.js at 202610221330 while meeting.html still asked for
   202610220030, so a meeting kept the old engine (F-267's sheet fix and
   the leave beacon). Every page that loads the Present engine asks for
   the same version. */
const presentStamps = fs.readdirSync(V2).filter(n => /\.html$/i.test(n))
  .map(f => [f, (read(f).match(/egbc-present\.js\?v=(\d{12})/) || [])[1]]).filter(([, s]) => s);
const newest = presentStamps.map(([, s]) => s).sort().pop();
const behind = presentStamps.filter(([, s]) => s !== newest).map(([f, s]) => f + ' has ' + s);
ok('every page loads egbc-present.js with the same stamp', behind.length === 0, behind.join(', ') + '; the newest is ' + newest);

/* THE SIGN-IN AND THE SHELL: ONE VERSION EVERYWHERE (23 Oct 2026: a page
   added the same day as an egbc-auth.js bump came in on the old stamp, so
   that page alone ran yesterday's sign-in code). */
for (const lib of ['egbc-auth.js', 'egbc-shell.js']) {
  const re = new RegExp(lib.replace('.', '\\.') + '\\?v=(\\d{12})');
  const seen = {};
  for (const f of fs.readdirSync(V2).filter(n => /\.html$/i.test(n))) { const m = read(f).match(re); if (m) (seen[m[1]] = seen[m[1]] || []).push(f); }
  const stamps = Object.keys(seen).sort();
  ok('every page loads ' + lib + ' with the same stamp', stamps.length <= 1,
    stamps.slice(0, -1).map(s => seen[s].slice(0, 5).join(', ') + ' at ' + s).join('; ') + ' - the rest at ' + stamps[stamps.length - 1]);
}

/* THE APP AND THE HUB ARE NEVER BEHIND (22 Oct 2026): the events window
   bumped egbc-events.js on its pages and asked for the app's (F-270); the
   app was also found asking for older copies of six more scripts than
   other pages used, so phones kept old code. These two pages - the ones
   most people open - load every script at the newest stamp any page uses. */
const newestOf = {};
for (const f of fs.readdirSync(V2).filter(n => /\.html$/i.test(n))) {
  for (const m of read(f).matchAll(/([\w.-]+\.(?:js|css))\?v=(\d{12})/g)) if (!newestOf[m[1]] || m[2] > newestOf[m[1]].v) newestOf[m[1]] = { v: m[2], f };
}
for (const page of ['app.html', 'hub.html']) {
  const old = [...read(page).matchAll(/([\w.-]+\.(?:js|css))\?v=(\d{12})/g)].filter(m => m[2] < newestOf[m[1]].v)
    .map(m => m[1] + ' ' + m[2] + ' (' + newestOf[m[1]].f + ' has ' + newestOf[m[1]].v + ')');
  ok(page + ' loads every script at its newest stamp', old.length === 0, old.join(', '));
}

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(x => !x) ? 1 : 0);
