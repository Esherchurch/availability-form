/* A CHECK ON THE THING THAT DOES THE CHECKING.
   =========================================================

   browser-eval.mjs is now what every one of the 31 browser checks
   trusts to notice a page-side throw. If it ever stops noticing, all 31
   go quietly green again and nothing says so - which is exactly the
   fault it was written to close.

   So it is gated here, and this runs in a second without Chrome: the
   CDP send() is faked, and the exit code is read from a real child
   process, because the exit code is the part that matters and the only
   honest way to read it is to be a different process.

       node tests/check-harness.mjs                                   */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeEval, pageThrows, expectThrow, notePageThrow } from './browser-eval.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''));
};

/* A run of the harness in its own process, so an exit code can be read
   rather than reasoned about. */
const IMPORT = "import { notePageThrow, expectThrow, makeEval } from './browser-eval.mjs';";
function child(body, alsoImport) {
  const src = (alsoImport ? alsoImport + '\n' : '') + body;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', src],
    { cwd: HERE, encoding: 'utf8' });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

/* A send() that answers like Chrome does: either a value, or the
   exceptionDetails that a thrown expression comes back as. */
const sendValue = (v) => async () => ({ result: { value: v } });
const sendThrow = (msg) => async () => ({
  exceptionDetails: { exception: { description: msg + '\n    at <anonymous>' } },
});

console.log('\nthe shared ev() hands back what the page returned');
{
  const ev = makeEval(sendValue('a value'), 'self-test');
  ok('an ordinary expression comes back as its value',
    (await ev('1 + 1')) === 'a value');
}

/* THESE RUN IN A CHILD, and they have to. Recording a throw is the
   thing being tested, and a process that records one is turned red by
   the harness - correctly. Were these done here, this file would fail
   by doing its job, so the recording is done over there and only the
   findings are read back. */
console.log('\na throw inside the page is written down, not swallowed');
{
  const probe = child(IMPORT + "\n"
    + "const sendThrow = async () => ({ exceptionDetails: { exception: {\n"
    + "  description: 'SyntaxError: Unexpected identifier\\n    at <anonymous>' } } });\n"
    + "const ev = makeEval(sendThrow, 'self-test');\n"
    + "const out = await ev('this is not valid javascript(');\n"
    + "console.log('PROBE ' + JSON.stringify({ out, throws: pageThrows() }));\n"
    + "process.exit(0);", "import { pageThrows } from './browser-eval.mjs';");
  const line = (probe.out.split('\n').find(l => l.startsWith('PROBE ')) || '').slice(6);
  const got = line ? JSON.parse(line) : {};
  /* The string is still returned, because a few checks read it and
     report their own message. What must not happen is it being the ONLY
     trace of the throw. */
  ok('the call still returns the THREW string, as the call sites expect',
    /^THREW SyntaxError/.test(String(got.out)), got.out);
  ok('and the throw is recorded where an assertion cannot miss it',
    (got.throws || []).length === 1, (got.throws || []).length + ' recorded');
  ok('the record says which check it came from',
    String(((got.throws || [])[0] || {}).where).indexOf('self-test') === 0,
    ((got.throws || [])[0] || {}).where);
}

console.log('\na check that is PROVING a throw can say so');
{
  const before = pageThrows().length;
  const ev = makeEval(sendThrow('TypeError: on purpose'), 'self-test');
  const out = await expectThrow(() => ev('boom()'));
  ok('expectThrow still returns the string',
    /^THREW TypeError/.test(String(out)), out);
  ok('but nothing is recorded against the run',
    pageThrows().length === before, (pageThrows().length - before) + ' recorded');
}

/* ---- the exit code, read from a real process ---------------------- */

console.log('\nand the run goes red, whatever the tally said');
{
  const a = child(IMPORT + "\nconsole.log('12/12 passed');\nprocess.exit(0);");
  ok('a run with no page throws exits 0', a.code === 0, 'exit ' + a.code);

  /* THE ONE THAT MATTERS. This is the shape of the real fault: the
     tally says everything passed, process.exit(0) is called, and the
     throw was never asserted on by anybody. */
  const b = child(IMPORT + "\nnotePageThrow('somewhere', 'SyntaxError: boom');"
    + "\nconsole.log('12/12 passed');\nprocess.exit(0);");
  ok('a run that printed "12/12 passed" and exited 0 is forced red',
    b.code === 1, 'exit ' + b.code);
  ok('and it says why, naming the throw',
    /threw inside the page/.test(b.out) && /SyntaxError: boom/.test(b.out),
    b.out.replace(/\s+/g, ' ').slice(0, 200));

  /* A failing run must not be turned green, either. */
  const c = child(IMPORT + "\nnotePageThrow('somewhere', 'SyntaxError: boom');"
    + "\nprocess.exit(1);");
  ok('a run that was already failing stays failing', c.code === 1, 'exit ' + c.code);

  const d = child(IMPORT + "\nawait expectThrow(async () => "
    + "notePageThrow('somewhere', 'TypeError: expected'));\nprocess.exit(0);");
  ok('an expected throw leaves the run green', d.code === 0, 'exit ' + d.code);
}

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
