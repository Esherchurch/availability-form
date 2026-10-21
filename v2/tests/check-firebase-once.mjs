/* Every page loads the Firebase scripts once (21 Oct 2026).
 *
 *   node tests/check-firebase-once.mjs      (from v2/; no emulator)
 *
 * WHY. stickynotes.html loaded firebase-app-compat and firestore-compat a
 * second time, after egbc-auth.js. The second copy replaced the `firebase`
 * global, so egbc-auth's serverTimestamp() came from a different copy than
 * its database and saving the sign-in stopped the page ("Unsupported field
 * value: a custom Lc object"). Five more pages did the same; Handover's
 * second copy was even an older version. A <script> tag, not a mention:
 * comments about it are fine.
 */
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve('.');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 600) : ''))); };
const tag = (lib) => new RegExp('<script[^>]+src=["\'][^"\']*firebasejs/[0-9.]+/firebase-' + lib + '-compat\\.js', 'g');

const twice = [], late = [];
for (const f of fs.readdirSync(V2).filter(f => /\.html$/i.test(f)).sort()) {
  const s = fs.readFileSync(path.join(V2, f), 'utf8');
  for (const lib of ['app', 'firestore', 'auth', 'storage']) {
    const n = (s.match(tag(lib)) || []).length;
    if (n > 1) twice.push(f + ' (' + lib + ' x' + n + ')');
  }
  const auth = s.search(/<script[^>]+src=["'][^"']*egbc-auth\.js/);
  if (auth >= 0) {
    const after = s.slice(auth);
    if (tag('app').test(after) || tag('firestore').test(after)) late.push(f);
  }
}
ok('no page loads a Firebase script twice', twice.length === 0, twice.join(', '));
ok('no page loads Firebase app or Firestore after egbc-auth.js', late.length === 0, late.join(', '));
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
