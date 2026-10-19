/* A live audit presses nothing that writes to the church (the reviewing
 * window, 19 Oct 2026: the 15 Oct live run pressed the Rota Planner's
 * "+ Service" and left an empty service on the live rota).
 *
 *   node tests/check-audit-live-words.mjs      (from v2/, no emulator)
 *
 * audit-everything.mjs --live-words checks every button in LIVE_MUST_SKIP
 * against SKIP_LIVE; this runs it with the rest of the suite.
 */
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['tests/audit-everything.mjs', '--live-words'], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
const ok = r.status === 0;
console.log('\n' + (ok ? 1 : 0) + '/1 passed');
process.exit(ok ? 0 : 1);
