/* ===================================================================
   check-features-agree: the pages and the server give the same answer
   for every switch (the reviewing window, 20 Oct 2026)
   ===================================================================

   Pages ask EGBCAuth.uses (egbc-auth.js, FEATURES + usesFeature); the
   functions ask functions/features.js (FEATURES + uses). This check:
     1. the two lists match, name for name, default for default;
     2. for EVERY switch, stored on, stored off, stored as nonsense and not
        stored at all, the page's own usesFeature and the server's uses()
        give the same answer;
     3. notify's liveState (the one server reader with a test seam) gives
        that answer from a database;
     4. nothing else reads churchSettings/features its own way. The events
        window's readers waiting to change over are listed in WAITING
        with their FINDINGS number, shown as WAIT, not hidden; one that no
        longer reads the switches itself must come off the list.
   No emulator, no browser.
   =================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, more) => { if (c) { pass++; console.log('  ok      ' + m); } else { fail++; console.log('  FAIL    ' + m + (more ? '\n          ' + more : '')); } };
const read = (f) => fs.readFileSync(path.join(V2, f), 'utf8').replace(/\r\n/g, '\n');

/* ---- the page's half, taken from egbc-auth.js itself ---- */
const auth = read('egbc-auth.js');
const listSrc = (auth.match(/var FEATURES = (\[[\s\S]*?\n  \]);/) || [])[1];
const fnSrc = (auth.match(/function usesFeature\(name\) \{[\s\S]*?\n  \}/) || [])[0];
ok(!!listSrc && !!fnSrc, 'egbc-auth.js has FEATURES and usesFeature');
const PAGE = new Function('return ' + listSrc)();
const pageUses = (switches, name) => new Function('FEATURES', 'featureSwitches', fnSrc + '\nreturn usesFeature(' + JSON.stringify(name) + ');')(PAGE, switches);

/* ---- the server's half ---- */
const server = await import(pathToFileURL(path.join(V2, 'functions', 'features.js')).href);
const SERVER = server.FEATURES;

console.log('\n1. One list');
const key = (f) => f.name + '=' + f.on + (f.addOn ? '+addOn' : '');
const pk = PAGE.map(key), sk = SERVER.map(key);
ok(JSON.stringify(pk) === JSON.stringify(sk), 'egbc-auth.js and functions/features.js list the same ' + PAGE.length + ' switches with the same defaults',
  'page only: ' + pk.filter((k) => !sk.includes(k)).join(', ') + ' | server only: ' + sk.filter((k) => !pk.includes(k)).join(', '));

console.log('\n2. The same answer for every switch, every way it can be stored');
const names = [...new Set([...PAGE, ...SERVER].map((f) => f.name)), 'aNameNobodyListed'];
const STATES = [['not stored', undefined], ['on', true], ['off', false], ['nonsense', 'yes']];
const differ = [];
for (const n of names) for (const [label, v] of STATES) {
  const sw = v === undefined ? {} : { [n]: v };
  const p = pageUses(sw, n), s = server.uses(sw, n);
  if (p !== s || typeof p !== 'boolean') differ.push(n + ' ' + label + ': page ' + p + ', server ' + s);
}
ok(!differ.length, names.length + ' switches x ' + STATES.length + ' ways stored: page and server agree', differ.join('; '));
ok(pageUses({}, 'buildingCompliance') === true && server.uses({}, 'buildingCompliance') === true,
  'building compliance with nothing stored: on for both (the 20 Oct mismatch)');

console.log('\n3. A server reader, from a database');
const fakeDb = (features, failing) => ({ collection: (c) => ({ doc: (d) => ({ get: async () => {
  if (failing && d === 'features') throw new Error('unreadable');
  const data = d === 'features' ? features : d === 'notifications' ? { live: true } : null;
  return { exists: !!data, data: () => data, get: (k) => data && data[k] };
} }) }) });
const notify = await import(pathToFileURL(path.join(V2, 'functions', 'notify.js')).href);
for (const [label, sw, want] of [['nothing stored', {}, true], ['stored off', { notifications: false }, false], ['stored on', { notifications: true }, true]]) {
  const st = await notify.liveState(fakeDb(sw));
  ok(st.feature === want && st.feature === pageUses(sw, 'notifications'), 'notify liveState, ' + label + ': ' + st.feature + ', as the page');
}
ok((await notify.liveState(fakeDb({}, true))).feature === pageUses({}, 'notifications'), 'notify liveState, settings unreadable: as the page with nothing stored');
ok(await server.featureOn(fakeDb({ buildingCompliance: false }), 'buildingCompliance') === false
  && await server.featureOn(fakeDb(null), 'buildingCompliance') === true, 'featureOn: stored off is off; no document is the default');

console.log('\n4. Nobody reads the switches their own way');
/* The events window's files (HANDOVER-MAIN rule 10): asked to change over
   in FINDINGS-events F-239. Pages: EGBCChurch.uses / EGBCAuth.uses;
   functions: featureOn from ./features.js. */
const WAITING = {
  'bookings-admin.html': 'F-239', 'compliance.html': 'F-239', 'egbc-compliance-store.js': 'F-239',
  'functions/compliance.js': 'F-239', 'functions/public-mail.js': 'F-239'
};
const OWN = new Set(['egbc-auth.js', 'functions/features.js']);
/* church-settings.html WRITES the switches (merge) and reads them back
   through EGBCAuth.reloadFeatures, so a write is not a reading. */
const WRITERS = new Set(['church-settings.html']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'tests', 'design-mocks', '.git', 'tools'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|js|mjs)$/.test(e.name)) files.push(path.relative(V2, p).split(path.sep).join('/'));
  }
})(V2);
const readsItself = (src) => /doc\(\s*['"]features['"]\s*\)\s*\.get\(|data\(\s*db\s*,\s*['"]churchSettings['"]\s*,\s*['"]features['"]/.test(src);
const ownWay = files.filter((f) => !OWN.has(f) && !WRITERS.has(f) && readsItself(read(f)));
const bad = ownWay.filter((f) => !WAITING[f]);
ok(!bad.length, 'no page or function reads churchSettings/features itself (beyond the events window\'s, below)', bad.join(', '));
for (const f of ownWay.filter((f) => WAITING[f])) console.log('  WAIT    ' + f + ' reads the switches itself (events window, ' + WAITING[f] + ')');
const done = Object.keys(WAITING).filter((f) => !ownWay.includes(f));
ok(!done.length, 'every file on the WAITING list still needs it (take changed-over ones off)', done.join(', '));
for (const f of WRITERS) ok(!readsItself(read(f)), f + ' only writes the switches; it reads them through EGBCAuth');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
