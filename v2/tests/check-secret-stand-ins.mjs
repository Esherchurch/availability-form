/* EVERY SECRET HAS A TEST STAND-IN (2 Nov 2026).
 *
 *   node tests/check-secret-stand-ins.mjs      (from v2/; no emulator)
 *
 * The functions emulator fetches any secret missing from
 * functions/.secret.local from the LIVE project (tools/secret-stand-ins.mjs).
 * Fails when:
 *   - a defineSecret's name cannot be read (not written out in quotes);
 *   - a declared secret has no stand-in in functions/.secret.local (a new
 *     secret added without running the tool);
 *   - a stand-in there is anything but NOT-SET, or a test's own value
 *     (nothing that could be a real key);
 * and proves, on copies, that a new secret is caught and added, a line
 * already there is kept, and the stage 2 harness refuses to run without.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { secretNames, missingStandIns, ensureStandIns, standIns, SECRET_LOCAL, FUNCTIONS } from '../tools/secret-stand-ins.mjs';

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + x)); };

const { names, unread } = secretNames();
ok('every defineSecret names its secret in quotes (' + names.length + ' secrets)', names.length > 0 && !unread.length, unread.join('; '));
const miss = missingStandIns();
ok('each has a stand-in in functions/.secret.local', !miss.length, 'missing: ' + miss.join(', ') + ' - run: node tools/secret-stand-ins.mjs');
/* A stand-in is NOT-SET, or plainly a test value: never something shaped like a key. */
const lines = fs.existsSync(SECRET_LOCAL) ? fs.readFileSync(SECRET_LOCAL, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l)) : [];
const realish = lines.filter((l) => { const v = l.slice(l.indexOf('=') + 1).trim(); return v !== 'NOT-SET' && !/test|stand-?in|emulator|fake/i.test(v); }).map((l) => l.split('=')[0]);
ok('every stand-in is NOT-SET or a test value', !realish.length, 'look at: ' + realish.join(', '));

/* On copies: a new secret is caught, then added; a line already there is kept. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-ins-'));
const fdir = path.join(tmp, 'functions'); fs.mkdirSync(fdir);
for (const f of fs.readdirSync(FUNCTIONS).filter((n) => /\.m?js$/.test(n))) fs.copyFileSync(path.join(FUNCTIONS, f), path.join(fdir, f));
fs.writeFileSync(path.join(fdir, 'new-thing.js'), "import { defineSecret } from 'firebase-functions/params';\nexport const NEW_THING_KEY = defineSecret('NEW_THING_KEY');\n");
const file = path.join(tmp, '.secret.local');
fs.writeFileSync(file, names.map((n) => n + (n === names[0] ? '=kept-test-value' : '=NOT-SET')).join('\n') + '\n');
ok('a new secret with no stand-in is caught (NEW_THING_KEY)', JSON.stringify(missingStandIns(file, fdir)) === '["NEW_THING_KEY"]', JSON.stringify(missingStandIns(file, fdir)));
const added = ensureStandIns(file, fdir);
ok('and the tool adds it as NOT-SET, keeping the line already there', JSON.stringify(added) === '["NEW_THING_KEY"]' && standIns(file).has('NEW_THING_KEY')
  && fs.readFileSync(file, 'utf8').includes(names[0] + '=kept-test-value') && fs.readFileSync(file, 'utf8').includes('NEW_THING_KEY=NOT-SET'));
fs.writeFileSync(path.join(fdir, 'odd.js'), 'const N = "X"; export const K = defineSecret(N);\n');
ok('a name it cannot read is reported, not skipped', secretNames(fdir).unread.some((u) => /odd\.js/.test(u)));

/* The stage 2 harness refuses to run when one is missing. */
const r = spawnSync(process.execPath, ['-e', "import('./tests/stage2/harness.mjs')"], { cwd: path.dirname(FUNCTIONS), env: Object.assign({}, process.env, { EGBC_SECRET_LOCAL: path.join(tmp, 'none.local') }), encoding: 'utf8' });
ok('the stage 2 harness refuses to run without them (exit ' + r.status + ')', r.status === 2 && /REFUSED/.test(r.stderr), (r.stderr || '').slice(0, 200));
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
