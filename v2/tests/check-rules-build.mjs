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
 *   - any emulator config, or firebase.json, points at anything but the
 *     built file - every rules test runs against what will deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, buildChurch, tokens, SOURCE, BUILT, CHURCH_BUILT, LIMIT } from '../tools/rules-build.mjs';

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

const configs = fs.readdirSync(V2).filter((f) => /^firebase(\..+)?\.json$/.test(f));
const wrong = configs.filter((f) => { const c = JSON.parse(read(f)); return c.firestore && c.firestore.rules && c.firestore.rules !== BUILT; })
  .map((f) => f + ' -> ' + JSON.parse(read(f)).firestore.rules);
ok('firebase.json and every emulator config load the built rules (' + configs.join(', ') + ')', wrong.length === 0, wrong.join('; '));

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
