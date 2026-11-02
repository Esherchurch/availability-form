/* TEST STAND-INS FOR EVERY SECRET (the going-live test, Stage 2, 2 Nov 2026)
 *
 *   node tools/secret-stand-ins.mjs           writes the missing ones (from v2/)
 *   node tools/secret-stand-ins.mjs --check   writes nothing; exits 1 if any is missing
 *
 * The functions emulator reads each defineSecret from functions/.secret.local.
 * A name missing there is fetched from the LIVE project's Secret Manager with
 * this computer's Google sign-in: the Resend, Daily, Unsplash, Anthropic and
 * Microsoft keys were read into test runs that way. So every name gets a
 * stand-in here, "NOT-SET", which the functions read as "not set up yet" (the
 * value a secret is created with so deploys run). A line already in the file
 * is kept, so a test that needs its own value (the ease test's) still has it.
 * The file is git-ignored: it never holds a real key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FUNCTIONS = path.join(V2, 'functions');
/* EGBC_SECRET_LOCAL: another file, for tests/check-secret-stand-ins.mjs only. */
export const SECRET_LOCAL = process.env.EGBC_SECRET_LOCAL || path.join(FUNCTIONS, '.secret.local');
export const STAND_IN = 'NOT-SET';

/** Every secret the functions declare, by name, and any declaration this
 * cannot read (a name not written out in quotes), so none is missed.
 * @returns {{ names: string[], unread: string[] }} */
export function secretNames(dir = FUNCTIONS) {
  const names = new Set(), unread = [];
  for (const f of fs.readdirSync(dir).filter((n) => /\.(m?js)$/.test(n))) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of t.matchAll(/defineSecret\(\s*([^)]*)\)/g)) {
      const q = /^['"]([A-Z][A-Z0-9_]*)['"]$/.exec(m[1].trim());
      if (q) names.add(q[1]); else if (!/^\s*$/.test(m[1]) && !/function|=>/.test(m[1])) unread.push(f + ': defineSecret(' + m[1] + ')');
    }
  }
  return { names: [...names].sort(), unread };
}

/** The names in .secret.local now. @returns {Set<string>} */
export function standIns(file = SECRET_LOCAL) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => (/^([A-Z][A-Z0-9_]*)=/.exec(l.trim()) || [])[1]).filter(Boolean));
}

/** The declared names with no stand-in. */
export function missingStandIns(file = SECRET_LOCAL, dir = FUNCTIONS) {
  const have = standIns(file);
  return secretNames(dir).names.filter((n) => !have.has(n));
}

/** Adds a NOT-SET line for each missing name; keeps every line there. -> the names added. */
export function ensureStandIns(file = SECRET_LOCAL, dir = FUNCTIONS) {
  const add = missingStandIns(file, dir);
  if (!add.length) return [];
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const head = before ? (before.endsWith('\n') ? '' : '\n') : '# Test stand-ins for the functions emulator (tools/secret-stand-ins.mjs). Never a real key.\n';
  fs.writeFileSync(file, before + head + add.map((n) => n + '=' + STAND_IN).join('\n') + '\n');
  return add;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { unread } = secretNames();
  if (unread.length) { console.error('Cannot read these secret names (write them out in quotes):\n  ' + unread.join('\n  ')); process.exit(1); }
  if (process.argv.includes('--check')) {
    const miss = missingStandIns();
    if (miss.length) { console.error('No stand-in in functions/.secret.local for: ' + miss.join(', ') + '\nRun: node tools/secret-stand-ins.mjs'); process.exit(1); }
    console.log('Every secret has a stand-in (' + secretNames().names.length + ').');
  } else {
    const added = ensureStandIns();
    console.log(added.length ? 'Added stand-ins for: ' + added.join(', ') : 'Every secret already has a stand-in.');
  }
}
