/* The deployed rules are built from firestore.rules, and fit (FINDINGS-
 * churchhq H-7; the reviewing window, 22 Oct 2026).
 *
 *   node tests/check-rules-build.mjs          (from v2/; no emulator)
 *
 * Fails when:
 *   - firestore.build.rules is not what tools/rules-build.mjs makes from
 *     firestore.rules now (somebody edited the rules and did not build);
 *   - the built ruleset is over the working limit (230 KB, under Firebase's
 *     256 KB source and 250 KB compiled limits);
 *   - the built rules are not the same rules: the same tokens, in order;
 *   - storage.rules is over the same limit;
 *   - any of the four rulesets is within 2% of that limit (WARN), so room
 *     is made before a fix stops fitting (the reviewing window, 6 Nov 2026);
 *   - any emulator config, or firebase.json, points at anything but the
 *     built file - every rules test runs against what will deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, buildChurch, buildStorageChurch, tokens, SOURCE, BUILT, CHURCH_BUILT, STORAGE_SOURCE, STORAGE_CHURCH_BUILT, LIMIT, WARN } from '../tools/rules-build.mjs';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(V2, f), 'utf8');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };

const src = process.env.RULES_SOURCE ? fs.readFileSync(process.env.RULES_SOURCE, 'utf8') : read(SOURCE);
const want = build(src);
const have = fs.existsSync(path.join(V2, BUILT)) ? read(BUILT).replace(/\r\n/g, '\n') : '';
ok('firestore.build.rules is built from firestore.rules as it is now', have === want, 'run: node tools/rules-build.mjs');
const bytes = Buffer.byteLength(want);
ok('the built ruleset is under ' + Math.round(LIMIT / 1024) + ' KB (' + bytes + ' bytes; the source is ' + Buffer.byteLength(src) + ')', bytes <= LIMIT, bytes + ' bytes');
ok('and they are the same rules: the same tokens, in the same order', tokens(src) === tokens(want.replace(/^\/\/[^\n]*\n/, '')));
/* A comment marker inside quotes is part of a rule, not a comment. */
const sample = "match /x/{id} { allow read: if resource.data.url.matches('^https?://[a-z]+'); } // gone\n/* gone too */";
ok('  a // inside quotes is kept; real comments go', build(sample).includes("'^https?://[a-z]+'") && !/gone/.test(build(sample)));
/* The church ruleset (step 4 part 1): built by the same script, a file of
   its own (never in the same ruleset as EGBC's, H-7). */
const church = buildChurch(src);
const haveChurch = fs.existsSync(path.join(V2, CHURCH_BUILT)) ? read(CHURCH_BUILT).replace(/\r\n/g, '\n') : '';
ok('firestore.churches.rules is built from firestore.rules as it is now', haveChurch === church, 'run: node tools/rules-build.mjs');
ok('and is under ' + Math.round(LIMIT / 1024) + ' KB (' + Buffer.byteLength(church) + ' bytes)', Buffer.byteLength(church) <= LIMIT);
const st = Buffer.byteLength(read('storage.rules'));
ok('storage.rules is under ' + Math.round(LIMIT / 1024) + ' KB (' + st + ' bytes)', st <= LIMIT);
/* The church Storage ruleset (batch B): built the same way, every rule behind the gate. */
const stChurch = buildStorageChurch(read(STORAGE_SOURCE));
const haveSt = fs.existsSync(path.join(V2, STORAGE_CHURCH_BUILT)) ? read(STORAGE_CHURCH_BUILT).replace(/\r\n/g, '\n') : '';
ok('storage.churches.rules is built from storage.rules as it is now', haveSt === stChurch, 'run: node tools/rules-build.mjs');
/* The 2% line: every ruleset that deploys stays at least 2% under the limit. */
for (const [name, n] of [['firestore.build.rules', bytes], ['firestore.churches.rules', Buffer.byteLength(church)], ['storage.rules', st], ['storage.churches.rules', Buffer.byteLength(stChurch)]]) {
  ok(name + ' is more than 2% under the limit (' + n + ' bytes; the line is ' + WARN + ', ' + (WARN - n) + ' to spare)', n <= WARN,
    'make room first: shared functions or duplication removed, never a rule weakened');
}
const allows = (stChurch.match(/allow [^:]+: if /g) || []).length, gated = (stChurch.match(/allow [^:]+: if stGate\(\) && \(/g) || []).length;
ok('  every allow in it is behind the church gate (' + gated + ' of ' + allows + ')', allows > 0 && gated === allows - 1, gated + ' of ' + allows + ' (the one left is the catch-all)');

const configs = fs.readdirSync(V2).filter((f) => /^firebase(\..+)?\.json$/.test(f));
/* A church config (firebase.churches-*.json, for runs inside churches/{cid}) loads the built church rules, which are built too. */
const wrong = configs.filter((f) => { const c = JSON.parse(read(f)), r = c.firestore && c.firestore.rules; return r && r !== BUILT && !(/^firebase.churches/.test(f) && r === CHURCH_BUILT); })
  .map((f) => f + ' -> ' + JSON.parse(read(f)).firestore.rules);
ok('firebase.json and every emulator config load the built rules (' + configs.join(', ') + ')', wrong.length === 0, wrong.join('; '));

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
