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
  /* The events window's five changed over (20 Oct): none waiting. */
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

console.log('\n4b. Switched off, the server sends nothing for it');
/* notify.js's own senders, each with its part stored OFF: nothing is sent
   and no once-only marker is written (a database that refuses every
   write would throw if one were tried). */
const offDb = (name) => {
  const writes = [];
  const db = { collection: (c) => ({
    doc: (d) => ({ get: async () => { const data = c === 'churchSettings' && d === 'features' ? { [name]: false } : null; return { exists: !!data, data: () => data, get: (k) => data && data[k] }; },
      create: async () => { writes.push(c + '/' + d); }, set: async () => { writes.push(c + '/' + d); }, update: async () => { writes.push(c + '/' + d); } }),
    where: () => ({ get: async () => { writes.push('query ' + c); return { docs: [], empty: true, size: 0, forEach() {} }; } }),
    add: async () => { writes.push('add ' + c); return { id: 'x' }; },
    get: async () => { writes.push('list ' + c); return { docs: [], empty: true, size: 0, forEach() {} }; } }) };
  return { db, writes };
};
const sent = [];
const deps = (db) => ({ db, dryRun: false, messaging: { sendEachForMulticast: async () => { sent.push(1); return { responses: [] }; } }, mail: async () => { sent.push(1); } });
{
  let x = offDb('notices'); const r1 = await notify.onNotice(deps(x.db), 'n1', null, { urgent: true, title: 'T', teams: [] });
  ok(r1 === null && !x.writes.length, 'notices off: an urgent notice sends nothing, writes nothing', JSON.stringify(x.writes));
  x = offDb('maintenance'); const r2 = await notify.onMaintJob(deps(x.db), 'j1', { what: 'Tap', where: 'Hall' });
  ok(r2 === null && !x.writes.length, 'maintenance off: a new job sends nothing, writes nothing', JSON.stringify(x.writes));
  x = offDb('roomBookings'); const r3 = await notify.onBookingChange(deps(x.db), 'b1', { status: 'requested' }, { status: 'confirmed', memberUid: 'u1' }, 'e1');
  ok(r3 === null && !x.writes.length, 'room bookings off: a booking confirmed sends nothing, writes nothing', JSON.stringify(x.writes));
  x = offDb('safeguarding'); const r4 = await notify.runChecksReminders(deps(x.db), new Date('2026-10-20T08:00:00Z'));
  ok(r4 && r4.skipped && !x.writes.length, 'safeguarding off: the DBS and training reminders send nothing', JSON.stringify(x.writes));
  ok(!sent.length, 'and nothing at all went out', sent.length + ' sent');
}

console.log('\n5. Every switch does something');
/* A switch nothing reads is a switch that hides nothing (the reviewing
   window, 20 Oct 2026: "switching one off hides it everywhere"). Each name
   must be used somewhere beyond the two lists and the rules' list of
   names: a Menu entry, the app, Home, a page's guard, or a function. */
const LISTS = new Set(['egbc-auth.js', 'functions/features.js']);
const corpus = files.filter((f) => !LISTS.has(f)).map((f) => read(f)).join('\n')
  + '\n' + read('egbc-auth.js').replace(listSrc, '');
const idle = PAGE.map((f) => f.name).filter((n) => !new RegExp("['\"]" + n + "['\"]").test(corpus));
ok(!idle.length, 'every one of the ' + PAGE.length + ' switches is read somewhere (Menu, app, Home, a guard or a function)', 'used nowhere: ' + idle.join(', '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
